import path from 'node:path';
import { conflictError } from './errors.mjs';
import {
  canonicalJson, rejectSymlinkChain, resolveInside, sha256File,
} from './files.mjs';
import { executionSnapshot, snapshotsMatchIgnoringPaths } from './git.mjs';
import { loadEvidence, readReceipt } from './runtime.mjs';

export const UI_LIFECYCLE = Object.freeze([
  'UI_DISCOVER',
  'PRODUCT_UX_CONTRACT',
  'REFERENCE_INTAKE',
  'DESIGN_CONTRACT',
  'GOLDEN_SCREEN_APPROVAL',
  'IMPLEMENT_ONE_STATE',
  'RENDER_AND_COMPARE',
  'FUNCTIONAL_ACCEPTANCE',
  'VISUAL_ACCEPTANCE',
  'LOCK_AND_PROPAGATE',
]);

export const UI_ACCEPTANCE_IDS = Object.freeze({
  golden: 'acceptance_ui_golden_screen',
  functional: 'acceptance_ui_functional',
  visual: 'acceptance_ui_visual',
});

const UI_CAPABILITY_ACCEPTANCES = Object.freeze({
  'frontend-product-design': [UI_ACCEPTANCE_IDS.golden],
  'frontend-engineering': [UI_ACCEPTANCE_IDS.golden],
  'browser-verification': [UI_ACCEPTANCE_IDS.functional, UI_ACCEPTANCE_IDS.visual],
  'frontend-propagation': [UI_ACCEPTANCE_IDS.golden, UI_ACCEPTANCE_IDS.functional, UI_ACCEPTANCE_IDS.visual],
});

const UI_CAPABILITIES = new Set(Object.keys(UI_CAPABILITY_ACCEPTANCES));
const RESERVED_UI_ACCEPTANCES = Object.freeze({
  [UI_ACCEPTANCE_IDS.golden]: Object.freeze({ kinds: ['user-decision'], decision_type: 'stage0-ui-golden' }),
  [UI_ACCEPTANCE_IDS.functional]: Object.freeze({ kinds: ['command', 'artifact'], decision_type: null }),
  [UI_ACCEPTANCE_IDS.visual]: Object.freeze({ kinds: ['review-decision'], decision_type: 'ui-visual-review' }),
});

export function uiCapabilityContext(capability) {
  const required = UI_CAPABILITY_ACCEPTANCES[capability];
  if (!required) return null;
  return {
    lifecycle: [...UI_LIFECYCLE],
    required_acceptances: [...required],
    enforcement: ['frontend-engineering', 'frontend-propagation'].includes(capability)
      ? 'vibetether-controlled-route'
      : 'declarative-contract',
  };
}

function uiError(message, code, missingAcceptanceIds) {
  const error = conflictError(message, code);
  error.missing_acceptance_ids = [...missingAcceptanceIds];
  return error;
}

export function assertUiCapabilityClassification(capability, classification) {
  const classifiedCapability = classification?.capability;
  const classifiedUi = UI_CAPABILITIES.has(classifiedCapability)
    || classification?.signals?.includes('user-visible-ui')
    || classification?.signals?.some((signal) => String(signal).startsWith('frontend-'));
  if (classifiedUi && capability !== classifiedCapability) {
    throw uiError(
      `Task classification ${classifiedCapability ?? 'user-visible-ui'} cannot be weakened to ${capability}. Select the applicable frontend capability and its UI Outcome contract.`,
      'UI_CAPABILITY_MISMATCH',
      [],
    );
  }
  return { classified_ui: classifiedUi, capability };
}

function validReservedAcceptance(acceptance) {
  const schema = RESERVED_UI_ACCEPTANCES[acceptance.id];
  if (!schema) return true;
  const validator = acceptance.validator ?? {};
  if (acceptance.evidence_kind !== validator.kind || !schema.kinds.includes(validator.kind)) return false;
  if (schema.decision_type !== null && validator.decision_type !== schema.decision_type) return false;
  if (validator.kind === 'command') return Array.isArray(validator.command) && validator.command.length > 0;
  if (validator.kind === 'artifact') return typeof validator.path === 'string' && validator.path.length > 0;
  return true;
}

export function assertUiOutcomeContract(registry, outcomeIds = [], capability) {
  if (!['frontend-engineering', 'frontend-propagation'].includes(capability)) return null;
  const required = UI_CAPABILITY_ACCEPTANCES[capability];
  if (!outcomeIds.length) {
    throw uiError(
      `${capability} requires a selected required UI Outcome declaring ${required.join(', ')}.`,
      'UI_OUTCOME_CONTRACT_REQUIRED',
      required,
    );
  }
  const selected = outcomeIds
    .map((id) => registry.outcomes.find((outcome) => outcome.id === id))
    .filter(Boolean);
  if (selected.length !== outcomeIds.length) return null;
  const owners = new Map();
  const invalid = new Set();
  for (const outcome of selected) {
    for (const acceptance of outcome.acceptance ?? []) {
      if (!Object.hasOwn(RESERVED_UI_ACCEPTANCES, acceptance.id)) continue;
      if (owners.has(acceptance.id) || !validReservedAcceptance(acceptance)) invalid.add(acceptance.id);
      owners.set(acceptance.id, { outcome_id: outcome.id, outcome_revision_digest: outcome.revision_digest, acceptance });
    }
  }
  if (invalid.size) {
    throw uiError(
      `Reserved UI acceptance IDs have invalid or duplicate semantics: ${[...invalid].join(', ')}.`,
      'UI_OUTCOME_CONTRACT_INVALID',
      [...invalid],
    );
  }
  const missing = required.filter((id) => !owners.has(id));
  if (missing.length) {
    throw uiError(
      `${capability} requires selected UI Outcome coverage for ${missing.join(', ')}.`,
      'UI_OUTCOME_CONTRACT_REQUIRED',
      missing,
    );
  }
  return { capability, required_acceptance_ids: [...required], owners };
}

