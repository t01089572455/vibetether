import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { TRUTH_MARKER } from './constants.mjs';
import { conflictError } from './errors.mjs';
import {
  assertSafeId, boundedText, canonicalJson, hashTree, readRegularFileChunk,
  rejectSymlinkChain, resolveInside, safeRelative, sha256PortableFile, sha256PortableText, sha256Text,
} from './files.mjs';

const TITLES = {
  confirmed: 'Confirmed project truth',
  candidates: 'Candidates awaiting confirmation',
  declined: 'Declined candidates',
};
const TITLE_TO_SECTION = Object.fromEntries(Object.entries(TITLES).map(([key, value]) => [value, key]));
const ENTRY_KEYS = new Set(['id', 'role', 'scope', 'reason', 'source', 'supersedes', 'phases', 'operations', 'directionality']);
const DIRECTORY_LIST_LIMIT = 100;

function clean(value, label) {
  return boundedText(value, 500, `Truth ${label}`);
}
function defaultTruthId(entryPath) {
  return `truth-${sha256Text(entryPath).slice(0, 16)}`;
}
function list(value, { upper = false } = {}) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean).map((item) => upper ? item.toUpperCase() : item.toLowerCase()))];
}
function normalizeEntry(entry) {
  const entryPath = safeRelative(entry.path, 'Truth entry path', { allowDirectory: String(entry.path).endsWith('/') });
  const normalized = {
    id: assertSafeId(entry.id ?? defaultTruthId(entryPath), 'Truth id'),
    path: entryPath,
    role: clean(entry.role, 'role'),
    scope: clean(entry.scope, 'scope'),
    phases: list(entry.phases, { upper: true }),
    operations: list(entry.operations),
    directionality: entry.directionality === 'non-directional' ? 'non-directional' : 'directional',
  };
  for (const field of ['reason', 'source']) if (entry[field]) normalized[field] = clean(entry[field], field);
  if (entry.supersedes) normalized.supersedes = safeRelative(entry.supersedes, 'Truth supersedes path', { allowDirectory: String(entry.supersedes).endsWith('/') });
  return normalized;
}

function assertUnique(map) {
  const paths = new Set();
  const ids = new Set();
  for (const section of Object.keys(TITLES)) {
    for (const entry of map[section]) {
      if (paths.has(entry.path)) throw conflictError(`Truth path appears in more than one state: ${entry.path}`, 'INVALID_TRUTH');
      if (ids.has(entry.id)) throw conflictError(`Truth id appears in more than one state: ${entry.id}`, 'INVALID_TRUTH');
      paths.add(entry.path);
      ids.add(entry.id);
    }
  }
}

export function emptyTruthMap() {
  return { confirmed: [], candidates: [], declined: [] };
}

function renderEntry(entry, checked) {
  const lines = [
    `- [${checked ? 'x' : ' '}] \`${entry.path}\``,
    `  - id: \`${entry.id}\``,
    `  - role: \`${entry.role}\``,
    `  - scope: \`${entry.scope}\``,
    `  - phases: \`${entry.phases.join(',')}\``,
    `  - operations: \`${entry.operations.join(',')}\``,
    `  - directionality: \`${entry.directionality}\``,
  ];
  if (entry.source) lines.push(`  - source: \`${entry.source}\``);
  if (entry.supersedes) lines.push(`  - supersedes: \`${entry.supersedes}\``);
  if (entry.reason) lines.push(`  - reason: ${entry.reason}`);
  return lines.join('\n');
}

export function renderTruthMap(value = emptyTruthMap()) {
  const map = {
    confirmed: (value.confirmed ?? []).map(normalizeEntry),
    candidates: (value.candidates ?? []).map(normalizeEntry),
    declined: (value.declined ?? []).map(normalizeEntry),
  };
  assertUnique(map);
  const section = (key) => `## ${TITLES[key]}\n\n${map[key].length ? map[key].map((entry) => renderEntry(entry, key === 'confirmed')).join('\n\n') : '_None._'}`;
  return [
    '# VibeTether Project Truth Map', '', TRUTH_MARKER, '',
    'Only confirmed entries govern work. Candidates and declined entries are non-authoritative.', '',
    section('confirmed'), '', section('candidates'), '', section('declined'), '',
  ].join('\n');
}

