import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { runProviderGit, stageProviderSources } from '../src/provider-fetch.mjs';
import { skillFingerprint } from '../src/skill-install.mjs';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

async function fixtureRepository(name = 'provider', skillNames = ['demo']) {
  const root = await mkdtemp(path.join(os.tmpdir(), `vibetether-${name}-`));
  for (const skillName of skillNames) {
    await mkdir(path.join(root, 'skills', skillName), { recursive: true });
    await writeFile(
      path.join(root, 'skills', skillName, 'SKILL.md'),
      `---\nname: ${skillName}\ndescription: Fixture provider.\n---\n\n# ${skillName}\n`,
      'utf8',
    );
  }
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

test('provider staging is fingerprint-stable when host Git enables autocrlf', async () => {
  const names = ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.GIT_CONFIG_COUNT = '1';
  process.env.GIT_CONFIG_KEY_0 = 'core.autocrlf';
  process.env.GIT_CONFIG_VALUE_0 = 'true';

  try {
    const fixture = await fixtureRepository('autocrlf');
    const staged = await stageProviderSources([source(fixture)]);
    try {
      assert.equal(await skillFingerprint(staged.skills[0].source_path), fixture.fingerprint);
      assert.equal(await readFile(staged.repositories[0].license_path, 'utf8'), 'MIT fixture license\n');
    } finally {
      await staged.cleanup();
    }
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});

test('complete catalogs reject undeclared upstream Skill directories', async () => {
  const fixture = await fixtureRepository('complete-catalog', ['demo', 'extra']);
  const complete = source(fixture, { catalog_mode: 'complete', skill_root: 'skills' });

  await assert.rejects(() => stageProviderSources([complete]), /undeclared.*extra/i);
});

test('stages a pinned README license declaration without fabricating full license text', async () => {
  const fixture = await fixtureRepository('declared-license');
  await rm(path.join(fixture.root, 'LICENSE'));
  await writeFile(path.join(fixture.root, 'README.md'), '# Provider\n\n## License\n\nMIT\n', 'utf8');
  git(fixture.root, ['add', '-A']);
  git(fixture.root, ['commit', '-qm', 'declare license in readme']);
  fixture.commit = git(fixture.root, ['rev-parse', 'HEAD']);
  const declared = source(fixture, {
    license_path: undefined,
    license_evidence: {
      mode: 'readme-declaration',
      path: 'README.md',
      declaration: '## License\n\nMIT',
      sha256: createHash('sha256').update('# Provider\n\n## License\n\nMIT\n').digest('hex'),
    },
  });

  const staged = await stageProviderSources([declared]);
  try {
    assert.equal(staged.repositories[0].license_evidence.mode, 'readme-declaration');
    assert.equal(staged.repositories[0].license_content, undefined);
    assert.match(staged.warnings[0], /complete license text is not present/i);
  } finally {
    await staged.cleanup();
  }
});

test('rejects a changed pinned README license-evidence fingerprint', async () => {
  const fixture = await fixtureRepository('declared-license-fingerprint');
  await writeFile(path.join(fixture.root, 'README.md'), '# Provider\n\n## License\n\nMIT\n', 'utf8');
  git(fixture.root, ['add', 'README.md']);
  git(fixture.root, ['commit', '-qm', 'add license declaration']);
  fixture.commit = git(fixture.root, ['rev-parse', 'HEAD']);
  const declared = source(fixture, {
    license_evidence: {
      mode: 'readme-declaration',
      path: 'README.md',
      declaration: '## License\n\nMIT',
      sha256: '0'.repeat(64),
    },
  });

  await assert.rejects(() => stageProviderSources([declared]), /license evidence fingerprint mismatch/i);
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

test('retries a Windows Schannel TLS handshake failure with the OpenSSL Git backend', () => {
  const calls = [];
  const execute = (_command, args) => {
    calls.push(args);
    if (calls.length === 1) {
      return {
        status: 128,
        stdout: '',
        stderr: "fatal: unable to access 'https://github.com/vercel-labs/agent-skills.git/': schannel: failed to receive handshake, SSL/TLS connection failed",
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

test('retries the exact OpenSSL TLS EOF provider failure and then succeeds', () => {
  const calls = [];
  const delays = [];
  const execute = (_command, args) => {
    calls.push(args);
    if (calls.length === 1) {
      return {
        status: 128,
        stdout: '',
        stderr: "fatal: unable to access 'https://github.com/multica-ai/andrej-karpathy-skills.git/': TLS connect error: error:0A000126:SSL routines::unexpected eof while reading",
      };
    }
    return { status: 0, stdout: 'ok\n', stderr: '' };
  };

  const result = runProviderGit(
    'fixture',
    'disabled-hooks',
    ['fetch', '--depth', '1', 'origin', 'abc'],
    execute,
    { sleep: (milliseconds) => delays.push(milliseconds) },
  );

  assert.equal(result, 'ok');
  assert.equal(calls.length, 2);
  assert.deepEqual(delays, [200]);
});

test('keeps OpenSSL after Schannel failure and retries a later TLS EOF', () => {
  const calls = [];
  const execute = (_command, args) => {
    calls.push(args);
    if (calls.length === 1) {
      return {
        status: 128,
        stdout: '',
        stderr: 'fatal: schannel: failed to receive handshake, SSL/TLS connection failed',
      };
    }
    if (calls.length === 2) {
      return {
        status: 128,
        stdout: '',
        stderr: 'fatal: TLS connect error: unexpected eof while reading',
      };
    }
    return { status: 0, stdout: 'ok\n', stderr: '' };
  };

  const result = runProviderGit(
    'fixture',
    'disabled-hooks',
    ['fetch', 'origin', 'abc'],
    execute,
    { sleep: () => {} },
  );

  assert.equal(result, 'ok');
  assert.equal(calls.length, 3);
  assert.equal(calls[0].includes('http.sslBackend=openssl'), false);
  assert.equal(calls[1].includes('http.sslBackend=openssl'), true);
  assert.equal(calls[2].includes('http.sslBackend=openssl'), true);
});

test('bounds transient provider fetch retries and explains that project files were unchanged', () => {
  let calls = 0;
  const execute = () => {
    calls += 1;
    return { status: 128, stdout: '', stderr: 'fatal: TLS connect error: unexpected eof while reading' };
  };

  assert.throws(
    () => runProviderGit(
      'fixture',
      'disabled-hooks',
      ['fetch', 'origin', 'abc'],
      execute,
      { sleep: () => {} },
    ),
    /after 3 attempts.*retry the same command.*no project files were changed/is,
  );
  assert.equal(calls, 3);
});

test('does not retry non-transient or non-fetch Git failures', () => {
  for (const [args, detail] of [
    [['fetch', 'origin', 'abc'], 'fatal: repository not found'],
    [['fetch', 'origin', 'abc'], 'fatal: Authentication failed'],
    [['checkout', '--detach', 'FETCH_HEAD'], 'fatal: TLS connect error: unexpected eof while reading'],
  ]) {
    let calls = 0;
    const execute = () => {
      calls += 1;
      return { status: 128, stdout: '', stderr: detail };
    };
    assert.throws(
      () => runProviderGit('fixture', 'disabled-hooks', args, execute, { sleep: () => {} }),
      /Provider git/i,
    );
    assert.equal(calls, 1);
  }
});