async function decisionProofCurrent({ context, runtime, progress, proof, owner, acceptance, authorityDigest, currentSnapshot }) {
  const receipt = proof?.decision_receipt;
  if (proof?.kind !== acceptance.validator.kind
      || receipt?.decision_type !== acceptance.validator.decision_type
      || receipt?.acceptance_id !== acceptance.id
      || receipt?.outcome_id !== owner.outcome_id
      || receipt?.outcome_revision_digest !== owner.outcome_revision_digest
      || receipt?.registry_digest !== progress.registry_digest
      || receipt?.authority_digest !== authorityDigest) return false;
  if (acceptance.validator.kind === 'review-decision' && !['peer', 'independent'].includes(receipt.independence_level)) return false;
  try {
    const sealed = await readReceipt(path.join(runtime.paths.decisions, `${receipt.id}.json`), 'UI acceptance decision receipt');
    if (canonicalJson(sealed) !== canonicalJson(receipt)) return false;
  } catch {
    return false;
  }
  return snapshotsMatchIgnoringPaths(
    receipt.execution_snapshot,
    currentSnapshot,
    [context.manifest.progress_projection],
  );
}

async function routeProofCurrent({ context, runtime, proof, acceptance, authorityDigest, skillsDigest }) {
  if (proof?.kind !== 'route-evidence') return false;
  for (const evidenceId of proof.evidence_ids ?? []) {
    try {
      const receipt = await loadEvidence(runtime.paths, evidenceId);
      const validator = acceptance.validator;
      if (!receipt.successful || receipt.authority_digest !== authorityDigest || receipt.skills_digest !== skillsDigest) continue;
      if (validator.kind === 'command'
          && (receipt.kind !== 'command' || canonicalJson(receipt.command) !== canonicalJson(validator.command))) continue;
      if (validator.kind === 'artifact'
          && (receipt.kind !== 'artifact' || receipt.artifact_path !== validator.path)) continue;
      const expectedPaths = validator.kind === 'artifact' ? [validator.path] : validator.covers_paths ?? [];
      let current = true;
      for (const relative of expectedPaths) {
        const recorded = (receipt.coverage_artifacts ?? []).find((item) => item.path === relative && item.present === true)
          ?? (receipt.artifact_path === relative ? { sha256: receipt.artifact_sha256, present: true } : null);
        if (!recorded?.sha256) { current = false; break; }
        await rejectSymlinkChain(context.executionRoot, relative, { allowMissing: false });
        if (await sha256File(resolveInside(context.executionRoot, relative, 'UI acceptance artifact')) !== recorded.sha256) {
          current = false;
          break;
        }
      }
      if (current) return true;
    } catch {
      // A different sealed receipt may still prove the same acceptance.
    }
  }
  return false;
}

async function acceptanceCurrent(options, owner, currentSnapshot) {
  const entry = options.progress.outcomes?.[owner.outcome_id];
  const acceptance = owner.acceptance;
  if (!entry || ['stale', 'blocked'].includes(entry.state)
      || !entry.satisfied_acceptance_ids?.includes(acceptance.id)) return false;
  const proof = entry.acceptance_proofs?.[acceptance.id];
  if (['user-decision', 'review-decision'].includes(acceptance.validator.kind)) {
    return decisionProofCurrent({ ...options, proof, owner, acceptance, currentSnapshot });
  }
  if (['command', 'artifact'].includes(acceptance.validator.kind)) {
    return routeProofCurrent({ ...options, proof, acceptance });
  }
  return false;
}

export async function assertUiAcceptanceGate(options) {
  const contract = options.contract;
  if (!contract) return null;
  const currentSnapshot = await executionSnapshot(options.context.executionRoot);
  const missing = [];
  const usedProofs = new Set();
  for (const id of contract.required_acceptance_ids) {
    const owner = contract.owners.get(id);
    if (!await acceptanceCurrent(options, owner, currentSnapshot)) {
      missing.push(id);
      continue;
    }
    const proof = options.progress.outcomes?.[owner.outcome_id]?.acceptance_proofs?.[id];
    const proofIds = proof?.kind === 'route-evidence'
      ? (proof.evidence_ids ?? []).map((value) => `evidence:${value}`)
      : [`decision:${proof?.decision_receipt?.id}`];
    if (proofIds.some((value) => usedProofs.has(value))) {
      throw uiError(`A UI acceptance proof cannot satisfy multiple reserved axes: ${id}.`, 'UI_ACCEPTANCE_PROOF_REUSED', [id]);
    }
    for (const value of proofIds) usedProofs.add(value);
  }
  if (missing.length) {
    throw uiError(
      `${contract.capability} requires current UI acceptance receipts: ${missing.join(', ')}.`,
      'UI_ACCEPTANCE_REQUIRED',
      missing,
    );
  }
  return { capability: contract.capability, current_acceptance_ids: [...contract.required_acceptance_ids] };
}
