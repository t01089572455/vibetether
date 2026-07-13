import { cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors.mjs';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sourceSkill = path.join(packageRoot, 'skills', 'vibe-tether');
export const LEGACY_VIBETETHER_FINGERPRINTS = new Set([
  '07e14f9aae4f66ed8baed16893f35a5730b9702174f72a04bf61dd5df45ca89d',
  '80cfe6c12fc583cc7788e60e5090603a88cdabfd7d1df45cfcbef45f67688bef',
]);

async function fingerprintEntry(root, relativePath, hash) {
  const target = path.join(root, relativePath);
  const entry = await lstat(target);
  if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported in installed Skills: ${relativePath}`);
  if (entry.isDirectory()) {
    hash.update(`directory:${relativePath.replaceAll('\\', '/')}\n`);
    const children = (await readdir(target)).sort();
    for (const child of children) await fingerprintEntry(root, path.join(relativePath, child), hash);
    return;
  }
  hash.update(`file:${relativePath.replaceAll('\\', '/')}\n`);
  hash.update(await readFile(target));
}

export async function skillFingerprint(root) {
  const hash = createHash('sha256');
  await fingerprintEntry(root, '', hash);
  return hash.digest('hex');
}

export async function inspectDirectoryInstall(source, target, relativePath, options = {}) {
  try {
    const [canonical, installed] = await Promise.all([skillFingerprint(source), skillFingerprint(target)]);
    if (canonical !== installed) {
      if (options.upgradeFingerprints?.has(installed)) {
        return { needsInstall: true, ownership: 'vibetether', replacesExisting: true };
      }
      throw new CliError(`Refusing to overwrite different or modified installed Skill at ${relativePath}. Back up or remove it first.`, 3);
    }
    return { needsInstall: false, ownership: 'preexisting' };
  } catch (error) {
    if (error.code === 'ENOENT') return { needsInstall: true, ownership: 'vibetether' };
    if (error instanceof CliError) throw error;
    throw new CliError(`Cannot verify installed Skill at ${relativePath}: ${error.message}`, 3);
  }
}

export async function inspectVibeTetherInstall(target, relativePath) {
  return inspectDirectoryInstall(sourceSkill, target, relativePath, {
    upgradeFingerprints: LEGACY_VIBETETHER_FINGERPRINTS,
  });
}

export async function assertSkillInstallable(target, relativePath) {
  const plan = await inspectVibeTetherInstall(target, relativePath);
  return plan.needsInstall;
}

export async function installDirectory(source, target) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.vibe-tether.${randomUUID()}.tmp`);
  const previous = `${target}.${randomUUID()}.previous`;
  let movedPrevious = false;
  try {
    await cp(source, temporary, { recursive: true, errorOnExist: true, force: false });
    try {
      await rename(target, previous);
      movedPrevious = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rename(temporary, target);
    if (movedPrevious) {
      await rm(previous, { recursive: true, force: true });
      movedPrevious = false;
    }
  } catch (error) {
    if (movedPrevious) {
      await rm(target, { recursive: true, force: true }).catch(() => {});
      try {
        await rename(previous, target);
        movedPrevious = false;
      } catch (restoreError) {
        throw new CliError(
          `Skill installation failed and the previous copy is preserved at ${previous}: ${restoreError.message}`,
          3,
        );
      }
    }
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true }).catch(() => {});
  }
}

export async function installSkill(target) {
  return installDirectory(sourceSkill, target);
}
