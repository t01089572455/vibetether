import { createHash, randomUUID } from 'node:crypto';
import {
  copyFile, lstat, mkdir, readFile, readdir, rename, rm,
} from 'node:fs/promises';
import path from 'node:path';
import { conflictError } from './errors.mjs';
import {
  exists, normalizePortableText, rejectAbsoluteSymlinkChain, safeRelative,
} from './files.mjs';

export const PROVIDER_LIMITS = Object.freeze({
  max_entries: 1024,
  max_files: 512,
  max_file_bytes: 4 * 1024 * 1024,
  max_total_bytes: 32 * 1024 * 1024,
  max_depth: 16,
  max_path_bytes: 240,
  max_compression_ratio: 200,
});

function portableBytes(bytes) {
  if (bytes.includes(0)) return bytes;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return bytes;
  return Buffer.from(normalizePortableText(text), 'utf8');
}

function limits(overrides = {}) {
  return { ...PROVIDER_LIMITS, ...overrides };
}

export function validateProviderArchiveEntries(entries, overrides = {}) {
  if (!Array.isArray(entries)) throw conflictError('Provider archive entries must be an array.', 'UNSAFE_PROVIDER');
  const policy = limits(overrides);
  if (entries.length > policy.max_entries) throw conflictError('Provider archive exceeds the entry limit.', 'PROVIDER_LIMIT');
  const exact = new Set();
  const folded = new Set();
  let fileCount = 0;
  let totalBytes = 0;
  const normalized = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw conflictError('Provider archive entry is invalid.', 'UNSAFE_PROVIDER');
    if (!['file', 'directory'].includes(entry.type)) throw conflictError(`Provider archive contains unsupported ${entry.type ?? 'entry'} type.`, 'UNSAFE_PROVIDER');
    const relative = safeRelative(entry.path, 'Provider archive path', { allowDirectory: entry.type === 'directory' });
    const canonical = relative.replace(/\/$/, '');
    if (Buffer.byteLength(canonical, 'utf8') > policy.max_path_bytes) throw conflictError(`Provider path exceeds ${policy.max_path_bytes} bytes.`, 'PROVIDER_LIMIT');
    if (canonical.split('/').length > policy.max_depth) throw conflictError(`Provider path exceeds depth ${policy.max_depth}.`, 'PROVIDER_LIMIT');
    const lower = canonical.toLowerCase();
    if (exact.has(canonical) || folded.has(lower)) throw conflictError(`Provider archive contains a duplicate or case-colliding path: ${canonical}`, 'UNSAFE_PROVIDER');
    exact.add(canonical);
    folded.add(lower);
    if (entry.encrypted === true) throw conflictError(`Provider archive entry is encrypted: ${canonical}`, 'UNSAFE_PROVIDER');
    if (entry.type === 'file') {
      if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw conflictError(`Provider file size is invalid: ${canonical}`, 'UNSAFE_PROVIDER');
      if (entry.size > policy.max_file_bytes) throw conflictError(`Provider file exceeds the size limit: ${canonical}`, 'PROVIDER_LIMIT');
      if (entry.compressed_size !== undefined) {
        if (!Number.isSafeInteger(entry.compressed_size) || entry.compressed_size < 0) throw conflictError(`Provider compressed size is invalid: ${canonical}`, 'UNSAFE_PROVIDER');
        const ratio = entry.size === 0 ? 1 : entry.compressed_size === 0 ? Infinity : entry.size / entry.compressed_size;
        if (ratio > policy.max_compression_ratio) throw conflictError(`Provider archive compression ratio exceeds the limit: ${canonical}`, 'PROVIDER_LIMIT');
      }
      fileCount += 1;
      totalBytes += entry.size;
      if (fileCount > policy.max_files) throw conflictError('Provider archive exceeds the file-count limit.', 'PROVIDER_LIMIT');
      if (totalBytes > policy.max_total_bytes) throw conflictError('Provider archive exceeds the total-size limit.', 'PROVIDER_LIMIT');
    }
    normalized.push({ ...entry, path: canonical });
  }
  return { entries: normalized, file_count: fileCount, total_bytes: totalBytes, limits: policy };
}

