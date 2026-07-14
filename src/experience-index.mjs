import { lstat } from 'node:fs/promises';
import YAML from 'yaml';
import {
  containsSecretValue,
  isSafeProjectRelativeArtifactPath,
  isSensitiveArtifactPath,
} from './artifact-safety.mjs';
import { rejectSymlinkPath, resolveInside } from './files.mjs';

const EMPTY_ENTRIES = Object.freeze([]);
export const EMPTY_EXPERIENCE_INDEX = Object.freeze({ schema_version: 1, entries: EMPTY_ENTRIES });

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
  return value.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function assertOnlyFields(value, allowed, label) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new Error(`${label} has unexpected field ${field}`);
  }
}

function assertStringArray(entry, field, { allowEmpty = false } = {}) {
  const values = entry[field];
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new Error(`Experience entry ${entry.id ?? 'unknown'} ${field} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  }
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Experience entry ${entry.id ?? 'unknown'} ${field} must contain non-empty strings`);
    }
  }
  return values;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} has duplicated signal ${value}`);
    seen.add(value);
  }
}

function assertNormalizedSignals(entry, values) {
  for (const signal of values) {
    if (normalize(signal) !== signal || !SIGNAL.test(signal)) {
      throw new Error(`Experience entry ${entry.id} has invalid normalized signal: ${signal}`);
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

function assertArtifactMetadata(entry) {
  const artifacts = assertStringArray(entry, 'artifacts');
  const seen = new Set();
  for (const artifact of artifacts) {
    if (artifact.trim() !== artifact) {
      throw new Error(`Experience entry ${entry.id} has an invalid artifact path: ${artifact}`);
    }
    if (seen.has(artifact)) {
      throw new Error(`Experience entry ${entry.id} has duplicated artifact path: ${artifact}`);
    }
    seen.add(artifact);
  }
}

function assertSafeArtifact(entry, artifact) {
  if (!isSafeProjectRelativeArtifactPath(artifact)) {
    throw new Error(`Experience artifact escapes the project or is not a safe project-relative path: ${artifact}`);
  }
  if (isSensitiveArtifactPath(artifact)) {
    throw new Error(`Experience entry ${entry.id} contains a secret-bearing credential path or value`);
  }
}

function assertSchema(value) {
  if (!isMapping(value)) throw new Error('experience index must be a mapping');
  assertOnlyFields(value, TOP_LEVEL_FIELDS, 'Experience index');
  if (value.schema_version !== 1) throw new Error('experience index schema_version must be 1');
  if (!Array.isArray(value.entries)) throw new Error('experience index entries must be an array');

  const ids = new Set();
  for (const entry of value.entries) {
    if (!isMapping(entry)) throw new Error('Experience index entries must be mappings');
    assertOnlyFields(entry, ENTRY_FIELDS, `Experience entry ${entry.id ?? 'unknown'}`);
    for (const field of REQUIRED_ENTRY_FIELDS) {
      if (!Object.hasOwn(entry, field)) {
        throw new Error(`Experience entry ${entry.id ?? 'unknown'} requires field ${field}`);
      }
    }
    if (containsSecretValue(JSON.stringify({ ...entry, artifacts: [] }))) {
      throw new Error(`Experience entry ${entry.id ?? 'unknown'} contains secret-bearing metadata`);
    }
    if (typeof entry.id !== 'string' || normalize(entry.id) !== entry.id || !SIGNAL.test(entry.id)) {
      throw new Error(`Experience entry has invalid normalized id: ${entry.id ?? 'missing'}`);
    }
    if (ids.has(entry.id)) throw new Error(`Experience entry id is duplicated: ${entry.id}`);
    ids.add(entry.id);

    const useWhen = assertStringArray(entry, 'use_when');
    const systems = entry.systems === undefined
      ? []
      : assertStringArray(entry, 'systems', { allowEmpty: true });
    const revalidateWhen = assertStringArray(entry, 'revalidate_when', { allowEmpty: true });
    assertNormalizedSignals(entry, [...useWhen, ...systems, ...revalidateWhen]);
    assertUnique([...useWhen, ...systems], `Experience entry ${entry.id}`);
    assertUnique(revalidateWhen, `Experience entry ${entry.id} revalidate_when`);
    assertArtifactMetadata(entry);

    if (!isRealDate(entry.verified_at)) {
      throw new Error(`Experience entry ${entry.id} has invalid verified_at`);
    }
    if (!ALLOWED_STATUS.has(entry.status)) {
      throw new Error(`Experience entry ${entry.id} has invalid status: ${entry.status}`);
    }
  }
  return value;
}

function canonicalEntry(entry) {
  const canonical = {
    id: entry.id,
    use_when: [...entry.use_when],
  };
  if (entry.systems !== undefined) canonical.systems = [...entry.systems];
  canonical.artifacts = [...entry.artifacts];
  canonical.verified_at = entry.verified_at;
  canonical.revalidate_when = [...entry.revalidate_when];
  canonical.status = entry.status;
  return canonical;
}

async function validateArtifact(root, artifact, { allowMissing = false } = {}) {
  if (!isSafeProjectRelativeArtifactPath(artifact)) {
    throw new Error(`Experience artifact escapes the project or is not a safe project-relative path: ${artifact}`);
  }
  const target = resolveInside(root, artifact);
  await rejectSymlinkPath(root, artifact);
  let metadata;
  try {
    metadata = await lstat(target);
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return false;
    throw new Error(`Experience artifact does not exist: ${artifact}`, { cause: error });
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Experience artifact must be a regular non-linked file: ${artifact}`);
  }
  return true;
}

export function parseExperienceIndex(source) {
  return assertSchema(YAML.parse(source));
}

export function serializeExperienceIndex(value) {
  assertSchema(value);
  for (const entry of value.entries) {
    for (const artifact of entry.artifacts) assertSafeArtifact(entry, artifact);
  }
  return YAML.stringify(
    {
      schema_version: 1,
      entries: value.entries.map(canonicalEntry),
    },
    { lineWidth: 0 },
  );
}

export async function validateExperienceIndex(value, root) {
  assertSchema(value);
  for (const entry of value.entries) {
    for (const artifact of entry.artifacts) {
      assertSafeArtifact(entry, artifact);
      await validateArtifact(root, artifact);
    }
  }
  return value;
}

export async function matchExperience(value, { root, signals = [] }) {
  assertSchema(value);
  if (!Array.isArray(signals) || signals.some((signal) => typeof signal !== 'string')) {
    throw new Error('Experience matching signals must be an array of strings');
  }
  const active = new Set(signals.map(normalize).filter((signal) => SIGNAL.test(signal)));
  const matches = [];
  for (const entry of value.entries) {
    if (!['proven', 'provisional'].includes(entry.status)) continue;
    const matchCount = [...new Set([...entry.use_when, ...(entry.systems ?? [])])]
      .filter((signal) => active.has(signal)).length;
    if (matchCount === 0) continue;

    let artifactsPresent = true;
    for (const artifact of entry.artifacts) {
      if (isSensitiveArtifactPath(artifact) || !isSafeProjectRelativeArtifactPath(artifact)) {
        artifactsPresent = false;
        break;
      }
      try {
        if (!(await validateArtifact(root, artifact, { allowMissing: true }))) {
          artifactsPresent = false;
          break;
        }
      } catch {
        artifactsPresent = false;
        break;
      }
    }
    if (!artifactsPresent) continue;

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
    (a, b) => b.match_count - a.match_count
      || b.verified_at.localeCompare(a.verified_at)
      || a.id.localeCompare(b.id),
  );
}
