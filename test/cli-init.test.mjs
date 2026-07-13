import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'vibetether.mjs');

async function project(name) {
  return mkdtemp(path.join(os.tmpdir(), `vibetether-${name}-`));
}

function runCli(args, cwd = root) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

test('dry-run reports the initialization plan without changing the project', async () => {
  const target = await project('dry-run');
  await writeFile(path.join(target, 'AGENTS.md'), '# Existing instructions\n', 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'both', '--profile', 'standard', '--dry-run']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /DRY RUN/);
  assert.match(result.stdout, /AGENTS\.md/);
  assert.match(result.stdout, /CLAUDE\.md/);
  assert.equal(await exists(path.join(target, '.vibetether')), false);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), '# Existing instructions\n');
});

test('init installs Codex and Claude project Skills and preserves user instructions', async () => {
  const target = await project('both');
  await writeFile(path.join(target, 'AGENTS.md'), '# Team rules\n\nKeep this line.\n', 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'both', '--profile', 'standard', '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(await exists(path.join(target, '.agents', 'skills', 'vibe-tether', 'SKILL.md')), true);
  assert.equal(await exists(path.join(target, '.claude', 'skills', 'vibe-tether', 'SKILL.md')), true);
  assert.equal(await exists(path.join(target, 'AGENTS.md.bak')), true);

  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  const claude = await readFile(path.join(target, 'CLAUDE.md'), 'utf8');
  assert.match(agents, /^# Team rules/m);
  assert.match(agents, /Keep this line\./);
  assert.match(agents, /<!-- vibetether:start -->[\s\S]*<!-- vibetether:end -->/);
  assert.match(claude, /<!-- vibetether:start -->[\s\S]*<!-- vibetether:end -->/);
});

test('repeated init is byte-for-byte idempotent', async () => {
  const target = await project('idempotent');
  const args = ['init', '--project', target, '--agent', 'both', '--profile', 'standard', '--yes'];

  const first = runCli(args);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const before = await Promise.all([
    readFile(path.join(target, 'AGENTS.md'), 'utf8'),
    readFile(path.join(target, 'CLAUDE.md'), 'utf8'),
    readFile(path.join(target, '.gitignore'), 'utf8'),
    readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'),
    readFile(path.join(target, '.vibetether', 'state', 'current.yaml'), 'utf8'),
  ]);

  const second = runCli(args);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  const after = await Promise.all([
    readFile(path.join(target, 'AGENTS.md'), 'utf8'),
    readFile(path.join(target, 'CLAUDE.md'), 'utf8'),
    readFile(path.join(target, '.gitignore'), 'utf8'),
    readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'),
    readFile(path.join(target, '.vibetether', 'state', 'current.yaml'), 'utf8'),
  ]);

  assert.deepEqual(after, before);
});

test('init discovers existing truth sources with explicit confidence', async () => {
  const target = await project('scan');
  await mkdir(path.join(target, 'docs', 'adr'), { recursive: true });
  await writeFile(path.join(target, 'CONTEXT.md'), '# Product context\n', 'utf8');
  await writeFile(path.join(target, 'docs', 'product-direction.md'), '# Direction\n', 'utf8');
  await writeFile(path.join(target, 'docs', 'ui-spec.md'), '# UI\n', 'utf8');
  await writeFile(path.join(target, 'docs', 'adr', '0001.md'), '# ADR\n', 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const manifest = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.goal_source, 'docs/product-direction.md');
  assert.deepEqual(manifest.sources.always, ['AGENTS.md', 'CONTEXT.md', 'docs/product-direction.md']);
  assert.deepEqual(manifest.sources.conditional.architecture, ['docs/adr/']);
  assert.deepEqual(manifest.sources.conditional.ui, ['docs/ui-spec.md']);
  assert.equal(manifest.discovery['docs/product-direction.md'].confidence, 'high');
  assert.equal(manifest.harnesses.codex.enabled, true);
  assert.equal(manifest.harnesses.claude.enabled, false);
});

test('init refuses malformed or duplicate managed blocks without partial writes', async () => {
  const target = await project('conflict');
  const original = '# Existing\n\n<!-- vibetether:start -->\nconflicting block without end\n';
  await writeFile(path.join(target, 'AGENTS.md'), original, 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'both', '--profile', 'standard', '--yes']);

  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /managed block conflict/i);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), original);
  assert.equal(await exists(path.join(target, 'CLAUDE.md')), false);
  assert.equal(await exists(path.join(target, '.vibetether')), false);
});

test('init keeps runtime checkpoint state out of version control', async () => {
  const target = await project('ignore-state');
  await writeFile(path.join(target, '.gitignore'), 'dist/\n', 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const ignore = await readFile(path.join(target, '.gitignore'), 'utf8');
  assert.match(ignore, /^dist\/$/m);
  assert.match(ignore, /<!-- vibetether:start -->[\s\S]*\.vibetether\/state\/[\s\S]*<!-- vibetether:end -->/);
  assert.equal(await exists(path.join(target, '.vibetether', 'intent.md')), true);
  const checkpoint = YAML.parse(await readFile(path.join(target, '.vibetether', 'state', 'current.yaml'), 'utf8'));
  assert.equal(checkpoint.schema_version, 1);
  assert.equal(checkpoint.lifecycle_state, 'DISCOVER');
  assert.equal(checkpoint.private_reasoning, undefined);
});
