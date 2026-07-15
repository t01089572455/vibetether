import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
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
    providers: [],
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
    providers: [],
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

test('core profile recalls proven paths through the built-in resolver without provider installation or staging', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vibetether-core-recall-'));
  const initialized = runCli(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);
  assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);

  const board = JSON.parse(await readFile(path.join(target, '.vibetether', 'capabilities.yaml'), 'utf8'));
  const phases = ['ALIGN', 'PLAN', 'EXECUTE_ONE', 'VERIFY', 'SHIP'];
  const recallRoutes = board.routes.filter((route) => route.capability === 'proven-path-recall');
  assert.equal(recallRoutes.length, phases.length);
  assert.deepEqual(recallRoutes.map((route) => route.phase).sort(), [...phases].sort());
  assert.deepEqual(board.providers, []);

  for (const route of recallRoutes) {
    assert.equal(route.recommendation.skill, 'vibetether-built-in-recall');
    assert.deepEqual(new Set(route.recommendation.available_in), new Set(['codex', 'claude']));
    assert.deepEqual(route.recommendation.installations, {});
  }

  for (const phase of phases) {
    const query = runCli([
      'capabilities', '--project', target, '--phase', phase,
      '--capability', 'proven-path-recall', '--signal', 'publish', '--agent', 'codex', '--json',
    ]);
    assert.equal(query.status, 0, `${phase}: ${query.stderr || query.stdout}`);
    const resolution = JSON.parse(query.stdout);
    assert.equal(resolution.recommendation.skill, 'vibetether-built-in-recall', phase);
    assert.equal(resolution.selection.skill, 'vibetether-built-in-recall', phase);
    assert.equal(resolution.selection.source, 'recommended', phase);
    assert.equal(resolution.should_invoke_provider, true, phase);
  }

  await assert.rejects(access(path.join(target, '.vibetether', 'providers')));
  assert.deepEqual(await readdir(path.join(target, '.agents', 'skills')), ['vibe-tether']);
  assert.deepEqual(await readdir(path.join(target, '.claude', 'skills')), ['vibe-tether']);
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

async function installLocalSkill(root, harness, skill) {
  const parent = harness === 'codex' ? '.agents' : '.claude';
  const target = path.join(root, parent, 'skills', skill);
  await mkdir(target, { recursive: true });
  await writeFile(
    path.join(target, 'SKILL.md'),
    `---\nname: ${skill}\ndescription: Project fixture Skill.\n---\n\n# ${skill}\n`,
    'utf8',
  );
}

async function writeLocalPlanningRoute(root, skill, overrides = {}) {
  const target = path.join(root, '.vibetether', 'routes.local.yaml');
  await writeFile(target, YAML.stringify({
    schema_version: 1,
    routes: [{
      id: 'project-prd-to-issues',
      phases: ['PLAN'],
      capability: 'planning',
      when_any: ['prd-approved'],
      skill,
      role: 'primary',
      use_when: ['A reviewed PRD needs actionable issues.'],
      expected_outputs: ['scoped-issues'],
      exit_evidence: ['Every approved requirement is mapped to an issue.'],
      ...overrides,
    }],
  }), 'utf8');
}

async function initializedLocalRouteProject(name, agent = 'codex') {
  const target = await mkdtemp(path.join(os.tmpdir(), `vibetether-local-route-${name}-`));
  const initialized = runCli(['init', '--project', target, '--agent', agent, '--profile', 'core', '--yes']);
  assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
  return target;
}

async function resolveLocalPlanning(root, agent = 'codex') {
  return JSON.parse(await showCapabilities({
    project: root,
    phase: 'PLAN',
    capability: 'planning',
    signals: ['prd-approved'],
    agent,
    json: true,
  }));
}

test('matching available local primary replaces only the curated recommendation', async () => {
  const root = await initializedLocalRouteProject('primary');
  await installLocalSkill(root, 'codex', 'to-issues');
  await writeLocalPlanningRoute(root, 'to-issues');

  const baseBoard = JSON.parse(await readFile(path.join(root, '.vibetether', 'capabilities.yaml'), 'utf8'));
  const baseCapability = baseBoard.capabilities.find(({ id }) => id === 'planning');
  const result = await resolveLocalPlanning(root);

  assert.equal(result.selection.skill, 'to-issues');
  assert.equal(result.selection.source, 'project-local');
  assert.equal(result.recommendation.available, true);
  assert.ok(result.required_outputs.includes('scoped-issues'));
  for (const output of baseCapability.expected_outputs) assert.ok(result.required_outputs.includes(output));
  for (const evidence of baseCapability.exit_evidence) assert.ok(result.exit_evidence.includes(evidence));
  assert.ok(result.exit_evidence.includes('Every approved requirement is mapped to an issue.'));
  assert.deepEqual(result.confirmation_gates, []);
});

