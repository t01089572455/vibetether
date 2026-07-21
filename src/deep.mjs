import { randomUUID } from 'node:crypto';
import { conflictError } from './errors.mjs';
import { boundedText, canonicalJson, safeRelative, sha256Text } from './files.mjs';
import { discoverContract } from './contract.mjs';
import { parseTruthMap, authoritySnapshot } from './truth.mjs';
import { attachWorktree } from './worktree.mjs';
import {
  appendRuntimeEvent, readCurrent, readReceipt, readRoute, releaseLease,
  withWorktreeStateLock, writeCurrentProjection, writeReceipt, writeStepState,
} from './runtime.mjs';
import { removeActivation } from './skills.mjs';

const PERMIT_TTL_MS = 8 * 60 * 60 * 1000;

function strings(values, label, limit = 500) {
  return [...new Set((values ?? []).map((value) => boundedText(value, limit, label)).filter(Boolean))];
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function semanticWords(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function substantiveText(value, limit, label, { minimum = 24, subject = null } = {}) {
  const text = boundedText(value, limit, label);
  if (text.length < minimum) {
    throw conflictError(`${label} must contain a substantive, auditable explanation.`, 'START_CARD_UNRESOLVED');
  }
  if (subject) {
    const detail = new Set(semanticWords(text));
    const source = semanticWords(subject);
    const novel = [...detail].filter((word) => !source.includes(word));
    const generic = /^(?:verified|confirmed|approved|resolved|accepted|rejected|yes|no)\b[\s:.-]*/i;
    if (novel.length < 3 || generic.test(text) && novel.length < 5) {
      throw conflictError(`${label} must add material information instead of echoing the Start Card.`, 'START_CARD_UNRESOLVED');
    }
  }
  return text;
}

function confirmationSource(value, label) {
  const source = boundedText(value, 500, label);
  if (source.length < 12 || !/[a-z0-9]/i.test(source)) {
    throw conflictError(`${label} must identify the durable user-confirmation source.`, 'START_CARD_UNRESOLVED');
  }
  return source;
}

function indexedResolution(values, key, label) {
  if (!Array.isArray(values)) throw conflictError(`Deep resolution requires ${label}.`, 'START_CARD_UNRESOLVED');
  const result = new Map();
  for (const value of values) {
    if (!record(value)) throw conflictError(`Deep resolution ${label} entries must be mappings.`, 'START_CARD_UNRESOLVED');
    const id = boundedText(value[key], 500, `Deep resolution ${label} ${key}`);
    if (result.has(id)) throw conflictError(`Deep resolution ${label} contains a duplicate entry.`, 'START_CARD_UNRESOLVED');
    result.set(id, value);
  }
  return result;
}

function deepQuestions(card) {
  const entries = [
    ...card.assumptions.map((subject) => ({
      kind: 'assumption',
      subject,
      prompt: `Confirm, reject, or replace this assumption before implementation: ${subject}`,
      recommendation: 'Verify the assumption from project evidence or obtain an explicit user decision; do not silently infer it.',
      impact: 'An incorrect assumption can invalidate the approved implementation direction or its success evidence.',
    })),
    ...card.decisions_needed.map((subject) => ({
      kind: 'decision',
      subject,
      prompt: subject,
      recommendation: 'Choose the smallest reversible option consistent with confirmed Truth and the requested outcome.',
      impact: 'This choice changes the consequential scope or direction that the Implementation Permit will authorize.',
    })),
  ];
  return entries.map((entry, index) => ({
    id: `question-${index + 1}-${sha256Text(`${card.id}:${entry.kind}:${entry.subject}`).slice(0, 12)}`,
    order: index + 1,
    ...entry,
  }));
}

function normalizedPermissions(value = {}) {
  return {
    network: value.network === true,
    external_write: value.external_write === true,
    code_write: value.code_write === true,
  };
}

function normalizedScopePaths(values, successChecks = []) {
  const inferred = successChecks.flatMap((check) => Array.isArray(check?.covers_paths) ? check.covers_paths : []);
  const selected = values?.length ? values : inferred;
  return [...new Set(selected.map((item) => safeRelative(item, 'Deep approved scope path', { allowDirectory: String(item).endsWith('/') })))]
    .sort((left, right) => left.localeCompare(right));
}

function normalizedSuccessChecks(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw conflictError('Deep Start Card requires at least one predeclared success check.', 'INVALID_DEEP_CARD');
  }
  return JSON.parse(canonicalJson(values));
}

function prepareExecutionEnvelope(options, successEvidence) {
  const successChecks = normalizedSuccessChecks(options.success_checks);
  return {
    phase: boundedText(options.phase ?? 'EXECUTE_ONE', 64, 'Deep phase').toUpperCase(),
    capability: boundedText(options.capability ?? 'implementation', 128, 'Deep capability'),
    provider_id: options.provider ? boundedText(options.provider, 256, 'Deep provider') : null,
    scope_paths: normalizedScopePaths(options.scope_paths, successChecks),
    permissions: normalizedPermissions(options.permissions),
    success_evidence_digest: sha256Text(canonicalJson(successEvidence)),
    success_checks: successChecks,
    success_checks_digest: sha256Text(canonicalJson(successChecks)),
  };
}

function validateExecutionEnvelope(card, options = null) {
  const expected = card.execution_envelope;
  if (!record(expected)) throw conflictError('Deep Start Card lacks its consequential execution envelope.', 'IMPLEMENTATION_PERMIT_STALE');
  if (expected.success_evidence_digest !== sha256Text(canonicalJson(card.success_evidence))
      || expected.success_checks_digest !== sha256Text(canonicalJson(expected.success_checks))) {
    throw conflictError('Deep Start Card execution envelope was modified after preparation.', 'IMPLEMENTATION_PERMIT_STALE');
  }
  if (!options) return expected;
  const actualChecks = JSON.parse(canonicalJson(options.success_checks ?? []));
  const actual = {
    task_digest: sha256Text(boundedText(options.task_text, 2000, 'Deep route task')),
    phase: boundedText(options.phase, 64, 'Deep route phase').toUpperCase(),
    capability: boundedText(options.capability, 128, 'Deep route capability'),
    provider_id: options.provider_id ? boundedText(options.provider_id, 256, 'Deep route provider') : null,
    scope_paths: normalizedScopePaths(options.scope_paths, actualChecks),
    permissions: normalizedPermissions(options.permissions),
    success_evidence_digest: sha256Text(canonicalJson(options.success_evidence ?? [])),
    success_checks_digest: sha256Text(canonicalJson(actualChecks)),
  };
  const expectedComparable = {
    task_digest: sha256Text(card.task),
    phase: expected.phase,
    capability: expected.capability,
    scope_paths: expected.scope_paths,
    permissions: expected.permissions,
    success_evidence_digest: expected.success_evidence_digest,
    success_checks_digest: expected.success_checks_digest,
  };
  const actualComparable = {
    task_digest: actual.task_digest,
    phase: actual.phase,
    capability: actual.capability,
    scope_paths: actual.scope_paths,
    permissions: actual.permissions,
    success_evidence_digest: actual.success_evidence_digest,
    success_checks_digest: actual.success_checks_digest,
  };
  if (canonicalJson(expectedComparable) !== canonicalJson(actualComparable)
      || (expected.provider_id && expected.provider_id !== actual.provider_id)) {
    throw conflictError('Requested step does not match the user-approved Deep execution envelope.', 'IMPLEMENTATION_PERMIT_SCOPE');
  }
  return expected;
}

function validateDecisionReceipts(state, { complete = false } = {}) {
  const questions = Array.isArray(state.questions) ? state.questions : [];
  const receipts = Array.isArray(state.decision_receipts) ? state.decision_receipts : [];
  if (receipts.length > questions.length || (complete && receipts.length !== questions.length)) {
    throw conflictError('Every Deep question must have exactly one durable user-answer receipt before final confirmation.', 'DEEP_QUESTIONS_UNRESOLVED');
  }
  const cardDigest = startCardDigest(state.start_card);
  const taskDigest = sha256Text(state.start_card.task);
  const ids = new Set();
  for (const [index, receipt] of receipts.entries()) {
    const question = questions[index];
    if (!record(receipt) || !question || receipt.question_id !== question.id || receipt.question_kind !== question.kind || receipt.subject !== question.subject) {
      throw conflictError('Deep decision receipts must answer the current questions in order.', 'DEEP_DECISION_RECEIPT_INVALID');
    }
    if (ids.has(receipt.id)) throw conflictError('Deep decision receipt IDs must be unique.', 'DEEP_DECISION_RECEIPT_INVALID');
    ids.add(receipt.id);
    if (receipt.start_card_digest !== cardDigest || receipt.task_digest !== taskDigest) {
      throw conflictError('A Deep decision receipt is stale for the current Start Card.', 'DEEP_DECISION_RECEIPT_STALE');
    }
    boundedText(receipt.selected_option, 2000, 'Deep selected option');
    confirmationSource(receipt.user_message_locator, 'Deep user-message locator');
  }
  return receipts;
}

export function validateStartCardResolution(card, resolution) {
  if (!record(resolution)) throw conflictError('Deep Start Card remains unresolved; provide a complete resolution record.', 'START_CARD_UNRESOLVED');

  if (!record(resolution.user_confirmation)) {
    throw conflictError('Deep resolution must identify the durable user confirmation that authorized this exact Start Card.', 'START_CARD_UNRESOLVED');
  }
  const userConfirmation = {
    source: confirmationSource(resolution.user_confirmation.source, 'Deep user-confirmation source'),
    summary: substantiveText(resolution.user_confirmation.summary, 1000, 'Deep user-confirmation summary', {
      minimum: 32,
      subject: card.task,
    }),
  };

  const facts = indexedResolution(resolution.facts_verified, 'fact', 'facts_verified');
  const assumptions = indexedResolution(resolution.assumptions_resolved, 'assumption', 'assumptions_resolved');
  const decisions = indexedResolution(resolution.decisions_resolved, 'decision', 'decisions_resolved');

  if (facts.size !== card.facts.length || [...facts.keys()].some((item) => !card.facts.includes(item))) {
    throw conflictError('Every Start Card fact must be verified exactly once.', 'START_CARD_UNRESOLVED');
  }
  const normalizedFacts = card.facts.map((fact) => {
    const item = facts.get(fact);
    const kind = boundedText(item.evidence_kind, 128, 'Deep fact evidence kind');
    const locator = boundedText(item.source_locator, 1000, 'Deep fact evidence locator');
    if (locator.length < 8) {
      throw conflictError('Deep fact evidence must name a repository path, command, user source, or external authority locator.', 'START_CARD_UNRESOLVED');
    }
    return {
      fact,
      evidence: substantiveText(item.evidence, 1000, 'Deep fact evidence', { subject: fact }),
      evidence_kind: kind,
      source_locator: locator,
    };
  });

  if (assumptions.size !== card.assumptions.length || [...assumptions.keys()].some((item) => !card.assumptions.includes(item))) {
    throw conflictError('Every Start Card assumption must have an explicit disposition.', 'START_CARD_UNRESOLVED');
  }
  const normalizedAssumptions = card.assumptions.map((assumption) => {
    const item = assumptions.get(assumption);
    if (item.disposition !== 'confirmed') {
      throw conflictError('A rejected or changed assumption requires a new Start Card before implementation.', 'START_CARD_UNRESOLVED');
    }
    const source = confirmationSource(item.confirmation_source, 'Deep assumption confirmation source');
    if (source !== userConfirmation.source) {
      throw conflictError('Every confirmed assumption must point to the same reviewed user-confirmation source.', 'START_CARD_UNRESOLVED');
    }
    return {
      assumption,
      disposition: 'confirmed',
      rationale: substantiveText(item.rationale, 1000, 'Deep assumption rationale', { subject: assumption }),
      confirmation_source: source,
    };
  });

  if (decisions.size !== card.decisions_needed.length || [...decisions.keys()].some((item) => !card.decisions_needed.includes(item))) {
    throw conflictError('Every directional decision on the Start Card must be resolved exactly once.', 'START_CARD_UNRESOLVED');
  }
  const normalizedDecisions = card.decisions_needed.map((decision) => {
    const item = decisions.get(decision);
    const source = confirmationSource(item.confirmation_source, 'Deep decision confirmation source');
    if (source !== userConfirmation.source) {
      throw conflictError('Every directional decision must point to the same reviewed user-confirmation source.', 'START_CARD_UNRESOLVED');
    }
    return {
      decision,
      resolution: substantiveText(item.resolution, 1000, 'Deep decision resolution', { subject: decision }),
      confirmation_source: source,
    };
  });

  if (!Array.isArray(resolution.success_evidence_confirmed)) {
    throw conflictError('The user must explicitly confirm every Start Card success-evidence statement.', 'START_CARD_UNRESOLVED');
  }
  const confirmedEvidence = strings(resolution.success_evidence_confirmed, 'Confirmed success evidence');
  if (confirmedEvidence.length !== card.success_evidence.length
      || confirmedEvidence.some((item) => !card.success_evidence.includes(item))) {
    throw conflictError('Confirmed success evidence must exactly match the Start Card.', 'START_CARD_UNRESOLVED');
  }
  const verifierIndex = indexedResolution(
    resolution.success_evidence_verifiers,
    'criterion',
    'success_evidence_verifiers',
  );
  if (verifierIndex.size !== card.success_evidence.length
      || [...verifierIndex.keys()].some((item) => !card.success_evidence.includes(item))) {
    throw conflictError('Every confirmed success-evidence statement must have exactly one predeclared verifier.', 'START_CARD_UNRESOLVED');
  }
  const successEvidenceVerifiers = card.success_evidence.map((criterion) => ({
    criterion,
    verifier: substantiveText(
      verifierIndex.get(criterion).verifier,
      1000,
      'Deep success-evidence verifier',
      { subject: criterion },
    ),
  }));

  if (!record(resolution.counterexample_challenge)) {
    throw conflictError('Deep Permit requires a counterexample challenge and outcome.', 'START_CARD_UNRESOLVED');
  }
  const challenge = {
    challenge: substantiveText(
      resolution.counterexample_challenge.challenge,
      1000,
      'Counterexample challenge',
      { minimum: 20 },
    ),
    outcome: substantiveText(
      resolution.counterexample_challenge.outcome,
      1000,
      'Counterexample outcome',
      { minimum: 24, subject: resolution.counterexample_challenge.challenge },
    ),
    evidence: substantiveText(
      resolution.counterexample_challenge.evidence,
      1000,
      'Counterexample evidence',
      { minimum: 24 },
    ),
  };

  return {
    user_confirmation: userConfirmation,
    facts_verified: normalizedFacts,
    assumptions_resolved: normalizedAssumptions,
    decisions_resolved: normalizedDecisions,
    success_evidence_confirmed: [...card.success_evidence],
    success_evidence_verifiers: successEvidenceVerifiers,
    counterexample_challenge: challenge,
  };
}

export async function invalidateActiveDeepRoute(value, permitId, reason, permitStatus) {
  const route = await readRoute(value.runtime.paths, { allowMissing: true });
  if (!route || route.status !== 'active' || route.implementation_permit_id !== permitId) return route;
  const current = await readCurrent(value.runtime.paths);
  const activationId = route.activation_id;
  route.status = 'broken';
  route.generation = (route.generation ?? 1) + 1;
  route.abandonment_reason = reason;
  route.implementation_permit_status = permitStatus;
  route.invalidated_activation_id = activationId ?? null;
  route.activation_id = null;
  route.execution_end = null;
  route.updated_at = new Date().toISOString();
  current.status = 'blocked';
  current.implementation_permit_id = null;
  current.route_instance_id = route.id;
  current.open_risks = [reason];
  current.next_action = 'Prepare and confirm a fresh Deep Start Card before any new consequential implementation.';
  current.updated_at = new Date().toISOString();
  await writeStepState(value.runtime.paths, route, current);
  if (activationId) await removeActivation(value.runtime.paths, activationId).catch(() => {});
  await releaseLease(value.runtime.paths, route.id).catch(() => {});
  await appendRuntimeEvent(value.runtime.paths, {
    type: 'deep-route-invalidated', route_id: route.id, permit_id: permitId, permit_status: permitStatus, reason,
  });
  return route;
}

async function loaded(project) {
  const context = await discoverContract(project ?? process.cwd());
  const truth = parseTruthMap(context.truthSource);
  const authority = await authoritySnapshot(context.executionRoot, truth, context.intentSource);
  const runtime = await attachWorktree(context, authority.authority_digest);
  return { context, authority, runtime };
}

export function startCardDigest(card) {
  const copy = structuredClone(card);
  delete copy.digest;
  return sha256Text(canonicalJson(copy));
}

export async function readDeepState(paths, { allowMissing = true } = {}) {
  try { return await readReceipt(paths.deep, 'Deep-mode state'); }
  catch (error) {
    if (allowMissing && error.code === 'MISSING_FILE') return null;
    throw error;
  }
}

export async function invalidateDeepPermitState(paths, permitId, reason = 'Deep Implementation Permit became invalid.') {
  const state = await readDeepState(paths, { allowMissing: true });
  if (!state?.permit || state.permit.id !== permitId || state.permit.status !== 'active') return state;
  const permit = {
    ...state.permit,
    generation: (state.permit.generation ?? 1) + 1,
    status: 'invalidated',
    invalidated_at: new Date().toISOString(),
    invalidate_reason: boundedText(reason, 1000, 'Permit invalidation reason'),
  };
  return writeReceipt(paths.deep, { ...state, status: 'permit-invalidated', permit, updated_at: new Date().toISOString() });
}

export async function prepareDeep(options = {}) {
  const value = await loaded(options.project);
  return withWorktreeStateLock(value.runtime.paths, async () => {
  const route = await readRoute(value.runtime.paths, { allowMissing: true });
  if (route?.status === 'active') throw conflictError('Cannot prepare deep mode while a controlled step is active.', 'ACTIVE_STEP');
  const task = boundedText(options.task, 2000, 'Deep task');
  const slice = boundedText(options.slice ?? task, 1000, 'Deep slice');
  const successEvidence = strings(options.success_evidence, 'Deep success evidence');
  if (!successEvidence.length) throw conflictError('Deep Start Card requires success evidence.', 'INVALID_DEEP_CARD');
  const facts = strings(options.facts, 'Deep fact');
  if (!facts.length) throw conflictError('Deep Start Card requires at least one discoverable fact to verify before implementation.', 'INVALID_DEEP_CARD');
  const decisionsNeeded = strings(options.decisions, 'Deep decision');
  if (!decisionsNeeded.length) throw conflictError('Deep Start Card requires at least one explicit user-owned decision before implementation.', 'INVALID_DEEP_CARD');
  const card = {
    id: `start-card-${randomUUID()}`,
    task,
    slice,
    success_evidence: successEvidence,
    facts,
    assumptions: strings(options.assumptions, 'Deep assumption'),
    decisions_needed: decisionsNeeded,
    execution_envelope: prepareExecutionEnvelope(options, successEvidence),
    authority_digest: value.authority.authority_digest,
    control_generation: value.context.manifest.control_generation,
    worktree_id: value.runtime.paths.worktree_id,
    created_at: new Date().toISOString(),
  };
  const questions = deepQuestions(card);
  const state = {
    schema_version: 2,
    mode: 'deep',
    status: 'awaiting-user-answer',
    start_card: card,
    questions,
    decision_receipts: [],
    next_question: questions[0],
    permit: null,
    updated_at: new Date().toISOString(),
  };
  const receipt = await writeReceipt(value.runtime.paths.deep, state);
  const current = await readCurrent(value.runtime.paths);
  current.task_mode = 'deep';
  current.deep_start_card_id = card.id;
  current.implementation_permit_id = null;
  current.status = 'blocked';
  current.open_risks = ['Deep mode requires explicit user confirmation before consequential implementation.'];
  current.next_action = 'Ask only the returned next_question, record the user answer, and repeat until the final Start Card is explicitly confirmed.';
  current.updated_at = new Date().toISOString();
  await writeCurrentProjection(value.runtime.paths, current);
  await appendRuntimeEvent(value.runtime.paths, { type: 'deep-start-card-prepared', start_card_id: card.id });
  return receipt;
  });
}

export async function answerDeepQuestion(options = {}) {
  const value = await loaded(options.project);
  return withWorktreeStateLock(value.runtime.paths, async () => {
  const state = await readDeepState(value.runtime.paths, { allowMissing: false });
  if (state.status !== 'awaiting-user-answer') {
    throw conflictError('Deep mode is not awaiting another user answer.', 'INVALID_DEEP_STATE');
  }
  if (state.start_card.authority_digest !== value.authority.authority_digest
      || state.start_card.control_generation !== value.context.manifest.control_generation
      || state.start_card.worktree_id !== value.runtime.paths.worktree_id) {
    throw conflictError('Deep Start Card is stale because project authority, control generation, or worktree changed.', 'DEEP_CARD_STALE');
  }
  const prior = validateDecisionReceipts(state);
  const question = state.questions[prior.length];
  const questionId = boundedText(options.question_id, 256, 'Deep question id');
  if (!question || question.id !== questionId) {
    throw conflictError(`Answer only the current Deep question${question ? `: ${question.id}` : ''}.`, 'DEEP_QUESTION_ORDER');
  }
  const selectedOption = boundedText(options.selected_option, 2000, 'Deep selected option');
  const userMessageLocator = confirmationSource(options.user_message_locator, 'Deep user-message locator');
  const decisionReceipt = {
    schema_version: 1,
    id: `decision-${randomUUID()}`,
    start_card_digest: startCardDigest(state.start_card),
    task_digest: sha256Text(state.start_card.task),
    question_id: question.id,
    question_kind: question.kind,
    subject: question.subject,
    selected_option: selectedOption,
    user_message_locator: userMessageLocator,
    recorded_at: new Date().toISOString(),
  };
  const decisionReceipts = [...prior, decisionReceipt];
  const nextQuestion = state.questions[decisionReceipts.length] ?? null;
  const next = {
    ...state,
    status: nextQuestion ? 'awaiting-user-answer' : 'awaiting-final-confirmation',
    decision_receipts: decisionReceipts,
    next_question: nextQuestion,
    permit: null,
    updated_at: new Date().toISOString(),
  };
  const receipt = await writeReceipt(value.runtime.paths.deep, next);
  const current = await readCurrent(value.runtime.paths);
  current.status = 'blocked';
  current.next_action = nextQuestion
    ? `Ask only Deep question ${nextQuestion.id}, then record that answer.`
    : 'Show the fully resolved Start Card to the user and request one explicit final confirmation before granting the Permit.';
  current.updated_at = new Date().toISOString();
  await writeCurrentProjection(value.runtime.paths, current);
  await appendRuntimeEvent(value.runtime.paths, {
    type: 'deep-question-answered',
    start_card_id: state.start_card.id,
    question_id: question.id,
    decision_receipt_id: decisionReceipt.id,
    remaining_questions: state.questions.length - decisionReceipts.length,
  });
  return receipt;
  });
}

export async function grantDeepPermit(options = {}) {
  if (options.confirmed_by_user !== true) throw conflictError('Implementation Permit requires explicit --confirmed-by-user.', 'USER_DECISION_REQUIRED');
  const value = await loaded(options.project);
  return withWorktreeStateLock(value.runtime.paths, async () => {
  const state = await readDeepState(value.runtime.paths, { allowMissing: false });
  if (state.status !== 'awaiting-final-confirmation' && state.status !== 'permit-revoked') throw conflictError('Deep questions must be answered one at a time before final Start Card confirmation.', 'DEEP_QUESTIONS_UNRESOLVED');
  if (state.start_card.authority_digest !== value.authority.authority_digest
      || state.start_card.control_generation !== value.context.manifest.control_generation
      || state.start_card.worktree_id !== value.runtime.paths.worktree_id) {
    throw conflictError('Deep Start Card is stale because project authority, control generation, or worktree changed.', 'DEEP_CARD_STALE');
  }
  const reason = boundedText(options.reason, 1000, 'Permit reason');
  const decisionReceipts = validateDecisionReceipts(state, { complete: true });
  const resolution = validateStartCardResolution(state.start_card, options.resolution);
  const executionEnvelope = validateExecutionEnvelope(state.start_card);
  for (const question of state.questions) {
    const receipt = decisionReceipts.find((item) => item.question_id === question.id);
    const resolved = question.kind === 'assumption'
      ? resolution.assumptions_resolved.find((item) => item.assumption === question.subject)?.rationale
      : resolution.decisions_resolved.find((item) => item.decision === question.subject)?.resolution;
    if (!receipt || resolved !== receipt.selected_option) {
      throw conflictError('The final Start Card resolution must exactly preserve every recorded user answer.', 'DEEP_DECISION_MISMATCH');
    }
  }
  const permit = {
    id: `permit-${randomUUID()}`,
    generation: 1,
    start_card_id: state.start_card.id,
    start_card_digest: startCardDigest(state.start_card),
    resolution,
    resolution_digest: sha256Text(canonicalJson(resolution)),
    task_digest: sha256Text(state.start_card.task),
    slice_digest: sha256Text(state.start_card.slice),
    decision_receipt_ids: decisionReceipts.map((item) => item.id),
    execution_envelope_digest: sha256Text(canonicalJson(executionEnvelope)),
    confirmed_by_user: true,
    reason,
    authority_digest: value.authority.authority_digest,
    control_generation: value.context.manifest.control_generation,
    worktree_id: value.runtime.paths.worktree_id,
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + (options.ttl_ms ?? PERMIT_TTL_MS)).toISOString(),
    status: 'active',
  };
  const next = { ...state, status: 'permitted', permit, updated_at: new Date().toISOString() };
  const receipt = await writeReceipt(value.runtime.paths.deep, next);
  const current = await readCurrent(value.runtime.paths);
  current.task_mode = 'deep';
  current.deep_start_card_id = state.start_card.id;
  current.implementation_permit_id = permit.id;
  current.status = 'ready';
  current.open_risks = [];
  current.next_action = `Implementation Permit ${permit.id} authorizes only the approved Start Card slice.`;
  current.updated_at = new Date().toISOString();
  await writeCurrentProjection(value.runtime.paths, current);
  await appendRuntimeEvent(value.runtime.paths, { type: 'deep-permit-granted', start_card_id: state.start_card.id, permit_id: permit.id });
  return receipt;
  });
}

