import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync, inflateRawSync } from 'node:zlib';

const scriptPath = fileURLToPath(import.meta.url);
export const packageRoot = path.resolve(path.dirname(scriptPath), '..');
export const defaultManifestPath = path.resolve(packageRoot, '..', 'vibetether-stage0-evidence-v1', 'stage0-evidence-manifest.json');

const REQUIRED_GATES = {
  check: ['npm', 'run', 'check'],
  coverage: ['npm', 'run', 'test:coverage'],
  budget: ['npm', 'run', 'audit:budgets'],
  release: ['npm', 'run', 'audit:release'],
  stage0_audit: ['npm', 'run', 'audit:stage0'],
  evidence_manifest_test: ['node', '--test', 'test/stage0-evidence-manifest.test.mjs'],
  package_journey: ['npm', 'run', 'test:stage0-package'],
  pack_dry_run: ['npm', 'pack', '--dry-run'],
};
const FINAL_MATRIX = new Set(['ubuntu/20', 'ubuntu/24', 'windows/20', 'windows/24']);
const OFFICIAL_REPOSITORY = 't01089572455/vibetether';
const FINAL_OPEN_AXES = new Set(['ui_golden_screen', 'owner_acceptance']);
const LOCAL_OPEN_AXES = new Set(['ui_golden_screen', 'ui_visual', 'live_v063', 'remote_matrix', 'independent_review', 'owner_acceptance']);