function metadata(line) {
  const match = line.match(/^  - ([a-z_]+):(?: `([^`]*)`|(.*))$/);
  if (!match) return null;
  return [match[1], (match[2] ?? match[3] ?? '').trim()];
}

export function parseTruthMap(source) {
  if (typeof source !== 'string' || !source.includes(TRUTH_MARKER)) throw conflictError('Truth Map marker is missing.', 'INVALID_TRUTH');
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const result = emptyTruthMap();
  let currentSection = null;
  const seenHeadings = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^## (.+)$/);
    if (heading) {
      currentSection = TITLE_TO_SECTION[heading[1]] ?? null;
      if (currentSection) {
        if (seenHeadings.has(currentSection)) throw conflictError(`Truth Map has duplicate section: ${heading[1]}`, 'INVALID_TRUTH');
        seenHeadings.add(currentSection);
      }
      continue;
    }
    const bullet = lines[index].match(/^- \[([ xX])\] `([^`]+)`$/);
    if (!bullet && lines[index].startsWith('- [')) throw conflictError(`Malformed Truth entry at line ${index + 1}.`, 'INVALID_TRUTH');
    if (!bullet) continue;
    if (!currentSection) throw conflictError(`Truth entry is outside a canonical section at line ${index + 1}.`, 'INVALID_TRUTH');
    const checked = bullet[1].toLowerCase() === 'x';
    if (currentSection === 'confirmed' && !checked) throw conflictError(`Confirmed Truth must be checked: ${bullet[2]}`, 'INVALID_TRUTH');
    if (currentSection !== 'confirmed' && checked) throw conflictError(`Non-authoritative Truth must be unchecked: ${bullet[2]}`, 'INVALID_TRUTH');
    const fields = {};
    while (index + 1 < lines.length) {
      const item = metadata(lines[index + 1]);
      if (!item) {
        if (lines[index + 1].startsWith('  - ')) throw conflictError(`Malformed Truth metadata at line ${index + 2}.`, 'INVALID_TRUTH');
        break;
      }
      if (!ENTRY_KEYS.has(item[0])) throw conflictError(`Unsupported Truth metadata: ${item[0]}`, 'INVALID_TRUTH');
      if (Object.hasOwn(fields, item[0])) throw conflictError(`Duplicate Truth metadata: ${item[0]}`, 'INVALID_TRUTH');
      fields[item[0]] = item[1];
      index += 1;
    }
    if (!fields.role || !fields.scope) throw conflictError(`Truth entry requires role and scope: ${bullet[2]}`, 'INVALID_TRUTH');
    result[currentSection].push(normalizeEntry({ path: bullet[2], ...fields }));
  }
  for (const key of Object.keys(TITLES)) if (!seenHeadings.has(key)) throw conflictError(`Truth Map is missing ${TITLES[key]}.`, 'INVALID_TRUTH');
  assertUnique(result);
  return result;
}

export function addTruthCandidate(map, entry) {
  const normalized = normalizeEntry(entry);
  assertUnique(map);
  if ([...map.confirmed, ...map.candidates, ...map.declined].some((item) => item.path === normalized.path || item.id === normalized.id)) {
    throw conflictError(`Truth path or id is already registered: ${normalized.path}`, 'TRUTH_DUPLICATE');
  }
  return { ...map, candidates: [...map.candidates, normalized] };
}

export function confirmTruthCandidate(map, candidatePath) {
  const portable = safeRelative(candidatePath, 'Truth candidate', { allowDirectory: String(candidatePath).endsWith('/') });
  const candidate = map.candidates.find((entry) => entry.path === portable);
  if (!candidate) throw conflictError(`Truth candidate not found: ${portable}`, 'TRUTH_NOT_FOUND');
  let confirmed = [...map.confirmed];
  let declined = [...map.declined];
  if (candidate.supersedes) {
    const old = confirmed.find((entry) => entry.path === candidate.supersedes);
    if (!old) throw conflictError(`Superseded Truth is not confirmed: ${candidate.supersedes}`, 'TRUTH_SUPERSESSION');
    confirmed = confirmed.filter((entry) => entry.path !== old.path);
    declined.push({ ...old, reason: `Superseded by ${candidate.path}.` });
  }
  confirmed.push(candidate);
  return {
    confirmed,
    candidates: map.candidates.filter((entry) => entry.path !== portable),
    declined,
  };
}

export function declineTruthCandidate(map, candidatePath, reason) {
  const portable = safeRelative(candidatePath, 'Truth candidate', { allowDirectory: String(candidatePath).endsWith('/') });
  const candidate = map.candidates.find((entry) => entry.path === portable);
  if (!candidate) throw conflictError(`Truth candidate not found: ${portable}`, 'TRUTH_NOT_FOUND');
  return {
    ...map,
    candidates: map.candidates.filter((entry) => entry.path !== portable),
    declined: [...map.declined, { ...candidate, reason: boundedText(reason, 500, 'Decline reason') }],
  };
}

