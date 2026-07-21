import { randomUUID } from 'node:crypto';
import {
  readProjectJson, canonicalJson, safeRelative, sha256Text, boundedText, containsSecret,
  resolveInside, transactionalWrites,
} from './files.mjs';
import { conflictError } from './errors.mjs';
import {
  OUTCOME_ACCEPTANCE_MAX, OUTCOME_COUNT_MAX, OUTCOME_DEPENDENCY_MAX,
  OUTCOME_REGISTRY_BUDGET_BYTES, OUTCOME_TEXT_LIMIT,
} from './constants.mjs';

const REGISTRY_KEYS = new Set([
  'schema_version', 'goal_id', 'goal_revision_digest', 'coverage_status',
  'coverage_decision', 'integration_worktree_id', 'coverage_sources', 'validator_migrations', 'outcomes',
]);
const SOURCE_KEYS = new Set([
  'id', 'truth_id', 'source_revision_digest', 'expected_id_count',
  'expected_id_set_digest', 'mapping_path', 'mapping_revision_digest',
]);
const OUTCOME_KEYS = new Set([
  'id', 'title', 'authority_sources', 'parent_id', 'dependencies', 'disposition',
  'superseded_by', 'required_at', 'acceptance', 'decision_receipt', 'revision_digest',
]);
const ACCEPTANCE_KEYS = new Set(['id', 'claim', 'evidence_kind', 'required_maturity', 'validator']);
const VALIDATOR_KEYS = new Set([
  'kind', 'command', 'path', 'adapter', 'decision_type', 'validator_revision', 'covers_paths',
]);
const RECEIPT_KEYS = new Set([
  'id', 'action', 'target_ids', 'prior_registry_digest', 'result_registry_digest',
  'user_message_locator', 'reason', 'recorded_at',
]);
const MAPPING_KEYS = new Set(['schema_version', 'source_id', 'source_revision_digest', 'entries']);
const MAPPING_ENTRY_KEYS = new Set([
  'source_item_id', 'disposition', 'outcome_ids', 'equivalence_group',
  'target_source_item_ids', 'reason',
]);
const VALIDATOR_MIGRATION_KEYS = new Set([
  'id', 'outcome_id', 'acceptance_id', 'old_node', 'positive_replacement', 'negative_replacement',
  'authority_reason', 'outcome_revision_digest', 'decision_receipt',
]);
const COVERAGE_STATUSES = new Set(['draft', 'confirmed', 'changed']);
const OUTCOME_DISPOSITIONS = new Set(['candidate', 'required', 'deferred', 'rejected', 'superseded']);
const REQUIRED_BOUNDARIES = new Set(['goal', 'release']);
const EVIDENCE_KINDS = new Set([
  'command-or-artifact', 'command', 'artifact', 'authority', 'external',
  'user-decision', 'review-decision',
]);
const MATURITIES = new Set(['structural', 'functional', 'external', 'reviewed', 'owner-accepted', 'release']);
const VALIDATOR_KINDS = new Set(['command', 'artifact', 'authority-adapter', 'user-decision', 'review-decision']);
const MAPPING_DISPOSITIONS = new Set(['mapped', 'duplicate_of', 'historical', 'rejected', 'superseded_by']);

function only(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw conflictError(`${label} must be an object.`, 'INVALID_OUTCOMES');
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw conflictError(`${label} contains unsupported field: ${key}`, 'INVALID_OUTCOMES');
}

function logicalId(value, label) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{2,95}$/.test(value)) throw conflictError(`${label} is invalid.`, 'INVALID_OUTCOMES');
  return value;
}

function sourceItemId(value, label = 'Source item id') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)) throw conflictError(`${label} is invalid.`, 'INVALID_COVERAGE_MAPPING');
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) throw conflictError(`${label} must be a sha256 digest.`, 'INVALID_OUTCOMES');
  return value;
}

function stringArray(value, label, { max = 64, ids = false, allowEmpty = true } = {}) {
  if (!Array.isArray(value) || value.length > max || (!allowEmpty && value.length === 0)) throw conflictError(`${label} must be an array with at most ${max} entries.`, 'INVALID_OUTCOMES');
  const seen = new Set();
  for (const item of value) {
    const normalized = ids ? logicalId(item, `${label} entry`) : boundedText(item, OUTCOME_TEXT_LIMIT, `${label} entry`);
    if (seen.has(normalized)) throw conflictError(`${label} contains a duplicate entry: ${normalized}`, 'INVALID_OUTCOMES');
    seen.add(normalized);
  }
  return value;
}

