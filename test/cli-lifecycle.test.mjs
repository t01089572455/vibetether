import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'vibetether.mjs');

async function project(name) {
  return mkdtemp(path.join(os.tmpdir(), `vibetether-lifecycle-${name}-`));
}

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test('doctor reports a healthy initialized project as machine-readable JSON', async () => {
  const target = await project('doctor-ok');
  assert.equal(runCli(['init', '--project', target, '--agent', 'both', '--yes']).status, 0);

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.schema_version, 1);
  assert.deepEqual(report.harnesses, ['codex', 'claude']);
});

test('doctor exits 4 when a declared truth source is missing', async () => {
  const target = await project('doctor-fail');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--yes']).status, 0);
  await rm(path.join(target, '.vibetether', 'intent.md'));

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.issues.some((issue) => issue.code === 'missing-source'), true);
});

test('doctor detects a stale runtime checkpoint without exposing private reasoning', async () => {
  const target = await project('doctor-stale');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--yes']).status, 0);
  const checkpointPath = path.join(target, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  checkpoint.updated_at = '2000-01-01T00:00:00.000Z';
  await writeFile(checkpointPath, YAML.stringify(checkpoint), 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((issue) => issue.code === 'stale-checkpoint'), true);
  assert.doesNotMatch(result.stdout, /chain-of-thought|private_reasoning/i);

  const installedValidator = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'validate-project.mjs');
  const validator = spawnSync(process.execPath, [installedValidator, '--project', target], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(validator.status, 1, validator.stderr || validator.stdout);
  assert.match(validator.stderr, /stale checkpoint/i);
});

test('uninstall dry-run leaves the project unchanged', async () => {
  const target = await project('uninstall-dry');
  assert.equal(runCli(['init', '--project', target, '--agent', 'both', '--yes']).status, 0);
  const before = await readFile(path.join(target, 'AGENTS.md'), 'utf8');

  const result = runCli(['uninstall', '--project', target, '--dry-run']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /DRY RUN/);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), before);
  assert.equal(await exists(path.join(target, '.agents', 'skills', 'vibe-tether', 'SKILL.md')), true);
});

test('uninstall removes only VibeTether-managed content and preserves the Intent Contract', async () => {
  const target = await project('uninstall');
  await writeFile(path.join(target, 'AGENTS.md'), '# Team rules\n\nKeep me.\n', 'utf8');
  assert.equal(runCli(['init', '--project', target, '--agent', 'both', '--yes']).status, 0);

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  assert.match(agents, /# Team rules/);
  assert.match(agents, /Keep me\./);
  assert.doesNotMatch(agents, /vibetether:start/);
  assert.equal(await exists(path.join(target, 'CLAUDE.md')), false);
  assert.equal(await exists(path.join(target, '.agents', 'skills', 'vibe-tether')), false);
  assert.equal(await exists(path.join(target, '.claude', 'skills', 'vibe-tether')), false);
  assert.equal(await exists(path.join(target, '.vibetether', 'project.yaml')), true);
  assert.equal(await exists(path.join(target, '.vibetether', 'intent.md')), true);
});

test('uninstall refuses a modified installed Skill without changing project files', async () => {
  const target = await project('uninstall-conflict');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--yes']).status, 0);
  const agentsBefore = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  const installedSkill = path.join(target, '.agents', 'skills', 'vibe-tether', 'SKILL.md');
  await writeFile(installedSkill, `${await readFile(installedSkill, 'utf8')}\nUser customization.\n`, 'utf8');

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /modified installed Skill/i);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), agentsBefore);
  assert.equal(await exists(installedSkill), true);
});
