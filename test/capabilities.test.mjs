import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { refreshBoardAvailability, resolveBoardRoute, showCapabilities } from '../src/capabilities.mjs';
import { serializeExperienceIndex } from '../src/experience-index.mjs';

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
  assert.equal(result.primary.skill, 'subagent-driven-development');
  assert.deepEqual(result.overlays, []);
  assert.deepEqual(result.detected_signals, ['subagents-available', 'delegation-authorized']);
  assert.equal(result.fallback, 'executing-plans');
  assert.deepEqual(result.required_outputs, ['verified_slice']);
  assert.equal(typeof result.rationale, 'string');
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
  assert.match(dashboard.stdout, /catalog-only alternatives/i);

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

function publicationIndex(overrides = {}) {
  return {
    schema_version: 1,
    entries: [{
      id: 'github-publication',
      use_when: ['github', 'publish', 'release'],
      systems: ['git', 'windows'],
      artifacts: ['docs/operations/github-publishing.md'],
      verified_at: '2026-07-13',
      revalidate_when: ['authentication-method-changes', 'remote-changes'],
      status: 'proven',
      ...overrides,
    }],
  };
}

async function initializedExperienceProject(name) {
  const target = await mkdtemp(path.join(os.tmpdir(), `vibetether-capability-experience-${name}-`));
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  await mkdir(path.join(target, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(target, 'docs', 'operations', 'github-publishing.md'), '# GitHub publishing\n', 'utf8');
  await writeFile(
    path.join(target, '.vibetether', 'experience-index.yaml'),
    serializeExperienceIndex(publicationIndex()),
    'utf8',
  );
  return target;
}

test('package route queries attach metadata-only applicable experience without changing dashboards', async () => {
  const target = await initializedExperienceProject('query');
  const result = JSON.parse(await showCapabilities({
    project: target,
    phase: 'SHIP',
    capability: 'release-verification',
    signals: ['publish', 'windows'],
    agent: 'codex',
    json: true,
  }));

  assert.equal(result.applicable_experience.length, 1);
  assert.equal(result.applicable_experience[0].id, 'github-publication');
  assert.deepEqual(result.applicable_experience[0].artifacts, ['docs/operations/github-publishing.md']);
  assert.equal(JSON.stringify(result).includes('# GitHub publishing'), false);

  const human = await showCapabilities({
    project: target,
    phase: 'SHIP',
    capability: 'release-verification',
    signals: ['publish', 'windows'],
    agent: 'codex',
    json: false,
  });
  assert.match(human, /github-publication/);
  assert.match(human, /proven/);
  assert.match(human, /docs\/operations\/github-publishing\.md/);
  assert.doesNotMatch(human, /# GitHub publishing/);

  const unrelated = JSON.parse(await showCapabilities({
    project: target,
    phase: 'SHIP',
    capability: 'release-verification',
    signals: ['database'],
    agent: 'codex',
    json: true,
  }));
  assert.deepEqual(unrelated.applicable_experience, []);

  const dashboard = JSON.parse(await showCapabilities({ project: target, signals: [], json: true }));
  assert.equal(Object.hasOwn(dashboard, 'applicable_experience'), false);
});

test('package route queries honor the manifest experience route and fall back only when absent', async () => {
  const target = await initializedExperienceProject('manifest-route');
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  manifest.experience_index = 'docs/custom-experience.yaml';
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
  await writeFile(
    path.join(target, 'docs', 'custom-experience.yaml'),
    serializeExperienceIndex(publicationIndex({ id: 'custom-publication' })),
    'utf8',
  );

  const custom = JSON.parse(await showCapabilities({
    project: target,
    phase: 'SHIP',
    capability: 'release-verification',
    signals: ['publish'],
    agent: 'codex',
    json: true,
  }));
  assert.deepEqual(custom.applicable_experience.map(({ id }) => id), ['custom-publication']);

  delete manifest.experience_index;
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
  const fallback = JSON.parse(await showCapabilities({
    project: target,
    phase: 'SHIP',
    capability: 'release-verification',
    signals: ['publish'],
    agent: 'codex',
    json: true,
  }));
  assert.deepEqual(fallback.applicable_experience.map(({ id }) => id), ['github-publication']);
});

test('package route queries fail actionably for missing or malformed experience indexes while dashboards remain available', async () => {
  const target = await initializedExperienceProject('invalid-index');
  const indexPath = path.join(target, '.vibetether', 'experience-index.yaml');
  await rm(indexPath);
  await assert.rejects(
    showCapabilities({
      project: target,
      phase: 'SHIP',
      capability: 'release-verification',
      signals: ['publish'],
      agent: 'codex',
      json: true,
    }),
    /experience index[\s\S]*vibetether doctor/i,
  );
  assert.match(await showCapabilities({ project: target, signals: [], json: false }), /capability dashboard/i);

  await writeFile(indexPath, 'schema_version: 1\nentries: []\nnotes: hidden\n', 'utf8');
  await assert.rejects(
    showCapabilities({
      project: target,
      phase: 'SHIP',
      capability: 'release-verification',
      signals: ['publish'],
      agent: 'codex',
      json: true,
    }),
    /experience index[\s\S]*vibetether doctor/i,
  );
});

test('package route queries refuse a symlinked experience-index route', async (context) => {
  const target = await initializedExperienceProject('symlink-index');
  const external = path.join(await mkdtemp(path.join(os.tmpdir(), 'vibetether-external-index-')), 'index.yaml');
  await writeFile(external, serializeExperienceIndex(publicationIndex()), 'utf8');
  const indexPath = path.join(target, '.vibetether', 'experience-index.yaml');
  await rm(indexPath);
  try {
    await symlink(external, indexPath, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
      context.skip(`Windows denied symlink creation: ${error.code}`);
      return;
    }
    throw error;
  }

  await assert.rejects(
    showCapabilities({
      project: target,
      phase: 'SHIP',
      capability: 'release-verification',
      signals: ['publish'],
      agent: 'codex',
      json: true,
    }),
    /symbolic-link|symlink|experience index[\s\S]*doctor/i,
  );
});
