import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveBoardRoute } from '../src/capabilities.mjs';
import { createCapabilityBoard } from '../src/provider-plan.mjs';
import { loadProviderRegistry, resolveExposurePlan } from '../src/provider-registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function completeBoard() {
  const registry = await loadProviderRegistry();
  const providers = resolveExposurePlan(registry, 'standard', {
    bundles: ['web', 'production'],
    explicit_bundles: ['web', 'production'],
    signals: [],
  });
  const exposures = providers.map((provider) => ({
    ...provider,
    active: true,
    installations: { codex: { path: `.agents/skills/${provider.install_name}`, ownership: 'vibetether' } },
  }));
  return createCapabilityBoard(
    registry,
    'standard',
    { exposures, skills: exposures, bundles: ['web', 'production'] },
    ['codex'],
  );
}

test('community routing scenario matrix keeps one recommendation and a safe fallback', async () => {
  const board = await completeBoard();
  const scenarios = [
    ['vague request', 'DISCOVER', 'requirements-clarification', ['goal-unclear'], 'grilling'],
    ['unfamiliar codebase', 'ALIGN', 'codebase-orientation', ['codebase-unfamiliar'], 'codebase-design'],
    ['external research', 'DISCOVER', 'research', ['primary-source-research-needed'], 'research'],
    ['throwaway prototype', 'DESIGN', 'prototype', ['runnable-experiment-needed'], 'prototype'],
    ['React implementation', 'EXECUTE_ONE', 'frontend-engineering', ['react'], 'vercel-react-best-practices'],
    ['browser verification', 'VERIFY', 'browser-verification', ['browser'], 'browser-testing-with-devtools'],
    ['migration planning', 'PLAN', 'migration', ['migration'], 'deprecation-and-migration'],
    ['security review', 'REVIEW', 'security-review', ['security'], 'security-and-hardening'],
    ['release preparation', 'SHIP', 'release-verification', ['release'], 'shipping-and-launch'],
  ];

  for (const [name, phase, capability, signals, expected] of scenarios) {
    const result = resolveBoardRoute(board, { phase, capability, signals, harness: 'codex' });
    assert.equal(result.selection.skill, expected, name);
    assert.equal(result.should_invoke_provider, true, name);
  }

  for (const [capability, catalogAlternative] of [
    ['huge-effort-wayfinding', 'wayfinder'],
    ['handoff-recovery', 'handoff'],
    ['triage-qa', 'triage'],
  ]) {
    const contract = board.capabilities.find((entry) => entry.id === capability);
    const result = resolveBoardRoute(board, {
      phase: contract.phases[0],
      capability,
      signals: contract.invoke_when.slice(0, 1),
      harness: 'codex',
    });
    assert.equal(result.selection.skill, 'vibe-tether');
    assert.equal(result.should_invoke_provider, false);
    assert.equal(contract.catalog_alternatives.includes(catalogAlternative), true);
  }
});

test('high-risk scenario signals add confirmation without disabling advisory routing', async () => {
  const board = await completeBoard();
  const result = resolveBoardRoute(board, {
    phase: 'PLAN',
    capability: 'migration',
    signals: ['migration', 'destructive-data-change'],
    harness: 'codex',
  });

  assert.equal(result.selection.skill, 'deprecation-and-migration');
  assert.equal(result.confirmation_required, true);
  assert.deepEqual(result.confirmation_gates, ['destructive-data-change']);
});

test('Karpathy guidance is composed as an implementation overlay, never as the workflow primary', async () => {
  const board = await completeBoard();
  const result = resolveBoardRoute(board, {
    phase: 'EXECUTE_ONE',
    capability: 'implementation',
    signals: ['new-behavior'],
    harness: 'codex',
  });

  assert.equal(result.primary, null);
  assert.equal(result.selection.skill, 'vibe-tether');
  assert.equal(result.overlays.some((overlay) => overlay.skill === 'karpathy-guidelines' && overlay.available), true);
  assert.equal(result.should_invoke_provider, true);
});

test('the agent-facing scenario guide is contract-linked to the registry scenario catalog', async () => {
  const registry = await loadProviderRegistry();
  const board = await completeBoard();
  const guide = await readFile(path.join(root, 'skills', 'vibe-tether', 'references', 'scenario-routing.md'), 'utf8');

  assert.ok(registry.scenario_catalog.length >= 14);
  assert.deepEqual(board.scenarios, registry.scenario_catalog);
  for (const scenario of registry.scenario_catalog) {
    assert.match(guide, new RegExp(`\\b${scenario.id}\\b`));
    assert.equal(typeof scenario.situation, 'string');
    assert.ok(scenario.signals.length > 0);
    assert.equal(typeof scenario.expected_path, 'string');
  }
});
