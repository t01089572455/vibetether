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
  for (const outcome of selected) {
    for (const acceptance of outcome.acceptance ?? []) {
      owners.set(acceptance.id, { outcome_id: outcome.id, acceptance });
    }
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

async function decisionProofCurrent({ context, runtime, proof, acceptance, authorityDigest, currentSnapshot }) {
  const receipt = proof?.decision_receipt;
  if (proof?.kind !== acceptance.validator.kind
      || receipt?.decision_type !== acceptance.validator.decision_type
      || receipt?.authority_digest !== authorityDigest) return false;
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
    return decisionProofCurrent({ ...options, proof, acceptance, currentSnapshot });
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
  for (const id of contract.required_acceptance_ids) {
    if (!await acceptanceCurrent(options, contract.owners.get(id), currentSnapshot)) missing.push(id);
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