async function fingerprintAuthorityEntry(root, entry) {
  await rejectSymlinkChain(root, entry.path, { allowMissing: false });
  const target = resolveInside(root, entry.path, 'Confirmed Truth path');
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink()) throw conflictError(`Confirmed Truth is linked: ${entry.path}`, 'UNSAFE_TRUTH');
  if (metadata.isFile()) return { ...entry, kind: 'file', sha256: await sha256PortableFile(target) };
  if (metadata.isDirectory()) return { ...entry, kind: 'directory', sha256: await hashTree(target, { ignore: ['.git', '.vibetether', 'node_modules', 'coverage', 'dist', 'build'], portableText: true }) };
  throw conflictError(`Confirmed Truth is not a regular file or directory: ${entry.path}`, 'UNSAFE_TRUTH');
}

export async function authoritySnapshot(root, map, intentSource) {
  const confirmed = [];
  for (const entry of map.confirmed) confirmed.push(await fingerprintAuthorityEntry(root, entry));
  confirmed.sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
  const confirmed_projection = confirmed.map(({ id, path: entryPath, role, scope, phases, operations, directionality, source, supersedes, kind, sha256 }) => ({ id, path: entryPath, role, scope, phases, operations, directionality, ...(source ? { source } : {}), ...(supersedes ? { supersedes } : {}), kind, sha256 }));
  const confirmed_projection_sha256 = sha256Text(canonicalJson(confirmed_projection));
  const intent_sha256 = sha256PortableText(intentSource);
  return {
    anchored_at: new Date().toISOString(),
    intent_sha256,
    confirmed_projection_sha256,
    confirmed_sources: confirmed,
    authority_digest: sha256Text(canonicalJson({ intent_sha256, confirmed_projection_sha256 })),
  };
}

function findConfirmed(map, identifier) {
  return map.confirmed.find((entry) => entry.id === identifier || entry.path === identifier);
}

async function directoryFiles(root, entry, limit = DIRECTORY_LIST_LIMIT) {
  const base = resolveInside(root, entry.path, 'Truth directory');
  const files = [];
  let total = 0;
  async function walk(directory, prefix = '') {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relative = prefix ? `${prefix}/${child.name}` : child.name;
      const target = path.join(directory, child.name);
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink()) throw conflictError(`Directory Truth contains a symbolic link: ${relative}`, 'UNSAFE_TRUTH');
      if (metadata.isDirectory()) await walk(target, relative);
      else if (metadata.isFile()) {
        total += 1;
        if (files.length < limit) files.push(relative);
      } else throw conflictError(`Directory Truth contains an unsupported file: ${relative}`, 'UNSAFE_TRUTH');
    }
  }
  await walk(base);
  return { files, total };
}

export async function readTruthArtifact(root, map, identifier, options = {}) {
  const entry = findConfirmed(map, identifier);
  if (!entry) throw conflictError('Truth handle is unknown.', 'TRUTH_NOT_FOUND');
  if (entry.path.endsWith('/')) {
    if (options.subpath) {
      const subpath = safeRelative(options.subpath, 'Directory Truth file');
      const relative = `${entry.path}${subpath}`;
      const target = resolveInside(root, relative, 'Truth artifact');
      await rejectSymlinkChain(root, relative, { allowMissing: false });
      return { id: entry.id, path: relative, role: entry.role, scope: entry.scope, ...await readRegularFileChunk(target, options) };
    }
    const listing = await directoryFiles(root, entry, options.file_limit ?? DIRECTORY_LIST_LIMIT);
    return {
      id: entry.id,
      path: entry.path,
      role: entry.role,
      scope: entry.scope,
      kind: 'directory',
      total_files: listing.total,
      returned_files: listing.files.length,
      omitted_files: Math.max(0, listing.total - listing.files.length),
      files: listing.files.map((relative) => ({
        path: relative,
        handle: `truth:${entry.id}:file:${Buffer.from(relative, 'utf8').toString('base64url')}`,
      })),
    };
  }
  const target = resolveInside(root, entry.path, 'Truth artifact');
  await rejectSymlinkChain(root, entry.path, { allowMissing: false });
  return { id: entry.id, path: entry.path, role: entry.role, scope: entry.scope, ...await readRegularFileChunk(target, options) };
}