function validateDecisionReceipt(value, label, { allowNull = false } = {}) {
  if (value === null && allowNull) return null;
  only(value, RECEIPT_KEYS, label);
  if (typeof value.id !== 'string' || !/^decision-[a-z0-9-]{8,95}$/.test(value.id)) throw conflictError(`${label} id is invalid.`, 'INVALID_OUTCOMES');
  boundedText(value.action, 96, `${label} action`);
  stringArray(value.target_ids, `${label} target_ids`, { max: 64, ids: true, allowEmpty: false });
  digest(value.prior_registry_digest, `${label} prior_registry_digest`);
  digest(value.result_registry_digest, `${label} result_registry_digest`);
  boundedText(value.user_message_locator, 500, `${label} user_message_locator`);
  boundedText(value.reason, 1000, `${label} reason`);
  if (typeof value.recorded_at !== 'string' || Number.isNaN(Date.parse(value.recorded_at))) throw conflictError(`${label} recorded_at is invalid.`, 'INVALID_OUTCOMES');
  return value;
}

function validateValidator(value, label) {
  only(value, VALIDATOR_KEYS, label);
  if (!VALIDATOR_KINDS.has(value.kind)) throw conflictError(`${label} kind is unsupported.`, 'INVALID_OUTCOMES');
  digest(value.validator_revision, `${label} validator_revision`);
  if (value.command !== undefined) {
    if (value.kind !== 'command' || !Array.isArray(value.command) || value.command.length === 0 || value.command.length > 32) throw conflictError(`${label} command is invalid.`, 'INVALID_OUTCOMES');
    for (const argument of value.command) boundedText(argument, 1024, `${label} command argument`);
  }
  if (value.path !== undefined) safeRelative(value.path, `${label} path`);
  if (value.adapter !== undefined) logicalId(value.adapter, `${label} adapter`);
  if (value.decision_type !== undefined) logicalId(value.decision_type, `${label} decision_type`);
  stringArray(value.covers_paths ?? [], `${label} covers_paths`, { max: 64 });
  if (value.kind === 'command' && !value.command) throw conflictError(`${label} command validator requires command.`, 'INVALID_OUTCOMES');
  if (value.kind === 'artifact' && !value.path) throw conflictError(`${label} artifact validator requires path.`, 'INVALID_OUTCOMES');
  if (value.kind === 'authority-adapter' && !value.adapter) throw conflictError(`${label} authority validator requires adapter.`, 'INVALID_OUTCOMES');
  if (['user-decision', 'review-decision'].includes(value.kind) && !value.decision_type) throw conflictError(`${label} decision validator requires decision_type.`, 'INVALID_OUTCOMES');
  return value;
}

function validateAcceptance(value, label) {
  only(value, ACCEPTANCE_KEYS, label);
  logicalId(value.id, `${label} id`);
  boundedText(value.claim, OUTCOME_TEXT_LIMIT, `${label} claim`);
  if (!EVIDENCE_KINDS.has(value.evidence_kind)) throw conflictError(`${label} evidence_kind is unsupported.`, 'INVALID_OUTCOMES');
  if (!MATURITIES.has(value.required_maturity)) throw conflictError(`${label} required_maturity is unsupported.`, 'INVALID_OUTCOMES');
  validateValidator(value.validator, `${label} validator`);
  const kindCompatibility={
    command:new Set(['command','command-or-artifact']),artifact:new Set(['artifact','command-or-artifact']),
    'authority-adapter':new Set(['authority','external']),'user-decision':new Set(['user-decision']),'review-decision':new Set(['review-decision']),
  };
  if (!kindCompatibility[value.validator.kind].has(value.evidence_kind)) throw conflictError(`${label} evidence_kind does not match its validator.`, 'INVALID_OUTCOMES');
  if (value.required_maturity==='external'&&value.validator.kind!=='authority-adapter') throw conflictError(`${label} external maturity requires an authority adapter.`, 'INVALID_OUTCOMES');
  if (value.required_maturity==='reviewed'&&value.validator.kind!=='review-decision') throw conflictError(`${label} reviewed maturity requires a review decision.`, 'INVALID_OUTCOMES');
  if (value.required_maturity==='owner-accepted'&&value.validator.kind!=='user-decision') throw conflictError(`${label} owner acceptance requires a user decision.`, 'INVALID_OUTCOMES');
  return value;
}

