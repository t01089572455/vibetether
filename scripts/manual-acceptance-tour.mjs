import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'vibetether.mjs');
const project = await mkdtemp(path.join(os.tmpdir(), 'vibetether-acceptance-'));

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

try {
  run(['init', '--project', project, '--agent', 'codex', '--profile', 'core', '--yes']);
  run(['doctor', '--project', project, '--json']);
  run(['capabilities', '--project', project]);
  run(['init', '--project', project, '--agent', 'codex', '--profile', 'core', '--yes']);
  run(['uninstall', '--project', project, '--dry-run']);
  run(['uninstall', '--project', project, '--yes']);
  process.stdout.write(`VibeTether acceptance tour passed in ${project}\n`);
} finally {
  await rm(project, { recursive: true, force: true });
}
