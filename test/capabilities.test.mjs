import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { refreshBoardAvailability, resolveBoardRoute } from '../src/capabilities.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageRoot, 'bin', 'vibetether.mjs');

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
}

test('route resolution recommends the best fit but falls through to an available alternative', () => {
  const board = {
    schema_version: 1,
    mode: 'advisory-router',
    selection_policy: { provider_selection: 'advisory' },
    high_risk_gates: ['visual-direction'],
    capabilities: [{
      id: 'plan-execution',
      phases: ['EXECUTE_ONE'],
      purpose: 'Execute a plan.',
      invoke_when: ['written-plan-exists'],
      expected_outputs: ['verified_slice'],
      exit_evidence: ['Slice is verified.'],
      fallback: 'vibetether-built-in-execution',
    }],
    routes: [
      {
        id: 'delegated',
        phase: 'EXECUTE_ONE',
        capability: 'plan-execution',
        priority: 200,
        signals: { all: ['subagents-available', 'delegation-authorized'], any: [] },
        recommendation: { skill: 'subagent-driven-development', available_in: [], reason: 'Delegate isolated slices.' },
        fallback: 'executing-plans',
        selection: 'recommend',
        expected_outputs: ['verified_slice'],
        exit_evidence: ['Slice is verified.'],
      },
      {
        id: 'inline',
        phase: 'EXECUTE_ONE',
        capability: 'plan-execution',
        priority: 100,
        signals: { all: [], any: [] },
        recommendation: { skill: 'executing-plans', available_in: ['codex'], reason: 'Execute inline.' },
        fallback: 'vibetether-built-in-execution',
        selection: 'recommend',
        expected_outputs: ['verified_slice'],
        exit_evidence: ['Slice is verified.'],
      },
    ],
  };

  const result = resolveBoardRoute(board, {
    phase: 'EXECUTE_ONE',
    capability: 'plan-execution',
    signals: ['subagents-available', 'delegation-authorized'],
    harness: 'codex',
  });

  assert.equal(result.advisory, true);
  assert.equal(result.recommendation.skill, 'subagent-driven-development');
  assert.equal(result.recommendation.available, false);
  assert.equal(result.selection.skill, 'executing-plans');
  assert.equal(result.selection.source, 'available-alternative');
  assert.equal(result.should_invoke_provider, true);
});

test('runtime availability refresh removes deleted providers before route selection', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-capability-refresh-'));
  const board = {
    schema_version: 1,
    mode: 'advisory-router',
    high_risk_gates: [],
    capabilities: [{
      id: 'planning',
      phases: ['PLAN'],
      expected_outputs: ['plan'],
      exit_evidence: ['Plan is reviewable.'],
      fallback: 'Use the built-in planning loop.',
    }],
    routes: [{
      id: 'planning',
      phase: 'PLAN',
      capability: 'planning',
      priority: 100,
      signals: { all: [], any: [] },
      recommendation: {
        skill: 'writing-plans',
        available_in: ['codex'],
        installations: { codex: '.agents/skills/writing-plans' },
        reason: 'Create an implementation plan.',
      },
      fallback: 'vibetether-built-in-planning',
      expected_outputs: ['plan'],
      exit_evidence: ['Plan is reviewable.'],
    }],
  };

  const refreshed = await refreshBoardAvailability(board, root);
  const result = resolveBoardRoute(refreshed, { phase: 'PLAN', capability: 'planning', signals: [], harness: 'codex' });
  assert.deepEqual(refreshed.routes[0].recommendation.available_in, []);
  assert.equal(result.selection.skill, 'vibetether-built-in-planning');
  assert.equal(result.should_invoke_provider, false);
});

test('capabilities command exposes a human dashboard and machine-readable built-in route', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vibetether-capabilities-cli-'));
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);

  const dashboard = runCli(['capabilities', '--project', target]);
  assert.equal(dashboard.status, 0, dashboard.stderr || dashboard.stdout);
  assert.match(dashboard.stdout, /advisory/i);
  assert.match(dashboard.stdout, /requirements-clarification/);
  assert.match(dashboard.stdout, /automatic work-readiness gate/i);
  assert.match(dashboard.stdout, /when to use/i);
  assert.match(dashboard.stdout, /installed skill inventory/i);

  const board = JSON.parse(await readFile(path.join(target, '.vibetether', 'capabilities.yaml'), 'utf8'));
  assert.equal(board.mode, 'advisory-router');
  assert.equal(board.readiness_gate.mode, 'automatic');
  assert.equal(board.readiness_gate.implementation_requires, 'READY_FOR_IMPLEMENT_ONE');

  const query = runCli([
    'capabilities', '--project', target, '--phase', 'DISCOVER',
    '--capability', 'requirements-clarification', '--signal', 'goal-unclear', '--agent', 'codex', '--json',
  ]);
  assert.equal(query.status, 0, query.stderr || query.stdout);
  const resolution = JSON.parse(query.stdout);
  assert.equal(resolution.advisory, true);
  assert.equal(resolution.recommendation, null);
  assert.equal(resolution.selection.skill, 'vibe-tether');
  assert.equal(resolution.selection.source, 'built-in-fallback');
  assert.equal(resolution.should_invoke_provider, false);
  assert.deepEqual(resolution.expected_outputs, ['goal', 'success_evidence', 'scope_boundaries', 'open_direction_decisions']);

  const localResolver = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'resolve-route.mjs');
  const local = spawnSync(process.execPath, [
    localResolver, '--project', target, '--phase', 'DISCOVER',
    '--capability', 'requirements-clarification', '--signal', 'goal-unclear', '--agent', 'codex',
  ], { cwd: target, encoding: 'utf8' });
  assert.equal(local.status, 0, local.stderr || local.stdout);
  const localResolution = JSON.parse(local.stdout);
  assert.equal(localResolution.selection.skill, 'vibe-tether');
  assert.equal(localResolution.should_invoke_provider, false);
});

test('capabilities requires phase and capability together', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vibetether-capabilities-invalid-'));
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const result = runCli(['capabilities', '--project', target, '--phase', 'PLAN']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /phase.*capability.*together/i);
});