function validateOutcome(value, label) {
  only(value, OUTCOME_KEYS, label);
  logicalId(value.id, `${label} id`);
  boundedText(value.title, OUTCOME_TEXT_LIMIT, `${label} title`);
  stringArray(value.authority_sources, `${label} authority_sources`, { max: 32, allowEmpty: false });
  if (value.parent_id !== null) logicalId(value.parent_id, `${label} parent_id`);
  stringArray(value.dependencies, `${label} dependencies`, { max: OUTCOME_DEPENDENCY_MAX, ids: true });
  stringArray(value.superseded_by, `${label} superseded_by`, { max: OUTCOME_DEPENDENCY_MAX, ids: true });
  if (!OUTCOME_DISPOSITIONS.has(value.disposition)) throw conflictError(`${label} disposition is unsupported.`, 'INVALID_OUTCOMES');
  if (value.disposition === 'superseded' && value.superseded_by.length === 0) throw conflictError(`${label} superseded Outcome requires replacements.`, 'INVALID_OUTCOMES');
  if (value.disposition !== 'superseded' && value.superseded_by.length !== 0) throw conflictError(`${label} has replacements but is not superseded.`, 'INVALID_OUTCOMES');
  stringArray(value.required_at, `${label} required_at`, { max: 2 });
  if (value.required_at.some((item) => !REQUIRED_BOUNDARIES.has(item))) throw conflictError(`${label} required_at is unsupported.`, 'INVALID_OUTCOMES');
  if (!Array.isArray(value.acceptance) || value.acceptance.length > OUTCOME_ACCEPTANCE_MAX) throw conflictError(`${label} acceptance is invalid.`, 'INVALID_OUTCOMES');
  value.acceptance.forEach((item, index) => validateAcceptance(item, `${label} acceptance[${index}]`));
  validateDecisionReceipt(value.decision_receipt, `${label} decision_receipt`, { allowNull: value.disposition === 'candidate' });
  digest(value.revision_digest, `${label} revision_digest`);
  return value;
}

function validateCoverageSource(value, label) {
  only(value, SOURCE_KEYS, label);
  logicalId(value.id, `${label} id`);
  logicalId(value.truth_id, `${label} truth_id`);
  digest(value.source_revision_digest, `${label} source_revision_digest`);
  if (!Number.isInteger(value.expected_id_count) || value.expected_id_count < 0 || value.expected_id_count > 1_000_000) throw conflictError(`${label} expected_id_count is invalid.`, 'INVALID_OUTCOMES');
  digest(value.expected_id_set_digest, `${label} expected_id_set_digest`);
  value.mapping_path = safeRelative(value.mapping_path, `${label} mapping_path`);
  digest(value.mapping_revision_digest, `${label} mapping_revision_digest`);
  return value;
}

export function emptyOutcomeRegistry(goalId = 'goal_project_delivery', goalRevisionDigest = `sha256:${sha256Text('unconfirmed-goal')}`) {
  return {
    schema_version: 1,
    goal_id: logicalId(goalId, 'Outcome registry goal_id'),
    goal_revision_digest: digest(goalRevisionDigest, 'Outcome registry goal_revision_digest'),
    coverage_status: 'draft',
    coverage_decision: null,
    integration_worktree_id: null,
    coverage_sources: [],
    validator_migrations: [],
    outcomes: [],
  };
}

function registryDigestMaterial(value) {
  const copy = structuredClone(value);
  if (copy.coverage_decision) copy.coverage_decision.result_registry_digest = `sha256:${'0'.repeat(64)}`;
  for (const outcome of copy.outcomes ?? []) if (outcome.decision_receipt) outcome.decision_receipt.result_registry_digest = `sha256:${'0'.repeat(64)}`;
  for (const migration of copy.validator_migrations ?? []) if (migration.decision_receipt) migration.decision_receipt.result_registry_digest = `sha256:${'0'.repeat(64)}`;
  return copy;
}

export function outcomeRegistryDigest(value) {
  const validated = validateOutcomeRegistry(structuredClone(value));
  return `sha256:${sha256Text(canonicalJson(registryDigestMaterial(validated)))}`;
}

