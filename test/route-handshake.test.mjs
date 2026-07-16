import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { main } from '../src/cli.mjs';
import { inspectProject } from '../src/doctor.mjs';
import { ROUTE_HANDSHAKE_PATH, writeControlState } from '../src/route-handshake.mjs';
import { createTruthMap } from '../src/truth-map.mjs';

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
  if (overrides.syncCheckpoint !== false) await updateCheckpoint(root, { phase });
  return JSON.parse(await main(args));
}

async function readHandshake(root) {
  return YAML.parse(await readFile(path.join(root, ...ROUTE_HANDSHAKE_PATH.split('/')), 'utf8'));
}

async function doctorReport(root) {
  try {
    return JSON.parse(await inspectProject({ project: root, json: true }));
  } catch (error) {
    if (typeof error.output === 'string') return JSON.parse(error.output);
    throw error;
  }
}

async function updateCheckpoint(root, update) {
  const target = path.join(root, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(target, 'utf8'));
  Object.assign(checkpoint, update);
  await writeFile(target, YAML.stringify(checkpoint), 'utf8');
}

async function resolveTruthForTest(root, reason = 'No confirmed project truth changed.') {
  const target = path.join(root, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(target, 'utf8'));
  checkpoint.truth_reconciliation = {
    ...checkpoint.truth_reconciliation,
    status: 'no_material_change',
    reason,
    updated_at: new Date().toISOString(),
  };
  await writeFile(target, YAML.stringify(checkpoint), 'utf8');
}

test('route starts a bounded active handshake with live experience metadata', async () => {
  const root = await initializedProject('start');

  const output = await startRoute(root);

  assert.equal(output.status, 'active');
  assert.equal(output.phase, 'PLAN');
  assert.equal(output.capability, 'planning');
  assert.match(output.route_instance_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(output.signals, ['direction-approved']);
  assert.equal(output.selected_skill, output.selection.skill);
  assert.ok(Array.isArray(output.expected_outputs));
  assert.ok(Array.isArray(output.exit_evidence));
  assert.deepEqual(output.applicable_experience, []);
  assert.equal(output.checkpoint_phase, 'PLAN');
  const state = await readHandshake(root);
  assert.equal(state.status, 'active');
  assert.equal(state.phase, 'PLAN');
  assert.equal(state.capability, 'planning');
  assert.equal(state.agent, 'codex');
  assert.equal(state.route_instance_id, output.route_instance_id);
  assert.equal(output.execution_start.root, '.');
  assert.equal(output.execution_start.git.available, false);
  for (const forbidden of ['reasoning', 'chain_of_thought', 'private_reasoning', 'raw_output']) {
    assert.equal(Object.hasOwn(state, forbidden), false);
  }
});

test('route refuses a checkpoint phase mismatch without writing either control file', async () => {
  const root = await initializedProject('phase-mismatch');
  const checkpointPath = path.join(root, '.vibetether', 'state', 'current.yaml');
  const before = await readFile(checkpointPath, 'utf8');

  await assert.rejects(
    startRoute(root, { syncCheckpoint: false }),
    /checkpoint phase.*route phase|phase.*mismatch/i,
  );

  assert.equal(await exists(path.join(root, ...ROUTE_HANDSHAKE_PATH.split('/'))), false);
  assert.equal(await readFile(checkpointPath, 'utf8'), before);
});

test('paired route and checkpoint writes roll back when the second write fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-route-pair-'));
  const handshakePath = path.join(root, '.vibetether', 'state', 'route-handshake.yaml');
  const checkpointPath = path.join(root, '.vibetether', 'state', 'current.yaml');
  await mkdir(path.dirname(handshakePath), { recursive: true });
  const handshakeBefore = 'schema_version: 1\nstatus: satisfied\n';
  const checkpointBefore = 'schema_version: 1\nphase: PLAN\n';
  await writeFile(handshakePath, handshakeBefore, 'utf8');
  await writeFile(checkpointPath, checkpointBefore, 'utf8');
  const failure = new Error('injected checkpoint write failure');

  await assert.rejects(
    writeControlState(
      root,
      { checkpoint: { path: '.vibetether/state/current.yaml' } },
      { schema_version: 1, status: 'active' },
      { schema_version: 1, phase: 'EXECUTE_ONE' },
      {
        writeAtomic: async (target, content) => {
          if (target === checkpointPath && content !== checkpointBefore) throw failure;
          await writeFile(target, content, 'utf8');
        },
      },
    ),
    (error) => error === failure,
  );

  assert.equal(await readFile(handshakePath, 'utf8'), handshakeBefore);
  assert.equal(await readFile(checkpointPath, 'utf8'), checkpointBefore);
});

