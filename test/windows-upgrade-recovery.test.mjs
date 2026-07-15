import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { applyInitialization } from '../src/init.mjs';
import { inspectVibeTetherIdentity, sourceSkill } from '../src/skill-install.mjs';
import {
  replaceCanonicalSkill,
  skillUpgradePaths,
} from '../src/skill-upgrade-recovery.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const public021 = '1f6444567873b5d1abd3371c45df19db23054ec9';

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
