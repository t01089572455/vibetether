import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';
import { showCapabilities } from '../src/capabilities.mjs';
import {
  parseExperienceIndex as parsePackageExperienceIndex,
  serializeExperienceIndex,
} from '../src/experience-index.mjs';
import { initialize } from '../src/init.mjs';

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

async function writeArtifact(root, relativePath, content = '# Experience artifact\n') {
  const target = path.join(root, ...relativePath.replaceAll('\\', '/').split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
  return target;
}

async function fixture(name) {
  const root = await mkdtemp(path.join(os.tmpdir(), `vibetether-installed-experience-${name}-`));
  await initialize({ project: root, agent: 'codex', profile: 'core', dryRun: false, yes: true });
  await writeArtifact(root, 'docs/operations/github-publishing.md', '# GitHub publishing\n');
  return {
    root,
    indexPath: path.join(root, '.vibetether', 'experience-index.yaml'),
    resolver: path.join(root, '.agents', 'skills', 'vibe-tether', 'scripts', 'resolve-route.mjs'),
    parser: path.join(root, '.agents', 'skills', 'vibe-tether', 'scripts', 'experience-index.mjs'),
  };
}

function installedResolve(state, signals = ['publish', 'windows']) {
  return spawnSync(process.execPath, [
    state.resolver,
    '--project', state.root,
    '--phase', 'SHIP',
    '--capability', 'release-verification',
    ...signals.flatMap((signal) => ['--signal', signal]),
    '--agent', 'codex',
  ], { cwd: state.root, encoding: 'utf8' });
}

async function packageResolve(state, signals = ['publish', 'windows']) {
  return JSON.parse(await showCapabilities({
    project: state.root,
    phase: 'SHIP',
    capability: 'release-verification',
    signals,
    agent: 'codex',
    json: true,
  }));
}

async function assertParity(state, entries, signals, expectedIds) {
  await writeFile(state.indexPath, YAML.stringify(index(entries), { lineWidth: 0 }), 'utf8');
  const packageOutput = await packageResolve(state, signals);
  const installed = installedResolve(state, signals);
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  const installedOutput = JSON.parse(installed.stdout);
  assert.deepEqual(installedOutput.applicable_experience, packageOutput.applicable_experience);
  assert.deepEqual(installedOutput.applicable_experience.map(({ id }) => id), expectedIds);
  assert.equal(JSON.stringify(installedOutput.applicable_experience).includes('# GitHub publishing'), false);
  return installedOutput.applicable_experience;
}

async function assertAuthorityFailure(state, label) {
  await assert.rejects(
    packageResolve(state, ['publish']),
    (error) => {
      assert.match(error.message, /vibetether doctor/i, `package: ${label}`);
      return true;
    },
  );
  const local = installedResolve(state, ['publish']);
  assert.notEqual(local.status, 0, `installed: ${label}`);
  assert.match(local.stderr, /vibetether doctor/i, `installed guidance: ${label}`);
}

test('the actually installed resolver matches package experience semantics across the contract matrix', async (context) => {
  const state = await fixture('matrix');
  await writeArtifact(state.root, 'docs/operations/second.md', '# Second\n');
  await writeArtifact(state.root, 'docs/operations/credentials-rotation.md', '# Credentials rotation\n');
  await writeArtifact(state.root, 'docs/operations/secrets-management/README.md', '# Secrets management\n');
  await writeArtifact(state.root, 'docs/operations/secretary-notes.json', '{}\n');
  await writeArtifact(state.root, '.npmrc', 'fixture\n');
  await writeArtifact(state.root, 'config/client-secret.json', '{}\n');
  await writeArtifact(state.root, 'archives/client.pem.gz', 'fixture\n');
  await mkdir(path.join(state.root, 'docs', 'operations', 'artifact-directory'), { recursive: true });

  await context.test('proven', async () => {
    const [result] = await assertParity(state, [entry()], ['publish', 'windows'], ['github-publication']);
    assert.equal(result.match_count, 2);
    assert.equal(result.requires_revalidation, false);
  });
  await context.test('provisional', async () => {
    const [result] = await assertParity(state, [entry({ status: 'provisional' })], ['publish'], ['github-publication']);
    assert.equal(result.requires_revalidation, true);
    assert.deepEqual(result.revalidation_reasons, ['provisional']);
  });
  await context.test('active revalidation', async () => {
    const [result] = await assertParity(state, [entry()], ['publish', 'remote changes'], ['github-publication']);
    assert.equal(result.requires_revalidation, true);
    assert.deepEqual(result.revalidation_reasons, ['remote-changes']);
  });
  await context.test('obsolete', async () => {
    await assertParity(state, [entry({ status: 'obsolete' })], ['publish'], []);
  });
  await context.test('missing artifact', async () => {
    await assertParity(state, [entry({ artifacts: ['docs/operations/missing.md'] })], ['publish'], []);
  });
  await context.test('mixed safe and unsafe artifacts omit the whole entry but preserve safe peers', async () => {
    await assertParity(state, [
      entry({ id: 'safe-peer' }),
      entry({ id: 'mixed-entry', artifacts: ['docs/operations/github-publishing.md', '.npmrc'] }),
    ], ['publish'], ['safe-peer']);
  });
  await context.test('multi-match sort', async () => {
    await assertParity(state, [
      entry({ id: 'z-latest', use_when: ['publish'], systems: [], artifacts: ['docs/operations/second.md'], verified_at: '2026-07-14' }),
      entry({ id: 'a-latest', use_when: ['publish'], systems: [], artifacts: ['docs/operations/second.md'], verified_at: '2026-07-14' }),
      entry({ id: 'more-signals', use_when: ['publish', 'release'], systems: [], verified_at: '2025-01-01' }),
    ], ['publish', 'release'], ['more-signals', 'a-latest', 'z-latest']);
  });
  await context.test('no match', async () => {
    await assertParity(state, [entry()], ['database'], []);
  });
  await context.test('credential and runbook safety matrix', async () => {
    await assertParity(state, [
      entry({ id: 'credentials-runbook', artifacts: ['docs/operations/credentials-rotation.md'] }),
      entry({ id: 'secrets-runbook', artifacts: ['docs/operations/secrets-management/README.md'] }),
      entry({ id: 'innocent-secretary', artifacts: ['docs/operations/secretary-notes.json'] }),
      entry({ id: 'npm-credential', artifacts: ['.npmrc'] }),
      entry({ id: 'client-secret', artifacts: ['config/client-secret.json'] }),
      entry({ id: 'wrapped-key', artifacts: ['archives/client.pem.gz'] }),
      entry({ id: 'escaping', artifacts: ['../outside.md'] }),
      entry({ id: 'directory', artifacts: ['docs/operations/artifact-directory'] }),
      entry({ id: 'project-root-directory', artifacts: ['.'] }),
    ], ['publish'], ['credentials-runbook', 'innocent-secretary', 'secrets-runbook']);
  });

  await context.test('symlink or junction artifact', async (subtest) => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'vibetether-installed-experience-outside-'));
    await writeFile(path.join(outside, 'outside.md'), '# Outside\n', 'utf8');
    const link = path.join(state.root, 'docs', 'operations', 'linked-outside');
    try {
      await symlink(outside, link, 'junction');
    } catch (error) {
      if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
        subtest.skip(`Windows denied junction creation: ${error.code}`);
        return;
      }
      throw error;
    }
    await assertParity(state, [
      entry({ id: 'safe-peer' }),
      entry({ id: 'linked-artifact', artifacts: ['docs/operations/linked-outside/outside.md'] }),
    ], ['publish'], ['safe-peer']);
  });
});

