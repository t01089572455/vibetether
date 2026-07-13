import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';
import { inspectProject } from '../src/doctor.mjs';
import { initialize } from '../src/init.mjs';
import { skillFingerprint } from '../src/skill-install.mjs';
import { uninstall } from '../src/uninstall.mjs';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-provider-lifecycle-upstream-'));
  await mkdir(path.join(root, 'skills', 'demo'), { recursive: true });
  await writeFile(path.join(root, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\ndescription: Demo route.\n---\n', 'utf8');
  await writeFile(path.join(root, 'skills', 'demo', 'guide.md'), '# Complete provider\n', 'utf8');
  await writeFile(path.join(root, 'LICENSE'), 'MIT fixture license\n', 'utf8');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'VibeTether Tests']);
  git(root, ['config', 'user.email', 'tests@example.invalid']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'fixture']);
  return {
    root,
    commit: git(root, ['rev-parse', 'HEAD']),
    fingerprint: await skillFingerprint(path.join(root, 'skills', 'demo')),
  };
}

function registry(source) {
  return {
    schema_version: 1,
    runtime_auto_install: false,
    sources: [{
      id: 'fixture-source',
      repository: source.root,
      ref: source.commit,
      commit: source.commit,
      license: 'MIT',
      license_path: 'LICENSE',
      skills: [{
        id: 'fixture-demo',
        install_name: 'demo',
        path: 'skills/demo',
        fingerprint: source.fingerprint,
        capabilities: ['requirements-clarification'],
      }],
    }],
    profiles: {
      core: { skills: [] },
      standard: { skills: ['fixture-demo'] },
      extended: { extends: 'standard', skills: [] },
    },
    readiness_gate: {
      mode: 'automatic',
      dimensions: ['user-and-outcome'],
      implementation_requires: 'READY_FOR_IMPLEMENT_ONE',
    },
    capability_catalog: [{
      id: 'requirements-clarification',
      phases: ['DISCOVER'],
      purpose: 'Clarify a request.',
      invoke_when: ['goal-unclear'],
      required_inputs: ['user_request'],
      required_outputs: ['approved_goal'],
      exit_evidence: ['The goal is approved.'],
      fallback: 'vibetether-built-in-alignment',
    }],
    routes: [{
      id: 'fixture-route',
      profiles: ['standard', 'extended'],
      phase: 'DISCOVER',
      capability: 'requirements-clarification',
      provider: 'demo',
      workflow_role: 'primary',
      selection: 'recommend',
      required: false,
      fallback: 'vibetether-built-in-alignment',
      priority: 100,
      reason: 'The goal is unclear.',
    }],
  };
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function initialized(name, preexisting = false) {
  const source = await fixture();
  const target = await mkdtemp(path.join(os.tmpdir(), `vibetether-provider-lifecycle-${name}-`));
  const provider = path.join(target, '.agents', 'skills', 'demo');
  if (preexisting) {
    await mkdir(path.dirname(provider), { recursive: true });
    await cp(path.join(source.root, 'skills', 'demo'), provider, { recursive: true });
  }
  await initialize(
    { project: target, agent: 'codex', profile: 'standard', dryRun: false, yes: true },
    { loadRegistry: async () => registry(source) },
  );
  return { source, target, provider };
}

test('doctor verifies provider lock and capability board on a healthy project', async () => {
  const { target } = await initialized('doctor-ok');
  const report = JSON.parse(await inspectProject({ project: target, json: true }));
  assert.equal(report.ok, true);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.providers.active, 1);
  assert.equal(report.providers.available, 1);
});

test('doctor treats a missing optional provider as a fallback warning, not a forced-route failure', async () => {
  const { target, provider } = await initialized('doctor-missing');
  await rm(provider, { recursive: true });

  const report = JSON.parse(await inspectProject({ project: target, json: true }));
  assert.equal(report.ok, true);
  assert.equal(report.warnings.some((entry) => entry.code === 'missing-optional-provider'), true);
  assert.match(report.warnings.find((entry) => entry.code === 'missing-optional-provider').message, /fallback/i);

  const resolver = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'resolve-route.mjs');
  const route = spawnSync(process.execPath, [
    resolver, '--project', target, '--phase', 'DISCOVER',
    '--capability', 'requirements-clarification', '--signal', 'goal-unclear', '--agent', 'codex',
  ], { cwd: target, encoding: 'utf8' });
  assert.equal(route.status, 0, route.stderr || route.stdout);
  const resolution = JSON.parse(route.stdout);
  assert.equal(resolution.recommendation.available, false);
  assert.equal(resolution.selection.skill, 'vibetether-built-in-alignment');
  assert.equal(resolution.should_invoke_provider, false);
});