export function validateOutcomeRegistry(value) {
  only(value, REGISTRY_KEYS, 'Outcome registry');
  if (value.schema_version !== 1) throw conflictError('Outcome registry schema_version must be 1.', 'INVALID_OUTCOMES');
  logicalId(value.goal_id, 'Outcome registry goal_id');
  digest(value.goal_revision_digest, 'Outcome registry goal_revision_digest');
  if (!COVERAGE_STATUSES.has(value.coverage_status)) throw conflictError('Outcome registry coverage_status is invalid.', 'INVALID_OUTCOMES');
  validateDecisionReceipt(value.coverage_decision, 'Outcome registry coverage_decision', { allowNull: value.coverage_status !== 'confirmed' });
  if (value.integration_worktree_id !== null && (typeof value.integration_worktree_id !== 'string' || !/^[a-zA-Z0-9._:-]{8,160}$/.test(value.integration_worktree_id))) throw conflictError('Outcome registry integration_worktree_id is invalid.', 'INVALID_OUTCOMES');
  if (!Array.isArray(value.coverage_sources) || value.coverage_sources.length > 256) throw conflictError('Outcome registry coverage_sources is invalid.', 'INVALID_OUTCOMES');
  if (!Array.isArray(value.validator_migrations) || value.validator_migrations.length > 2048) throw conflictError('Outcome registry validator_migrations is invalid.', 'INVALID_OUTCOMES');
  if (!Array.isArray(value.outcomes) || value.outcomes.length > OUTCOME_COUNT_MAX) throw conflictError('Outcome registry outcomes is invalid.', 'INVALID_OUTCOMES');
  value.coverage_sources.forEach((item, index) => validateCoverageSource(item, `Coverage source[${index}]`));
  value.outcomes.forEach((item, index) => validateOutcome(item, `Outcome[${index}]`));
  const sourceIds = new Set();
  for (const source of value.coverage_sources) {
    if (sourceIds.has(source.id)) throw conflictError(`Duplicate coverage source: ${source.id}`, 'INVALID_OUTCOMES');
    sourceIds.add(source.id);
  }
  const outcomeIds = new Set();
  const acceptanceIds = new Set();
  for (const item of value.outcomes) {
    if (outcomeIds.has(item.id)) throw conflictError(`Duplicate Outcome: ${item.id}`, 'INVALID_OUTCOMES');
    outcomeIds.add(item.id);
    for (const acceptance of item.acceptance) {
      if (acceptanceIds.has(acceptance.id)) throw conflictError(`Duplicate acceptance id: ${acceptance.id}`, 'INVALID_OUTCOMES');
      acceptanceIds.add(acceptance.id);
    }
  }
  const migrationIds=new Set();
  for (const [index,migration] of value.validator_migrations.entries()) {
    const label=`Validator migration[${index}]`; only(migration,VALIDATOR_MIGRATION_KEYS,label);
    logicalId(migration.id,`${label} id`); logicalId(migration.outcome_id,`${label} outcome_id`); logicalId(migration.acceptance_id,`${label} acceptance_id`);
    digest(migration.old_node,`${label} old_node`); digest(migration.positive_replacement,`${label} positive_replacement`);
    boundedText(migration.negative_replacement,OUTCOME_TEXT_LIMIT,`${label} negative_replacement`); boundedText(migration.authority_reason,OUTCOME_TEXT_LIMIT,`${label} authority_reason`);
    digest(migration.outcome_revision_digest,`${label} outcome_revision_digest`); validateDecisionReceipt(migration.decision_receipt,`${label} decision_receipt`);
    if (migrationIds.has(migration.id)||migration.old_node===migration.positive_replacement) throw conflictError(`${label} is duplicated or does not replace a prior validator.`, 'INVALID_OUTCOMES');
    migrationIds.add(migration.id);
    const outcome=value.outcomes.find((item)=>item.id===migration.outcome_id);
    const acceptance=outcome?.acceptance.find((item)=>item.id===migration.acceptance_id);
    if (!outcome||!acceptance||outcome.revision_digest!==migration.outcome_revision_digest||acceptance.validator.validator_revision!==migration.positive_replacement) throw conflictError(`${label} does not match the current Outcome and acceptance revisions.`, 'INVALID_OUTCOMES');
  }
  for (const item of value.outcomes) {
    if (item.parent_id !== null && !outcomeIds.has(item.parent_id)) throw conflictError(`Outcome ${item.id} has an unknown parent.`, 'INVALID_OUTCOMES');
    for (const dependency of item.dependencies) if (!outcomeIds.has(dependency)) throw conflictError(`Outcome ${item.id} has an unknown dependency: ${dependency}`, 'INVALID_OUTCOMES');
    for (const replacement of item.superseded_by) if (!outcomeIds.has(replacement)) throw conflictError(`Outcome ${item.id} has an unknown replacement: ${replacement}`, 'INVALID_OUTCOMES');
  }
  const bytes = Buffer.byteLength(canonicalJson(value), 'utf8');
  if (bytes > OUTCOME_REGISTRY_BUDGET_BYTES) throw conflictError(`Outcome registry exceeds ${OUTCOME_REGISTRY_BUDGET_BYTES} bytes.`, 'OUTCOMES_TOO_LARGE');
  if (containsSecret(value)) throw conflictError('Outcome registry appears to contain a secret.', 'SECRET_VALUE');
  return value;
}

