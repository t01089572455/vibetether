import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareDeep, grantDeepPermit, validateDeepPermit } from '../src/deep.mjs';
import { discoverContract } from '../src/contract.mjs';
import { parseTruthMap, authoritySnapshot } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { initProject } from './helpers.mjs';

async function prepared(name) {
  const { root } = await initProject(name);
  const card = await prepareDeep({
    project: root,
    task: 'Add enterprise authentication only after the user chooses the authentication model.',
    slice: 'Implement only the approved enterprise authentication model.',
    success_evidence: [
      'A real consumer completes the approved authentication flow.',
      'The focused regression command passes against final product bytes.',
    ],
    facts: ['The current repository supports password login only.'],
    assumptions: ['Enterprise identity-provider metadata will be available.'],
    decisions: ['Choose OIDC SSO versus passkey authentication.'],
  });
  return { root, card };
}

function ceremonial(card) {
  return {
    facts_verified: card.start_card.facts.map((fact) => ({
      fact,
      evidence: `Verified: ${fact}`,
    })),
    assumptions_resolved: card.start_card.assumptions.map((assumption) => ({
      assumption,
      disposition: 'confirmed',
      rationale: `Confirmed: ${assumption}`,
    })),
    decisions_resolved: card.start_card.decisions_needed.map((decision) => ({
      decision,
      resolution: `Approved: ${decision}`,
    })),
    success_evidence_confirmed: [...card.start_card.success_evidence],
    counterexample_challenge: {
      challenge: 'Alternative?',
      outcome: 'Rejected.',
    },
  };
}

function complete(card) {
  return {
    user_confirmation: {
      source: 'user-message:enterprise-auth-choice-2026-07-21',
      summary: 'The user selected OIDC SSO for enterprise accounts and approved the bounded implementation slice.',
    },
    facts_verified: card.start_card.facts.map((fact) => ({
      fact,
      evidence: 'The repository login adapter and focused baseline command show only the password strategy is registered.',
      evidence_kind: 'repository-and-command',
      source_locator: 'src/auth/login-adapter.ts + npm test -- auth/password-baseline',
    })),
    assumptions_resolved: card.start_card.assumptions.map((assumption) => ({
      assumption,
      disposition: 'confirmed',
      rationale: 'The user confirmed that production IdP metadata will be supplied through the existing deployment secret boundary.',
      confirmation_source: 'user-message:enterprise-auth-choice-2026-07-21',
    })),
    decisions_resolved: card.start_card.decisions_needed.map((decision) => ({
      decision,
      resolution: 'Use OIDC SSO for enterprise accounts; passkey authentication remains outside this slice.',
      confirmation_source: 'user-message:enterprise-auth-choice-2026-07-21',
    })),
    success_evidence_confirmed: [...card.start_card.success_evidence],
    success_evidence_verifiers: card.start_card.success_evidence.map((criterion, index) => ({
      criterion,
      verifier: index === 0
        ? 'Run the real-consumer OIDC login acceptance test against the final server and browser adapter bytes.'
        : 'Run npm test -- auth/oidc-regression after implementation and bind the receipt to the final worktree digest.',
    })),
    counterexample_challenge: {
      challenge: 'Could passkeys meet the enterprise federation requirement without an external identity provider?',
      outcome: 'No. Passkeys authenticate a device/user but do not satisfy the approved enterprise federation requirement.',
      evidence: 'The approved requirement explicitly needs enterprise IdP federation and the user selected OIDC SSO.',
    },
  };
}

test('Deep Permit rejects ceremonial echo records even when confirmed_by_user is set', async () => {
  const { root, card } = await prepared('deep-semantic-echo');
  await assert.rejects(
    grantDeepPermit({
      project: root,
      confirmed_by_user: true,
      reason: 'User clicked confirm.',
      resolution: ceremonial(card),
    }),
    /user confirmation|confirmation source|evidence locator|verifier|echo|non-trivial|counterexample|unresolved/i,
  );
});

test('Deep Permit records a complete, traceable resolution and validates it against current authority', async () => {
  const { root, card } = await prepared('deep-semantic-complete');
  const permit = await grantDeepPermit({
    project: root,
    confirmed_by_user: true,
    reason: 'The user approved the exact OIDC SSO slice after the fact and counterexample review.',
    resolution: complete(card),
  });
  assert.equal(permit.status, 'permitted');
  assert.equal(permit.permit.resolution.user_confirmation.source, 'user-message:enterprise-auth-choice-2026-07-21');
  assert.equal(permit.permit.resolution.success_evidence_verifiers.length, 2);

  const context = await discoverContract(root);
  const authority = await authoritySnapshot(context.executionRoot, parseTruthMap(context.truthSource), context.intentSource);
  const runtime = await attachWorktree(context, authority.authority_digest);
  const validated = await validateDeepPermit(context, runtime, authority, {
    required: true,
    slice: card.start_card.slice,
  });
  assert.equal(validated.permit.id, permit.permit.id);
});