test('the installed parser accepts canonical empty and quoted scalars and rejects guesses', async () => {
  const state = await fixture('parser');
  const installed = await import(`${pathToFileURL(state.parser).href}?fixture=${Date.now()}`);
  assert.deepEqual(installed.parseExperienceIndex('schema_version: 1\nentries: []\n'), index([]));
  assert.deepEqual(parsePackageExperienceIndex('\uFEFFschema_version: 1\nentries: []\n'), index([]));
  assert.deepEqual(installed.parseExperienceIndex('\uFEFFschema_version: 1\nentries: []\n'), index([]));
  assert.deepEqual(parsePackageExperienceIndex('schema_version: 1\r\nentries: []\r\n'), index([]));
  assert.deepEqual(installed.parseExperienceIndex('schema_version: 1\r\nentries: []\r\n'), index([]));
  assert.throws(
    () => installed.parseExperienceIndex('schema_version: 1\n# not canonical\nentries: []\n'),
    /comments are not canonical|unsupported/i,
  );

  const quotedArtifact = 'docs/operations/hash # guide.md';
  await writeArtifact(state.root, quotedArtifact, '# Hash guide\n');
  const canonical = serializeExperienceIndex(index([entry({ artifacts: [quotedArtifact] })]));
  assert.match(canonical, /"docs\/operations\/hash # guide\.md"/);
  assert.deepEqual(parsePackageExperienceIndex(canonical), index([entry({ artifacts: [quotedArtifact] })]));
  assert.deepEqual(installed.parseExperienceIndex(canonical), index([entry({ artifacts: [quotedArtifact] })]));

  const apostropheArtifact = "docs/operations/o'hare.md";
  const singleQuoted = canonical.replace(
    '"docs/operations/hash # guide.md"',
    "'docs/operations/o''hare.md'",
  );
  assert.deepEqual(
    parsePackageExperienceIndex(singleQuoted),
    index([entry({ artifacts: [apostropheArtifact] })]),
  );
  assert.deepEqual(
    installed.parseExperienceIndex(singleQuoted),
    index([entry({ artifacts: [apostropheArtifact] })]),
  );
  assert.throws(
    () => serializeExperienceIndex(index([entry({ artifacts: ['docs/operations/line\nbreak.md'] })])),
    /safe|relative|artifact path/i,
  );

  for (const [label, source] of [
    ['unknown top-level field', 'schema_version: 1\nentries: []\nnotes: hidden\n'],
    ['duplicate scalar field', 'schema_version: 1\nentries:\n  - id: duplicate\n    use_when:\n      - publish\n    artifacts:\n      - docs/operations/github-publishing.md\n    verified_at: 2026-07-13\n    revalidate_when: []\n    status: proven\n    status: provisional\n'],
    ['duplicate entry ID', YAML.stringify(index([entry(), entry()]), { lineWidth: 0 })],
    ['unknown entry field', 'schema_version: 1\nentries:\n  - id: unknown\n    use_when:\n      - publish\n    artifacts:\n      - docs/operations/github-publishing.md\n    verified_at: 2026-07-13\n    revalidate_when: []\n    status: proven\n    transcript: hidden\n'],
    ['flow list other than canonical empty', 'schema_version: 1\nentries:\n  - id: flow\n    use_when: [publish]\n    artifacts:\n      - docs/operations/github-publishing.md\n    verified_at: 2026-07-13\n    revalidate_when: []\n    status: proven\n'],
    ['malformed indentation', 'schema_version: 1\nentries:\n - id: shallow\n'],
    ['missing required field', 'schema_version: 1\nentries:\n  - id: incomplete\n'],
  ]) {
    assert.throws(() => installed.parseExperienceIndex(source), undefined, label);
  }
});