function mappingEntry(value, index, outcomeIds) {
  const label = `Coverage mapping entry[${index}]`;
  only(value, MAPPING_ENTRY_KEYS, label);
  sourceItemId(value.source_item_id, `${label} source_item_id`);
  if (!MAPPING_DISPOSITIONS.has(value.disposition)) throw conflictError(`${label} disposition is unsupported.`, 'INVALID_COVERAGE_MAPPING');
  boundedText(value.reason, 1000, `${label} reason`);
  const hasOutcomes = value.outcome_ids !== undefined;
  const hasTargets = value.target_source_item_ids !== undefined;
  const hasGroup = value.equivalence_group !== undefined;
  if (value.disposition === 'mapped') {
    if (!hasOutcomes || hasTargets) throw conflictError(`${label} has incompatible mapping fields.`, 'INVALID_COVERAGE_MAPPING');
    stringArray(value.outcome_ids, `${label} outcome_ids`, { max: 32, ids: true, allowEmpty: false });
    for (const id of value.outcome_ids) if (!outcomeIds.has(id)) throw conflictError(`${label} references unknown Outcome: ${id}`, 'INVALID_COVERAGE_MAPPING');
    if (hasGroup) logicalId(value.equivalence_group, `${label} equivalence_group`);
  } else if (['duplicate_of', 'superseded_by'].includes(value.disposition)) {
    if (!hasTargets || hasOutcomes || hasGroup) throw conflictError(`${label} has incompatible mapping fields.`, 'INVALID_COVERAGE_MAPPING');
    if (!Array.isArray(value.target_source_item_ids) || value.target_source_item_ids.length === 0 || value.target_source_item_ids.length > 32) throw conflictError(`${label} target_source_item_ids is invalid.`, 'INVALID_COVERAGE_MAPPING');
    const seen = new Set();
    for (const target of value.target_source_item_ids) {
      sourceItemId(target, `${label} target_source_item_id`);
      if (seen.has(target)) throw conflictError(`${label} contains duplicate target source ids.`, 'INVALID_COVERAGE_MAPPING');
      seen.add(target);
    }
  } else if (hasOutcomes || hasTargets || hasGroup) {
    throw conflictError(`${label} has incompatible mapping fields.`, 'INVALID_COVERAGE_MAPPING');
  }
  return value;
}

export function validateCoverageMapping(value, registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  only(value, MAPPING_KEYS, 'Coverage mapping');
  if (value.schema_version !== 1) throw conflictError('Coverage mapping schema_version must be 1.', 'INVALID_COVERAGE_MAPPING');
  logicalId(value.source_id, 'Coverage mapping source_id');
  digest(value.source_revision_digest, 'Coverage mapping source_revision_digest');
  const source = registry.coverage_sources.find((item) => item.id === value.source_id);
  if (!source) throw conflictError(`Coverage mapping references unknown source: ${value.source_id}`, 'INVALID_COVERAGE_MAPPING');
  if (source.source_revision_digest !== value.source_revision_digest) throw conflictError('Coverage mapping source revision does not match the registry.', 'INVALID_COVERAGE_MAPPING');
  if (!Array.isArray(value.entries) || value.entries.length > 1_000_000) throw conflictError('Coverage mapping entries is invalid.', 'INVALID_COVERAGE_MAPPING');
  const outcomeIds = new Set(registry.outcomes.map((item) => item.id));
  value.entries.forEach((item, index) => mappingEntry(item, index, outcomeIds));
  const entries = new Map();
  for (const item of value.entries) {
    if (entries.has(item.source_item_id)) throw conflictError(`Duplicate source item: ${item.source_item_id}`, 'INVALID_COVERAGE_MAPPING');
    entries.set(item.source_item_id, item);
  }
  for (const item of value.entries) for (const target of item.target_source_item_ids ?? []) {
    if (!entries.has(target)) throw conflictError(`Coverage mapping has a dangling source item reference: ${target}`, 'INVALID_COVERAGE_MAPPING');
  }
  const visiting = new Set();
  const visited = new Set();
  const walk = (id) => {
    if (visiting.has(id)) throw conflictError(`Coverage mapping contains a cycle at ${id}.`, 'INVALID_COVERAGE_MAPPING');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of entries.get(id)?.target_source_item_ids ?? []) walk(target);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of entries.keys()) walk(id);
  return value;
}

