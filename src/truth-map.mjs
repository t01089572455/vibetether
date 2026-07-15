import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { isSensitiveArtifactPath } from './artifact-safety.mjs';

export const TRUTH_INDEX_PATH = '.vibetether/TRUTH.md';
export const TRUTH_MAP_OWNERSHIP_MARKER = '<!-- vibetether:truth-map-v1 -->';

const SECTION_NAMES = Object.freeze({
  'Host bootstrap': 'hosts',
  'Control-plane pointers': 'control',
  'Confirmed project truth': 'confirmed',
  'Candidates awaiting confirmation': 'candidates',
  'Declined candidates': 'declined',
});

const CONTROL_POINTERS = Object.freeze([
  { path: '.vibetether/intent.md', role: 'intent-contract', scope: '.' },
  { path: '.vibetether/project.yaml', role: 'control-plane-manifest', scope: '.' },
  { path: '.vibetether/capabilities.yaml', role: 'capability-board', scope: '.' },
  { path: '.vibetether/state/current.yaml', role: 'runtime-checkpoint', scope: '.' },
  { path: '.vibetether/experience-index.yaml', role: 'experience-catalog', scope: '.' },
]);

const INFRASTRUCTURE_PATHS = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  '.vibetether/intent.md',
  '.vibetether/project.yaml',
  '.vibetether/capabilities.yaml',
  '.vibetether/state/current.yaml',
  '.vibetether/experience-index.yaml',
]);

function normalizeProjectPath(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Truth entry path must be project-relative text');
  const candidate = value.trim();
  if (candidate.includes('\\') || path.posix.isAbsolute(candidate) || /^[A-Za-z]:/.test(candidate)) {
    throw new Error(`Truth entry path must be a portable project-relative path: ${candidate}`);
  }
  const directory = candidate.endsWith('/');
  const normalized = path.posix.normalize(candidate.replace(/^\.\//, ''));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Truth entry path is unsafe or outside the project: ${candidate}`);
  }
  const portable = directory ? `${normalized.replace(/\/+$/, '')}/` : normalized;
  if (isSensitiveArtifactPath(portable)) {
    throw new Error(`Truth entry path is sensitive or unsafe: ${candidate}`);
  }
  return portable;
}

function normalizeEntry(entry, fallback = {}) {
  const pathValue = normalizeProjectPath(entry?.path);
  const role = String(entry?.role ?? fallback.role ?? '').trim();
  const scope = String(entry?.scope ?? fallback.scope ?? '').trim();
  if (!role || !scope) throw new Error(`Truth entry role and scope are required: ${pathValue}`);
  return {
    path: pathValue,
    role,
    scope,
    ...(entry?.source ? { source: String(entry.source).trim() } : {}),
    ...(entry?.reason ? { reason: String(entry.reason).trim() } : {}),
  };
}

function assertUnique(entries) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new Error(`Duplicate truth entry path: ${entry.path}`);
    seen.add(entry.path);
  }
}

function renderEntry(entry, checked) {
  const lines = [
    `- [${checked ? 'x' : ' '}] \`${entry.path}\``,
    `  - role: \`${entry.role}\``,
    `  - scope: \`${entry.scope}\``,
  ];
  if (entry.source) lines.push(`  - source: \`${entry.source}\``);
  if (entry.reason) lines.push(`  - reason: ${entry.reason}`);
  return lines.join('\n');
}

function renderSection(title, entries, checked) {
  const body = entries.length === 0
    ? '_None._'
    : entries.map((entry) => renderEntry(entry, checked)).join('\n\n');
  return `## ${title}\n\n${body}`;
}

export function createTruthMap({ harnesses = [], confirmed = [], candidates = [], declined = [] } = {}) {
  const hosts = [...new Set(harnesses)].map((harness) => normalizeEntry({
    path: harness === 'claude' ? 'CLAUDE.md' : 'AGENTS.md',
    role: 'host-governance',
    scope: '.',
  }));
  const normalizedConfirmed = confirmed.map((entry) => normalizeEntry(entry));
  const normalizedCandidates = candidates.map((entry) => normalizeEntry(entry));
  const normalizedDeclined = declined.map((entry) => normalizeEntry(entry));
  assertUnique([...hosts, ...CONTROL_POINTERS, ...normalizedConfirmed, ...normalizedCandidates, ...normalizedDeclined]);

  return [
    '# VibeTether Project Truth Map',
    '',
    TRUTH_MAP_OWNERSHIP_MARKER,
    '',
    'This project owns this file. VibeTether never silently activates project documents.',
    'Unconfirmed candidates do not guide implementation.',
    '',
    renderSection('Host bootstrap', hosts, true),
    '',
    renderSection('Control-plane pointers', CONTROL_POINTERS, true),
    '',
    renderSection('Confirmed project truth', normalizedConfirmed, true),
    '',
    renderSection('Candidates awaiting confirmation', normalizedCandidates, false),
    '',
    renderSection('Declined candidates', normalizedDeclined, false),
    '',
  ].join('\n');
}

