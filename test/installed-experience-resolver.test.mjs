import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';
import { showCapabilities } from '../src/capabilities.mjs';
import {
  parseExperienceIndex as parsePackageExperienceIndex,
  serializeExperienceIndex,
} from '../src/experience-index.mjs';
import { initialize } from '../src/init.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageCli = path.join(packageRoot, 'bin', 'vibetether.mjs');

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
    boardPath: path.join(root, '.vibetether', 'capabilities.yaml'),
    manifestPath: path.join(root, '.vibetether', 'project.yaml'),
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
  assert.equal(local.status, 3, `installed authority exit code: ${label}\n${local.stderr || local.stdout}`);
  assert.match(local.stderr, /vibetether doctor/i, `installed guidance: ${label}`);
}

function routingBoard(routes = []) {
  return {
    schema_version: 1,
    mode: 'advisory-router',
    high_risk_gates: ['release-scope'],
    capabilities: [{
      id: 'release-verification',
      phases: ['SHIP'],
      expected_outputs: ['release-report'],
      exit_evidence: ['Release evidence is current.'],
      fallback: 'vibe-tether-built-in-release',
    }],
    routes,
    providers: [],
  };
}

function route(id, overrides = {}) {
  return {
    id,
    phase: 'SHIP',
    capability: 'release-verification',
    priority: 100,
    signals: { all: [], any: [] },
    recommendation: {
      skill: id,
      available_in: ['codex'],
      reason: `${id} route`,
    },
    workflow_role: 'primary',
    selection: 'recommend',
    fallback: 'vibe-tether-built-in-release',
    expected_outputs: ['release-report'],
    exit_evidence: ['Release evidence is current.'],
    ...overrides,
  };
}

async function assertRouteParity(state, board, signals = ['publish']) {
  await writeFile(state.boardPath, `${JSON.stringify(board, null, 2)}\n`, 'utf8');
  const packageOutput = await packageResolve(state, signals);
  const installed = installedResolve(state, signals);
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  const installedOutput = JSON.parse(installed.stdout);
  assert.deepEqual(installedOutput, packageOutput);
  return packageOutput;
}

test('actual installed and package resolvers have full route semantic parity', async (context) => {
  const state = await fixture('route-semantic-parity');
  const overlay = route('karpathy-guidelines', {
    priority: 300,
    workflow_role: 'policy',
    selection: 'recommend-overlay',
  });
  const primary = route('shipping-and-launch', { priority: 200 });
  const unavailable = route('preferred-unavailable', {
    priority: 250,
    recommendation: {
      skill: 'preferred-unavailable',
      available_in: [],
      reason: 'Preferred but unavailable.',
    },
    fallback: 'explicit-fallback',
  });
  const alternative = route('available-alternative', { priority: 150 });

  await context.test('policy-only route stays an overlay and never becomes primary', async () => {
    const result = await assertRouteParity(state, routingBoard([overlay]));
    assert.equal(result.primary, null);
    assert.equal(result.recommendation, null);
    assert.equal(result.selection.skill, 'vibe-tether');
    assert.deepEqual(result.overlays.map(({ skill }) => skill), ['karpathy-guidelines']);
  });
  await context.test('primary plus policy overlay', async () => {
    const result = await assertRouteParity(state, routingBoard([overlay, primary]));
    assert.equal(result.primary.skill, 'shipping-and-launch');
    assert.equal(result.selection.skill, 'shipping-and-launch');
    assert.deepEqual(result.overlays.map(({ skill }) => skill), ['karpathy-guidelines']);
  });
  await context.test('declared fallback', async () => {
    const result = await assertRouteParity(state, routingBoard([unavailable]));
    assert.equal(result.selection.skill, 'explicit-fallback');
    assert.equal(result.selection.source, 'declared-fallback');
  });
  await context.test('available alternative', async () => {
    const result = await assertRouteParity(state, routingBoard([unavailable, alternative]));
    assert.equal(result.selection.skill, 'available-alternative');
    assert.equal(result.selection.source, 'available-alternative');
  });
  await context.test('high-risk confirmation', async () => {
    const result = await assertRouteParity(state, routingBoard([primary]), ['publish', 'release-scope']);
    assert.equal(result.confirmation_required, true);
    assert.deepEqual(result.confirmation_gates, ['release-scope']);
  });
  await context.test('no matching primary route', async () => {
    const gated = route('signal-gated', { signals: { all: ['production'], any: [] } });
    const result = await assertRouteParity(state, routingBoard([gated]), ['publish']);
    assert.equal(result.primary, null);
    assert.equal(result.selection.source, 'built-in-fallback');
  });
});

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

