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
  assert.match(result.stdout, /--- AGENTS\.md[\s\S]*\+\+\+ AGENTS\.md[\s\S]*vibetether:start/);
  assert.match(result.stdout, /--- \/dev\/null[\s\S]*\+\+\+ \.vibetether\/project\.yaml[\s\S]*profile: standard/);
  assert.equal(await exists(path.join(target, '.vibetether')), false);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), '# Existing instructions\n');
});

test('dry-run shows old and new managed values for an existing project', async () => {
  const target = await project('dry-run-update');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const before = await readFile(manifestPath, 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'extended', '--dry-run']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /--- \.vibetether\/project\.yaml[\s\S]*-profile: core[\s\S]*\+profile: extended/);
  assert.equal(await readFile(manifestPath, 'utf8'), before);
});

test('init installs Codex and Claude project Skills and preserves user instructions', async () => {
  const target = await project('both');
  await writeFile(path.join(target, 'AGENTS.md'), '# Team rules\n\nKeep this line.\n', 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);

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
  const args = ['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes'];

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
  assert.equal(manifest.intent_contract, '.vibetether/intent.md');
  assert.deepEqual(manifest.sources.always, [
    'AGENTS.md',
    'CONTEXT.md',
    'docs/product-direction.md',
    '.vibetether/intent.md',
  ]);
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

  const result = runCli(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);

  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /managed block conflict/i);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), original);
  assert.equal(await exists(path.join(target, 'CLAUDE.md')), false);
  assert.equal(await exists(path.join(target, '.vibetether')), false);
});

test('init rejects reversed managed markers and preserves every user byte', async () => {
  const target = await project('reversed-markers');
  const original = '# Existing  \r\n<!-- vibetether:end -->\r\nuser text\t \r\n<!-- vibetether:start -->\r\n';
  await writeFile(path.join(target, 'AGENTS.md'), original, 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);

  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /managed block conflict/i);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), original);
  assert.equal(await exists(path.join(target, '.vibetether')), false);
});

test('init preserves CRLF and trailing whitespace outside its managed block', async () => {
  const target = await project('byte-preservation');
  const original = '# Existing  \r\nKeep trailing whitespace\t \r\n';
  await writeFile(path.join(target, 'AGENTS.md'), original, 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const installed = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  assert.equal(installed.slice(0, original.length), original);
  assert.match(installed, /<!-- vibetether:start -->\r\n/);
});

test('init refuses to overwrite a customized installed Skill without partial writes', async () => {
  const target = await project('modified-skill');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const agentsBefore = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  const installedSkill = path.join(target, '.agents', 'skills', 'vibe-tether', 'SKILL.md');
  const customized = `${await readFile(installedSkill, 'utf8')}\nUser customization.\n`;
  await writeFile(installedSkill, customized, 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);

  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /modified installed Skill/i);
  assert.equal(await readFile(installedSkill, 'utf8'), customized);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), agentsBefore);
  assert.equal(await exists(path.join(target, 'CLAUDE.md')), false);
});

