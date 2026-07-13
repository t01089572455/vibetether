import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  await mkdir(path.join(target, 'docs'), { recursive: true });
  await writeFile(path.join(target, 'docs', 'product-direction.md'), '# Product direction\n', 'utf8');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--yes']).status, 0);
  await rm(path.join(target, '.vibetether', 'intent.md'));

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.issues.some((issue) => issue.code === 'missing-source'), true);

  const installedValidator = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'validate-project.mjs');
  const validator = spawnSync(process.execPath, [installedValidator, '--project', target], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(validator.status, 1, validator.stderr || validator.stdout);
  assert.match(validator.stderr, /missing declared source.*intent\.md/i);
});

test('doctor requires an explicit Intent Contract manifest field', async () => {
  const target = await project('doctor-intent-field');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--yes']).status, 0);
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.intent_contract;
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((issue) => issue.code === 'missing-intent-contract'), true);
});

test('doctor detects a stale runtime checkpoint without exposing private reasoning', async () => {
  const target = await project('doctor-stale');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--yes']).status, 0);
  const checkpointPath = path.join(target, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  checkpoint.last_reanchor = '2000-01-01T00:00:00.000Z';
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

test('doctor detects changed managed instructions and customized Skill copies', async () => {
  const target = await project('doctor-adapter-drift');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--yes']).status, 0);
  const agentsPath = path.join(target, 'AGENTS.md');
  const agents = await readFile(agentsPath, 'utf8');
  await writeFile(
    agentsPath,
    agents.replace(/<!-- vibetether:start -->[\s\S]*<!-- vibetether:end -->/, '<!-- vibetether:start -->\nChanged control rules.\n<!-- vibetether:end -->'),
    'utf8',
  );
  const installedSkill = path.join(target, '.agents', 'skills', 'vibe-tether', 'SKILL.md');
  await writeFile(installedSkill, `${await readFile(installedSkill, 'utf8')}\nCustomization.\n`, 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((issue) => issue.code === 'changed-managed-block'), true);
  assert.equal(report.issues.some((issue) => issue.code === 'changed-skill'), true);
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

test('uninstall rejects reversed markers without changing user content', async () => {
  const target = await project('uninstall-reversed');
  const original = '# User content\r\n<!-- vibetether:end -->\r\nkeep me  \r\n<!-- vibetether:start -->\r\n';
  await writeFile(path.join(target, 'AGENTS.md'), original, 'utf8');

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /managed block conflict/i);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), original);
});

test('uninstall removes only VibeTether-managed content and preserves the Intent Contract', async () => {
  const target = await project('uninstall');
  const originalAgents = '# Team rules\n\nKeep me.\n';
  await writeFile(path.join(target, 'AGENTS.md'), originalAgents, 'utf8');
  assert.equal(runCli(['init', '--project', target, '--agent', 'both', '--yes']).status, 0);

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  assert.equal(agents, originalAgents);
  assert.match(agents, /# Team rules/);
  assert.match(agents, /Keep me\./);
  assert.doesNotMatch(agents, /vibetether:start/);
  assert.equal(await exists(path.join(target, 'CLAUDE.md')), false);
  assert.equal(await exists(path.join(target, '.agents', 'skills', 'vibe-tether')), false);
  assert.equal(await exists(path.join(target, '.claude', 'skills', 'vibe-tether')), false);
  assert.equal(await exists(path.join(target, '.vibetether', 'project.yaml')), true);
  assert.equal(await exists(path.join(target, '.vibetether', 'intent.md')), true);
});

test('init preserves a no-final-newline gitignore rule while active and uninstall restores exact bytes', async () => {
  const target = await project('gitignore-roundtrip');
  const gitignorePath = path.join(target, '.gitignore');
  const original = 'dist/';
  await writeFile(gitignorePath, original, 'utf8');

  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--yes']).status, 0);
  const active = await readFile(gitignorePath, 'utf8');
  assert.match(active, /^dist\/\r?\n<!-- vibetether:start -->/);
  assert.equal(active.split(/\r?\n/)[0], 'dist/');

  assert.equal(runCli(['uninstall', '--project', target, '--yes']).status, 0);
  assert.equal(await readFile(gitignorePath, 'utf8'), original);
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
