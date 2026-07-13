import { access, mkdir, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import YAML from 'yaml';
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

function portablePath(value) {
  return String(value ?? '').replaceAll('\\', '/');
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

  for (const relativePath of ['.vibetether/capabilities.yaml', '.vibetether/providers.lock.yaml', '.vibetether/project.yaml']) {
    await rejectSymlinkPath(root, relativePath);
  }
  const lockPath = resolveInside(root, '.vibetether/providers.lock.yaml');
  const lockOriginal = await readTextIfPresent(lockPath);
  let lock = null;
  if (lockOriginal !== null) {
    try {
      lock = YAML.parse(lockOriginal);
      const validV1 = lock?.schema_version === 1 && Array.isArray(lock?.skills);
      const validV2 =
        lock?.schema_version === 2 &&
        Array.isArray(lock?.catalog) &&
        Array.isArray(lock?.exposures) &&
        Array.isArray(lock?.skills);
      if (!validV1 && !validV2) {
        throw new Error('expected schema_version 1 or 2 and the matching provider arrays');
      }
    } catch (error) {
      throw new CliError(`Cannot safely uninstall providers because the provider lock is invalid: ${error.message}`, 3);
    }
    for (const skill of lock.skills) {
      for (const [harness, installation] of Object.entries(skill.installations ?? {})) {
        if (installation?.ownership !== 'vibetether') continue;
        if (!installation.path) {
          throw new CliError(`Provider lock is missing an install path for ${skill.install_name ?? skill.id}`, 3);
        }
        const adapter = ADAPTERS[harness];
        const expectedPath = adapter
          ? portablePath(path.join(path.dirname(adapter.skillDirectory), skill.install_name))
          : null;
        if (!expectedPath || portablePath(installation.path) !== expectedPath) {
          throw new CliError(
            `Provider install path does not match ${harness}/${skill.install_name}: ${installation.path}`,
            3,
          );
        }
        await rejectSymlinkPath(root, installation.path);
        const target = resolveInside(root, installation.path);
        if (!(await exists(target))) continue;
        let installedFingerprint;
        try {
          installedFingerprint = await skillFingerprint(target);
        } catch (error) {
          throw new CliError(`Cannot verify provider Skill at ${installation.path}: ${error.message}`, 3);
        }
        if (installedFingerprint !== skill.fingerprint) {
          throw new CliError(`Refusing to remove modified provider Skill at ${installation.path}. Back up the customization first.`, 3);
        }
        if (!skillPlans.some((plan) => plan.target === target)) {
          skillPlans.push({ relativePath: installation.path, target, quarantineRoot });
        }
      }
    }
    for (const skill of lock.catalog ?? []) {
      const installation = skill.installation;
      if (installation?.ownership !== 'vibetether') continue;
      const expectedPath = `.vibetether/providers/catalog/${skill.source_id}/${skill.install_name}`;
      if (!installation.path || portablePath(installation.path) !== expectedPath) {
        throw new CliError(`Catalog install path does not match ${skill.id}: ${installation?.path ?? 'missing'}`, 3);
      }
      await rejectSymlinkPath(root, installation.path);
      const target = resolveInside(root, installation.path);
      if (!(await exists(target))) continue;
      let installedFingerprint;
      try {
        installedFingerprint = await skillFingerprint(target);
      } catch (error) {
        throw new CliError(`Cannot verify catalog Skill at ${installation.path}: ${error.message}`, 3);
      }
      if (installedFingerprint !== skill.fingerprint) {
        throw new CliError(`Refusing to remove modified catalog Skill at ${installation.path}. Back up the customization first.`, 3);
      }
      if (!skillPlans.some((plan) => plan.target === target)) {
        skillPlans.push({ relativePath: installation.path, target, quarantineRoot });
      }
    }
    for (const source of lock.sources ?? []) {
      const installation = source.license_installation;
      if (installation?.ownership !== 'vibetether') continue;
      if (!installation.path || !source.license_sha256) {
        throw new CliError(`Provider lock is missing an installed license record for ${source.id}`, 3);
      }
      const expectedLicensePath = `.vibetether/licenses/${source.id}.LICENSE.txt`;
      if (portablePath(installation.path) !== expectedLicensePath) {
        throw new CliError(`Provider license path does not match source ${source.id}: ${installation.path}`, 3);
      }
      await rejectSymlinkPath(root, installation.path);
      const target = resolveInside(root, installation.path);
      const original = await readTextIfPresent(target);
      if (original === null) continue;
      const actual = createHash('sha256').update(original, 'utf8').digest('hex');
      if (actual !== source.license_sha256) {
        throw new CliError(`Refusing to remove modified provider license at ${installation.path}. Back up the customization first.`, 3);
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
    try {
      const manifest = YAML.parse(manifestOriginal);
      if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
        const hadRouting = 'capability_board' in manifest || 'provider_lock' in manifest;
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
    } catch (error) {
      throw new CliError(`Cannot safely update .vibetether/project.yaml during uninstall: ${error.message}`, 3);
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