test('capability-board route uses the same safe authority boundary in package and installed resolvers', async () => {
  const state = await fixture('board-route-authority');
  const manifest = YAML.parse(await readFile(state.manifestPath, 'utf8'));
  const validBoard = `${JSON.stringify(routingBoard([route('shipping-and-launch')]), null, 2)}\n`;

  manifest.capability_board = 'docs/custom-capabilities.json';
  await writeFile(state.manifestPath, YAML.stringify(manifest), 'utf8');
  await writeArtifact(state.root, manifest.capability_board, validBoard);
  await assertRouteParity(state, routingBoard([route('shipping-and-launch')]));

  const secret = `github_pat_${'B'.repeat(30)}`;
  const external = path.join(await mkdtemp(path.join(os.tmpdir(), 'vibetether-board-external-')), 'board.json');
  await writeFile(external, validBoard, 'utf8');
  await mkdir(path.join(state.root, 'docs', 'board-directory'), { recursive: true });
  for (const unsafe of [
    '.npmrc',
    '.aws/credentials.json',
    'config/client-secret.json',
    `docs/${secret}.json`,
  ]) {
    await writeArtifact(state.root, unsafe, validBoard);
  }

  for (const [label, boardRoute] of [
    ['npm credential control file', '.npmrc'],
    ['hidden credential root', '.aws/credentials.json'],
    ['credential-like file name', 'config/client-secret.json'],
    ['token-like route', `docs/${secret}.json`],
    ['parent escape', '../outside.json'],
    ['absolute route', external],
    ['UNC route', '\\\\server\\share\\capabilities.json'],
    ['project root', '.'],
    ['directory route', 'docs/board-directory'],
  ]) {
    manifest.capability_board = boardRoute;
    await writeFile(state.manifestPath, YAML.stringify(manifest), 'utf8');
    await assertAuthorityFailure(state, label);
    const packageError = await packageResolve(state, ['publish']).catch((error) => error);
    const installed = installedResolve(state, ['publish']);
    assert.doesNotMatch(packageError.message, new RegExp(secret), label);
    assert.doesNotMatch(installed.stderr, new RegExp(secret), label);
  }

  const escapedSecret = `github_pat_${'Z'.repeat(30)}`;
  const encodedRoute = `docs/github_pat_${'\\u005a'.repeat(30)}.json`;
  const canonicalManifest = YAML.stringify({ ...manifest, capability_board: 'placeholder.json' });
  await writeFile(
    state.manifestPath,
    canonicalManifest.replace('capability_board: placeholder.json', `capability_board: "${encodedRoute}"`),
    'utf8',
  );
  await assertAuthorityFailure(state, 'post-decode secret route');
  const packageError = await packageResolve(state, ['publish']).catch((error) => error);
  const installed = installedResolve(state, ['publish']);
  assert.doesNotMatch(packageError.message, new RegExp(escapedSecret));
  assert.doesNotMatch(installed.stderr, new RegExp(escapedSecret));
});