test('package and installed parsers and resolvers reject the same canonical-subset injection matrix', async () => {
  const state = await fixture('strict-parity');
  const installed = await import(`${pathToFileURL(state.parser).href}?fixture=${Date.now()}`);
  const canonical = serializeExperienceIndex(index());
  const artifactLine = '      - docs/operations/github-publishing.md';
  const malformed = [
    ['nested list', canonical.replace(artifactLine, '      - - nested')],
    ['explicit mapping indicator', canonical.replace(artifactLine, '      - ? injected')],
    ['directive indicator', canonical.replace(artifactLine, '      - %directive')],
    ['anchor', canonical.replace(artifactLine, `      - &artifact docs/operations/github-publishing.md`)],
    ['alias', canonical.replace(artifactLine, '      - *artifact')],
    ['tag', canonical.replace(artifactLine, '      - !tag docs/operations/github-publishing.md')],
    ['flow sequence', canonical.replace(artifactLine, '      - [docs/operations/github-publishing.md]')],
    ['flow mapping', canonical.replace(artifactLine, '      - { path: docs/operations/github-publishing.md }')],
    ['literal block', canonical.replace(artifactLine, '      - |\n        docs/operations/github-publishing.md')],
    ['folded block', canonical.replace(artifactLine, '      - >\n        docs/operations/github-publishing.md')],
    ['comment line', canonical.replace('entries:\n', 'entries:\n  # injected\n')],
    ['tab', canonical.replace('    use_when:', '    use_when:\t')],
    ['extra blank line', canonical.replace('schema_version: 1\n', 'schema_version: 1\n\n')],
    ['duplicate field', canonical.replace('    status: proven\n', '    status: proven\n    status: provisional\n')],
    ['unknown field', canonical.replace('    status: proven\n', '    status: proven\n    transcript: hidden\n')],
  ];

  for (const [label, source] of malformed) {
    assert.throws(() => parsePackageExperienceIndex(source), undefined, `package parser: ${label}`);
    assert.throws(() => installed.parseExperienceIndex(source), undefined, `installed parser: ${label}`);
    await writeFile(state.indexPath, source, 'utf8');
    await assert.rejects(packageResolve(state, ['publish']), undefined, `package resolver: ${label}`);
    const local = installedResolve(state, ['publish']);
    assert.notEqual(local.status, 0, `installed resolver: ${label}`);
    assert.match(local.stderr, /vibetether doctor/i, `installed resolver guidance: ${label}`);
  }
});

