import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { rejectSymlinkPath, resolveInside } from './files.mjs';
import { validateProviderLock } from './managed-project-state.mjs';
import { skillFingerprint } from './skill-install.mjs';

function portablePath(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function evidenceFor(source) {
  return source.license_evidence ?? {
    mode: 'full-text',
    path: source.license_path,
  };
}

function sourceMetadataMatches(source, lockedSource) {
  if (!lockedSource
      || lockedSource.id !== source.id
      || lockedSource.repository !== source.repository
      || lockedSource.ref !== source.ref
      || String(lockedSource.commit).toLowerCase() !== String(source.commit).toLowerCase()
      || lockedSource.license !== source.license
      || lockedSource.license_path !== source.license_path) return false;

  const desiredEvidence = evidenceFor(source);
  const lockedEvidence = evidenceFor(lockedSource);
  if (lockedEvidence.mode !== desiredEvidence.mode || lockedEvidence.path !== desiredEvidence.path) return false;
  if (desiredEvidence.mode === 'readme-declaration') {
    return lockedEvidence.declaration === desiredEvidence.declaration
      && lockedEvidence.sha256 === desiredEvidence.sha256;
  }
  return true;
}

async function verifiedLicense(root, source, lockedSource) {
  const desiredEvidence = evidenceFor(source);
  if (desiredEvidence.mode === 'readme-declaration') {
    return {
      license_evidence: { ...lockedSource.license_evidence },
    };
  }

  const relativePath = `.vibetether/licenses/${source.id}.LICENSE.txt`;
  if (portablePath(lockedSource.license_installation?.path) !== relativePath
      || !/^[a-f0-9]{64}$/.test(lockedSource.license_sha256 ?? '')) return null;
  try {
    await rejectSymlinkPath(root, relativePath);
    const target = resolveInside(root, relativePath);
    const entry = await lstat(target);
    if (!entry.isFile() || entry.isSymbolicLink()) return null;
    const bytes = await readFile(target);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== lockedSource.license_sha256) return null;
    return {
      license_evidence: {
        ...desiredEvidence,
        sha256: actual,
      },
      license_content: bytes.toString('utf8'),
      license_sha256: actual,
    };
  } catch {
    return null;
  }
}

async function verifiedSource(root, source, lock) {
  const lockedSource = lock.sources.find((entry) => entry.id === source.id);
  if (!sourceMetadataMatches(source, lockedSource)) return null;
  const license = await verifiedLicense(root, source, lockedSource);
  if (!license) return null;

  const skills = [];
  for (const skill of source.skills) {
    const catalog = lock.catalog.find((entry) => entry.id === skill.id);
    const relativePath = `.vibetether/providers/catalog/${source.id}/${skill.install_name}`;
    if (!catalog
        || catalog.source_id !== source.id
        || catalog.install_name !== skill.install_name
        || catalog.fingerprint !== skill.fingerprint
        || portablePath(catalog.installation?.path) !== relativePath) return null;
    try {
      await rejectSymlinkPath(root, relativePath);
      const sourcePath = resolveInside(root, relativePath);
      if (await skillFingerprint(sourcePath) !== skill.fingerprint) return null;
      skills.push({
        ...skill,
        source_id: source.id,
        repository: source.repository,
        ref: source.ref,
        commit: source.commit,
        license: source.license,
        source_path: sourcePath,
      });
    } catch {
      return null;
    }
  }

  return {
    repository: {
      source_id: source.id,
      repository: source.repository,
      ref: source.ref,
      commit: source.commit,
      license: source.license,
      ...license,
    },
    skills,
    warnings: evidenceFor(source).mode === 'readme-declaration'
      ? [`${source.id} declares ${source.license} in ${evidenceFor(source).path}; complete license text is not present upstream.`]
      : [],
  };
}

export async function resolveLocalProviderStage(root, sources, existingLock) {
  const lock = validateProviderLock(existingLock);
  if (!lock || existingLock.schema_version !== 2) {
    return { repositories: [], skills: [], warnings: [], unresolved: [...sources] };
  }

  const repositories = [];
  const skills = [];
  const warnings = [];
  const unresolved = [];
  for (const source of sources) {
    const resolved = await verifiedSource(root, source, lock);
    if (!resolved) {
      unresolved.push(source);
      continue;
    }
    repositories.push(resolved.repository);
    skills.push(...resolved.skills);
    warnings.push(...resolved.warnings);
  }
  return { repositories, skills, warnings, unresolved };
}

export function mergeProviderStages(local, remote) {
  return {
    repositories: [...local.repositories, ...(remote?.repositories ?? [])],
    skills: [...local.skills, ...(remote?.skills ?? [])],
    warnings: [...local.warnings, ...(remote?.warnings ?? [])],
    cleanup: remote?.cleanup ? () => remote.cleanup() : async () => {},
  };
}
