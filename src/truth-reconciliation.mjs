const DECISIONS = new Set([
  'no_material_change',
  'candidate_pending',
  'applied',
  'declined',
]);

export function normalizeTruthDecision(value) {
  const normalized = String(value ?? '').trim().replaceAll('-', '_');
  if (!DECISIONS.has(normalized)) {
    throw new Error('Truth reconciliation decision must be no-material-change, candidate-pending, applied, or declined.');
  }
  return normalized;
}

export function authoritySnapshotEvidence(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return {
    intent: snapshot.intent ?? null,
    truth_index: snapshot.truth_index ?? null,
    confirmed_projection_sha256: snapshot.confirmed_projection_sha256 ?? null,
    confirmed_sources: snapshot.confirmed_sources ?? null,
  };
}

export function authoritySnapshotsMatch(left, right) {
  return JSON.stringify(authoritySnapshotEvidence(left)) === JSON.stringify(authoritySnapshotEvidence(right));
}

function confirmedAuthorityEvidence(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return {
    intent: snapshot.intent ?? null,
    confirmed_projection_sha256: snapshot.confirmed_projection_sha256 ?? null,
    confirmed_sources: snapshot.confirmed_sources ?? null,
  };
}

export function confirmedAuthorityMatches(left, right) {
  return JSON.stringify(confirmedAuthorityEvidence(left))
    === JSON.stringify(confirmedAuthorityEvidence(right));
}

function normalizedPath(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function sourceMap(snapshot) {
  if (!Array.isArray(snapshot?.confirmed_sources)) return null;
  const entries = new Map();
  for (const source of snapshot.confirmed_sources) {
    const sourcePath = normalizedPath(source?.path);
    if (!sourcePath || entries.has(sourcePath)) return null;
    entries.set(sourcePath, source);
  }
  return entries;
}

export function confirmedAuthorityChangeIsLimitedToPath(before, after, allowedPath) {
  if ((before?.intent ?? null) && JSON.stringify(before.intent) !== JSON.stringify(after?.intent ?? null)) {
    return false;
  }
  if (!(before?.intent ?? null) && (after?.intent ?? null)) return false;
  const allowed = normalizedPath(allowedPath);
  const beforeSources = sourceMap(before);
  const afterSources = sourceMap(after);
  if (!allowed || !beforeSources || !afterSources || !afterSources.has(allowed)) return false;
  const beforeUnaffectedOrder = [...beforeSources.keys()].filter((sourcePath) => sourcePath !== allowed);
  const afterUnaffectedOrder = [...afterSources.keys()].filter((sourcePath) => sourcePath !== allowed);
  if (JSON.stringify(beforeUnaffectedOrder) !== JSON.stringify(afterUnaffectedOrder)) return false;
  const allPaths = new Set([...beforeSources.keys(), ...afterSources.keys()]);
  for (const sourcePath of allPaths) {
    if (sourcePath === allowed) continue;
    if (JSON.stringify(beforeSources.get(sourcePath) ?? null)
        !== JSON.stringify(afterSources.get(sourcePath) ?? null)) {
      return false;
    }
  }
  return true;
}

export function truthSectionForDecision(decision) {
  if (decision === 'candidate_pending') return 'candidates';
  if (decision === 'applied') return 'confirmed';
  if (decision === 'declined') return 'declined';
  return null;
}