test('experience-index failures do not echo secret-bearing metadata', async () => {
  const state = await fixture('secret-error');
  const installedModule = await import(`${pathToFileURL(state.parser).href}?fixture=${Date.now()}`);
  const secret = `github_pat_${'Z'.repeat(30)}`;
  const canonical = serializeExperienceIndex(index());
  const secretSources = [
    ['secret id plus missing field', canonical
      .replace('  - id: github-publication', `  - id: ${secret}`)
      .replace('    artifacts:\n      - docs/operations/github-publishing.md\n', '')],
    ['secret value plus unknown field', canonical
      .replace('      - github', `      - ${secret}`)
      .replace('    status: proven\n', '    status: proven\n    transcript: hidden\n')],
    ['secret artifact plus bad indent', canonical
      .replace('      - docs/operations/github-publishing.md', `     - docs/operations/${secret}.md`)],
    ['secret status plus malformed scalar', canonical
      .replace('    status: proven', `    status: ${secret}`)
      .replace('      - publish', '      - - nested')],
  ];

  for (const [label, source] of secretSources) {
    for (const [parserName, parser] of [
      ['package', parsePackageExperienceIndex],
      ['installed', installedModule.parseExperienceIndex],
    ]) {
      assert.throws(
        () => parser(source),
        (error) => {
          assert.match(error.message, /secret-bearing/i, `${parserName}: ${label}`);
          assert.doesNotMatch(error.message, new RegExp(secret), `${parserName}: ${label}`);
          return true;
        },
      );
    }
    await writeFile(state.indexPath, source, 'utf8');
    const local = installedResolve(state, ['publish']);
    assert.notEqual(local.status, 0, label);
    assert.doesNotMatch(local.stderr, new RegExp(secret), label);
    await assert.rejects(
      packageResolve(state, ['publish']),
      (error) => {
        assert.doesNotMatch(error.message, new RegExp(secret), label);
        return true;
      },
    );
  }
});

test('installed and package resolvers use the manifest route, canonical fallback, and actionable doctor failures', async (context) => {
  const state = await fixture('manifest');
  const manifestPath = path.join(state.root, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  manifest.experience_index = 'docs/custom-experience.yaml';
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
  await writeArtifact(state.root, 'docs/operations/custom.md', '# Custom\n');
  await writeFile(
    path.join(state.root, 'docs', 'custom-experience.yaml'),
    serializeExperienceIndex(index([entry({ id: 'custom', artifacts: ['docs/operations/custom.md'] })])),
    'utf8',
  );
  await assertParity(state, [entry()], ['publish'], ['custom']);

  delete manifest.experience_index;
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
  await assertParity(state, [entry()], ['publish'], ['github-publication']);

  await rm(state.indexPath);
  const missing = installedResolve(state, ['publish']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /experience index[\s\S]*vibetether doctor/i);
  await assert.rejects(packageResolve(state, ['publish']), /experience index[\s\S]*vibetether doctor/i);

  await writeFile(state.indexPath, 'schema_version: 1\nentries: []\nnotes: hidden\n', 'utf8');
  const malformed = installedResolve(state, ['publish']);
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /experience index[\s\S]*vibetether doctor/i);
  await assert.rejects(packageResolve(state, ['publish']), /experience index[\s\S]*vibetether doctor/i);

  manifest.experience_index = '../outside.yaml';
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
  const escaping = installedResolve(state, ['publish']);
  assert.notEqual(escaping.status, 0);
  assert.match(escaping.stderr, /experience index[\s\S]*vibetether doctor/i);
  await assert.rejects(packageResolve(state, ['publish']), /experience index[\s\S]*vibetether doctor/i);

  await context.test('symlinked index route', async (subtest) => {
    delete manifest.experience_index;
    await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
    const external = path.join(await mkdtemp(path.join(os.tmpdir(), 'vibetether-installed-index-link-')), 'index.yaml');
    await writeFile(external, serializeExperienceIndex(index()), 'utf8');
    await rm(state.indexPath, { force: true });
    try {
      await symlink(external, state.indexPath, 'file');
    } catch (error) {
      if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
        subtest.skip(`Windows denied symlink creation: ${error.code}`);
        return;
      }
      throw error;
    }
    const linked = installedResolve(state, ['publish']);
    assert.notEqual(linked.status, 0);
    assert.match(linked.stderr, /experience index[\s\S]*vibetether doctor/i);
    await assert.rejects(packageResolve(state, ['publish']), /experience index[\s\S]*vibetether doctor/i);
  });
});