test('local routes reload after a safe manual edit without reinitialization', async () => {
  const root = await initializedLocalRouteProject('live-edit');
  await installLocalSkill(root, 'codex', 'first-planner');
  await installLocalSkill(root, 'codex', 'second-planner');
  await writeLocalPlanningRoute(root, 'first-planner');
  assert.equal((await resolveLocalPlanning(root)).selection.skill, 'first-planner');

  await writeLocalPlanningRoute(root, 'second-planner');
  assert.equal((await resolveLocalPlanning(root)).selection.skill, 'second-planner');

  const generated = JSON.parse(await readFile(path.join(root, '.vibetether', 'capabilities.yaml'), 'utf8'));
  assert.equal(Object.hasOwn(generated, 'project_routes'), false);
});

test('a missing local primary falls back to the curated route with an explicit source', async () => {
  const root = await initializedLocalRouteProject('missing');
  await writeLocalPlanningRoute(root, 'to-issues');

  const result = await resolveLocalPlanning(root);

  assert.notEqual(result.selection.skill, 'to-issues');
  assert.equal(result.selection.source, 'curated-fallback');
  assert.match(result.selection.reason, /project-local.*unavailable/i);
  assert.equal(result.recommendation.skill, 'to-issues');
  assert.equal(result.recommendation.available, false);
});

test('project Skills are discovered only in the enabled harness', async () => {
  const root = await initializedLocalRouteProject('claude', 'claude');
  await installLocalSkill(root, 'claude', 'to-issues');
  await writeLocalPlanningRoute(root, 'to-issues');

  assert.equal((await resolveLocalPlanning(root, 'claude')).selection.source, 'project-local');
  const codex = await resolveLocalPlanning(root, 'codex');
  assert.notEqual(codex.selection.skill, 'to-issues');
  assert.equal(codex.selection.source, 'curated-fallback');
});

test('a linked project Skill or route overlay is rejected', async (context) => {
  const root = await initializedLocalRouteProject('linked');
  const external = await mkdtemp(path.join(os.tmpdir(), 'vibetether-linked-skill-'));
  await writeFile(path.join(external, 'SKILL.md'), '# linked\n', 'utf8');
  const skillTarget = path.join(root, '.agents', 'skills', 'to-issues');
  try {
    await symlink(external, skillTarget, 'dir');
  } catch (error) {
    if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
      context.skip(`Windows denied symlink creation: ${error.code}`);
      return;
    }
    throw error;
  }
  await writeLocalPlanningRoute(root, 'to-issues');
  await assert.rejects(resolveLocalPlanning(root), /linked|symbolic/i);

  await rm(skillTarget, { recursive: true, force: true });
  const overlay = path.join(root, '.vibetether', 'routes.local.yaml');
  const externalOverlay = path.join(external, 'routes.local.yaml');
  await writeFile(externalOverlay, 'schema_version: 1\nroutes: []\n', 'utf8');
  await rm(overlay);
  await symlink(externalOverlay, overlay, 'file');
  await assert.rejects(resolveLocalPlanning(root), /linked|symbolic/i);
});

test('projects without local routes retain the same generated resolution', async () => {
  const root = await initializedLocalRouteProject('unchanged');
  const generated = JSON.parse(await readFile(path.join(root, '.vibetether', 'capabilities.yaml'), 'utf8'));
  const refreshed = await refreshBoardAvailability(generated, root);
  const expected = resolveBoardRoute(refreshed, {
    phase: 'PLAN',
    capability: 'planning',
    signals: ['prd-approved'],
    harness: 'codex',
  });
  const actual = await resolveLocalPlanning(root);
  assert.deepEqual(actual.applicable_experience, []);
  delete actual.applicable_experience;
  assert.deepEqual(actual, expected);
  assert.equal(Object.hasOwn(actual, 'project_routes'), false);
});
