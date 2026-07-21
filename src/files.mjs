import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access, appendFile, cp, lstat, mkdir, open, readFile, realpath, readdir, rename, rm, stat, writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { conflictError } from './errors.mjs';
import { CONTEXT_READ_LIMIT, CONTEXT_READ_MAX } from './constants.mjs';

const SECRET_PATTERNS = [
  /\b(?:ghp|github_pat|glpat|xox[baprs]|npm)_[A-Za-z0-9_-]{20,}\b/i,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bAIza[A-Za-z0-9_-]{30,}\b/,
  /\b(?:password|passwd|secret_access_key|client_secret|access_token|refresh_token)\s*[:=]\s*[^\s<]{6,}/i,
];
const SENSITIVE_BASENAMES = new Set([
  '.env', '.envrc', '.npmrc', '.netrc', '.pypirc', '.git-credentials', 'id_rsa', 'id_ed25519',
  'credentials', 'kubeconfig', 'application_default_credentials.json', 'accessTokens.json',
]);

export function containsSecret(value, seen = new Set()) {
  if (typeof value === 'string') return SECRET_PATTERNS.some((pattern) => pattern.test(value));
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(([key, child]) => containsSecret(key, seen) || containsSecret(child, seen));
}

export function boundedText(value, limit, label = 'Value', { allowEmpty = false } = {}) {
  const text = String(value ?? '').trim();
  if (!allowEmpty && !text) throw conflictError(`${label} must not be empty.`, 'INVALID_VALUE');
  if (Buffer.byteLength(text, 'utf8') > limit) throw conflictError(`${label} must be ${limit} bytes or fewer.`, 'VALUE_TOO_LARGE');
  if (containsSecret(text)) throw conflictError(`${label} appears to contain a credential or private key.`, 'SECRET_VALUE');
  return text;
}

export function normalizeSignal(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function assertSafeId(value, label = 'Id') {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) {
    throw conflictError(`${label} must be a safe lower-case identifier.`, 'INVALID_ID');
  }
  return value;
}

