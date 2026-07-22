import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  atomicJson, boundedText, canonicalJson, containsSecret, normalizePortableText, readJsonFile, resolveInside, sha256Text,
  transactionalWrites,
} from './files.mjs';
import { conflictError } from './errors.mjs';
import { outcomeRegistryDigest, validateOutcomeRegistry } from './outcomes.mjs';
import { executionSnapshot } from './git.mjs';
import { sealReceipt } from './runtime.mjs';

const PROGRESS_STATES = new Set(['open', 'in-progress', 'satisfied', 'stale', 'blocked']);
const COMPLETION_LABELS = new Set(['NOT_STARTED', 'SLICE_GREEN', 'GOAL_ENGINEERING_CLOSED', 'RELEASE_READY']);
const PROGRESS_KEYS = new Set([
  'schema_version', 'project_id', 'worktree_id', 'goal_id', 'goal_revision_digest',
  'registry_digest', 'generation', 'precise_completion_label', 'updated_at', 'outcomes',
]);
const ENTRY_KEYS = new Set([
  'outcome_revision_digest', 'state', 'satisfied_acceptance_ids', 'route_ids', 'evidence_ids',
  'acceptance_proofs', 'validator_revisions', 'last_verified_snapshot', 'missing_acceptance_ids',
]);
const PROOF_KEYS = new Set(['kind', 'evidence_ids', 'decision_receipt']);
const DECISION_PROOF_KEYS = new Set([
  'id', 'acceptance_id', 'outcome_id', 'kind', 'decision_type', 'user_message_locator', 'reason',
  'independence_level', 'registry_digest', 'outcome_revision_digest', 'authority_digest',
  'worktree_id', 'execution_snapshot', 'recorded_at', 'digest',
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
    acceptance_proofs: {},
    validator_revisions: Object.fromEntries(outcome.acceptance.map((item)=>[item.id,item.validator.validator_revision])),
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
    if (!entry.acceptance_proofs || typeof entry.acceptance_proofs !== 'object' || Array.isArray(entry.acceptance_proofs)) throw conflictError(`Outcome progress ${id} acceptance proofs are invalid.`, 'INVALID_OUTCOME_PROGRESS');
    if (!entry.validator_revisions || typeof entry.validator_revisions !== 'object' || Array.isArray(entry.validator_revisions) || Object.keys(entry.validator_revisions).length!==acceptanceIds.size || [...acceptanceIds].some((acceptanceId)=>entry.validator_revisions[acceptanceId]!==outcome.acceptance.find((item)=>item.id===acceptanceId).validator.validator_revision)) throw conflictError(`Outcome progress ${id} validator revisions are invalid.`, 'INVALID_OUTCOME_PROGRESS');
    if (Object.keys(entry.acceptance_proofs).some((acceptanceId) => !satisfied.has(acceptanceId)) || [...satisfied].some((acceptanceId) => !Object.hasOwn(entry.acceptance_proofs, acceptanceId))) throw conflictError(`Outcome progress ${id} acceptance proofs do not match satisfied acceptance.`, 'INVALID_OUTCOME_PROGRESS');
    for (const [acceptanceId, proof] of Object.entries(entry.acceptance_proofs)) {
      only(proof, PROOF_KEYS, `Outcome progress ${id} proof ${acceptanceId}`);
      if (!['route-evidence', 'user-decision', 'review-decision'].includes(proof.kind)) throw conflictError(`Outcome progress ${id} proof ${acceptanceId} kind is invalid.`, 'INVALID_OUTCOME_PROGRESS');
      uniqueStrings(proof.evidence_ids, `Outcome progress ${id} proof ${acceptanceId} evidence_ids`);
      if (proof.kind === 'route-evidence') {
        if (!proof.evidence_ids.length || proof.decision_receipt !== null) throw conflictError(`Outcome progress ${id} route proof ${acceptanceId} is invalid.`, 'INVALID_OUTCOME_PROGRESS');
      } else {
        only(proof.decision_receipt, DECISION_PROOF_KEYS, `Outcome progress ${id} decision proof ${acceptanceId}`);
        const receipt=proof.decision_receipt;
        if (proof.evidence_ids.length || receipt.acceptance_id!==acceptanceId || receipt.outcome_id!==id || receipt.kind!==proof.kind || receipt.outcome_revision_digest!==outcome.revision_digest || receipt.registry_digest!==value.registry_digest || !/^[a-f0-9]{64}$/.test(receipt.authority_digest??'') || receipt.worktree_id!==value.worktree_id || !receipt.execution_snapshot || typeof receipt.execution_snapshot!=='object' || Array.isArray(receipt.execution_snapshot) || typeof receipt.recorded_at!=='string' || Number.isNaN(Date.parse(receipt.recorded_at)) || receipt.digest!==sealReceipt(receipt).digest) throw conflictError(`Outcome progress ${id} decision proof ${acceptanceId} is stale or invalid.`, 'INVALID_OUTCOME_PROGRESS');
      }
    }
    if (entry.state === 'satisfied' && missing.size !== 0) throw conflictError(`Outcome progress ${id} cannot be satisfied with missing acceptance.`, 'INVALID_OUTCOME_PROGRESS');
  }
  return value;
}

