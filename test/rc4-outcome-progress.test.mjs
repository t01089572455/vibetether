import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { main } from '../src/cli.mjs';
import { buildContext } from '../src/context.mjs';
import { discoverContract } from '../src/contract.mjs';
import { finishStep, startStep } from '../src/step.mjs';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { readOutcomeProgress } from '../src/outcome-progress.mjs';
import { readRoute } from '../src/runtime.mjs';
import { initProject, mainJson, routeProofOptions } from './helpers.mjs';
import { sha256Text } from '../src/files.mjs';

const digest = (value) => `sha256:${sha256Text(value)}`;
const ARTIFACT = 'export-result.txt';

function outcome(id, acceptanceIds) {
  return {
    id, title: `Deliver ${id}`, authority_sources: ['truth:truth_project_direction'],
    parent_id: null, dependencies: [], superseded_by: [], disposition: 'candidate', required_at: ['goal'],
    acceptance: acceptanceIds.map((acceptanceId) => ({
      id: acceptanceId, claim: `The final product proves ${acceptanceId}.`,
      evidence_kind: 'command-or-artifact', required_maturity: 'functional',
      validator: {
        kind: 'command',
        command: [process.execPath, '-e', `const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(ARTIFACT)},'utf8')!=='verified\\n')process.exit(7)`],
        validator_revision: digest(`${acceptanceId}-validator-v1`), covers_paths: [ARTIFACT],
      },
    })),
    decision_receipt: null, revision_digest: digest(`${id}-v1`),
  };
}

async function govern(root, values) {
  for (const value of values) {
    await mainJson(['outcomes', 'propose', '--project', root, '--outcome-json', JSON.stringify(value), '--yes']);
    await mainJson([
      'outcomes', 'confirm', '--project', root, '--id', value.id,
      '--user-message-locator', `user-message:confirm-${value.id}`,
      '--reason', `The user confirmed ${value.id} as a required result.`, '--yes',
    ]);
  }
  await mainJson([
    'outcomes', 'coverage', 'confirm', '--project', root,
    '--user-message-locator', 'user-message:confirm-complete-coverage',
    '--reason', 'The user confirmed the declared Outcome set as the complete current goal boundary.', '--yes',
  ]);
}

function successCheck(acceptanceId) {
  return {
    id: `check-${acceptanceId}`,
    claim: `The final product proves ${acceptanceId}.`,
    kind: 'command',
    command: [process.execPath, '-e', `const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(ARTIFACT)},'utf8')!=='verified\\n')process.exit(7)`],
    covers_paths: [ARTIFACT], consumer_paths: [ARTIFACT], acceptance_ids: [acceptanceId],
  };
}

async function begin(root, outcomeId, acceptanceId) {
  return startStep({
    project: root, phase: 'EXECUTE_ONE', capability: 'implementation',
    slice: `Implement ${acceptanceId}.`, task_text: `Implement the approved ${acceptanceId} slice.`,
    outcome_ids: [outcomeId], scope_paths: [ARTIFACT],
    success_evidence: [`The final product proves ${acceptanceId}.`], success_checks: [successCheck(acceptanceId)],
    signals: ['approved-feature'], code_write: true,
    confirmed_by_user: true, decision_reason: `The user approved the exact ${acceptanceId} slice.`,
  });
}

async function runtimeFor(root) {
  const context = await discoverContract(root);
  const authority = await authoritySnapshot(context.executionRoot, parseTruthMap(context.truthSource), context.intentSource);
  return { context, runtime: await attachWorktree(context, authority.authority_digest) };
}

