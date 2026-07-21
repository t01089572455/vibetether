import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initProject, jsonFile, mainJson, writeJson } from './helpers.mjs';
import { main } from '../src/cli.mjs';
import { canonicalJson, sha256Text } from '../src/files.mjs';

const digest = (value) => `sha256:${sha256Text(value)}`;

function candidate(id, acceptanceId = `${id}_acceptance`) {
  return {
    id,
    title: `Deliver ${id.replaceAll('_', ' ')}`,
    authority_sources: ['truth:truth_project_direction'],
    parent_id: null,
    dependencies: [],
    superseded_by: [],
    disposition: 'candidate',
    required_at: ['goal'],
    acceptance: [{
      id: acceptanceId,
      claim: `The real product path proves ${id}.`,
      evidence_kind: 'command-or-artifact',
      required_maturity: 'functional',
      validator: {
        kind: 'command',
        command: ['node', '--test', `test/${id}.test.mjs`],
        validator_revision: digest(`${id}-validator-v1`),
        covers_paths: [`src/${id}/**`],
      },
    }],
    decision_receipt: null,
    revision_digest: digest(`${id}-v1`),
  };
}

async function propose(root, value) {
  return mainJson(['outcomes', 'propose', '--project', root, '--outcome-json', JSON.stringify(value), '--yes']);
}

async function decide(root, action, id, extra = []) {
  return mainJson([
    'outcomes', action, '--project', root, '--id', id,
    '--user-message-locator', `user-message:approve-${action}-${id}`,
    '--reason', `The user explicitly approved ${action} for ${id} in the current goal.`,
    '--yes', ...extra,
  ]);
}

test('Outcome commands preview by default and bare yes cannot grant directional authority', async () => {
  const f = await initProject('rc4-outcome-preview');
  const value = candidate('outcome_export_contract', 'export_browser_path');
  const preview = await mainJson(['outcomes', 'propose', '--project', f.root, '--outcome-json', JSON.stringify(value)]);
  assert.equal(preview.applied, false);
  assert.equal((await jsonFile(path.join(f.root, '.vibetether', 'outcomes.json'))).outcomes.length, 0);

  const applied = await propose(f.root, value);
  assert.equal(applied.applied, true);
  assert.equal(applied.outcome.id, value.id);
  await assert.rejects(
    main(['outcomes', 'confirm', '--project', f.root, '--id', value.id, '--yes']),
    (error) => error.code === 'USER_DECISION_REQUIRED',
  );
  assert.equal((await jsonFile(path.join(f.root, '.vibetether', 'outcomes.json'))).outcomes[0].disposition, 'candidate');
});

test('user-grounded decisions confirm, defer, reject, and supersede named Outcomes', async () => {
  const f = await initProject('rc4-outcome-decisions');
  for (const value of [
    candidate('outcome_export_contract'), candidate('outcome_deferred_report'),
    candidate('outcome_rejected_theme'), candidate('outcome_old_login'), candidate('outcome_new_login'),
  ]) await propose(f.root, value);

  assert.equal((await decide(f.root, 'confirm', 'outcome_export_contract')).disposition, 'required');
  assert.equal((await decide(f.root, 'defer', 'outcome_deferred_report')).disposition, 'deferred');
  assert.equal((await decide(f.root, 'reject', 'outcome_rejected_theme')).disposition, 'rejected');
  await decide(f.root, 'confirm', 'outcome_new_login');
  const superseded = await decide(f.root, 'supersede', 'outcome_old_login', ['--replacement', 'outcome_new_login']);
  assert.equal(superseded.disposition, 'superseded');
  assert.deepEqual(superseded.superseded_by, ['outcome_new_login']);

  const registry = await jsonFile(path.join(f.root, '.vibetether', 'outcomes.json'));
  for (const item of registry.outcomes) if (item.disposition !== 'candidate') {
    assert.match(item.decision_receipt.user_message_locator, /^user-message:/);
    assert.match(item.decision_receipt.result_registry_digest, /^sha256:[a-f0-9]{64}$/);
  }
});

