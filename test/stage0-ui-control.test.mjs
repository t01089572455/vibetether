import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildContext } from '../src/context.mjs';
import { classifyTaskText } from '../src/task-classifier.mjs';
import { abandonStep, finishStep, startStep } from '../src/step.mjs';
import {
  initProject, mainJson, materializeSuccessCheck, routeProofOptions, testSuccessCheck,
} from './helpers.mjs';

const root = path.resolve(import.meta.dirname, '..');
const UI_OUTCOME = 'outcome_stage0_ui_fixture';
const GOLDEN = 'acceptance_ui_golden_screen';
const FUNCTIONAL = 'acceptance_ui_functional';
const VISUAL = 'acceptance_ui_visual';

function functionalCheck() {
  return {
    ...testSuccessCheck('The representative UI state is functionally accepted.', 'ui-state.txt'),
    id: 'check-ui-functional',
    acceptance_ids: [FUNCTIONAL],
  };
}

function uiOutcome() {
  const check = functionalCheck();
  return {
    id: UI_OUTCOME,
    title: 'UI fixture',
    authority_sources: ['test:stage0-ui-contract'],
    parent_id: null,
    dependencies: [],
    superseded_by: [],
    disposition: 'candidate',
    required_at: ['goal'],
    acceptance: [
      {
        id: GOLDEN,
        claim: 'The representative UI direction is owner-approved.',
        evidence_kind: 'user-decision',
        required_maturity: 'owner-accepted',
        validator: {
          kind: 'user-decision',
          decision_type: 'stage0-ui-golden',
          validator_revision: `sha256:${'1'.repeat(64)}`,
          covers_paths: [],
        },
      },
      {
        id: FUNCTIONAL,
        claim: check.claim,
        evidence_kind: 'command',
        required_maturity: 'functional',
        validator: {
          kind: 'command',
          command: check.command,
          validator_revision: `sha256:${'2'.repeat(64)}`,
          covers_paths: check.covers_paths,
        },
      },
      {
        id: VISUAL,
        claim: 'The representative UI state has a separate visual review.',
        evidence_kind: 'review-decision',
        required_maturity: 'reviewed',
        validator: {
          kind: 'review-decision',
          decision_type: 'ui-visual-review',
          validator_revision: `sha256:${'3'.repeat(64)}`,
          covers_paths: [],
        },
      },
    ],
    decision_receipt: null,
    revision_digest: `sha256:${'4'.repeat(64)}`,
  };
}

async function governedUiFixture(name) {
  const fixture = await initProject(name);
  await mainJson(['outcomes', 'propose', '--project', fixture.root, '--outcome-json', JSON.stringify(uiOutcome()), '--yes']);
  await mainJson([
    'outcomes', 'confirm', '--project', fixture.root, '--id', UI_OUTCOME,
    '--user-message-locator', 'user-message:test-stage0-ui-outcome',
    '--reason', 'The test user confirms the exact bounded UI fixture Outcome.', '--yes',
  ]);
  await mainJson([
    'outcomes', 'coverage', 'confirm', '--project', fixture.root,
    '--user-message-locator', 'user-message:test-stage0-ui-coverage',
    '--reason', 'The test user confirms complete coverage for this bounded UI fixture.', '--yes',
  ]);
  return fixture;
}

async function recordDecision(fixture, acceptanceId) {
  const visual = acceptanceId === VISUAL;
  await mainJson([
    'outcomes', 'acceptance', 'record', '--project', fixture.root, '--id', acceptanceId,
    '--user-message-locator', `user-message:test-${acceptanceId}`,
    '--reason', `The test user records a current and bounded decision for ${acceptanceId}.`,
    ...(visual ? ['--independence-level', 'peer'] : []), '--yes',
  ]);
}

async function satisfyFunctional(fixture) {
  const check = functionalCheck();
  const started = await startStep({
    project: fixture.root,
    phase: 'EXECUTE_ONE',
    capability: 'implementation',
    slice: 'Materialize the representative UI fixture state.',
    task_text: 'Implement only ui-state.txt for the confirmed fixture.',
    outcome_ids: [UI_OUTCOME],
    scope_paths: ['ui-state.txt'],
    success_evidence: [check.claim],
    success_checks: [check],
    code_write: true,
    confirmed_by_user: true,
    decision_reason: 'The test user approved this exact fixture state.',
  });
  await materializeSuccessCheck(fixture.root, check);
  await finishStep({ project: fixture.root, ...routeProofOptions(started.route, 'ui-state.txt') });
}

