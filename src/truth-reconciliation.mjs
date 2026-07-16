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

export function truthSectionForDecision(decision) {
  if (decision === 'candidate_pending') return 'candidates';
  if (decision === 'applied') return 'confirmed';
  if (decision === 'declined') return 'declined';
  return null;
}
