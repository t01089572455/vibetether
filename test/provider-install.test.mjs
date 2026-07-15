import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as skillInstall from '../src/skill-install.mjs';

const {
  inspectDirectoryInstall,
  installDirectory,
  skillFingerprint,
} = skillInstall;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-directory-install-'));
  const source = path.join(root, 'source');
  const target = path.join(root, 'project', '.agents', 'skills', 'demo');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'SKILL.md'), '---\nname: demo\ndescription: Demo.\n---\n', 'utf8');
  await writeFile(path.join(source, 'reference.md'), '# Complete dependency\n', 'utf8');
  return { root, source, target };
}

async function convertTreeToCrlf(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await convertTreeToCrlf(target);
      continue;
    }
    const bytes = await readFile(target);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) continue;
    await writeFile(target, text.replace(/(?<!\r)\n/g, '\r\n'));
  }
}

async function convertTreeToLf(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await convertTreeToLf(target);
      continue;
    }
    const bytes = await readFile(target);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) continue;
    await writeFile(target, text.replaceAll('\r\n', '\n'));
  }
}

test('generic installer publishes the complete provider directory', async () => {
  const value = await fixture();
  const plan = await inspectDirectoryInstall(value.source, value.target, '.agents/skills/demo');
  assert.deepEqual(plan, { needsInstall: true, ownership: 'vibetether' });

  await installDirectory(value.source, value.target);
  assert.equal(await readFile(path.join(value.target, 'reference.md'), 'utf8'), '# Complete dependency\n');
  assert.equal(await skillFingerprint(value.target), await skillFingerprint(value.source));
});

test('first install writes the Skill activation marker last without a canonical rename', async () => {
  const value = await fixture();
  const copies = [];
  const canonicalRenames = [];

  await installDirectory(value.source, value.target, {
    async cp(from, to, options) {
      copies.push({ from, to });
      return cp(from, to, options);
    },
    async rename(from, to) {
      if (to === value.target) canonicalRenames.push({ from, to });
      return rename(from, to);
    },
  });

  assert.deepEqual(canonicalRenames, []);
  assert.equal(path.basename(copies.at(-1).from), 'SKILL.md');
  assert.equal(copies.at(-1).to, path.join(value.target, 'SKILL.md'));
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

test('portable core fingerprints ignore CRLF while raw provider fingerprints remain strict', async () => {
  assert.equal(typeof skillInstall.portableSkillFingerprint, 'function');
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-crlf-'));
  const lfSource = path.join(root, 'vibe-tether-lf');
  const target = path.join(root, 'vibe-tether');
  await cp(skillInstall.sourceSkill, lfSource, { recursive: true });
  await convertTreeToLf(lfSource);
  await cp(lfSource, target, { recursive: true });
  await convertTreeToCrlf(target);

  assert.notEqual(await skillFingerprint(target), await skillFingerprint(lfSource));
  assert.equal(
    await skillInstall.portableSkillFingerprint(target),
    await skillInstall.portableSkillFingerprint(lfSource),
  );
  assert.equal((await skillInstall.inspectVibeTetherIdentity(target)).state, 'current');
});

test('portable core identity rejects a substantive change after CRLF conversion', async () => {
  assert.equal(typeof skillInstall.inspectVibeTetherIdentity, 'function');
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-crlf-changed-'));
  const target = path.join(root, 'vibe-tether');
  await cp(skillInstall.sourceSkill, target, { recursive: true });
  await convertTreeToCrlf(target);
  await writeFile(path.join(target, 'changed.txt'), 'substantive change\r\n', 'utf8');

  assert.equal((await skillInstall.inspectVibeTetherIdentity(target)).state, 'unknown');
});