async function startUiRoute(fixture, capability = 'frontend-propagation', signals = []) {
  const check = functionalCheck();
  return startStep({
    project: fixture.root,
    phase: 'EXECUTE_ONE',
    capability,
    slice: capability === 'frontend-engineering'
      ? 'Implement one owner-approved representative UI state.'
      : 'Propagate only the locked and accepted representative UI state.',
    task_text: `In ui-state.txt, ${capability === 'frontend-engineering' ? 'implement one state' : 'propagate the accepted state'}.`,
    outcome_ids: [UI_OUTCOME],
    scope_paths: ['ui-state.txt'],
    success_evidence: [check.claim],
    success_checks: [check],
    signals,
    code_write: true,
    confirmed_by_user: true,
    decision_reason: 'The test user approved this exact bounded UI route.',
  });
}

test('S0-R02: complete UI lifecycle selects specialized frontend design for English and Chinese UI prompts', () => {
  for (const prompt of [
    'Redesign the checkout UI from the supplied reference screenshot.',
    'Use these visual references to redesign the account settings interface.',
    '根据这张参考截图重新设计结账界面。',
  ]) {
    const classification = classifyTaskText(prompt, { intentStatus: 'confirmed', currentPhase: 'DISCOVER' });
    assert.equal(classification.phase, 'DESIGN', prompt);
    assert.equal(classification.capability, 'frontend-product-design', prompt);
    assert.deepEqual(classification.signals, ['frontend-product-design', 'user-visible-ui'], prompt);
    assert.equal(classification.needs_user_decision, true, prompt);
  }
  assert.equal(
    classifyTaskText('Redesign the event-sourcing data model.', { intentStatus: 'confirmed', currentPhase: 'DISCOVER' }).capability,
    'product-design',
  );
});

