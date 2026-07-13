import { access, realpath, rename, rm } from 'node:fs/promises';
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
    skillPlans.push({ relativePath: adapter.skillDirectory, target });
  }

  const manifestTarget = resolveInside(root, '.vibetether/project.yaml');
  await rejectSymlinkPath(root, '.vibetether/project.yaml');
  const manifestOriginal = await readTextIfPresent(manifestTarget);
  const items = [
    ...textPlans.map((item) => item.relativePath),
    ...skillPlans.map((item) => item.relativePath),
    ...(manifestOriginal === null ? [] : ['.vibetether/project.yaml']),
  ];

  if (options.dryRun) {
    return `DRY RUN — VibeTether would remove managed content from ${root}:\n${items.map((item) => `  - ${item}`).join('\n')}\n`;
  }
  if (!options.yes) {
    throw new CliError('Refusing to change the project without --yes. Use --dry-run to inspect the plan.');
  }

  const quarantined = [];
  try {
    for (const plan of skillPlans) {
      const quarantine = `${plan.target}.${randomUUID()}.remove`;
      await rename(plan.target, quarantine);
      quarantined.push({ ...plan, quarantine });
    }
    for (const plan of textPlans) {
      if (plan.removeFile) await rm(plan.target, { force: true });
      else await writeAtomic(plan.target, plan.content);
    }
    if (manifestOriginal !== null) await rm(manifestTarget, { force: true });
    for (const plan of quarantined) await rm(plan.quarantine, { recursive: true, force: true });
  } catch (error) {
    for (const plan of textPlans) await writeAtomic(plan.target, plan.original).catch(() => {});
    if (manifestOriginal !== null) await writeAtomic(manifestTarget, manifestOriginal).catch(() => {});
    for (const plan of quarantined.reverse()) await rename(plan.quarantine, plan.target).catch(() => {});
    throw error;
  }

  return `VibeTether removed managed content from ${root}. The Intent Contract and backups were preserved.\n`;
}