export async function loadOutcomeRegistry(context, { allowLegacy = false } = {}) {
  if (context.manifest.schema_version === 1) {
    if (allowLegacy) return null;
    throw conflictError('This project uses Contract schema 1. Run `vibetether upgrade --project . --dry-run` before consequential work.', 'UPGRADE_REQUIRED');
  }
  const value = context.outcomes ?? await readProjectJson(context.root, context.manifest.outcome_index, 'Outcome registry');
  return validateOutcomeRegistry(value);
}

export async function auditCoverageSources(context, registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const issues = [];
  const sources = [];
  for (const source of registry.coverage_sources) {
    try {
      const mapping = validateCoverageMapping(await readProjectJson(context.root, source.mapping_path, `Coverage mapping ${source.id}`), registry);
      const ids = mapping.entries.map((item) => item.source_item_id).sort();
      const idSetDigest = `sha256:${sha256Text(canonicalJson(ids))}`;
      const mappingDigest = `sha256:${sha256Text(canonicalJson(mapping))}`;
      if (ids.length !== source.expected_id_count) issues.push({ code: 'SOURCE_ID_COUNT_MISMATCH', source_id: source.id, expected: source.expected_id_count, observed: ids.length });
      if (idSetDigest !== source.expected_id_set_digest) issues.push({ code: 'SOURCE_ID_SET_MISMATCH', source_id: source.id, expected: source.expected_id_set_digest, observed: idSetDigest });
      if (mappingDigest !== source.mapping_revision_digest) issues.push({ code: 'SOURCE_MAPPING_DIGEST_MISMATCH', source_id: source.id, expected: source.mapping_revision_digest, observed: mappingDigest });
      if (mapping.source_revision_digest !== source.source_revision_digest) issues.push({ code: 'SOURCE_REVISION_MISMATCH', source_id: source.id });
      sources.push({ source_id: source.id, mapped_count: ids.length, id_set_digest: idSetDigest, mapping_digest: mappingDigest });
    } catch (error) {
      issues.push({ code: error.code ?? 'INVALID_COVERAGE_MAPPING', source_id: source.id, message: error.message });
      sources.push({ source_id: source.id, mapped_count: 0 });
    }
  }
  return { ok: issues.length === 0, sources, issues };
}

function decisionReceipt({ action, targetIds, priorDigest, userMessageLocator, reason }) {
  return {
    id: `decision-${randomUUID()}`,
    action: boundedText(action, 96, 'Outcome decision action'),
    target_ids: [...targetIds],
    prior_registry_digest: priorDigest,
    result_registry_digest: `sha256:${'0'.repeat(64)}`,
    user_message_locator: boundedText(userMessageLocator, 500, 'User message locator'),
    reason: boundedText(reason, 1000, 'Outcome decision reason'),
    recorded_at: new Date().toISOString(),
  };
}

function requireUserDecision(options = {}) {
  if (typeof options.user_message_locator !== 'string' || !options.user_message_locator.trim()
      || typeof options.reason !== 'string' || !options.reason.trim()) {
    throw conflictError('Directional Outcome changes require a user message locator and reason; --yes alone is not authorization.', 'USER_DECISION_REQUIRED');
  }
}

function finalizeReceiptDigest(registry, receipt) {
  const resultDigest = outcomeRegistryDigest(registry);
  receipt.result_registry_digest = resultDigest;
  for (const item of registry.outcomes) if (item.decision_receipt?.id === receipt.id) item.decision_receipt.result_registry_digest = resultDigest;
  for (const item of registry.validator_migrations) if (item.decision_receipt?.id === receipt.id) item.decision_receipt.result_registry_digest = resultDigest;
  if (registry.coverage_decision?.id === receipt.id) registry.coverage_decision.result_registry_digest = resultDigest;
  validateOutcomeRegistry(registry);
  return registry;
}

