import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { main } from '../src/cli.mjs';
import { createTruthMap } from '../src/truth-map.mjs';

async function initializedProject(name) {
  const root = await mkdtemp(path.join(os.tmpdir(), `vibetether-doctor-boundary-${name}-`));
  await main([
    'init', '--project', root, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Verify boundary-aware project health.',
    '--success-evidence', 'Completion boundaries reject unresolved control state.',
  ]);
  return root;
}

async function setPhase(root, phase) {
  const target = path.join(root, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(target, 'utf8'));
  checkpoint.phase = phase;
  await writeFile(target, YAML.stringify(checkpoint), 'utf8');
}

async function completePlanning(root) {
  await setPhase(root, 'PLAN');
  await main([
    'route', '--project', root, '--phase', 'PLAN', '--capability', 'planning',
    '--signal', 'direction-approved', '--agent', 'codex',
  ]);
  await main(['route', 'complete', '--project', root, '--evidence', 'Plan approved']);
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

test('doctor warns during ordinary work but blocks a completion boundary on pending Truth reconciliation', async () => {
  const root = await initializedProject('pending-truth');
  await completePlanning(root);

  const ordinary = await doctorReport(root, 'ordinary');
  assert.equal(ordinary.ok, true);
  assert.equal(
    ordinary.warnings.some(({ code }) => code === 'pending-truth-reconciliation'),
    true,
  );

  const completion = await doctorReport(root, 'completion');
  assert.equal(completion.ok, false);
  assert.equal(
    completion.issues.some(({ code }) => code === 'pending-truth-reconciliation'),
    true,
  );
});

test('doctor distinguishes Truth Map metadata changes from confirmed authority changes', async () => {
  const root = await initializedProject('truth-projection');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'product.md'), '# Product\n', 'utf8');
  await writeFile(path.join(root, 'docs', 'candidate.md'), '# Candidate\n', 'utf8');
  const truthPath = path.join(root, '.vibetether', 'TRUTH.md');
  await writeFile(
    truthPath,
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [{ path: 'docs/product.md', role: 'product-direction', scope: '.' }],
      candidates: [{ path: 'docs/candidate.md', role: 'design-candidate', scope: '.' }],
    }),
    'utf8',
  );
  await setPhase(root, 'PLAN');
  await main([
    'route', '--project', root, '--phase', 'PLAN', '--capability', 'planning',
    '--signal', 'direction-approved', '--agent', 'codex',
  ]);
  await main([
    'route', 'complete', '--project', root,
    '--evidence', 'Plan approved',
    '--truth-decision', 'no-material-change',
    '--truth-reason', 'The route changed no confirmed authority.',
  ]);

  await writeFile(
    truthPath,
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [{ path: 'docs/product.md', role: 'product-direction', scope: '.' }],
      declined: [{
        path: 'docs/candidate.md',
        role: 'design-candidate',
        scope: '.',
        reason: 'The user declined it.',
      }],
    }),
    'utf8',
  );
  const metadataOnly = await doctorReport(root);
  assert.equal(metadataOnly.ok, true);
  assert.equal(
    metadataOnly.warnings.some(({ code }) => code === 'changed-truth-metadata'),
    true,
  );
  assert.equal(
    metadataOnly.issues.some(({ code }) => code === 'changed-confirmed-truth-map'),
    false,
  );

  await writeFile(
    truthPath,
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [
        { path: 'docs/product.md', role: 'product-direction', scope: '.' },
        { path: 'docs/candidate.md', role: 'design-direction', scope: '.' },
      ],
    }),
    'utf8',
  );
  const confirmedChanged = await doctorReport(root);
  assert.equal(confirmedChanged.ok, false);
  assert.equal(
    confirmedChanged.issues.some(({ code }) => code === 'changed-confirmed-truth-map'),
    true,
  );
});

test('doctor surfaces a legacy route without a route-instance identity', async () => {
  const root = await initializedProject('missing-route-instance');
  await setPhase(root, 'PLAN');
  await main([
    'route', '--project', root, '--phase', 'PLAN', '--capability', 'planning',
    '--signal', 'direction-approved', '--agent', 'codex',
  ]);
  await main([
    'route', 'complete', '--project', root,
    '--evidence', 'Plan approved',
    '--truth-decision', 'no-material-change',
    '--truth-reason', 'The route changed no confirmed authority.',
  ]);
  const handshakePath = path.join(root, '.vibetether', 'state', 'route-handshake.yaml');
  const handshake = YAML.parse(await readFile(handshakePath, 'utf8'));
  delete handshake.route_instance_id;
  await writeFile(handshakePath, YAML.stringify(handshake), 'utf8');

  const ordinary = await doctorReport(root, 'ordinary');
  assert.equal(ordinary.ok, true);
  assert.equal(
    ordinary.warnings.some(({ code }) => code === 'route-instance-not-established'),
    true,
  );

  const completion = await doctorReport(root, 'completion');
  assert.equal(completion.ok, false);
  assert.equal(
    completion.issues.some(({ code }) => code === 'route-instance-not-established'),
    true,
  );
});
