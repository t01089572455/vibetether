import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initProject, jsonFile } from './helpers.mjs';
import {
  auditCoverageSources, emptyOutcomeRegistry, outcomeRegistryDigest,
  validateCoverageMapping, validateOutcomeRegistry,
} from '../src/outcomes.mjs';
import { discoverContract } from '../src/contract.mjs';
import { canonicalJson, sha256Text } from '../src/files.mjs';

const digest = (value) => `sha256:${sha256Text(value)}`;

function acceptance(id = 'export_browser_path') {
  return {
    id,
    claim: 'A user can export through the approved product entry point.',
    evidence_kind: 'command-or-artifact',
    required_maturity: 'functional',
    validator: {
      kind: 'command',
      command: ['node', '--test', 'test/export-browser-path.test.mjs'],
      validator_revision: digest('export-validator-v1'),
      covers_paths: ['src/export/**'],
    },
  };
}

function outcome(id = 'outcome_export_contract') {
  return {
    id,
    title: 'Users can export the approved report format',
    authority_sources: ['truth:truth_product_export_contract'],
    parent_id: null,
    dependencies: [],
    superseded_by: [],
    disposition: 'required',
    required_at: ['goal', 'release'],
    acceptance: [acceptance()],
    decision_receipt: {
      id: 'decision-11111111-1111-4111-8111-111111111111',
      action: 'confirm-required',
      target_ids: [id],
      prior_registry_digest: digest('prior'),
      result_registry_digest: digest('result'),
      user_message_locator: 'user-message:test-confirm-outcome',
      reason: 'The user approved this result as part of the current goal.',
      recorded_at: '2026-07-21T00:00:00.000Z',
    },
    revision_digest: digest(`${id}-v1`),
  };
}

function registryWithSource() {
  const registry = emptyOutcomeRegistry('goal_product_delivery', digest('goal-v1'));
  registry.outcomes = [outcome()];
  registry.coverage_sources = [{
    id: 'source_product_requirements',
    truth_id: 'truth_product_requirements',
    source_revision_digest: digest('requirements-v1'),
    expected_id_count: 5,
    expected_id_set_digest: digest(canonicalJson(['REQ-001', 'REQ-002', 'REQ-003', 'REQ-004', 'REQ-005'])),
    mapping_path: '.vibetether/coverage/product-requirements.json',
    mapping_revision_digest: digest('placeholder'),
  }];
  return registry;
}

function validMapping() {
  return {
    schema_version: 1,
    source_id: 'source_product_requirements',
    source_revision_digest: digest('requirements-v1'),
    entries: [
      { source_item_id: 'REQ-001', disposition: 'mapped', outcome_ids: ['outcome_export_contract'], equivalence_group: 'export-user-result', reason: 'This source item defines the observable export result.' },
      { source_item_id: 'REQ-002', disposition: 'duplicate_of', target_source_item_ids: ['REQ-001'], reason: 'This repeats REQ-001 without a distinct result.' },
      { source_item_id: 'REQ-003', disposition: 'historical', reason: 'This describes a retired historical constraint.' },
      { source_item_id: 'REQ-004', disposition: 'rejected', reason: 'The user explicitly rejected this source item.' },
      { source_item_id: 'REQ-005', disposition: 'superseded_by', target_source_item_ids: ['REQ-001'], reason: 'REQ-001 is the current replacement for this item.' },
    ],
  };
}

test('fresh initialization creates a schema-2 draft Outcome Contract and deterministic progress projection', async () => {
  const f = await initProject('rc4-outcome-init');
  const manifest = await jsonFile(path.join(f.root, '.vibetether', 'project.json'));
  assert.equal(manifest.schema_version, 2);
  assert.equal(manifest.vibetether_version, '1.0.0-rc.4');
  assert.equal(manifest.outcome_index, '.vibetether/outcomes.json');
  assert.equal(manifest.progress_projection, '.vibetether/PROGRESS.md');
  const registry = await jsonFile(path.join(f.root, manifest.outcome_index));
  assert.equal(registry.coverage_status, 'draft');
  assert.deepEqual(registry.coverage_sources, []);
  assert.deepEqual(registry.outcomes, []);
  assert.match(await readFile(path.join(f.root, manifest.progress_projection), 'utf8'), /Coverage status: draft/);
  assert.match(await readFile(path.join(f.root, manifest.progress_projection), 'utf8'), /Precise completion label: NOT_STARTED/);
});

