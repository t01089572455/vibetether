import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { main } from '../src/cli.mjs';
import { createTruthMap } from '../src/truth-map.mjs';

async function initializedProject(name) {
  const root = await mkdtemp(path.join(os.tmpdir(), `vibetether-truth-reconcile-${name}-`));
  await main([
    'init', '--project', root, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Keep project truth aligned.',
    '--success-evidence', 'Truth reconciliation is explicit.',
  ]);
  return root;
}

async function setPhase(root, phase) {
  const target = path.join(root, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(target, 'utf8'));
  checkpoint.phase = phase;
  await writeFile(target, YAML.stringify(checkpoint), 'utf8');
}

async function startPlanning(root) {
  await setPhase(root, 'PLAN');
  return JSON.parse(await main([
    'route', '--project', root, '--phase', 'PLAN', '--capability', 'planning',
    '--signal', 'direction-approved', '--agent', 'codex', '--json',
  ]));
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function doctorReport(root, boundary = 'ordinary') {
  try {
    return JSON.parse(await main([
      'doctor', '--project', root, '--boundary', boundary, '--json',
    ]));
  } catch (error) {
    if (typeof error.output === 'string') return JSON.parse(error.output);
    throw error;
  }
}

test('no-material-change reconciles the exited route without editing the Truth Map', async () => {
  const root = await initializedProject('no-material-change');
  const started = await startPlanning(root);
  await main(['route', 'complete', '--project', root, '--evidence', 'Plan approved']);
  const truthPath = path.join(root, '.vibetether', 'TRUTH.md');
  const truthBefore = await readFile(truthPath, 'utf8');

  const reconciled = JSON.parse(await main([
    'truth', 'reconcile', '--project', root,
    '--decision', 'no-material-change',
    '--reason', 'Only planning evidence changed; confirmed project direction did not.',
    '--json',
  ]));

  assert.equal(reconciled.status, 'no_material_change');
  assert.equal(reconciled.route_instance_id, started.route_instance_id);
  assert.equal(reconciled.candidate_path, null);
  assert.equal(await readFile(truthPath, 'utf8'), truthBefore);
  const checkpoint = YAML.parse(await readFile(
    path.join(root, '.vibetether', 'state', 'current.yaml'),
    'utf8',
  ));
  assert.deepEqual(checkpoint.truth_reconciliation, reconciled);

  const next = await startPlanning(root);
  assert.notEqual(next.route_instance_id, started.route_instance_id);
});

test('no-material-change refuses confirmed authority drift and leaves reconciliation pending', async () => {
  const root = await initializedProject('changed-authority');
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
  await startPlanning(root);
  await main(['route', 'complete', '--project', root, '--evidence', 'Plan approved']);
  await writeFile(path.join(root, 'docs', 'product.md'), '# Approved B\n', 'utf8');

  await assert.rejects(
    main([
      'truth', 'reconcile', '--project', root,
      '--decision', 'no-material-change',
      '--reason', 'Nothing material changed.',
    ]),
    /authority changed|cannot hide.*drift/i,
  );

  const checkpoint = YAML.parse(await readFile(
    path.join(root, '.vibetether', 'state', 'current.yaml'),
    'utf8',
  ));
  assert.equal(checkpoint.truth_reconciliation.status, 'pending');
});

test('candidate reconciliation follows the user-visible Truth Map lifecycle', async () => {
  const root = await initializedProject('candidate-lifecycle');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'design.md'), '# Candidate design\n', 'utf8');
  const truthPath = path.join(root, '.vibetether', 'TRUTH.md');
  await writeFile(
    truthPath,
    createTruthMap({
      harnesses: ['codex'],
      candidates: [{ path: 'docs/design.md', role: 'design-direction', scope: '.' }],
    }),
    'utf8',
  );
  const started = await startPlanning(root);
  await main(['route', 'complete', '--project', root, '--evidence', 'Candidate documented']);

  const pending = JSON.parse(await main([
    'truth', 'reconcile', '--project', root,
    '--decision', 'candidate-pending',
    '--candidate', 'docs/design.md',
    '--reason', 'The user wants to review this design before activation.',
    '--json',
  ]));
  assert.equal(pending.status, 'candidate_pending');
  assert.equal(pending.route_instance_id, started.route_instance_id);
  assert.equal(pending.candidate_path, 'docs/design.md');

  await writeFile(
    truthPath,
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [{ path: 'docs/design.md', role: 'design-direction', scope: '.' }],
    }),
    'utf8',
  );
  const applied = JSON.parse(await main([
    'truth', 'reconcile', '--project', root,
    '--decision', 'applied',
    '--candidate', 'docs/design.md',
    '--reason', 'The user confirmed this governing design for the project.',
    '--json',
  ]));
  assert.equal(applied.status, 'applied');
  assert.equal(applied.candidate_path, 'docs/design.md');
  const checkpoint = YAML.parse(await readFile(
    path.join(root, '.vibetether', 'state', 'current.yaml'),
    'utf8',
  ));
  assert.equal(checkpoint.authority_snapshot.confirmed_sources[0].path, 'docs/design.md');
});

