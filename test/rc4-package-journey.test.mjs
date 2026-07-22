import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateStage0PackageReport } from '../scripts/test-stage0-package-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const journey = path.join(root, 'scripts', 'test-package-journey.mjs');

test('the package journey gives packed code a minimal execution environment', async () => {
  const source = await readFile(journey, 'utf8');
  assert.match(source, /function minimalEnvironment\(/);
  assert.doesNotMatch(source, /env:\s*\{\s*\.\.\.process\.env\s*,\s*\.\.\.env\s*\}/);
});

test('S0-R05: exact-package hygiene rejects a deliberately dirty disposable source clone', async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'vibetether-dirty-source-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const clone = path.join(base, 'source clone');
  const copied = spawnSync('git', ['clone', '--quiet', '--local', '--no-hardlinks', root, clone], {
    cwd: base, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(copied.status, 0, copied.stderr || copied.stdout);
  await writeFile(path.join(clone, 'DIRTY-PACKAGE-SOURCE.txt'), 'uncommitted\n');
  const result = spawnSync(process.execPath, [journey, '--source', clone, '--json'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PACKAGE_SOURCE_DIRTY/);
  assert.match(result.stderr, new RegExp(clone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
});

test('the exact packed TGZ survives the complete isolated Stage 0 package journey', { timeout: 300_000 }, async () => {
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
  assert.ok(report.archive.files.includes('package/bin/vibetether.mjs'));
  assert.ok(report.archive.files.includes('package/registry/capabilities.json'));
  assert.equal(report.archive.sha256, report.install.tgz_sha256);
  assert.equal(report.runtime.node, process.version);
  assert.equal(report.runtime.platform, process.platform);
  assert.equal(report.runtime.arch, process.arch);
  assert.equal(report.fresh_contract.truth_confirmed, 0);
  assert.equal(report.fresh_contract.truth_candidates, 0);
  assert.equal(report.fresh_contract.truth_declined, 0);
  assert.equal(report.fresh_contract.repository_documents_activated, false);
  assert.equal(report.providers.runtime_download_directory_created, false);
  assert.deepEqual(report.providers.profile_ids.sort(), ['core', 'extended', 'production', 'standard', 'web']);
  assert.equal(report.providers.integrity_tamper_rejected, true);
  assert.equal(report.custom_routes.overlay_union_only, true);
  assert.equal(report.custom_routes.ambiguous_primaries_rejected, true);
  assert.equal(report.custom_routes.ui_prerequisite_not_weakened, true);
  assert.equal(report.custom_routes.permission_boundary_not_weakened, true);
  assert.equal(report.upgrade.user_routes_byte_preserved, true);
  assert.equal(report.upgrade.provider_choices_byte_preserved, true);
  assert.equal(report.upgrade.rollback_byte_exact, true);
  assert.equal(report.proven_path.recalled_when_matching, true);
  assert.equal(report.proven_path.artifact_change_invalidated, true);
  assert.equal(report.proven_path.skills_change_invalidated, true);
  assert.equal(report.proven_path.authority_change_invalidated, true);
  assert.equal(report.capability_coverage.complete, true);
  assert.equal(report.capability_coverage.covered_ids.length, 45);
  assert.equal(report.journey.goal_blocked_after_one_slice, true);
  assert.equal(report.journey.goal_closed_after_two_slices, true);
  assert.equal(report.journey.release_blocked_without_release_authorization, true);
  assert.equal(report.journey.deep_revocation_blocks_finish, true);
  assert.equal(report.journey.project_launcher_reused_offline, true);
  assert.equal(report.journey.upgrade_previewed, true);
  assert.equal(report.journey.uninstall_preserved_modified_contract, true);
  assert.equal(report.cleanup.completed, true);
  assert.equal(report.cleanup.base_removed, true);
  assert.ok(Array.isArray(report.commands) && report.commands.length > 10);
  assert.equal(validateStage0PackageReport(report).ok, true);
});