export async function validateDeepPermit(context, runtime, authority, { required = false, slice = null, envelope = null } = {}) {
  const state = await readDeepState(runtime.paths, { allowMissing: true });
  if (!state || state.status !== 'permitted' || state.permit?.status !== 'active') {
    if (required) throw conflictError('Deep mode requires an active user-confirmed Implementation Permit.', 'IMPLEMENTATION_PERMIT_REQUIRED');
    return null;
  }
  const permit = state.permit;
  if (permit.start_card_digest !== startCardDigest(state.start_card)) {
    throw conflictError('Implementation Permit no longer matches the reviewed Start Card.', 'IMPLEMENTATION_PERMIT_STALE');
  }
  const resolution = validateStartCardResolution(state.start_card, permit.resolution);
  if (permit.resolution_digest !== sha256Text(canonicalJson(resolution))) {
    throw conflictError('Implementation Permit resolution was modified after confirmation.', 'IMPLEMENTATION_PERMIT_STALE');
  }
  const decisionReceipts = validateDecisionReceipts(state, { complete: true });
  if (permit.task_digest !== sha256Text(state.start_card.task)
      || permit.slice_digest !== sha256Text(state.start_card.slice)
      || canonicalJson(permit.decision_receipt_ids) !== canonicalJson(decisionReceipts.map((item) => item.id))) {
    throw conflictError('Implementation Permit no longer matches the reviewed task, slice, or decision receipts.', 'IMPLEMENTATION_PERMIT_STALE');
  }
  const executionEnvelope = validateExecutionEnvelope(state.start_card, envelope);
  if (permit.execution_envelope_digest !== sha256Text(canonicalJson(executionEnvelope))) {
    throw conflictError('Implementation Permit no longer matches the reviewed execution envelope.', 'IMPLEMENTATION_PERMIT_STALE');
  }
  if (permit.authority_digest !== authority.authority_digest || permit.control_generation !== context.manifest.control_generation || permit.worktree_id !== runtime.paths.worktree_id) {
    throw conflictError('Implementation Permit is stale for the current authority, control generation, or worktree.', 'IMPLEMENTATION_PERMIT_STALE');
  }
  if (Date.parse(permit.expires_at) <= Date.now()) throw conflictError('Implementation Permit expired.', 'IMPLEMENTATION_PERMIT_EXPIRED');
  if (slice && state.start_card.slice !== slice) throw conflictError('Requested step does not match the user-approved Deep Start Card slice.', 'IMPLEMENTATION_PERMIT_SCOPE');
  return state;
}

