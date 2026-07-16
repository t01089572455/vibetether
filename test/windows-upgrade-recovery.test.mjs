import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { applyInitialization, initialize } from '../src/init.mjs';
import { inspectProject } from '../src/doctor.mjs';
import { inspectVibeTetherIdentity, sourceSkill } from '../src/skill-install.mjs';
import {
  inspectSkillRecovery,
  recoverSkillUpgrades,
  replaceCanonicalSkill,
  skillUpgradePaths,
} from '../src/skill-upgrade-recovery.mjs';
import { loadProviderRegistry } from '../src/provider-registry.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const public021 = '1f6444567873b5d1abd3371c45df19db23054ec9';
const public023 = '56ea83e8e0feb7a086eff8e792225b418b41137b';
const public030 = '572839e16656ec20d2767b6d5bdf09b8afa1f976';

function git(args, { encoding = 'utf8' } = {}) {
  const result = spawnSync('git', args, { cwd: repository, encoding });
  assert.equal(result.status, 0, result.stderr?.toString() || result.stdout?.toString());
  return result.stdout;
}

async function materializeSkillAtCommit(commit, destination) {
  const listing = git(['ls-tree', '-r', '-z', '--full-tree', '--name-only', commit, '--', 'skills/vibe-tether']);
  for (const sourcePath of listing.split('\0').filter(Boolean)) {
    const relativePath = sourcePath.slice('skills/vibe-tether/'.length);
    const target = path.join(destination, ...relativePath.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, git(['show', `${commit}:${sourcePath}`], { encoding: 'buffer' }));
  }
}

function windowsLockError(code = 'EPERM') {
  const error = new Error('injected Windows directory lock');
  error.code = code;
  return error;
}

async function fixture(name) {
  const root = await mkdtemp(path.join(os.tmpdir(), `vibetether-windows-upgrade-${name}-`));
  const relativePath = '.agents/skills/vibe-tether';
  const target = path.join(root, ...relativePath.split('/'));
  await materializeSkillAtCommit(public021, target);
  assert.equal((await inspectVibeTetherIdentity(target)).state, 'legacy');
  return {
    root,
    target,
    relativePath,
    request: { root, target, relativePath, harness: 'codex', source: sourceSkill },
    paths: skillUpgradePaths(root, 'codex'),
  };
}

async function transaction(pathname) {
  return YAML.parse(await readFile(pathname, 'utf8'));
}

