import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateStage0Evidence } from '../scripts/verify-stage0-evidence.mjs';

const root = path.resolve(import.meta.dirname, '..');
const requiredGates = {
  check: ['npm.cmd', 'run', 'check'],
  coverage: ['npm.cmd', 'run', 'test:coverage'],
  budget: ['npm.cmd', 'run', 'audit:budgets'],
  release: ['npm.cmd', 'run', 'audit:release'],
  stage0_audit: ['npm.cmd', 'run', 'audit:stage0'],
  evidence_manifest_test: ['node', '--test', 'test/stage0-evidence-manifest.test.mjs'],
  package_journey: ['npm.cmd', 'run', 'test:stage0-package'],
  pack_dry_run: ['npm.cmd', 'pack', '--dry-run'],
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function evidenceFile(directory, name, content) {
  const target = path.join(directory, name);
  await writeFile(target, content);
  return { path: target, sha256: sha256(content) };
}

function codes(report) {
  return new Set(report.problems.map(({ code }) => code));
}

async function validFixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'vibetether-stage0-evidence-'));
  const repository = path.join(base, 'candidate');
  const evidence = path.join(base, 'external-evidence');
  await Promise.all([mkdir(repository), mkdir(evidence)]);
  t.after(() => rm(base, { recursive: true, force: true }));

  const commit = 'a'.repeat(40);
  const tree = 'b'.repeat(40);
  const tgzBytes = Buffer.from('exact tgz bytes');
  const zipBytes = Buffer.from('exact zip bytes');
  const tgz = await evidenceFile(evidence, 'vibetether-1.0.0-rc.4.tgz', tgzBytes);
  const zip = await evidenceFile(evidence, 'vibetether-1.0.0-rc.4-source.zip', zipBytes);
  const listingEntries = [
    { path: 'package/package.json', size: 512 },
    { path: 'package/bin/vibetether.mjs', size: 256 },
  ];
  const tgzListingBytes = `${JSON.stringify({ schema_version: 1, format: 'tgz', artifact_sha256: tgz.sha256, entries: listingEntries }, null, 2)}\n`;
  const zipListingBytes = `${JSON.stringify({ schema_version: 1, format: 'zip', artifact_sha256: zip.sha256, entries: listingEntries.map((entry) => ({ ...entry, path: entry.path.replace(/^package\//, '') })) }, null, 2)}\n`;
  const tgzListing = await evidenceFile(evidence, 'tgz-listing.json', tgzListingBytes);
  const zipListing = await evidenceFile(evidence, 'zip-listing.json', zipListingBytes);

  const runs = [];
  const gates = {};
  for (const [gate, command] of Object.entries(requiredGates)) {
    const id = `run-${gate.replaceAll('_', '-')}`;
    const stdout = await evidenceFile(evidence, `${id}.stdout.txt`, `${gate} passed\n`);
    const stderr = await evidenceFile(evidence, `${id}.stderr.txt`, '');
    runs.push({
      id,
      command,
      exit_code: 0,
      started_at: '2026-07-22T16:00:00.000Z',
      finished_at: '2026-07-22T16:00:01.000Z',
      runtime: { node: 'v24.11.1', npm: '11.6.2', os: 'win32', arch: 'x64' },
      stdout,
      stderr,
    });
    gates[gate] = id;
  }
  const liveRunStdout = await evidenceFile(evidence, 'run-live-v063.stdout.txt', 'live v0.6.3 passed\n');
  const liveRunStderr = await evidenceFile(evidence, 'run-live-v063.stderr.txt', '');
  runs.push({
    id: 'run-live-v063',
    command: ['npm.cmd', 'run', 'test:compat:v063-live'],
    exit_code: 0,
    started_at: '2026-07-22T16:10:00.000Z',
    finished_at: '2026-07-22T16:11:00.000Z',
    runtime: { node: 'v24.11.1', npm: '11.6.2', os: 'win32', arch: 'x64' },
    stdout: liveRunStdout,
    stderr: liveRunStderr,
  });

  const before = await evidenceFile(evidence, 'v063-before.json', '{"legacy":true}\n');
  const after = await evidenceFile(evidence, 'v063-after.json', '{"legacy":true}\n');
  const reviewReceipt = await evidenceFile(evidence, 'independent-review.json', '{"disposition":"ready-for-owner-review"}\n');
  const manifest = {
    schema_version: 1,
    status: 'STAGE0_EVIDENCE_READY_FOR_OWNER_REVIEW',
    candidate: {
      repository,
      branch: 'codex/vibetether-stage0-review',
      commit,
      tree,
      clean: true,
      package_version: '1.0.0-rc.4',
      implementer_id: 'codex-primary',
    },
    artifacts: {
      tgz: { ...tgz, format: 'tgz', commit, listing: { ...tgzListing, entry_count: 2 } },
      zip: { ...zip, format: 'zip', commit, listing: { ...zipListing, entry_count: 2 } },
    },
    runs,
    gates,
    live_v063: {
      status: 'passed',
      run_id: 'run-live-v063',
      source_version: 'v0.6.3',
      tag_object: 'c'.repeat(40),
      commit: 'd'.repeat(40),
      tree: 'e'.repeat(40),
      normalized_source_sha256: 'f'.repeat(64),
      migration_id: 'migration-1234',
      rollback_id: 'rollback-1234',
      rollback_result: 'restored',
      before_inventory: before,
      post_rollback_inventory: after,
      post_rollback_matches: true,
      user_edit_preserved: true,
    },
    matrix: [
      ['ubuntu', 20, '1001'],
      ['ubuntu', 24, '1002'],
      ['windows', 20, '1003'],
      ['windows', 24, '1004'],
    ].map(([platform, node, jobId]) => ({
      platform,
      node,
      status: 'completed',
      conclusion: 'success',
      head_sha: commit,
      run_id: '9001',
      job_id: jobId,
      url: `https://github.com/t01089572455/vibetether/actions/runs/9001/job/${jobId}`,
    })),
    review: {
      reviewer_id: 'independent-reviewer',
      reviewer_level: 'independent-read-only',
      review_branch: 'refs/heads/codex/vibetether-stage0-review',
      commit,
      package_sha256: tgz.sha256,
      started_at: '2026-07-22T16:20:00.000Z',
      completed_at: '2026-07-22T16:25:00.000Z',
      findings: [{ id: 'review-1', severity: 'P2', status: 'resolved', summary: 'Documentation wording corrected before candidate freeze.' }],
      disposition: 'ready-for-owner-review',
      receipt: reviewReceipt,
    },
    controls: { main_merged: false, released: false, release_authorized: false },
    open_axes: ['ui_golden_screen', 'owner_acceptance'],
  };
  return { manifest, currentIdentity: { commit, tree, clean: true }, evidence };
}

