import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CliError } from './errors.mjs';
import { MANAGED_END, MANAGED_START } from './adapters.mjs';

const OWNED_PREFIX_PATTERN = /^<!-- vibetether:owned-prefix-newlines=(0|1) -->/;

function ownedPrefixCount(content, start, end) {
  const inner = content.slice(start + MANAGED_START.length, end).trim();
  const match = inner.match(OWNED_PREFIX_PATTERN);
  return match ? Number(match[1]) : null;
}

function managedBlock(body, newline, prefixCount = null) {
  const ownership = prefixCount === null
    ? ''
    : `<!-- vibetether:owned-prefix-newlines=${prefixCount} -->${newline}`;
  return `${MANAGED_START}${newline}${ownership}${body}${newline}${MANAGED_END}`;
}

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
  const reversed = starts === 1 && ends === 1 && content.indexOf(MANAGED_START) > content.indexOf(MANAGED_END);
  if (starts !== ends || starts > 1 || reversed) {
    throw new CliError(`Managed block conflict in ${label}. Repair or remove the existing VibeTether markers, then retry.`, 3);
  }
}

export function applyManagedBlock(content, body) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const normalizedBody = body.trim().replace(/\r?\n/g, newline);
  if (content.includes(MANAGED_START)) {
    const start = content.indexOf(MANAGED_START);
    const endStart = content.indexOf(MANAGED_END, start);
    const end = endStart + MANAGED_END.length;
    const block = managedBlock(normalizedBody, newline, ownedPrefixCount(content, start, endStart));
    return `${content.slice(0, start)}${block}${content.slice(end)}`;
  }
  const prefixCount = content && !content.endsWith(newline) ? 1 : 0;
  const block = managedBlock(normalizedBody, newline, prefixCount);
  return `${content}${newline.repeat(prefixCount)}${block}`;
}

export function managedBlockBody(content) {
  if (!content.includes(MANAGED_START) || !content.includes(MANAGED_END)) return null;
  const start = content.indexOf(MANAGED_START) + MANAGED_START.length;
  const end = content.indexOf(MANAGED_END, start);
  return content.slice(start, end).trim().replace(OWNED_PREFIX_PATTERN, '').trim();
}

export function removeManagedBlock(content) {
  if (!content.includes(MANAGED_START)) return content;
  const start = content.indexOf(MANAGED_START);
  const endStart = content.indexOf(MANAGED_END, start);
  const end = endStart + MANAGED_END.length;
  const prefixCount = ownedPrefixCount(content, start, endStart);
  const newline = content.slice(start, end).includes('\r\n') ? '\r\n' : '\n';
  let before = content.slice(0, start);
  if (prefixCount === 1) {
    if (!before.endsWith(newline)) {
      throw new CliError('Managed block ownership metadata does not match the surrounding content.', 3);
    }
    before = before.slice(0, -newline.length);
  }
  const after = content.slice(end);
  return `${before}${after}`;
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
