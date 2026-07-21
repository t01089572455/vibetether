import { readFile } from 'node:fs/promises';
import {
  atomicJson, canonicalJson, normalizePortableText, readJsonFile, resolveInside, sha256Text,
  transactionalWrites,
} from './files.mjs';
import { conflictError } from './errors.mjs';
import { outcomeRegistryDigest, validateOutcomeRegistry } from './outcomes.mjs';

const PROGRESS_STATES = new Set(['open', 'in-progress', 'satisfied', 'stale', 'blocked']);
const COMPLETION_LABELS = new Set(['NOT_STARTED', 'SLICE_GREEN', 'GOAL_ENGINEERING_CLOSED', 'RELEASE_READY']);
const PROGRESS_KEYS = new Set([
  'schema_version', 'project_id', 'worktree_id', 'goal_id', 'goal_revision_digest',
  'registry_digest', 'generation', 'precise_completion_label', 'updated_at', 'outcomes',
]);
const ENTRY_KEYS = new Set([
  'outcome_revision_digest', 'state', 'satisfied_acceptance_ids', 'route_ids', 'evidence_ids',
  'last_verified_snapshot', 'missing_acceptance_ids',
]);

function only(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw conflictError(`${label} contains unsupported field: ${key}`, 'INVALID_OUTCOME_PROGRESS');
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values) || values.some((item) => typeof item !== 'string' || !item)) throw conflictError(`${label} is invalid.`, 'INVALID_OUTCOME_PROGRESS');
  if (new Set(values).size !== values.length) throw conflictError(`${label} contains duplicates.`, 'INVALID_OUTCOME_PROGRESS');
  return values;
}

function initialEntry(outcome) {
  return {
    outcome_revision_digest: outcome.revision_digest,
    state: 'open',
    satisfied_acceptance_ids: [],
    route_ids: [],
    evidence_ids: [],
    last_verified_snapshot: null,
    missing_acceptance_ids: outcome.acceptance.map((item) => item.id),
  };
}

export function initialOutcomeProgress(paths, registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  return {
    schema_version: 1,
    project_id: paths.project_id,
    worktree_id: paths.worktree_id,
    goal_id: registry.goal_id,
    goal_revision_digest: registry.goal_revision_digest,
    registry_digest: outcomeRegistryDigest(registry),
    generation: 0,
    precise_completion_label: 'NOT_STARTED',
    updated_at: new Date().toISOString(),
    outcomes: Object.fromEntries(registry.outcomes.filter((item) => item.disposition === 'required').map((item) => [item.id, initialEntry(item)])),
  };
}