test('Outcome Contract rejects unknown fields, unsafe identities, duplicates, and dangling dependencies', () => {
  const valid = emptyOutcomeRegistry('goal_product_delivery', digest('goal-v1'));
  assert.equal(outcomeRegistryDigest(validateOutcomeRegistry(structuredClone(valid))).startsWith('sha256:'), true);
  assert.throws(() => validateOutcomeRegistry({ ...valid, mystery: true }), /unsupported field/i);
  assert.throws(() => validateOutcomeRegistry({ ...valid, goal_id: '../goal' }), /goal_id/i);

  const duplicate = structuredClone(valid);
  duplicate.outcomes = [outcome(), outcome()];
  assert.throws(() => validateOutcomeRegistry(duplicate), /Duplicate Outcome/i);

  const dangling = structuredClone(valid);
  dangling.outcomes = [outcome()];
  dangling.outcomes[0].dependencies = ['outcome_missing'];
  assert.throws(() => validateOutcomeRegistry(dangling), /dependency/i);

  const duplicateAcceptance = structuredClone(valid);
  duplicateAcceptance.outcomes = [outcome(), outcome('outcome_second')];
  assert.throws(() => validateOutcomeRegistry(duplicateAcceptance), /acceptance/i);
});

test('exact source mapping validates all dispositions and fails closed on structural drift', () => {
  const registry = registryWithSource();
  const mapping = validMapping();
  assert.equal(validateCoverageMapping(mapping, registry).entries.length, 5);

  const unknownOutcome = structuredClone(mapping);
  unknownOutcome.entries[0].outcome_ids = ['outcome_missing'];
  assert.throws(() => validateCoverageMapping(unknownOutcome, registry), /unknown Outcome/i);

  const duplicateId = structuredClone(mapping);
  duplicateId.entries.push(structuredClone(duplicateId.entries[0]));
  assert.throws(() => validateCoverageMapping(duplicateId, registry), /Duplicate source item/i);

  const cyclic = structuredClone(mapping);
  cyclic.entries[0] = { source_item_id: 'REQ-001', disposition: 'duplicate_of', target_source_item_ids: ['REQ-002'], reason: 'Cycle first edge.' };
  assert.throws(() => validateCoverageMapping(cyclic, registry), /cycle/i);

  const incompatible = structuredClone(mapping);
  incompatible.entries[2].outcome_ids = ['outcome_export_contract'];
  assert.throws(() => validateCoverageMapping(incompatible, registry), /incompatible/i);
});

test('coverage audit binds mapping bytes, source revision, count, and exact ID set', async () => {
  const f = await initProject('rc4-outcome-audit');
  const context = await discoverContract(f.root);
  const registry = registryWithSource();
  const mapping = validMapping();
  registry.coverage_sources[0].mapping_revision_digest = digest(canonicalJson(mapping));
  await mkdir(path.join(f.root, '.vibetether', 'coverage'), { recursive: true });
  await writeFile(path.join(f.root, '.vibetether', 'coverage', 'product-requirements.json'), canonicalJson(mapping));
  const report = await auditCoverageSources(context, registry);
  assert.equal(report.ok, true);
  assert.equal(report.sources[0].mapped_count, 5);

  registry.coverage_sources[0].expected_id_count = 4;
  const drift = await auditCoverageSources(context, registry);
  assert.equal(drift.ok, false);
  assert.ok(drift.issues.some((item) => item.code === 'SOURCE_ID_COUNT_MISMATCH'));
});
