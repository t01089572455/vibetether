import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';
import { main } from '../src/cli.mjs';
import { ROUTE_HANDSHAKE_PATH } from '../src/route-handshake.mjs';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function initializedProject(name) {
  const root = await mkdtemp(path.join(os.tmpdir(), `vibetether-execution-${name}-`));
  await main([
    'init', '--project', root, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Keep route evidence attached to the real execution worktree.',
    '--success-evidence', 'Route state records the execution root and Git snapshot.',
  ]);
  const checkpointPath = path.join(root, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  checkpoint.phase = 'EXECUTE_ONE';
  await writeFile(checkpointPath, YAML.stringify(checkpoint), 'utf8');
  return root;
}

async function gitWorktreeProject(name) {
  const root = await initializedProject(name);
  const mainRoot = path.join(root, 'main');
  git(root, ['init', 'main']);
  git(mainRoot, ['config', 'user.email', 'vibetether@example.com']);
  git(mainRoot, ['config', 'user.name', 'VibeTether Tests']);
  await writeFile(path.join(mainRoot, 'app.txt'), 'initial\n', 'utf8');
  git(mainRoot, ['add', 'app.txt']);
  git(mainRoot, ['commit', '-m', 'initial']);
  git(mainRoot, ['worktree', 'add', path.join(root, 'worktree'), '-b', 'feature']);
  return { root, mainRoot, worktree: path.join(root, 'worktree') };
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

test('route records the declared project-contained Git worktree execution snapshot', async () => {
  const { root, worktree } = await gitWorktreeProject('worktree');
  const output = JSON.parse(await main([
    'route', '--project', root,
    '--execution-root', 'worktree',
    '--phase', 'EXECUTE_ONE', '--capability', 'tdd',
    '--signal', 'new-behavior', '--agent', 'codex', '--json',
  ]));

  assert.equal(output.execution_start.root, 'worktree');
  assert.equal(output.execution_start.git.available, true);
  assert.equal(output.execution_start.git.worktree_root, 'worktree');
  assert.equal(output.execution_start.git.ref, 'feature');
  assert.match(output.execution_start.git.head, /^[a-f0-9]{40}$/);
  assert.match(output.execution_start.git.status_sha256, /^[a-f0-9]{64}$/);
  assert.match(output.execution_start.git.worktree_sha256, /^[a-f0-9]{64}$/);
  assert.equal(await exists(path.join(worktree, '.git')), true);
  const handshake = YAML.parse(await readFile(
    path.join(root, ...ROUTE_HANDSHAKE_PATH.split('/')),
    'utf8',
  ));
  assert.deepEqual(handshake.execution_start, output.execution_start);
});

test('an external execution root is rejected before route state is written', async () => {
  const root = await initializedProject('external-root');
  const external = await mkdtemp(path.join(os.tmpdir(), 'vibetether-external-root-'));

  await assert.rejects(
    main([
      'route', '--project', root,
      '--execution-root', external,
      '--phase', 'EXECUTE_ONE', '--capability', 'tdd',
      '--signal', 'new-behavior', '--agent', 'codex',
    ]),
    /execution root.*inside the project|outside the project/i,
  );

  assert.equal(await exists(path.join(root, ...ROUTE_HANDSHAKE_PATH.split('/'))), false);
});

test('doctor detects execution worktree drift after route completion', async () => {
  const { root, worktree } = await gitWorktreeProject('post-completion-drift');
  await main([
    'route', '--project', root,
    '--execution-root', 'worktree',
    '--phase', 'EXECUTE_ONE', '--capability', 'tdd',
    '--signal', 'new-behavior', '--agent', 'codex',
  ]);
  await writeFile(path.join(worktree, 'app.txt'), 'implemented\n', 'utf8');
  const completed = JSON.parse(await main([
    'route', 'complete', '--project', root,
    '--evidence', 'Focused test passed',
    '--truth-decision', 'no-material-change',
    '--truth-reason', 'The implementation changed no confirmed project authority.',
    '--json',
  ]));
  assert.notEqual(
    completed.execution_end.git.status_sha256,
    completed.execution_start.git.status_sha256,
  );

  const fresh = await doctorReport(root);
  assert.equal(fresh.ok, true);
  assert.equal(
    fresh.warnings.some(({ code }) => code === 'stale-execution-snapshot'),
    false,
  );

  await writeFile(path.join(worktree, 'app.txt'), 'changed after completion\n', 'utf8');
  const ordinary = await doctorReport(root);
  assert.equal(ordinary.ok, true);
  assert.equal(
    ordinary.warnings.some(({ code }) => code === 'stale-execution-snapshot'),
    true,
  );
  const completion = await doctorReport(root, 'completion');
  assert.equal(completion.ok, false);
  assert.equal(
    completion.issues.some(({ code }) => code === 'stale-execution-snapshot'),
    true,
  );
});