export function validateOutcomeProgress(value, paths, registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema_version !== 1) throw conflictError('Outcome progress is invalid.', 'INVALID_OUTCOME_PROGRESS');
  only(value, PROGRESS_KEYS, 'Outcome progress');
  if (value.project_id !== paths.project_id || value.worktree_id !== paths.worktree_id || value.goal_id !== registry.goal_id) throw conflictError('Outcome progress belongs to another goal or worktree.', 'OUTCOME_PROGRESS_IDENTITY');
  if (value.goal_revision_digest !== registry.goal_revision_digest || value.registry_digest !== outcomeRegistryDigest(registry) || !Number.isInteger(value.generation) || value.generation < 0) throw conflictError('Outcome progress revision is invalid.', 'INVALID_OUTCOME_PROGRESS');
  if (!COMPLETION_LABELS.has(value.precise_completion_label) || typeof value.updated_at !== 'string' || Number.isNaN(Date.parse(value.updated_at))) throw conflictError('Outcome progress status is invalid.', 'INVALID_OUTCOME_PROGRESS');
  if (!value.outcomes || typeof value.outcomes !== 'object' || Array.isArray(value.outcomes)) throw conflictError('Outcome progress entries are invalid.', 'INVALID_OUTCOME_PROGRESS');
  const required = new Map(registry.outcomes.filter((item) => item.disposition === 'required').map((item) => [item.id, item]));
  if (required.size !== Object.keys(value.outcomes).length || [...required.keys()].some((id) => !Object.hasOwn(value.outcomes, id))) throw conflictError('Outcome progress does not contain exactly the required Outcome set.', 'INVALID_OUTCOME_PROGRESS');
  for (const [id, entry] of Object.entries(value.outcomes)) {
    const outcome = required.get(id);
    if (!outcome || !entry || typeof entry !== 'object' || Array.isArray(entry) || !PROGRESS_STATES.has(entry.state)) throw conflictError(`Outcome progress entry is invalid: ${id}`, 'INVALID_OUTCOME_PROGRESS');
    only(entry, ENTRY_KEYS, `Outcome progress ${id}`);
    if (entry.outcome_revision_digest !== outcome.revision_digest) throw conflictError(`Outcome progress ${id} revision is stale.`, 'INVALID_OUTCOME_PROGRESS');
    for (const field of ['satisfied_acceptance_ids', 'route_ids', 'evidence_ids', 'missing_acceptance_ids']) uniqueStrings(entry[field], `Outcome progress ${id} ${field}`);
    if (entry.last_verified_snapshot !== null && (!entry.last_verified_snapshot || typeof entry.last_verified_snapshot !== 'object' || Array.isArray(entry.last_verified_snapshot))) throw conflictError(`Outcome progress ${id} snapshot is invalid.`, 'INVALID_OUTCOME_PROGRESS');
    const acceptanceIds = new Set(outcome.acceptance.map((item) => item.id));
    for (const acceptanceId of [...entry.satisfied_acceptance_ids, ...entry.missing_acceptance_ids]) if (!acceptanceIds.has(acceptanceId)) throw conflictError(`Outcome progress ${id} references unknown acceptance: ${acceptanceId}`, 'INVALID_OUTCOME_PROGRESS');
    const satisfied = new Set(entry.satisfied_acceptance_ids);
    const missing = new Set(entry.missing_acceptance_ids);
    if ([...satisfied].some((acceptanceId) => missing.has(acceptanceId)) || [...acceptanceIds].some((acceptanceId) => !satisfied.has(acceptanceId) && !missing.has(acceptanceId))) throw conflictError(`Outcome progress ${id} acceptance partition is invalid.`, 'INVALID_OUTCOME_PROGRESS');
    if (entry.state === 'satisfied' && missing.size !== 0) throw conflictError(`Outcome progress ${id} cannot be satisfied with missing acceptance.`, 'INVALID_OUTCOME_PROGRESS');
  }
  return value;
}

export function reconcileOutcomeProgress(value, paths, registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const expectedDigest = outcomeRegistryDigest(registry);
  if (value.goal_revision_digest === registry.goal_revision_digest && value.registry_digest === expectedDigest) return validateOutcomeProgress(value, paths, registry);
  const next = initialOutcomeProgress(paths, registry);
  next.generation = (Number.isInteger(value.generation) ? value.generation : 0) + 1;
  next.precise_completion_label = value.precise_completion_label ?? 'NOT_STARTED';
  const goalChanged = value.goal_revision_digest !== registry.goal_revision_digest;
  for (const outcome of registry.outcomes.filter((item) => item.disposition === 'required')) {
    const prior = value.outcomes?.[outcome.id];
    if (!prior) continue;
    if (goalChanged || prior.outcome_revision_digest !== outcome.revision_digest) {
      next.outcomes[outcome.id] = {
        ...initialEntry(outcome), state: 'stale',
        route_ids: [...new Set(prior.route_ids ?? [])], evidence_ids: [...new Set(prior.evidence_ids ?? [])],
        last_verified_snapshot: prior.last_verified_snapshot ?? null,
      };
      continue;
    }
    const satisfied = [...new Set(prior.satisfied_acceptance_ids ?? [])].filter((id) => outcome.acceptance.some((item) => item.id === id));
    next.outcomes[outcome.id] = { ...prior, satisfied_acceptance_ids: satisfied, missing_acceptance_ids: outcome.acceptance.map((item) => item.id).filter((id) => !satisfied.includes(id)) };
  }
  return validateOutcomeProgress(next, paths, registry);
}

export async function readOutcomeProgress(paths, registryValue, { create = true } = {}) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  let value = await readJsonFile(paths.outcome_progress, 'Outcome progress', { allowMissing: true });
  if (!value) {
    if (!create) return null;
    value = initialOutcomeProgress(paths, registry);
    await atomicJson(paths.outcome_progress, value);
    return value;
  }
  const reconciled = reconcileOutcomeProgress(value, paths, registry);
  if (canonicalJson(reconciled) !== canonicalJson(value)) await atomicJson(paths.outcome_progress, reconciled);
  return reconciled;
}

