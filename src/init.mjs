import { access, cp, mkdir, realpath, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import YAML from 'yaml';
import { ADAPTERS, GITIGNORE_BODY, LEGACY_MANAGED_BODIES, MANAGED_END, MANAGED_START, selectedAdapters } from './adapters.mjs';
import {
  BOOTSTRAP_TRANSITION_REQUEST,
  validateBootstrapAuthority,
} from './bootstrap-authority.mjs';
import { CliError } from './errors.mjs';
import {
  EMPTY_EXPERIENCE_INDEX,
  parseExperienceIndex,
  serializeExperienceIndex,
  validateExperienceIndex,
} from './experience-index.mjs';
import {
  applyManagedBlock,
  backupOnce,
  inspectManagedBlock,
  managedBlockBody,
  readTextIfPresent,
  rejectSymlinkPath,
  resolveInside,
  writeAtomic,
} from './files.mjs';
import {
  createInitialCheckpoint,
  createInitialExperienceFeedback,
  createInitialTruthReconciliation,
  DEFAULT_INTENT,
  enableHarnesses,
  EXPERIENCE_INDEX_OWNERSHIP,
  EXPERIENCE_INDEX_PATH,
  isVibeTetherOwnedExperienceIndex,
  isVibeTetherOwnedTruthIndex,
  parseManifest,
  serializeManifest,
  TRUTH_INDEX_OWNERSHIP,
} from './manifest.mjs';
import { validateProviderLock } from './managed-project-state.mjs';
import {
  currentLocalCliBaseline,
  LOCAL_CLI_PATH,
  sha256Text,
} from './local-cli.mjs';
import { scanProject } from './project-scan.mjs';
import {
  createTruthMap,
  isSupportedTruthIndexPath,
  LEGACY_TRUTH_MAP_SIDECAR_PATH,
  legacyManifestEntries,
  parseTruthMap,
  resemblesCanonicalTruthMap,
  TRUTH_INDEX_PATH,
} from './truth-map.mjs';
import { stageProviderSources } from './provider-fetch.mjs';
import { mergeProviderStages, resolveLocalProviderStage } from './provider-cache.mjs';
import {
  createCapabilityBoard,
  createProviderLock,
  priorCatalogOwnership,
  priorInstallationOwnership,
  resolveProfileSources,
} from './provider-plan.mjs';
import {
  buildRoutingDocument,
  loadProviderRegistry,
  resolveExposurePlan,
  resolveProfileProviders,
  resolveRoute,
} from './provider-registry.mjs';
import {
  inspectDirectoryInstall,
  inspectVibeTetherInstall,
  installDirectory,
  installSkill,
  skillFingerprint,
  sourceSkill,
} from './skill-install.mjs';
import {
  parseProjectRoutes,
  PROJECT_ROUTES_PATH,
  validateProjectRoutes,
} from './project-routes.mjs';
import {
  recoverSkillUpgrades,
  replaceCanonicalSkill,
} from './skill-upgrade-recovery.mjs';

function instructionBody(adapter) {
  return ADAPTERS[adapter].managedBody;
}

function managedPreview(relativePath, content) {
  if (!['AGENTS.md', 'CLAUDE.md', '.gitignore'].includes(relativePath)) return content;
  const start = content.indexOf(MANAGED_START);
  const end = content.indexOf(MANAGED_END, start);
  if (start === -1 || end === -1) return '';
  return content.slice(start, end + MANAGED_END.length);
}

function diffLines(prefix, content) {
  if (!content) return '';
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function formatDryRun(root, textPlans, skillPlans, action = 'initialize') {
  const sections = [];
  for (const plan of textPlans) {
    if (plan.original === plan.content) continue;
    if (plan.relativePath === '.vibetether/capabilities.yaml') {
      const board = JSON.parse(plan.content);
      sections.push(
        `--- ${plan.original === null ? '/dev/null' : plan.relativePath}\n+++ ${plan.relativePath}\n+<generated capability board: ${board.capabilities?.length ?? 0} capabilities, ${board.providers?.filter((provider) => provider.active).length ?? 0} active providers, ${board.routes?.length ?? 0} routes, ${board.scenarios?.length ?? 0} scenarios>`,
      );
      continue;
    }
    if (plan.relativePath === '.vibetether/providers.lock.yaml') {
      const lock = YAML.parse(plan.content);
      const sourceLines = (lock.sources ?? []).map(
        (source) => `+  source ${source.id}@${source.commit} | ${source.license} | ${source.license_evidence?.mode ?? 'full-text'}`,
      );
      sections.push(
        [
          `--- ${plan.original === null ? '/dev/null' : plan.relativePath}`,
          `+++ ${plan.relativePath}`,
          `+<generated provider lock: ${lock.catalog?.filter((skill) => skill.active).length ?? 0} catalog entries, ${(lock.exposures ?? lock.skills ?? []).filter((skill) => skill.active).length} active exposures, ${(lock.sources ?? []).length} pinned sources>`,
          ...sourceLines,
        ].join('\n'),
      );
      continue;
    }
    const before = plan.original === null ? null : managedPreview(plan.relativePath, plan.original);
    const after = managedPreview(plan.relativePath, plan.content);
    const removed = before === null || before === after ? '' : diffLines('-', before);
    const added = diffLines('+', after);
    sections.push(
      [`--- ${plan.original === null ? '/dev/null' : plan.relativePath}`, `+++ ${plan.relativePath}`, removed, added]
        .filter(Boolean)
        .join('\n'),
    );
  }
  for (const plan of skillPlans) {
    if (plan.kind === 'collision') {
      sections.push(
        `--- ${plan.relativePath}\n+++ ${plan.relativePath}\n=<preserve existing Skill; reviewed provider ${plan.providerId} blocked by name collision>`,
      );
      continue;
    }
    if (!plan.needsInstall) continue;
    if (plan.kind === 'catalog') {
      sections.push(
        `--- /dev/null\n+++ ${plan.relativePath}\n+<cataloged provider Skill ${plan.providerId} from ${plan.sourceId}@${plan.commit}>`,
      );
    } else if (plan.kind === 'provider') {
      sections.push(
        `--- /dev/null\n+++ ${plan.relativePath}\n+<complete provider Skill ${plan.providerId} from ${plan.sourceId}@${plan.commit}>`,
      );
    } else {
      sections.push(`--- /dev/null\n+++ ${plan.relativePath}\n+<canonical VibeTether Skill directory>`);
    }
  }
  const details = sections.length > 0 ? `\n${sections.join('\n\n')}\n` : '\nNo changes required.\n';
  return `DRY RUN - VibeTether would ${action} ${root}:${details}`;
}

async function findUnprocessedManagedCollisions(root, existingLock, processedKeys) {
  const collisions = [];
  for (const skill of existingLock?.exposures ?? existingLock?.skills ?? []) {
    for (const [harness, installation] of Object.entries(skill.installations ?? {})) {
      if (installation.ownership !== 'vibetether') continue;
      const key = `${skill.id}:${harness}`;
      if (processedKeys.has(key)) continue;
      try {
        await rejectSymlinkPath(root, installation.path);
        const installedFingerprint = await skillFingerprint(resolveInside(root, installation.path));
        if (installedFingerprint !== skill.fingerprint) {
          collisions.push({
            provider_id: skill.id,
            harness,
            path: installation.path,
            reason: 'modified-managed-skill',
          });
        }
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw new CliError(`Cannot verify installed Skill at ${installation.path}: ${error.message}`, 3);
      }
    }
  }
  return collisions;
}

export async function applyInitialization(root, textPlans, skillPlans, installSkillOperation = installSkill) {
  const appliedTexts = [];
  const createdBackups = [];
  const installedSkills = [];
  const transactionCleanupWarnings = [];
  let installedAny = false;
  try {
    await mkdir(resolveInside(root, '.vibetether'), { recursive: true });
    for (const plan of textPlans) {
      if (plan.original === plan.content) continue;
      const backup = await backupOnce(plan.target, plan.original);
      if (backup) createdBackups.push(backup);
      await writeAtomic(plan.target, plan.content);
      appliedTexts.push(plan);
    }
    await rejectSymlinkPath(root, '.vibetether/transaction');
    const transactionRoot = resolveInside(root, '.vibetether/transaction');
    for (const plan of skillPlans) {
      if (!plan.needsInstall) continue;
      if (plan.kind === 'vibetether' && plan.replacesExisting) {
        const result = await replaceCanonicalSkill({
          root,
          harness: plan.harness,
          relativePath: plan.relativePath,
          target: plan.target,
          source: plan.source ?? sourceSkill,
        }, plan.upgradeOperations);
        installedAny = true;
        transactionCleanupWarnings.push(...result.cleanupWarnings);
        continue;
      }
      let transactionBackup = null;
      try {
        if (plan.replacesExisting) {
          await mkdir(transactionRoot, { recursive: true });
          transactionBackup = path.join(transactionRoot, `${randomUUID()}.previous`);
          await cp(plan.target, transactionBackup, { recursive: true, errorOnExist: true, force: false });
        }
        await (plan.install ?? installSkillOperation)(plan.target);
        installedAny = true;
        installedSkills.push({ ...plan, transactionBackup });
      } catch (error) {
        if (transactionBackup) {
          try {
            await access(transactionBackup);
          } catch (backupError) {
            throw new CliError(
              `Skill upgrade failed at ${plan.relativePath ?? plan.target}: ${error.message}. Transaction copy is unavailable at ${transactionBackup}: ${backupError.message}. The target was left untouched during recovery.`,
              3,
            );
          }
          await rm(plan.target, { recursive: true, force: true }).catch(() => {});
          try {
            await rename(transactionBackup, plan.target);
          } catch (restoreError) {
            throw new CliError(
              `Skill upgrade failed at ${plan.relativePath ?? plan.target}: ${error.message}. Restoring the transaction copy from ${transactionBackup} also failed: ${restoreError.message}`,
              3,
            );
          }
        }
        throw error;
      }
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const plan of installedSkills.reverse()) {
      await rm(plan.target, { recursive: true, force: true }).catch((failure) => rollbackErrors.push(failure.message));
      if (plan.transactionBackup) {
        await rename(plan.transactionBackup, plan.target).catch((failure) => rollbackErrors.push(failure.message));
      }
    }
    for (const plan of appliedTexts.reverse()) {
      if (plan.original === null) {
        await rm(plan.target, { force: true }).catch((failure) => rollbackErrors.push(failure.message));
      } else {
        await writeAtomic(plan.target, plan.original).catch((failure) => rollbackErrors.push(failure.message));
      }
    }
    if (rollbackErrors.length === 0) {
      for (const backup of createdBackups) await rm(backup, { force: true }).catch(() => {});
      throw error;
    }
    throw new CliError(
      `Initialization failed and rollback was incomplete (${rollbackErrors.join('; ')}). First-change backups were preserved.`,
      3,
    );
  }
  const cleanupFailures = [...transactionCleanupWarnings];
  for (const plan of installedSkills) {
    if (!plan.transactionBackup) continue;
    await rm(plan.transactionBackup, { recursive: true, force: true }).catch((error) => cleanupFailures.push(error.message));
  }
  return {
    status: installedAny ? 'installed' : 'unchanged',
    transactionPath: null,
    cleanupWarnings: cleanupFailures,
  };
}

export async function initialize(options, dependencies = {}) {
  let root;
  try {
    root = await realpath(path.resolve(options.project));
  } catch {
    throw new CliError(`Project directory does not exist: ${options.project}`);
  }

  const adapters = selectedAdapters(options.agent);
  const recoveryReports = options.dryRun || !options.yes
    ? []
    : await recoverSkillUpgrades({
        root,
        adapters,
        operations: dependencies.skillUpgradeOperations,
      });
  const recoveryPrefix = recoveryReports.length > 0
    ? `VibeTether recovered ${recoveryReports.length} interrupted Skill upgrade state(s) before initialization.\n`
    : '';
  const loadRegistry = dependencies.loadRegistry ?? loadProviderRegistry;
  const stageProviders = dependencies.stageProviders ?? stageProviderSources;
  let registry;
  try {
    registry = await loadRegistry();
  } catch (error) {
    throw new CliError(`Cannot load the provider registry: ${error.message}`, 3);
  }
  let providers = resolveProfileProviders(registry, options.profile);
  let providerSources = resolveProfileSources(registry, options.profile);
  const initialRoute = resolveRoute(
    buildRoutingDocument(registry, options.profile),
    BOOTSTRAP_TRANSITION_REQUEST,
  );
  const initialRecommendation = initialRoute?.provider ?? 'vibetether-built-in-alignment';
  const textPlans = [];
  for (const adapter of adapters) {
    const relativePath = ADAPTERS[adapter].instructionFile;
    await rejectSymlinkPath(root, relativePath);
    const target = resolveInside(root, relativePath);
    const original = await readTextIfPresent(target);
    const content = original ?? '';
    inspectManagedBlock(content, relativePath);
    const existingBody = managedBlockBody(content);
    if (
      existingBody !== null &&
      existingBody !== instructionBody(adapter).trim() &&
      !LEGACY_MANAGED_BODIES.has(existingBody)
    ) {
      throw new CliError(`Managed block conflict in ${relativePath}. Refusing to overwrite changed control rules.`, 3);
    }
    textPlans.push({ relativePath, target, original, content: applyManagedBlock(content, instructionBody(adapter)) });
  }

  await rejectSymlinkPath(root, '.gitignore');
  const ignoreTarget = resolveInside(root, '.gitignore');
  const ignoreOriginal = await readTextIfPresent(ignoreTarget);
  inspectManagedBlock(ignoreOriginal ?? '', '.gitignore');
  const existingIgnoreBody = managedBlockBody(ignoreOriginal ?? '');
  if (
    existingIgnoreBody !== null &&
    existingIgnoreBody !== GITIGNORE_BODY &&
    existingIgnoreBody !== '.vibetether/state/'
  ) {
    throw new CliError('Managed block conflict in .gitignore. Refusing to overwrite changed control rules.', 3);
  }
  textPlans.push({
    relativePath: '.gitignore',
    target: ignoreTarget,
    original: ignoreOriginal,
    content: applyManagedBlock(ignoreOriginal ?? '', GITIGNORE_BODY),
  });

  for (const relativePath of [
    '.vibetether/project.yaml',
    '.vibetether/intent.md',
    '.vibetether/state/current.yaml',
    LOCAL_CLI_PATH,
    EXPERIENCE_INDEX_PATH,
    TRUTH_INDEX_PATH,
    LEGACY_TRUTH_MAP_SIDECAR_PATH,
    PROJECT_ROUTES_PATH,
  ]) {
    await rejectSymlinkPath(root, relativePath);
  }
  for (const adapter of adapters) {
    await rejectSymlinkPath(root, ADAPTERS[adapter].skillDirectory);
  }

  const manifestTarget = resolveInside(root, '.vibetether/project.yaml');
  const manifestOriginal = await readTextIfPresent(manifestTarget);
  if (options.bootstrapOnly && manifestOriginal === null) {
    throw new CliError('VibeTether bootstrap requires an initialized project. Run `vibetether init` first.');
  }
  const scanned = await scanProject(root, adapters, options.profile, { discoverTruth: false });
  let manifest;
  let persistedManifest = null;
  if (manifestOriginal === null) {
    manifest = scanned;
  } else {
    try {
      persistedManifest = parseManifest(manifestOriginal);
    } catch {
      throw new CliError(
        'Manifest conflict in .vibetether/project.yaml: invalid manifest YAML. Restore a canonical manifest and retry.',
        3,
      );
    }
    try {
      manifest = {
        ...enableHarnesses(persistedManifest, adapters),
        profile: options.profile,
        project_state: scanned.project_state,
      };
    } catch {
      throw new CliError(
        'Manifest conflict in .vibetether/project.yaml: manifest routing fields are invalid. Restore the canonical manifest structure and retry.',
        3,
      );
    }
  }
  if (manifest.experience_index !== undefined && manifest.experience_index !== EXPERIENCE_INDEX_PATH) {
    throw new CliError(
      `Manifest conflict in .vibetether/project.yaml: experience_index must route to ${EXPERIENCE_INDEX_PATH}.`,
      3,
    );
  }
  if (manifest.truth_index !== undefined && !isSupportedTruthIndexPath(manifest.truth_index)) {
    throw new CliError(
      `Manifest conflict in .vibetether/project.yaml: truth_index must route to ${TRUTH_INDEX_PATH} or ${LEGACY_TRUTH_MAP_SIDECAR_PATH}.`,
      3,
    );
  }
  const legacyTruthEntries = persistedManifest ? legacyManifestEntries(persistedManifest) : [];
  let truthIndexPath = manifest.truth_index ?? TRUTH_INDEX_PATH;
  const defaultTruthTarget = resolveInside(root, TRUTH_INDEX_PATH);
  const defaultTruthOriginal = await readTextIfPresent(defaultTruthTarget);
  if (manifest.truth_index === undefined && defaultTruthOriginal !== null) {
    try {
      parseTruthMap(defaultTruthOriginal);
    } catch (error) {
      const isDeclaredLegacyTruth = legacyTruthEntries.some((entry) => entry.path === TRUTH_INDEX_PATH);
      if (!isDeclaredLegacyTruth || resemblesCanonicalTruthMap(defaultTruthOriginal)) {
        throw new CliError(`Truth map conflict in ${TRUTH_INDEX_PATH}: ${error.message}`, 3);
      }
      const occupiedSidecar = await readTextIfPresent(resolveInside(root, LEGACY_TRUTH_MAP_SIDECAR_PATH));
      if (occupiedSidecar !== null) {
        throw new CliError(
          `Truth map conflict in ${LEGACY_TRUTH_MAP_SIDECAR_PATH}: legacy migration sidecar already exists; back it up or move it before retrying.`,
          3,
        );
      }
      truthIndexPath = LEGACY_TRUTH_MAP_SIDECAR_PATH;
    }
  }
  const projectRoutesTarget = resolveInside(root, PROJECT_ROUTES_PATH);
  const projectRoutesOriginal = await readTextIfPresent(projectRoutesTarget);
  if (persistedManifest?.project_routes !== undefined
      && persistedManifest.project_routes !== PROJECT_ROUTES_PATH) {
    throw new CliError(
      `Manifest conflict in .vibetether/project.yaml: project_routes must use ${PROJECT_ROUTES_PATH}.`,
      3,
    );
  }
  if (persistedManifest?.project_routes === PROJECT_ROUTES_PATH && projectRoutesOriginal === null) {
    throw new CliError(
      `Manifest conflict in .vibetether/project.yaml: declared project routes are missing at ${PROJECT_ROUTES_PATH}.`,
      3,
    );
  }
  let projectRoutesDocument = null;
  if (projectRoutesOriginal !== null) {
    try {
      projectRoutesDocument = parseProjectRoutes(projectRoutesOriginal);
      manifest.project_routes = PROJECT_ROUTES_PATH;
    } catch (error) {
      throw new CliError(`Project routes conflict in ${PROJECT_ROUTES_PATH}: ${error.message}`, 3);
    }
  } else {
    delete manifest.project_routes;
  }
  const selectedBundles = new Set(options.bundles ?? []);
  if (!options.bootstrapOnly && options.autoBundles !== false && options.profile !== 'core') {
    for (const signal of scanned.bundle_signals ?? []) {
      if (signal.confidence === 'high') selectedBundles.add(signal.bundle);
    }
  }
  manifest = {
    ...manifest,
    bundles: [...selectedBundles].sort(),
    bundle_signals: scanned.bundle_signals ?? [],
    capability_board: '.vibetether/capabilities.yaml',
    provider_lock: '.vibetether/providers.lock.yaml',
    experience_index: EXPERIENCE_INDEX_PATH,
    truth_index: truthIndexPath,
  };

  const localCli = currentLocalCliBaseline();
  const launcherTarget = resolveInside(root, LOCAL_CLI_PATH);
  const launcherOriginal = await readTextIfPresent(launcherTarget);
  const priorCli = persistedManifest?.cli;
  if (priorCli !== undefined) {
    const structurallyValid = priorCli
      && typeof priorCli === 'object'
      && !Array.isArray(priorCli)
      && priorCli.launcher === LOCAL_CLI_PATH
      && typeof priorCli.launcher_sha256 === 'string'
      && /^[a-f0-9]{64}$/.test(priorCli.launcher_sha256)
      && typeof priorCli.package === 'string'
      && priorCli.package
      && typeof priorCli.expected_version === 'string'
      && priorCli.expected_version;
    if (!structurallyValid) {
      throw new CliError('Manifest conflict in .vibetether/project.yaml: cli baseline is invalid.', 3);
    }
    if (launcherOriginal !== null && sha256Text(launcherOriginal) !== priorCli.launcher_sha256) {
      throw new CliError(
        `Local CLI conflict at ${LOCAL_CLI_PATH}. Refusing to overwrite a modified managed launcher.`,
        3,
      );
    }
  } else if (launcherOriginal !== null
      && sha256Text(launcherOriginal) !== localCli.manifest.launcher_sha256) {
    throw new CliError(
      `Local CLI conflict at ${LOCAL_CLI_PATH}. Back up or remove the pre-existing file first.`,
      3,
    );
  }
  manifest.cli = { ...localCli.manifest };

  const truthTarget = resolveInside(root, truthIndexPath);
  const truthOriginal = await readTextIfPresent(truthTarget);
  let truthContent = truthOriginal;
  if (truthOriginal !== null) {
    try {
      parseTruthMap(truthOriginal);
    } catch (error) {
      throw new CliError(`Truth map conflict in ${truthIndexPath}: ${error.message}`, 3);
    }
  } else if (persistedManifest && persistedManifest.truth_index === undefined) {
    truthContent = createTruthMap({
      harnesses: adapters,
      confirmed: legacyTruthEntries,
    });
    delete manifest.truth_index_ownership;
  } else {
    truthContent = createTruthMap({ harnesses: adapters });
    manifest.truth_index_ownership = { ...TRUTH_INDEX_OWNERSHIP };
  }
  if (truthOriginal !== null) {
    const previousHarnesses = Object.entries(persistedManifest?.harnesses ?? manifest.harnesses ?? {})
      .filter(([, value]) => value?.enabled)
      .map(([name]) => name);
    const currentHarnesses = Object.entries(manifest.harnesses ?? {})
      .filter(([, value]) => value?.enabled)
      .map(([name]) => name);
    const previousCanonical = createTruthMap({ harnesses: previousHarnesses });
    if (truthOriginal === previousCanonical && isVibeTetherOwnedTruthIndex(manifest.truth_index_ownership)) {
      truthContent = createTruthMap({ harnesses: currentHarnesses });
    } else {
      delete manifest.truth_index_ownership;
    }
  }
  const routingSignals = (scanned.bundle_signals ?? []).map((signal) => signal.signal);
  providers = resolveExposurePlan(registry, options.profile, {
    bundles: manifest.bundles,
    explicit_bundles: options.bundles ?? [],
    signals: routingSignals,
  });
  providerSources = resolveProfileSources(registry, options.profile, manifest.bundles);
  const experienceTarget = resolveInside(root, EXPERIENCE_INDEX_PATH);
  const experienceOriginal = await readTextIfPresent(experienceTarget);
  if (experienceOriginal !== null) {
    try {
      await validateExperienceIndex(parseExperienceIndex(experienceOriginal), root);
    } catch (error) {
      throw new CliError(`Experience index conflict in ${EXPERIENCE_INDEX_PATH}: ${error.message}`, 3);
    }
  }
  if (experienceOriginal === null) {
    manifest.experience_index_ownership = { ...EXPERIENCE_INDEX_OWNERSHIP };
  } else if (!isVibeTetherOwnedExperienceIndex(manifest.experience_index_ownership)) {
    delete manifest.experience_index_ownership;
  }
  textPlans.push({
    relativePath: '.vibetether/project.yaml',
    target: manifestTarget,
    original: manifestOriginal,
    content: serializeManifest(manifest),
  });
  textPlans.push({
    relativePath: LOCAL_CLI_PATH,
    target: launcherTarget,
    original: launcherOriginal,
    content: localCli.content,
  });
  textPlans.push({
    relativePath: truthIndexPath,
    target: truthTarget,
    original: truthOriginal,
    content: truthContent,
  });
  textPlans.push({
    relativePath: EXPERIENCE_INDEX_PATH,
    target: experienceTarget,
    original: experienceOriginal,
    content: experienceOriginal ?? serializeExperienceIndex(EMPTY_EXPERIENCE_INDEX),
  });

  const intentTarget = resolveInside(root, '.vibetether/intent.md');
  const intentOriginal = await readTextIfPresent(intentTarget);
  if (options.intentContent !== undefined) {
    textPlans.push({
      relativePath: '.vibetether/intent.md',
      target: intentTarget,
      original: intentOriginal,
      content: options.intentContent,
    });
  } else if (intentOriginal === null) {
    textPlans.push({
      relativePath: '.vibetether/intent.md',
      target: intentTarget,
      original: null,
      content: DEFAULT_INTENT,
    });
  }

  const checkpointTarget = resolveInside(root, '.vibetether/state/current.yaml');
  const checkpointOriginal = await readTextIfPresent(checkpointTarget);
  if (checkpointOriginal === null) {
    textPlans.push({
      relativePath: '.vibetether/state/current.yaml',
      target: checkpointTarget,
      original: null,
      content: createInitialCheckpoint(manifest.goal_source, initialRecommendation),
    });
  } else {
    let checkpoint;
    try {
      checkpoint = YAML.parse(checkpointOriginal);
      if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
        throw new Error('checkpoint must be a mapping');
      }
    } catch {
      throw new CliError(
        'Checkpoint conflict in .vibetether/state/current.yaml: expected valid checkpoint YAML mapping. Restore the checkpoint and retry.',
        3,
      );
    }
    let checkpointChanged = false;
    if (!checkpoint.provider_selection) {
      checkpoint.provider_selection = {
        capability: 'requirements-clarification',
        recommended: initialRecommendation,
        selected: null,
        selection_reason: null,
        invocation_status: 'not-started',
      };
      checkpointChanged = true;
    }
    if (!checkpoint.experience_feedback) {
      checkpoint.experience_feedback = createInitialExperienceFeedback();
      checkpointChanged = true;
    }
    if (!checkpoint.truth_reconciliation) {
      checkpoint.truth_reconciliation = createInitialTruthReconciliation({ legacy: true });
      checkpointChanged = true;
    }
    if (checkpointChanged) {
      textPlans.push({
        relativePath: '.vibetether/state/current.yaml',
        target: checkpointTarget,
        original: checkpointOriginal,
        content: YAML.stringify(checkpoint, { lineWidth: 0 }),
      });
    }
  }

  for (const relativePath of ['.vibetether/capabilities.yaml', '.vibetether/providers.lock.yaml']) {
    await rejectSymlinkPath(root, relativePath);
  }
  const lockTarget = resolveInside(root, '.vibetether/providers.lock.yaml');
  const lockOriginal = await readTextIfPresent(lockTarget);
  let existingLock = null;
  let lockNeedsRepair = false;
  if (lockOriginal !== null) {
    try {
      const parsedLock = YAML.parse(lockOriginal);
      if (!validateProviderLock(parsedLock)) {
        throw new Error('the complete schema_version 1 or 2 provider contract is required');
      }
      existingLock = parsedLock;
    } catch {
      if (options.bootstrapOnly) {
        throw new CliError(
          'Provider lock conflict in .vibetether/providers.lock.yaml: expected a valid provider lock. Run `vibetether init` to repair it.',
          3,
        );
      }
      existingLock = null;
      lockNeedsRepair = true;
    }
  }

  if (options.bootstrapOnly) {
    if (existingLock === null) {
      throw new CliError('VibeTether bootstrap requires an initialized project with a valid provider lock. Run `vibetether init` first.');
    }
    await validateBootstrapAuthority({
      root,
      manifest: persistedManifest,
      proposedManifest: manifest,
      lock: existingLock,
      registry,
      request: BOOTSTRAP_TRANSITION_REQUEST,
      adapters,
      profile: options.profile,
      bundles: options.bundles ?? [],
    });
  }

  const skillPlans = adapters.map((adapter) => ({
    harness: adapter,
    relativePath: ADAPTERS[adapter].skillDirectory,
    target: resolveInside(root, ADAPTERS[adapter].skillDirectory),
    source: sourceSkill,
    kind: 'vibetether',
    upgradeOperations: dependencies.skillUpgradeOperations?.[adapter]
      ?? dependencies.skillUpgradeOperations,
  }));
  for (const plan of skillPlans) {
    const inspection = await inspectVibeTetherInstall(plan.target, plan.relativePath);
    plan.needsInstall = inspection.needsInstall;
    plan.replacesExisting = inspection.replacesExisting ?? false;
  }

  if (options.bootstrapOnly) {
    const board = createCapabilityBoard(registry, options.profile, existingLock, adapters);
    if (projectRoutesDocument) validateProjectRoutes(projectRoutesDocument, board);
    const boardTarget = resolveInside(root, '.vibetether/capabilities.yaml');
    textPlans.push({
      relativePath: '.vibetether/capabilities.yaml',
      target: boardTarget,
      original: await readTextIfPresent(boardTarget),
      content: `${JSON.stringify(board, null, 2)}\n`,
    });
    if (options.dryRun) return formatDryRun(root, textPlans, [], 'bootstrap');
    if (!options.yes) {
      throw new CliError('Refusing to change project truth without confirmation. Use --dry-run or --yes.');
    }
    const applied = await applyInitialization(root, textPlans, []);
    if (applied.cleanupWarnings.length > 0) {
      throw new CliError(`Bootstrap completed with unexpected cleanup failures (${applied.cleanupWarnings.join('; ')}).`, 3);
    }
    return `${recoveryPrefix}VibeTether bootstrapped project truth in ${root} without changing provider installations.\n`;
  }

  const preservedCollisions = [];
  let availableProviderCount = providers.length;
  if (options.dryRun) {
    const installations = [];
    const collisions = [];
    const catalogInstallations = [];
    for (const source of providerSources) {
      for (const catalogSkill of source.skills) {
        const relativePath = `.vibetether/providers/catalog/${source.id}/${catalogSkill.install_name}`;
        const target = resolveInside(root, relativePath);
        let needsInstall = true;
        let ownership = 'planned';
        try {
          const installedFingerprint = await skillFingerprint(target);
          if (installedFingerprint !== catalogSkill.fingerprint) {
            throw new CliError(`Refusing to overwrite modified catalog Skill at ${relativePath}.`, 3);
          }
          needsInstall = false;
          ownership = priorCatalogOwnership(existingLock, catalogSkill, relativePath) ?? 'preexisting';
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        skillPlans.push({
          relativePath,
          target,
          needsInstall,
          kind: 'catalog',
          providerId: catalogSkill.id,
          sourceId: source.id,
          commit: source.commit,
        });
        catalogInstallations.push({
          provider_id: catalogSkill.id,
          path: relativePath,
          ownership,
        });
      }
    }
    for (const provider of providers) {
      for (const adapter of adapters) {
        const relativePath = path
          .join(path.dirname(ADAPTERS[adapter].skillDirectory), provider.install_name)
          .replaceAll('\\', '/');
        const target = resolveInside(root, relativePath);
        let needsInstall = true;
        let ownership = 'planned';
        let collision = null;
        try {
          const installedFingerprint = await skillFingerprint(target);
          if (installedFingerprint !== provider.fingerprint) {
            collision = priorInstallationOwnership(existingLock, provider, adapter, relativePath) === 'vibetether'
              ? 'modified-managed-skill'
              : 'different-preexisting-skill';
            needsInstall = false;
            ownership = null;
          } else {
            needsInstall = false;
            ownership = priorInstallationOwnership(existingLock, provider, adapter, relativePath) ?? 'preexisting';
          }
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        skillPlans.push({
          relativePath,
          target,
          needsInstall,
          kind: collision ? 'collision' : 'provider',
          providerId: provider.id,
          sourceId: provider.source_id,
          commit: provider.commit,
        });
        if (collision) {
          collisions.push({
            provider_id: provider.id,
            harness: adapter,
            path: relativePath,
            reason: collision,
          });
        } else {
          installations.push({
            provider_id: provider.id,
            harness: adapter,
            path: relativePath,
            ownership,
          });
        }
      }
    }
    const processedKeys = new Set([
      ...installations.map((entry) => `${entry.provider_id}:${entry.harness}`),
      ...collisions.map((entry) => `${entry.provider_id}:${entry.harness}`),
    ]);
    for (const collision of await findUnprocessedManagedCollisions(root, existingLock, processedKeys)) {
      collisions.push(collision);
      skillPlans.push({
        relativePath: collision.path,
        target: resolveInside(root, collision.path),
        needsInstall: false,
        kind: 'collision',
        providerId: collision.provider_id,
      });
    }
    const plannedSources = [];
    for (const source of providerSources) {
      if (source.license_evidence?.mode === 'readme-declaration') {
        plannedSources.push({ ...source, license_evidence: source.license_evidence });
        continue;
      }
      const licensePath = `.vibetether/licenses/${source.id}.LICENSE.txt`;
      await rejectSymlinkPath(root, licensePath);
      const target = resolveInside(root, licensePath);
      const original = await readTextIfPresent(target);
      const previous = existingLock?.sources?.find((entry) => entry.id === source.id);
      if (
        previous?.commit === source.commit &&
        previous?.license_sha256 &&
        previous?.license_installation?.path === licensePath &&
        original !== null
      ) {
        const actual = createHash('sha256').update(original, 'utf8').digest('hex');
        if (actual !== previous.license_sha256) {
          throw new CliError(`Provider license conflict at ${licensePath}. Existing content differs from the lock.`, 3);
        }
        textPlans.push({ relativePath: licensePath, target, original, content: original });
        plannedSources.push({
          ...source,
          license_sha256: previous.license_sha256,
          license_installation: previous.license_installation,
        });
        continue;
      }
      textPlans.push({
        relativePath: licensePath,
        target,
        original,
        content: `<exact ${source.license} license from ${source.id}@${source.commit}>\n`,
      });
      plannedSources.push({
        ...source,
        license_installation: { path: licensePath, ownership: 'planned' },
      });
    }
    const lock = createProviderLock({
      profile: options.profile,
      bundles: manifest.bundles,
      sources: plannedSources,
      providers,
      installations,
      collisions,
      catalogInstallations,
      existingLock,
    });
    const board = createCapabilityBoard(registry, options.profile, lock, adapters);
    if (projectRoutesDocument) validateProjectRoutes(projectRoutesDocument, board);
    const boardTarget = resolveInside(root, '.vibetether/capabilities.yaml');
    textPlans.push({
      relativePath: '.vibetether/capabilities.yaml',
      target: boardTarget,
      original: await readTextIfPresent(boardTarget),
      content: `${JSON.stringify(board, null, 2)}\n`,
    });
    textPlans.push({
      relativePath: '.vibetether/providers.lock.yaml',
      target: lockTarget,
      original: lockOriginal,
      content: YAML.stringify(lock, { lineWidth: 0 }),
    });
    const preview = formatDryRun(root, textPlans, skillPlans);
    return lockNeedsRepair
      ? `${preview.trimEnd()}\nWarning: The existing provider lock is invalid and will be rebuilt from verified installed copies.\n`
      : preview;
  }

  if (!options.yes) {
    throw new CliError('Refusing to change the project without --yes. Use --dry-run to inspect the plan.');
  }

  const coreSkillPlans = skillPlans.splice(0, skillPlans.length).filter((plan) => plan.kind === 'vibetether');
  const coreApplied = await applyInitialization(root, [], coreSkillPlans);
  const initializationCleanupWarnings = [...coreApplied.cleanupWarnings];
  let staged = null;
  try {
    if (providerSources.length > 0) {
      const localStage = await resolveLocalProviderStage(root, providerSources, existingLock);
      const remoteStage = localStage.unresolved.length > 0
        ? await stageProviders(localStage.unresolved)
        : null;
      staged = mergeProviderStages(localStage, remoteStage);
    }
    const stagedSkills = new Map((staged?.skills ?? []).map((provider) => [provider.id, provider]));
    const stagedRepositories = new Map((staged?.repositories ?? []).map((source) => [source.source_id, source]));
    const installedSources = [];
    const catalogInstallations = [];
    for (const source of providerSources) {
      const stagedSource = stagedRepositories.get(source.id);
      if (!stagedSource) throw new CliError(`Staged provider source is missing: ${source.id}`, 3);
      if (stagedSource.license_evidence.mode === 'readme-declaration') {
        installedSources.push({
          ...source,
          license_evidence: stagedSource.license_evidence,
        });
        continue;
      }
      const relativePath = `.vibetether/licenses/${source.id}.LICENSE.txt`;
      await rejectSymlinkPath(root, relativePath);
      const target = resolveInside(root, relativePath);
      const original = await readTextIfPresent(target);
      if (original !== null && original !== stagedSource.license_content) {
        throw new CliError(`Provider license conflict at ${relativePath}. Refusing to overwrite existing content.`, 3);
      }
      const previous = existingLock?.sources?.find((entry) => entry.id === source.id);
      const ownership = original === null
        ? 'vibetether'
        : previous?.license_sha256 === stagedSource.license_sha256 &&
            previous?.license_installation?.path === relativePath &&
            previous?.license_installation?.ownership === 'vibetether'
          ? 'vibetether'
          : 'preexisting';
      textPlans.push({
        relativePath,
        target,
        original,
        content: stagedSource.license_content,
      });
      installedSources.push({
        ...source,
        license_sha256: stagedSource.license_sha256,
        license_installation: { path: relativePath, ownership },
      });
    }
    for (const source of providerSources) {
      for (const catalogSkill of source.skills) {
        const stagedProvider = stagedSkills.get(catalogSkill.id);
        if (!stagedProvider) throw new CliError(`Staged catalog Skill is missing: ${catalogSkill.id}`, 3);
        const relativePath = `.vibetether/providers/catalog/${source.id}/${catalogSkill.install_name}`;
        await rejectSymlinkPath(root, relativePath);
        const target = resolveInside(root, relativePath);
        const inspection = await inspectDirectoryInstall(stagedProvider.source_path, target, relativePath);
        const ownership = priorCatalogOwnership(existingLock, catalogSkill, relativePath) ?? inspection.ownership;
        skillPlans.push({
          relativePath,
          target,
          source: stagedProvider.source_path,
          needsInstall: inspection.needsInstall,
          kind: 'catalog',
          providerId: catalogSkill.id,
          sourceId: source.id,
          commit: source.commit,
          install: (destination) => installDirectory(stagedProvider.source_path, destination),
        });
        catalogInstallations.push({ provider_id: catalogSkill.id, path: relativePath, ownership });
      }
    }
    const installations = [];
    const collisions = [];
    for (const provider of providers) {
      const stagedProvider = stagedSkills.get(provider.id);
      if (!stagedProvider) throw new CliError(`Staged provider is missing: ${provider.id}`, 3);
      for (const adapter of adapters) {
        const relativePath = path
          .join(path.dirname(ADAPTERS[adapter].skillDirectory), provider.install_name)
          .replaceAll('\\', '/');
        await rejectSymlinkPath(root, relativePath);
        const target = resolveInside(root, relativePath);
        const priorOwnership = priorInstallationOwnership(existingLock, provider, adapter, relativePath);
        const inspection = await inspectDirectoryInstall(
          stagedProvider.source_path,
          target,
          relativePath,
          {
            preserveConflict: true,
            previouslyManaged: priorOwnership === 'vibetether',
          },
        );
        if (inspection.collision) {
          const collision = {
            provider_id: provider.id,
            harness: adapter,
            path: relativePath,
            reason: inspection.collision,
          };
          collisions.push(collision);
          preservedCollisions.push(collision);
          continue;
        }
        const ownership = priorOwnership ?? inspection.ownership;
        skillPlans.push({
          relativePath,
          target,
          source: stagedProvider.source_path,
          needsInstall: inspection.needsInstall,
          kind: 'provider',
          providerId: provider.id,
          sourceId: provider.source_id,
          commit: provider.commit,
          install: (destination) => installDirectory(stagedProvider.source_path, destination),
        });
        installations.push({ provider_id: provider.id, harness: adapter, path: relativePath, ownership });
      }
    }
    const processedKeys = new Set([
      ...installations.map((entry) => `${entry.provider_id}:${entry.harness}`),
      ...collisions.map((entry) => `${entry.provider_id}:${entry.harness}`),
    ]);
    for (const collision of await findUnprocessedManagedCollisions(root, existingLock, processedKeys)) {
      collisions.push(collision);
      preservedCollisions.push(collision);
    }

    const lock = createProviderLock({
      profile: options.profile,
      bundles: manifest.bundles,
      sources: installedSources,
      providers,
      installations,
      collisions,
      catalogInstallations,
      existingLock,
    });
    availableProviderCount = lock.exposures.filter((skill) => (
      skill.active
      && adapters.some((adapter) => Object.hasOwn(skill.installations ?? {}, adapter))
    )).length;
    const board = createCapabilityBoard(registry, options.profile, lock, adapters);
    if (projectRoutesDocument) validateProjectRoutes(projectRoutesDocument, board);
    const boardTarget = resolveInside(root, '.vibetether/capabilities.yaml');
    textPlans.push({
      relativePath: '.vibetether/capabilities.yaml',
      target: boardTarget,
      original: await readTextIfPresent(boardTarget),
      content: `${JSON.stringify(board, null, 2)}\n`,
    });
    textPlans.push({
      relativePath: '.vibetether/providers.lock.yaml',
      target: lockTarget,
      original: lockOriginal,
      content: YAML.stringify(lock, { lineWidth: 0 }),
    });

    const applied = await applyInitialization(root, textPlans, skillPlans);
    initializationCleanupWarnings.push(...applied.cleanupWarnings);
  } finally {
    await staged?.cleanup();
  }

  const warningMessages = [...(staged?.warnings ?? [])];
  if (lockNeedsRepair) {
    warningMessages.unshift('The previous provider lock was invalid and was rebuilt from verified installed copies.');
  }
  if (initializationCleanupWarnings.length > 0) {
    warningMessages.push('A verified Skill upgrade completed, but transaction cleanup remains. Close Codex and Claude, then rerun init.');
  }
  let doctorNotice = '';
  try {
    const { inspectProject } = await import('./doctor.mjs');
    let report;
    try {
      report = JSON.parse(await inspectProject({
        project: root,
        boundary: 'ordinary',
        json: true,
      }));
    } catch (error) {
      if (typeof error.output !== 'string') throw error;
      report = JSON.parse(error.output);
    }
    doctorNotice = report.ok
      ? `Doctor baseline: healthy${report.warnings.length ? ` with ${report.warnings.length} attention item(s)` : ''}.\n`
      : `Doctor baseline: ${report.issues.length} issue(s) require attention; run node ${LOCAL_CLI_PATH} doctor --project . --json.\n`;
  } catch {
    doctorNotice = `Doctor baseline: unavailable; run node ${LOCAL_CLI_PATH} doctor --project . --json.\n`;
  }
  const warnings = warningMessages.map((warning) => `- ${warning}`).join('\n');
  const collisionNotice = preservedCollisions.length > 0
    ? [
        'Preserved Skill name collisions:',
        ...preservedCollisions.map((collision) => (
          `- ${collision.path} (${collision.provider_id}; ${collision.reason})`
        )),
        'Existing Skills were left unchanged and were not recorded as reviewed provider routes.',
        `Run node ${LOCAL_CLI_PATH} customize --project . to review and route an existing project Skill.`,
        '',
      ].join('\n')
    : '';
  const truthNotice = manifestOriginal === null
    ? `Project truth is intentionally empty. Edit ${TRUTH_INDEX_PATH}, or ask the Agent to search for candidates and confirm activation one at a time.\n`
    : '';
  const truthMigrationNotice = persistedManifest?.truth_index === undefined
      && truthIndexPath === LEGACY_TRUTH_MAP_SIDECAR_PATH
    ? `Preserved legacy project truth at ${TRUTH_INDEX_PATH}; the canonical Truth Map is now ${LEGACY_TRUTH_MAP_SIDECAR_PATH}.\n`
    : '';
  return `${recoveryPrefix}VibeTether initialized ${root} for ${adapters.join(' + ')} using the ${options.profile} profile with ${availableProviderCount} of ${providers.length} curated provider Skill(s) available.\n${truthNotice}${truthMigrationNotice}${doctorNotice}${collisionNotice}${warnings ? `Warnings:\n${warnings}\n` : ''}`;
}
