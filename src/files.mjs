import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CliError } from './errors.mjs';
import { MANAGED_END, MANAGED_START } from './adapters.mjs';

export async function readTextIfPresent(target) {
  try {
    return await readFile(target, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function inspectManagedBlock(content, label) {
  const starts = content.split(MANAGED_START).length - 1;
  const ends = content.split(MANAGED_END).length - 1;
  if (starts !== ends || starts > 1) {
    throw new CliError(`Managed block conflict in ${label}. Repair or remove the existing VibeTether markers, then retry.`, 3);
  }
}

export function applyManagedBlock(content, body) {
  const block = `${MANAGED_START}\n${body.trim()}\n${MANAGED_END}`;
  if (content.includes(MANAGED_START)) {
    const start = content.indexOf(MANAGED_START);
    const end = content.indexOf(MANAGED_END, start) + MANAGED_END.length;
    return `${content.slice(0, start)}${block}${content.slice(end)}`;
  }

  const base = content.replace(/[\t ]+$/gm, '').replace(/\s*$/, '');
  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}

export function removeManagedBlock(content) {
  if (!content.includes(MANAGED_START)) return content;
  const start = content.indexOf(MANAGED_START);
  const end = content.indexOf(MANAGED_END, start) + MANAGED_END.length;
  const merged = `${content.slice(0, start)}${content.slice(end)}`
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  return merged ? `${merged}\n` : '';
}

export function resolveInside(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new CliError(`Refusing path outside project: ${relativePath}`, 3);
  }
  return target;
}

export async function rejectSymlinkPath(root, relativePath) {
  const target = resolveInside(root, relativePath);
  const relative = path.relative(root, target);
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) {
        throw new CliError(`Refusing symbolic-link target inside project: ${relativePath}`, 3);
      }
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

export async function writeAtomic(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

export async function backupOnce(target, original) {
  if (original === null) return null;
  const backup = `${target}.bak`;
  if ((await readTextIfPresent(backup)) === null) {
    await writeAtomic(backup, original);
    return backup;
  }
  return null;
}