export function recordValidatorMigration(registryValue,{outcome_id,acceptance_id,old_node,positive_replacement,negative_replacement,user_message_locator,reason}={}) {
  requireUserDecision({user_message_locator,reason});
  const registry=validateOutcomeRegistry(structuredClone(registryValue));
  const outcome=registry.outcomes.find((item)=>item.id===outcome_id);
  const acceptance=outcome?.acceptance.find((item)=>item.id===acceptance_id);
  if (!outcome||!acceptance) throw conflictError('Validator migration must name a current Outcome acceptance.', 'ACCEPTANCE_NOT_FOUND');
  digest(old_node,'Validator migration old_node'); digest(positive_replacement,'Validator migration positive_replacement');
  if (positive_replacement!==acceptance.validator.validator_revision) throw conflictError('Validator migration positive replacement must be the current acceptance validator revision.', 'VALIDATOR_MIGRATION_MISMATCH');
  boundedText(negative_replacement,OUTCOME_TEXT_LIMIT,'Validator migration negative replacement');
  const receipt=decisionReceipt({action:'record-validator-migration',targetIds:[outcome.id,acceptance.id],priorDigest:outcomeRegistryDigest(registry),userMessageLocator:user_message_locator,reason});
  registry.validator_migrations.push({
    id:`validator_migration_${sha256Text(`${outcome.id}:${acceptance.id}:${old_node}:${positive_replacement}`).slice(0,24)}`,
    outcome_id:outcome.id,acceptance_id:acceptance.id,old_node,positive_replacement,
    negative_replacement:boundedText(negative_replacement,OUTCOME_TEXT_LIMIT,'Validator migration negative replacement'),
    authority_reason:boundedText(reason,OUTCOME_TEXT_LIMIT,'Validator migration authority reason'),
    outcome_revision_digest:outcome.revision_digest,decision_receipt:receipt,
  });
  return finalizeReceiptDigest(registry,receipt);
}

export function proposeOutcome(registryValue, outcomeValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const outcome = structuredClone(outcomeValue);
  if (outcome?.disposition !== 'candidate' || outcome?.decision_receipt !== null) throw conflictError('A proposed Outcome must be a non-authoritative candidate.', 'INVALID_OUTCOME_PROPOSAL');
  if (registry.outcomes.some((item) => item.id === outcome.id)) throw conflictError(`Outcome already exists: ${outcome.id}`, 'OUTCOME_EXISTS');
  registry.outcomes.push(outcome);
  validateOutcomeRegistry(registry);
  return registry;
}

export function decideOutcome(registryValue, { action, id, replacements = [], user_message_locator, reason } = {}) {
  requireUserDecision({ user_message_locator, reason });
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const item = registry.outcomes.find((candidate) => candidate.id === id);
  if (!item) throw conflictError(`Outcome is not found: ${id}`, 'OUTCOME_NOT_FOUND');
  const disposition = ({ confirm: 'required', defer: 'deferred', reject: 'rejected', supersede: 'superseded' })[action];
  if (!disposition) throw conflictError(`Outcome decision is unsupported: ${action}`, 'INVALID_OUTCOME_DECISION');
  if (item.disposition === 'superseded') throw conflictError(`Outcome is already superseded: ${id}`, 'OUTCOME_ALREADY_DISPOSITIONED');
  if (action === 'supersede') {
    stringArray(replacements, 'Outcome replacements', { max: OUTCOME_DEPENDENCY_MAX, ids: true, allowEmpty: false });
    if (replacements.includes(id)) throw conflictError('An Outcome cannot supersede itself.', 'INVALID_OUTCOME_DECISION');
    for (const replacement of replacements) if (!registry.outcomes.some((candidate) => candidate.id === replacement && !['candidate', 'rejected', 'superseded'].includes(candidate.disposition))) {
      throw conflictError(`Replacement Outcome is not active: ${replacement}`, 'INVALID_OUTCOME_DECISION');
    }
  } else if (replacements.length) throw conflictError('Only supersede accepts replacement Outcomes.', 'INVALID_OUTCOME_DECISION');
  const receipt = decisionReceipt({
    action: action === 'confirm' ? 'confirm-required' : action,
    targetIds: [id, ...replacements],
    priorDigest: outcomeRegistryDigest(registry),
    userMessageLocator: user_message_locator,
    reason,
  });
  item.disposition = disposition;
  item.superseded_by = action === 'supersede' ? [...replacements] : [];
  item.decision_receipt = receipt;
  return finalizeReceiptDigest(registry, receipt);
}

