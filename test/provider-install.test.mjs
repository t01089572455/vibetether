import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  inspectDirectoryInstall,
  installDirectory,
  skillFingerprint,
} from '../src/skill-install.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-directory-install-'));
  const source = path.join(root, 'source');
  const target = path.join(root, 'project', '.agents', 'skills', 'demo');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'SKILL.md'), '---\nname: demo\ndescription: Demo.\n---\n', 'utf8');
  await writeFile(path.join(source, 'reference.md'), '# Complete dependency\n', 'utf8');
  return { root, source, target };
}

test('generic installer copies the complete provider directory atomically', async () => {
  const value = await fixture();
  const plan = await inspectDirectoryInstall(value.source, value.target, '.agents/skills/demo');
  assert.deepEqual(plan, { needsInstall: true, ownership: 'vibetether' });

  await installDirectory(value.source, value.target);
  assert.equal(await readFile(path.join(value.target, 'reference.md'), 'utf8'), '# Complete dependency\n');
  assert.equal(await skillFingerprint(value.target), await skillFingerprint(value.source));
});

test('identical pre-existing providers are reused without claiming uninstall ownership', async () => {
  const value = await fixture();
  await mkdir(path.dirname(value.target), { recursive: true });
  await cp(value.source, value.target, { recursive: true });

  const plan = await inspectDirectoryInstall(value.source, value.target, '.agents/skills/demo');
  assert.deepEqual(plan, { needsInstall: false, ownership: 'preexisting' });
});

test('different pre-existing providers stop instead of being overwritten', async () => {
  const value = await fixture();
  await mkdir(value.target, { recursive: true });
  await writeFile(path.join(value.target, 'SKILL.md'), 'custom provider\n', 'utf8');

  await assert.rejects(
    () => inspectDirectoryInstall(value.source, value.target, '.agents/skills/demo'),
    /refusing to overwrite.*provider|modified installed skill/i,
  );
  assert.equal(await readFile(path.join(value.target, 'SKILL.md'), 'utf8'), 'custom provider\n');
});

test('an exact declared legacy fingerprint is upgradeable while other differences remain blocked', async () => {
  const value = await fixture();
  await mkdir(value.target, { recursive: true });
  await writeFile(path.join(value.target, 'SKILL.md'), 'legacy canonical Skill\n', 'utf8');
  const legacyFingerprint = await skillFingerprint(value.target);

  const plan = await inspectDirectoryInstall(value.source, value.target, '.agents/skills/demo', {
    upgradeFingerprints: new Set([legacyFingerprint]),
  });
  assert.deepEqual(plan, { needsInstall: true, ownership: 'vibetether', replacesExisting: true });
});
