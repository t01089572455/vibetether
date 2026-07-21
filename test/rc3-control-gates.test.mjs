import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTaskText } from '../src/task-classifier.mjs';
import { prepareDeep, grantDeepPermit, revokeDeepPermit, readDeepState } from '../src/deep.mjs';
import { startStep, finishStep } from '../src/step.mjs';
import { inspectProject } from '../src/doctor.mjs';
import { discoverContract } from '../src/contract.mjs';
import { parseTruthMap, authoritySnapshot } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { readRoute, breakLease, writeReceipt } from '../src/runtime.mjs';
import { loadActivation } from '../src/skills.mjs';
import { answerDeepCard, initProject, testSuccessCheck } from './helpers.mjs';

const consequentialUnseen = [
  'Wire up SSO for enterprise users.',
  'Support OAuth login with Google and GitHub.',
  'Add passkey sign-in.',
  'Integrate Stripe subscriptions.',
  'Implement soft delete for accounts.',
  'Expose a GraphQL endpoint for reporting.',
  'Rework the checkout experience.',
  'Add tenant-level permissions.',
  '给企业用户接入单点登录。',
  '支持 OAuth 登录。',
  '给账户增加软删除。',
  '重新改造结账界面。',
];

function resolvedCard(card) {
  const confirmationSource = 'user-message:rc3-control-gate-approved';
  return {
    user_confirmation: {
      source: confirmationSource,
      summary: 'The user reviewed the complete Start Card and approved the exact bounded authentication implementation slice.',
    },
    facts_verified: card.facts.map((fact) => ({
      fact,
      evidence: `Repository inspection and a focused baseline check established the current behavior before approval: ${fact}`,
      evidence_kind: 'repository-and-command',
      source_locator: 'test-fixture:authentication-baseline',
    })),
    assumptions_resolved: card.assumptions.map((assumption) => ({
      assumption,
      disposition: 'confirmed',
      rationale: `The user confirmed the required precondition and accepted its bounded effect for this slice: ${assumption}`,
      confirmation_source: confirmationSource,
    })),
    decisions_resolved: card.decisions_needed.map((decision) => ({
      decision,
      resolution: `The user selected a bounded implementation option and excluded the unapproved alternative for this slice: ${decision}`,
      confirmation_source: confirmationSource,
    })),
    success_evidence_confirmed: [...card.success_evidence],
    success_evidence_verifiers: card.success_evidence.map((criterion) => ({
      criterion,
      verifier: `Run the predeclared focused real-consumer check against final product bytes and bind the receipt to this criterion: ${criterion}`,
    })),
    counterexample_challenge: {
      challenge: 'Could the main unapproved alternative satisfy the same approved outcome with materially less risk?',
      outcome: 'No. It would change the user-approved authentication direction, so the bounded selected option remains required.',
      evidence: 'The durable user-confirmation source records the selected option and the excluded alternative.',
    },
  };
}

async function runtimeFor(root) {
  const context = await discoverContract(root);
  const authority = await authoritySnapshot(context.executionRoot, parseTruthMap(context.truthSource), context.intentSource);
  return attachWorktree(context, authority.authority_digest);
}

async function permittedDeepProject(name, { ttlMs = 60_000 } = {}) {
  const { root } = await initProject(name);
  const cardReceipt = await prepareDeep({
    project: root,
    task: 'Implement the approved authentication slice after resolving direction.',
    slice: 'Implement only the approved authentication slice.',
    permissions: { code_write: true },
    success_evidence: ['A focused real-consumer authentication check passes.'],
    success_checks: [testSuccessCheck('A focused real-consumer authentication check passes.')],
    facts: ['The existing application currently has no SSO provider.'],
    assumptions: ['OAuth is acceptable only if explicitly confirmed by the user.'],
    decisions: ['Choose OAuth versus password authentication.'],
  });
  await answerDeepCard(root, cardReceipt, resolvedCard(cardReceipt.start_card));
  const permitReceipt = await grantDeepPermit({
    project: root,
    confirmed_by_user: true,
    reason: 'The user approved the exact Start Card after reviewing the facts, assumptions, decision, and evidence.',
    resolution: resolvedCard(cardReceipt.start_card),
    ttl_ms: ttlMs,
  });
  return { root, cardReceipt, permitReceipt };
}

