import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { createAuthoritySnapshot } from '../src/authority-snapshot.mjs';
import { createTruthMap, parseTruthMap, TRUTH_INDEX_PATH } from '../src/truth-map.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repository, 'bin', 'vibetether.mjs');

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: repository, encoding: 'utf8' });
}

async function project(name) {
  return mkdtemp(path.join(os.tmpdir(), `vibetether-truth-init-${name}-`));
}

test('new init creates a blank truth map without activating discovered documents', async () => {
  const target = await project('blank');
  await mkdir(path.join(target, 'docs', 'specs'), { recursive: true });
  await writeFile(path.join(target, 'PRD.md'), '# Product direction\n', 'utf8');
  await writeFile(path.join(target, 'docs', 'specs', 'feature.md'), '# Feature\n', 'utf8');

  const result = run(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /truth.*(?:empty|candidate)|TRUTH\.md.*candidate/is);
  const manifest = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(manifest.truth_index, TRUTH_INDEX_PATH);
  assert.equal(JSON.stringify(manifest.sources).includes('PRD.md'), false);
  assert.equal(JSON.stringify(manifest.sources).includes('docs/specs'), false);
  const truth = parseTruthMap(await readFile(path.join(target, TRUTH_INDEX_PATH), 'utf8'));
  assert.deepEqual(truth.confirmed, []);
  assert.deepEqual(truth.hosts.map((entry) => entry.path), ['AGENTS.md', 'CLAUDE.md']);
});