function parseMetadata(line) {
  const match = line.match(/^  - ([a-z_]+):(?: `([^`]*)`|(.*))$/);
  if (!match) return null;
  return [match[1], (match[2] ?? match[3] ?? '').trim()];
}

export function parseTruthMap(source) {
  if (typeof source !== 'string') throw new Error('Truth map must be text');
  const result = { source, hosts: [], control: [], confirmed: [], candidates: [], declined: [] };
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let section = null;
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^## (.+)$/);
    if (heading) {
      section = SECTION_NAMES[heading[1]] ?? null;
      continue;
    }
    const bullet = lines[index].match(/^- \[([ xX])\] `([^`]+)`$/);
    if (!bullet && lines[index].startsWith('- [')) {
      throw new Error(`Malformed truth entry at line ${index + 1}`);
    }
    if (!bullet) continue;
    if (!section) throw new Error(`Truth entry appears outside a canonical section at line ${index + 1}`);
    const metadata = {};
    while (index + 1 < lines.length) {
      const parsed = parseMetadata(lines[index + 1]);
      if (!parsed) {
        if (lines[index + 1].startsWith('  - ')) {
          throw new Error(`Malformed truth entry metadata at line ${index + 2}`);
        }
        break;
      }
      metadata[parsed[0]] = parsed[1];
      index += 1;
    }
    const checked = bullet[1].toLowerCase() === 'x';
    if ((section === 'confirmed' || section === 'hosts' || section === 'control') && !checked) {
      throw new Error(`Active truth entry must be checked: ${bullet[2]}`);
    }
    if ((section === 'candidates' || section === 'declined') && checked) {
      throw new Error(`Non-authoritative truth entry must be unchecked: ${bullet[2]}`);
    }
    if (!metadata.role) throw new Error(`Truth entry role is required: ${bullet[2]}`);
    if (!metadata.scope) throw new Error(`Truth entry scope is required: ${bullet[2]}`);
    result[section].push(normalizeEntry({ path: bullet[2], ...metadata }));
  }
  for (const required of Object.values(SECTION_NAMES)) {
    if (!lines.some((line) => line === `## ${Object.keys(SECTION_NAMES).find((key) => SECTION_NAMES[key] === required)}`)) {
      throw new Error(`Truth map is missing the canonical ${required} section`);
    }
  }
  assertUnique([...result.hosts, ...result.control, ...result.confirmed, ...result.candidates, ...result.declined]);
  return result;
}

function collectLegacySources(value, role = 'reference', output = []) {
  if (typeof value === 'string') {
    output.push({ path: value, role });
  } else if (Array.isArray(value)) {
    for (const item of value) collectLegacySources(item, role, output);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectLegacySources(item, key, output);
  }
  return output;
}

export function legacyManifestEntries(manifest) {
  const entries = [];
  const seen = new Set();
  for (const candidate of collectLegacySources(manifest?.sources)) {
    const normalized = normalizeEntry({
      ...candidate,
      scope: '.',
      source: 'legacy-manifest-migration',
    });
    if (INFRASTRUCTURE_PATHS.has(normalized.path) || seen.has(normalized.path)) continue;
    seen.add(normalized.path);
    entries.push(normalized);
  }
  return entries;
}

async function safePathStatus(root, relativePath) {
  const portable = relativePath.replace(/\/$/, '');
  const target = path.resolve(root, ...portable.split('/'));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return 'escape';
  let current = root;
  try {
    for (const part of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) return 'linked';
    }
    return 'ok';
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    return 'unsafe';
  }
}

export async function validateConfirmedTruth(root, parsed) {
  const issues = [];
  for (const entry of parsed.confirmed) {
    const status = await safePathStatus(root, entry.path);
    if (status !== 'ok') {
      issues.push({
        code: status === 'missing' ? 'missing-confirmed-truth' : 'unsafe-confirmed-truth',
        path: entry.path,
        status,
      });
    }
  }
  return issues;
}
