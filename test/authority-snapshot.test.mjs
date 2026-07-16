import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAuthoritySnapshot } from '../src/authority-snapshot.mjs';
import { createTruthMap } from '../src/truth-map.mjs';

test('authority snapshots separate confirmed authority from candidate-only Truth Map changes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-authority-projection-'));
  await mkdir(path.join(root, '.vibetether'), { recursive: true });
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, '.vibetether', 'intent.md'), '# Intent\n', 'utf8');
  await writeFile(path.join(root, 'docs', 'product.md'), '# Product\n', 'utf8');
  await writeFile(path.join(root, 'docs', 'candidate.md'), '# Candidate\n', 'utf8');
  const manifest = {
    truth_index: '.vibetether/TRUTH.md',
    intent_contract: '.vibetether/intent.md',
  };

  await writeFile(
    path.join(root, '.vibetether', 'TRUTH.md'),
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [{ path: 'docs/product.md', role: 'product-direction', scope: '.' }],
      candidates: [{ path: 'docs/candidate.md', role: 'design-candidate', scope: '.' }],
    }),
    'utf8',
  );
  const before = await createAuthoritySnapshot(root, manifest);

  await writeFile(
    path.join(root, '.vibetether', 'TRUTH.md'),
    createTruthMap({
      harnesses: ['codex'],
      confirmed: [{ path: 'docs/product.md', role: 'product-direction', scope: '.' }],
      declined: [{
        path: 'docs/candidate.md',
        role: 'design-candidate',
        scope: '.',
        reason: 'The user declined this direction.',
      }],
    }),
    'utf8',
  );
  const after = await createAuthoritySnapshot(root, manifest);

  assert.notEqual(after.truth_index.sha256, before.truth_index.sha256);
  assert.match(before.confirmed_projection_sha256, /^[a-f0-9]{64}$/);
  assert.equal(after.confirmed_projection_sha256, before.confirmed_projection_sha256);
  assert.deepEqual(after.confirmed_sources, before.confirmed_sources);
});