test('route lifecycle synchronizes checkpoint provider selection', async () => {
  const root = await initializedProject('checkpoint-selection');
  const checkpointPath = path.join(root, '.vibetether', 'state', 'current.yaml');
  const started = await startRoute(root);
  let checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  assert.deepEqual(checkpoint.provider_selection, {
    capability: 'planning',
    recommended: started.recommended_skill,
    selected: started.selected_skill,
    selection_reason: started.selection_reason,
    invocation_status: 'active',
  });

  await main(['route', 'complete', '--project', root, '--evidence', 'Plan approved']);
  checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  assert.equal(checkpoint.provider_selection.invocation_status, 'satisfied');
  assert.equal(checkpoint.truth_reconciliation.status, 'pending');
  assert.equal(checkpoint.truth_reconciliation.trigger, 'route-complete');
  assert.equal(checkpoint.truth_reconciliation.route_instance_id, started.route_instance_id);

  await resolveTruthForTest(root, 'Planning changed no confirmed project truth.');
  await startRoute(root, { phase: 'DESIGN', capability: 'product-design', signals: ['behavior-choice-needed'] });
  await main(['route', 'abandon', '--project', root, '--reason', 'Direction changed']);
  checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  assert.equal(checkpoint.provider_selection.invocation_status, 'abandoned');
  assert.equal(checkpoint.provider_selection.selection_reason, 'Direction changed');
});

test('route re-anchor fingerprints confirmed authority and doctor detects later source drift', async () => {
  const root = await initializedProject('authority-snapshot');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'product.md'), '# Approved A\n', 'utf8');
  await writeFile(
    path.join(root, '.vibetether', 'TRUTH.md'),
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [{ path: 'docs/product.md', role: 'product-direction', scope: '.' }],
    }),
    'utf8',
  );

  await startRoute(root);
  const checkpoint = YAML.parse(await readFile(path.join(root, '.vibetether', 'state', 'current.yaml'), 'utf8'));
  assert.equal(checkpoint.authority_snapshot.truth_index.path, '.vibetether/TRUTH.md');
  assert.match(checkpoint.authority_snapshot.truth_index.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(checkpoint.authority_snapshot.confirmed_sources.map((entry) => entry.path), ['docs/product.md']);
  assert.match(checkpoint.authority_snapshot.confirmed_sources[0].sha256, /^[a-f0-9]{64}$/);

  await writeFile(path.join(root, 'docs', 'product.md'), '# Approved B\n', 'utf8');
  const report = await doctorReport(root);
  assert.equal(report.issues.some(({ code }) => code === 'changed-confirmed-truth'), true);
});

test('an active route blocks a different phase but permits an idempotent same-route refresh', async () => {
  const root = await initializedProject('transition');
  const first = await startRoute(root);
  const refreshed = await startRoute(root);
  assert.equal(refreshed.status, 'active');
  assert.equal(refreshed.selected_skill, first.selected_skill);
  assert.equal(refreshed.route_instance_id, first.route_instance_id);

  await assert.rejects(
    startRoute(root, { phase: 'EXECUTE_ONE', capability: 'tdd', signals: ['new-behavior'] }),
    /complete or abandon.*active route/i,
  );
  assert.equal((await readHandshake(root)).phase, 'PLAN');
});

test('an idempotent active-route refresh preserves the original authority anchor', async () => {
  const root = await initializedProject('refresh-anchor');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'product.md'), '# Approved A\n', 'utf8');
  await writeFile(
    path.join(root, '.vibetether', 'TRUTH.md'),
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [{ path: 'docs/product.md', role: 'product-direction', scope: '.' }],
    }),
    'utf8',
  );

  const first = await startRoute(root);
  const checkpointPath = path.join(root, '.vibetether', 'state', 'current.yaml');
  const before = YAML.parse(await readFile(checkpointPath, 'utf8')).authority_snapshot;
  await writeFile(path.join(root, 'docs', 'product.md'), '# Approved B\n', 'utf8');

  const refreshed = await startRoute(root);
  const after = YAML.parse(await readFile(checkpointPath, 'utf8')).authority_snapshot;

  assert.equal(refreshed.route_instance_id, first.route_instance_id);
  assert.deepEqual(after, before);
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

  await resolveTruthForTest(root);
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
  await resolveTruthForTest(root);
  const next = await startRoute(root, {
    phase: 'DESIGN',
    capability: 'product-design',
    signals: ['behavior-choice-needed'],
  });
  assert.equal(next.phase, 'DESIGN');
});

