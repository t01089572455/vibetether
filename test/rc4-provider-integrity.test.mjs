import assert from 'node:assert/strict';
import { cp, link, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { createSkillsLock, discoverContract } from '../src/contract.mjs';
import { writeProjectJson, readJsonFile, exists } from '../src/files.mjs';
import {
  approveProvider, evaluateProvider, execSkillScript, exposeProvider, promoteProvider,
} from '../src/skills.mjs';
import { importProvider, providerCardPath } from '../src/provider-cache.mjs';
import { loadProviderRegistry } from '../src/provider-registry.mjs';
import { assertProviderClosure, inspectProviderTree } from '../src/provider-integrity.mjs';
import { startStep, abandonStep } from '../src/step.mjs';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { fixture, initProject, testSuccessCheck } from './helpers.mjs';

async function providerSource(base, id) {
  const source = path.join(base, id);
  await mkdir(path.join(source, 'references'), { recursive: true });
  await mkdir(path.join(source, 'scripts'), { recursive: true });
  await writeFile(path.join(source, 'SKILL.md'), `---
name: ${id}
description: Provider fixture with a complete declared resource closure.
---

# ${id}

Read \`references/rules.md\` and use \`scripts/check.mjs\` for the focused check.
`);
  await writeFile(path.join(source, 'references', 'rules.md'), '# Rules\n\nUse the materialized closure.\n');
  await writeFile(path.join(source, 'scripts', 'check.mjs'), `import { accessSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
accessSync(path.join(here, '..', 'references', 'rules.md'));
process.stdout.write(process.env.VIBETETHER_UNDECLARED_SECRET ? 'leaked' : 'clean');
`);
  return source;
}

async function stableProvider(base, id) {
  const source = await providerSource(base, id);
  const card = await importProvider({
    id,
    source,
    source_label: `local:${id}`,
    version: '1.0.0',
    license: 'MIT',
    capabilities: ['implementation'],
    phases: ['EXECUTE_ONE'],
    positive_triggers: ['provider-integrity'],
    hosts: ['codex', 'claude'],
    operating_systems: [process.platform],
    code_write: true,
  });
  await evaluateProvider(id, {
    true_positive: 9,
    false_positive: 1,
    false_negative: 0,
    output_gain: 0.3,
    notes: 'Deterministic Provider integrity fixture.',
  });
  await approveProvider(id);
  return promoteProvider(id);
}

async function pinProvider(root, card) {
  const context = await discoverContract(root);
  const lock = {
    ...createSkillsLock(),
    packs: context.skills.packs,
    pins: [{
      id: card.id,
      object_hash: card.object_hash,
      fingerprint: card.fingerprint,
      source: card.source,
      version: card.version,
      license: card.license,
    }],
    preferences: [card.id],
  };
  await writeProjectJson(context.root, context.manifest.skills_lock, lock);
}

test('every packaged Provider carries an immutable expected digest in the release registry', async () => {
  const registry = JSON.parse(await readFile(new URL('../registry/providers.json', import.meta.url), 'utf8'));
  assert.ok(registry.providers.length > 30);
  for (const provider of registry.providers) {
    assert.match(provider.object_hash ?? '', /^[a-f0-9]{64}$/, `${provider.id} object_hash`);
    assert.equal(provider.fingerprint, provider.object_hash, `${provider.id} expected fingerprint`);
  }
});

test('a one-byte packaged Provider change cannot redefine its own expected identity', async () => {
  const { base } = await fixture('provider-packaged-tamper', { gitRepo: false });
  const registry = JSON.parse(await readFile(new URL('../registry/providers.json', import.meta.url), 'utf8'));
  const card = registry.providers.find((item) => item.id === 'vibetether-built-in-implementation');
  const source = path.resolve(path.dirname(fileURLToPath(new URL('../registry/providers.json', import.meta.url))), '..', card.path);
  const copied = path.join(base, 'tampered-provider');
  await cp(source, copied, { recursive: true });
  await writeFile(path.join(copied, 'SKILL.md'), `${await readFile(path.join(copied, 'SKILL.md'), 'utf8')}x`);
  const observed = await inspectProviderTree(copied);
  assert.notEqual(observed.digest, card.fingerprint);
  assert.throws(() => assertProviderClosure(card, observed), /immutable|digest|fingerprint|differs|context_bytes/i);
});

test('normalized Provider identity is stable across LF and CRLF worktrees', async () => {
  const { base } = await fixture('provider-portable-newlines', { gitRepo: false });
  const registry = JSON.parse(await readFile(new URL('../registry/providers.json', import.meta.url), 'utf8'));
  const card = registry.providers.find((item) => item.id === 'vibetether-built-in-implementation');
  const source = path.resolve(path.dirname(fileURLToPath(new URL('../registry/providers.json', import.meta.url))), '..', card.path);
  const copied = path.join(base, 'crlf-provider');
  await cp(source, copied, { recursive: true });
  const skillPath = path.join(copied, 'SKILL.md');
  await writeFile(skillPath, (await readFile(skillPath, 'utf8')).replace(/\r?\n/g, '\r\n'));
  const observed = await inspectProviderTree(copied);
  assert.equal(observed.digest, card.fingerprint);
  assert.doesNotThrow(() => assertProviderClosure(card, observed));
});

test('activation materializes the declared entry, resource, and script closure', async () => {
  const { root, base } = await initProject('provider-materialized-activation');
  const card = await stableProvider(base, 'materialized-provider');
  await pinProvider(root, card);
  const started = await startStep({
    project: root,
    phase: 'EXECUTE_ONE',
    capability: 'implementation',
    slice: 'Exercise the complete Provider closure.',
    success_evidence: ['The focused Provider check passes.'],
    success_checks: [testSuccessCheck('The focused Provider check passes.')],
    signals: ['provider-integrity'],
    agent: 'codex',
    provider: card.id,
    code_write: true,
    confirmed_by_user: true,
    decision_reason: 'The test author approved this exact Provider integrity fixture.',
  });
  const context = await discoverContract(root);
  const authority = await authoritySnapshot(context.executionRoot, parseTruthMap(context.truthSource), context.intentSource);
  const runtime = await attachWorktree(context, authority.authority_digest);
  const materialized = started.activation.materialized_root;
  assert.equal(await exists(path.join(materialized, 'SKILL.md')), true);
  assert.equal(await exists(path.join(materialized, 'references', 'rules.md')), true);
  assert.equal(await exists(path.join(materialized, 'scripts', 'check.mjs')), true);
  process.env.VIBETETHER_UNDECLARED_SECRET = 'must-not-leak';
  try {
    const result = await execSkillScript(runtime.paths, started.activation.activation_id, 'scripts/check.mjs');
    assert.equal(result.exit_code, 0, JSON.stringify(result));
    assert.equal(result.stdout, 'clean');
    await writeFile(path.join(materialized, 'references', 'rules.md'), 'tampered after activation\n');
    await assert.rejects(
      execSkillScript(runtime.paths, started.activation.activation_id, 'scripts/check.mjs'),
      /immutable|digest|fingerprint|differs/i,
    );
  } finally { delete process.env.VIBETETHER_UNDECLARED_SECRET; }
  await abandonStep({ project: root, reason: 'Provider integrity fixture completed.' });
});

test('explicit exposure copies the complete Provider closure and protects it from overwrite', async () => {
  const { root, base } = await initProject('provider-complete-exposure');
  const card = await stableProvider(base, 'complete-exposed-provider');
  const context = await discoverContract(root);
  const exposed = await exposeProvider(context, card.id, { agent: 'codex', scope: 'project' });
  const exposedRoot = path.dirname(exposed.path);
  assert.equal(await exists(path.join(exposedRoot, 'references', 'rules.md')), true);
  assert.equal(await exists(path.join(exposedRoot, 'scripts', 'check.mjs')), true);
  await writeFile(path.join(exposedRoot, 'references', 'rules.md'), 'user customization\n');
  await assert.rejects(
    exposeProvider(context, card.id, { agent: 'codex', scope: 'project' }),
    /collision|modified|different bytes|fingerprint|differs from.*digest/i,
  );
});

test('external Provider cards cannot omit files that exist in their immutable object', async () => {
  const { base } = await fixture('provider-undeclared-resource');
  const card = await stableProvider(base, 'undeclared-resource-provider');
  const stored = await readJsonFile(providerCardPath(card.id), 'Provider card');
  stored.resources = [];
  await writeFile(providerCardPath(card.id), `${JSON.stringify(stored, null, 2)}\n`);
  await assert.rejects(loadProviderRegistry(), /declared|resource|closure/i);
});

test('Provider import rejects hard-linked source files', async (t) => {
  const { base } = await fixture('provider-hardlink');
  const source = await providerSource(base, 'hardlinked-provider');
  try {
    await link(path.join(source, 'references', 'rules.md'), path.join(source, 'references', 'rules-copy.md'));
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`Host denied hardlink creation: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(importProvider({
    id: 'hardlinked-provider',
    source,
    version: '1.0.0',
    license: 'MIT',
    capabilities: ['implementation'],
    phases: ['EXECUTE_ONE'],
  }), /hard.?link|unsupported/i);
});

test('archive entry validation rejects traversal, ADS, reserved names, links, devices, and bombs', async () => {
  const integrity = await import('../src/provider-integrity.mjs').catch(() => null);
  assert.equal(typeof integrity?.validateProviderArchiveEntries, 'function');
  const unsafe = [
    [{ path: '../escape', type: 'file', size: 1 }],
    [{ path: '/absolute', type: 'file', size: 1 }],
    [{ path: 'C:/absolute', type: 'file', size: 1 }],
    [{ path: 'references\\rules.md', type: 'file', size: 1 }],
    [{ path: 'scripts/payload.js:secret', type: 'file', size: 1 }],
    [{ path: 'CON.txt', type: 'file', size: 1 }],
    [{ path: 'Rules.md', type: 'file', size: 1 }, { path: 'rules.md', type: 'file', size: 1 }],
    [{ path: 'linked', type: 'symlink', size: 0 }],
    [{ path: 'linked', type: 'hardlink', size: 0 }],
    [{ path: 'device', type: 'device', size: 0 }],
    [{ path: 'bomb.bin', type: 'file', size: 33 * 1024 * 1024, compressed_size: 1 }],
  ];
  for (const entries of unsafe) {
    assert.throws(() => integrity.validateProviderArchiveEntries(entries), /unsafe|path|link|device|size|archive|limit|portable/i);
  }
});