test('capability-board authority rejects linked files and intermediate directories', async (context) => {
  await context.test('board file symlink', async (subtest) => {
    const state = await fixture('board-file-link');
    const external = path.join(await mkdtemp(path.join(os.tmpdir(), 'vibetether-board-file-link-')), 'board.json');
    await writeFile(external, await readFile(state.boardPath, 'utf8'), 'utf8');
    await rm(state.boardPath);
    try {
      await symlink(external, state.boardPath, 'file');
    } catch (error) {
      if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
        subtest.skip(`Windows denied file symlink creation: ${error.code}`);
        return;
      }
      throw error;
    }
    await assertAuthorityFailure(state, 'board file symlink');
  });

  await context.test('custom board intermediate-directory junction', async (subtest) => {
    const state = await fixture('board-directory-link');
    const external = await mkdtemp(path.join(os.tmpdir(), 'vibetether-board-directory-link-'));
    await writeFile(path.join(external, 'board.json'), await readFile(state.boardPath, 'utf8'), 'utf8');
    const linked = path.join(state.root, 'docs', 'linked-board');
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
    const manifest = YAML.parse(await readFile(state.manifestPath, 'utf8'));
    manifest.capability_board = 'docs/linked-board/board.json';
    await writeFile(state.manifestPath, YAML.stringify(manifest), 'utf8');
    await assertAuthorityFailure(state, 'custom board intermediate-directory junction');
  });
});

test('capability-board documents require the complete advisory-router envelope', async () => {
  const state = await fixture('board-envelope');
  const valid = routingBoard([route('shipping-and-launch')]);
  for (const [label, invalid] of [
    ['root array', []],
    ['unsupported schema', { ...valid, schema_version: 2 }],
    ['unsupported mode', { ...valid, mode: 'automatic-router' }],
  ]) {
    await writeFile(state.boardPath, `${JSON.stringify(invalid, null, 2)}\n`, 'utf8');
    await assertAuthorityFailure(state, label);
  }
  await writeFile(state.boardPath, YAML.stringify(valid, { lineWidth: 0 }), 'utf8');
  await assertAuthorityFailure(state, 'YAML-only board document');
});

test('capability-board structural failures are neutral project-authority failures in both resolvers', async () => {
  const cases = [
    ['capabilities is not an array', (board) => { board.capabilities = {}; }],
    ['providers is not an array', (board) => { board.providers = {}; }],
    ['routes is not an array', (board) => { board.routes = {}; }],
    ['route lacks a recommendation mapping', (board) => {
      const missingRecommendation = route('missing-recommendation');
      delete missingRecommendation.recommendation;
      board.routes = [missingRecommendation];
    }],
  ];

  for (const [label, mutate] of cases) {
    const state = await fixture(`board-shape-${label.replaceAll(/[^a-z]+/gi, '-')}`);
    const malformed = routingBoard([route('shipping-and-launch')]);
    mutate(malformed);
    await writeFile(state.boardPath, `${JSON.stringify(malformed, null, 2)}\n`, 'utf8');

    const packageError = await packageResolve(state, ['publish']).catch((error) => error);
    assert.equal(packageError.exitCode, 3, `package authority exit code: ${label}`);
    assert.match(packageError.message, /capability board[\s\S]*vibetether doctor/i, `package guidance: ${label}`);
    assert.doesNotMatch(packageError.message, /typeerror|cannot read properties/i, `package raw error: ${label}`);

    const installed = installedResolve(state, ['publish']);
    assert.equal(installed.status, 3, `installed authority exit code: ${label}\n${installed.stderr || installed.stdout}`);
    assert.match(installed.stderr, /capability board[\s\S]*vibetether doctor/i, `installed guidance: ${label}`);
    assert.doesNotMatch(installed.stderr, /typeerror|cannot read properties/i, `installed raw error: ${label}`);
  }
});