export async function confirmOutcomeCoverage(context, registryValue, worktreeId, options = {}) {
  requireUserDecision(options);
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const candidates = registry.outcomes.filter((item) => item.disposition === 'candidate').map((item) => item.id);
  if (candidates.length) throw conflictError(`Coverage contains unresolved candidate Outcomes: ${candidates.join(', ')}`, 'OUTCOME_CANDIDATES_UNRESOLVED');
  const audit = await auditCoverageSources(context, registry);
  if (!audit.ok) {
    const summary = audit.issues.map((item) => `${item.code}:${item.source_id}`).join(', ');
    throw conflictError(`Exact source-ID coverage audit failed: ${summary}`, 'COVERAGE_AUDIT_FAILED');
  }
  if (typeof worktreeId !== 'string' || !worktreeId) throw conflictError('Coverage confirmation requires the integration worktree identity.', 'WORKTREE_ID_REQUIRED');
  const receipt = decisionReceipt({
    action: 'confirm-coverage',
    targetIds: [registry.goal_id],
    priorDigest: outcomeRegistryDigest(registry),
    userMessageLocator: options.user_message_locator,
    reason: options.reason,
  });
  registry.coverage_status = 'confirmed';
  registry.integration_worktree_id = worktreeId;
  registry.coverage_decision = receipt;
  return { registry: finalizeReceiptDigest(registry, receipt), audit };
}

export function outcomeStatus(registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const counts = Object.fromEntries([...OUTCOME_DISPOSITIONS].map((state) => [state, 0]));
  for (const item of registry.outcomes) counts[item.disposition] += 1;
  const observedDigest = outcomeRegistryDigest(registry);
  const decisionDigest = registry.coverage_decision?.result_registry_digest ?? null;
  const effectiveCoverageStatus = registry.coverage_status === 'confirmed' && decisionDigest !== observedDigest ? 'changed' : registry.coverage_status;
  return {
    goal_id: registry.goal_id,
    goal_revision_digest: registry.goal_revision_digest,
    coverage_status: effectiveCoverageStatus,
    declared_coverage_status: registry.coverage_status,
    integration_worktree_id: registry.integration_worktree_id,
    registry_digest: observedDigest,
    counts,
    outcomes: registry.outcomes.map((item) => ({ id: item.id, title: item.title, disposition: item.disposition, required_at: item.required_at, acceptance_ids: item.acceptance.map((entry) => entry.id), superseded_by: item.superseded_by })),
  };
}

export async function writeOutcomeRegistry(context, registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const projection = renderInitialProgress(registry);
  await transactionalWrites([
    { target: resolveInside(context.root, context.manifest.outcome_index, 'Outcome registry path'), content: canonicalJson(registry), mode: 0o644 },
    { target: resolveInside(context.root, context.manifest.progress_projection, 'Progress projection path'), content: projection, mode: 0o644 },
  ]);
  return registry;
}

export function renderInitialProgress(registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const registryDigest = outcomeRegistryDigest(registry);
  const required = registry.outcomes.filter((item) => item.disposition === 'required');
  const remaining = required.map((item) => item.id).sort();
  const nextAcceptance = remaining.length
    ? registry.outcomes.find((item) => item.id === remaining[0])?.acceptance?.[0]?.id ?? null
    : null;
  return [
    '# VibeTether Progress',
    '',
    '<!-- vibetether:generated-progress-v1 -->',
    '',
    `Goal: ${registry.goal_id}`,
    `Goal revision: ${registry.goal_revision_digest}`,
    `Coverage status: ${registry.coverage_status}`,
    `Integration worktree: ${registry.integration_worktree_id ?? 'not-designated'}`,
    `Required: ${required.length} | Open: ${required.length} | In progress: 0 | Satisfied: 0 | Stale: 0 | Blocked: 0`,
    `Current Outcome: ${remaining[0] ?? 'none'}`,
    `Remaining Outcome IDs: ${remaining.length ? remaining.join(', ') : 'none'}`,
    `Next missing acceptance: ${nextAcceptance ?? 'none'}`,
    'Precise completion label: NOT_STARTED',
    `Generation digest: ${registryDigest}`,
    'Regenerate: vibetether outcomes status --write-progress --project .',
    '',
    'This file is generated from the user-governed Outcome Contract and verified runtime receipts. Do not edit it manually.',
    '',
  ].join('\n');
}
