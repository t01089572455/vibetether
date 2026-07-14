import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ADAPTERS, GITIGNORE_BODY } from '../src/adapters.mjs';
import { SENSITIVE_CREDENTIAL_PHRASES } from '../src/artifact-safety.mjs';
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

function phraseVariants(phrase) {
  const capitalizedTail = phrase.slice(1).map((word) => `${word[0].toUpperCase()}${word.slice(1)}`);
  return [...new Set([
    phrase.join('-'),
    phrase.join('_'),
    [phrase[0], ...capitalizedTail].join(''),
    phrase.join(''),
    [...phrase.slice(0, -1), `${phrase.at(-1)}s`].join(''),
  ])];
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

test('project scan omits an empty or placeholder-only operations directory', async () => {
  const root = await project('empty-operations');
  await mkdir(path.join(root, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'operations', 'empty.md'), '', 'utf8');
  await writeFile(path.join(root, 'docs', 'operations', 'script.mjs'), 'export {};\n', 'utf8');

  const manifest = await scanProject(root, ['codex'], 'core');

  assert.deepEqual(manifest.sources.conditional.operations, []);
  assert.equal(manifest.discovery['docs/operations/'], undefined);
});

test('project scan omits a linked operations directory even when the target contains documentation', async (context) => {
  const root = await project('linked-operations');
  const outside = await project('linked-operations-outside');
  await writeFile(path.join(outside, 'publishing.md'), '# Outside publishing\n', 'utf8');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  const skipReason = await linkDirectory(outside, path.join(root, 'docs', 'operations'));
  if (skipReason) {
    context.skip(skipReason);
    return;
  }

  const manifest = await scanProject(root, ['codex'], 'core');

  assert.deepEqual(manifest.sources.conditional.operations, []);
  assert.equal(manifest.discovery['docs/operations/'], undefined);
});

test('project scan omits the whole operations route when a safe document has a nested linked sibling', async (context) => {
  const root = await project('mixed-linked-operations');
  const outside = await project('mixed-linked-operations-outside');
  await mkdir(path.join(root, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'operations', 'safe.md'), '# Safe local runbook\n', 'utf8');
  await writeFile(path.join(outside, 'outside.md'), '# Outside\n', 'utf8');
  const skipReason = await linkDirectory(outside, path.join(root, 'docs', 'operations', 'linked'));
  if (skipReason) {
    context.skip(skipReason);
    return;
  }

  const manifest = await scanProject(root, ['codex'], 'core');

  assert.deepEqual(manifest.sources.conditional.operations, []);
  assert.equal(manifest.discovery['docs/operations/'], undefined);
});

test('project scan omits the whole operations route when credential material has a safe document sibling', async () => {
  const root = await project('sensitive-operations');
  await mkdir(path.join(root, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'operations', 'safe.md'), '# Safe local runbook\n', 'utf8');
  await writeFile(path.join(root, 'docs', 'operations', '.npmrc'), 'fixture\n', 'utf8');

  const manifest = await scanProject(root, ['codex'], 'core');

  assert.deepEqual(manifest.sources.conditional.operations, []);
  assert.equal(manifest.discovery['docs/operations/'], undefined);
});

test('project scan preserves discovery of a nested regular documentation file', async () => {
  const root = await project('nested-operations');
  await mkdir(path.join(root, 'docs', 'operations', 'github'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'operations', 'github', 'publishing.md'), '# Publishing\n', 'utf8');

  const manifest = await scanProject(root, ['codex'], 'core');

  assert.deepEqual(manifest.sources.conditional.operations, ['docs/operations/']);
});

test('project scan allows strong runbook documentation under credential-named paths', async () => {
  for (const allowed of [
    ['credentials.md'],
    ['credentials-rotation.md'],
    ['secrets-management.md'],
    ['tokens-in-parser.md'],
    ['authentication.md'],
    ['secrets', 'rotation.mdx'],
    ['tokens', 'parser.mdx'],
    ['tokens.markdown'],
    ['credentials', 'rotation.adoc'],
    ['credentials', 'guides', 'rotation.adoc'],
    ['secret.rst'],
    ['access-token-rotation.md'],
    ['client_secret-rotation.mdx'],
    ['access-token-rotation', 'README.md'],
    ['secrets-management', 'README.md'],
    ['client_secret-rotation', 'README.md'],
    ['access-token.md'],
    ['api-key.md'],
    ['private-key.md'],
    ['client-secret.mdx'],
    ['api_key-usage.rst'],
    ['tokens.md'],
    ['password-policy.md'],
    ['credentials-schema.adoc'],
  ]) {
    const root = await project(`strong-runbook-${allowed.join('-')}`);
    const target = path.join(root, 'docs', 'operations', ...allowed);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, '# Safe operational documentation\n', 'utf8');

    const manifest = await scanProject(root, ['codex'], 'core');
    assert.deepEqual(manifest.sources.conditional.operations, ['docs/operations/'], allowed.join('/'));
    assert.equal(manifest.discovery['docs/operations/'].role, 'operational proven paths', allowed.join('/'));
  }
});

