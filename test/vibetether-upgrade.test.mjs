import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { initialize } from '../src/init.mjs';
import { inspectProject } from '../src/doctor.mjs';
import { inspectVibeTetherIdentity } from '../src/skill-install.mjs';
import { uninstall } from '../src/uninstall.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const public021 = '1f6444567873b5d1abd3371c45df19db23054ec9';

function git(args, { encoding = 'utf8' } = {}) {
  const result = spawnSync('git', args, { cwd: repository, encoding });
  assert.equal(result.status, 0, result.stderr?.toString() || result.stdout?.toString());
  return result.stdout;
}

async function materializeSkillAtCommit(commit, destination) {
  const listing = git(['ls-tree', '-r', '-z', '--full-tree', '--name-only', commit, '--', 'skills/vibe-tether']);
  const paths = listing.split('\0').filter(Boolean);
  assert.ok(paths.length > 0, `historical Skill tree must exist at ${commit}`);
  for (const sourcePath of paths) {
    const relativePath = sourcePath.slice('skills/vibe-tether/'.length);
    const target = path.join(destination, ...relativePath.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, git(['show', `${commit}:${sourcePath}`], { encoding: 'buffer' }));
  }
}

async function convertTreeToCrLf(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await convertTreeToCrLf(target);
      continue;
    }
    const source = await readFile(target, 'utf8');
    await writeFile(target, source.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'), 'utf8');
  }
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

async function snapshotProject(root) {
  const snapshot = {};
  async function visit(current, relative = '') {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(child, childRelative);
      else snapshot[childRelative] = await readFile(child);
    }
  }
  await visit(root);
  return snapshot;
}

async function legacyProject(agent, { crlf = false } = {}) {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vibetether-upgrade-021-'));
  await initialize({ project: target, agent, profile: 'core', dryRun: false, yes: true });
  const paths = agent === 'both'
    ? ['.agents/skills/vibe-tether', '.claude/skills/vibe-tether']
    : [agent === 'codex' ? '.agents/skills/vibe-tether' : '.claude/skills/vibe-tether'];
  for (const relativePath of paths) {
    const destination = path.join(target, ...relativePath.split('/'));
    await rm(destination, { recursive: true, force: true });
    await materializeSkillAtCommit(public021, destination);
    if (crlf) await convertTreeToCrLf(destination);
    assert.equal((await inspectVibeTetherIdentity(destination)).state, 'legacy');
  }
  return target;
}

test('an exact public 0.2.1 project previews and upgrades both harnesses', async () => {
  const target = await legacyProject('both');
  const before = await snapshotProject(target);

  const preview = await initialize({ project: target, agent: 'both', profile: 'core', dryRun: true, yes: false });
  assert.match(preview, /DRY RUN/);
  assert.deepEqual(await snapshotProject(target), before);

  await initialize({ project: target, agent: 'both', profile: 'core', dryRun: false, yes: true });
  for (const relativePath of ['.agents/skills/vibe-tether', '.claude/skills/vibe-tether']) {
    assert.equal((await inspectVibeTetherIdentity(path.join(target, ...relativePath.split('/')))).state, 'current');
  }
});

test('doctor and bootstrap accept exact registered history but reject a changed legacy copy', async () => {
  const target = await legacyProject('codex');
  const report = JSON.parse(await inspectProject({ project: target, json: true }));
  assert.equal(report.issues.some((entry) => entry.code === 'changed-skill'), false);
  assert.equal(report.warnings.some((entry) => entry.code === 'legacy-skill'), true);
  await initialize({
    project: target,
    agent: 'codex',
    profile: 'core',
    bootstrapOnly: true,
    dryRun: true,
    yes: false,
  });

  await writeFile(path.join(target, '.agents', 'skills', 'vibe-tether', 'changed.txt'), 'user change\n');
  await assert.rejects(
    initialize({
      project: target,
      agent: 'codex',
      profile: 'core',
      bootstrapOnly: true,
      dryRun: true,
      yes: false,
    }),
    /canonical|legacy|modified|fingerprint/i,
  );
});

test('uninstall previews and removes an exact public 0.2.1 copy', async () => {
  const target = await legacyProject('codex');
  const preview = await uninstall({ project: target, dryRun: true, yes: false });
  assert.match(preview, /DRY RUN/);
  await uninstall({ project: target, dryRun: false, yes: true });
  assert.equal(await exists(path.join(target, '.agents', 'skills', 'vibe-tether')), false);
});

test('CRLF-only public 0.2.1 copies pass the full lifecycle matrix', async () => {
  const authorityTarget = await legacyProject('codex', { crlf: true });
  const report = JSON.parse(await inspectProject({ project: authorityTarget, json: true }));
  assert.equal(report.issues.some((entry) => entry.code === 'changed-skill'), false);
  assert.equal(report.warnings.some((entry) => entry.code === 'legacy-skill'), true);
  await initialize({
    project: authorityTarget,
    agent: 'codex',
    profile: 'core',
    bootstrapOnly: true,
    dryRun: true,
    yes: false,
  });

  const upgradeTarget = await legacyProject('both', { crlf: true });
  const upgradeBefore = await snapshotProject(upgradeTarget);
  const upgradePreview = await initialize({
    project: upgradeTarget,
    agent: 'both',
    profile: 'core',
    dryRun: true,
    yes: false,
  });
  assert.match(upgradePreview, /DRY RUN/);
  assert.deepEqual(await snapshotProject(upgradeTarget), upgradeBefore);
  await initialize({ project: upgradeTarget, agent: 'both', profile: 'core', dryRun: false, yes: true });
  for (const relativePath of ['.agents/skills/vibe-tether', '.claude/skills/vibe-tether']) {
    assert.equal((await inspectVibeTetherIdentity(path.join(upgradeTarget, ...relativePath.split('/')))).state, 'current');
  }

  const uninstallTarget = await legacyProject('codex', { crlf: true });
  const uninstallBefore = await snapshotProject(uninstallTarget);
  const uninstallPreview = await uninstall({ project: uninstallTarget, dryRun: true, yes: false });
  assert.match(uninstallPreview, /DRY RUN/);
  assert.deepEqual(await snapshotProject(uninstallTarget), uninstallBefore);
  await uninstall({ project: uninstallTarget, dryRun: false, yes: true });
  assert.equal(await exists(path.join(uninstallTarget, '.agents', 'skills', 'vibe-tether')), false);
});

test('changed public 0.2.1 copies are refused by destructive lifecycle commands without writes', async () => {
  const target = await legacyProject('codex');
  await writeFile(path.join(target, '.agents', 'skills', 'vibe-tether', 'changed.txt'), 'user change\n');
  const changed = await snapshotProject(target);

  await assert.rejects(
    initialize({ project: target, agent: 'codex', profile: 'core', dryRun: false, yes: true }),
    /modified|fingerprint|different/i,
  );
  assert.deepEqual(await snapshotProject(target), changed);

  await assert.rejects(
    uninstall({ project: target, dryRun: false, yes: true }),
    /modified|fingerprint|different/i,
  );
  assert.deepEqual(await snapshotProject(target), changed);
});