export function reconcileOutcomeProgress(value, paths, registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  value=structuredClone(value);
  for (const [id,entry] of Object.entries(value.outcomes??{})) if (!Object.hasOwn(entry,'acceptance_proofs')) {
    entry.acceptance_proofs={};
    if ((entry.satisfied_acceptance_ids??[]).length) {
      const outcome=registry.outcomes.find((item)=>item.id===id);
      entry.state='stale'; entry.satisfied_acceptance_ids=[]; entry.missing_acceptance_ids=outcome?.acceptance.map((item)=>item.id)??[];
    }
  }
  for (const [id,entry] of Object.entries(value.outcomes??{})) if (!Object.hasOwn(entry,'validator_revisions')) {
    const outcome=registry.outcomes.find((item)=>item.id===id);
    entry.validator_revisions=Object.fromEntries((outcome?.acceptance??[]).map((item)=>[item.id,item.validator.validator_revision]));
    if ((entry.satisfied_acceptance_ids??[]).length) { entry.state='stale'; entry.satisfied_acceptance_ids=[]; entry.acceptance_proofs={}; entry.missing_acceptance_ids=outcome?.acceptance.map((item)=>item.id)??[]; }
  }
  const expectedDigest = outcomeRegistryDigest(registry);
  if (value.goal_revision_digest === registry.goal_revision_digest && value.registry_digest === expectedDigest) return validateOutcomeProgress(value, paths, registry);
  const next = initialOutcomeProgress(paths, registry);
  next.generation = (Number.isInteger(value.generation) ? value.generation : 0) + 1;
  next.precise_completion_label = value.precise_completion_label ?? 'NOT_STARTED';
  const goalChanged = value.goal_revision_digest !== registry.goal_revision_digest;
  for (const outcome of registry.outcomes.filter((item) => item.disposition === 'required')) {
    const prior = value.outcomes?.[outcome.id];
    if (!prior) continue;
    const changedValidators=outcome.acceptance.filter((acceptance)=>prior.validator_revisions?.[acceptance.id]&&prior.validator_revisions[acceptance.id]!==acceptance.validator.validator_revision);
    const unmappedValidator=changedValidators.find((acceptance)=>!registry.validator_migrations.some((migration)=>migration.outcome_id===outcome.id&&migration.acceptance_id===acceptance.id&&migration.old_node===prior.validator_revisions[acceptance.id]&&migration.positive_replacement===acceptance.validator.validator_revision&&migration.outcome_revision_digest===outcome.revision_digest));
    if (goalChanged || prior.outcome_revision_digest !== outcome.revision_digest || changedValidators.length) {
      next.outcomes[outcome.id] = {
        ...initialEntry(outcome), state: unmappedValidator?'blocked':'stale',
        route_ids: [...new Set(prior.route_ids ?? [])], evidence_ids: [...new Set(prior.evidence_ids ?? [])],
        last_verified_snapshot: prior.last_verified_snapshot ?? null,
      };
      continue;
    }
    const candidateSatisfied=[...new Set(prior.satisfied_acceptance_ids??[])].filter((id)=>outcome.acceptance.some((item)=>item.id===id));
    const staleDecisionIds=new Set(candidateSatisfied.filter((id)=>{
      const proof=prior.acceptance_proofs?.[id];
      return proof&&proof.kind!=='route-evidence'&&proof.decision_receipt?.registry_digest!==expectedDigest;
    }));
    const satisfied=candidateSatisfied.filter((id)=>!staleDecisionIds.has(id));
    const proofs=Object.fromEntries(Object.entries(prior.acceptance_proofs??{}).filter(([id])=>satisfied.includes(id)));
    const missing=outcome.acceptance.map((item)=>item.id).filter((id)=>!satisfied.includes(id));
    const state=(staleDecisionIds.size>0||(prior.state==='satisfied'&&missing.length>0))?'stale':missing.length?prior.state:'satisfied';
    next.outcomes[outcome.id]={...prior,state,satisfied_acceptance_ids:satisfied,acceptance_proofs:proofs,missing_acceptance_ids:missing};
  }
  return validateOutcomeProgress(next, paths, registry);
}