test('an unresolved Truth reconciliation blocks the next consequential route', async () => {
  const root = await initializedProject('pending-truth');
  await startRoute(root);
  await main(['route', 'complete', '--project', root, '--evidence', 'Planning passed']);

  await assert.rejects(
    startRoute(root, {
      phase: 'EXECUTE_ONE',
      capability: 'tdd',
      signals: ['new-behavior'],
    }),
    /truth reconciliation.*pending|pending.*truth reconciliation/i,
  );

  const handshake = await readHandshake(root);
  assert.equal(handshake.phase, 'PLAN');
  assert.equal(handshake.status, 'satisfied');
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

test('doctor requires a current satisfied route at completion-like checkpoints', async () => {
  const root = await initializedProject('doctor-completion');
  await updateCheckpoint(root, { phase: 'REVIEW' });
  let report = await doctorReport(root);
  assert.ok(report.issues.some(({ code }) => code === 'missing-route-handshake'));

  await startRoute(root, {
    phase: 'REVIEW',
    capability: 'code-review',
    signals: ['implementation-complete'],
  });
  report = await doctorReport(root);
  assert.ok(report.issues.some(({ code }) => code === 'pending-route-exit'));

  await main([
    'route', 'complete', '--project', root,
    '--evidence', 'Review contract exited 0', '--json',
  ]);
  report = await doctorReport(root);
  assert.equal(report.issues.some(({ code }) => code.includes('route')), false);
});

test('doctor distinguishes an active phase transition from a stale satisfied route', async () => {
  const activeRoot = await initializedProject('doctor-active-stale');
  await startRoute(activeRoot);
  await updateCheckpoint(activeRoot, { phase: 'EXECUTE_ONE' });
  let report = await doctorReport(activeRoot);
  assert.ok(report.issues.some(({ code }) => code === 'pending-route-exit'));

  const satisfiedRoot = await initializedProject('doctor-satisfied-stale');
  await startRoute(satisfiedRoot);
  await main(['route', 'complete', '--project', satisfiedRoot, '--evidence', 'Planning passed']);
  await updateCheckpoint(satisfiedRoot, { phase: 'EXECUTE_ONE' });
  report = await doctorReport(satisfiedRoot);
  assert.ok(report.issues.some(({ code }) => code === 'stale-route-handshake'));
});

test('doctor reports removed local route sources and unavailable selected Skills', async () => {
  const missingSkillRoot = await initializedProject('doctor-skill-missing');
  await writeAlternativeRoutes(missingSkillRoot);
  await startRoute(missingSkillRoot, { signals: ['prd-approved'] });
  await rm(path.join(missingSkillRoot, '.agents', 'skills', 'to-issues'), { recursive: true, force: true });
  let report = await doctorReport(missingSkillRoot);
  assert.ok(report.issues.some(({ code }) => code === 'selected-skill-unavailable'));

  const missingRouteRoot = await initializedProject('doctor-route-missing');
  await writeAlternativeRoutes(missingRouteRoot);
  await startRoute(missingRouteRoot, { signals: ['prd-approved'] });
  await rm(path.join(missingRouteRoot, '.vibetether', 'routes.local.yaml'));
  report = await doctorReport(missingRouteRoot);
  assert.ok(report.issues.some(({ code }) => code === 'route-source-missing'));
});

test('doctor reports ambiguous local routes and unexplained selection mismatches', async () => {
  const ambiguousRoot = await initializedProject('doctor-ambiguous');
  await installSkill(ambiguousRoot, 'to-issues');
  await installSkill(ambiguousRoot, 'second-planner');
  await writeFile(path.join(ambiguousRoot, '.vibetether', 'routes.local.yaml'), YAML.stringify({
    schema_version: 1,
    routes: [
      {
        id: 'one', phases: ['PLAN'], capability: 'planning', when_any: ['prd-approved'],
        skill: 'to-issues', role: 'primary', use_when: ['First planner.'],
      },
      {
        id: 'two', phases: ['PLAN'], capability: 'planning', when_any: ['prd-approved'],
        skill: 'second-planner', role: 'primary', use_when: ['Second planner.'],
      },
    ],
  }), 'utf8');
  let report = await doctorReport(ambiguousRoot);
  assert.ok(report.issues.some(({ code }) => code === 'ambiguous-local-route'));

  const mismatchRoot = await initializedProject('doctor-mismatch');
  await startRoute(mismatchRoot);
  const target = path.join(mismatchRoot, ...ROUTE_HANDSHAKE_PATH.split('/'));
  const handshake = await readHandshake(mismatchRoot);
  handshake.selected_skill = 'invented-planner';
  handshake.alternative_reason = null;
  await writeFile(target, YAML.stringify(handshake), 'utf8');
  report = await doctorReport(mismatchRoot);
  assert.ok(report.issues.some(({ code }) => code === 'route-selection-mismatch'));
});
