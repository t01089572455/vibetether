import { access, mkdir, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ADAPTERS } from './adapters.mjs';
import { CliError } from './errors.mjs';
import {
  inspectManagedBlock,
  readTextIfPresent,
  rejectSymlinkPath,
  removeManagedBlock,
  resolveInside,
  writeAtomic,
} from './files.mjs';
import { skillFingerprint, sourceSkill } from './skill-install.mjs';

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
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
      await run.rename(plan.target, quarantine);
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

  const canonicalFingerprint = await skillFingerprint(sourceSkill);
  await rejectSymlinkPath(root, '.vibetether/quarantine');
  const quarantineRoot = resolveInside(root, '.vibetether/quarantine');
  const skillPlans = [];
  for (const adapter of Object.values(ADAPTERS)) {
    await rejectSymlinkPath(root, adapter.skillDirectory);
    const target = resolveInside(root, adapter.skillDirectory);
    if (!(await exists(target))) continue;
    let installedFingerprint;
    try {
      installedFingerprint = await skillFingerprint(target);
    } catch (error) {
      throw new CliError(`Cannot verify installed Skill at ${adapter.skillDirectory}: ${error.message}`, 3);
    }
    if (installedFingerprint !== canonicalFingerprint) {
      throw new CliError(`Refusing to remove modified installed Skill at ${adapter.skillDirectory}. Back up the customization first.`, 3);
    }
    skillPlans.push({ relativePath: adapter.skillDirectory, target, quarantineRoot });
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
