import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  EMPTY_EXPERIENCE_INDEX,
  matchExperience,
  parseExperienceIndex,
  serializeExperienceIndex,
  validateExperienceIndex,
} from '../src/experience-index.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-experience-'));
  await mkdir(path.join(root, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'operations', 'github-publishing.md'), '# GitHub publishing\n');
  return root;
}

async function writeArtifact(root, relativePath, content = 'credential-like test fixture\n') {
  const target = path.join(root, ...relativePath.replaceAll('\\', '/').split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
  return target;
}

function entry(overrides = {}) {
  return {
    id: 'github-publication',
    use_when: ['github', 'publish', 'release'],
    systems: ['git', 'windows'],
    artifacts: ['docs/operations/github-publishing.md'],
    verified_at: '2026-07-13',
    revalidate_when: ['authentication-method-changes', 'remote-changes'],
    status: 'proven',
    ...overrides,
  };
}

function index(entries = [entry()]) {
  return { schema_version: 1, entries };
}

test('empty experience index is deeply immutable and has stable canonical serialization', () => {
  assert.equal(Object.isFrozen(EMPTY_EXPERIENCE_INDEX), true);
  assert.equal(Object.isFrozen(EMPTY_EXPERIENCE_INDEX.entries), true);
  assert.throws(() => EMPTY_EXPERIENCE_INDEX.entries.push(entry()), TypeError);

  const serialized = serializeExperienceIndex(EMPTY_EXPERIENCE_INDEX);
  assert.equal(serialized, 'schema_version: 1\nentries: []\n');
  assert.deepEqual(parseExperienceIndex(serialized), EMPTY_EXPERIENCE_INDEX);
  assert.equal(serializeExperienceIndex(parseExperienceIndex(serialized)), serialized);
});

test('parse and serialize reject unknown fields instead of silently normalizing them', () => {
  assert.throws(
    () => parseExperienceIndex('schema_version: 1\nentries: []\nnotes: hidden\n'),
    /unexpected field.*notes/i,
  );
  assert.throws(
    () => serializeExperienceIndex(index([entry({ transcript: 'command output' })])),
    /unexpected field.*transcript/i,
  );
});

test('schema accepts only complete normalized entries with unique IDs and signals', async () => {
  const root = await fixture();
  assert.deepEqual(await validateExperienceIndex(index(), root), index());

  await assert.rejects(
    validateExperienceIndex(index([entry({ id: 'GitHub Publication' })]), root),
    /invalid normalized.*id|id.*normalized/i,
  );
  await assert.rejects(
    validateExperienceIndex(index([entry(), entry({ id: 'github-publication' })]), root),
    /duplicated.*github-publication|github-publication.*duplicated/i,
  );
  await assert.rejects(
    validateExperienceIndex(index([entry({ use_when: ['publish', 'Publish'] })]), root),
    /invalid normalized signal.*Publish/i,
  );
  await assert.rejects(
    validateExperienceIndex(index([entry({ use_when: ['publish', 'publish'] })]), root),
    /duplicated.*signal.*publish|signal.*publish.*duplicated/i,
  );
  await assert.rejects(
    validateExperienceIndex(index([entry({ use_when: ['publish'], systems: ['publish'] })]), root),
    /duplicated.*signal.*publish|signal.*publish.*duplicated/i,
  );
  await assert.rejects(
    validateExperienceIndex(index([entry({ artifacts: [] })]), root),
    /artifacts.*non-empty/i,
  );
  await assert.rejects(
    validateExperienceIndex(index([entry({ revalidate_when: undefined })]), root),
    /revalidate_when.*array/i,
  );
});

test('schema rejects impossible calendar dates rather than relying on date normalization', async () => {
  const root = await fixture();
  await assert.rejects(
    validateExperienceIndex(index([entry({ verified_at: '2026-02-30' })]), root),
    /invalid verified_at/i,
  );
  await assert.rejects(
    validateExperienceIndex(index([entry({ verified_at: '2025-02-29' })]), root),
    /invalid verified_at/i,
  );
  assert.equal(
    (await validateExperienceIndex(index([entry({ verified_at: '2024-02-29' })]), root)).entries[0].verified_at,
    '2024-02-29',
  );
});

test('schema rejects escaping, missing, and secret-bearing artifact metadata', async () => {
  const root = await fixture();
  await assert.rejects(
    validateExperienceIndex(index([entry({ artifacts: ['../secret.md'] })]), root),
    /escapes the project|outside project/i,
  );
  await assert.rejects(
    validateExperienceIndex(index([entry({ artifacts: ['docs/operations/missing.md'] })]), root),
    /missing\.md|does not exist/i,
  );
  await assert.rejects(
    validateExperienceIndex(index([entry({ artifacts: ['.env'] })]), root),
    /credential|secret-bearing/i,
  );
  await assert.rejects(
    validateExperienceIndex(index([entry({ use_when: ['ghp_abcdefghijklmnopqrstuvwxyz123456'] })]), root),
    /secret-bearing/i,
  );
});

test('validation rejects credential path segments and modern token values without blocking benign authentication docs', async () => {
  const root = await fixture();
  await writeArtifact(root, 'docs/operations/authentication.md', '# Authentication workflow\n');
  const safe = index([entry({
    id: 'authentication-workflow',
    use_when: ['authentication'],
    systems: [],
    artifacts: ['docs/operations/authentication.md'],
  })]);
  assert.deepEqual(await validateExperienceIndex(safe, root), safe);

  const sensitivePaths = [
    '.npmrc',
    '.netrc',
    '.env',
    '.env.local',
    '.envrc',
    'config/secrets.yaml',
    'config/secrets-production/runbook.md',
    'config/secretsStore.yaml',
    'config/tokens.json',
    'config/tokensBackup.json',
    'config/credentials-prod.json',
    'config/credentialsVault.json',
    'keys/id_ed25519',
    'certs/client.key',
    'certs/client.pem',
    'certs/client.p12',
    'certs/client.pfx',
    'certs/client.crt',
  ];
  for (const artifact of sensitivePaths) {
    await writeArtifact(root, artifact);
    await assert.rejects(
      validateExperienceIndex(index([entry({ artifacts: [artifact] })]), root),
      /secret-bearing|credential/i,
      artifact,
    );
  }

  const tokenValues = [
    ['github', 'pat', 'A'.repeat(30)].join('_'),
    ['xoxb', '123456789012', 'a'.repeat(24)].join('-'),
    `glpat-${'b'.repeat(24)}`,
  ];
  for (const token of tokenValues) {
    const artifact = `docs/operations/${token}.md`;
    await writeArtifact(root, artifact);
    await assert.rejects(
      validateExperienceIndex(index([entry({ artifacts: [artifact] })]), root),
      /secret-bearing/i,
    );
  }
});

test('schema rejects artifact symlinks even when they resolve inside the project', async (context) => {
  const root = await fixture();
  const link = path.join(root, 'docs', 'operations', 'linked.md');
  try {
    await symlink(path.join(root, 'docs', 'operations', 'github-publishing.md'), link, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
      context.skip(`Windows denied symlink creation: ${error.code}`);
      return;
    }
    throw error;
  }

  await assert.rejects(
    validateExperienceIndex(index([entry({ artifacts: ['docs/operations/linked.md'] })]), root),
    /symbolic-link/i,
  );
});

test('exact normalized matches are deterministic and metadata-only', async () => {
  const root = await fixture();
  const result = await matchExperience(index(), { root, signals: [' Publish ', 'WINDOWS', 'publish'] });
  assert.deepEqual(result, [{
    id: 'github-publication',
    status: 'proven',
    match_count: 2,
    artifacts: ['docs/operations/github-publishing.md'],
    verified_at: '2026-07-13',
    requires_revalidation: false,
    revalidation_reasons: [],
  }]);
  assert.equal(JSON.stringify(result).includes('# GitHub publishing'), false);
});

test('unrelated, obsolete, and missing-artifact experience is omitted', async () => {
  const root = await fixture();
  assert.deepEqual(await matchExperience(index(), { root, signals: ['database'] }), []);
  assert.deepEqual(
    await matchExperience(index([entry({ status: 'obsolete' })]), { root, signals: ['publish'] }),
    [],
  );
  assert.deepEqual(
    await matchExperience(index([entry({ artifacts: ['docs/operations/missing.md'] })]), { root, signals: ['publish'] }),
    [],
  );
});

test('matching isolates lexical, missing, and credential-bearing artifacts while preserving safe matches', async () => {
  const root = await fixture();
  const outside = path.resolve(root, '..', `outside-${path.basename(root)}.md`);
  await writeFile(outside, '# Outside must never be followed\n', 'utf8');
  await writeArtifact(root, '.npmrc');
  const githubToken = ['github', 'pat', 'C'.repeat(30)].join('_');
  await writeArtifact(root, `docs/operations/${githubToken}.md`);

  const result = await matchExperience(index([
    entry({ id: 'safe-publication', verified_at: '2026-07-14' }),
    entry({ id: 'escaping-artifact', artifacts: [`../${path.basename(outside)}`] }),
    entry({ id: 'absolute-artifact', artifacts: [outside] }),
    entry({ id: 'unc-artifact', artifacts: ['\\\\server\\share\\operations.md'] }),
    entry({ id: 'missing-artifact', artifacts: ['docs/operations/missing.md'] }),
    entry({ id: 'credential-artifact', artifacts: ['.npmrc'] }),
    entry({ id: 'token-artifact', artifacts: [`docs/operations/${githubToken}.md`] }),
  ]), { root, signals: ['publish'] });

  assert.deepEqual(result.map(({ id }) => id), ['safe-publication']);
});

test('matching omits a symlinked artifact entry without hiding a safe match', async (context) => {
  const root = await fixture();
  const outside = path.resolve(root, '..', `linked-outside-${path.basename(root)}.md`);
  await writeFile(outside, '# Linked outside\n', 'utf8');
  try {
    await symlink(outside, path.join(root, 'docs', 'operations', 'linked-outside.md'), 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
      context.skip(`Windows denied symlink creation: ${error.code}`);
      return;
    }
    throw error;
  }

  const result = await matchExperience(index([
    entry({ id: 'safe-publication' }),
    entry({ id: 'linked-artifact', artifacts: ['docs/operations/linked-outside.md'] }),
  ]), { root, signals: ['publish'] });

  assert.deepEqual(result.map(({ id }) => id), ['safe-publication']);
});

test('provisional and changed-environment paths require deterministic revalidation reasons', async () => {
  const root = await fixture();
  const [result] = await matchExperience(index([entry({ status: 'provisional' })]), {
    root,
    signals: ['remote changes', 'publish', 'REMOTE_CHANGES'],
  });
  assert.equal(result.requires_revalidation, true);
  assert.deepEqual(result.revalidation_reasons, ['provisional', 'remote-changes']);
});

test('matches sort by count, verified date, then ID without reading artifact bodies', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'docs', 'operations', 'second.md'), '# Second\n');
  const entries = [
    entry({ id: 'z-latest', use_when: ['publish'], systems: [], artifacts: ['docs/operations/second.md'], verified_at: '2026-07-14' }),
    entry({ id: 'a-latest', use_when: ['publish'], systems: [], artifacts: ['docs/operations/second.md'], verified_at: '2026-07-14' }),
    entry({ id: 'more-signals', use_when: ['publish', 'release'], systems: [], verified_at: '2025-01-01' }),
  ];

  const result = await matchExperience(index(entries), { root, signals: ['publish', 'release'] });
  assert.deepEqual(result.map(({ id }) => id), ['more-signals', 'a-latest', 'z-latest']);
  assert.equal(JSON.stringify(result).includes('# Second'), false);
  assert.equal(await readFile(path.join(root, 'docs', 'operations', 'second.md'), 'utf8'), '# Second\n');
});
