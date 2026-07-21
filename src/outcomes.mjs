import { readProjectJson, canonicalJson, safeRelative, sha256Text, boundedText, containsSecret } from './files.mjs';
import { conflictError } from './errors.mjs';
import {
  OUTCOME_ACCEPTANCE_MAX, OUTCOME_COUNT_MAX, OUTCOME_DEPENDENCY_MAX,
  OUTCOME_REGISTRY_BUDGET_BYTES, OUTCOME_TEXT_LIMIT,
} from './constants.mjs';

const REGISTRY_KEYS = new Set([
  'schema_version', 'goal_id', 'goal_revision_digest', 'coverage_status',
  'coverage_decision', 'integration_worktree_id', 'coverage_sources', 'outcomes',
]);
const SOURCE_KEYS = new Set([
  'id', 'truth_id', 'source_revision_digest', 'expected_id_count',
  'expected_id_set_digest', 'mapping_path', 'mapping_revision_digest',
]);
const OUTCOME_KEYS = new Set([
  'id', 'title', 'authority_sources', 'parent_id', 'dependencies', 'disposition',
  'required_at', 'acceptance', 'decision_receipt', 'revision_digest',
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
  return value;
}

function validateOutcome(value, label) {
  only(value, OUTCOME_KEYS, label);
  logicalId(value.id, `${label} id`);
  boundedText(value.title, OUTCOME_TEXT_LIMIT, `${label} title`);
  stringArray(value.authority_sources, `${label} authority_sources`, { max: 32, allowEmpty: false });
  if (value.parent_id !== null) logicalId(value.parent_id, `${label} parent_id`);
  stringArray(value.dependencies, `${label} dependencies`, { max: OUTCOME_DEPENDENCY_MAX, ids: true });
  if (!OUTCOME_DISPOSITIONS.has(value.disposition)) throw conflictError(`${label} disposition is unsupported.`, 'INVALID_OUTCOMES');
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
    outcomes: [],
  };
}

export function outcomeRegistryDigest(value) {
  return `sha256:${sha256Text(canonicalJson(validateOutcomeRegistry(structuredClone(value))))}`;
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
  for (const item of value.outcomes) {
    if (item.parent_id !== null && !outcomeIds.has(item.parent_id)) throw conflictError(`Outcome ${item.id} has an unknown parent.`, 'INVALID_OUTCOMES');
    for (const dependency of item.dependencies) if (!outcomeIds.has(dependency)) throw conflictError(`Outcome ${item.id} has an unknown dependency: ${dependency}`, 'INVALID_OUTCOMES');
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

export function renderInitialProgress(registryValue) {
  const registry = validateOutcomeRegistry(structuredClone(registryValue));
  const registryDigest = outcomeRegistryDigest(registry);
  return [
    '# VibeTether Progress',
    '',
    '<!-- vibetether:generated-progress-v1 -->',
    '',
    `Goal: ${registry.goal_id}`,
    `Goal revision: ${registry.goal_revision_digest}`,
    `Coverage status: ${registry.coverage_status}`,
    'Integration worktree: not-designated',
    'Required: 0 | Open: 0 | In progress: 0 | Satisfied: 0 | Stale: 0 | Blocked: 0',
    'Current Outcome: none',
    'Remaining Outcome IDs: none',
    'Precise completion label: NOT_STARTED',
    `Generation digest: ${registryDigest}`,
    'Regenerate: vibetether outcomes status --write-progress --project .',
    '',
    'This file is generated from the user-governed Outcome Contract and verified runtime receipts. Do not edit it manually.',
    '',
  ].join('\n');
}