export async function readOutcomeProgress(paths, registryValue, { create = true, persist = true, persist_reconciled = false } = {}) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  let value = await readJsonFile(paths.outcome_progress, 'Outcome progress', { allowMissing: true });
  if (!value) {
    if (!create) return null;
    value = initialOutcomeProgress(paths, registry);
    if (persist) await atomicJson(paths.outcome_progress, value);
    return value;
  }
  const reconciled = reconcileOutcomeProgress(value, paths, registry);
  if (persist && persist_reconciled && canonicalJson(reconciled) !== canonicalJson(value)) await atomicJson(paths.outcome_progress, reconciled);
  return reconciled;
}

export async function writeOutcomeGovernance(context, paths, priorRegistryValue, nextRegistryValue) {
  const prior = await readJsonFile(paths.outcome_progress,'Outcome progress',{allowMissing:true})??initialOutcomeProgress(paths,priorRegistryValue);
  const registry = validateOutcomeRegistry(structuredClone(nextRegistryValue));
  const progress = reconcileOutcomeProgress(prior, paths, registry);
  const plans=[
    { target: resolveInside(context.root, context.manifest.outcome_index, 'Outcome registry path'), content: canonicalJson(registry), mode: 0o644 },
    { target: paths.outcome_progress, content: canonicalJson(progress), mode: 0o600 },
  ];
  if (isProgressProjectionOwner(registry,progress)) plans.push({ target: resolveInside(context.root, context.manifest.progress_projection, 'Progress projection path'), content: renderProgressMarkdown(registry, progress), mode: 0o644 });
  await transactionalWrites(plans);
  return { registry, progress };
}

export async function writeProgressProjection(context, paths, registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const progress = await readOutcomeProgress(paths, registry);
  if (!isProgressProjectionOwner(registry,progress)) return { ...progress, projection_status:'integration-worktree-only' };
  await transactionalWrites([
    {target:paths.outcome_progress,content:canonicalJson(progress),mode:0o600},
    { target: resolveInside(context.root, context.manifest.progress_projection, 'Progress projection path'), content: renderProgressMarkdown(registry, progress), mode: 0o644 },
  ]);
  return progress;
}