export async function revokeDeepPermit(options = {}) {
  const value = await loaded(options.project);
  return withWorktreeStateLock(value.runtime.paths, async () => {
    const state = await readDeepState(value.runtime.paths, { allowMissing: false });
    const reason = boundedText(options.reason ?? 'Deep Implementation Permit was revoked.', 1000, 'Revoke reason');
    const permit = state.permit ? { ...state.permit, generation:(state.permit.generation??1)+1, status: 'revoked', revoked_at: new Date().toISOString(), revoke_reason: reason } : null;
    const next = { ...state, status: 'permit-revoked', permit, updated_at: new Date().toISOString() };
    const receipt = await writeReceipt(value.runtime.paths.deep, next);
    await invalidateActiveDeepRoute(value, permit?.id ?? null, reason, 'revoked');
    const current = await readCurrent(value.runtime.paths);
    current.implementation_permit_id = null;
    if (current.task_mode === 'deep') {
      current.status = 'blocked';
      current.open_risks = [reason];
      current.next_action = 'Prepare or confirm a fresh Deep Start Card before consequential implementation.';
    }
    current.updated_at = new Date().toISOString();
    await writeCurrentProjection(value.runtime.paths, current);
    await appendRuntimeEvent(value.runtime.paths, { type: 'deep-permit-revoked', permit_id: permit?.id ?? null, reason });
    return receipt;
  });
}

export async function consumeDeepPermit(paths, permitId, reason = 'Controlled step exited.') {
  const state = await readDeepState(paths, { allowMissing: true });
  if (!state?.permit || state.permit.id !== permitId || state.permit.status !== 'active') return null;
  const next = {
    ...state,
    status: 'permit-consumed',
    permit: { ...state.permit, generation:(state.permit.generation??1)+1, status: 'consumed', consumed_at: new Date().toISOString(), consume_reason: reason },
    updated_at: new Date().toISOString(),
  };
  return writeReceipt(paths.deep, next);
}
