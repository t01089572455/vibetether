import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyUninstallPlans } from '../src/uninstall.mjs';
import { writeAtomic } from '../src/files.mjs';

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test('quarantine cleanup failure happens after commit and is reported without rollback data loss', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-uninstall-transaction-'));
  const instructions = path.join(root, 'AGENTS.md');
  await writeFile(instructions, '# Before\nmanaged\n', 'utf8');
  const firstSkill = path.join(root, '.agents', 'skills', 'vibe-tether');
  const secondSkill = path.join(root, '.claude', 'skills', 'vibe-tether');
  const quarantineRoot = path.join(root, '.vibetether', 'quarantine');
  for (const skill of [firstSkill, secondSkill]) {
    await mkdir(skill, { recursive: true });
    await writeFile(path.join(skill, 'SKILL.md'), 'canonical\n', 'utf8');
  }

  let quarantinePurges = 0;
  const cleanupFailure = new Error('injected quarantine cleanup failure');
  const operations = {
    writeAtomic,
    rm: async (target, options) => {
      if (options?.recursive && target.endsWith('.remove')) {
        quarantinePurges += 1;
        if (quarantinePurges === 2) throw cleanupFailure;
      }
      return rm(target, options);
    },
  };

  const failures = await applyUninstallPlans(
    [{ target: instructions, original: '# Before\nmanaged\n', content: '# Before\n', removeFile: false }],
    [
      { target: firstSkill, quarantineRoot },
      { target: secondSkill, quarantineRoot },
    ],
    operations,
  );

  assert.equal(await readFile(instructions, 'utf8'), '# Before\n');
  assert.equal(await exists(firstSkill), false);
  assert.equal(await exists(secondSkill), false);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].error, cleanupFailure);
  assert.equal(await exists(failures[0].quarantine), true);
  assert.equal(path.dirname(failures[0].quarantine), quarantineRoot);
  assert.equal(failures[0].quarantine.includes(`${path.sep}.agents${path.sep}skills${path.sep}`), false);
  assert.equal(failures[0].quarantine.includes(`${path.sep}.claude${path.sep}skills${path.sep}`), false);
});