test('package and installed resolvers reject sensitive or non-file custom experience routes', async () => {
  const state = await fixture('route-safety');
  const manifestPath = path.join(state.root, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  const validIndex = serializeExperienceIndex(index());
  const secret = `github_pat_${'R'.repeat(30)}`;
  const external = path.join(await mkdtemp(path.join(os.tmpdir(), 'vibetether-route-external-')), 'index.yaml');
  await writeFile(external, validIndex, 'utf8');
  for (const route of [
    '.npmrc',
    '.aws/credentials.yaml',
    'config/client-secret.yaml',
    `docs/${secret}.yaml`,
  ]) {
    await writeArtifact(state.root, route, validIndex);
  }

  for (const [label, route] of [
    ['npm credentials', '.npmrc'],
    ['hidden credential root', '.aws/credentials.yaml'],
    ['credential-like name', 'config/client-secret.yaml'],
    ['token-like name', `docs/${secret}.yaml`],
    ['parent escape', '../outside.yaml'],
    ['absolute path', external],
    ['UNC path', '\\\\server\\share\\experience.yaml'],
    ['project root directory', '.'],
  ]) {
    manifest.experience_index = route;
    await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
    await assertAuthorityFailure(state, label);
    const packageError = await packageResolve(state, ['publish']).catch((error) => error);
    assert.doesNotMatch(packageError.message, new RegExp(secret), label);
    const local = installedResolve(state, ['publish']);
    assert.doesNotMatch(local.stderr, new RegExp(secret), label);
  }
});

test('package and installed resolvers reject linked manifest and index authority paths', async (context) => {
  await context.test('manifest file symlink', async (subtest) => {
    const state = await fixture('manifest-file-link');
    const manifestPath = path.join(state.root, '.vibetether', 'project.yaml');
    const external = path.join(await mkdtemp(path.join(os.tmpdir(), 'vibetether-manifest-file-link-')), 'project.yaml');
    await writeFile(external, await readFile(manifestPath, 'utf8'), 'utf8');
    await rm(manifestPath);
    try {
      await symlink(external, manifestPath, 'file');
    } catch (error) {
      if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
        subtest.skip(`Windows denied file symlink creation: ${error.code}`);
        return;
      }
      throw error;
    }
    await assertAuthorityFailure(state, 'manifest file symlink');
  });

  await context.test('manifest intermediate-directory junction', async (subtest) => {
    const state = await fixture('manifest-directory-link');
    const control = path.join(state.root, '.vibetether');
    const externalRoot = await mkdtemp(path.join(os.tmpdir(), 'vibetether-manifest-directory-link-'));
    const external = path.join(externalRoot, 'control');
    await rename(control, external);
    try {
      await symlink(external, control, 'junction');
    } catch (error) {
      if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
        subtest.skip(`Windows denied junction creation: ${error.code}`);
        return;
      }
      throw error;
    }
    await assertAuthorityFailure(state, 'manifest intermediate-directory junction');
  });

  await context.test('custom index intermediate-directory junction', async (subtest) => {
    const state = await fixture('index-directory-link');
    const external = await mkdtemp(path.join(os.tmpdir(), 'vibetether-index-directory-link-'));
    await writeFile(path.join(external, 'index.yaml'), serializeExperienceIndex(index()), 'utf8');
    const linked = path.join(state.root, 'docs', 'linked-index');
    await mkdir(path.dirname(linked), { recursive: true });
    try {
      await symlink(external, linked, 'junction');
    } catch (error) {
      if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
        subtest.skip(`Windows denied junction creation: ${error.code}`);
        return;
      }
      throw error;
    }
    const manifestPath = path.join(state.root, '.vibetether', 'project.yaml');
    const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
    manifest.experience_index = 'docs/linked-index/index.yaml';
    await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
    await assertAuthorityFailure(state, 'custom index intermediate-directory junction');
  });
});
