import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ADAPTERS, GITIGNORE_BODY } from '../src/adapters.mjs';
import { applyManagedBlock } from '../src/files.mjs';
import { scanProject } from '../src/project-scan.mjs';
import { sourceSkill } from '../src/skill-install.mjs';

async function project(name) {
  return mkdtemp(path.join(os.tmpdir(), `vibetether-scan-${name}-`));
}

async function linkDirectory(target, linkPath) {
  try {
    await symlink(target, linkPath, 'dir');
    return null;
  } catch (error) {
    const permissionDenied = ['EACCES', 'EPERM'].includes(error.code);
    if (process.platform !== 'win32' || !permissionDenied) throw error;
  }

  try {
    await symlink(target, linkPath, 'junction');
    return null;
  } catch (error) {
    if (!['EACCES', 'EPERM'].includes(error.code)) throw error;
    return `Windows denied both directory symlink and junction creation: ${error.code}`;
  }
}

async function managedProject(name) {
  const root = await project(name);
  await mkdir(path.join(root, '.vibetether', 'state'), { recursive: true });
  await mkdir(path.join(root, '.agents', 'skills'), { recursive: true });
  await writeFile(
    path.join(root, '.vibetether', 'project.yaml'),
    JSON.stringify({
      schema_version: 1,
      project_id: `managed-${name}`,
      project_state: 'greenfield',
      profile: 'core',
      intent_contract: '.vibetether/intent.md',
      provider_lock: '.vibetether/providers.lock.yaml',
      harnesses: {
        codex: { enabled: true, instruction_file: 'AGENTS.md' },
      },
    }),
    'utf8',
  );
  await writeFile(
    path.join(root, '.vibetether', 'providers.lock.yaml'),
    JSON.stringify({ schema_version: 2, sources: [], catalog: [], exposures: [], skills: [] }),
    'utf8',
  );
  await writeFile(path.join(root, '.vibetether', 'intent.md'), '# Intent\n', 'utf8');
  await writeFile(path.join(root, '.vibetether', 'state', 'current.yaml'), 'schema_version: 1\n', 'utf8');
  await writeFile(path.join(root, 'AGENTS.md'), applyManagedBlock('', ADAPTERS.codex.managedBody), 'utf8');
  await writeFile(path.join(root, '.gitignore'), applyManagedBlock('', GITIGNORE_BODY), 'utf8');
  await cp(sourceSkill, path.join(root, '.agents', 'skills', 'vibe-tether'), { recursive: true });
  return root;
}

test('project scan emits high-confidence Web bundle signals from package evidence', async () => {
  const root = await project('web');
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { next: '^15.0.0', react: '^19.0.0' } }),
    'utf8',
  );
  await writeFile(path.join(root, 'vercel.json'), '{}\n', 'utf8');

  const manifest = await scanProject(root, ['codex'], 'standard');

  assert.deepEqual(
    manifest.bundle_signals.map(({ bundle, signal, path: signalPath, confidence }) => ({
      bundle,
      signal,
      path: signalPath,
      confidence,
    })),
    [
      { bundle: 'web', signal: 'nextjs', path: 'package.json', confidence: 'high' },
      { bundle: 'web', signal: 'react', path: 'package.json', confidence: 'high' },
      { bundle: 'web', signal: 'vercel', path: 'vercel.json', confidence: 'high' },
    ],
  );
});

test('project scan emits Production signals without enabling a bundle by itself', async () => {
  const root = await project('production');
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  await mkdir(path.join(root, 'migrations'), { recursive: true });

  const manifest = await scanProject(root, ['claude'], 'standard');

  assert.deepEqual(manifest.bundle_signals.map((entry) => entry.signal), ['ci', 'migration']);
  assert.equal(manifest.bundles, undefined);
});

test('project scan routes existing operational proven paths without inventing truth sources', async () => {
  const root = await project('operations');
  await mkdir(path.join(root, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'operations', 'github-publishing.md'), '# GitHub publishing\n', 'utf8');

  const manifest = await scanProject(root, ['codex'], 'core');

  assert.deepEqual(manifest.sources.conditional.operations, ['docs/operations/']);
  assert.deepEqual(manifest.discovery['docs/operations/'], {
    role: 'operational proven paths',
    confidence: 'high',
    kind: 'directory',
  });
});

test('project scan never invents context, ADR, or operations sources for an empty project', async () => {
  const root = await project('no-invented-truth');

  const manifest = await scanProject(root, ['codex'], 'core');

  assert.equal(manifest.sources.always.includes('CONTEXT.md'), false);
  assert.deepEqual(manifest.sources.conditional.architecture, []);
  assert.deepEqual(manifest.sources.conditional.operations, []);
  assert.equal(manifest.discovery['CONTEXT.md'], undefined);
  assert.equal(manifest.discovery['docs/adr/'], undefined);
  assert.equal(manifest.discovery['docs/operations/'], undefined);
});

test('project scan marks only empty or git-only roots as greenfield', async () => {
  const empty = await project('empty');
  const gitOnly = await project('git-only');
  await mkdir(path.join(gitOnly, '.git'));

  assert.equal((await scanProject(empty, ['codex'], 'core')).project_state, 'greenfield');
  assert.equal((await scanProject(gitOnly, ['codex'], 'core')).project_state, 'greenfield');
});

