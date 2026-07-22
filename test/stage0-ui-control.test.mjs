import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { classifyTaskText } from '../src/task-classifier.mjs';
import { startStep } from '../src/step.mjs';
import { initProject, testSuccessCheck } from './helpers.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('S0-R02: complete UI lifecycle selects the specialized frontend design capability', () => {
  const classification = classifyTaskText('Redesign the checkout flow.', {
    intentStatus: 'confirmed',
    currentPhase: 'DISCOVER',
  });
  assert.equal(classification.phase, 'DESIGN');
  assert.equal(classification.capability, 'frontend-product-design');
  assert.deepEqual(classification.signals, ['frontend-product-design', 'user-visible-ui']);
  assert.equal(classification.needs_user_decision, true);
});

test('S0-R02: public UI capabilities encode the complete UI lifecycle', async () => {
  const registry = JSON.parse(await readFile(path.join(root, 'registry', 'capabilities.json'), 'utf8'));
  const byId = new Map(registry.capabilities.map((capability) => [capability.id, capability]));
  assert.deepEqual(byId.get('frontend-product-design')?.required_outputs, [
    'reference_intake',
    'design_contract',
    'design_tokens',
    'golden_screen',
    'golden_screen_approval',
    'state_matrix',
  ]);
  assert.deepEqual(byId.get('frontend-engineering')?.required_outputs, [
    'implemented_one_state',
    'render_compare',
    'accessibility_evidence',
    'responsive_evidence',
  ]);
  assert.deepEqual(byId.get('browser-verification')?.required_outputs, [
    'functional_verdict',
    'visual_verdict',
    'captured_evidence',
  ]);
  assert.deepEqual(byId.get('frontend-propagation')?.required_outputs, [
    'locked_design_system',
    'propagated_states',
    'capability_preservation_evidence',
  ]);
});

test('S0-R03: propagation gate requires the reserved UI Outcomes on a VibeTether-controlled route', async () => {
  const fixture = await initProject('stage0-ui-outcomes');
  const check = testSuccessCheck('The approved UI state renders correctly.', 'ui-state.txt');
  await assert.rejects(
    startStep({
      project: fixture.root,
      phase: 'EXECUTE_ONE',
      capability: 'frontend-engineering',
      slice: 'Implement one approved checkout state.',
      task_text: 'In ui-state.txt, implement one approved checkout state without changing the public API.',
      scope_paths: ['ui-state.txt'],
      success_evidence: ['The approved UI state renders correctly.'],
      success_checks: [check],
      code_write: true,
      confirmed_by_user: true,
      decision_reason: 'The user approved this exact golden-screen direction and bounded state.',
    }),
    (error) => error?.code === 'UI_OUTCOME_CONTRACT_REQUIRED',
  );
});
