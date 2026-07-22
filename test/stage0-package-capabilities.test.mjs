import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import { assertCapabilityCoverage } from '../scripts/test-stage0-package-contract.mjs';
import { baseline, installedPackageFixture, runCli, runGit } from './stage0-package-helpers.mjs';

test('S0-R05: packed public CLI routes every retained Stage 0 capability', { timeout: 180_000 }, async (t) => {
  const fixture = await installedPackageFixture('capabilities');
  t.after(fixture.cleanup);
  runGit(fixture.project, ['init', '-q']);
  runGit(fixture.project, ['config', 'user.email', 'test@example.com']);
  runGit(fixture.project, ['config', 'user.name', 'VibeTether Tests']);
  await writeFile(`${fixture.project}/app.txt`, 'initial\n');
  runGit(fixture.project, ['add', 'app.txt']);
  runGit(fixture.project, ['commit', '-qm', 'initial']);
  runCli(fixture, [
    'init', '--project', fixture.project, '--agent', 'codex', '--profile', 'extended',
    '--bundle', 'web', '--bundle', 'production', '--goal', 'Route every retained package capability.',
    '--success-evidence', 'Every installed capability has a public journey.', '--confirmed', '--yes', '--json',
  ]);
  const result = runCli(fixture, ['capabilities', '--json']);
  const report = JSON.parse(result.stdout);
  const inventory = await baseline();
  const expected = inventory.public_capabilities.map(({ id }) => id).sort();
  const actual = report.capabilities.map(({ id }) => id).sort();
  assert.deepEqual(actual, expected);

  const observed = [];
  for (const capability of report.capabilities) {
    const routed = JSON.parse(runCli(fixture, [
      'capabilities', '--project', fixture.project, '--phase', capability.phases[0], '--capability', capability.id,
      '--network', '--external-write', '--code-write', '--json',
    ]).stdout);
    assert.equal(routed.capability, capability.id);
    assert.equal(routed.phase, capability.phases[0]);
    assert.match(routed.selected.id, /^[a-z0-9][a-z0-9-]*$/);
    assert.ok(routed.shortlist.length >= 1 && routed.shortlist.length <= 3);
    assert.ok(capability.required_outputs.every((item) => routed.required_outputs.includes(item)));
    assert.ok(capability.exit_evidence.every((item) => routed.exit_evidence.includes(item)));
    observed.push({
      id: capability.id,
      journey_id: 'installed-capability-routing',
      phase: routed.phase,
      provider_id: routed.selected.id,
      provider_fingerprint: routed.selected.fingerprint,
      provider_object_hash: routed.selected.object_hash,
      shortlist_size: routed.shortlist.length,
    });
  }

  const coverage = assertCapabilityCoverage({ baseline: inventory, registry: report, observed });
  assert.equal(coverage.complete, true);
  assert.equal(coverage.covered_ids.length, expected.length);
  assert.deepEqual(coverage.missing_ids, []);
  assert.deepEqual(coverage.unrepresented_ids, []);
  assert.equal(inventory.public_capabilities.some((item) => item.maturity === 'designed' && !item.non_public_reason), false);
});
