import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { main } from '../src/cli.mjs';
import { ROUTE_HANDSHAKE_PATH } from '../src/route-handshake.mjs';

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function initializedProject(name) {
  const root = await mkdtemp(path.join(os.tmpdir(), `vibetether-route-handshake-${name}-`));
  await main([
    'init', '--project', root, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Keep a multi-phase coding task aligned.',
    '--success-evidence', 'Each phase route has fresh evidence.',
  ]);
  return root;
}

async function startRoute(root, overrides = {}) {
  const phase = overrides.phase ?? 'PLAN';
  const capability = overrides.capability ?? 'planning';
  const signals = overrides.signals ?? ['direction-approved'];
  const args = [
    'route', '--project', root, '--phase', phase, '--capability', capability,
    '--agent', overrides.agent ?? 'codex', '--json',
  ];
  for (const signal of signals) args.push('--signal', signal);
  if (overrides.select) args.push('--select', overrides.select);
  if (overrides.reason) args.push('--reason', overrides.reason);
  return JSON.parse(await main(args));
}

async function readHandshake(root) {
  return YAML.parse(await readFile(path.join(root, ...ROUTE_HANDSHAKE_PATH.split('/')), 'utf8'));
}

test('route starts a bounded active handshake with live experience metadata', async () => {
  const root = await initializedProject('start');

  const output = await startRoute(root);

  assert.equal(output.status, 'active');
  assert.equal(output.phase, 'PLAN');
  assert.equal(output.capability, 'planning');
  assert.deepEqual(output.signals, ['direction-approved']);
  assert.equal(output.selected_skill, output.selection.skill);
  assert.ok(Array.isArray(output.expected_outputs));
  assert.ok(Array.isArray(output.exit_evidence));
  assert.deepEqual(output.applicable_experience, []);
  assert.equal(output.checkpoint_phase, 'DISCOVER');
  const state = await readHandshake(root);
  assert.equal(state.status, 'active');
  assert.equal(state.phase, 'PLAN');
  assert.equal(state.capability, 'planning');
  for (const forbidden of ['reasoning', 'chain_of_thought', 'private_reasoning', 'raw_output']) {
    assert.equal(Object.hasOwn(state, forbidden), false);
  }
});

test('an active route blocks a different phase but permits an idempotent same-route refresh', async () => {
  const root = await initializedProject('transition');
  const first = await startRoute(root);
  const refreshed = await startRoute(root);
  assert.equal(refreshed.status, 'active');
  assert.equal(refreshed.selected_skill, first.selected_skill);

  await assert.rejects(
    startRoute(root, { phase: 'EXECUTE_ONE', capability: 'tdd', signals: ['new-behavior'] }),
    /complete or abandon.*active route/i,
  );
  assert.equal((await readHandshake(root)).phase, 'PLAN');
});

test('route complete requires bounded evidence and safe existing artifacts', async () => {
  const root = await initializedProject('complete');
  await startRoute(root);
  await assert.rejects(main(['route', 'complete', '--project', root]), /requires.*evidence/i);
  await assert.rejects(
    main(['route', 'complete', '--project', root, '--evidence', 'passed', '--artifact', '../outside.txt']),
    /artifact.*inside|unsafe/i,
  );
  await assert.rejects(
    main(['route', 'complete', '--project', root, '--evidence', 'passed', '--artifact', '.env']),
    /sensitive/i,
  );

  await mkdir(path.join(root, 'test'), { recursive: true });
  await writeFile(path.join(root, 'test', 'planning.test.mjs'), 'export {};\n', 'utf8');
  const completed = JSON.parse(await main([
    'route', 'complete', '--project', root,
    '--evidence', 'Focused planning contract exited 0',
    '--evidence', 'Scope review found no extra files',
    '--artifact', 'test/planning.test.mjs', '--json',
  ]));
  assert.equal(completed.status, 'satisfied');
  assert.deepEqual(completed.completion_evidence, [
    'Focused planning contract exited 0',
    'Scope review found no extra files',
  ]);
  assert.deepEqual(completed.artifacts, ['test/planning.test.mjs']);

  const next = await startRoute(root, {
    phase: 'EXECUTE_ONE',
    capability: 'tdd',
    signals: ['new-behavior'],
  });
  assert.equal(next.phase, 'EXECUTE_ONE');
  assert.equal(next.status, 'active');
});