test('upgrade migrates legacy active sources once and preserves rollback fields', async () => {
  const target = await project('legacy');
  assert.equal(run(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.truth_index;
  manifest.sources.custom = ['docs/custom-truth.md'];
  await mkdir(path.join(target, 'docs'), { recursive: true });
  await writeFile(path.join(target, 'docs', 'custom-truth.md'), '# Custom truth\n', 'utf8');
  await writeFile(manifestPath, YAML.stringify(manifest, { lineWidth: 0 }), 'utf8');
  await rm(path.join(target, TRUTH_INDEX_PATH), { force: true });

  const result = run(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const upgraded = YAML.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(upgraded.sources.custom, ['docs/custom-truth.md']);
  assert.equal(upgraded.truth_index, TRUTH_INDEX_PATH);
  const truth = parseTruthMap(await readFile(path.join(target, TRUTH_INDEX_PATH), 'utf8'));
  assert.equal(truth.confirmed.some((entry) => entry.path === 'docs/custom-truth.md'), true);
  assert.equal(truth.confirmed.find((entry) => entry.path === 'docs/custom-truth.md').source, 'legacy-manifest-migration');
});

test('upgrade preserves a prose legacy TRUTH document and routes a canonical sidecar index', async () => {
  const target = await project('legacy-prose-truth');
  assert.equal(run(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const truthPath = path.join(target, TRUTH_INDEX_PATH);
  const legacyTruth = [
    '# Project Truth Register',
    '',
    'This is a user-owned prose authority document, not a VibeTether checklist.',
    'It must remain byte-for-byte unchanged during an upgrade.',
    '',
  ].join('\n');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.truth_index;
  delete manifest.truth_index_ownership;
  manifest.sources.always = [
    TRUTH_INDEX_PATH,
    ...manifest.sources.always.filter((entry) => entry !== TRUTH_INDEX_PATH),
  ];
  await writeFile(manifestPath, YAML.stringify(manifest, { lineWidth: 0 }), 'utf8');
  await writeFile(truthPath, legacyTruth, 'utf8');

  const result = run(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Preserved legacy project truth.*TRUTH-MAP\.md/s);
  assert.equal(await readFile(truthPath, 'utf8'), legacyTruth);
  const upgraded = YAML.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(upgraded.truth_index, '.vibetether/TRUTH-MAP.md');
  const sidecarPath = path.join(target, upgraded.truth_index);
  const sidecar = await readFile(sidecarPath, 'utf8');
  const parsed = parseTruthMap(sidecar);
  assert.deepEqual(parsed.hosts.map((entry) => entry.path), ['AGENTS.md', 'CLAUDE.md']);
  assert.equal(parsed.confirmed.some((entry) => entry.path === TRUTH_INDEX_PATH), true);
  const snapshot = await createAuthoritySnapshot(target, upgraded, '2026-07-16T12:00:00.000Z');
  assert.equal(snapshot.truth_index.path, '.vibetether/TRUTH-MAP.md');
  assert.equal(snapshot.confirmed_sources.some((entry) => entry.path === TRUTH_INDEX_PATH), true);

  const repeated = run(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);
  assert.equal(repeated.status, 0, repeated.stderr || repeated.stdout);
  assert.equal(await readFile(truthPath, 'utf8'), legacyTruth);
  assert.equal(await readFile(sidecarPath, 'utf8'), sidecar);

  const doctor = run(['doctor', '--project', target, '--boundary', 'ordinary', '--json']);
  assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
  assert.notEqual(JSON.parse(doctor.stdout).control_plane.truth, 'error');

  const uninstall = run(['uninstall', '--project', target, '--yes']);
  assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
  assert.equal(await readFile(truthPath, 'utf8'), legacyTruth);
  assert.equal(await readFile(sidecarPath, 'utf8'), sidecar);
  assert.equal(
    YAML.parse(await readFile(manifestPath, 'utf8')).truth_index,
    '.vibetether/TRUTH-MAP.md',
  );
});

test('legacy prose migration refuses a malformed occupied sidecar without changing project data', async () => {
  const target = await project('legacy-prose-sidecar-conflict');
  assert.equal(run(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const truthPath = path.join(target, TRUTH_INDEX_PATH);
  const sidecarPath = path.join(target, '.vibetether', 'TRUTH-MAP.md');
  const legacyTruth = '# Existing project truth\n\nKeep this exact prose.\n';
  const occupiedSidecar = '# Different user document\n';
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.truth_index;
  delete manifest.truth_index_ownership;
  manifest.sources.always = [
    TRUTH_INDEX_PATH,
    ...manifest.sources.always.filter((entry) => entry !== TRUTH_INDEX_PATH),
  ];
  await writeFile(manifestPath, YAML.stringify(manifest, { lineWidth: 0 }), 'utf8');
  await writeFile(truthPath, legacyTruth, 'utf8');
  await writeFile(sidecarPath, occupiedSidecar, 'utf8');
  const manifestBefore = await readFile(manifestPath, 'utf8');
  const agentsBefore = await readFile(path.join(target, 'AGENTS.md'), 'utf8');

  const result = run(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);

  assert.equal(result.status, 3);
  assert.match(result.stderr, /Truth map conflict in \.vibetether\/TRUTH-MAP\.md/);
  assert.equal(await readFile(manifestPath, 'utf8'), manifestBefore);
  assert.equal(await readFile(truthPath, 'utf8'), legacyTruth);
  assert.equal(await readFile(sidecarPath, 'utf8'), occupiedSidecar);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), agentsBefore);
});

test('legacy prose migration refuses an occupied valid sidecar that does not confirm the legacy truth', async () => {
  const target = await project('legacy-prose-valid-sidecar-conflict');
  assert.equal(run(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const truthPath = path.join(target, TRUTH_INDEX_PATH);
  const sidecarPath = path.join(target, '.vibetether', 'TRUTH-MAP.md');
  const legacyTruth = '# Existing project truth\n\nKeep this exact prose.\n';
  const unrelatedCanonicalSidecar = createTruthMap({ harnesses: ['codex'] });
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.truth_index;
  delete manifest.truth_index_ownership;
  manifest.sources.always = [
    TRUTH_INDEX_PATH,
    ...manifest.sources.always.filter((entry) => entry !== TRUTH_INDEX_PATH),
  ];
  await writeFile(manifestPath, YAML.stringify(manifest, { lineWidth: 0 }), 'utf8');
  await writeFile(truthPath, legacyTruth, 'utf8');
  await writeFile(sidecarPath, unrelatedCanonicalSidecar, 'utf8');
  const manifestBefore = await readFile(manifestPath, 'utf8');

  const result = run(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);

  assert.equal(result.status, 3);
  assert.match(result.stderr, /migration sidecar.*already exists|already exists.*TRUTH-MAP/i);
  assert.equal(await readFile(manifestPath, 'utf8'), manifestBefore);
  assert.equal(await readFile(truthPath, 'utf8'), legacyTruth);
  assert.equal(await readFile(sidecarPath, 'utf8'), unrelatedCanonicalSidecar);
});

test('legacy migration refuses a damaged canonical Truth Map instead of reclassifying it as prose', async () => {
  const target = await project('damaged-canonical-truth');
  assert.equal(run(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const truthPath = path.join(target, TRUTH_INDEX_PATH);
  const damagedCanonical = [
    '# VibeTether Project Truth Map',
    '',
    '<!-- vibetether:truth-map-v1 -->',
    '',
    '## Candidates awaiting confirmation',
    '',
    '- [ ] `docs/proposed-direction.md`',
    '  - role: `product-direction`',
    '  - scope: `.`',
    '',
  ].join('\n');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.truth_index;
  delete manifest.truth_index_ownership;
  manifest.sources.always = [
    TRUTH_INDEX_PATH,
    ...manifest.sources.always.filter((entry) => entry !== TRUTH_INDEX_PATH),
  ];
  await writeFile(manifestPath, YAML.stringify(manifest, { lineWidth: 0 }), 'utf8');
  await writeFile(truthPath, damagedCanonical, 'utf8');
  const manifestBefore = await readFile(manifestPath, 'utf8');

  const result = run(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);

  assert.equal(result.status, 3);
  assert.match(result.stderr, /Truth map conflict in \.vibetether\/TRUTH\.md/);
  assert.equal(await readFile(manifestPath, 'utf8'), manifestBefore);
  assert.equal(await readFile(truthPath, 'utf8'), damagedCanonical);
  await assert.rejects(readFile(path.join(target, '.vibetether', 'TRUTH-MAP.md'), 'utf8'), { code: 'ENOENT' });
});

test('fresh init does not reinterpret an undeclared prose TRUTH document as active authority', async () => {
  const target = await project('fresh-prose-truth');
  const control = path.join(target, '.vibetether');
  const truthPath = path.join(target, TRUTH_INDEX_PATH);
  const prose = '# Unrelated notes\n\nThis file was not declared by a legacy manifest.\n';
  await mkdir(control, { recursive: true });
  await writeFile(truthPath, prose, 'utf8');

  const result = run(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);

  assert.equal(result.status, 3);
  assert.match(result.stderr, /Truth map conflict in \.vibetether\/TRUTH\.md/);
  assert.equal(await readFile(truthPath, 'utf8'), prose);
  await assert.rejects(readFile(path.join(control, 'project.yaml'), 'utf8'), { code: 'ENOENT' });
});

test('repeated init preserves a project-owned truth map byte for byte', async () => {
  const target = await project('preserve');
  assert.equal(run(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const truthPath = path.join(target, TRUTH_INDEX_PATH);
  const customized = `${await readFile(truthPath, 'utf8')}\nProject note: review candidates on Fridays.\n`;
  await writeFile(truthPath, customized, 'utf8');

  const result = run(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(await readFile(truthPath, 'utf8'), customized);
});

test('adding a harness updates only an untouched VibeTether-owned truth scaffold', async () => {
  const target = await project('add-harness');
  assert.equal(run(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const truthPath = path.join(target, TRUTH_INDEX_PATH);
  assert.deepEqual(parseTruthMap(await readFile(truthPath, 'utf8')).hosts.map((entry) => entry.path), ['AGENTS.md']);

  const addClaude = run(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);

  assert.equal(addClaude.status, 0, addClaude.stderr || addClaude.stdout);
  assert.deepEqual(
    parseTruthMap(await readFile(truthPath, 'utf8')).hosts.map((entry) => entry.path),
    ['AGENTS.md', 'CLAUDE.md'],
  );

  const customized = `${await readFile(truthPath, 'utf8')}\nUser-owned note.\n`;
  await writeFile(truthPath, customized, 'utf8');
  assert.equal(run(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']).status, 0);
  assert.equal(await readFile(truthPath, 'utf8'), customized);
});

test('doctor validates confirmed truth paths but does not activate missing candidates', async () => {
  const target = await project('doctor');
  assert.equal(run(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const truthPath = path.join(target, TRUTH_INDEX_PATH);
  await writeFile(truthPath, createTruthFixture({ candidate: 'docs/not-created.md' }), 'utf8');

  const candidateOnly = run(['doctor', '--project', target, '--json']);
  assert.equal(candidateOnly.status, 0, candidateOnly.stderr || candidateOnly.stdout);
  const healthy = JSON.parse(candidateOnly.stdout);
  assert.deepEqual(Object.keys(healthy.control_plane), [
    'bootstrap', 'cli', 'intent', 'truth', 'state', 'execution', 'routing', 'experience', 'providers',
  ]);

  await writeFile(truthPath, createTruthFixture({ confirmed: 'docs/not-created.md' }), 'utf8');
  const confirmed = run(['doctor', '--project', target, '--json']);
  assert.equal(confirmed.status, 4, confirmed.stderr || confirmed.stdout);
  const report = JSON.parse(confirmed.stdout);
  assert.equal(report.issues.some((entry) => entry.code === 'missing-confirmed-truth'), true);
  assert.equal(report.control_plane.truth, 'error');
});

function createTruthFixture({ confirmed = null, candidate = null } = {}) {
  const base = [
    '# VibeTether Project Truth Map',
    '',
    '<!-- vibetether:truth-map-v1 -->',
    '',
    'This project owns this file. VibeTether never silently activates project documents.',
    'Unconfirmed candidates do not guide implementation.',
    '',
    '## Host bootstrap',
    '',
    '- [x] `AGENTS.md`',
    '  - role: `host-governance`',
    '  - scope: `.`',
    '',
    '## Control-plane pointers',
    '',
    '- [x] `.vibetether/intent.md`',
    '  - role: `intent-contract`',
    '  - scope: `.`',
    '',
    '## Confirmed project truth',
    '',
    confirmed
      ? `- [x] \`${confirmed}\`\n  - role: \`requirements\`\n  - scope: \`.\``
      : '_None._',
    '',
    '## Candidates awaiting confirmation',
    '',
    candidate
      ? `- [ ] \`${candidate}\`\n  - role: \`requirements\`\n  - scope: \`.\``
      : '_None._',
    '',
    '## Declined candidates',
    '',
    '_None._',
    '',
  ];
  return base.join('\n');
}