async function missing(pathname) {
  try {
    await stat(pathname);
    return false;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

async function doctorReport(root) {
  try {
    return JSON.parse(await inspectProject({ project: root, json: true }));
  } catch (error) {
    if (typeof error.output === 'string') return JSON.parse(error.output);
    throw error;
  }
}

test('a successful replacement installs the verified current Skill and removes completed transaction copies', async () => {
  const state = await fixture('success');

  const result = await replaceCanonicalSkill(state.request);

  assert.equal(result.status, 'installed');
  assert.deepEqual(result.cleanupWarnings, []);
  assert.equal((await inspectVibeTetherIdentity(state.target)).state, 'current');
  for (const target of [state.paths.manifest, state.paths.previous, state.paths.pending, state.paths.retired]) {
    assert.equal(await missing(target), true, target);
  }
});

test('target rename EPERM leaves the old canonical Skill addressable and stages a verified replacement', async () => {
  const state = await fixture('target-lock');
  const removals = [];
  let message;
  await assert.rejects(
    replaceCanonicalSkill(state.request, {
      async rename(from, to) {
        if (from === state.target && to === state.paths.retired) throw windowsLockError();
        return rename(from, to);
      },
      async rm(target, options) {
        removals.push(target);
        return rm(target, options);
      },
    }),
    (error) => {
      message = error.message;
      assert.match(error.message, /close.*Codex.*Claude.*rerun/i);
      assert.equal(error.status, 'deferred');
      return true;
    },
  );

  assert.equal((await inspectVibeTetherIdentity(state.target)).state, 'legacy');
  assert.equal((await inspectVibeTetherIdentity(state.paths.previous)).state, 'legacy');
  assert.equal((await inspectVibeTetherIdentity(state.paths.pending)).state, 'current');
  assert.equal((await transaction(state.paths.manifest)).state, 'waiting-for-host-release');
  assert.deepEqual(removals.filter((target) => [state.target, state.paths.previous, state.paths.pending].includes(target)), []);
  assert.doesNotMatch(message, /skill-upgrade-codex\.(?:previous|pending|retired)/i);
});

test('replacement commit EPERM restores the canonical address and preserves verified old and pending copies', async () => {
  const state = await fixture('commit-lock');
  const removals = [];
  await assert.rejects(
    replaceCanonicalSkill(state.request, {
      async rename(from, to) {
        if (from === state.paths.pending && to === state.target) throw windowsLockError();
        return rename(from, to);
      },
      async rm(target, options) {
        removals.push(target);
        return rm(target, options);
      },
    }),
    /close.*Codex.*Claude.*rerun/i,
  );

  assert.equal((await inspectVibeTetherIdentity(state.target)).state, 'legacy');
  assert.equal((await inspectVibeTetherIdentity(state.paths.previous)).state, 'legacy');
  assert.equal((await inspectVibeTetherIdentity(state.paths.pending)).state, 'current');
  assert.equal((await transaction(state.paths.manifest)).state, 'waiting-for-host-release');
  assert.deepEqual(removals.filter((target) => [state.target, state.paths.previous, state.paths.pending].includes(target)), []);
});

test('initialization rolls back text but never deletes a target owned by a deferred Skill transaction', async () => {
  const state = await fixture('outer-rollback');
  const instructions = path.join(state.root, 'AGENTS.md');
  await writeFile(instructions, '# Original\n', 'utf8');

  await assert.rejects(
    applyInitialization(
      state.root,
      [{ target: instructions, original: '# Original\n', content: '# Changed\n' }],
      [{
        kind: 'vibetether',
        harness: 'codex',
        source: sourceSkill,
        relativePath: state.relativePath,
        target: state.target,
        needsInstall: true,
        replacesExisting: true,
        upgradeOperations: {
          async rename(from, to) {
            if (from === state.target && to === state.paths.retired) throw windowsLockError();
            return rename(from, to);
          },
        },
      }],
    ),
    /close.*Codex.*Claude.*rerun/i,
  );

  assert.equal(await readFile(instructions, 'utf8'), '# Original\n');
  assert.equal((await inspectVibeTetherIdentity(state.target)).state, 'legacy');
  assert.equal((await transaction(state.paths.manifest)).state, 'waiting-for-host-release');
});

test('the next init recovers a released pending replacement before loading provider metadata', async () => {
  const state = await fixture('next-run');
  await assert.rejects(
    replaceCanonicalSkill(state.request, {
      async rename(from, to) {
        if (from === state.target && to === state.paths.retired) throw windowsLockError();
        return rename(from, to);
      },
    }),
    /rerun/i,
  );
  let registryLoads = 0;
  let providerFetches = 0;

  const output = await initialize({
    project: state.root,
    agent: 'codex',
    profile: 'core',
    dryRun: false,
    yes: true,
  }, {
    async loadRegistry() {
      registryLoads += 1;
      assert.equal((await inspectVibeTetherIdentity(state.target)).state, 'current');
      assert.equal(await missing(state.paths.manifest), true);
      return loadProviderRegistry();
    },
    async stageProviders() {
      providerFetches += 1;
      throw new Error('provider fetch must not run for this recovered core project');
    },
  });

  assert.equal(registryLoads, 1);
  assert.equal(providerFetches, 0);
  assert.match(output, /recovered[\s\S]*initialized/i);
});

test('a still-locked recovery remains deferred without consuming either verified copy', async () => {
  const state = await fixture('still-locked');
  const locked = {
    async rename(from, to) {
      if (from === state.target && to === state.paths.retired) throw windowsLockError();
      return rename(from, to);
    },
  };
  await assert.rejects(replaceCanonicalSkill(state.request, locked), /rerun/i);

  await assert.rejects(
    recoverSkillUpgrades({ root: state.root, adapters: ['codex'], operations: locked }),
    (error) => {
      assert.equal(error.status, 'deferred');
      assert.match(error.message, /close.*rerun/i);
      return true;
    },
  );

  assert.equal((await inspectVibeTetherIdentity(state.target)).state, 'legacy');
  assert.equal((await inspectVibeTetherIdentity(state.paths.previous)).state, 'legacy');
  assert.equal((await inspectVibeTetherIdentity(state.paths.pending)).state, 'current');
});

test('a verified canonical target supersedes a stale pending transaction instead of blocking current init', async () => {
  for (const scenario of [
    { name: 'different-legacy', targetCommit: public023, expectedState: 'legacy' },
    { name: 'already-current', targetCommit: 'current', expectedState: 'current' },
  ]) {
    const root = await mkdtemp(path.join(os.tmpdir(), `vibetether-stale-pending-${scenario.name}-`));
    const harness = 'claude';
    const paths = skillUpgradePaths(root, harness);
    const target = path.join(root, '.claude', 'skills', 'vibe-tether');
    await materializeSkillAtCommit(public021, paths.previous);
    await materializeSkillAtCommit(public030, paths.pending);
    if (scenario.targetCommit === 'current') await cp(sourceSkill, target, { recursive: true });
    else await materializeSkillAtCommit(scenario.targetCommit, target);
    const previous = await inspectVibeTetherIdentity(paths.previous);
    const replacement = await inspectVibeTetherIdentity(paths.pending);
    const before = await inspectVibeTetherIdentity(target);
    await mkdir(path.dirname(paths.manifest), { recursive: true });
    await writeFile(paths.manifest, YAML.stringify({
      schema_version: 1,
      harness,
      target: '.claude/skills/vibe-tether',
      previous: {
        identity: previous.installed,
        state: 'legacy',
        path: paths.relative.previous,
      },
      replacement: {
        identity: replacement.installed,
        path: paths.relative.pending,
      },
      retired_path: paths.relative.retired,
      state: 'waiting-for-host-release',
      created_at: '2026-07-15T06:37:41.248Z',
      updated_at: '2026-07-15T13:09:35.180Z',
      waiting_step: 'recover-retire-active-skill',
      lock_code: 'EPERM',
    }), 'utf8');

    const [report] = await recoverSkillUpgrades({ root, adapters: [harness] });

    assert.equal(report.status, 'superseded');
    assert.equal(report.sourceIdentity, before.installed);
    assert.equal((await inspectVibeTetherIdentity(target)).state, scenario.expectedState);
    for (const artifact of [paths.manifest, paths.previous, paths.pending, paths.retired]) {
      assert.equal(await missing(artifact), true, artifact);
    }
  }
});

async function legacyCandidate(root, name, commit = public021) {
  const target = path.join(root, '.vibetether', 'transaction', name);
  if (commit === 'current') await cp(sourceSkill, target, { recursive: true });
  else await materializeSkillAtCommit(commit, target);
  return target;
}

test('a missing Skill restores the only verified registered transaction candidate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-legacy-recovery-single-'));
  const candidate = await legacyCandidate(root, '11111111-1111-4111-8111-111111111111.previous');
  const candidateIdentity = (await inspectVibeTetherIdentity(candidate)).installed;

  const [report] = await recoverSkillUpgrades({ root, adapters: ['codex'] });

  const target = path.join(root, '.agents', 'skills', 'vibe-tether');
  assert.equal(report.kind, 'recoverable-missing-skill');
  assert.equal(report.status, 'recovered');
  assert.equal(report.sourceIdentity, candidateIdentity);
  assert.equal(report.targetIdentity, (await inspectVibeTetherIdentity(target)).installed);
  assert.equal((await inspectVibeTetherIdentity(target)).state, 'current');
  assert.equal(await missing(candidate), true);
});

