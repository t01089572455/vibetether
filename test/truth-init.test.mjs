import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { parseTruthMap, TRUTH_INDEX_PATH } from '../src/truth-map.mjs';

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
