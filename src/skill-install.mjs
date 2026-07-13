import { cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors.mjs';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sourceSkill = path.join(packageRoot, 'skills', 'vibe-tether');

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

export async function assertSkillInstallable(target, relativePath) {
  try {
    const [canonical, installed] = await Promise.all([skillFingerprint(sourceSkill), skillFingerprint(target)]);
    if (canonical !== installed) {
      throw new CliError(`Refusing to overwrite modified installed Skill at ${relativePath}. Back up the customization first.`, 3);
    }
    return false;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    if (error instanceof CliError) throw error;
    throw new CliError(`Cannot verify installed Skill at ${relativePath}: ${error.message}`, 3);
  }
}

export async function installSkill(target) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.vibe-tether.${randomUUID()}.tmp`);
  const previous = `${target}.${randomUUID()}.previous`;
  let movedPrevious = false;
  try {
    await cp(sourceSkill, temporary, { recursive: true, errorOnExist: true, force: false });
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