export async function writeOutcomeGovernance(context, paths, priorRegistryValue, nextRegistryValue) {
  const prior = await readOutcomeProgress(paths, priorRegistryValue);
  const registry = validateOutcomeRegistry(structuredClone(nextRegistryValue));
  const progress = reconcileOutcomeProgress(prior, paths, registry);
  await transactionalWrites([
    { target: resolveInside(context.root, context.manifest.outcome_index, 'Outcome registry path'), content: canonicalJson(registry), mode: 0o644 },
    { target: paths.outcome_progress, content: canonicalJson(progress), mode: 0o600 },
    { target: resolveInside(context.root, context.manifest.progress_projection, 'Progress projection path'), content: renderProgressMarkdown(registry, progress), mode: 0o644 },
  ]);
  return { registry, progress };
}

export async function writeProgressProjection(context, paths, registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const progress = await readOutcomeProgress(paths, registry);
  await transactionalWrites([{ target: resolveInside(context.root, context.manifest.progress_projection, 'Progress projection path'), content: renderProgressMarkdown(registry, progress), mode: 0o644 }]);
  return progress;
}

export function bindRouteOutcomes(registryValue, outcomeIdsValue, successChecks, { consequential = false } = {}) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const registryDigest = outcomeRegistryDigest(registry);
  const outcomeIds = [...new Set(outcomeIdsValue ?? [])];
  if (registry.coverage_status === 'confirmed' && consequential && outcomeIds.length === 0) throw conflictError('Confirmed goal coverage requires every consequential step to name at least one required Outcome.', 'OUTCOME_REQUIRED');
  const selected = [];
  for (const id of outcomeIds) {
    const outcome = registry.outcomes.find((item) => item.id === id);
    if (!outcome) throw conflictError(`Outcome is not found: ${id}`, 'OUTCOME_NOT_FOUND');
    if (outcome.disposition !== 'required') throw conflictError(`Outcome is not executable because its disposition is ${outcome.disposition}: ${id}`, 'OUTCOME_NOT_REQUIRED');
    selected.push(outcome);
  }
  const acceptanceOwners = new Map();
  for (const outcome of selected) for (const acceptance of outcome.acceptance) acceptanceOwners.set(acceptance.id, outcome.id);
  for (const check of successChecks) {
    if (registry.coverage_status === 'confirmed' && consequential && check.acceptance_ids.length === 0) throw conflictError(`Success check ${check.id} must map to a predeclared acceptance item.`, 'ACCEPTANCE_REQUIRED');
    for (const id of check.acceptance_ids) if (!acceptanceOwners.has(id)) throw conflictError(`Acceptance item is not found in the selected Outcomes: ${id}`, 'ACCEPTANCE_NOT_FOUND');
  }
  return {
    outcome_ids: selected.map((item) => item.id),
    outcome_revision_digests: Object.fromEntries(selected.map((item) => [item.id, item.revision_digest])),
    registry_digest: registryDigest,
    goal_revision_digest: registry.goal_revision_digest,
    goal_credit_eligible: registry.coverage_status === 'confirmed' && selected.length > 0,
  };
}

