import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanProject } from '../src/project-scan.mjs';

async function project(name) {
  return mkdtemp(path.join(os.tmpdir(), `vibetether-scan-${name}-`));
}

test('project scan emits high-confidence Web bundle signals from package evidence', async () => {
  const root = await project('web');
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { next: '^15.0.0', react: '^19.0.0' } }),
    'utf8',
  );
  await writeFile(path.join(root, 'vercel.json'), '{}\n', 'utf8');

  const manifest = await scanProject(root, ['codex'], 'standard');

  assert.deepEqual(
    manifest.bundle_signals.map(({ bundle, signal, path: signalPath, confidence }) => ({
      bundle,
      signal,
      path: signalPath,
      confidence,
    })),
    [
      { bundle: 'web', signal: 'nextjs', path: 'package.json', confidence: 'high' },
      { bundle: 'web', signal: 'react', path: 'package.json', confidence: 'high' },
      { bundle: 'web', signal: 'vercel', path: 'vercel.json', confidence: 'high' },
    ],
  );
});

test('project scan emits Production signals without enabling a bundle by itself', async () => {
  const root = await project('production');
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  await mkdir(path.join(root, 'migrations'), { recursive: true });

  const manifest = await scanProject(root, ['claude'], 'standard');

  assert.deepEqual(manifest.bundle_signals.map((entry) => entry.signal), ['ci', 'migration']);
  assert.equal(manifest.bundles, undefined);
});

test('project scan marks only empty or git-only roots as greenfield', async () => {
  const empty = await project('empty');
  const gitOnly = await project('git-only');
  await mkdir(path.join(gitOnly, '.git'));

  assert.equal((await scanProject(empty, ['codex'], 'core')).project_state, 'greenfield');
  assert.equal((await scanProject(gitOnly, ['codex'], 'core')).project_state, 'greenfield');
});

test('project scan marks non-Web package, README, source, and instruction roots as existing', async () => {
  const packageRoot = await project('package-existing');
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'plain-node-project' }), 'utf8');

  const readmeRoot = await project('readme-existing');
  await writeFile(path.join(readmeRoot, 'README.md'), '# Existing project\n', 'utf8');

  const sourceRoot = await project('source-existing');
  await mkdir(path.join(sourceRoot, 'src'));

  const instructionsRoot = await project('instructions-existing');
  await writeFile(path.join(instructionsRoot, 'AGENTS.md'), '# Existing instructions\n', 'utf8');

  for (const root of [packageRoot, readmeRoot, sourceRoot, instructionsRoot]) {
    assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
  }
});
