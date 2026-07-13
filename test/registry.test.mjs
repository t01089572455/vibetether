import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

test('capability contracts are unique, complete, and forbid runtime auto-install', async () => {
  const registry = await json('registry/capabilities.json');
  const ids = registry.capabilities.map((capability) => capability.id);
  const required = [
    'requirements-clarification',
    'product-design',
    'planning',
    'implementation',
    'tdd',
    'debugging',
    'frontend-product-design',
    'frontend-engineering',
    'browser-verification',
    'security-review',
    'code-review',
    'release-verification',
  ];

  assert.equal(registry.schema_version, 1);
  assert.equal(registry.runtime_auto_install, false);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of required) assert.equal(ids.includes(id), true, `missing capability ${id}`);
  for (const capability of registry.capabilities) {
    assert.equal(Array.isArray(capability.required_inputs), true);
    assert.equal(Array.isArray(capability.required_outputs), true);
    assert.match(capability.fallback, /built-in/i);
  }
});

test('every lifecycle phase has exactly one built-in primary workflow provider', async () => {
  const registry = await json('registry/providers/core.json');
  const phases = ['discover', 'align', 'design', 'plan', 'execute', 'verify', 'review', 'ship'];

  for (const phase of phases) {
    const matches = registry.providers.filter(
      (provider) => provider.workflow_role === 'primary' && provider.phases.includes(phase) && provider.enabled_by_default,
    );
    assert.equal(matches.length, 1, `${phase} must have exactly one default primary provider`);
    assert.equal(matches[0].kind, 'built-in');
  }
});

test('remote candidates are auditable, inert by default, and constrained for UI page types', async () => {
  const registry = await json('registry/providers/core.json');
  const remote = registry.providers.filter((provider) => provider.kind === 'remote-candidate');
  assert.ok(remote.length >= 4);

  for (const provider of remote) {
    assert.equal(provider.enabled_by_default, false);
    assert.equal(provider.runtime_install, false);
    assert.match(provider.source, /^https:\/\/github\.com\//);
    assert.equal(typeof provider.version, 'string');
    assert.equal(typeof provider.license, 'string');
    assert.equal(typeof provider.integrity, 'string');
    assert.notEqual(provider.version, 'latest');
    if (provider.capabilities.includes('frontend-product-design')) {
      assert.ok(provider.page_types.length > 0, `${provider.id} requires page-type constraints`);
    }
  }
});

test('Codex and Claude adapters declare managed-only project behavior', async () => {
  for (const file of ['adapters/codex.json', 'adapters/claude-code.json']) {
    const adapter = await json(file);
    assert.equal(adapter.status, 'official-preview');
    assert.match(adapter.instruction_file, /^(AGENTS|CLAUDE)\.md$/);
    assert.match(adapter.skill_directory, /vibe-tether$/);
    assert.equal(adapter.managed_block.start, '<!-- vibetether:start -->');
    assert.equal(adapter.managed_block.end, '<!-- vibetether:end -->');
    assert.equal(adapter.enforcement, 'behavioral');
    assert.equal(adapter.overwrite_user_content, false);
  }
});