test('missing-Skill recovery publishes current content without renaming a locked candidate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-legacy-recovery-locked-destination-'));
  const candidate = await legacyCandidate(root, '88888888-8888-4888-8888-888888888888.previous');
  const target = path.join(root, '.agents', 'skills', 'vibe-tether');

  const [report] = await recoverSkillUpgrades({
    root,
    adapters: ['codex'],
    operations: {
      async rename(from, to) {
        if (from === candidate && to === target) throw windowsLockError();
        return rename(from, to);
      },
    },
  });

  assert.equal(report.kind, 'recoverable-missing-skill');
  assert.equal(report.status, 'recovered');
  assert.equal(report.sourceState, 'legacy');
  assert.equal((await inspectVibeTetherIdentity(target)).state, 'current');
  assert.equal(await missing(candidate), true);
});

test('multiple legacy candidates select only the exact enabled peer-harness identity', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-legacy-recovery-peer-'));
  const legacy = await legacyCandidate(root, '22222222-2222-4222-8222-222222222222.previous');
  await legacyCandidate(root, '33333333-3333-4333-8333-333333333333.previous', 'current');
  const peer = path.join(root, '.claude', 'skills', 'vibe-tether');
  await cp(legacy, peer, { recursive: true });
  await mkdir(path.join(root, '.vibetether'), { recursive: true });
  await writeFile(path.join(root, '.vibetether', 'project.yaml'), YAML.stringify({
    schema_version: 1,
    harnesses: {
      codex: { enabled: true },
      claude: { enabled: true },
    },
  }), 'utf8');
  const peerIdentity = (await inspectVibeTetherIdentity(peer)).installed;

  const plan = await inspectSkillRecovery(root, 'codex');
  assert.equal(plan.kind, 'recoverable-missing-skill');
  assert.equal(plan.sourceIdentity, peerIdentity);
  const [report] = await recoverSkillUpgrades({ root, adapters: ['codex'] });

  const target = path.join(root, '.agents', 'skills', 'vibe-tether');
  assert.equal(report.sourceIdentity, peerIdentity);
  assert.equal(report.targetIdentity, (await inspectVibeTetherIdentity(target)).installed);
  assert.equal((await inspectVibeTetherIdentity(target)).state, 'current');
});