test('project scan denies credential config and cloud credential roots despite a safe runbook sibling', async () => {
  for (const denied of [
    ['credentials', 'config.json'],
    ['secrets', 'token.txt'],
    ['.kube', 'config'],
    ['.azure', 'accessTokens.json'],
    ['.aws', 'credentials'],
    ['.aws', 'access-token-rotation.md'],
    ['.gnupg', 'private-keys-v1.d', 'key'],
    ['.config', 'gcloud', 'application_default_credentials.json'],
    ['api-key.json'],
    ['.envrc'],
    ['api_key.txt'],
    ['service_account.json'],
    ['access_token.json'],
    ['client_secret.json'],
    ['kubeconfig.yaml'],
    ['.npmrc.bak'],
    ['credentials-prod.json'],
    ['credentials.prod.json.backup.old~'],
    ['access-token-rotation.pem.md'],
    ['token-rotation.token.md'],
    ['.env~'],
    ['.envrc~'],
    ['.envrc~.bak'],
    ['KubeConfig.yaml'],
    ['kube_config.yaml'],
    ['apiKeys.json'],
    ['clientSecrets.json'],
    ['serviceAccounts.json'],
    ['oauth_client_secret.json'],
    ['prod-api-key.json'],
    ['github_token.json'],
    ['database_password.txt'],
    ['.kube.bak', 'config'],
    ['.kube~', 'config'],
    ['.aws.old', 'config'],
    ['.azure.backup', 'azureProfile.json'],
    ['.docker.orig', 'config.json'],
    ['.config', 'gcloud.old', 'config.json'],
    ['.ssh.save', 'config'],
    ['.gnupg.bak', 'gpg.conf'],
    ['client.pem.gz'],
    ['bundle.p12.zip'],
    ['archive.credentials.zip'],
    ['random.token.gz'],
    ['.env~.zip'],
    ['.kube.zip', 'config'],
    ['.aws.tar.gz', 'config'],
    ['.azure.tgz', 'azureProfile.json'],
    ['.docker.bz2', 'config.json'],
    ['.ssh.xz', 'config'],
    ['.gnupg.7z', 'gpg.conf'],
    ['.config', 'gcloud.rar', 'config.json'],
    ['.kube.zst', 'config'],
    ['.aws.lz4', 'config'],
    ['.npmrc.zip'],
    ['github_pat.json'],
    ['gitlab_pat.json'],
    ['access_key.json'],
    ['secret_access_key.json'],
    ['keystore.json'],
    ['key_store.json'],
    ['tokens.json'],
    ['password-policy.json'],
    ['credentials-schema.json'],
    ['client.pem'],
    ['bundle.p12'],
    ['signing.key'],
  ]) {
    const root = await project(`credential-tree-${denied.join('-').replaceAll('.', 'dot')}`);
    await mkdir(path.join(root, 'docs', 'operations'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'operations', 'safe.md'), '# Safe local runbook\n', 'utf8');
    const target = path.join(root, 'docs', 'operations', ...denied);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'fixture\n', 'utf8');

    const manifest = await scanProject(root, ['codex'], 'core');
    assert.deepEqual(manifest.sources.conditional.operations, [], denied.join('/'));
    assert.equal(manifest.discovery['docs/operations/'], undefined, denied.join('/'));
  }
});

test('project scan applies every credential phrase form without matching innocent word fragments', async () => {
  for (const [phrasePosition, phrase] of SENSITIVE_CREDENTIAL_PHRASES.entries()) {
    for (const [variantPosition, variant] of phraseVariants(phrase).entries()) {
      const root = await project(`compound-${phrasePosition}-${variantPosition}`);
      await mkdir(path.join(root, 'docs', 'operations'), { recursive: true });
      await writeFile(path.join(root, 'docs', 'operations', 'safe.md'), '# Safe runbook\n', 'utf8');
      await writeFile(path.join(root, 'docs', 'operations', `${variant}.json`), '{}\n', 'utf8');
      const manifest = await scanProject(root, ['codex'], 'core');
      assert.deepEqual(manifest.sources.conditional.operations, [], variant);
    }
  }

  const root = await project('innocent-fragments');
  await mkdir(path.join(root, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'operations', 'safe.md'), '# Safe runbook\n', 'utf8');
  await writeFile(path.join(root, 'docs', 'operations', 'secretary-notes.json'), '{}\n', 'utf8');
  await writeFile(path.join(root, 'docs', 'operations', 'monkey-data.json'), '{}\n', 'utf8');
  await writeFile(path.join(root, 'docs', 'operations', 'hockey-stats.json'), '{}\n', 'utf8');
  const manifest = await scanProject(root, ['codex'], 'core');
  assert.deepEqual(manifest.sources.conditional.operations, ['docs/operations/']);
});

test('project scan surfaces unexpected operations filesystem errors without leaking their message', async () => {
  const root = await project('operations-io-error');
  await mkdir(path.join(root, 'docs', 'operations'), { recursive: true });
  const denied = Object.assign(new Error('sensitive operating-system detail'), { code: 'EACCES' });

  await assert.rejects(
    scanProject(root, ['codex'], 'core', {
      operationsIo: {
        readdir: async () => { throw denied; },
      },
    }),
    (error) => {
      assert.equal(error.exitCode, 3);
      assert.match(error.message, /cannot inspect docs\/operations safely.*EACCES/i);
      assert.doesNotMatch(error.message, /sensitive operating-system detail/i);
      return true;
    },
  );
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