test('route abandon requires a material reason and allows re-anchoring', async () => {
  const root = await initializedProject('abandon');
  await startRoute(root);
  await assert.rejects(main(['route', 'abandon', '--project', root]), /requires.*reason/i);
  const abandoned = JSON.parse(await main([
    'route', 'abandon', '--project', root,
    '--reason', 'The user replaced the approved design.', '--json',
  ]));
  assert.equal(abandoned.status, 'abandoned');
  assert.equal(abandoned.abandonment_reason, 'The user replaced the approved design.');
  const next = await startRoute(root, {
    phase: 'DESIGN',
    capability: 'product-design',
    signals: ['behavior-choice-needed'],
  });
  assert.equal(next.phase, 'DESIGN');
});

async function installSkill(root, skill) {
  const directory = path.join(root, '.agents', 'skills', skill);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'SKILL.md'), `# ${skill}\n`, 'utf8');
}

async function writeAlternativeRoutes(root) {
  await installSkill(root, 'to-issues');
  await installSkill(root, 'request-refactor-plan');
  await writeFile(path.join(root, '.vibetether', 'routes.local.yaml'), YAML.stringify({
    schema_version: 1,
    routes: [
      {
        id: 'project-primary-planning',
        phases: ['PLAN'],
        capability: 'planning',
        when_any: ['prd-approved'],
        skill: 'to-issues',
        role: 'primary',
        use_when: ['Turn an approved PRD into issues.'],
        expected_outputs: ['scoped-issues'],
        exit_evidence: ['Requirements are mapped.'],
      },
      {
        id: 'project-alternative-planning',
        phases: ['PLAN'],
        capability: 'planning',
        when_any: ['prd-approved'],
        skill: 'request-refactor-plan',
        role: 'alternative',
        use_when: ['Plan a refactor instead of issue decomposition.'],
        expected_outputs: ['refactor-plan'],
        exit_evidence: ['Refactor boundaries are mapped.'],
      },
    ],
  }), 'utf8');
}

test('an explicit available alternative requires and records a material reason', async () => {
  const root = await initializedProject('alternative');
  await writeAlternativeRoutes(root);
  await assert.rejects(
    startRoute(root, { signals: ['prd-approved'], select: 'request-refactor-plan' }),
    /--reason.*--select|reason.*required/i,
  );

  const selected = await startRoute(root, {
    signals: ['prd-approved'],
    select: 'request-refactor-plan',
    reason: 'The approved change is a bounded refactor, not product issue decomposition.',
  });
  assert.equal(selected.recommended_skill, 'to-issues');
  assert.equal(selected.selected_skill, 'request-refactor-plan');
  assert.equal(selected.selection_source, 'project-local');
  assert.equal(selected.alternative_reason, 'The approved change is a bounded refactor, not product issue decomposition.');
  assert.equal((await readHandshake(root)).alternative_reason, selected.alternative_reason);
});

test('route rejects unavailable or unknown explicit selections and oversized evidence', async () => {
  const root = await initializedProject('unsafe-selection');
  await assert.rejects(
    startRoute(root, { select: 'missing-skill', reason: 'Try another tool.' }),
    /not an available.*alternative|unknown.*selection/i,
  );
  await startRoute(root);
  await assert.rejects(
    main(['route', 'complete', '--project', root, '--evidence', 'x'.repeat(501)]),
    /500 characters/i,
  );
  assert.equal((await readHandshake(root)).status, 'active');
});

test('capabilities remains read-only while route owns handshake state', async () => {
  const root = await initializedProject('read-only');
  await main([
    'capabilities', '--project', root, '--phase', 'PLAN', '--capability', 'planning',
    '--signal', 'direction-approved', '--agent', 'codex', '--json',
  ]);
  assert.equal(await exists(path.join(root, ...ROUTE_HANDSHAKE_PATH.split('/'))), false);
  await startRoute(root);
  assert.equal(await exists(path.join(root, ...ROUTE_HANDSHAKE_PATH.split('/'))), true);
});

test('route CLI help and flag validation fail closed before state writes', async () => {
  const root = await initializedProject('cli');
  assert.match(await main(['route', '--help']), /vibetether route/);
  await assert.rejects(main(['route', '--project', root, '--phase', 'PLAN']), /phase.*capability.*together|required/i);
  await assert.rejects(main([
    'route', '--project', root, '--phase', 'PLAN', '--capability', 'planning', '--agent', 'both',
  ]), /invalid.*agent/i);
  await assert.rejects(main(['route', 'complete', '--project', root, '--unknown']), /unknown option.*route complete/i);
  assert.equal(await exists(path.join(root, ...ROUTE_HANDSHAKE_PATH.split('/'))), false);
});
