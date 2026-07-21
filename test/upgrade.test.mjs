import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { VERSION, MANAGED_START, MANAGED_END } from '../src/constants.mjs';
import { managedBlock } from '../src/adapters.mjs';
import { discoverContract } from '../src/contract.mjs';
import { exists, hashTree, sha256File } from '../src/files.mjs';
import { renderProjectLauncher } from '../src/launcher.mjs';
import { planUpgrade, upgradeProject, rollbackUpgrade } from '../src/upgrade.mjs';
import { initProject, jsonFile, writeJson } from './helpers.mjs';

const RC1_BODY = `Use the \`vibe-tether\` Skill at task entry, after compaction or resume, before a consequential decision, and before completion or handoff.\n\nRun \`vibetether context --boundary <boundary> --json\` before reading VibeTether state. Follow only its confirmed truth handles, current slice, blockers, selected provider, and fresh applicable experience.\n\nDo not read raw VibeTether runtime state, provider catalogs, unselected Skills, or unselected experience. Do not alter project direction or activate project truth without the required user confirmation.`;
const RC1_BLOCK = `${MANAGED_START}\n${RC1_BODY}\n${MANAGED_END}`;
const UPGRADE_SURFACE = [
  '.vibetether/project.json', '.vibetether/vt.mjs',
  'AGENTS.md', 'CLAUDE.md',
  '.agents/skills/vibe-tether', '.agents/skills/vibe-tether-deep',
  '.claude/skills/vibe-tether', '.claude/skills/vibe-tether-deep',
];

async function inventory(root, paths = UPGRADE_SURFACE) {
  const result = {};
  for (const relative of paths) {
    const target = path.join(root, ...relative.split('/'));
    if (!await exists(target)) { result[relative] = { existed: false }; continue; }
    const stats = await import('node:fs/promises').then(({ lstat }) => lstat(target));
    result[relative] = stats.isDirectory()
      ? { existed: true, kind: 'directory', digest: await hashTree(target) }
      : { existed: true, kind: 'file', digest: await sha256File(target) };
  }
  return result;
}

function replaceBlock(source, block) {
  const start = source.indexOf(MANAGED_START);
  const end = source.indexOf(MANAGED_END, start) + MANAGED_END.length;
  return `${source.slice(0, start)}${block}${source.slice(end)}`;
}

async function downgradeToRc1(root, { agent = 'both' } = {}) {
  const manifestPath = path.join(root, '.vibetether', 'project.json');
  const manifest = await jsonFile(manifestPath);
  manifest.vibetether_version = '1.0.0-rc.1';
  manifest.control_generation = '11111111-1111-4111-8111-111111111111';
  await writeJson(manifestPath, manifest);
  await writeFile(path.join(root, '.vibetether', 'vt.mjs'), renderProjectLauncher('1.0.0-rc.1'), 'utf8');
  const hosts = agent === 'both' ? [['AGENTS.md', '.agents'], ['CLAUDE.md', '.claude']]
    : agent === 'codex' ? [['AGENTS.md', '.agents']] : [['CLAUDE.md', '.claude']];
  for (const [instructions, hostRoot] of hosts) {
    const target = path.join(root, instructions);
    await writeFile(target, replaceBlock(await readFile(target, 'utf8'), RC1_BLOCK), 'utf8');
    await rm(path.join(root, hostRoot, 'skills', 'vibe-tether-deep'), { recursive: true, force: true });
  }
}

test('upgrade is previewable, transactional, launcher-usable offline, and byte-reversible', async () => {
  const { root, state, cache } = await initProject('upgrade-rc1', { agent: 'both' });
  await downgradeToRc1(root);
  const before = await inventory(root);
  const intentBefore = await readFile(path.join(root, '.vibetether', 'intent.md'));

  const preview = await planUpgrade({ project: root, agent: 'both' });
  assert.equal(preview.status, 'preview');
  assert.equal(preview.from_version, '1.0.0-rc.1');
  assert.equal(preview.to_version, VERSION);
  assert.ok(preview.files.includes('.vibetether/project.json'));
  assert.ok(preview.files.includes('.agents/skills/vibe-tether-deep/SKILL.md'));

  const applied = await upgradeProject({ project: root, agent: 'both', yes: true });
  const context = await discoverContract(root);
  assert.equal(context.manifest.vibetether_version, VERSION);
  assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), new RegExp(managedBlock().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(await exists(path.join(root, '.agents', 'skills', 'vibe-tether-deep', 'SKILL.md')), true);
  assert.deepEqual(await readFile(path.join(root, '.vibetether', 'intent.md')), intentBefore);

  const launcher = spawnSync(process.execPath, [path.join(root, '.vibetether', 'vt.mjs'), '--version'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      VIBETETHER_STATE_HOME: state,
      VIBETETHER_CACHE_HOME: cache,
      VIBETETHER_OFFLINE: '1',
    },
  });
  assert.equal(launcher.status, 0, launcher.stderr || launcher.stdout);
  assert.equal(launcher.stdout.trim(), VERSION);

  await rollbackUpgrade({ id: applied.upgrade_id, yes: true });
  assert.deepEqual(await inventory(root), before);
  assert.deepEqual(await readFile(path.join(root, '.vibetether', 'intent.md')), intentBefore);
});

test('upgrade rollback stops rather than overwriting post-upgrade user edits', async () => {
  const { root } = await initProject('upgrade-conflict', { agent: 'codex' });
  await downgradeToRc1(root, { agent: 'codex' });
  const applied = await upgradeProject({ project: root, agent: 'codex', yes: true });
  await writeFile(path.join(root, 'AGENTS.md'), `${await readFile(path.join(root, 'AGENTS.md'), 'utf8')}\nUser edit after upgrade.\n`, 'utf8');
  await assert.rejects(rollbackUpgrade({ id: applied.upgrade_id, yes: true }), /changed after upgrade|rollback stopped/i);
  assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /User edit after upgrade/);
});

test('upgrade refuses modified managed entry Skill bytes before any write', async () => {
  const { root } = await initProject('upgrade-modified-skill', { agent: 'codex' });
  await downgradeToRc1(root, { agent: 'codex' });
  const manifestBefore = await readFile(path.join(root, '.vibetether', 'project.json'));
  const skill = path.join(root, '.agents', 'skills', 'vibe-tether', 'SKILL.md');
  await writeFile(skill, `${await readFile(skill, 'utf8')}\nUser customization.\n`, 'utf8');
  await assert.rejects(upgradeProject({ project: root, agent: 'codex', yes: true }), /modified|entry Skill|collision/i);
  assert.deepEqual(await readFile(path.join(root, '.vibetether', 'project.json')), manifestBefore);
});

test('fresh initialization leaves a verified offline project launcher', async () => {
  const { root, state, cache } = await initProject('init-offline-launcher', { agent: 'codex' });
  const launcher = spawnSync(process.execPath, [path.join(root, '.vibetether', 'vt.mjs'), '--version'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      VIBETETHER_STATE_HOME: state,
      VIBETETHER_CACHE_HOME: cache,
      VIBETETHER_OFFLINE: '1',
    },
  });
  assert.equal(launcher.status, 0, launcher.stderr || launcher.stdout);
  assert.equal(launcher.stdout.trim(), VERSION);
});