test('complete and exact-package evidence manifests validate at their own boundaries', async (t) => {
  const fixtureValue = await validFixture(t);
  const complete = await validateStage0Evidence(fixtureValue.manifest, {
    boundary: 'owner-review',
    currentIdentity: fixtureValue.currentIdentity,
  });
  assert.equal(complete.ok, true, JSON.stringify(complete.problems, null, 2));

  const local = structuredClone(fixtureValue.manifest);
  local.status = 'LOCAL_STAGE0_ARTIFACTS_READY';
  local.live_v063 = null;
  local.matrix = [];
  local.review = null;
  local.open_axes = ['ui_golden_screen', 'ui_visual', 'live_v063', 'remote_matrix', 'independent_review', 'owner_acceptance'];
  const exactPackage = await validateStage0Evidence(local, {
    boundary: 'exact-package',
    currentIdentity: fixtureValue.currentIdentity,
  });
  assert.equal(exactPackage.ok, true, JSON.stringify(exactPackage.problems, null, 2));
});

test('missing axes, wrong bytes, and stale candidate identities fail closed', async (t) => {
  const fixtureValue = await validFixture(t);
  const missing = structuredClone(fixtureValue.manifest);
  delete missing.gates.coverage;
  missing.live_v063 = null;
  const missingReport = await validateStage0Evidence(missing, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(missingReport).has('REQUIRED_GATE_MISSING'));
  assert.ok(codes(missingReport).has('LIVE_V063_MISSING'));

  const wrongDigest = structuredClone(fixtureValue.manifest);
  wrongDigest.artifacts.tgz.sha256 = '0'.repeat(64);
  const wrongReport = await validateStage0Evidence(wrongDigest, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(wrongReport).has('DIGEST_MISMATCH'));

  const stale = await validateStage0Evidence(fixtureValue.manifest, {
    boundary: 'owner-review',
    currentIdentity: { ...fixtureValue.currentIdentity, commit: '9'.repeat(40) },
  });
  assert.ok(codes(stale).has('CANDIDATE_STALE'));
});

test('matrix, reviewer, CI execution, and release authority cannot be impersonated', async (t) => {
  const fixtureValue = await validFixture(t);

  const duplicate = structuredClone(fixtureValue.manifest);
  duplicate.matrix[1].job_id = duplicate.matrix[0].job_id;
  duplicate.matrix[1].url = duplicate.matrix[0].url;
  const duplicateReport = await validateStage0Evidence(duplicate, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(duplicateReport).has('MATRIX_JOB_DUPLICATE'));

  const selfReview = structuredClone(fixtureValue.manifest);
  selfReview.review.reviewer_id = selfReview.candidate.implementer_id;
  selfReview.review.reviewer_level = 'self-review';
  const selfReviewReport = await validateStage0Evidence(selfReview, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(selfReviewReport).has('REVIEW_NOT_INDEPENDENT'));

  const configured = structuredClone(fixtureValue.manifest);
  configured.matrix[0].status = 'configured';
  configured.matrix[0].conclusion = null;
  configured.matrix[0].url = 'https://github.com/t01089572455/vibetether/actions/workflows/ci.yml';
  const configuredReport = await validateStage0Evidence(configured, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(configuredReport).has('MATRIX_JOB_NOT_SUCCESSFUL'));

  const impersonated = structuredClone(fixtureValue.manifest);
  impersonated.controls.release_authorized = true;
  impersonated.status = 'RELEASE_READY';
  const impersonatedReport = await validateStage0Evidence(impersonated, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(impersonatedReport).has('RELEASE_BOUNDARY_IMPERSONATION'));
});

test('package scripts and remote matrix execute the governed Stage 0 checks', async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['verify:stage0-evidence'], 'node scripts/verify-stage0-evidence.mjs');
  assert.equal(packageJson.scripts['test:stage0-evidence'], 'node --test test/stage0-evidence-manifest.test.mjs');
  assert.equal(packageJson.scripts['test:stage0-package'], 'node --test test/rc4-package-journey.test.mjs test/stage0-package-capabilities.test.mjs test/stage0-package-contract.test.mjs');

  const workflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  for (const command of ['npm run audit:stage0', 'npm run test:stage0-evidence', 'npm run test:stage0-package']) {
    assert.match(workflow, new RegExp(command.replaceAll(':', '\\:')));
  }
});
