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

async function governedUiFixture(name, outcome = uiOutcome()) {
  const fixture = await initProject(name);
  await mainJson(['outcomes', 'propose', '--project', fixture.root, '--outcome-json', JSON.stringify(outcome), '--yes']);
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

async function recordDecision(fixture, acceptanceId, independenceLevel = 'peer') {
  const visual = acceptanceId === VISUAL;
  await mainJson([
    'outcomes', 'acceptance', 'record', '--project', fixture.root, '--id', acceptanceId,
    '--user-message-locator', `user-message:test-${acceptanceId}`,
    '--reason', `The test user records a current and bounded decision for ${acceptanceId}.`,
    ...(visual ? ['--independence-level', independenceLevel] : []), '--yes',
  ]);
}

async function satisfyFunctional(fixture) {
  const check = functionalCheck();
  const started = await startStep({
    project: fixture.root,
    phase: 'EXECUTE_ONE',
    capability: 'implementation',
    slice: 'Materialize only the bounded command-evidence fixture.',
    task_text: 'Write the verified marker to the bounded fixture artifact.',
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

test('S0-R02: implementation, browser verification, and propagation classify to their exact UI capabilities', () => {
  for (const [prompt, phase, capability] of [
    ['In ui-state.txt, implement one UI state without changing public behavior.', 'EXECUTE_ONE', 'frontend-engineering'],
    ['Use TDD to implement one checkout UI state in ui-state.txt.', 'EXECUTE_ONE', 'frontend-engineering'],
    ['Fix the broken checkout UI state in ui-state.txt.', 'EXECUTE_ONE', 'frontend-engineering'],
    ['Use TDD to fix the checkout CSS.', 'EXECUTE_ONE', 'frontend-engineering'],
    ['Debug the broken checkout button styling, then fix it.', 'EXECUTE_ONE', 'frontend-engineering'],
    ['Review and change the checkout layout.', 'EXECUTE_ONE', 'frontend-engineering'],
    ['Use TDD to fix the checkout styles.', 'EXECUTE_ONE', 'frontend-engineering'],
    ['Debug the broken checkout form, then fix it.', 'EXECUTE_ONE', 'frontend-engineering'],
    ['Review and change the checkout spacing.', 'EXECUTE_ONE', 'frontend-engineering'],
    ['Verify the checkout UI render against the accepted golden screenshot.', 'VERIFY', 'browser-verification'],
    ['Propagate the accepted checkout UI across all screens.', 'EXECUTE_ONE', 'frontend-propagation'],
  ]) {
    const classification = classifyTaskText(prompt, { intentStatus: 'confirmed', currentPhase: 'DISCOVER' });
    assert.equal(classification.phase, phase, prompt);
    assert.equal(classification.capability, capability, prompt);
    assert.ok(classification.signals.includes(capability), prompt);
    assert.ok(classification.signals.includes('user-visible-ui'), prompt);
  }
  assert.equal(
    classifyTaskText('Diagnose the broken checkout UI before changing code.', { intentStatus: 'confirmed', currentPhase: 'DISCOVER' }).capability,
    'debugging',
  );
  assert.equal(
    classifyTaskText('Review the checkout UI code without changing anything.', { intentStatus: 'confirmed', currentPhase: 'DISCOVER' }).mode,
    'observation',
  );
  for (const [prompt, capability] of [
    ['Use TDD to fix the cache layout algorithm.', 'tdd'],
    ['Debug the CLI theme configuration.', 'debugging'],
    ['Review and change the memory layout.', 'review'],
  ]) {
    assert.equal(
      classifyTaskText(prompt, { intentStatus: 'confirmed', currentPhase: 'DISCOVER' }).capability,
      capability,
      prompt,
    );
  }
  assert.equal(
    classifyTaskText('Use TDD to fix the checkout flow.', {
      intentStatus: 'confirmed', currentPhase: 'DISCOVER', scopePaths: ['src/checkout/CheckoutForm.tsx'],
    }).capability,
    'frontend-engineering',
  );
  assert.equal(
    classifyTaskText('Use TDD.', {
      intentStatus: 'confirmed', currentPhase: 'DISCOVER', scopePaths: ['src/checkout/CheckoutForm.tsx'],
      requestedPhase: 'EXECUTE_ONE', codeWrite: true,
    }).capability,
    'frontend-engineering',
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

  const packageVersion = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
  const providers = JSON.parse(await readFile(path.join(root, 'registry', 'providers.json'), 'utf8')).providers;
  for (const id of [
    'vibetether-built-in-design',
    'vibetether-built-in-implementation',
    'vibetether-built-in-verification',
  ]) {
    const provider = providers.find((item) => item.id === id);
    assert.equal(provider?.version, packageVersion, `${id} version must follow its changed RC.4 bytes`);
    assert.ok(Date.parse(provider?.quality?.evaluated_at) >= Date.parse('2026-07-22T00:00:00.000Z'), `${id} evaluation metadata is stale`);
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

test('S0-R03: a caller cannot label classified UI propagation as generic implementation', async () => {
  const fixture = await initProject('stage0-ui-capability-mismatch');
  const check = functionalCheck();
  const attempt = {
    project: fixture.root,
    phase: 'EXECUTE_ONE',
    capability: 'implementation',
    slice: 'Propagate the checkout UI across all screens.',
    task_text: 'Propagate the checkout UI across all screens.',
    scope_paths: ['ui-state.txt'],
    success_evidence: [check.claim],
    success_checks: [{ ...check, acceptance_ids: [] }],
    code_write: true,
    confirmed_by_user: true,
    decision_reason: 'Fixture-only attempted capability downgrade.',
  };
  await assert.rejects(
    startStep(attempt),
    (error) => error?.code === 'UI_CAPABILITY_MISMATCH',
  );
  await assert.rejects(
    startStep({ ...attempt, classification: { capability: 'implementation', signals: [], mode: 'adaptive', needs_user_decision: false } }),
    (error) => error?.code === 'UI_CAPABILITY_MISMATCH',
  );
  await assert.rejects(
    startStep({ ...attempt, capability: 'frontend-product-design' }),
    (error) => error?.code === 'UI_CAPABILITY_MISMATCH',
  );
});

test('S0-R03: UI propagation cannot be hidden in slice while task text stays generic', async () => {
  const fixture = await initProject('stage0-ui-split-intent');
  const check = functionalCheck();
  await assert.rejects(
    startStep({
      project: fixture.root,
      phase: 'EXECUTE_ONE',
      capability: 'implementation',
      slice: 'Propagate the checkout UI across all screens.',
      task_text: 'Change src/widget.mjs without changing public behavior.',
      scope_paths: ['src/widget.mjs', 'ui-state.txt'],
      success_evidence: [check.claim],
      success_checks: [{ ...check, acceptance_ids: [] }],
      code_write: true,
      confirmed_by_user: true,
      decision_reason: 'Fixture-only attempted split-intent capability downgrade.',
    }),
    (error) => error?.code === 'UI_CAPABILITY_MISMATCH',
  );
});

test('S0-R03: caller-supplied classification cannot suppress an observed UI decision gate', async () => {
  const fixture = await initProject('stage0-ui-classification-spoof');
  await assert.rejects(
    startStep({
      project: fixture.root,
      phase: 'DESIGN',
      capability: 'frontend-product-design',
      slice: 'Redesign the checkout UI from the accepted product reference.',
      task_text: 'Redesign the checkout UI from the accepted product reference.',
      success_evidence: ['The owner approves one exact golden screen.'],
      classification: {
        phase: 'DESIGN', capability: 'frontend-product-design', signals: ['user-visible-ui'],
        mode: 'observation', deep_requested: false, needs_user_decision: false,
      },
    }),
    (error) => error?.code === 'USER_DECISION_REQUIRED',
  );
});

test('S0-R03: a method capability cannot mask an observed UI implementation operation', async () => {
  const fixture = await initProject('stage0-ui-method-mask');
  const check = functionalCheck();
  await assert.rejects(
    startStep({
      project: fixture.root,
      phase: 'EXECUTE_ONE',
      capability: 'tdd',
      slice: 'Use TDD to implement one checkout UI state.',
      task_text: 'Use TDD to implement one checkout UI state in ui-state.txt.',
      scope_paths: ['ui-state.txt'],
      success_evidence: [check.claim],
      success_checks: [{ ...check, acceptance_ids: [] }],
      code_write: true,
      confirmed_by_user: true,
      decision_reason: 'Fixture-only attempted method mask.',
    }),
    (error) => error?.code === 'UI_CAPABILITY_MISMATCH',
  );
});

test('S0-R03: CSS, styling, and layout synonyms cannot mask UI implementation', async () => {
  const fixture = await initProject('stage0-ui-synonym-mask');
  const check = functionalCheck();
  for (const [taskText, capability, scopePaths = ['ui-state.txt']] of [
    ['Use TDD to fix the checkout CSS.', 'tdd'],
    ['Debug the broken checkout button styling, then fix it.', 'debugging'],
    ['Review and change the checkout layout.', 'review'],
    ['Use TDD to fix the checkout styles.', 'tdd'],
    ['Debug the broken checkout form, then fix it.', 'debugging'],
    ['Review and change the checkout spacing.', 'review'],
    ['Use TDD to fix the checkout flow.', 'tdd', ['src/checkout/CheckoutForm.tsx']],
    ['Use TDD.', 'tdd', ['src/checkout/CheckoutForm.tsx', 'ui-state.txt']],
  ]) {
    await assert.rejects(
      startStep({
        project: fixture.root,
        phase: 'EXECUTE_ONE',
        capability,
        slice: taskText,
        task_text: taskText,
        scope_paths: scopePaths,
        success_evidence: [check.claim],
        success_checks: [{ ...check, acceptance_ids: [] }],
        code_write: true,
        confirmed_by_user: true,
        decision_reason: 'Fixture-only attempted UI synonym mask.',
      }),
      (error) => error?.code === 'UI_CAPABILITY_MISMATCH',
      taskText,
    );
  }
});

test('S0-R03: reserved UI acceptance IDs reject caller-selected validator semantics', async () => {
  const malformed = uiOutcome();
  const commandValidator = structuredClone(malformed.acceptance.find((item) => item.id === FUNCTIONAL).validator);
  for (const acceptance of malformed.acceptance) {
    acceptance.evidence_kind = 'command';
    acceptance.required_maturity = 'functional';
    acceptance.validator = structuredClone(commandValidator);
  }
  const fixture = await governedUiFixture('stage0-ui-reserved-semantics', malformed);
  await assert.rejects(
    startUiRoute(fixture),
    (error) => error?.code === 'UI_OUTCOME_CONTRACT_INVALID',
  );
});

test('S0-R03: functional acceptance rejects command validators with empty product coverage', async () => {
  const malformed = uiOutcome();
  malformed.acceptance.find((item) => item.id === FUNCTIONAL).validator.covers_paths = [];
  const fixture = await governedUiFixture('stage0-ui-functional-empty-coverage', malformed);
  await assert.rejects(
    startUiRoute(fixture),
    (error) => error?.code === 'UI_OUTCOME_CONTRACT_INVALID',
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

test('S0-R03: propagation gate rejects stale functional evidence after covered product bytes change', async () => {
  const fixture = await governedUiFixture('stage0-ui-stale-functional');
  await satisfyFunctional(fixture);
  await writeFile(path.join(fixture.root, 'ui-state.txt'), 'changed after functional acceptance\n');
  await recordDecision(fixture, GOLDEN);
  await recordDecision(fixture, VISUAL);
  await assert.rejects(
    startUiRoute(fixture),
    (error) => error?.code === 'UI_ACCEPTANCE_REQUIRED' && error.missing_acceptance_ids?.includes(FUNCTIONAL),
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

test('S0-R03: self review cannot satisfy the independent visual acceptance gate', async () => {
  const fixture = await governedUiFixture('stage0-ui-self-visual-review');
  await satisfyFunctional(fixture);
  await recordDecision(fixture, GOLDEN);
  await recordDecision(fixture, VISUAL, 'self');
  await assert.rejects(
    startUiRoute(fixture),
    (error) => error?.code === 'UI_ACCEPTANCE_REQUIRED' && error.missing_acceptance_ids?.includes(VISUAL),
  );
});