test('candidate decisions require a safe existing path in the matching Truth Map section', async () => {
  const root = await initializedProject('candidate-membership');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'design.md'), '# Candidate design\n', 'utf8');
  await startPlanning(root);
  await main(['route', 'complete', '--project', root, '--evidence', 'Planning complete']);

  await assert.rejects(
    main([
      'truth', 'reconcile', '--project', root,
      '--decision', 'candidate-pending',
      '--candidate', 'docs/design.md',
      '--reason', 'Propose the design.',
    ]),
    /not present.*candidates section/i,
  );
  await assert.rejects(
    main([
      'truth', 'reconcile', '--project', root,
      '--decision', 'applied',
      '--candidate', '../outside.md',
      '--reason', 'Apply an unsafe path.',
    ]),
    /safe path inside the project|unsafe/i,
  );
});

test('candidate reconciliation accepts a safe project directory truth source', async () => {
  const root = await initializedProject('candidate-directory');
  git(root, ['init', '--quiet']);
  await mkdir(path.join(root, 'docs', 'specs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'specs', 'product.md'), '# Product specs\n', 'utf8');
  const truthPath = path.join(root, '.vibetether', 'TRUTH.md');
  await writeFile(
    truthPath,
    createTruthMap({
      harnesses: ['codex'],
      candidates: [{ path: 'docs/specs/', role: 'product-specifications', scope: '.' }],
    }),
    'utf8',
  );
  await startPlanning(root);
  await main(['route', 'complete', '--project', root, '--evidence', 'Specification directory proposed']);

  const pending = JSON.parse(await main([
    'truth', 'reconcile', '--project', root,
    '--decision', 'candidate-pending',
    '--candidate', 'docs/specs/',
    '--reason', 'The specification directory is waiting for user confirmation.',
    '--json',
  ]));

  assert.equal(pending.status, 'candidate_pending');
  assert.equal(pending.candidate_path, 'docs/specs/');

  await writeFile(
    truthPath,
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [{ path: 'docs/specs/', role: 'product-specifications', scope: '.' }],
    }),
    'utf8',
  );
  const applied = JSON.parse(await main([
    'truth', 'reconcile', '--project', root,
    '--decision', 'applied',
    '--candidate', 'docs/specs/',
    '--reason', 'The user approved this directory path, role, and scope.',
    '--json',
  ]));
  assert.equal(applied.status, 'applied');

  const handshake = YAML.parse(await readFile(
    path.join(root, '.vibetether', 'state', 'route-handshake.yaml'),
    'utf8',
  ));
  assert.equal(handshake.truth_reconciliation.status, 'applied');
  const report = await doctorReport(root);
  assert.equal(
    report.issues.some(({ code }) => code === 'changed-confirmed-truth'),
    false,
  );
  assert.equal(
    report.warnings.some(({ code }) => code === 'stale-execution-snapshot'),
    false,
  );
});