function issue(problems, code, message, field = null) {
  problems.push({ code, message, field });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isHex(value, length) {
  return typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
}

function validTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizedCommand(command) {
  if (!Array.isArray(command)) return [];
  return command.map((item, index) => {
    if (index !== 0) return item;
    const executable = String(item).toLowerCase().replaceAll('\\', '/').split('/').at(-1);
    if (executable === 'npm.cmd' || executable === 'npm.exe') return 'npm';
    if (executable === 'node.exe') return 'node';
    return executable;
  });
}

function sameCommand(actual, expected) {
  const left = normalizedCommand(actual);
  return left.length === expected.length && left.every((item, index) => item === expected[index]);
}

function outsideRepository(repository, target) {
  const relative = path.relative(path.resolve(repository), path.resolve(target));
  return relative.startsWith('..') || path.isAbsolute(relative);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function safeArchiveEntry(entryPath) {
  if (typeof entryPath !== 'string' || entryPath.length === 0 || path.posix.isAbsolute(entryPath) || entryPath.includes('\\')) return false;
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  return !entryPath.split('/').some((part) => !part || part === '.' || part === '..'
    || /[<>:"|?*\u0000-\u001f\u007f]/u.test(part) || /[ .]$/u.test(part) || reserved.test(part));
}

function parseTarNumber(bytes, label) {
  const text = bytes.toString('ascii').replaceAll('\0', '').trim();
  if (!/^[0-7]+$/.test(text || '0')) throw new Error(`${label} is not an octal TAR number.`);
  const value = Number.parseInt(text || '0', 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is outside the safe integer range.`);
  return value;
}

function tarEntries(compressed) {
  const bytes = gunzipSync(compressed, { maxOutputLength: 256 * 1024 * 1024 });
  const entries = [];
  let offset = 0;
  let zeroBlocks = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      if (zeroBlocks === 2) break;
      continue;
    }
    zeroBlocks = 0;
    const storedChecksum = parseTarNumber(header.subarray(148, 156), 'TAR checksum');
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    const actualChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
    if (storedChecksum !== actualChecksum) throw new Error('TAR header checksum does not match.');
    const mode = parseTarNumber(header.subarray(100, 108), 'TAR entry mode');
    if ((mode & ~0o777) !== 0) throw new Error('TAR entry uses unsupported special permission bits.');
    const size = parseTarNumber(header.subarray(124, 136), 'TAR entry size');
    const dataEnd = offset + size;
    if (dataEnd > bytes.length) throw new Error('TAR entry extends beyond archive bytes.');
    const data = bytes.subarray(offset, dataEnd);
    offset += Math.ceil(size / 512) * 512;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
    const rawPath = prefix ? `${prefix}/${name}` : name;
    const typeFlag = header[156];
    const entryPath = rawPath;
    const type = typeFlag === 0x35 ? 'directory' : (typeFlag === 0 || typeFlag === 0x30 ? 'file' : null);
    if (!type) throw new Error(`TAR contains unsupported entry type ${String.fromCharCode(typeFlag)}.`);
    if (type === 'directory' && size !== 0) throw new Error(`TAR directory contains an unexpected payload: ${entryPath}.`);
    const normalized = type === 'directory' ? entryPath.replace(/\/$/, '') : entryPath;
    if (!safeArchiveEntry(normalized)) throw new Error(`TAR contains unsafe path: ${entryPath}.`);
    entries.push({
      path: normalized,
      type,
      size: type === 'directory' ? 0 : size,
      mode,
      content_sha256: type === 'file' ? createHash('sha256').update(data).digest('hex') : null,
    });
  }
  if (zeroBlocks < 2 || offset > bytes.length) throw new Error('TAR end marker is missing or truncated.');
  if (bytes.subarray(offset).some((byte) => byte !== 0)) throw new Error('TAR contains nonzero bytes after its end marker.');
  return entries;
}

function findZipEnd(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('ZIP end-of-central-directory record is missing.');
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function zipEntryType(entryPath, madeBy, externalAttributes) {
  const host = madeBy >>> 8;
  if (host === 0) {
    const directory = entryPath.endsWith('/');
    const expectedAttributes = directory ? 0x10 : 0;
    if (externalAttributes !== expectedAttributes) {
      throw new Error(`ZIP DOS attributes do not match a Git archive entry: ${entryPath}.`);
    }
    return { type: directory ? 'directory' : 'file', mode: directory ? 0o040755 : 0o100644 };
  }
  if (host !== 3) throw new Error(`ZIP contains an unsupported creator host ${host}: ${entryPath}.`);
  let mode = externalAttributes >>> 16;
  if ((mode & 0o7000) !== 0) throw new Error(`ZIP entry uses unsupported special permission bits: ${entryPath}.`);
  if (host === 3) {
    const fileType = mode & 0o170000;
    if (fileType === 0o120000) throw new Error(`ZIP contains a symbolic link: ${entryPath}.`);
    if (![0o040000, 0o100000].includes(fileType)) throw new Error(`ZIP contains an unsupported Unix entry type: ${entryPath}.`);
    if (fileType === 0o040000) {
      if (!entryPath.endsWith('/')) throw new Error(`ZIP Unix directory lacks a trailing slash: ${entryPath}.`);
      return { type: 'directory', mode };
    }
    if (fileType === 0o100000 && entryPath.endsWith('/')) throw new Error(`ZIP Unix file has a directory path: ${entryPath}.`);
  }
  return { type: 'file', mode };
}

function validateZipExtraFields(bytes, start, length, label) {
  const end = start + length;
  let offset = start;
  const ids = new Set();
  while (offset < end) {
    if (offset + 4 > end) throw new Error(`${label} extra field header is truncated.`);
    const id = bytes.readUInt16LE(offset);
    const size = bytes.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > end) throw new Error(`${label} extra field payload is truncated.`);
    if (ids.has(id)) throw new Error(`${label} repeats ZIP extra field 0x${id.toString(16)}.`);
    ids.add(id);
    const data = bytes.subarray(offset, offset + size);
    if (id !== 0x5455 || data.length < 1) throw new Error(`${label} contains unsupported ZIP extra field 0x${id.toString(16)}.`);
    const flags = data[0];
    if ((flags & ~0x07) !== 0 || data.length !== 1 + 4 * ((flags & 1) + ((flags >>> 1) & 1) + ((flags >>> 2) & 1))) {
      throw new Error(`${label} extended timestamp field is malformed.`);
    }
    offset += size;
  }
  if (offset !== end) throw new Error(`${label} extra fields are misaligned.`);
}

function zipEntries(bytes) {
  const maxOutputLength = 256 * 1024 * 1024;
  const end = findZipEnd(bytes);
  if (bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) throw new Error('Multi-disk ZIP archives are unsupported.');
  const diskCount = bytes.readUInt16LE(end + 8);
  const count = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  const commentLength = bytes.readUInt16LE(end + 20);
  if (end + 22 + commentLength !== bytes.length) throw new Error('ZIP end record is truncated or followed by unaccounted bytes.');
  if (diskCount !== count || count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff
      || centralOffset + centralSize !== end) throw new Error('ZIP64, split, or truncated central directory is unsupported.');
  const entries = [];
  const localRanges = [];
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error(`ZIP central entry ${index + 1} is invalid.`);
    const madeBy = bytes.readUInt16LE(offset + 4);
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const expectedCrc = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const size = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const diskStart = bytes.readUInt16LE(offset + 34);
    const externalAttributes = bytes.readUInt32LE(offset + 38);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    const unsupportedFlags = flags & ~0x080e;
    if (nextOffset > end || diskStart !== 0 || unsupportedFlags !== 0 || (method === 0 && (flags & 0x0006) !== 0) || ![0, 8].includes(method)
        || [compressedSize, size, localOffset].includes(0xffffffff) || size > maxOutputLength) {
      throw new Error(`ZIP central entry ${index + 1} is encrypted, split, truncated, ZIP64, oversized, or uses an unsupported method.`);
    }
    validateZipExtraFields(bytes, offset + 46 + nameLength, extraLength, `ZIP central entry ${index + 1}`);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    let entryPath;
    if (flags & 0x0800) entryPath = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    else {
      if (nameBytes.some((byte) => byte > 0x7f)) throw new Error('ZIP contains a non-UTF-8 non-ASCII path.');
      entryPath = nameBytes.toString('ascii');
    }
    const { type, mode } = zipEntryType(entryPath, madeBy, externalAttributes);
    const normalized = type === 'directory' ? entryPath.slice(0, -1) : entryPath;
    if (!safeArchiveEntry(normalized)) throw new Error(`ZIP contains unsafe path: ${entryPath}.`);
    if (localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`ZIP local entry ${index + 1} is missing.`);
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localCrc = bytes.readUInt32LE(localOffset + 14);
    const localCompressedSize = bytes.readUInt32LE(localOffset + 18);
    const localSize = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart > centralOffset) throw new Error(`ZIP local entry ${index + 1} header is truncated.`);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    validateZipExtraFields(bytes, localOffset + 30 + localNameLength, localExtraLength, `ZIP local entry ${index + 1}`);
    const dataEnd = dataStart + compressedSize;
    if (localFlags !== flags || localMethod !== method || !localName.equals(nameBytes) || dataEnd > centralOffset) throw new Error(`ZIP local entry ${index + 1} does not match its central record.`);
    let rangeEnd = dataEnd;
    if (flags & 0x0008) {
      let descriptor = dataEnd;
      if (descriptor + 4 <= centralOffset && bytes.readUInt32LE(descriptor) === 0x08074b50) descriptor += 4;
      if (descriptor + 12 > centralOffset || bytes.readUInt32LE(descriptor) !== expectedCrc
          || bytes.readUInt32LE(descriptor + 4) !== compressedSize || bytes.readUInt32LE(descriptor + 8) !== size) {
        throw new Error(`ZIP data descriptor ${index + 1} does not match its central record.`);
      }
      rangeEnd = descriptor + 12;
    } else if (localCrc !== expectedCrc || localCompressedSize !== compressedSize || localSize !== size) {
      throw new Error(`ZIP local sizes or CRC ${index + 1} do not match its central record.`);
    }
    const payload = bytes.subarray(dataStart, dataEnd);
    let content;
    try {
      content = method === 0
        ? payload
        : inflateRawSync(payload, { maxOutputLength: Math.min(maxOutputLength, Math.max(1, size + 1)) });
    } catch (error) {
      throw new Error(`ZIP entry ${index + 1} cannot be inflated within its declared bound: ${error.message}`);
    }
    if (content.length !== size || crc32(content) !== expectedCrc || (type === 'directory' && content.length !== 0)) {
      throw new Error(`ZIP entry ${index + 1} payload does not match its declared size, type, or CRC.`);
    }
    localRanges.push({ start: localOffset, end: rangeEnd });
    entries.push({
      path: normalized,
      type,
      size: type === 'directory' ? 0 : size,
      mode,
      content_sha256: type === 'file' ? createHash('sha256').update(content).digest('hex') : null,
    });
    offset = nextOffset;
  }
  if (offset !== centralOffset + centralSize) throw new Error('ZIP central-directory size is inconsistent.');
  localRanges.sort((left, right) => left.start - right.start);
  for (const [index, range] of localRanges.entries()) {
    const expectedStart = index === 0 ? 0 : localRanges[index - 1].end;
    if (range.start !== expectedStart || range.end > centralOffset) throw new Error('ZIP local entries overlap or leave unaccounted bytes.');
  }
  if ((localRanges.at(-1)?.end ?? 0) !== centralOffset) throw new Error('ZIP local data does not terminate at the central directory.');
  return entries;
}

function validateEntrySet(entries, label) {
  const names = new Set();
  const portableNames = new Set();
  for (const [index, entry] of entries.entries()) {
    if (!safeArchiveEntry(entry?.path) || !['file', 'directory'].includes(entry?.type)
        || !Number.isInteger(entry?.size) || entry.size < 0 || (entry.type === 'directory' && entry.size !== 0)) {
      throw new Error(`${label} entry ${index + 1} is unsafe or incomplete.`);
    }
    if (names.has(entry.path)) throw new Error(`${label} repeats ${entry.path}.`);
    const portableName = entry.path.normalize('NFC').toLowerCase();
    if (portableNames.has(portableName)) throw new Error(`${label} has a portable-name collision at ${entry.path}.`);
    names.add(entry.path);
    portableNames.add(portableName);
  }
}

function sameEntries(left, right) {
  const sorted = (values) => values
    .map(({ path: entryPath, type, size }) => ({ path: entryPath, type, size }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return canonicalJson(sorted(left)) === canonicalJson(sorted(right));
}

const packageInventoryCache = new Map();
const gitInventoryCache = new Map();

function npmCli() {
  return [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean).find((candidate) => existsSync(candidate)) ?? null;
}

function successful(result, label) {
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr?.toString() || result.stdout?.toString() || `${label} failed.`);
  return result.stdout;
}

async function candidatePackageInventory(candidate) {
  const key = `${candidate.repository}\0${candidate.commit}\0${candidate.tree}`;
  if (!packageInventoryCache.has(key)) packageInventoryCache.set(key, (async () => {
    const cli = npmCli();
    if (!cli) throw new Error('npm-cli.js is unavailable for candidate package inventory.');
    const stdout = successful(spawnSync(process.execPath, [cli, 'pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: candidate.repository,
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      maxBuffer: 32 * 1024 * 1024,
    }), 'npm pack --dry-run');
    const metadata = JSON.parse(stdout);
    if (!Array.isArray(metadata) || metadata.length !== 1 || metadata[0]?.name !== 'vibetether'
        || metadata[0]?.version !== candidate.package_version || !Array.isArray(metadata[0]?.files)) {
      throw new Error('npm dry-run metadata does not identify one VibeTether candidate package.');
    }
    return Promise.all(metadata[0].files.map(async (file) => {
      if (!isObject(file) || !safeArchiveEntry(file.path) || !Number.isInteger(file.size) || !Number.isInteger(file.mode)
          || file.mode < 0 || (file.mode & ~0o777) !== 0) throw new Error('npm dry-run returned an unsafe package entry.');
      const source = path.resolve(candidate.repository, ...file.path.split('/'));
      if (outsideRepository(candidate.repository, source)) throw new Error(`npm package entry escapes the candidate: ${file.path}.`);
      const sourceStat = await lstat(source);
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`npm package entry is not a regular candidate file: ${file.path}.`);
      const bytes = await readFile(source);
      if (bytes.length !== file.size) throw new Error(`npm package metadata size is stale for ${file.path}.`);
      return {
        path: `package/${file.path}`,
        type: 'file',
        size: bytes.length,
        mode: file.mode,
        content_sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    }));
  })());
  return packageInventoryCache.get(key);
}

function candidateGitInventory(candidate) {
  const key = `${candidate.repository}\0${candidate.commit}\0${candidate.tree}`;
  if (!gitInventoryCache.has(key)) {
    const output = successful(spawnSync('git', ['-C', candidate.repository, 'ls-tree', '-r', '-z', '--full-tree', candidate.commit], {
      encoding: null,
      windowsHide: true,
      shell: false,
      maxBuffer: 32 * 1024 * 1024,
    }), 'git ls-tree');
    const entries = [];
    for (const record of output.toString('utf8').split('\0').filter(Boolean)) {
      const match = record.match(/^([0-7]{6}) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/);
      if (!match || !safeArchiveEntry(match[4]) || match[2] !== 'blob' || match[1] === '120000') throw new Error(`Candidate Git tree contains an unsupported entry: ${record}.`);
      const bytes = successful(spawnSync('git', ['-C', candidate.repository, 'cat-file', 'blob', match[3]], {
        encoding: null,
        windowsHide: true,
        shell: false,
        maxBuffer: 256 * 1024 * 1024,
      }), `git cat-file ${match[3]}`);
      entries.push({
        path: match[4],
        type: 'file',
        size: bytes.length,
        mode: Number.parseInt(match[1], 8),
        content_sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    gitInventoryCache.set(key, entries);
  }
  return gitInventoryCache.get(key);
}

async function assertArchiveCandidateBinding(name, actual, candidate) {
  const expected = name === 'tgz' ? await candidatePackageInventory(candidate) : candidateGitInventory(candidate);
  const actualFiles = actual.filter((entry) => entry.type === 'file');
  const actualDirectories = actual.filter((entry) => entry.type === 'directory');
  const expectedByPath = new Map(expected.map((entry) => [entry.path, entry]));
  if (actualFiles.length !== expected.length || expectedByPath.size !== expected.length) throw new Error(`${name.toUpperCase()} file set differs from the candidate.`);
  for (const directory of actualDirectories) {
    if (!expected.some((entry) => entry.path.startsWith(`${directory.path}/`))) throw new Error(`${name.toUpperCase()} contains a directory absent from the candidate.`);
  }
  for (const entry of actualFiles) {
    const source = expectedByPath.get(entry.path);
    const modeMatches = name === 'tgz'
      ? entry.mode === source?.mode
      : entry.mode === source?.mode;
    if (!source || entry.size !== source.size || entry.content_sha256 !== source.content_sha256 || !modeMatches) {
      throw new Error(`${name.toUpperCase()} entry differs from candidate bytes or mode: ${entry.path}.`);
    }
  }
}

async function verifyFile(record, label, repository, problems) {
  if (!isObject(record) || typeof record.path !== 'string' || !isHex(record.sha256, 64)) {
    issue(problems, 'EVIDENCE_FILE_INVALID', `${label} requires an absolute path and SHA-256.`, label);
    return null;
  }
  if (typeof repository !== 'string' || !path.isAbsolute(repository)) {
    issue(problems, 'EVIDENCE_CONTEXT_INVALID', `${label} cannot be verified without an absolute candidate repository.`, label);
    return null;
  }
  if (!path.isAbsolute(record.path)) issue(problems, 'EVIDENCE_PATH_NOT_ABSOLUTE', `${label} path must be absolute.`, label);
  if (!outsideRepository(repository, record.path)) issue(problems, 'EVIDENCE_INSIDE_CANDIDATE', `${label} must remain outside candidate bytes.`, label);
  let bytes;
  try {
    bytes = await readFile(record.path);
  } catch (error) {
    issue(problems, 'EVIDENCE_FILE_MISSING', `${label} is unreadable: ${error.code ?? error.message}`, label);
    return null;
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== record.sha256) issue(problems, 'DIGEST_MISMATCH', `${label} digest does not match the recorded bytes.`, label);
  return bytes;
}

async function verifyJsonFile(record, label, repository, problems, code = 'EVIDENCE_JSON_INVALID') {
  const bytes = await verifyFile(record, label, repository, problems);
  if (!bytes) return null;
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!isObject(value)) throw new Error('root value must be an object');
    return value;
  } catch (error) {
    issue(problems, code, `${label} is not a JSON object: ${error.message}`, label);
    return null;
  }
}

async function verifyArchive(name, archive, candidate, problems) {
  const label = `artifacts.${name}`;
  if (!isObject(archive)) {
    issue(problems, 'ARTIFACT_MISSING', `${name.toUpperCase()} artifact is missing.`, label);
    return;
  }
  if (archive.format !== name) issue(problems, 'ARTIFACT_FORMAT_INVALID', `${label}.format must be ${name}.`, `${label}.format`);
  if (archive.commit !== candidate.commit) issue(problems, 'ARTIFACT_COMMIT_MISMATCH', `${label} does not bind the candidate commit.`, `${label}.commit`);
  if (archive.tree !== candidate.tree) issue(problems, 'ARTIFACT_TREE_MISMATCH', `${label} does not bind the candidate tree.`, `${label}.tree`);
  const bytes = await verifyFile(archive, label, candidate.repository, problems);
  const listingBytes = await verifyFile(archive.listing, `${label}.listing`, candidate.repository, problems);
  if (!bytes || !listingBytes) return;
  let listing;
  try {
    listing = JSON.parse(listingBytes.toString('utf8'));
  } catch {
    issue(problems, 'ARCHIVE_LISTING_INVALID', `${label} listing is not JSON.`, `${label}.listing`);
    return;
  }
  if (!isObject(listing) || listing.schema_version !== 1 || listing.format !== name || listing.artifact_sha256 !== archive.sha256 || !Array.isArray(listing.entries)) {
    issue(problems, 'ARCHIVE_LISTING_INVALID', `${label} listing does not bind the artifact and format.`, `${label}.listing`);
    return;
  }
  if (!Number.isInteger(archive.listing.entry_count) || archive.listing.entry_count <= 0 || archive.listing.entry_count !== listing.entries.length) {
    issue(problems, 'ARCHIVE_ENTRY_COUNT_MISMATCH', `${label} listing entry count is stale.`, `${label}.listing.entry_count`);
  }
  try {
    validateEntrySet(listing.entries, `${label} listing`);
  } catch (error) {
    issue(problems, 'ARCHIVE_ENTRY_INVALID', error.message, `${label}.listing.entries`);
    return;
  }
  let actual;
  try {
    actual = name === 'tgz' ? tarEntries(bytes) : zipEntries(bytes);
    validateEntrySet(actual, `${label} archive`);
  } catch (error) {
    issue(problems, 'ARCHIVE_BYTES_INVALID', `${label} bytes cannot be safely inventoried: ${error.message}`, label);
    return;
  }
  if (!sameEntries(actual, listing.entries)) {
    issue(problems, 'ARCHIVE_CONTENT_MISMATCH', `${label} retained listing differs from paths, types, or sizes derived from archive bytes.`, `${label}.listing`);
  }
  try {
    await assertArchiveCandidateBinding(name, actual, candidate);
  } catch (error) {
    issue(problems, 'ARTIFACT_CANDIDATE_MISMATCH', `${label} does not contain the candidate-derived file set and bytes: ${error.message}`, label);
  }
  const required = name === 'tgz'
    ? ['package/package.json', 'package/bin/vibetether.mjs']
    : ['package.json', 'bin/vibetether.mjs'];
  for (const requiredPath of required) {
    if (!actual.some((entry) => entry.path === requiredPath && entry.type === 'file')) {
      issue(problems, 'ARCHIVE_REQUIRED_ENTRY_MISSING', `${label} omits required file ${requiredPath}.`, label);
    }
  }
}

function validateCandidate(candidate, currentIdentity, problems) {
  if (!isObject(candidate)) {
    issue(problems, 'CANDIDATE_MISSING', 'Candidate identity is missing.', 'candidate');
    return;
  }
  const repository = typeof candidate.repository === 'string' ? candidate.repository : '';
  if (!repository || !path.isAbsolute(repository)) issue(problems, 'CANDIDATE_REPOSITORY_INVALID', 'Candidate repository path must be absolute.', 'candidate.repository');
  if (candidate.remote_repository !== OFFICIAL_REPOSITORY) issue(problems, 'CANDIDATE_REPOSITORY_INVALID', 'Candidate remote repository identity is missing or unexpected.', 'candidate.remote_repository');
  if (!isHex(candidate.commit, 40) || !isHex(candidate.tree, 40)) issue(problems, 'CANDIDATE_IDENTITY_INVALID', 'Candidate commit and tree must be exact 40-character Git IDs.', 'candidate');
  if (!validTime(candidate.committed_at)) issue(problems, 'CANDIDATE_TIME_INVALID', 'Candidate commit time is missing or invalid.', 'candidate.committed_at');
  if (candidate.clean !== true) issue(problems, 'CANDIDATE_DIRTY', 'Candidate identity must record a clean tree.', 'candidate.clean');
  if (candidate.package_version !== '1.0.0-rc.4') issue(problems, 'PACKAGE_VERSION_MISMATCH', 'Candidate package version is not RC.4.', 'candidate.package_version');
  if (typeof candidate.branch !== 'string' || !candidate.branch) issue(problems, 'CANDIDATE_BRANCH_MISSING', 'Candidate branch is missing.', 'candidate.branch');
  if (typeof candidate.implementer_id !== 'string' || !candidate.implementer_id.trim()) issue(problems, 'IMPLEMENTER_ID_MISSING', 'Candidate implementer identity is missing.', 'candidate.implementer_id');
  const currentRepository = isObject(currentIdentity) && typeof currentIdentity.repository === 'string' ? currentIdentity.repository : '';
  const sameRepository = Boolean(currentRepository && repository) && path.resolve(currentRepository) === path.resolve(repository);
  const sameCommitTime = isObject(currentIdentity) && validTime(currentIdentity.committed_at)
    && validTime(candidate.committed_at) && Date.parse(currentIdentity.committed_at) === Date.parse(candidate.committed_at);
  if (!isObject(currentIdentity) || !sameRepository || currentIdentity.commit !== candidate.commit || currentIdentity.tree !== candidate.tree
      || currentIdentity.clean !== true || !sameCommitTime) {
    issue(problems, 'CANDIDATE_STALE', 'Manifest candidate identity does not match the current clean repository.', 'candidate');
  }
}

async function validateRuns(manifest, problems) {
  const candidate = isObject(manifest.candidate) ? manifest.candidate : {};
  const runs = Array.isArray(manifest.runs) ? manifest.runs : [];
  if (!Array.isArray(manifest.runs)) issue(problems, 'RUNS_MISSING', 'Evidence runs are missing.', 'runs');
  const byId = new Map();
  for (const [index, declared] of runs.entries()) {
    const label = `runs.${index}`;
    const run = await verifyJsonFile(declared?.receipt, `${label}.receipt`, candidate.repository, problems, 'RUN_RECEIPT_INVALID');
    if (!run) continue;
    const declaration = { ...declared };
    delete declaration.receipt;
    if (canonicalJson(declaration) !== canonicalJson(run)) issue(problems, 'RUN_RECEIPT_MISMATCH', `Run ${index + 1} summary differs from its retained receipt.`, label);
    if (!isObject(run) || typeof run.id !== 'string' || !run.id) {
      issue(problems, 'RUN_INVALID', `Run ${index + 1} has no stable ID.`, label);
      continue;
    }
    if (byId.has(run.id)) issue(problems, 'RUN_DUPLICATE', `Run ID is duplicated: ${run.id}`, `${label}.id`);
    byId.set(run.id, run);
    if (!Array.isArray(run.command) || run.command.length === 0 || run.command.some((item) => typeof item !== 'string' || !item)) issue(problems, 'RUN_COMMAND_INVALID', `${run.id} command is invalid.`, `${label}.command`);
    if (run.exit_code !== 0) issue(problems, 'RUN_NOT_SUCCESSFUL', `${run.id} did not exit zero.`, `${label}.exit_code`);
    if (!validTime(run.started_at) || !validTime(run.finished_at) || Date.parse(run.finished_at) < Date.parse(run.started_at)) issue(problems, 'RUN_TIME_INVALID', `${run.id} timestamps are invalid.`, label);
    if (validTime(run.started_at) && validTime(candidate.committed_at) && Date.parse(run.started_at) < Date.parse(candidate.committed_at)) {
      issue(problems, 'RUN_TIME_INVALID', `${run.id} predates the candidate commit.`, `${label}.started_at`);
    }
    const absolutePaths = typeof run.repository === 'string' && path.isAbsolute(run.repository)
      && typeof run.cwd === 'string' && path.isAbsolute(run.cwd);
    const identityMatches = absolutePaths
      && path.resolve(run.repository) === path.resolve(candidate.repository)
      && path.resolve(run.cwd) === path.resolve(candidate.repository)
      && run.commit === candidate.commit && run.tree === candidate.tree
      && run.committed_at === candidate.committed_at
      && run.clean_before === true && run.clean_after === true
      && run.package_sha256 === manifest.artifacts?.tgz?.sha256;
    if (!identityMatches) issue(problems, 'RUN_IDENTITY_MISMATCH', `${run.id} does not bind the clean candidate repository, commit, tree, and exact TGZ.`, label);
    const runtime = run.runtime;
    if (!isObject(runtime) || !/^v\d+\.\d+\.\d+/.test(runtime.node ?? '') || typeof runtime.npm !== 'string' || !runtime.npm || !['win32', 'linux', 'darwin'].includes(runtime.os) || typeof runtime.arch !== 'string' || !runtime.arch) {
      issue(problems, 'RUNTIME_IDENTITY_INVALID', `${run.id} runtime identity is incomplete.`, `${label}.runtime`);
    }
    const stdoutBytes = await verifyFile(run.stdout, `${label}.stdout`, candidate.repository, problems);
    await verifyFile(run.stderr, `${label}.stderr`, candidate.repository, problems);
    if (sameCommand(run.command, REQUIRED_GATES.package_journey) && stdoutBytes) {
      const markers = [...stdoutBytes.toString('utf8').matchAll(/VIBETETHER_STAGE0_PACKAGE_JOURNEY_SHA256=([a-f0-9]{64})/g)];
      if (markers.length !== 1 || markers[0][1] !== manifest.artifacts?.tgz?.sha256) {
        issue(
          problems,
          'PACKAGE_JOURNEY_IDENTITY_MISMATCH',
          `${run.id} did not prove that the complete package journey consumed the retained exact TGZ.`,
          `${label}.stdout`,
        );
      }
    }
  }
  const gates = isObject(manifest.gates) ? manifest.gates : {};
  const gateRunIds = [];
  for (const [gate, expectedCommand] of Object.entries(REQUIRED_GATES)) {
    const runId = gates[gate];
    if (typeof runId !== 'string' || !byId.has(runId)) {
      issue(problems, 'REQUIRED_GATE_MISSING', `Required local gate is missing: ${gate}`, `gates.${gate}`);
      continue;
    }
    gateRunIds.push(runId);
    if (!sameCommand(byId.get(runId).command, expectedCommand)) issue(problems, 'GATE_COMMAND_MISMATCH', `${gate} does not bind its governed command.`, `gates.${gate}`);
  }
  if (new Set(gateRunIds).size !== gateRunIds.length) issue(problems, 'GATE_RUN_REUSED', 'Each required local gate needs a distinct run receipt.', 'gates');
  return byId;
}

async function validateLive(manifest, runById, problems) {
  const live = manifest.live_v063;
  const candidate = isObject(manifest.candidate) ? manifest.candidate : {};
  const candidateRepository = typeof candidate.repository === 'string' ? candidate.repository : null;
  if (!isObject(live)) {
    issue(problems, 'LIVE_V063_MISSING', 'Live v0.6.3 evidence is missing.', 'live_v063');
    return;
  }
  const run = runById.get(live.run_id);
  if (live.status !== 'passed' || !run || !sameCommand(run.command, ['npm', 'run', 'test:compat:v063-live'])) issue(problems, 'LIVE_V063_RUN_INVALID', 'Live v0.6.3 does not bind a successful governed run.', 'live_v063.run_id');
  if (live.source_version !== 'v0.6.3' || !isHex(live.tag_object, 40) || !isHex(live.commit, 40) || !isHex(live.tree, 40) || !isHex(live.normalized_source_sha256, 64)) issue(problems, 'LIVE_V063_SOURCE_INVALID', 'Live v0.6.3 source identity is incomplete.', 'live_v063');
  if (typeof live.migration_id !== 'string' || !live.migration_id || typeof live.rollback_id !== 'string' || !live.rollback_id || live.rollback_result !== 'restored') issue(problems, 'LIVE_V063_ROLLBACK_INVALID', 'Migration and restored rollback identities are required.', 'live_v063');
  if (live.post_rollback_matches !== true || live.user_edit_preserved !== true) issue(problems, 'LIVE_V063_BYTES_INVALID', 'Post-rollback bytes and the user edit must be preserved.', 'live_v063');
  if (live.candidate_repository !== candidate.repository
      || live.candidate_commit !== candidate.commit || live.candidate_tree !== candidate.tree
      || live.candidate_committed_at !== candidate.committed_at || live.candidate_clean !== true
      || live.package_sha256 !== manifest.artifacts?.tgz?.sha256) {
    issue(problems, 'LIVE_V063_IDENTITY_MISMATCH', 'Live v0.6.3 summary does not bind the clean candidate repository, commit, tree, time, and exact TGZ.', 'live_v063');
  }
  const report = await verifyJsonFile(live.report, 'live_v063.report', candidateRepository, problems, 'LIVE_V063_REPORT_INVALID');
  if (report) {
    const identity = report.candidate;
    const legacy = report.legacy;
    const identityMatches = report.schema_version === 1 && report.status === 'pass' && report.ok === true && report.tag === 'v0.6.3'
      && isObject(identity) && typeof identity.repository === 'string' && path.isAbsolute(identity.repository)
      && candidateRepository && path.resolve(identity.repository) === path.resolve(candidateRepository)
      && identity.commit === candidate.commit && identity.tree === candidate.tree
      && identity.committed_at === candidate.committed_at
      && identity.clean_before === true && identity.clean_after === true
      && identity.tgz_sha256 === manifest.artifacts?.tgz?.sha256
      && isObject(legacy) && legacy.tag_object === live.tag_object && legacy.commit === live.commit
      && legacy.tree === live.tree && legacy.content_sha256 === live.normalized_source_sha256;
    const fixtures = Array.isArray(report.fixtures) ? report.fixtures : [];
    const agents = new Set(fixtures.map((fixture) => fixture?.agent));
    const fixturesPass = fixtures.length === 3 && ['codex', 'claude', 'both'].every((agent) => agents.has(agent))
      && fixtures.every((fixture) => typeof (fixture.migration_id ?? fixture.controlled_migration_id) === 'string'
        && typeof fixture.rollback_id === 'string' && fixture.rollback_result === 'restored'
        && fixture.post_rollback_matches === true && fixture.conflict_preserved_post_migration_edit === true);
    if (!identityMatches || !fixturesPass) issue(problems, 'LIVE_V063_IDENTITY_MISMATCH', 'Retained live report does not prove the exact candidate, legacy source, and all three host modes.', 'live_v063.report');
  }
  const before = await verifyFile(live.before_inventory, 'live_v063.before_inventory', candidateRepository, problems);
  const after = await verifyFile(live.post_rollback_inventory, 'live_v063.post_rollback_inventory', candidateRepository, problems);
  if (before && after && createHash('sha256').update(before).digest('hex') !== createHash('sha256').update(after).digest('hex')) issue(problems, 'LIVE_V063_BYTES_INVALID', 'Post-rollback inventory differs from the protected baseline.', 'live_v063.post_rollback_inventory');
}

async function validateMatrix(manifest, problems) {
  const candidate = isObject(manifest.candidate) ? manifest.candidate : {};
  const candidateRepository = typeof candidate.repository === 'string' ? candidate.repository : null;
  const jobs = Array.isArray(manifest.matrix) ? manifest.matrix : [];
  if (jobs.length !== 4) issue(problems, 'MATRIX_INCOMPLETE', 'Exactly four terminating matrix jobs are required.', 'matrix');
  const tuples = new Set();
  const jobIds = new Set();
  const urls = new Set();
  for (const [index, job] of jobs.entries()) {
    const label = `matrix.${index}`;
    const tuple = `${job?.platform}/${job?.node}`;
    if (!FINAL_MATRIX.has(tuple) || tuples.has(tuple)) issue(problems, 'MATRIX_AXIS_INVALID', `Matrix axis is missing or duplicated: ${tuple}`, label);
    tuples.add(tuple);
    if (typeof job?.job_id !== 'string' || !job.job_id || jobIds.has(job.job_id) || typeof job?.url !== 'string' || urls.has(job.url)) issue(problems, 'MATRIX_JOB_DUPLICATE', 'Matrix job IDs and URLs must be distinct.', label);
    jobIds.add(job?.job_id);
    urls.add(job?.url);
    const numericIds = /^\d+$/.test(job?.run_id ?? '') && /^\d+$/.test(job?.job_id ?? '');
    const expectedUrl = numericIds
      && job.url === `https://github.com/${candidate.remote_repository}/actions/runs/${job.run_id}/job/${job.job_id}`;
    if (job?.status !== 'completed' || job?.conclusion !== 'success' || !expectedUrl) issue(problems, 'MATRIX_JOB_NOT_SUCCESSFUL', `${tuple} is configured, incomplete, unsuccessful, or lacks a real job URL.`, label);
    if (job?.head_sha !== candidate.commit) issue(problems, 'MATRIX_COMMIT_MISMATCH', `${tuple} ran on a different commit.`, `${label}.head_sha`);
    if (job?.package_sha256 !== manifest.artifacts?.tgz?.sha256) issue(problems, 'MATRIX_PACKAGE_MISMATCH', `${tuple} does not bind the exact TGZ.`, `${label}.package_sha256`);
    if (job?.repository !== candidate.remote_repository || job?.commit !== candidate.commit
        || job?.tree !== candidate.tree || job?.committed_at !== candidate.committed_at || job?.clean !== true) {
      issue(problems, 'MATRIX_IDENTITY_MISMATCH', `${tuple} does not bind the clean candidate repository, commit, tree, and commit time.`, label);
    }
    const api = await verifyJsonFile(job?.api_snapshot, `${label}.api_snapshot`, candidateRepository, problems, 'MATRIX_API_SNAPSHOT_INVALID');
    if (api) {
      const apiUrl = `https://api.github.com/repos/t01089572455/vibetether/actions/jobs/${job.job_id}`;
      const runUrl = `https://api.github.com/repos/t01089572455/vibetether/actions/runs/${job.run_id}`;
      const apiIdentity = String(api.id) === job.job_id && String(api.run_id) === job.run_id
        && api.url === apiUrl && api.run_url === runUrl && api.html_url === job.url
        && api.status === job.status && api.conclusion === job.conclusion;
      if (!apiIdentity) issue(problems, 'MATRIX_API_SNAPSHOT_INVALID', `${tuple} summary differs from its official job API snapshot.`, `${label}.api_snapshot`);
      if (api.head_sha !== candidate.commit) issue(problems, 'MATRIX_COMMIT_MISMATCH', `${tuple} API snapshot ran on a different commit.`, `${label}.api_snapshot.head_sha`);
      const namedAxis = typeof api.name === 'string' && api.name.toLowerCase().includes(job.platform)
        && api.name.toLowerCase().includes(String(job.node));
      const steps = Array.isArray(api.steps) ? api.steps : [];
      const requiredSteps = ['Run Stage 0 gates', 'Record exact package digest'];
      const stepsPass = requiredSteps.every((name) => steps.some((step) => step?.name === name && step.status === 'completed' && step.conclusion === 'success'));
      if (!namedAxis || !stepsPass || !validTime(api.started_at) || !validTime(api.completed_at)
          || Date.parse(api.completed_at) < Date.parse(api.started_at)
          || (validTime(candidate.committed_at) && Date.parse(api.started_at) < Date.parse(candidate.committed_at))) {
        issue(problems, 'MATRIX_JOB_NOT_SUCCESSFUL', `${tuple} API snapshot lacks the successful governed steps, axis, or current timestamps.`, `${label}.api_snapshot`);
      }
    }
    const logBytes = await verifyFile(job?.job_log, `${label}.job_log`, candidateRepository, problems);
    if (logBytes) {
      const log = logBytes.toString('utf8');
      const digestMarkers = [...log.matchAll(/^(?:[^\r\n]*\t)*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z[ \t]+VIBETETHER_STAGE0_PACKAGE_SHA256=([a-f0-9]{64})\r?$/gm)].map((match) => match[1]);
      if (digestMarkers.length !== 1 || digestMarkers[0] !== manifest.artifacts?.tgz?.sha256) {
        issue(problems, 'MATRIX_PACKAGE_MISMATCH', `${tuple} official job log does not contain the exact candidate TGZ digest.`, `${label}.job_log`);
      }
      const identityMarkers = [...log.matchAll(/^(?:[^\r\n]*\t)*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z[ \t]+VIBETETHER_STAGE0_IDENTITY=(\{[^\r\n]*\})\r?$/gm)].map((match) => match[1]);
      let identity = null;
      if (identityMarkers.length === 1) {
        try { identity = JSON.parse(identityMarkers[0]); } catch { identity = null; }
      }
      if (!isObject(identity) || identity.schema_version !== 1
          || identity.repository !== candidate.remote_repository
          || identity.commit !== candidate.commit || identity.tree !== candidate.tree
          || identity.committed_at !== candidate.committed_at || identity.clean !== true) {
        issue(problems, 'MATRIX_IDENTITY_MISMATCH', `${tuple} official job log does not bind the clean candidate repository, commit, tree, and commit time.`, `${label}.job_log`);
      }
      if (identity?.package_sha256 !== manifest.artifacts?.tgz?.sha256) {
        issue(problems, 'MATRIX_PACKAGE_MISMATCH', `${tuple} official job identity does not bind the exact candidate TGZ digest.`, `${label}.job_log`);
      }
    }
  }
  for (const tuple of FINAL_MATRIX) if (!tuples.has(tuple)) issue(problems, 'MATRIX_INCOMPLETE', `Matrix result is missing: ${tuple}`, 'matrix');
}

async function validateReview(manifest, problems) {
  const review = manifest.review;
  const candidate = isObject(manifest.candidate) ? manifest.candidate : {};
  const candidateRepository = typeof candidate.repository === 'string' ? candidate.repository : null;
  if (!isObject(review)) {
    issue(problems, 'REVIEW_MISSING', 'Independent review is missing.', 'review');
    return;
  }
  const reviewerId = typeof review.reviewer_id === 'string' ? review.reviewer_id.trim() : '';
  const implementerId = typeof candidate.implementer_id === 'string' ? candidate.implementer_id.trim() : '';
  if (!reviewerId || reviewerId.toLowerCase() === implementerId.toLowerCase() || review.reviewer_level !== 'independent-read-only') issue(problems, 'REVIEW_NOT_INDEPENDENT', 'A non-empty independent reviewer identity distinct from the implementer is required.', 'review');
  if (review.review_branch !== 'refs/heads/codex/vibetether-stage0-review' || review.repository !== candidate.repository
      || review.commit !== candidate.commit || review.tree !== candidate.tree
      || review.committed_at !== candidate.committed_at || review.clean !== true
      || review.package_sha256 !== manifest.artifacts?.tgz?.sha256) issue(problems, 'REVIEW_IDENTITY_MISMATCH', 'Review does not bind the review branch, clean candidate repository, commit/tree/time, and TGZ.', 'review');
  if (!validTime(review.started_at) || !validTime(review.completed_at) || Date.parse(review.completed_at) < Date.parse(review.started_at)) issue(problems, 'REVIEW_TIME_INVALID', 'Review timestamps are invalid.', 'review');
  if (validTime(review.started_at) && validTime(candidate.committed_at) && Date.parse(review.started_at) < Date.parse(candidate.committed_at)) issue(problems, 'REVIEW_TIME_INVALID', 'Review predates the candidate commit.', 'review.started_at');
  if (!Array.isArray(review.findings)) issue(problems, 'REVIEW_FINDINGS_MISSING', 'Review findings must be explicit, including an empty list.', 'review.findings');
  const findings = Array.isArray(review.findings) ? review.findings : [];
  for (const finding of findings) {
    if (!isObject(finding) || typeof finding.id !== 'string' || !['P0', 'P1', 'P2', 'P3'].includes(finding.severity) || typeof finding.status !== 'string' || typeof finding.summary !== 'string') issue(problems, 'REVIEW_FINDING_INVALID', 'Review finding is incomplete.', 'review.findings');
    if (['P0', 'P1'].includes(finding?.severity) && !['resolved', 'closed'].includes(finding?.status)) issue(problems, 'REVIEW_BLOCKING_FINDING', `Blocking finding remains open: ${finding.id}`, 'review.findings');
  }
  if (review.disposition !== 'ready-for-owner-review') issue(problems, 'REVIEW_DISPOSITION_INVALID', 'Review disposition is not ready for owner review.', 'review.disposition');
  const receipt = await verifyJsonFile(review.receipt, 'review.receipt', candidateRepository, problems, 'REVIEW_RECEIPT_INVALID');
  if (receipt) {
    const fields = [
      'reviewer_id', 'reviewer_level', 'review_branch', 'repository', 'commit', 'tree', 'committed_at', 'clean', 'package_sha256',
      'started_at', 'completed_at', 'findings', 'disposition',
    ];
    if (receipt.schema_version !== 1 || fields.some((field) => canonicalJson(receipt[field]) !== canonicalJson(review[field]))) {
      issue(problems, 'REVIEW_IDENTITY_MISMATCH', 'Review summary differs from the retained independent-review receipt.', 'review.receipt');
    }
  }
}

function validateControls(manifest, problems) {
  const controls = manifest.controls;
  if (!isObject(controls) || controls.main_merged !== false || controls.released !== false || controls.release_authorized !== false || manifest.status === 'RELEASE_READY') {
    issue(problems, 'RELEASE_BOUNDARY_IMPERSONATION', 'Evidence must explicitly keep main unmerged, release absent, and release authorization false.', 'controls');
  }
}

function validateOpenAxes(manifest, boundary, problems) {
  const axes = Array.isArray(manifest.open_axes) ? manifest.open_axes : [];
  if (!Array.isArray(manifest.open_axes) || axes.some((item) => typeof item !== 'string') || new Set(axes).size !== axes.length) issue(problems, 'OPEN_AXES_INVALID', 'Open axes must be a unique string list.', 'open_axes');
  const allowed = boundary === 'owner-review' ? FINAL_OPEN_AXES : LOCAL_OPEN_AXES;
  for (const axis of axes) if (!allowed.has(axis)) issue(problems, 'OPEN_AXIS_UNEXPECTED', `Unexpected open axis at ${boundary}: ${axis}`, 'open_axes');
  const required = boundary === 'owner-review'
    ? ['ui_golden_screen', 'owner_acceptance']
    : ['ui_golden_screen', 'ui_visual', 'live_v063', 'remote_matrix', 'independent_review', 'owner_acceptance'];
  for (const axis of required) if (!axes.includes(axis)) issue(problems, 'OPEN_AXIS_MISSING', `Expected open axis is not declared: ${axis}`, 'open_axes');
}

export async function validateStage0Evidence(manifest, { boundary = null, currentIdentity = null } = {}) {
  const problems = [];
  if (!isObject(manifest) || manifest.schema_version !== 1) {
    issue(problems, 'MANIFEST_SCHEMA_INVALID', 'Stage 0 evidence requires schema_version 1.', 'schema_version');
    return { schema_version: 1, ok: false, boundary: boundary ?? 'unknown', status: manifest?.status ?? null, problems };
  }
  const effectiveBoundary = boundary ?? (manifest.status === 'STAGE0_EVIDENCE_READY_FOR_OWNER_REVIEW' ? 'owner-review' : 'exact-package');
  if (!['exact-package', 'owner-review'].includes(effectiveBoundary)) issue(problems, 'BOUNDARY_INVALID', `Unsupported evidence boundary: ${effectiveBoundary}`, 'boundary');
  if (effectiveBoundary === 'owner-review' && manifest.status !== 'STAGE0_EVIDENCE_READY_FOR_OWNER_REVIEW') issue(problems, 'STATUS_INVALID', 'Owner-review evidence must use STAGE0_EVIDENCE_READY_FOR_OWNER_REVIEW.', 'status');
  if (effectiveBoundary === 'exact-package' && manifest.status !== 'LOCAL_STAGE0_READY') issue(problems, 'STATUS_INVALID', 'Exact-package evidence must use LOCAL_STAGE0_READY.', 'status');

  validateCandidate(manifest.candidate, currentIdentity, problems);
  validateControls(manifest, problems);
  validateOpenAxes(manifest, effectiveBoundary, problems);
  if (isObject(manifest.candidate)) {
    await verifyArchive('tgz', manifest.artifacts?.tgz, manifest.candidate, problems);
    await verifyArchive('zip', manifest.artifacts?.zip, manifest.candidate, problems);
    const packageSha256 = manifest.artifacts?.tgz?.sha256;
    if (!isHex(packageSha256, 64) || manifest.artifacts?.tgz?.package_sha256 !== packageSha256
        || manifest.artifacts?.zip?.package_sha256 !== packageSha256) {
      issue(problems, 'ARTIFACT_PACKAGE_IDENTITY_MISMATCH', 'TGZ and source ZIP must bind the same exact package digest.', 'artifacts');
    }
  }
  const runById = await validateRuns(manifest, problems);
  if (effectiveBoundary === 'owner-review') {
    await validateLive(manifest, runById, problems);
    await validateMatrix(manifest, problems);
    await validateReview(manifest, problems);
  }
  return {
    schema_version: 1,
    ok: problems.length === 0,
    boundary: effectiveBoundary,
    status: manifest.status,
    candidate_commit: manifest.candidate?.commit ?? null,
    problems,
  };
}

export function readGitIdentity(repository) {
  const run = (args) => spawnSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true });
  const repositoryResult = run(['rev-parse', '--show-toplevel']);
  const commitResult = run(['rev-parse', 'HEAD']);
  const treeResult = run(['rev-parse', 'HEAD^{tree}']);
  const timeResult = run(['show', '-s', '--format=%cI', 'HEAD']);
  const statusResult = run(['status', '--porcelain=v1']);
  if (repositoryResult.status !== 0 || commitResult.status !== 0 || treeResult.status !== 0 || timeResult.status !== 0 || statusResult.status !== 0) {
    throw new Error(repositoryResult.stderr || commitResult.stderr || treeResult.stderr || timeResult.stderr || statusResult.stderr || 'Git identity is unavailable.');
  }
  return {
    repository: path.resolve(repositoryResult.stdout.trim()),
    commit: commitResult.stdout.trim(),
    tree: treeResult.stdout.trim(),
    committed_at: new Date(timeResult.stdout.trim()).toISOString(),
    clean: statusResult.stdout.trim() === '',
  };
}

function option(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

async function main(argv = process.argv.slice(2)) {
  const manifestPath = path.resolve(option(argv, '--manifest', defaultManifestPath));
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    const report = { schema_version: 1, ok: false, boundary: option(argv, '--boundary', 'unknown'), status: null, candidate_commit: null, problems: [{ code: 'MANIFEST_UNREADABLE', message: error.message, field: 'manifest' }] };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  let currentIdentity;
  try {
    currentIdentity = readGitIdentity(manifest.candidate?.repository ?? packageRoot);
  } catch (error) {
    const report = { schema_version: 1, ok: false, boundary: option(argv, '--boundary', 'unknown'), status: manifest.status ?? null, candidate_commit: manifest.candidate?.commit ?? null, problems: [{ code: 'CANDIDATE_GIT_UNAVAILABLE', message: error.message, field: 'candidate.repository' }] };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  const report = await validateStage0Evidence(manifest, { boundary: option(argv, '--boundary'), currentIdentity });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) await main();