test('init keeps runtime checkpoint state out of version control', async () => {
  const target = await project('ignore-state');
  await writeFile(path.join(target, '.gitignore'), 'dist/\n', 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const ignore = await readFile(path.join(target, '.gitignore'), 'utf8');
  assert.match(ignore, /^dist\/$/m);
  assert.match(ignore, /<!-- vibetether:start -->[\s\S]*\.vibetether\/state\/[\s\S]*<!-- vibetether:end -->/);
  assert.match(ignore, /<!-- vibetether:start -->[\s\S]*\.vibetether\/providers\/catalog\/[\s\S]*<!-- vibetether:end -->/);
  assert.equal(await exists(path.join(target, '.vibetether', 'intent.md')), true);
  const checkpoint = YAML.parse(await readFile(path.join(target, '.vibetether', 'state', 'current.yaml'), 'utf8'));
  assert.equal(checkpoint.schema_version, 1);
  assert.equal(checkpoint.phase, 'DISCOVER');
  assert.equal(typeof checkpoint.goal, 'string');
  assert.equal(typeof checkpoint.last_reanchor, 'string');
  assert.equal(Array.isArray(checkpoint.protected_capabilities), true);
  assert.equal(checkpoint.private_reasoning, undefined);
});

test('repeated init preserves curated manifest fields and existing harnesses', async () => {
  const target = await project('curated-manifest');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  manifest.project_gates = ['changing-public-api'];
  manifest.verification = { test: 'npm test' };
  manifest.sources.always.push('docs/curated.md');
  await mkdir(path.join(target, 'docs'), { recursive: true });
  await writeFile(path.join(target, 'docs', 'curated.md'), '# Curated\n', 'utf8');
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');

  const result = runCli(['init', '--project', target, '--agent', 'claude', '--profile', 'core', '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = YAML.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(after.project_gates, ['changing-public-api']);
  assert.deepEqual(after.verification, { test: 'npm test' });
  assert.equal(after.sources.always.includes('docs/curated.md'), true);
  assert.equal(after.profile, 'core');
  assert.equal(after.harnesses.codex.enabled, true);
  assert.equal(after.harnesses.claude.enabled, true);
});

test('init discovers requirement and testing sources but stops on competing product direction', async () => {
  const discovered = await project('broader-scan');
  await mkdir(path.join(discovered, 'docs', 'specs'), { recursive: true });
  await writeFile(path.join(discovered, 'docs', 'testing.md'), '# Testing\n', 'utf8');
  assert.equal(runCli(['init', '--project', discovered, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const manifest = YAML.parse(await readFile(path.join(discovered, '.vibetether', 'project.yaml'), 'utf8'));
  assert.deepEqual(manifest.sources.conditional.requirements, ['docs/specs/']);
  assert.deepEqual(manifest.sources.conditional.testing, ['docs/testing.md']);

  const ambiguous = await project('competing-direction');
  await mkdir(path.join(ambiguous, 'docs'), { recursive: true });
  await writeFile(path.join(ambiguous, 'docs', 'product-direction.md'), '# Direction A\n', 'utf8');
  await writeFile(path.join(ambiguous, 'PRD.md'), '# Direction B\n', 'utf8');
  const result = runCli(['init', '--project', ambiguous, '--agent', 'codex', '--profile', 'core', '--yes']);
  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /competing product direction/i);
  assert.equal(await exists(path.join(ambiguous, '.vibetether')), false);
});

test('init records detected bundle evidence while --no-auto-bundles keeps optional packs inactive', async () => {
  const target = await project('bundle-opt-out');
  await writeFile(
    path.join(target, 'package.json'),
    JSON.stringify({ dependencies: { next: '^15.0.0', react: '^19.0.0' } }),
    'utf8',
  );

  const result = runCli([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--no-auto-bundles', '--yes',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  assert.deepEqual(manifest.bundles, []);
  assert.deepEqual(manifest.bundle_signals.map((entry) => entry.signal), ['nextjs', 'react']);
});

test('init rejects an unknown specialist bundle', async () => {
  const target = await project('unknown-bundle');
  const result = runCli(['init', '--project', target, '--profile', 'core', '--bundle', 'database', '--dry-run']);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /invalid --bundle/i);
});

test('core rejects optional bundles so its provider path remains offline', async () => {
  const target = await project('core-bundle');
  const result = runCli(['init', '--project', target, '--profile', 'core', '--bundle', 'web', '--dry-run']);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /core.*bundle|bundle.*core/i);
  assert.equal(await exists(path.join(target, '.vibetether')), false);
});

test('standard dry-run auto-selects the Web catalog and exposes only signal-matched specialists', async () => {
  const target = await project('web-bundle-dry-run');
  await writeFile(
    path.join(target, 'package.json'),
    JSON.stringify({ dependencies: { next: '^15.0.0', react: '^19.0.0' } }),
    'utf8',
  );

  const result = runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'standard', '--dry-run']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /bundles:\s*\n\+\s+- web/);
  assert.match(result.stdout, /\.vibetether\/providers\/catalog\/vercel-agent-skills-f8a72b9\/vercel-react-best-practices/);
  assert.match(result.stdout, /\.agents\/skills\/vercel-react-best-practices/);
  assert.doesNotMatch(result.stdout, /\.agents\/skills\/deploy-to-vercel/);
  assert.match(result.stdout, /generated capability board/i);
  assert.match(result.stdout, /generated provider lock/i);
  assert.ok(result.stdout.length < 50_000, `dry-run output is too large: ${result.stdout.length} bytes`);
});
