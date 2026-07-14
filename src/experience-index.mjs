import { lstat } from 'node:fs/promises';
import YAML from 'yaml';
import {
  isSafeProjectRelativeArtifactPath,
  isSensitiveArtifactPath,
} from './artifact-safety.mjs';
import { rejectSymlinkPath, resolveInside } from './files.mjs';
import {
  assertExperienceIndex as assertInstalledExperienceIndex,
  matchExperience as matchInstalledExperience,
  parseExperienceIndex as parseInstalledExperienceIndex,
} from '../skills/vibe-tether/scripts/experience-index.mjs';

const EMPTY_ENTRIES = Object.freeze([]);
export const EMPTY_EXPERIENCE_INDEX = Object.freeze({ schema_version: 1, entries: EMPTY_ENTRIES });

function assertSafeArtifact(artifact) {
  if (!isSafeProjectRelativeArtifactPath(artifact)) {
    throw new Error('Experience artifact is not a safe project-relative path');
  }
  if (isSensitiveArtifactPath(artifact)) {
    throw new Error('Experience entry contains a secret-bearing credential path or value');
  }
}

function assertSchema(value) {
  return assertInstalledExperienceIndex(value);
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
    throw new Error('Experience artifact is not a safe project-relative path');
  }
  const target = resolveInside(root, artifact);
  await rejectSymlinkPath(root, artifact);
  let metadata;
  try {
    metadata = await lstat(target);
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return false;
    throw new Error('Experience artifact does not exist', { cause: error });
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error('Experience artifact must be a regular non-linked file');
  }
  return true;
}

export function parseExperienceIndex(source) {
  return parseInstalledExperienceIndex(source);
}

export function serializeExperienceIndex(value) {
  assertSchema(value);
  for (const entry of value.entries) {
    for (const artifact of entry.artifacts) assertSafeArtifact(artifact);
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
      assertSafeArtifact(artifact);
      await validateArtifact(root, artifact);
    }
  }
  return value;
}

export async function matchExperience(value, { root, signals = [] }) {
  assertSchema(value);
  return matchInstalledExperience(value, { root, signals });
}