test('doctor blocks on a modified provider copy owned by VibeTether', async () => {
  const { target, provider } = await initialized('doctor-modified');
  await writeFile(path.join(provider, 'guide.md'), '# User modification\n', 'utf8');

  await assert.rejects(
    inspectProject({ project: target, json: true }),
    (error) => {
      const report = JSON.parse(error.output);
      assert.equal(report.issues.some((entry) => entry.code === 'changed-managed-provider'), true);
      return true;
    },
  );
});

test('doctor and uninstall block on a modified catalog copy owned by VibeTether', async () => {
  const { target } = await initialized('catalog-modified');
  const lock = YAML.parse(await readFile(path.join(target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  const catalogPath = path.join(target, lock.catalog[0].installation.path);
  await writeFile(path.join(catalogPath, 'guide.md'), '# User modification\n', 'utf8');

  await assert.rejects(
    inspectProject({ project: target, json: true }),
    (error) => JSON.parse(error.output).issues.some((entry) => entry.code === 'changed-managed-catalog-provider'),
  );
  await assert.rejects(
    uninstall({ project: target, dryRun: false, yes: true }),
    /modified catalog Skill/i,
  );
  assert.equal(await exists(path.join(target, 'AGENTS.md')), true);
});

test('doctor and uninstall refuse a missing or modified managed provider license', async () => {
  const missing = await initialized('doctor-license-missing');
  const missingLock = YAML.parse(await readFile(path.join(missing.target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  const missingLicense = path.join(missing.target, missingLock.sources[0].license_installation.path);
  await rm(missingLicense);
  await assert.rejects(
    inspectProject({ project: missing.target, json: true }),
    (error) => JSON.parse(error.output).issues.some((entry) => entry.code === 'missing-provider-license'),
  );

  const changed = await initialized('uninstall-license-changed');
  const changedLock = YAML.parse(await readFile(path.join(changed.target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  const changedLicense = path.join(changed.target, changedLock.sources[0].license_installation.path);
  await writeFile(changedLicense, 'Changed license text\n', 'utf8');
  await assert.rejects(
    uninstall({ project: changed.target, dryRun: false, yes: true }),
    /modified provider license/i,
  );
  assert.equal(await exists(path.join(changed.target, 'AGENTS.md')), true);
});

test('uninstall removes unchanged managed providers and generated routing files', async () => {
  const { target, provider } = await initialized('uninstall-managed');
  const lockBefore = YAML.parse(await readFile(path.join(target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  const licensePath = path.join(target, lockBefore.sources[0].license_installation.path);
  const catalogPath = path.join(target, lockBefore.catalog[0].installation.path);
  assert.equal(await exists(licensePath), true);
  assert.equal(await exists(catalogPath), true);
  await uninstall({ project: target, dryRun: false, yes: true });

  assert.equal(await exists(provider), false);
  assert.equal(await exists(path.join(target, '.vibetether', 'capabilities.yaml')), false);
  assert.equal(await exists(path.join(target, '.vibetether', 'providers.lock.yaml')), false);
  assert.equal(await exists(licensePath), false);
  assert.equal(await exists(catalogPath), false);
  const manifest = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(manifest.capability_board, undefined);
  assert.equal(manifest.provider_lock, undefined);
});

test('uninstall preserves identical providers that existed before VibeTether', async () => {
  const { target, provider } = await initialized('uninstall-preexisting', true);
  const lock = YAML.parse(await readFile(path.join(target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  assert.equal(lock.skills[0].installations.codex.ownership, 'preexisting');

  await uninstall({ project: target, dryRun: false, yes: true });

  assert.equal(await exists(path.join(provider, 'SKILL.md')), true);
});

test('profile downgrade retains inactive ownership so managed providers remain safely uninstallable', async () => {
  const { source, target, provider } = await initialized('profile-downgrade');
  const dependencies = { loadRegistry: async () => registry(source) };

  await initialize(
    { project: target, agent: 'codex', profile: 'core', dryRun: false, yes: true },
    dependencies,
  );

  const lock = YAML.parse(await readFile(path.join(target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  assert.equal(lock.profile, 'core');
  assert.equal(lock.skills[0].active, false);
  assert.equal(lock.skills[0].installations.codex.ownership, 'vibetether');
  assert.equal(await exists(path.join(provider, 'SKILL.md')), true);

  await uninstall({ project: target, dryRun: false, yes: true });
  assert.equal(await exists(provider), false);
});

test('doctor and uninstall reject lock paths that do not match the declared harness and Skill', async () => {
  const { target } = await initialized('tampered-lock-path');
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  lock.skills[0].installations.codex.path = '.vibetether/intent.md';
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');

  await assert.rejects(
    inspectProject({ project: target, json: true }),
    (error) => JSON.parse(error.output).issues.some((entry) => entry.code === 'provider-installation-path-mismatch'),
  );
  await assert.rejects(
    uninstall({ project: target, dryRun: false, yes: true }),
    /provider install path does not match/i,
  );
  assert.equal(await exists(path.join(target, '.vibetether', 'intent.md')), true);
  assert.equal(await exists(path.join(target, 'AGENTS.md')), true);
});