test('diagnostic requests containing find are not downgraded to read-only observation', () => {
  const result = classifyTaskText('A flaky test only fails on CI; reproduce and find the cause.', {
    intentStatus: 'confirmed',
    currentPhase: 'DISCOVER',
  });
  assert.equal(result.mode, 'controlled');
  assert.equal(result.phase, 'DIAGNOSE');
  assert.equal(result.capability, 'debugging');
  assert.equal(result.needs_user_decision, false);
});

test('unseen consequential feature and integration requests fail closed instead of defaulting to observation', () => {
  for (const text of consequentialUnseen) {
    const result = classifyTaskText(text, { intentStatus: 'confirmed', currentPhase: 'DISCOVER' });
    assert.equal(result.mode, 'controlled', text);
    assert.equal(result.needs_user_decision, true, text);
    assert.equal(result.phase, 'DISCOVER', text);
    assert.equal(result.capability, 'requirements-clarification', text);
    assert.notEqual(result.signals[0], 'task-unclassified', text);
  }

  const readOnly = classifyTaskText('Read the OAuth adapter and explain how it works. Do not change anything.', {
    intentStatus: 'confirmed',
    currentPhase: 'DISCOVER',
  });
  assert.equal(readOnly.mode, 'observation');
  assert.equal(readOnly.needs_user_decision, false);
});

test('an unclassified consequential code-write cannot be started by supplying implementation phase and capability', async () => {
  const { root } = await initProject('unknown-write-gate');
  await assert.rejects(
    startStep({
      project: root,
      task_text: 'Wire up SSO for enterprise users.',
      phase: 'EXECUTE_ONE',
      capability: 'implementation',
      slice: 'Wire up SSO for enterprise users.',
      success_evidence: ['Enterprise users can complete the approved sign-in flow.'],
      code_write: true,
      classification: classifyTaskText('Wire up SSO for enterprise users.', { intentStatus: 'confirmed' }),
    }),
    /user decision|unclassified|clarification/i,
  );
});

test('Deep Permit rejects confirmation theater until every Start Card blocker is explicitly resolved', async () => {
  const { root } = await initProject('deep-card-resolution');
  const cardReceipt = await prepareDeep({
    project: root,
    task: 'Implement authentication.',
    slice: 'Implement the approved authentication method.',
    permissions: { code_write: true },
    success_evidence: ['The approved end-to-end authentication flow passes.'],
    success_checks: [testSuccessCheck('The approved end-to-end authentication flow passes.')],
    facts: ['The existing application has password login only.'],
    assumptions: ['Assume OAuth is desired without asking the user.'],
    decisions: ['User must choose OAuth versus password authentication.'],
  });

  await assert.rejects(
    grantDeepPermit({
      project: root,
      confirmed_by_user: true,
      reason: 'User clicked confirm.',
    }),
    /Start Card|unresolved|decision|assumption|fact|challenge/i,
  );

  await answerDeepCard(root, cardReceipt, resolvedCard(cardReceipt.start_card));
  const permit = await grantDeepPermit({
    project: root,
    confirmed_by_user: true,
    reason: 'The user reviewed and approved the exact resolved Start Card.',
    resolution: resolvedCard(cardReceipt.start_card),
  });
  assert.equal(permit.status, 'permitted');
  assert.equal(permit.permit.status, 'active');
  assert.equal(permit.permit.start_card_id, cardReceipt.start_card.id);
  assert.match(permit.permit.resolution_digest, /^[a-f0-9]{64}$/);
});