test('installed resolver validates the complete canonical manifest before extracting routes', async () => {
  const state = await fixture('canonical-manifest');
  const base = YAML.parse(await readFile(state.manifestPath, 'utf8'));
  const board = routingBoard([route('shipping-and-launch')]);
  await writeFile(state.boardPath, `${JSON.stringify(board, null, 2)}\n`, 'utf8');

  for (const profile of ['core', 'standard', 'extended']) {
    const manifest = {
      ...base,
      profile,
      bundle_signals: profile === 'core' ? [] : [{
        bundle: 'web',
        signal: 'react',
        path: 'package.json',
        confidence: 'high',
        reason: 'React dependency detected.',
      }],
      bundles: profile === 'core' ? [] : ['web'],
    };
    await writeFile(state.manifestPath, YAML.stringify(manifest, { lineWidth: 0 }), 'utf8');
    await assertRouteParity(state, board);
  }

  const canonical = YAML.stringify({
    ...base,
    profile: 'extended',
    bundle_signals: [{
      bundle: 'web',
      signal: 'react',
      path: 'package.json',
      confidence: 'high',
      reason: 'React dependency detected.',
    }],
    bundles: ['web'],
  }, { lineWidth: 0 });
  const malformed = [
    ['appended malformed flow', `${canonical}profile: [unterminated\n`],
    ['invalid root indentation', canonical.replace('schema_version: 1', ' schema_version: 1')],
    ['invalid nested indentation', canonical.replace('  always:', '   always:')],
    ['duplicate route', `${canonical}capability_board: docs/other-board.json\n`],
    ['prototype key cannot supply inherited authority', canonical.replace(
      'capability_board: .vibetether/capabilities.yaml',
      '__proto__:\n  capability_board: .vibetether/capabilities.yaml',
    )],
    ['non-empty flow', canonical.replace('bundles:\n  - web', 'bundles: [web]')],
    ['anchor', canonical.replace('profile: extended', 'profile: &profile extended')],
    ['tag', canonical.replace('profile: extended', 'profile: !profile extended')],
    ['literal block', canonical.replace('profile: extended', 'profile: |\n  extended')],
    ['comment', canonical.replace('profile: extended', '# hidden\nprofile: extended')],
    ['tab', canonical.replace('profile: extended', 'profile:\textended')],
  ];
  for (const [label, source] of malformed) {
    await writeFile(state.manifestPath, source, 'utf8');
    await assertAuthorityFailure(state, label);
  }
});

test('installed resolver reserves exit code 2 for argument errors and 3 for project authority failures', async () => {
  const state = await fixture('exit-codes');
  const installedUnknown = spawnSync(process.execPath, [state.resolver, '--unknown'], {
    cwd: state.root,
    encoding: 'utf8',
  });
  const packageUnknown = spawnSync(process.execPath, [packageCli, 'capabilities', '--unknown'], {
    cwd: state.root,
    encoding: 'utf8',
  });
  assert.equal(installedUnknown.status, 2);
  assert.equal(packageUnknown.status, installedUnknown.status);

  const installedUnknownCapability = spawnSync(process.execPath, [
    state.resolver,
    '--project', state.root,
    '--phase', 'SHIP',
    '--capability', 'not-a-declared-capability',
    '--agent', 'codex',
  ], { cwd: state.root, encoding: 'utf8' });
  const packageUnknownCapability = spawnSync(process.execPath, [
    packageCli,
    'capabilities',
    '--project', state.root,
    '--phase', 'SHIP',
    '--capability', 'not-a-declared-capability',
    '--agent', 'codex',
    '--json',
  ], { cwd: state.root, encoding: 'utf8' });
  assert.equal(installedUnknownCapability.status, 2, installedUnknownCapability.stderr || installedUnknownCapability.stdout);
  assert.equal(packageUnknownCapability.status, installedUnknownCapability.status, packageUnknownCapability.stderr || packageUnknownCapability.stdout);

  await rm(state.manifestPath);
  const installedAuthority = installedResolve(state);
  const packageAuthority = spawnSync(process.execPath, [
    packageCli,
    'capabilities',
    '--project', state.root,
    '--phase', 'SHIP',
    '--capability', 'release-verification',
    '--agent', 'codex',
    '--json',
  ], { cwd: state.root, encoding: 'utf8' });
  assert.equal(installedAuthority.status, 3, installedAuthority.stderr || installedAuthority.stdout);
  assert.equal(packageAuthority.status, installedAuthority.status, packageAuthority.stderr || packageAuthority.stdout);
  assert.match(installedAuthority.stderr, /vibetether doctor/i);
  assert.match(packageAuthority.stderr, /vibetether doctor/i);
});