test('multiple candidates without one exact peer match stop as ambiguous instead of using timestamps', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-legacy-recovery-ambiguous-'));
  await legacyCandidate(root, '44444444-4444-4444-8444-444444444444.previous');
  await legacyCandidate(root, '55555555-5555-4555-8555-555555555555.previous', 'current');

  const plan = await inspectSkillRecovery(root, 'codex');
  assert.equal(plan.kind, 'ambiguous-recovery');
  await assert.rejects(
    recoverSkillUpgrades({ root, adapters: ['codex'] }),
    /ambiguous[\s\S]*1\.[\s\S]*2\./i,
  );
  assert.equal(await missing(path.join(root, '.agents', 'skills', 'vibe-tether')), true);
});

test('a modified registered candidate is never restored as canonical', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-legacy-recovery-modified-'));
  const candidate = await legacyCandidate(root, '77777777-7777-4777-8777-777777777777.previous');
  await writeFile(path.join(candidate, 'modified.txt'), 'user customization\n', 'utf8');

  const plan = await inspectSkillRecovery(root, 'codex');
  assert.equal(plan.kind, 'unrecoverable-skill-state');
  await assert.rejects(
    recoverSkillUpgrades({ root, adapters: ['codex'] }),
    /modified.*linked.*unknown|unrecoverable/i,
  );
  assert.equal(await missing(path.join(root, '.agents', 'skills', 'vibe-tether')), true);
});

test('doctor exposes pending and recoverable Skill states with dedicated codes', async () => {
  const pending = await fixture('doctor-pending');
  await assert.rejects(
    replaceCanonicalSkill(pending.request, {
      async rename(from, to) {
        if (from === pending.target && to === pending.paths.retired) throw windowsLockError();
        return rename(from, to);
      },
    }),
    /rerun/i,
  );
  const pendingReport = await doctorReport(pending.root);
  assert.ok([
    ...pendingReport.warnings,
    ...pendingReport.issues,
  ].some(({ code }) => code === 'pending-skill-upgrade'));

  const recoverableRoot = await mkdtemp(path.join(os.tmpdir(), 'vibetether-doctor-recoverable-'));
  await legacyCandidate(recoverableRoot, '66666666-6666-4666-8666-666666666666.previous');
  const recoverableReport = await doctorReport(recoverableRoot);
  assert.ok([
    ...recoverableReport.warnings,
    ...recoverableReport.issues,
  ].some(({ code }) => code === 'recoverable-missing-skill'));
});