export function applyRouteOutcomeEvidence(progressValue, registryValue, route, receipts, snapshot) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const progress = structuredClone(progressValue);
  const successfulChecks = new Set(receipts.filter((item) => item.successful).map((item) => item.check_id));
  const evidenceIds = receipts.filter((item) => item.successful).map((item) => item.id);
  for (const outcomeId of route.outcome_ids ?? []) {
    const outcome = registry.outcomes.find((item) => item.id === outcomeId);
    const entry = progress.outcomes[outcomeId];
    if (!outcome || !entry || entry.outcome_revision_digest !== outcome.revision_digest) throw conflictError(`Outcome progress changed during the route: ${outcomeId}`, 'OUTCOME_PROGRESS_CHANGED');
    const newlySatisfied = (route.success_checks ?? []).filter((check) => successfulChecks.has(check.id)).flatMap((check) => check.acceptance_ids ?? []).filter((id) => outcome.acceptance.some((item) => item.id === id));
    entry.satisfied_acceptance_ids = [...new Set([...entry.satisfied_acceptance_ids, ...newlySatisfied])].sort();
    entry.missing_acceptance_ids = outcome.acceptance.map((item) => item.id).filter((id) => !entry.satisfied_acceptance_ids.includes(id));
    entry.state = entry.missing_acceptance_ids.length ? 'in-progress' : 'satisfied';
    entry.route_ids = [...new Set([...entry.route_ids, route.id])];
    entry.evidence_ids = [...new Set([...entry.evidence_ids, ...evidenceIds])];
    entry.last_verified_snapshot = snapshot;
  }
  progress.generation += 1;
  progress.precise_completion_label = 'SLICE_GREEN';
  progress.updated_at = new Date().toISOString();
  return validateOutcomeProgress(progress, { project_id: progress.project_id, worktree_id: progress.worktree_id }, registry);
}

export function outcomeProgressSummary(registryValue, progressValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const progress = progressValue;
  const counts = { open: 0, 'in-progress': 0, satisfied: 0, stale: 0, blocked: 0 };
  for (const entry of Object.values(progress.outcomes)) counts[entry.state] += 1;
  const remaining = registry.outcomes.filter((item) => item.disposition === 'required' && progress.outcomes[item.id]?.state !== 'satisfied').map((item) => item.id).sort();
  const missingAcceptanceIds = remaining.flatMap((id) => progress.outcomes[id]?.missing_acceptance_ids ?? []);
  return {
    coverage_status: registry.coverage_status,
    required: Object.keys(progress.outcomes).length,
    counts,
    remaining_outcome_ids: remaining,
    missing_acceptance_ids: missingAcceptanceIds,
    current_outcome_id: remaining[0] ?? null,
    precise_completion_label: progress.precise_completion_label,
  };
}

export function renderProgressMarkdown(registryValue, progressValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const progress = progressValue;
  const summary = outcomeProgressSummary(registry, progress);
  const generationDigest = progress.generation === 0
    ? outcomeRegistryDigest(registry)
    : `sha256:${sha256Text(canonicalJson({ registry_digest: outcomeRegistryDigest(registry), progress }))}`;
  return [
    '# VibeTether Progress', '', '<!-- vibetether:generated-progress-v1 -->', '',
    `Goal: ${registry.goal_id}`,
    `Goal revision: ${registry.goal_revision_digest}`,
    `Coverage status: ${registry.coverage_status}`,
    `Integration worktree: ${registry.integration_worktree_id ?? 'not-designated'}`,
    `Required: ${summary.required} | Open: ${summary.counts.open} | In progress: ${summary.counts['in-progress']} | Satisfied: ${summary.counts.satisfied} | Stale: ${summary.counts.stale} | Blocked: ${summary.counts.blocked}`,
    `Current Outcome: ${summary.current_outcome_id ?? 'none'}`,
    `Remaining Outcome IDs: ${summary.remaining_outcome_ids.length ? summary.remaining_outcome_ids.join(', ') : 'none'}`,
    `Next missing acceptance: ${summary.missing_acceptance_ids[0] ?? 'none'}`,
    `Precise completion label: ${summary.precise_completion_label}`,
    `Generation digest: ${generationDigest}`,
    'Regenerate: vibetether outcomes status --write-progress --project .', '',
    'This file is generated from the user-governed Outcome Contract and verified runtime receipts. Do not edit it manually.', '',
  ].join('\n');
}

export async function verifyProgressProjection(context, registryValue, progressValue) {
  let source;
  try { source = await readFile(resolveInside(context.root, context.manifest.progress_projection, 'Progress projection path'), 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') throw conflictError('Generated progress projection is missing.', 'PROGRESS_PROJECTION_MISSING');
    throw error;
  }
  const expected = renderProgressMarkdown(registryValue, progressValue);
  if (normalizePortableText(source) !== normalizePortableText(expected)) throw conflictError('Generated progress projection was modified or is stale; regenerate it before completion.', 'PROGRESS_PROJECTION_CHANGED');
  return { expected, digest: `sha256:${sha256Text(expected)}` };
}