test('confirmed coverage requires a required Outcome and declared acceptance mapping', async () => {
  const { root } = await initProject('rc4-progress-binding');
  await govern(root, [outcome('outcome_export_contract', ['export_contract', 'export_browser_path'])]);
  await assert.rejects(
    startStep({
      project: root, phase: 'EXECUTE_ONE', capability: 'implementation', slice: 'Unbound write.',
      success_evidence: ['Unbound check.'], success_checks: [{ ...successCheck('export_contract'), claim: 'Unbound check.' }],
      scope_paths: [ARTIFACT], code_write: true, confirmed_by_user: true, decision_reason: 'Fixture only.',
    }),
    (error) => error.code === 'OUTCOME_REQUIRED',
  );
  await assert.rejects(begin(root, 'outcome_export_contract', 'unknown_acceptance'), (error) => error.code === 'ACCEPTANCE_NOT_FOUND');
  await assert.rejects(begin(root, 'outcome_missing', 'export_contract'), (error) => error.code === 'OUTCOME_NOT_FOUND');
});

test('route evidence advances only mapped acceptance IDs and generated progress lists exact remaining work', async () => {
  const { root } = await initProject('rc4-progress-advance');
  await govern(root, [
    outcome('outcome_export_contract', ['export_contract', 'export_browser_path']),
    outcome('outcome_release_integrity', ['release_package_path']),
  ]);

  const first = await begin(root, 'outcome_export_contract', 'export_contract');
  await writeFile(path.join(root, ARTIFACT), 'verified\n');
  await finishStep({ project: root, ...routeProofOptions(first.route, ARTIFACT) });
  let { context, runtime } = await runtimeFor(root);
  let progress = await readOutcomeProgress(runtime.paths, context.outcomes);
  assert.equal(progress.outcomes.outcome_export_contract.state, 'in-progress');
  assert.deepEqual(progress.outcomes.outcome_export_contract.satisfied_acceptance_ids, ['export_contract']);
  assert.deepEqual(progress.outcomes.outcome_export_contract.missing_acceptance_ids, ['export_browser_path']);

  const projection = await readFile(path.join(root, '.vibetether', 'PROGRESS.md'), 'utf8');
  assert.match(projection, /outcome_export_contract/);
  assert.match(projection, /outcome_release_integrity/);
  assert.match(projection, /Precise completion label: SLICE_GREEN/);
  assert.match(projection, /export_browser_path/);

  await writeFile(path.join(root, ARTIFACT), 'before-second-slice\n');
  const second = await begin(root, 'outcome_export_contract', 'export_browser_path');
  await writeFile(path.join(root, ARTIFACT), 'verified\n');
  await finishStep({ project: root, ...routeProofOptions(second.route, ARTIFACT) });
  ({ context, runtime } = await runtimeFor(root));
  progress = await readOutcomeProgress(runtime.paths, context.outcomes);
  assert.equal(progress.outcomes.outcome_export_contract.state, 'satisfied');
  assert.deepEqual(progress.outcomes.outcome_export_contract.missing_acceptance_ids, []);
  assert.equal(progress.outcomes.outcome_release_integrity.state, 'open');
});

test('modified or missing generated progress blocks completion without advancing runtime state', async () => {
  for (const mode of ['modified', 'missing']) {
    const { root } = await initProject(`rc4-progress-${mode}`);
    await govern(root, [outcome('outcome_export_contract', ['export_contract'])]);
    const started = await begin(root, 'outcome_export_contract', 'export_contract');
    const progressPath = path.join(root, '.vibetether', 'PROGRESS.md');
    if (mode === 'modified') await writeFile(progressPath, '# hand edited\n');
    else await rm(progressPath);
    await writeFile(path.join(root, ARTIFACT), 'verified\n');
    await assert.rejects(
      finishStep({ project: root, ...routeProofOptions(started.route, ARTIFACT) }),
      (error) => ['PROGRESS_PROJECTION_CHANGED', 'PROGRESS_PROJECTION_MISSING'].includes(error.code),
    );
    const { context, runtime } = await runtimeFor(root);
    const route = await readRoute(runtime.paths);
    assert.equal(route.status, 'active');
    const progress = await readOutcomeProgress(runtime.paths, context.outcomes);
    assert.equal(progress.outcomes.outcome_export_contract.state, 'open');
  }
});