export async function inspectProviderTree(root, overrides = {}) {
  const source = await rejectAbsoluteSymlinkChain(root, { allowMissing: false });
  const sourceMetadata = await lstat(source);
  if (!sourceMetadata.isDirectory() || sourceMetadata.isSymbolicLink()) throw conflictError('Provider source must be a regular directory.', 'UNSAFE_PROVIDER');
  const entries = [];
  async function walk(directory, prefix = '') {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relative = prefix ? `${prefix}/${child.name}` : child.name;
      const target = path.join(directory, child.name);
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink()) throw conflictError(`Provider contains symbolic link: ${relative}`, 'UNSAFE_PROVIDER');
      if (metadata.isDirectory()) {
        entries.push({ path: relative, type: 'directory', size: 0 });
        await walk(target, relative);
      } else if (metadata.isFile()) {
        if (metadata.nlink > 1) throw conflictError(`Provider contains a hard-linked file: ${relative}`, 'UNSAFE_PROVIDER');
        entries.push({ path: relative, type: 'file', size: metadata.size });
      } else throw conflictError(`Provider contains an unsupported file type: ${relative}`, 'UNSAFE_PROVIDER');
    }
  }
  await walk(source);
  const validated = validateProviderArchiveEntries(entries, overrides);
  const files = validated.entries.filter((entry) => entry.type === 'file').sort((left, right) => left.path.localeCompare(right.path));
  if (!files.some((entry) => entry.path === 'SKILL.md')) throw conflictError('Provider source is missing SKILL.md.', 'INVALID_PROVIDER');
  const hash = createHash('sha256');
  hash.update('vibetether-provider-tree-v1\0');
  const fileRecords = [];
  for (const file of files) {
    const raw = await readFile(path.join(source, ...file.path.split('/')));
    const bytes = portableBytes(raw);
    const contentSha256 = createHash('sha256').update(bytes).digest('hex');
    hash.update(`f:${file.path}:${bytes.length}\0`);
    hash.update(bytes);
    fileRecords.push({ path: file.path, size: raw.length, normalized_size: bytes.length, content_sha256: contentSha256 });
  }
  const resources = fileRecords.filter((item) => item.path !== 'SKILL.md' && !item.path.startsWith('scripts/')).map((item) => item.path);
  const scripts = fileRecords.filter((item) => item.path.startsWith('scripts/')).map((item) => item.path);
  return {
    root: source,
    digest: hash.digest('hex'),
    files: fileRecords,
    resources,
    scripts,
    file_count: validated.file_count,
    total_bytes: validated.total_bytes,
    context_bytes: fileRecords.find((item) => item.path === 'SKILL.md')?.normalized_size ?? 0,
  };
}

function samePaths(left, right) {
  return [...left].sort().join('\0') === [...right].sort().join('\0');
}

export function assertProviderClosure(card, inspection) {
  const expected = card.fingerprint ?? card.object_hash;
  if (!expected || inspection.digest !== expected || card.object_hash !== expected) {
    throw conflictError(`Provider ${card.id} content differs from its immutable expected digest.`, 'PROVIDER_FINGERPRINT');
  }
  if (!samePaths(card.resources ?? [], inspection.resources)) throw conflictError(`Provider ${card.id} declared resources do not match its immutable closure.`, 'PROVIDER_CLOSURE');
  if (!samePaths(card.scripts ?? [], inspection.scripts)) throw conflictError(`Provider ${card.id} declared scripts do not match its immutable closure.`, 'PROVIDER_CLOSURE');
  if (inspection.context_bytes !== card.context_bytes) throw conflictError(`Provider ${card.id} context_bytes does not match SKILL.md.`, 'PROVIDER_CLOSURE');
  return inspection;
}

export async function verifyProviderSource(card) {
  return assertProviderClosure(card, await inspectProviderTree(card.resolved_path ?? card.path));
}

export async function materializeProviderClosure(card, destination) {
  const sourceInspection = await verifyProviderSource(card);
  await rejectAbsoluteSymlinkChain(destination, { allowMissing: true });
  if (await exists(destination)) {
    try {
      const existing = await inspectProviderTree(destination);
      assertProviderClosure(card, existing);
      return existing;
    } catch (error) {
      throw conflictError(`Refusing to overwrite modified Provider closure at ${destination}: ${error.message}`, 'FILE_COLLISION');
    }
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  try {
    await mkdir(temporary, { recursive: true });
    for (const file of sourceInspection.files) {
      const target = path.join(temporary, ...file.path.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(sourceInspection.root, ...file.path.split('/')), target);
    }
    const copied = await inspectProviderTree(temporary);
    assertProviderClosure(card, copied);
    await mkdir(path.dirname(destination), { recursive: true });
    try { await rename(temporary, destination); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code) || !await exists(destination)) throw error;
      const winner = await inspectProviderTree(destination);
      assertProviderClosure(card, winner);
      await rm(temporary, { recursive: true, force: true });
      return winner;
    }
    return { ...copied, root: destination };
  } finally { await rm(temporary, { recursive: true, force: true }).catch(() => {}); }
}
