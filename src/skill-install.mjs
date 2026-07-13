import { cp, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceSkill = path.join(packageRoot, 'skills', 'vibe-tether');

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
    if (movedPrevious) await rm(previous, { recursive: true, force: true });
  } catch (error) {
    if (movedPrevious) {
      await rm(target, { recursive: true, force: true }).catch(() => {});
      await rename(previous, target).catch(() => {});
    }
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true }).catch(() => {});
    await rm(previous, { recursive: true, force: true }).catch(() => {});
  }
}
