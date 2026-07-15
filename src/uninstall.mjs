import { access, mkdir, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import YAML from 'yaml';
import { ADAPTERS } from './adapters.mjs';
import { CliError } from './errors.mjs';
import { EMPTY_EXPERIENCE_INDEX, serializeExperienceIndex } from './experience-index.mjs';
import { isVibeTetherOwnedExperienceIndex } from './manifest.mjs';
import {
  inspectManagedBlock,
  readTextIfPresent,
  rejectSymlinkPath,
  removeManagedBlock,
  resolveInside,
  writeAtomic,
} from './files.mjs';
import { inspectVibeTetherIdentity, skillFingerprint } from './skill-install.mjs';

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function portablePath(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function mapping(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function providerLockError(reason) {
  return new CliError(
    `Cannot safely uninstall providers because ${reason}. Restore a valid provider lock and retry.`,
    3,
  );
}

async function providerLockTarget(root, relativePath, label) {
  try {
    await rejectSymlinkPath(root, relativePath);
    return resolveInside(root, relativePath);
  } catch {
    throw providerLockError(`${label} must be a safe regular project path`);
  }
}

export async function applyUninstallPlans(textPlans, skillPlans, operations = {}) {
  const run = { mkdir, rename, rm, writeAtomic, ...operations };
  const quarantined = [];
  const appliedTexts = [];
  try {
    for (const plan of skillPlans) {
      if (!plan.quarantineRoot) throw new CliError('A safe uninstall quarantine root is required.', 3);
      await run.mkdir(plan.quarantineRoot, { recursive: true });
      const quarantine = path.join(plan.quarantineRoot, `${randomUUID()}.remove`);
      try {
        await run.rename(plan.target, quarantine);
      } catch (error) {
        if (['EACCES', 'EPERM'].includes(error.code)) {
          throw new CliError(
            `Cannot quarantine installed Skill at ${plan.relativePath ?? plan.target}: ${error.message}. Close Claude Code, Codex, editors, or any process using this Skill, then retry.`,
            3,
          );
        }
        throw error;
      }
      quarantined.push({ ...plan, quarantine });
    }
    for (const plan of textPlans) {
      if (plan.removeFile) await run.rm(plan.target, { force: true });
      else await run.writeAtomic(plan.target, plan.content);
      appliedTexts.push(plan);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const plan of appliedTexts.reverse()) {
      await run.writeAtomic(plan.target, plan.original).catch((failure) => rollbackErrors.push(failure.message));
    }
    for (const plan of quarantined.reverse()) {
      await run.rename(plan.quarantine, plan.target).catch((failure) => rollbackErrors.push(failure.message));
    }
    if (rollbackErrors.length === 0) throw error;
    throw new CliError(
      `Uninstall failed and rollback was incomplete (${rollbackErrors.join('; ')}). Quarantined Skills were preserved where possible.`,
      3,
    );
  }

  const cleanupFailures = [];
  for (const plan of quarantined) {
    try {
      await run.rm(plan.quarantine, { recursive: true, force: true });
    } catch (error) {
      cleanupFailures.push({ ...plan, error });
    }
  }
  return cleanupFailures;
}

export async function uninstall(options) {
  let root;
  try {
    root = await realpath(path.resolve(options.project));
  } catch {
    throw new CliError(`Project directory does not exist: ${options.project}`);
  }

  const textPlans = [];
  for (const relativePath of ['AGENTS.md', 'CLAUDE.md', '.gitignore']) {
    await rejectSymlinkPath(root, relativePath);
    const target = resolveInside(root, relativePath);
    const original = await readTextIfPresent(target);
    if (original === null) continue;
    inspectManagedBlock(original, relativePath);
    if (!original.includes('<!-- vibetether:start -->')) continue;
    const content = removeManagedBlock(original);
    const hasBackup = await exists(`${target}.bak`);
    textPlans.push({ relativePath, target, original, content, removeFile: content === '' && !hasBackup });
  }

  await rejectSymlinkPath(root, '.vibetether/quarantine');
  const quarantineRoot = resolveInside(root, '.vibetether/quarantine');
  const skillPlans = [];
  for (const adapter of Object.values(ADAPTERS)) {
    await rejectSymlinkPath(root, adapter.skillDirectory);
    const target = resolveInside(root, adapter.skillDirectory);
    if (!(await exists(target))) continue;
    try {
      const identity = await inspectVibeTetherIdentity(target);
      if (identity.state === 'unknown') {
        throw new CliError(`Refusing to remove modified installed Skill at ${adapter.skillDirectory}. Back up the customization first.`, 3);
      }
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError(`Cannot verify installed Skill at ${adapter.skillDirectory}: ${error.message}`, 3);
    }
    skillPlans.push({ relativePath: adapter.skillDirectory, target, quarantineRoot });
  }

  for (const relativePath of ['.vibetether/capabilities.yaml', '.vibetether/providers.lock.yaml', '.vibetether/project.yaml']) {
    await rejectSymlinkPath(root, relativePath);
  }
  const lockPath = resolveInside(root, '.vibetether/providers.lock.yaml');
  const lockOriginal = await readTextIfPresent(lockPath);
  let lock = null;
  if (lockOriginal !== null) {
    try {
      lock = YAML.parse(lockOriginal);
      const validV1 = lock?.schema_version === 1 && Array.isArray(lock?.sources) && Array.isArray(lock?.skills);
      const validV2 =
        lock?.schema_version === 2 &&
        Array.isArray(lock?.sources) &&
        Array.isArray(lock?.catalog) &&
        Array.isArray(lock?.exposures) &&
        Array.isArray(lock?.skills);
      if (!validV1 && !validV2) {
        throw new Error('expected schema_version 1 or 2 and the matching provider arrays');
      }
      const records = [lock.sources, lock.skills, ...(validV2 ? [lock.catalog, lock.exposures] : [])];
      if (records.some((entries) => entries.some((entry) => !mapping(entry)))) {
        throw new Error('provider records must be mappings');
      }
    } catch {
      throw new CliError(
        'Cannot safely uninstall providers because the provider lock is invalid. Restore a valid provider lock and retry.',
        3,
      );
    }
    for (const skill of lock.skills) {
      if (!mapping(skill) || !mapping(skill.installations) || typeof skill.install_name !== 'string') {
        throw providerLockError('the provider lock contains an invalid Skill record');
      }
      for (const [harness, installation] of Object.entries(skill.installations ?? {})) {
        if (installation?.ownership !== 'vibetether') continue;
        if (!installation.path) {
          throw providerLockError('the provider lock is missing an install path');
        }
        const adapter = ADAPTERS[harness];
        const expectedPath = adapter
          ? portablePath(path.join(path.dirname(adapter.skillDirectory), skill.install_name))
          : null;
        if (!expectedPath || portablePath(installation.path) !== expectedPath) {
          throw providerLockError('the provider install path does not match the expected project path');
        }
        const target = await providerLockTarget(root, installation.path, 'The provider install path');
        if (!(await exists(target))) continue;
        let installedFingerprint;
        try {
          installedFingerprint = await skillFingerprint(target);
        } catch {
          throw providerLockError('a provider Skill declared by the provider lock cannot be verified');
        }
      if (installedFingerprint !== skill.fingerprint) {
          throw providerLockError('a provider Skill declared by the provider lock has been modified');
        }
        if (!skillPlans.some((plan) => plan.target === target)) {
          skillPlans.push({ relativePath: installation.path, target, quarantineRoot });
        }
      }
    }
    for (const skill of lock.catalog ?? []) {
      if (!mapping(skill) || typeof skill.source_id !== 'string' || typeof skill.install_name !== 'string') {
        throw providerLockError('the provider lock contains an invalid catalog record');
      }
      const installation = skill.installation;
      if (installation?.ownership !== 'vibetether') continue;
      const expectedPath = `.vibetether/providers/catalog/${skill.source_id}/${skill.install_name}`;
      if (!installation.path || portablePath(installation.path) !== expectedPath) {
        throw providerLockError('the catalog install path does not match the expected project path');
      }
      const target = await providerLockTarget(root, installation.path, 'The catalog install path');
      if (!(await exists(target))) continue;
      let installedFingerprint;
      try {
        installedFingerprint = await skillFingerprint(target);
      } catch {
        throw providerLockError('a catalog Skill declared by the provider lock cannot be verified');
      }
        if (installedFingerprint !== skill.fingerprint) {
        throw providerLockError('the provider lock declares a modified catalog Skill');
      }
      if (!skillPlans.some((plan) => plan.target === target)) {
        skillPlans.push({ relativePath: installation.path, target, quarantineRoot });
      }
    }
    for (const source of lock.sources ?? []) {
      if (!mapping(source) || typeof source.id !== 'string') {
        throw providerLockError('the provider lock contains an invalid source record');
      }
      const installation = source.license_installation;
      if (installation?.ownership !== 'vibetether') continue;
      if (!installation.path || !source.license_sha256) {
        throw providerLockError('the provider lock is missing an installed license record');
      }
      const expectedLicensePath = `.vibetether/licenses/${source.id}.LICENSE.txt`;
      if (portablePath(installation.path) !== expectedLicensePath) {
        throw providerLockError('the provider license path does not match the expected project path');
      }
      const target = await providerLockTarget(root, installation.path, 'The provider license path');
      const original = await readTextIfPresent(target);
      if (original === null) continue;
      const actual = createHash('sha256').update(original, 'utf8').digest('hex');
      if (actual !== source.license_sha256) {
        throw providerLockError('the provider lock declares a modified provider license');
      }
      textPlans.push({
        relativePath: installation.path,
        target,
        original,
        content: '',
        removeFile: true,
      });
    }
  }

  const boardPath = resolveInside(root, '.vibetether/capabilities.yaml');
  const boardOriginal = await readTextIfPresent(boardPath);
  if (boardOriginal !== null) {
    textPlans.push({
      relativePath: '.vibetether/capabilities.yaml',
      target: boardPath,
      original: boardOriginal,
      content: '',
      removeFile: true,
    });
  }
  if (lockOriginal !== null) {
    textPlans.push({
      relativePath: '.vibetether/providers.lock.yaml',
      target: lockPath,
      original: lockOriginal,
      content: '',
      removeFile: true,
    });
  }

  const manifestPath = resolveInside(root, '.vibetether/project.yaml');
  const manifestOriginal = await readTextIfPresent(manifestPath);
  if (manifestOriginal !== null) {
    let manifest;
    try {
      manifest = YAML.parse(manifestOriginal);
    } catch {
      throw new CliError(
        'Cannot safely update .vibetether/project.yaml during uninstall: invalid manifest YAML. Restore a valid manifest and retry.',
        3,
      );
    }
    if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
      let removedCanonicalEmptyExperienceIndex = false;
      const canonicalEmptyIndex = serializeExperienceIndex(EMPTY_EXPERIENCE_INDEX);
      if (manifest.experience_index === '.vibetether/experience-index.yaml'
        && isVibeTetherOwnedExperienceIndex(manifest.experience_index_ownership)) {
        await rejectSymlinkPath(root, manifest.experience_index);
        const experiencePath = resolveInside(root, manifest.experience_index);
        const experienceOriginal = await readTextIfPresent(experiencePath);
        if (experienceOriginal === canonicalEmptyIndex) {
          textPlans.push({
            relativePath: manifest.experience_index,
            target: experiencePath,
            original: experienceOriginal,
            content: '',
            removeFile: true,
          });
          delete manifest.experience_index;
          delete manifest.experience_index_ownership;
          removedCanonicalEmptyExperienceIndex = true;
        }
      }
      const hadRouting = 'capability_board' in manifest
        || 'provider_lock' in manifest
        || removedCanonicalEmptyExperienceIndex;
      delete manifest.capability_board;
      delete manifest.provider_lock;
      if (hadRouting) {
        textPlans.push({
          relativePath: '.vibetether/project.yaml',
          target: manifestPath,
          original: manifestOriginal,
          content: YAML.stringify(manifest, { lineWidth: 0 }),
          removeFile: false,
        });
      }
    }
  }

  const items = [
    ...textPlans.map((item) => item.relativePath),
    ...skillPlans.map((item) => item.relativePath),
  ];

  if (options.dryRun) {
    return `DRY RUN — VibeTether would remove managed content from ${root}:\n${items.map((item) => `  - ${item}`).join('\n')}\n`;
  }
  if (!options.yes) {
    throw new CliError('Refusing to change the project without --yes. Use --dry-run to inspect the plan.');
  }

  const cleanupFailures = await applyUninstallPlans(textPlans, skillPlans);
  const warning = cleanupFailures.length === 0
    ? ''
    : ` Warning: inactive quarantine cleanup failed for ${cleanupFailures.map((plan) => plan.relativePath).join(', ')}; a copy remains under .vibetether/quarantine and can be deleted manually.`;
  return `VibeTether removed managed content from ${root}. The Intent Contract and backups were preserved.${warning}\n`;
}