test('S0-R02: complete UI lifecycle is ordered and encoded by public capabilities', async () => {
  const { UI_LIFECYCLE } = await import('../src/ui-control.mjs');
  assert.deepEqual(UI_LIFECYCLE, [
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

  const registry = JSON.parse(await readFile(path.join(root, 'registry', 'capabilities.json'), 'utf8'));
  const byId = new Map(registry.capabilities.map((capability) => [capability.id, capability]));
  assert.deepEqual(byId.get('frontend-product-design')?.required_outputs, [
    'product_ux_contract', 'reference_intake', 'design_contract', 'design_tokens',
    'golden_screen', 'golden_screen_approval', 'state_matrix',
  ]);
  assert.deepEqual(byId.get('frontend-engineering')?.required_outputs, [
    'implemented_one_state', 'render_compare', 'accessibility_evidence', 'responsive_evidence',
  ]);
  assert.deepEqual(byId.get('browser-verification')?.required_outputs, [
    'functional_verdict', 'visual_verdict', 'captured_evidence',
  ]);
  assert.deepEqual(byId.get('frontend-propagation')?.required_outputs, [
    'locked_design_system', 'propagated_states', 'capability_preservation_evidence',
  ]);

  for (const [file, expected] of [
    ['vibetether-built-in-design', /product UX contract.*reference intake.*design contract.*golden screen/is],
    ['vibetether-built-in-implementation', /implement one state.*render and compare/is],
    ['vibetether-built-in-verification', /functional acceptance.*visual acceptance/is],
  ]) {
    const source = await readFile(path.join(root, 'registry', 'builtins', file, 'SKILL.md'), 'utf8');
    assert.match(source, expected, file);
  }
});

test('S0-R02: complete UI lifecycle context exposes its ordered contract and controlled gates', async () => {
  const fixture = await initProject('stage0-ui-context');
  const report = await buildContext({
    project: fixture.root,
    boundary: 'task-entry',
    task_text: 'Redesign the checkout UI from the reference screenshot.',
  });
  assert.equal(report.task.phase, 'DESIGN');
  assert.equal(report.task.classification.needs_user_decision, true);
  assert.deepEqual(report.ui.required_acceptances, [GOLDEN]);
  assert.equal(report.ui.lifecycle.at(0), 'UI_DISCOVER');
  assert.equal(report.ui.lifecycle.at(-1), 'LOCK_AND_PROPAGATE');
});

test('S0-R03: propagation gate rejects a controlled UI route with no selected UI Outcome', async () => {
  const fixture = await initProject('stage0-ui-no-outcome');
  const check = functionalCheck();
  await assert.rejects(
    startStep({
      project: fixture.root,
      phase: 'EXECUTE_ONE',
      capability: 'frontend-propagation',
      slice: 'Attempt propagation without governed UI coverage.',
      task_text: 'Propagate the checkout interface.',
      scope_paths: ['ui-state.txt'],
      success_evidence: [check.claim],
      success_checks: [{ ...check, acceptance_ids: [] }],
      code_write: true,
      confirmed_by_user: true,
      decision_reason: 'Fixture-only attempted propagation.',
    }),
    (error) => error?.code === 'UI_OUTCOME_CONTRACT_REQUIRED',
  );
});

test('S0-R03: propagation gate rejects every incomplete acceptance combination', async () => {
  const cases = [
    ['none', []],
    ['golden only', [GOLDEN]],
    ['functional only', [FUNCTIONAL]],
    ['visual only', [VISUAL]],
  ];
  for (const [name, accepted] of cases) {
    const fixture = await governedUiFixture(`stage0-ui-${name.replaceAll(' ', '-')}`);
    if (accepted.includes(FUNCTIONAL)) await satisfyFunctional(fixture);
    if (accepted.includes(GOLDEN)) await recordDecision(fixture, GOLDEN);
    if (accepted.includes(VISUAL)) await recordDecision(fixture, VISUAL);
    await assert.rejects(
      startUiRoute(fixture),
      (error) => error?.code === 'UI_ACCEPTANCE_REQUIRED' && accepted.every((id) => !error.missing_acceptance_ids?.includes(id)),
      name,
    );
  }
});

test('S0-R03: propagation gate rejects a stale golden decision after final product bytes change', async () => {
  const fixture = await governedUiFixture('stage0-ui-stale-golden');
  await recordDecision(fixture, GOLDEN);
  await writeFile(path.join(fixture.root, 'app.txt'), 'changed after golden approval\n');
  await assert.rejects(
    startUiRoute(fixture, 'frontend-engineering'),
    (error) => error?.code === 'UI_ACCEPTANCE_REQUIRED' && error.missing_acceptance_ids?.includes(GOLDEN),
  );
});

test('S0-R03: provider or custom-route overlays cannot weaken the propagation gate', async () => {
  const fixture = await governedUiFixture('stage0-ui-overlay');
  const routesPath = path.join(fixture.root, '.vibetether', 'routes.json');
  const routes = JSON.parse(await readFile(routesPath, 'utf8'));
  routes.routes.push({
    id: 'attempted-ui-weakening',
    phases: ['EXECUTE_ONE'],
    capability: 'frontend-propagation',
    signals: { all: [], any: ['attempted-weakening'], none: [] },
    provider: 'vibetether-built-in-implementation',
    role: 'overlay',
    priority: 1000,
    required_outputs: [],
    exit_evidence: [],
  });
  await writeFile(routesPath, `${JSON.stringify(routes, null, 2)}\n`);
  await assert.rejects(
    startUiRoute(fixture, 'frontend-propagation', ['attempted-weakening']),
    (error) => error?.code === 'UI_ACCEPTANCE_REQUIRED',
  );
});

test('S0-R03: golden approval permits one-state engineering but propagation requires all-current receipts', async () => {
  const engineering = await governedUiFixture('stage0-ui-engineering-positive');
  await recordDecision(engineering, GOLDEN);
  const oneState = await startUiRoute(engineering, 'frontend-engineering');
  assert.equal(oneState.route.capability, 'frontend-engineering');
  await abandonStep({ project: engineering.root, reason: 'The positive gate assertion is complete.' });

  const propagation = await governedUiFixture('stage0-ui-propagation-positive');
  await satisfyFunctional(propagation);
  await recordDecision(propagation, GOLDEN);
  await recordDecision(propagation, VISUAL);
  const allCurrent = await startUiRoute(propagation);
  assert.equal(allCurrent.route.capability, 'frontend-propagation');
  assert.ok(allCurrent.route.required_outputs.includes('locked_design_system'));
  await abandonStep({ project: propagation.root, reason: 'The all-current propagation assertion is complete.' });
});