export async function recordAcceptanceDecision(context, paths, registryValue, acceptanceId, options={}) {
  const registry=validateOutcomeRegistry(structuredClone(registryValue));
  const outcome=registry.outcomes.find((item)=>item.disposition==='required'&&item.acceptance.some((acceptance)=>acceptance.id===acceptanceId));
  const acceptance=outcome?.acceptance.find((item)=>item.id===acceptanceId);
  if (!outcome||!acceptance) throw conflictError(`Required acceptance is not found: ${acceptanceId}`, 'ACCEPTANCE_NOT_FOUND');
  if (!['user-decision','review-decision'].includes(acceptance.validator.kind)) throw conflictError(`Acceptance ${acceptanceId} requires ${acceptance.validator.kind}, not a decision receipt.`, 'ACCEPTANCE_DECISION_NOT_APPLICABLE');
  const userMessageLocator=boundedText(options.user_message_locator,500,'Acceptance decision user-message locator');
  const reason=boundedText(options.reason,1000,'Acceptance decision reason');
  if (userMessageLocator.length<12||reason.length<24) throw conflictError('Acceptance decisions require a durable user-message locator and substantive reason.', 'USER_DECISION_REQUIRED');
  let independence=null;
  if (acceptance.validator.kind==='review-decision') {
    if (!['self','peer','independent'].includes(options.independence_level)) throw conflictError('Review decisions require --independence-level self, peer, or independent.', 'REVIEW_INDEPENDENCE_REQUIRED');
    independence=boundedText(options.independence_level,32,'Review independence level');
  }
  const progress=await readOutcomeProgress(paths,registry);
  await verifyProgressProjection(context,registry,progress);
  if (!/^[a-f0-9]{64}$/.test(options.authority_digest??'')) throw conflictError('Acceptance decision requires the current confirmed authority digest.', 'AUTHORITY_REQUIRED');
  const snapshot=await executionSnapshot(context.executionRoot);
  const receipt=sealReceipt({
    id:`acceptance-decision-${randomUUID()}`,acceptance_id:acceptance.id,outcome_id:outcome.id,
    kind:acceptance.validator.kind,decision_type:acceptance.validator.decision_type,
    user_message_locator:userMessageLocator,reason,independence_level:independence,
    registry_digest:outcomeRegistryDigest(registry),outcome_revision_digest:outcome.revision_digest,
    authority_digest:options.authority_digest,worktree_id:paths.worktree_id,execution_snapshot:snapshot,recorded_at:new Date().toISOString(),
  });
  if (containsSecret(receipt)) throw conflictError('Acceptance decision appears to contain a secret.', 'SECRET_VALUE');
  const next=structuredClone(progress); const entry=next.outcomes[outcome.id];
  entry.satisfied_acceptance_ids=[...new Set([...entry.satisfied_acceptance_ids,acceptance.id])].sort();
  entry.missing_acceptance_ids=outcome.acceptance.map((item)=>item.id).filter((id)=>!entry.satisfied_acceptance_ids.includes(id));
  entry.acceptance_proofs[acceptance.id]={kind:acceptance.validator.kind,evidence_ids:[],decision_receipt:receipt};
  entry.state=entry.missing_acceptance_ids.length?'in-progress':'satisfied';
  next.generation+=1; next.updated_at=new Date().toISOString();
  validateOutcomeProgress(next,paths,registry);
  const plans=[
    {target:path.join(paths.decisions,`${receipt.id}.json`),content:canonicalJson(receipt),mode:0o600},
    {target:paths.outcome_progress,content:canonicalJson(next),mode:0o600},
  ];
  if (isProgressProjectionOwner(registry,next)) plans.push({target:resolveInside(context.root,context.manifest.progress_projection,'Progress projection path'),content:renderProgressMarkdown(registry,next),mode:0o644});
  await transactionalWrites(plans);
  return {outcome_id:outcome.id,acceptance_id:acceptance.id,decision_receipt:receipt,progress:next};
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
  for (const outcome of selected) for (const acceptance of outcome.acceptance) acceptanceOwners.set(acceptance.id, { outcome_id: outcome.id, acceptance });
  for (const check of successChecks) {
    if (registry.coverage_status === 'confirmed' && consequential && check.acceptance_ids.length === 0) throw conflictError(`Success check ${check.id} must map to a predeclared acceptance item.`, 'ACCEPTANCE_REQUIRED');
    for (const id of check.acceptance_ids) {
      const owned = acceptanceOwners.get(id);
      if (!owned) throw conflictError(`Acceptance item is not found in the selected Outcomes: ${id}`, 'ACCEPTANCE_NOT_FOUND');
      const validator = owned.acceptance.validator;
      const covers = new Set(check.covers_paths ?? []);
      const covered = (validator.covers_paths ?? []).every((item) => covers.has(item));
      const commandMatches = validator.kind === 'command' && check.kind === 'command' && canonicalJson(check.command) === canonicalJson(validator.command) && covered;
      const artifactMatches = validator.kind === 'artifact' && check.kind === 'artifact' && check.path === validator.path;
      if (['authority-adapter', 'user-decision', 'review-decision'].includes(validator.kind)) throw conflictError(`Acceptance ${id} requires its declared ${validator.kind} receipt and cannot be satisfied by route evidence.`, 'ACCEPTANCE_RECEIPT_REQUIRED');
      if (!commandMatches && !artifactMatches) throw conflictError(`Success check ${check.id} does not match the governed validator for acceptance ${id}.`, 'ACCEPTANCE_VALIDATOR_MISMATCH');
    }
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
    const successfulMappedChecks=(route.success_checks??[]).filter((check)=>successfulChecks.has(check.id));
    const newlySatisfied = successfulMappedChecks.flatMap((check) => check.acceptance_ids ?? []).filter((id) => outcome.acceptance.some((item) => item.id === id));
    entry.satisfied_acceptance_ids = [...new Set([...entry.satisfied_acceptance_ids, ...newlySatisfied])].sort();
    for (const acceptanceId of newlySatisfied) {
      const checkIds=new Set(successfulMappedChecks.filter((check)=>(check.acceptance_ids??[]).includes(acceptanceId)).map((check)=>check.id));
      const prior=entry.acceptance_proofs[acceptanceId]?.evidence_ids??[];
      entry.acceptance_proofs[acceptanceId]={kind:'route-evidence',evidence_ids:[...new Set([...prior,...receipts.filter((receipt)=>receipt.successful&&checkIds.has(receipt.check_id)).map((receipt)=>receipt.id)])],decision_receipt:null};
    }
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

export function isProgressProjectionOwner(registryValue, progressValue) {
  const registry=validateOutcomeRegistry(structuredClone(registryValue));
  return !registry.integration_worktree_id||registry.integration_worktree_id===progressValue?.worktree_id;
}

export async function verifyProgressProjection(context, registryValue, progressValue) {
  if (!isProgressProjectionOwner(registryValue,progressValue)) {
    return {
      expected:null,digest:null,status:'integration-worktree-only',
      integration_worktree_id:registryValue.integration_worktree_id,
      local_worktree_id:progressValue?.worktree_id??null,
    };
  }
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