test('candidate reconciliation cannot absorb unrelated confirmed-source drift', async () => {
  const root = await initializedProject('candidate-unrelated-confirmed-drift');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'product.md'), '# Approved product\n', 'utf8');
  await writeFile(path.join(root, 'docs', 'design.md'), '# Candidate design\n', 'utf8');
  await writeFile(
    path.join(root, '.vibetether', 'TRUTH.md'),
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [{ path: 'docs/product.md', role: 'product-direction', scope: '.' }],
      candidates: [{ path: 'docs/design.md', role: 'design-direction', scope: '.' }],
    }),
    'utf8',
  );
  await startPlanning(root);
  await main(['route', 'complete', '--project', root, '--evidence', 'Candidate documented']);
  await writeFile(path.join(root, 'docs', 'product.md'), '# Unapproved product change\n', 'utf8');

  await assert.rejects(
    main([
      'truth', 'reconcile', '--project', root,
      '--decision', 'candidate-pending',
      '--candidate', 'docs/design.md',
      '--reason', 'The design candidate is still waiting for a decision.',
    ]),
    /confirmed project authority changed|cannot absorb.*drift/i,
  );

  const checkpoint = YAML.parse(await readFile(
    path.join(root, '.vibetether', 'state', 'current.yaml'),
    'utf8',
  ));
  assert.equal(checkpoint.truth_reconciliation.status, 'pending');
});

test('applied reconciliation permits only the declared confirmed path to change', async () => {
  const root = await initializedProject('applied-bounded-change');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'product.md'), '# Approved product\n', 'utf8');
  await writeFile(path.join(root, 'docs', 'design.md'), '# Candidate design\n', 'utf8');
  const truthPath = path.join(root, '.vibetether', 'TRUTH.md');
  await writeFile(
    truthPath,
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [{ path: 'docs/product.md', role: 'product-direction', scope: '.' }],
      candidates: [{ path: 'docs/design.md', role: 'design-direction', scope: '.' }],
    }),
    'utf8',
  );
  await startPlanning(root);
  await main(['route', 'complete', '--project', root, '--evidence', 'Design reviewed']);
  await writeFile(
    truthPath,
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [
        { path: 'docs/product.md', role: 'product-direction', scope: '.' },
        { path: 'docs/design.md', role: 'design-direction', scope: '.' },
      ],
    }),
    'utf8',
  );
  await writeFile(path.join(root, 'docs', 'product.md'), '# Unapproved product change\n', 'utf8');

  await assert.rejects(
    main([
      'truth', 'reconcile', '--project', root,
      '--decision', 'applied',
      '--candidate', 'docs/design.md',
      '--reason', 'The user approved only the design source.',
    ]),
    /outside the declared path|confirmed project authority changed/i,
  );

  const checkpoint = YAML.parse(await readFile(
    path.join(root, '.vibetether', 'state', 'current.yaml'),
    'utf8',
  ));
  assert.equal(checkpoint.truth_reconciliation.status, 'pending');

  await writeFile(path.join(root, 'docs', 'product.md'), '# Approved product\n', 'utf8');
  const applied = JSON.parse(await main([
    'truth', 'reconcile', '--project', root,
    '--decision', 'applied',
    '--candidate', 'docs/design.md',
    '--reason', 'The user approved the design source and no other authority changed.',
    '--json',
  ]));
  assert.equal(applied.status, 'applied');
});

test('route completion can inline a verified no-material-change disposition', async () => {
  const root = await initializedProject('inline-no-material-change');
  const started = await startPlanning(root);

  await main([
    'route', 'complete', '--project', root,
    '--evidence', 'Plan approved',
    '--truth-decision', 'no-material-change',
    '--truth-reason', 'The route produced planning evidence without changing confirmed authority.',
  ]);

  const checkpoint = YAML.parse(await readFile(
    path.join(root, '.vibetether', 'state', 'current.yaml'),
    'utf8',
  ));
  assert.equal(checkpoint.truth_reconciliation.status, 'no_material_change');
  assert.equal(checkpoint.truth_reconciliation.route_instance_id, started.route_instance_id);
  const next = await startPlanning(root);
  assert.notEqual(next.route_instance_id, started.route_instance_id);
});
