import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createTruthMap,
  legacyManifestEntries,
  parseTruthMap,
  validateConfirmedTruth,
} from '../src/truth-map.mjs';

test('new truth map exposes selected hosts but confirms no project documents', () => {
  const source = createTruthMap({ harnesses: ['codex', 'claude'] });
  const parsed = parseTruthMap(source);

  assert.deepEqual(parsed.hosts.map((entry) => entry.path), ['AGENTS.md', 'CLAUDE.md']);
  assert.deepEqual(parsed.confirmed, []);
  assert.deepEqual(parsed.candidates, []);
  assert.deepEqual(parsed.declined, []);
  assert.equal(parsed.source, source);
});

test('truth map keeps candidates non-authoritative and preserves project-owned prose', () => {
  const source = createTruthMap({
    harnesses: ['codex'],
    candidates: [{ path: 'docs/PRD.md', role: 'product-direction', scope: '.' }],
  }).replace(
    'Unconfirmed candidates do not guide implementation.',
    'Unconfirmed candidates do not guide implementation.\n\nUser note: keep this wording.',
  );

  const parsed = parseTruthMap(source);

  assert.deepEqual(parsed.confirmed, []);
  assert.equal(parsed.candidates[0].path, 'docs/PRD.md');
  assert.equal(parsed.source, source);
});

test('truth map rejects duplicate active paths and paths outside the project', () => {
  assert.throws(
    () => createTruthMap({
      confirmed: [
        { path: 'docs/spec.md', role: 'requirements', scope: '.' },
        { path: 'docs/spec.md', role: 'requirements', scope: '.' },
      ],
    }),
    /duplicate/i,
  );
  assert.throws(
    () => createTruthMap({ confirmed: [{ path: '../outside.md', role: 'requirements', scope: '.' }] }),
    /project-relative|outside|unsafe/i,
  );
  assert.throws(
    () => createTruthMap({ confirmed: [{ path: 'C:\\secret.md', role: 'requirements', scope: '.' }] }),
    /project-relative|absolute|unsafe/i,
  );
  assert.throws(
    () => createTruthMap({ confirmed: [{ path: '.env', role: 'operations', scope: '.' }] }),
    /sensitive|unsafe/i,
  );
});

test('truth map rejects malformed entries and missing role or scope metadata', () => {
  const valid = createTruthMap({
    confirmed: [{ path: 'docs/spec.md', role: 'requirements', scope: '.' }],
  });
  assert.throws(
    () => parseTruthMap(valid.replace('- [x] `docs/spec.md`', '- [x] docs/spec.md')),
    /malformed|entry/i,
  );
  assert.throws(
    () => parseTruthMap(valid.replace('  - role: `requirements`\n', '')),
    /role/i,
  );
  assert.throws(
    () => parseTruthMap(valid.replace('  - scope: `.`\n', '')),
    /scope/i,
  );
});

test('legacy manifest entries preserve all active custom sources without duplicates', () => {
  const entries = legacyManifestEntries({
    goal_source: '.vibetether/intent.md',
    intent_contract: '.vibetether/intent.md',
    sources: {
      always: ['AGENTS.md', 'CONTEXT.md', '.vibetether/intent.md'],
      conditional: {
        requirements: ['docs/specs/'],
        operations: ['docs/operations/'],
      },
      custom: ['docs/custom-truth.md'],
    },
  });

  assert.deepEqual(entries.map((entry) => entry.path), [
    'CONTEXT.md',
    'docs/specs/',
    'docs/operations/',
    'docs/custom-truth.md',
  ]);
  assert.equal(entries.every((entry) => entry.source === 'legacy-manifest-migration'), true);
});

test('confirmed truth validation checks paths while candidates may be absent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-truth-map-'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'spec.md'), '# Spec\n', 'utf8');
  const parsed = parseTruthMap(createTruthMap({
    confirmed: [{ path: 'docs/spec.md', role: 'requirements', scope: '.' }],
    candidates: [{ path: 'docs/maybe.md', role: 'requirements', scope: '.' }],
  }));

  assert.deepEqual(await validateConfirmedTruth(root, parsed), []);

  const missing = parseTruthMap(createTruthMap({
    confirmed: [{ path: 'docs/missing.md', role: 'requirements', scope: '.' }],
  }));
  const issues = await validateConfirmedTruth(root, missing);
  assert.deepEqual(issues.map((entry) => entry.code), ['missing-confirmed-truth']);
});