test('failed final control transaction leaves route, Outcome progress, and projection on the prior generation', async () => {
  const { root } = await initProject('rc4-progress-transaction');
  await govern(root, [outcome('outcome_export_contract', ['export_contract'])]);
  const started = await begin(root, 'outcome_export_contract', 'export_contract');
  await writeFile(path.join(root, ARTIFACT), 'verified\n');
  const beforeProjection = await readFile(path.join(root, '.vibetether', 'PROGRESS.md'), 'utf8');
  await assert.rejects(
    finishStep({ project: root, ...routeProofOptions(started.route, ARTIFACT) }, {
      beforeControlCommit: async () => { throw new Error('injected final control transaction failure'); },
    }),
    /injected final control transaction failure/,
  );
  const { context, runtime } = await runtimeFor(root);
  assert.equal((await readRoute(runtime.paths)).status, 'active');
  assert.equal((await readOutcomeProgress(runtime.paths, context.outcomes)).outcomes.outcome_export_contract.state, 'open');
  assert.equal(await readFile(path.join(root, '.vibetether', 'PROGRESS.md'), 'utf8'), beforeProjection);
});

test('Context exposes bounded coverage counts and stable Outcome handles', async () => {
  const { root } = await initProject('rc4-progress-context');
  await govern(root, [
    outcome('outcome_alpha', ['acceptance_alpha']), outcome('outcome_beta', ['acceptance_beta']),
    outcome('outcome_gamma', ['acceptance_gamma']), outcome('outcome_delta', ['acceptance_delta']),
  ]);
  const capsule = await buildContext({ project: root, boundary: 'task-entry', agent: 'codex' });
  assert.equal(capsule.outcomes.coverage_status, 'confirmed');
  assert.equal(capsule.outcomes.counts.open, 4);
  assert.equal(capsule.outcomes.handles.length, 3);
  assert.equal(capsule.outcomes.omitted, 1);
  assert.match(capsule.outcomes.handles[0], /^outcome:/);
});

test('Outcome governance preserves verified progress and refreshes the generated projection', async () => {
  const { root } = await initProject('rc4-progress-governance');
  await govern(root, [outcome('outcome_existing', ['acceptance_existing'])]);
  const existing = await begin(root, 'outcome_existing', 'acceptance_existing');
  await writeFile(path.join(root, ARTIFACT), 'verified\n');
  await finishStep({ project: root, ...routeProofOptions(existing.route, ARTIFACT) });

  const added = outcome('outcome_added', ['acceptance_added']);
  await mainJson(['outcomes', 'propose', '--project', root, '--outcome-json', JSON.stringify(added), '--yes']);
  await mainJson([
    'outcomes', 'confirm', '--project', root, '--id', added.id,
    '--user-message-locator', 'user-message:confirm-outcome-added',
    '--reason', 'The user added a second required result without invalidating the verified first result.', '--yes',
  ]);
  await mainJson([
    'outcomes', 'coverage', 'confirm', '--project', root,
    '--user-message-locator', 'user-message:reconfirm-complete-coverage',
    '--reason', 'The user reconfirmed the expanded Outcome set as complete.', '--yes',
  ]);

  const { context, runtime } = await runtimeFor(root);
  const progress = await readOutcomeProgress(runtime.paths, context.outcomes);
  assert.equal(progress.outcomes.outcome_existing.state, 'satisfied');
  assert.equal(progress.outcomes.outcome_added.state, 'open');
  const projection = await readFile(path.join(root, '.vibetether', 'PROGRESS.md'), 'utf8');
  assert.match(projection, /Required: 2 \| Open: 1 .* Satisfied: 1/);

  await writeFile(path.join(root, ARTIFACT), 'before-added-slice\n');
  const next = await begin(root, 'outcome_added', 'acceptance_added');
  assert.equal(next.route.outcome_ids[0], 'outcome_added');
});