test('revoking a Deep Permit invalidates the active route, activation, evidence path, and completion', async () => {
  const { root, permitReceipt } = await permittedDeepProject('deep-revoke');
  const started = await startStep({
    project: root,
    task_text: permitReceipt.start_card.task,
    phase: 'EXECUTE_ONE',
    capability: 'implementation',
    slice: permitReceipt.start_card.slice,
    success_evidence: permitReceipt.start_card.success_evidence,
    success_checks: [testSuccessCheck(permitReceipt.start_card.success_evidence[0])],
    code_write: true,
    deep: true,
    classification: { mode: 'deep', deep_requested: true, needs_user_decision: true, signals: ['deep-mode'] },
  });

  await revokeDeepPermit({ project: root, reason: 'The user revoked the approved direction before implementation completed.' });
  const runtime = await runtimeFor(root);
  const route = await readRoute(runtime.paths);
  assert.equal(route.status, 'broken');
  assert.equal(route.implementation_permit_id, permitReceipt.permit.id);
  await assert.rejects(loadActivation(runtime.paths, started.activation.activation_id), /missing|invalid|activation/i);
  await assert.rejects(
    finishStep({ project: root, evidence_command: [process.execPath, '-e', 'process.exit(0)'] }),
    /active step|Permit|revoked|broken/i,
  );
  const report = await inspectProject({ project: root, boundary: 'completion', throw_on_error: false });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some(({ code }) => ['ROUTE_NOT_SATISFIED', 'BROKEN_ROUTE', 'IMPLEMENTATION_PERMIT_INVALID'].includes(code)));
});

test('an expired Permit cannot be used to finish an already-started Deep route', async () => {
  const { root, permitReceipt } = await permittedDeepProject('deep-expiry');
  await startStep({
    project: root,
    task_text: permitReceipt.start_card.task,
    phase: 'EXECUTE_ONE',
    capability: 'implementation',
    slice: permitReceipt.start_card.slice,
    success_evidence: permitReceipt.start_card.success_evidence,
    success_checks: [testSuccessCheck(permitReceipt.start_card.success_evidence[0])],
    code_write: true,
    deep: true,
    classification: { mode: 'deep', deep_requested: true, needs_user_decision: true, signals: ['deep-mode'] },
  });
  const runtime = await runtimeFor(root);
  const deepState = await readDeepState(runtime.paths, { allowMissing: false });
  deepState.permit.expires_at = new Date(Date.now() - 1_000).toISOString();
  await writeReceipt(runtime.paths.deep, deepState);
  await assert.rejects(
    finishStep({ project: root, evidence_command: [process.execPath, '-e', 'process.exit(0)'] }),
    /Permit expired|IMPLEMENTATION_PERMIT_EXPIRED|expired/i,
  );
});

test('breaking the writer lease invalidates the Deep Permit before any new route can reuse it', async () => {
  const { root, permitReceipt } = await permittedDeepProject('deep-break-lease');
  await startStep({
    project: root,
    task_text: permitReceipt.start_card.task,
    phase: 'EXECUTE_ONE',
    capability: 'implementation',
    slice: permitReceipt.start_card.slice,
    success_evidence: permitReceipt.start_card.success_evidence,
    success_checks: [testSuccessCheck(permitReceipt.start_card.success_evidence[0])],
    code_write: true,
    deep: true,
    classification: { mode: 'deep', deep_requested: true, needs_user_decision: true, signals: ['deep-mode'] },
  });
  const runtime = await runtimeFor(root);
  await breakLease(runtime.paths, 'Interrupted deep execution requires a new Start Card and Permit.');
  const state = await readDeepState(runtime.paths, { allowMissing: false });
  assert.notEqual(state.permit?.status, 'active');
  await assert.rejects(
    startStep({
      project: root,
      task_text: permitReceipt.start_card.task,
      phase: 'EXECUTE_ONE',
      capability: 'implementation',
      slice: permitReceipt.start_card.slice,
      success_evidence: permitReceipt.start_card.success_evidence,
      code_write: true,
      deep: true,
      classification: { mode: 'deep', deep_requested: true, needs_user_decision: true, signals: ['deep-mode'] },
    }),
    /Permit|active|fresh|broken/i,
  );
});
