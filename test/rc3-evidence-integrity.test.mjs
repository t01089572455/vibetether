import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { inspectProject } from '../src/doctor.mjs';
import { discoverContract } from '../src/contract.mjs';
import { parseTruthMap, authoritySnapshot } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { readReceipt } from '../src/runtime.mjs';
import { finishStep, startStep } from '../src/step.mjs';
import { initProject } from './helpers.mjs';

function checkFor(pathname, claim = 'The focused product check passes.') {
  return {
    id: 'focused-product-check',
    claim,
    kind: 'command',
    command: [
      process.execPath,
      '-e',
      `const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(pathname)},'utf8')!=='implemented\\n')process.exit(7)`,
    ],
    covers_paths: [pathname],
    consumer_paths: [pathname],
  };
}

function proofs(route, checkId = 'focused-product-check', artifact = 'implementation.txt') {
  return {
    output_proofs: (route.required_outputs ?? []).map((output) => ({
      output,
      check_ids: [checkId],
      summary: `The validated product bytes support ${output}.`,
      artifact_paths: [artifact],
    })),
    exit_proofs: (route.exit_evidence ?? []).map((criterion) => ({
      criterion,
      check_ids: [checkId],
      summary: 'The predeclared focused check passed against the final product bytes.',
      artifact_paths: [artifact],
    })),
  };
}

async function begin(root, { check = checkFor('implementation.txt'), success = check.claim } = {}) {
  return startStep({
    project: root,
    phase: 'EXECUTE_ONE',
    capability: 'implementation',
    slice: 'Implement one exact local product artifact.',
    task_text: 'Apply one exact local implementation change to implementation.txt.',
    success_evidence: [success],
    success_checks: [check],
    signals: ['bug-fix'],
    agent: 'codex',
    provider: 'vibetether-built-in-implementation',
    code_write: true,
    confirmed_by_user: true,
    decision_reason: 'The test author approved this exact local implementation slice.',
  });
}

test('evidence-required code-writing steps require predeclared executable or inspectable success checks', async () => {
  const { root } = await initProject('evidence-planned-check');
  await assert.rejects(
    startStep({
      project: root,
      phase: 'EXECUTE_ONE',
      capability: 'implementation',
      slice: 'Implement one local change.',
      task_text: 'Apply one exact local implementation change.',
      success_evidence: ['The focused product check passes.'],
      signals: ['bug-fix'],
      code_write: true,
      confirmed_by_user: true,
      decision_reason: 'The test author approved this exact local implementation slice.',
    }),
    /predeclared|success check|executable|inspectable/i,
  );
});

test('obvious no-op success commands are rejected before implementation starts', async () => {
  const { root } = await initProject('evidence-no-op-check');
  await assert.rejects(
    begin(root, {
      check: {
        id: 'empty-success',
        claim: 'The feature works.',
        kind: 'command',
        command: [process.execPath, '-e', 'process.exit(0)'],
        covers_paths: ['implementation.txt'],
        consumer_paths: ['implementation.txt'],
      },
      success: 'The feature works.',
    }),
    /no-op|meaningful|verification command/i,
  );
});

test('control-plane files cannot be used as product completion evidence', async () => {
  const { root } = await initProject('evidence-control-plane');
  const check = {
    id: 'intent-exists',
    claim: 'The feature is implemented.',
    kind: 'artifact',
    path: '.vibetether/intent.md',
  };
  await assert.rejects(begin(root, { check, success: check.claim }), /control-plane|product evidence|governance/i);
});

test('a passing check without product-byte change cannot complete an implementation step', async () => {
  const { root } = await initProject('evidence-no-product-change');
  const check = {
    id: 'existing-file-check',
    claim: 'The existing project file can be read.',
    kind: 'command',
    command: [process.execPath, '-e', "require('node:fs').readFileSync('app.txt','utf8')"],
    covers_paths: ['app.txt'],
    consumer_paths: ['app.txt'],
  };
  const started = await begin(root, { check, success: check.claim });
  await assert.rejects(
    finishStep({ project: root, ...proofs(started.route, check.id, 'app.txt') }),
    /product.*change|final product bytes|no material/i,
  );
});

test('symbolic outputs and exit criteria require structured proof bindings, not copied strings', async () => {
  const { root } = await initProject('evidence-proof-binding');
  const started = await begin(root);
  await writeFile(path.join(root, 'implementation.txt'), 'implemented\n');
  await assert.rejects(
    finishStep({
      project: root,
      outputs: [...started.route.required_outputs],
      exit_evidence: [...started.route.exit_evidence],
    }),
    /proof binding|output proof|exit proof/i,
  );
});

test('predeclared checks, product changes, and structured proofs can satisfy completion', async () => {
  const { root } = await initProject('evidence-valid');
  const started = await begin(root);
  await writeFile(path.join(root, 'implementation.txt'), 'implemented\n');
  const finished = await finishStep({ project: root, ...proofs(started.route) });
  assert.equal(finished.route.status, 'satisfied');
  assert.ok(finished.route.output_contract.output_proofs.every((item) => item.evidence_ids.length === 1));
  assert.ok(finished.route.output_contract.success_checks.every((item) => item.successful === true));
  const report = await inspectProject({ project: root, boundary: 'completion', throw_on_error: false });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
});

test('evidence commands receive a minimal environment instead of inherited secret variables', async () => {
  const { root } = await initProject('evidence-env');
  const secretName = 'VIBETETHER_TEST_PARENT_SECRET';
  process.env[secretName] = 'do-not-inherit-this-value';
  try {
    const check = {
      id: 'environment-boundary',
      claim: 'The verification process runs without the parent secret.',
      kind: 'command',
      command: [
        process.execPath,
        '-e',
        `if(process.env.${secretName})process.exit(13);require('node:fs').writeFileSync('implementation.txt','implemented\\n')`,
      ],
      covers_paths: ['implementation.txt'],
      consumer_paths: ['implementation.txt'],
    };
    const started = await begin(root, { check, success: check.claim });
    const finished = await finishStep({ project: root, ...proofs(started.route, check.id) });
    assert.equal(finished.evidence_receipts.every((item) => item.successful), true);
  } finally {
    delete process.env[secretName];
  }
});


test('repository-scoped evidence retains validated product coverage for sibling worktrees', async () => {
  const { root } = await initProject('evidence-repository-copy');
  const started = await begin(root);
  await writeFile(path.join(root, 'implementation.txt'), 'implemented\n');
  const finished = await finishStep({ project: root, ...proofs(started.route) });
  const context = await discoverContract(root);
  const authority = await authoritySnapshot(context.executionRoot, parseTruthMap(context.truthSource), context.intentSource);
  const runtime = await attachWorktree(context, authority.authority_digest);
  const repositoryReceipt = await readReceipt(
    path.join(runtime.paths.repository_evidence, `${finished.evidence.id}.json`),
    'Repository evidence receipt',
  );
  assert.deepEqual(repositoryReceipt.coverage_artifacts, finished.evidence.coverage_artifacts);
  assert.equal(repositoryReceipt.coverage_artifacts[0].path, 'implementation.txt');
  assert.match(repositoryReceipt.coverage_artifacts[0].sha256, /^[a-f0-9]{64}$/);
});
