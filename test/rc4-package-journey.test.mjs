import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const journey = path.join(root, 'scripts', 'test-package-journey.mjs');

test('the package journey gives packed code a minimal execution environment', async () => {
  const source = await readFile(journey, 'utf8');
  assert.match(source, /function minimalEnvironment\(/);
  assert.doesNotMatch(source, /env:\s*\{\s*\.\.\.process\.env\s*,\s*\.\.\.env\s*\}/);
});

test('the exact packed TGZ survives an isolated installed-binary control journey', { timeout: 180_000 }, () => {
  const result = spawnSync(process.execPath, [journey, '--json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, VIBETETHER_PACKAGE_JOURNEY_TEST: '1' },
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.source.clean, true);
  assert.match(report.source.commit, /^[a-f0-9]{40}$/);
  assert.match(report.source.tree, /^[a-f0-9]{40}$/);
  assert.equal(report.install.source_tree_imported, false);
  assert.equal(report.install.source_tree_import_guard, 'passed');
  assert.equal(report.archive.safe, true);
  assert.equal(report.journey.goal_blocked_after_one_slice, true);
  assert.equal(report.journey.goal_closed_after_two_slices, true);
  assert.equal(report.journey.release_blocked_without_release_authorization, true);
  assert.equal(report.journey.deep_revocation_blocks_finish, true);
  assert.equal(report.journey.project_launcher_reused_offline, true);
  assert.equal(report.journey.upgrade_previewed, true);
  assert.equal(report.journey.uninstall_preserved_modified_contract, true);
  assert.ok(Array.isArray(report.commands) && report.commands.length > 10);
});