test('project scan marks non-Web package, README, source, and instruction roots as existing', async () => {
  const packageRoot = await project('package-existing');
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'plain-node-project' }), 'utf8');

  const readmeRoot = await project('readme-existing');
  await writeFile(path.join(readmeRoot, 'README.md'), '# Existing project\n', 'utf8');

  const sourceRoot = await project('source-existing');
  await mkdir(path.join(sourceRoot, 'src'));

  const instructionsRoot = await project('instructions-existing');
  await writeFile(path.join(instructionsRoot, 'AGENTS.md'), '# Existing instructions\n', 'utf8');

  for (const root of [packageRoot, readmeRoot, sourceRoot, instructionsRoot]) {
    assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
  }
});

test('project scan keeps verified VibeTether-managed artifacts greenfield', async () => {
  const root = await managedProject('managed-only');

  assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'greenfield');
});

test('project scan detects a real README added to a managed greenfield project', async () => {
  const root = await managedProject('managed-readme');
  await writeFile(path.join(root, 'README.md'), '# Existing project\n', 'utf8');

  assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
});

test('project scan detects an unlisted Skill inside the managed agent directory', async () => {
  const root = await managedProject('unlisted-skill');
  await mkdir(path.join(root, '.agents', 'skills', 'user-skill'), { recursive: true });
  await writeFile(path.join(root, '.agents', 'skills', 'user-skill', 'SKILL.md'), '# User Skill\n', 'utf8');

  assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
});

test('project scan detects arbitrary files inside the VibeTether control directory', async () => {
  const root = await managedProject('control-user-notes');
  await writeFile(path.join(root, '.vibetether', 'USER-NOTES.md'), '# User notes\n', 'utf8');

  assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
});

test('project scan requires reserved control roots to be directories', async (context) => {
  for (const reserved of ['state', 'transaction', 'quarantine']) {
    await context.test(reserved, async () => {
      const root = await managedProject(`control-file-${reserved}`);
      const target = path.join(root, '.vibetether', reserved);
      await rm(target, { recursive: true, force: true });
      await writeFile(target, 'User content\n', 'utf8');

      assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
    });
  }
});

test('project scan treats linked reserved control roots as existing', async (context) => {
  for (const reserved of ['state', 'transaction', 'quarantine']) {
    await context.test(reserved, async (subtest) => {
      const root = await managedProject(`control-link-${reserved}`);
      const target = await project(`control-link-target-${reserved}`);
      const linkPath = path.join(root, '.vibetether', reserved);
      await rm(linkPath, { recursive: true, force: true });
      const skipReason = await linkDirectory(target, linkPath);
      if (skipReason) {
        subtest.skip(skipReason);
        return;
      }

      assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
    });
  }
});

test('project scan detects a modified canonical VibeTether Skill', async () => {
  const root = await managedProject('modified-vibetether-skill');
  const skillPath = path.join(root, '.agents', 'skills', 'vibe-tether', 'SKILL.md');
  await writeFile(skillPath, `${await readFile(skillPath, 'utf8')}\nUser customization.\n`, 'utf8');

  assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
});

test('project scan detects content under a harness not enabled in the persisted manifest', async () => {
  const root = await managedProject('disabled-harness-content');
  await mkdir(path.join(root, '.claude', 'skills'), { recursive: true });
  await cp(sourceSkill, path.join(root, '.claude', 'skills', 'vibe-tether'), { recursive: true });

  assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
});

test('project scan rejects forged provider ownership without complete lock metadata', async () => {
  const root = await managedProject('forged-provider-lock');
  const forged = {
    install_name: 'forged-provider',
    installations: {
      codex: {
        path: '.agents/skills/forged-provider',
        ownership: 'vibetether',
      },
    },
  };
  await mkdir(path.join(root, '.agents', 'skills', 'forged-provider'), { recursive: true });
  await writeFile(
    path.join(root, '.agents', 'skills', 'forged-provider', 'SKILL.md'),
    '# Forged provider\n',
    'utf8',
  );
  await writeFile(
    path.join(root, '.vibetether', 'providers.lock.yaml'),
    JSON.stringify({ schema_version: 2, sources: [], catalog: [], exposures: [forged], skills: [forged] }),
    'utf8',
  );

  assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
});

test('project scan detects user content outside a valid managed instruction block', async () => {
  const root = await managedProject('instruction-content');
  const instructions = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
  await writeFile(path.join(root, 'AGENTS.md'), `# User instructions\n\n${instructions}`, 'utf8');

  assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
});

test('project scan treats malformed VibeTether manifest, lock, and markers as existing', async () => {
  const malformedManifest = await managedProject('malformed-manifest');
  await writeFile(path.join(malformedManifest, '.vibetether', 'project.yaml'), 'schema_version: [\n', 'utf8');

  const malformedLock = await managedProject('malformed-lock');
  await writeFile(path.join(malformedLock, '.vibetether', 'providers.lock.yaml'), 'schema_version: nope\n', 'utf8');

  const malformedMarkers = await managedProject('malformed-markers');
  await writeFile(path.join(malformedMarkers, 'AGENTS.md'), '<!-- vibetether:start -->\nmissing end\n', 'utf8');

  for (const root of [malformedManifest, malformedLock, malformedMarkers]) {
    assert.equal((await scanProject(root, ['codex'], 'core')).project_state, 'existing');
  }
});