export function safeRelative(value, label = 'Path', { allowDirectory = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) throw conflictError(`${label} must be project-relative text.`, 'UNSAFE_PATH');
  const raw = value.trim();
  if (raw.includes('\\') || path.posix.isAbsolute(raw) || /^[A-Za-z]:/.test(raw) || raw.includes(':') || raw.includes('\0')) {
    throw conflictError(`${label} must be a portable project-relative path.`, 'UNSAFE_PATH');
  }
  const directory = allowDirectory && raw.endsWith('/');
  const normalized = path.posix.normalize(raw.replace(/^\.\//, ''));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw conflictError(`${label} escapes the project.`, 'UNSAFE_PATH');
  }
  const parts = normalized.split('/');
  if (parts.some((part) => part.toLowerCase() === '.git' || part === '..')) throw conflictError(`${label} targets protected Git metadata.`, 'UNSAFE_PATH');
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  if (parts.some((part) => reserved.test(part) || /[. ]$/.test(part))) throw conflictError(`${label} is not portable to Windows.`, 'UNSAFE_PATH');
  const base = parts.at(-1).toLowerCase();
  if (SENSITIVE_BASENAMES.has(base) || parts.some((part) => ['.ssh', '.gnupg', '.aws', '.kube'].includes(part.toLowerCase()))) {
    throw conflictError(`${label} references a sensitive credential path.`, 'SENSITIVE_PATH');
  }
  return directory ? `${normalized.replace(/\/+$/, '')}/` : normalized;
}

export function resolveInside(root, relativePath, label = 'Path') {
  const portable = safeRelative(relativePath, label, { allowDirectory: relativePath?.endsWith?.('/') });
  const target = path.resolve(root, ...portable.replace(/\/$/, '').split('/'));
  const relative = path.relative(path.resolve(root), target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw conflictError(`${label} escapes the project.`, 'UNSAFE_PATH');
  return target;
}

export async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

export async function readTextIfPresent(target) {
  try { return await readFile(target, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function sha256Text(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export async function sha256File(target) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  return hash.digest('hex');
}

export function normalizePortableText(value) {
  return String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

export function portableTextEqual(left, right) {
  return normalizePortableText(left) === normalizePortableText(right);
}

function portableTextBytes(bytes) {
  if (bytes.includes(0)) return bytes;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return bytes;
  return Buffer.from(normalizePortableText(text), 'utf8');
}

export function sha256PortableText(value) {
  return createHash('sha256').update(normalizePortableText(value), 'utf8').digest('hex');
}

export async function sha256PortableFile(target) {
  return createHash('sha256').update(portableTextBytes(await readFile(target))).digest('hex');
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

export async function rejectAbsoluteSymlinkChain(target, { allowMissing = false } = {}) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw conflictError(`Refusing symbolic-link path: ${absolute}`, 'SYMLINK_PATH');
    } catch (error) {
      if (error.code === 'ENOENT' && allowMissing) return absolute;
      throw error;
    }
  }
  return absolute;
}

export async function rejectSymlinkChain(root, relativePath, { allowMissing = false } = {}) {
  const target = resolveInside(root, relativePath, 'Project path');
  const rootReal = await realpath(root);
  const relative = path.relative(rootReal, target);
  let current = rootReal;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw conflictError(`Refusing symbolic-link project path: ${relativePath}`, 'SYMLINK_PATH');
    } catch (error) {
      if (error.code === 'ENOENT' && allowMissing) return target;
      throw error;
    }
  }
  return target;
}

export async function readJsonFile(target, label = 'JSON file', { allowMissing = false } = {}) {
  try { await rejectAbsoluteSymlinkChain(target, { allowMissing }); } catch (error) {
    if (error.code === 'ENOENT' && allowMissing) return null;
    if (error.code === 'ENOENT') throw conflictError(`${label} is missing.`, 'MISSING_FILE');
    throw error;
  }
  let source;
  try { source = await readFile(target, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT' && allowMissing) return null;
    if (error.code === 'ENOENT') throw conflictError(`${label} is missing.`, 'MISSING_FILE');
    throw error;
  }
  try { return JSON.parse(source); } catch { throw conflictError(`${label} is invalid JSON.`, 'INVALID_JSON'); }
}

export async function readProjectText(root, relativePath, label = 'Project file', { allowMissing = false } = {}) {
  let target;
  try { target = await rejectSymlinkChain(root, relativePath, { allowMissing }); } catch (error) {
    if (error.code === 'ENOENT' && allowMissing) return null;
    if (error.code === 'ENOENT') throw conflictError(`${label} is missing.`, 'MISSING_FILE');
    throw error;
  }
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw conflictError(`${label} must be a regular file.`, 'UNSAFE_FILE');
    return await readFile(target, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' && allowMissing) return null;
    if (error.code === 'ENOENT') throw conflictError(`${label} is missing.`, 'MISSING_FILE');
    throw error;
  }
}

export async function readProjectJson(root, relativePath, label = 'Project JSON', options = {}) {
  const source = await readProjectText(root, relativePath, label, options);
  if (source === null) return null;
  try { return JSON.parse(source); } catch { throw conflictError(`${label} is invalid JSON.`, 'INVALID_JSON'); }
}

async function fsyncDirectory(directory) {
  if (process.platform === 'win32') return;
  let handle;
  try { handle = await open(directory, 'r'); await handle.sync(); } finally { await handle?.close(); }
}

export async function atomicText(target, content, { mode = 0o600 } = {}) {
  await rejectAbsoluteSymlinkChain(path.dirname(target), { allowMissing: true });
  await mkdir(path.dirname(target), { recursive: true });
  await rejectAbsoluteSymlinkChain(target, { allowMissing: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', mode);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    let backup = null;
    if (process.platform === 'win32' && await exists(target)) {
      backup = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.previous`);
      await rename(target, backup);
    }
    try {
      await rename(temporary, target);
    } catch (error) {
      if (backup) {
        try { await rename(backup, target); backup = null; }
        catch (restoreError) {
          throw conflictError(`Atomic replacement failed and the previous file is preserved at ${backup}: ${restoreError.message}`, 'ROLLBACK_FAILED');
        }
      }
      throw error;
    }
    if (backup) await rm(backup, { force: true });
    await fsyncDirectory(path.dirname(target));
  } finally {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
  return target;
}

export async function atomicJson(target, value, options = {}) {
  if (containsSecret(value)) throw conflictError('Refusing to persist secret-bearing structured data.', 'SECRET_VALUE');
  return atomicText(target, canonicalJson(value), options);
}

export async function writeProjectText(root, relativePath, content) {
  if (containsSecret(content)) throw conflictError('Refusing to persist secret-bearing project text.', 'SECRET_VALUE');
  const target = resolveInside(root, relativePath, 'Project write path');
  await rejectSymlinkChain(root, relativePath, { allowMissing: true });
  return atomicText(target, content, { mode: 0o644 });
}

export async function writeProjectJson(root, relativePath, value) {
  const target = resolveInside(root, relativePath, 'Project write path');
  await rejectSymlinkChain(root, relativePath, { allowMissing: true });
  return atomicJson(target, value, { mode: 0o644 });
}

export async function transactionalWrites(plans) {
  const originals = [];
  try {
    for (const plan of plans) {
      await rejectAbsoluteSymlinkChain(path.dirname(plan.target), { allowMissing: true });
      await rejectAbsoluteSymlinkChain(plan.target, { allowMissing: true });
      const original = await readTextIfPresent(plan.target);
      originals.push({ ...plan, original });
    }
    for (const plan of plans) {
      if (plan.remove) await rm(plan.target, { force: true, recursive: plan.recursive === true });
      else await atomicText(plan.target, plan.content, { mode: plan.mode ?? 0o644 });
    }
  } catch (error) {
    const rollback = [];
    for (const plan of originals.reverse()) {
      try {
        if (plan.original === null) await rm(plan.target, { force: true, recursive: plan.recursive === true });
        else await atomicText(plan.target, plan.original, { mode: plan.mode ?? 0o644 });
      } catch (failure) { rollback.push(failure.message); }
    }
    if (rollback.length) throw conflictError(`Write failed and rollback was incomplete: ${rollback.join('; ')}`, 'ROLLBACK_FAILED');
    throw error;
  }
}

export async function withFileLock(lockPath, operation, { staleMs = 120_000, retries = 100, delayMs = 20 } = {}) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await mkdir(lockPath);
      await atomicJson(path.join(lockPath, 'owner.json'), { pid: process.pid, created_at: new Date().toISOString() });
      try { return await operation(); } finally { await rm(lockPath, { recursive: true, force: true }); }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const metadata = await stat(lockPath);
        if (Date.now() - metadata.mtimeMs > staleMs) { await rm(lockPath, { recursive: true, force: true }); continue; }
      } catch (statError) { if (statError.code !== 'ENOENT') throw statError; }
      if (attempt === retries) throw conflictError(`Timed out acquiring lock: ${lockPath}`, 'LOCKED');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw conflictError(`Unable to acquire lock: ${lockPath}`, 'LOCKED');
}

export async function appendBounded(target, line, maxBytes) {
  await mkdir(path.dirname(target), { recursive: true });
  await rejectAbsoluteSymlinkChain(target, { allowMissing: true });
  const prior = await readTextIfPresent(target) ?? '';
  const next = `${prior}${line.endsWith('\n') ? line : `${line}\n`}`;
  const bytes = Buffer.from(next, 'utf8');
  const output = bytes.length <= maxBytes ? next : bytes.subarray(bytes.length - maxBytes).toString('utf8').replace(/^[^\n]*\n?/, '');
  await atomicText(target, output);
}

export async function readRegularFileChunk(target, { offset = 0, limit = CONTEXT_READ_LIMIT } = {}) {
  if (!Number.isInteger(offset) || offset < 0) throw conflictError('Read offset must be a non-negative integer.', 'INVALID_READ');
  if (!Number.isInteger(limit) || limit < 1 || limit > CONTEXT_READ_MAX) throw conflictError(`Read limit must be 1-${CONTEXT_READ_MAX}.`, 'INVALID_READ');
  await rejectAbsoluteSymlinkChain(target, { allowMissing: false });
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw conflictError('Requested resource must be a regular file.', 'UNSAFE_FILE');
  const handle = await open(target, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(limit, Math.max(0, metadata.size - offset)));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    return {
      offset,
      bytes: bytesRead,
      total_bytes: metadata.size,
      next_offset: offset + bytesRead < metadata.size ? offset + bytesRead : null,
      content: buffer.subarray(0, bytesRead).toString('utf8'),
    };
  } finally { await handle.close(); }
}

export async function hashTree(root, { ignore = [], portableText = false } = {}) {
  const rootReal = await rejectAbsoluteSymlinkChain(root, { allowMissing: false });
  const ignored = new Set(ignore);
  const hash = createHash('sha256');
  async function walk(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (ignored.has(entry.name) || ignored.has(relative)) continue;
      const target = path.join(directory, entry.name);
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink()) throw conflictError(`Tree contains symbolic link: ${relative}`, 'SYMLINK_PATH');
      if (metadata.isDirectory()) { hash.update(`d:${relative}\0`); await walk(target, relative); }
      else if (metadata.isFile()) {
        if (portableText) {
          const bytes = portableTextBytes(await readFile(target));
          hash.update(`f:${relative}:${metadata.mode}:${bytes.length}\0`);
          hash.update(bytes);
        } else {
          hash.update(`f:${relative}:${metadata.mode}:${metadata.size}\0`);
          for await (const chunk of createReadStream(target)) hash.update(chunk);
        }
      }
      else throw conflictError(`Tree contains unsupported file type: ${relative}`, 'UNSAFE_FILE');
    }
  }
  await walk(rootReal);
  return hash.digest('hex');
}

export async function copyVerifiedDirectory(source, destination, expectedHash = null) {
  const sourceReal = await rejectAbsoluteSymlinkChain(source, { allowMissing: false });
  const metadata = await lstat(sourceReal);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw conflictError('Provider source must be a regular directory.', 'UNSAFE_PROVIDER');
  const sourceHash = await hashTree(sourceReal);
  if (expectedHash && sourceHash !== expectedHash) throw conflictError('Provider source fingerprint changed.', 'PROVIDER_FINGERPRINT');
  await rejectAbsoluteSymlinkChain(destination, { allowMissing: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  try {
    await cp(sourceReal, temporary, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
    const actual = await hashTree(temporary);
    if (actual !== sourceHash) throw conflictError('Provider copy verification failed.', 'PROVIDER_FINGERPRINT');
    await mkdir(path.dirname(destination), { recursive: true });
    if (await exists(destination)) {
      const existing = await hashTree(destination);
      if (existing !== sourceHash) throw conflictError('Provider cache collision contains different bytes.', 'FILE_COLLISION');
      await rm(temporary, { recursive: true, force: true });
    } else await rename(temporary, destination);
  } finally { await rm(temporary, { recursive: true, force: true }).catch(() => {}); }
  return sourceHash;
}
