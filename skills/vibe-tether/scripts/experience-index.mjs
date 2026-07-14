import { lstat } from 'node:fs/promises';
import path from 'node:path';
import {
  containsSecretValue,
  isSafeProjectRelativeArtifactPath,
  isSensitiveArtifactPath,
} from './artifact-safety.mjs';

const TOP_LEVEL_FIELDS = new Set(['schema_version', 'entries']);
const ENTRY_FIELDS = new Set([
  'id',
  'use_when',
  'systems',
  'artifacts',
  'verified_at',
  'revalidate_when',
  'status',
]);
const LIST_FIELDS = new Set(['use_when', 'systems', 'artifacts', 'revalidate_when']);
const SCALAR_FIELDS = new Set(['id', 'verified_at', 'status']);
const REQUIRED_ENTRY_FIELDS = [
  'id',
  'use_when',
  'artifacts',
  'verified_at',
  'revalidate_when',
  'status',
];
const ALLOWED_STATUS = new Set(['proven', 'provisional', 'obsolete']);
const SIGNAL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isMapping(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalize(value) {
  return String(value).trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function containsObviousSecret(value, seen = new Set()) {
  if (typeof value === 'string') return containsSecretValue(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (containsSecretValue(key) || containsObviousSecret(child, seen)) return true;
  }
  return false;
}

function assertNoObviousSecret(value) {
  if (containsObviousSecret(value)) throw new Error('Experience index contains secret-bearing metadata');
}

function scalar(source) {
  assertNoObviousSecret(source);
  const value = source.trim();
  if (!value) throw new Error('Experience index scalar must not be empty');
  if (value.startsWith('"')) {
    if (!value.endsWith('"')) throw new Error('Malformed quoted experience scalar');
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error('Malformed quoted experience scalar', { cause: error });
    }
    if (typeof parsed !== 'string') throw new Error('Experience scalar must be a string');
    return parsed;
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || /(^|[^'])'(?:[^']|'')*$/.test(value.slice(1, -1))) {
      throw new Error('Malformed quoted experience scalar');
    }
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (/^(?:null|true|false|~|[-+]?\d+(?:\.\d+)?)$/i.test(value)
      || /^(?:[-?:](?:$|\s)|[%&*!|>@`\[\]{},#])/.test(value)
      || /:\s|\s#/.test(value)) {
    throw new Error('Unsupported unquoted experience scalar');
  }
  return value;
}

function assertOnlyFields(value, allowed, label) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new Error(`${label} has an unexpected field`);
  }
}

function assertStringArray(entry, field, { allowEmpty = false } = {}) {
  const values = entry[field];
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new Error(`Experience entry ${field} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  }
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Experience entry ${field} must contain non-empty strings`);
    }
  }
  return values;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} has a duplicated signal`);
    seen.add(value);
  }
}

function assertNormalizedSignals(entry, values) {
  for (const signal of values) {
    if (normalize(signal) !== signal || !SIGNAL.test(signal)) {
      throw new Error('Experience entry has an invalid normalized signal');
    }
  }
}

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

export function assertExperienceIndex(value) {
  assertNoObviousSecret(value);
  if (!isMapping(value)) throw new Error('experience index must be a mapping');
  assertOnlyFields(value, TOP_LEVEL_FIELDS, 'Experience index');
  if (value.schema_version !== 1) throw new Error('experience index schema_version must be 1');
  if (!Array.isArray(value.entries)) throw new Error('experience index entries must be an array');

  const ids = new Set();
  for (const entry of value.entries) {
    if (!isMapping(entry)) throw new Error('Experience index entries must be mappings');
    assertOnlyFields(entry, ENTRY_FIELDS, 'Experience entry');
    for (const field of REQUIRED_ENTRY_FIELDS) {
      if (!Object.hasOwn(entry, field)) {
        throw new Error(`Experience entry requires field ${field}`);
      }
    }
    if (typeof entry.id !== 'string' || normalize(entry.id) !== entry.id || !SIGNAL.test(entry.id)) {
      throw new Error('Experience entry has an invalid normalized id');
    }
    if (ids.has(entry.id)) throw new Error('Experience entry id is duplicated');
    ids.add(entry.id);

    const useWhen = assertStringArray(entry, 'use_when');
    const systems = entry.systems === undefined
      ? []
      : assertStringArray(entry, 'systems', { allowEmpty: true });
    const revalidateWhen = assertStringArray(entry, 'revalidate_when', { allowEmpty: true });
    assertNormalizedSignals(entry, [...useWhen, ...systems, ...revalidateWhen]);
    assertUnique([...useWhen, ...systems], `Experience entry ${entry.id}`);
    assertUnique(revalidateWhen, `Experience entry ${entry.id} revalidate_when`);
    const artifacts = assertStringArray(entry, 'artifacts');
    const artifactSet = new Set();
    for (const artifact of artifacts) {
      if (artifact.trim() !== artifact) {
        throw new Error('Experience entry has an invalid artifact path');
      }
      if (artifactSet.has(artifact)) {
        throw new Error('Experience entry has a duplicated artifact path');
      }
      artifactSet.add(artifact);
    }
    if (!isRealDate(entry.verified_at)) {
      throw new Error('Experience entry has invalid verified_at');
    }
    if (!ALLOWED_STATUS.has(entry.status)) {
      throw new Error('Experience entry has invalid status');
    }
  }
  return value;
}

export function parseExperienceIndex(source) {
  if (typeof source !== 'string') throw new Error('Experience index source must be text');
  assertNoObviousSecret(source);
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (normalized.includes('\r') || normalized.includes('\t')) {
    throw new Error('Unsupported experience index whitespace');
  }
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0 || lines.some((line) => line.trim() === '' || line.trimStart().startsWith('#'))) {
    throw new Error('Unsupported experience index shape: blank lines and comments are not canonical');
  }

  const index = {};
  let entriesDeclared = false;
  let current = null;
  let listKey = null;
  for (const line of lines) {
    let match;
    if ((match = line.match(/^schema_version:\s*(\d+)$/))) {
      if (Object.hasOwn(index, 'schema_version')) throw new Error('Experience index has duplicate schema_version');
      index.schema_version = Number(match[1]);
      listKey = null;
      continue;
    }
    if (line === 'entries: []') {
      if (entriesDeclared) throw new Error('Experience index has duplicate entries');
      index.entries = [];
      entriesDeclared = true;
      listKey = null;
      continue;
    }
    if (line === 'entries:') {
      if (entriesDeclared) throw new Error('Experience index has duplicate entries');
      index.entries = [];
      entriesDeclared = true;
      listKey = null;
      continue;
    }
    if ((match = line.match(/^  - id:\s*(.+)$/))) {
      if (!entriesDeclared || !Array.isArray(index.entries)) {
        throw new Error('Experience entries require a preceding entries field');
      }
      current = { id: scalar(match[1]) };
      index.entries.push(current);
      listKey = null;
      continue;
    }
    if ((match = line.match(/^    ([a-z_]+):\s*(.*)$/))) {
      if (!current) throw new Error('Invalid experience index field placement');
      const field = match[1];
      const value = match[2];
      if (!ENTRY_FIELDS.has(field)) throw new Error('Experience entry has an unexpected field');
      if (Object.hasOwn(current, field)) throw new Error('Experience entry has a duplicate field');
      if (SCALAR_FIELDS.has(field)) {
        if (!value) throw new Error(`Experience entry ${field} requires a scalar`);
        current[field] = scalar(value);
        listKey = null;
        continue;
      }
      if (!LIST_FIELDS.has(field)) throw new Error('Unsupported experience index field');
      if (value === '[]') {
        current[field] = [];
        listKey = null;
        continue;
      }
      if (value !== '') throw new Error('Unsupported experience index list shape');
      current[field] = [];
      listKey = field;
      continue;
    }
    if ((match = line.match(/^      -\s+(.+)$/)) && current && listKey) {
      current[listKey].push(scalar(match[1]));
      continue;
    }
    throw new Error('Unsupported experience index shape');
  }
  return assertExperienceIndex(index);
}

async function safeRegularArtifact(root, artifact) {
  if (!isSafeProjectRelativeArtifactPath(artifact) || isSensitiveArtifactPath(artifact)) return false;
  const target = path.resolve(root, artifact);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  if (!relative) {
    const metadata = await lstat(target);
    return metadata.isFile() && !metadata.isSymbolicLink();
  }
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
    if (metadata.isSymbolicLink()) return false;
    if (current === target && !metadata.isFile()) return false;
  }
  return true;
}

export async function matchExperience(value, { root, signals = [] }) {
  assertExperienceIndex(value);
  if (!Array.isArray(signals) || signals.some((signal) => typeof signal !== 'string')) {
    throw new Error('Experience matching signals must be an array of strings');
  }
  const active = new Set(signals.map(normalize).filter((signal) => SIGNAL.test(signal)));
  const matches = [];
  for (const entry of value.entries) {
    if (!['proven', 'provisional'].includes(entry.status)) continue;
    const candidates = [...new Set([...entry.use_when, ...(entry.systems ?? [])])];
    const matchCount = candidates.filter((signal) => active.has(signal)).length;
    if (matchCount === 0) continue;

    let safe = true;
    for (const artifact of entry.artifacts) {
      let artifactSafe = false;
      try {
        artifactSafe = await safeRegularArtifact(root, artifact);
      } catch {
        // Matching is advisory: unreadable artifacts are unavailable, never followed or returned.
      }
      if (!artifactSafe) {
        safe = false;
        break;
      }
    }
    if (!safe) continue;

    const revalidation = entry.revalidate_when.filter((signal) => active.has(signal));
    matches.push({
      id: entry.id,
      status: entry.status,
      match_count: matchCount,
      artifacts: [...entry.artifacts],
      verified_at: entry.verified_at,
      requires_revalidation: entry.status === 'provisional' || revalidation.length > 0,
      revalidation_reasons: [
        ...(entry.status === 'provisional' ? ['provisional'] : []),
        ...revalidation,
      ],
    });
  }
  return matches.sort(
    (left, right) => right.match_count - left.match_count
      || right.verified_at.localeCompare(left.verified_at)
      || left.id.localeCompare(right.id),
  );
}
