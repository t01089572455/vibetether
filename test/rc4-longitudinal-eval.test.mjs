import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('longitudinal evaluator blocks false completion and reports a recoverable next action', () => {
  const result = spawnSync(process.execPath, ['evals/run-longitudinal-evals.mjs', '--json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema_version, 1);
  assert.equal(report.ok, true);

  const scenarios = new Map(report.scenarios.map((item) => [item.id, item]));
  const expected = [
    'slice-green-parent-open',
    'unintegrated-external-report',
    'weakened-validator-without-mapping',
    'truth-revision-drift',
    'release-axes-open',
    'compaction-restores-exact-remaining-ids',
    'legacy-mismatched-truth-reconciliation',
  ];
  assert.deepEqual([...scenarios.keys()].sort(), expected.slice().sort());

  for (const id of expected) {
    const scenario = scenarios.get(id);
    assert.equal(scenario.ok, true, `${id}: ${JSON.stringify(scenario)}`);
    assert.equal(typeof scenario.requested_claim, 'string');
    assert.equal(typeof scenario.verdict, 'string');
    assert.equal(typeof scenario.next_action, 'string');
    assert.ok(scenario.next_action.length > 0);
  }

  const parentOpen = scenarios.get('slice-green-parent-open');
  assert.equal(parentOpen.completion_label, 'SLICE_GREEN');
  assert.ok(parentOpen.issue_codes.includes('GOAL_OUTCOMES_INCOMPLETE'));
  assert.deepEqual(parentOpen.remaining_outcome_ids, ['outcome_parent_open']);

  const external = scenarios.get('unintegrated-external-report');
  assert.ok(external.issue_codes.includes('INTEGRATION_WORKTREE_REQUIRED'));

  const weakened = scenarios.get('weakened-validator-without-mapping');
  assert.ok(weakened.issue_codes.includes('ACCEPTANCE_VALIDATOR_MISMATCH'));

  const drift = scenarios.get('truth-revision-drift');
  assert.ok(drift.issue_codes.includes('AUTHORITY_CHANGED'));

  const release = scenarios.get('release-axes-open');
  for (const code of ['RELEASE_AUTHORIZATION_REQUIRED', 'RELEASE_EVIDENCE_REQUIRED', 'RELEASE_GOAL_NOT_CLOSED']) {
    assert.ok(release.issue_codes.includes(code), `${code} missing from ${JSON.stringify(release.issue_codes)}`);
  }

  const compacted = scenarios.get('compaction-restores-exact-remaining-ids');
  assert.deepEqual(compacted.remaining_outcome_ids, ['outcome_remaining_a', 'outcome_remaining_b']);

  const legacy = scenarios.get('legacy-mismatched-truth-reconciliation');
  assert.ok(legacy.issue_codes.includes('BLOCKED_REANCHOR_REQUIRED'));
  assert.equal(legacy.recovered, true);
  assert.match(legacy.next_action, /step start/);
});
