import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runProviderGit, stageProviderSources } from '../src/provider-fetch.mjs';
import { skillFingerprint } from '../src/skill-install.mjs';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

async function fixtureRepository(name = 'provider') {
  const root = await mkdtemp(path.join(os.tmpdir(), `vibetether-${name}-`));
  await mkdir(path.join(root, 'skills', 'demo'), { recursive: true });
  await writeFile(
    path.join(root, 'skills', 'demo', 'SKILL.md'),
    '---\nname: demo\ndescription: Fixture provider.\n---\n\n# Demo\n',
    'utf8',
  );
  await writeFile(path.join(root, 'LICENSE'), 'MIT fixture license\n', 'utf8');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'VibeTether Tests']);
  git(root, ['config', 'user.email', 'tests@example.invalid']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'fixture provider']);
  const commit = git(root, ['rev-parse', 'HEAD']);
  const fingerprint = await skillFingerprint(path.join(root, 'skills', 'demo'));
  return { root, commit, fingerprint };
}

function source(fixture, overrides = {}) {
  return {
    id: 'fixture-source',
    repository: fixture.root,
    ref: fixture.commit,
    commit: fixture.commit,
    license: 'MIT',
    license_path: 'LICENSE',
    skills: [
      {
        id: 'fixture-demo',
        install_name: 'demo',
        path: 'skills/demo',
        fingerprint: fixture.fingerprint,
        capabilities: ['demo'],
      },
    ],
    ...overrides,
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

test('stages an exact commit and verifies the complete skill and license', async () => {
  const fixture = await fixtureRepository('stage');
  const staged = await stageProviderSources([source(fixture)]);
  try {
    assert.equal(staged.repositories.length, 1);
    assert.equal(staged.repositories[0].commit, fixture.commit);
    assert.equal(staged.skills.length, 1);
    assert.equal(staged.skills[0].install_name, 'demo');
    assert.equal(await skillFingerprint(staged.skills[0].source_path), fixture.fingerprint);
    assert.equal(await readFile(staged.repositories[0].license_path, 'utf8'), 'MIT fixture license\n');
    assert.equal(staged.repositories[0].license_content, 'MIT fixture license\n');
    assert.match(staged.repositories[0].license_sha256, /^[a-f0-9]{64}$/);
  } finally {
    await staged.cleanup();
  }
  assert.equal(await exists(staged.staging_root), false);
});

test('rejects a source skill whose fingerprint differs from the audited registry', async () => {
  const fixture = await fixtureRepository('fingerprint');
  const bad = source(fixture);
  bad.skills[0].fingerprint = '0'.repeat(64);

  await assert.rejects(() => stageProviderSources([bad]), /fingerprint mismatch/i);
});

test('rejects skill and license paths that escape the checked-out source', async () => {
  const fixture = await fixtureRepository('escape');
  const escapedSkill = source(fixture);
  escapedSkill.skills[0].path = '../outside';
  await assert.rejects(() => stageProviderSources([escapedSkill]), /escapes/i);

  const escapedLicense = source(fixture, { license_path: '../LICENSE' });
  await assert.rejects(() => stageProviderSources([escapedLicense]), /escapes/i);
});

test('rejects missing licenses and unknown commits without leaving staging directories', async () => {
  const fixture = await fixtureRepository('fail-clean');
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'vibetether-provider-parent-'));
  const missingLicense = source(fixture, { license_path: 'MISSING' });
  await assert.rejects(() => stageProviderSources([missingLicense], { tempRoot }), /license/i);
  assert.deepEqual(await (await import('node:fs/promises')).readdir(tempRoot), []);

  const unknown = source(fixture, { commit: 'f'.repeat(40) });
  await assert.rejects(() => stageProviderSources([unknown], { tempRoot }), /git fetch|commit/i);
  assert.deepEqual(await (await import('node:fs/promises')).readdir(tempRoot), []);
});

test('retries only the Windows Schannel credential failure with the OpenSSL Git backend', () => {
  const calls = [];
  const execute = (_command, args) => {
    calls.push(args);
    if (calls.length === 1) {
      return {
        status: 128,
        stdout: '',
        stderr: 'fatal: schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS',
      };
    }
    return { status: 0, stdout: 'ok\n', stderr: '' };
  };

  const result = runProviderGit('fixture', 'disabled-hooks', ['fetch', 'origin', 'abc'], execute);

  assert.equal(result, 'ok');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].includes('http.sslBackend=openssl'), false);
  assert.equal(calls[1].includes('http.sslBackend=openssl'), true);
});