test('coverage confirmation requires exact source audit, resolved candidates, and a user decision', async () => {
  const f = await initProject('rc4-outcome-coverage-confirm');
  await propose(f.root, candidate('outcome_export_contract', 'export_browser_path'));
  await decide(f.root, 'confirm', 'outcome_export_contract');
  const registryPath = path.join(f.root, '.vibetether', 'outcomes.json');
  const registry = await jsonFile(registryPath);
  const mapping = {
    schema_version: 1,
    source_id: 'source_product_requirements',
    source_revision_digest: digest('requirements-v1'),
    entries: [{
      source_item_id: 'REQ-001', disposition: 'mapped', outcome_ids: ['outcome_export_contract'],
      equivalence_group: 'export-result', reason: 'REQ-001 defines the confirmed export result.',
    }],
  };
  await mkdir(path.join(f.root, '.vibetether', 'coverage'), { recursive: true });
  await writeFile(path.join(f.root, '.vibetether', 'coverage', 'requirements.json'), canonicalJson(mapping));
  registry.coverage_sources = [{
    id: mapping.source_id,
    truth_id: 'truth_product_requirements',
    source_revision_digest: mapping.source_revision_digest,
    expected_id_count: 1,
    expected_id_set_digest: digest(canonicalJson(['REQ-001'])),
    mapping_path: '.vibetether/coverage/requirements.json',
    mapping_revision_digest: digest(canonicalJson(mapping)),
  }];
  await writeJson(registryPath, registry);

  await assert.rejects(
    main(['outcomes', 'coverage', 'confirm', '--project', f.root, '--yes']),
    (error) => error.code === 'USER_DECISION_REQUIRED',
  );
  const confirmed = await mainJson([
    'outcomes', 'coverage', 'confirm', '--project', f.root,
    '--user-message-locator', 'user-message:confirmed-complete-coverage',
    '--reason', 'The user reviewed the exact declared source universe and approved it as the current goal boundary.',
    '--yes',
  ]);
  assert.equal(confirmed.coverage_status, 'confirmed');
  assert.match(confirmed.integration_worktree_id, /.+/);

  const progress = await readFile(path.join(f.root, '.vibetether', 'PROGRESS.md'), 'utf8');
  assert.match(progress, /Coverage status: confirmed/);
  assert.match(progress, /Remaining Outcome IDs: outcome_export_contract/);
});

test('coverage confirmation blocks unresolved candidates and mapping drift', async () => {
  const f = await initProject('rc4-outcome-coverage-block');
  await propose(f.root, candidate('outcome_unresolved_candidate'));
  await assert.rejects(
    main([
      'outcomes', 'coverage', 'confirm', '--project', f.root,
      '--user-message-locator', 'user-message:attempted-coverage',
      '--reason', 'The requested coverage still contains an unresolved candidate.', '--yes',
    ]),
    (error) => error.code === 'OUTCOME_CANDIDATES_UNRESOLVED',
  );
  await decide(f.root, 'reject', 'outcome_unresolved_candidate');
  const registryPath = path.join(f.root, '.vibetether', 'outcomes.json');
  const registry = await jsonFile(registryPath);
  registry.coverage_sources = [{
    id: 'source_missing_mapping', truth_id: 'truth_missing_mapping',
    source_revision_digest: digest('source-v1'), expected_id_count: 1,
    expected_id_set_digest: digest(canonicalJson(['REQ-MISSING'])),
    mapping_path: '.vibetether/coverage/missing.json',
    mapping_revision_digest: digest('missing-mapping'),
  }];
  await writeJson(registryPath, registry);
  await assert.rejects(
    main([
      'outcomes', 'coverage', 'confirm', '--project', f.root,
      '--user-message-locator', 'user-message:attempted-drifted-coverage',
      '--reason', 'The mapping is intentionally missing in this safety regression.', '--yes',
    ]),
    (error) => error.code === 'COVERAGE_AUDIT_FAILED',
  );
});
