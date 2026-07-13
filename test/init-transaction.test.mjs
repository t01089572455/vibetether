import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyInitialization } from '../src/init.mjs';

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test('initialization rolls back earlier text and Skill writes when a later operation fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-transaction-'));
  const instructions = path.join(root, 'AGENTS.md');
  await writeFile(instructions, '# Original\n', 'utf8');
  const firstSkill = path.join(root, '.agents', 'skills', 'vibe-tether');
  const secondSkill = path.join(root, '.claude', 'skills', 'vibe-tether');
  let calls = 0;
  const failingInstaller = async (target) => {
    calls += 1;
    if (calls === 2) throw new Error('injected second-install failure');
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'SKILL.md'), 'temporary\n', 'utf8');
  };

  await assert.rejects(
    applyInitialization(
      root,
      [{ target: instructions, original: '# Original\n', content: '# Changed\n' }],
      [
        { target: firstSkill, needsInstall: true },
        { target: secondSkill, needsInstall: true },
      ],
      failingInstaller,
    ),
    /injected second-install failure/,
  );

  assert.equal(await readFile(instructions, 'utf8'), '# Original\n');
  assert.equal(await exists(`${instructions}.bak`), false);
  assert.equal(await exists(firstSkill), false);
  assert.equal(await exists(secondSkill), false);
});

test('initialization restores a replaced legacy Skill when a later install fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-upgrade-transaction-'));
  const legacySkill = path.join(root, '.agents', 'skills', 'vibe-tether');
  const laterSkill = path.join(root, '.agents', 'skills', 'later');
  await mkdir(legacySkill, { recursive: true });
  await writeFile(path.join(legacySkill, 'SKILL.md'), 'legacy canonical bytes\n', 'utf8');

  await assert.rejects(
    applyInitialization(root, [], [
      {
        target: legacySkill,
        needsInstall: true,
        replacesExisting: true,
        install: async (target) => {
          await mkdir(target, { recursive: true });
          await writeFile(path.join(target, 'SKILL.md'), 'new canonical bytes\n', 'utf8');
        },
      },
      {
        target: laterSkill,
        needsInstall: true,
        install: async () => {
          throw new Error('injected post-upgrade failure');
        },
      },
    ]),
    /injected post-upgrade failure/,
  );

  assert.equal(await readFile(path.join(legacySkill, 'SKILL.md'), 'utf8'), 'legacy canonical bytes\n');
  assert.equal(await exists(laterSkill), false);
});
