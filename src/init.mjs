import { mkdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { ADAPTERS, GITIGNORE_BODY, selectedAdapters } from './adapters.mjs';
import { CliError } from './errors.mjs';
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
import { createInitialCheckpoint, DEFAULT_INTENT, enableHarnesses, parseManifest, serializeManifest } from './manifest.mjs';
import { scanProject } from './project-scan.mjs';
import { assertSkillInstallable, installSkill } from './skill-install.mjs';

function instructionBody(adapter) {
  return ADAPTERS[adapter].managedBody;
}

export async function applyInitialization(root, textPlans, skillPlans, installSkillOperation = installSkill) {
  const appliedTexts = [];
  const createdBackups = [];
  const installedSkills = [];
  try {
    await mkdir(resolveInside(root, '.vibetether'), { recursive: true });
    for (const plan of textPlans) {
      if (plan.original === plan.content) continue;
      const backup = await backupOnce(plan.target, plan.original);
      if (backup) createdBackups.push(backup);
      await writeAtomic(plan.target, plan.content);
      appliedTexts.push(plan);
    }
    for (const plan of skillPlans) {
      if (!plan.needsInstall) continue;
      await installSkillOperation(plan.target);
      installedSkills.push(plan);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const plan of installedSkills.reverse()) {
      await rm(plan.target, { recursive: true, force: true }).catch((failure) => rollbackErrors.push(failure.message));
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
}

export async function initialize(options) {
  let root;
  try {
    root = await realpath(path.resolve(options.project));
  } catch {
    throw new CliError(`Project directory does not exist: ${options.project}`);
  }

  const adapters = selectedAdapters(options.agent);
  const textPlans = [];
  for (const adapter of adapters) {
    const relativePath = ADAPTERS[adapter].instructionFile;
    await rejectSymlinkPath(root, relativePath);
    const target = resolveInside(root, relativePath);
    const original = await readTextIfPresent(target);
    const content = original ?? '';
    inspectManagedBlock(content, relativePath);
    const existingBody = managedBlockBody(content);
    if (existingBody !== null && existingBody !== instructionBody(adapter).trim()) {
      throw new CliError(`Managed block conflict in ${relativePath}. Refusing to overwrite changed control rules.`, 3);
    }
    textPlans.push({ relativePath, target, original, content: applyManagedBlock(content, instructionBody(adapter)) });
  }

  await rejectSymlinkPath(root, '.gitignore');
  const ignoreTarget = resolveInside(root, '.gitignore');
  const ignoreOriginal = await readTextIfPresent(ignoreTarget);
  inspectManagedBlock(ignoreOriginal ?? '', '.gitignore');
  const existingIgnoreBody = managedBlockBody(ignoreOriginal ?? '');
  if (existingIgnoreBody !== null && existingIgnoreBody !== GITIGNORE_BODY) {
    throw new CliError('Managed block conflict in .gitignore. Refusing to overwrite changed control rules.', 3);
  }
  textPlans.push({
    relativePath: '.gitignore',
    target: ignoreTarget,
    original: ignoreOriginal,
    content: applyManagedBlock(ignoreOriginal ?? '', GITIGNORE_BODY),
  });

  for (const relativePath of ['.vibetether/project.yaml', '.vibetether/intent.md', '.vibetether/state/current.yaml']) {
    await rejectSymlinkPath(root, relativePath);
  }
  for (const adapter of adapters) {
    await rejectSymlinkPath(root, ADAPTERS[adapter].skillDirectory);
  }

  const manifestTarget = resolveInside(root, '.vibetether/project.yaml');
  const manifestOriginal = await readTextIfPresent(manifestTarget);
  let manifest;
  if (manifestOriginal === null) {
    manifest = await scanProject(root, adapters, options.profile);
  } else {
    try {
      manifest = enableHarnesses(parseManifest(manifestOriginal), adapters);
    } catch (error) {
      throw new CliError(`Manifest conflict in .vibetether/project.yaml: ${error.message}`, 3);
    }
  }
  textPlans.push({
    relativePath: '.vibetether/project.yaml',
    target: manifestTarget,
    original: manifestOriginal,
    content: serializeManifest(manifest),
  });

  const intentTarget = resolveInside(root, '.vibetether/intent.md');
  const intentOriginal = await readTextIfPresent(intentTarget);
  if (intentOriginal === null) {
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
      content: createInitialCheckpoint(manifest.goal_source),
    });
  }

  const skillPlans = adapters.map((adapter) => ({
    relativePath: ADAPTERS[adapter].skillDirectory,
    target: resolveInside(root, ADAPTERS[adapter].skillDirectory),
  }));
  for (const plan of skillPlans) plan.needsInstall = await assertSkillInstallable(plan.target, plan.relativePath);

  if (options.dryRun) {
    const items = [...textPlans.map((item) => item.relativePath), ...skillPlans.map((item) => item.relativePath)];
    return `DRY RUN — VibeTether would initialize ${root}:\n${items.map((item) => `  - ${item}`).join('\n')}\n`;
  }

  if (!options.yes) {
    throw new CliError('Refusing to change the project without --yes. Use --dry-run to inspect the plan.');
  }

  await applyInitialization(root, textPlans, skillPlans);

  return `VibeTether initialized ${root} for ${adapters.join(' + ')} using the ${options.profile} profile.\n`;
}
