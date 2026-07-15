import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { isSafeProjectRelativeArtifactPath, isSensitiveArtifactPath } from './artifact-safety.mjs';
import { rejectSymlinkPath, resolveInside } from './files.mjs';
import { parseTruthMap } from './truth-map.mjs';

function sha256(parts) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

function portable(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

async function fingerprintNode(root, target, relativePath) {
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink()) throw new Error('Authority paths must not be linked');
  if (metadata.isFile()) {
    return sha256([`file:${relativePath}\n`, await readFile(target)]);
  }
  if (!metadata.isDirectory()) throw new Error('Authority paths must be regular files or directories');
  const children = (await readdir(target, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
  const parts = [`directory:${relativePath}/\n`];
  for (const child of children) {
    const childRelative = relativePath ? `${relativePath}/${child.name}` : child.name;
    const childTarget = path.join(target, child.name);
    parts.push(`${child.name}:${await fingerprintNode(root, childTarget, childRelative)}\n`);
  }
  return sha256(parts);
}

export async function fingerprintAuthorityPath(root, relativePath) {
  const normalized = portable(relativePath);
  if (!normalized
      || !isSafeProjectRelativeArtifactPath(normalized)
      || isSensitiveArtifactPath(normalized)) {
    throw new Error('Authority path must be a safe non-sensitive project-relative path');
  }
  await rejectSymlinkPath(root, normalized);
  const target = resolveInside(root, normalized);
  const metadata = await lstat(target);
  return {
    path: normalized,
    kind: metadata.isDirectory() ? 'directory' : 'file',
    sha256: await fingerprintNode(root, target, normalized),
  };
}

export async function createAuthoritySnapshot(root, manifest, anchoredAt = new Date().toISOString()) {
  const truthPath = manifest.truth_index;
  if (typeof truthPath !== 'string' || !truthPath.trim()) throw new Error('Manifest truth_index is required');
  const truthFingerprint = await fingerprintAuthorityPath(root, truthPath);
  const truth = parseTruthMap(await readFile(resolveInside(root, truthPath), 'utf8'));
  const confirmedSources = [];
  for (const entry of truth.confirmed) {
    confirmedSources.push({
      ...(await fingerprintAuthorityPath(root, entry.path)),
      role: entry.role,
      scope: entry.scope,
    });
  }
  let intent = null;
  if (typeof manifest.intent_contract === 'string' && manifest.intent_contract.trim()) {
    intent = await fingerprintAuthorityPath(root, manifest.intent_contract);
  }
  return {
    anchored_at: anchoredAt,
    intent,
    truth_index: truthFingerprint,
    confirmed_sources: confirmedSources,
  };
}
