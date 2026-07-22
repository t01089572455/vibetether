import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
export const packageRoot = path.resolve(path.dirname(scriptPath), '..');
export const defaultManifestPath = path.resolve(packageRoot, '..', 'vibetether-stage0-evidence-v1', 'stage0-evidence-manifest.json');

const REQUIRED_GATES = {
  check: ['npm', 'run', 'check'],
  coverage: ['npm', 'run', 'test:coverage'],
  budget: ['npm', 'run', 'audit:budgets'],
  release: ['npm', 'run', 'audit:release'],
  stage0_audit: ['npm', 'run', 'audit:stage0'],
  evidence_manifest_test: ['node', '--test', 'test/stage0-evidence-manifest.test.mjs'],
  package_journey: ['npm', 'run', 'test:stage0-package'],
  pack_dry_run: ['npm', 'pack', '--dry-run'],
};
const FINAL_MATRIX = new Set(['ubuntu/20', 'ubuntu/24', 'windows/20', 'windows/24']);
const FINAL_OPEN_AXES = new Set(['ui_golden_screen', 'owner_acceptance']);
const LOCAL_OPEN_AXES = new Set(['ui_golden_screen', 'ui_visual', 'live_v063', 'remote_matrix', 'independent_review', 'owner_acceptance']);

function issue(problems, code, message, field = null) {
  problems.push({ code, message, field });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isHex(value, length) {
  return typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
}

function validTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizedCommand(command) {
  if (!Array.isArray(command)) return [];
  return command.map((item, index) => {
    if (index !== 0) return item;
    const executable = String(item).toLowerCase().replaceAll('\\', '/').split('/').at(-1);
    if (executable === 'npm.cmd' || executable === 'npm.exe') return 'npm';
    if (executable === 'node.exe') return 'node';
    return executable;
  });
}

function sameCommand(actual, expected) {
  const left = normalizedCommand(actual);
  return left.length === expected.length && left.every((item, index) => item === expected[index]);
}

function outsideRepository(repository, target) {
  const relative = path.relative(path.resolve(repository), path.resolve(target));
  return relative.startsWith('..') || path.isAbsolute(relative);
}

async function verifyFile(record, label, repository, problems) {
  if (!isObject(record) || typeof record.path !== 'string' || !isHex(record.sha256, 64)) {
    issue(problems, 'EVIDENCE_FILE_INVALID', `${label} requires an absolute path and SHA-256.`, label);
    return null;
  }
  if (!path.isAbsolute(record.path)) issue(problems, 'EVIDENCE_PATH_NOT_ABSOLUTE', `${label} path must be absolute.`, label);
  if (!outsideRepository(repository, record.path)) issue(problems, 'EVIDENCE_INSIDE_CANDIDATE', `${label} must remain outside candidate bytes.`, label);
  let bytes;
  try {
    bytes = await readFile(record.path);
  } catch (error) {
    issue(problems, 'EVIDENCE_FILE_MISSING', `${label} is unreadable: ${error.code ?? error.message}`, label);
    return null;
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== record.sha256) issue(problems, 'DIGEST_MISMATCH', `${label} digest does not match the recorded bytes.`, label);
  return bytes;
}

async function verifyArchive(name, archive, candidate, problems) {
  const label = `artifacts.${name}`;
  if (!isObject(archive)) {
    issue(problems, 'ARTIFACT_MISSING', `${name.toUpperCase()} artifact is missing.`, label);
    return;
  }
  if (archive.format !== name) issue(problems, 'ARTIFACT_FORMAT_INVALID', `${label}.format must be ${name}.`, `${label}.format`);
  if (archive.commit !== candidate.commit) issue(problems, 'ARTIFACT_COMMIT_MISMATCH', `${label} does not bind the candidate commit.`, `${label}.commit`);
  const bytes = await verifyFile(archive, label, candidate.repository, problems);
  const listingBytes = await verifyFile(archive.listing, `${label}.listing`, candidate.repository, problems);
  if (!bytes || !listingBytes) return;
  let listing;
  try {
    listing = JSON.parse(listingBytes.toString('utf8'));
  } catch {
    issue(problems, 'ARCHIVE_LISTING_INVALID', `${label} listing is not JSON.`, `${label}.listing`);
    return;
  }
  if (!isObject(listing) || listing.schema_version !== 1 || listing.format !== name || listing.artifact_sha256 !== archive.sha256 || !Array.isArray(listing.entries)) {
    issue(problems, 'ARCHIVE_LISTING_INVALID', `${label} listing does not bind the artifact and format.`, `${label}.listing`);
    return;
  }
  if (!Number.isInteger(archive.listing.entry_count) || archive.listing.entry_count <= 0 || archive.listing.entry_count !== listing.entries.length) {
    issue(problems, 'ARCHIVE_ENTRY_COUNT_MISMATCH', `${label} listing entry count is stale.`, `${label}.listing.entry_count`);
  }
  const names = new Set();
  for (const [index, entry] of listing.entries.entries()) {
    const entryPath = entry?.path;
    const safe = typeof entryPath === 'string' && entryPath.length > 0 && !path.posix.isAbsolute(entryPath)
      && !entryPath.split('/').includes('..') && !entryPath.includes('\\') && Number.isInteger(entry?.size) && entry.size >= 0;
    if (!safe) issue(problems, 'ARCHIVE_ENTRY_INVALID', `${label} listing entry ${index + 1} is unsafe or incomplete.`, `${label}.listing.entries.${index}`);
    if (names.has(entryPath)) issue(problems, 'ARCHIVE_ENTRY_DUPLICATE', `${label} listing repeats ${entryPath}.`, `${label}.listing.entries.${index}`);
    names.add(entryPath);
  }
}

function validateCandidate(candidate, currentIdentity, problems) {
  if (!isObject(candidate)) {
    issue(problems, 'CANDIDATE_MISSING', 'Candidate identity is missing.', 'candidate');
    return;
  }
  if (!path.isAbsolute(candidate.repository ?? '')) issue(problems, 'CANDIDATE_REPOSITORY_INVALID', 'Candidate repository path must be absolute.', 'candidate.repository');
  if (!isHex(candidate.commit, 40) || !isHex(candidate.tree, 40)) issue(problems, 'CANDIDATE_IDENTITY_INVALID', 'Candidate commit and tree must be exact 40-character Git IDs.', 'candidate');
  if (candidate.clean !== true) issue(problems, 'CANDIDATE_DIRTY', 'Candidate identity must record a clean tree.', 'candidate.clean');
  if (candidate.package_version !== '1.0.0-rc.4') issue(problems, 'PACKAGE_VERSION_MISMATCH', 'Candidate package version is not RC.4.', 'candidate.package_version');
  if (typeof candidate.branch !== 'string' || !candidate.branch) issue(problems, 'CANDIDATE_BRANCH_MISSING', 'Candidate branch is missing.', 'candidate.branch');
  if (typeof candidate.implementer_id !== 'string' || !candidate.implementer_id) issue(problems, 'IMPLEMENTER_ID_MISSING', 'Candidate implementer identity is missing.', 'candidate.implementer_id');
  if (!isObject(currentIdentity) || currentIdentity.commit !== candidate.commit || currentIdentity.tree !== candidate.tree || currentIdentity.clean !== true) {
    issue(problems, 'CANDIDATE_STALE', 'Manifest candidate identity does not match the current clean repository.', 'candidate');
  }
}

async function validateRuns(manifest, problems) {
  const candidate = manifest.candidate ?? {};
  const runs = Array.isArray(manifest.runs) ? manifest.runs : [];
  if (!Array.isArray(manifest.runs)) issue(problems, 'RUNS_MISSING', 'Evidence runs are missing.', 'runs');
  const byId = new Map();
  for (const [index, run] of runs.entries()) {
    const label = `runs.${index}`;
    if (!isObject(run) || typeof run.id !== 'string' || !run.id) {
      issue(problems, 'RUN_INVALID', `Run ${index + 1} has no stable ID.`, label);
      continue;
    }
    if (byId.has(run.id)) issue(problems, 'RUN_DUPLICATE', `Run ID is duplicated: ${run.id}`, `${label}.id`);
    byId.set(run.id, run);
    if (!Array.isArray(run.command) || run.command.length === 0 || run.command.some((item) => typeof item !== 'string' || !item)) issue(problems, 'RUN_COMMAND_INVALID', `${run.id} command is invalid.`, `${label}.command`);
    if (run.exit_code !== 0) issue(problems, 'RUN_NOT_SUCCESSFUL', `${run.id} did not exit zero.`, `${label}.exit_code`);
    if (!validTime(run.started_at) || !validTime(run.finished_at) || Date.parse(run.finished_at) < Date.parse(run.started_at)) issue(problems, 'RUN_TIME_INVALID', `${run.id} timestamps are invalid.`, label);
    const runtime = run.runtime;
    if (!isObject(runtime) || !/^v\d+\.\d+\.\d+/.test(runtime.node ?? '') || typeof runtime.npm !== 'string' || !runtime.npm || !['win32', 'linux', 'darwin'].includes(runtime.os) || typeof runtime.arch !== 'string' || !runtime.arch) {
      issue(problems, 'RUNTIME_IDENTITY_INVALID', `${run.id} runtime identity is incomplete.`, `${label}.runtime`);
    }
    await verifyFile(run.stdout, `${label}.stdout`, candidate.repository, problems);
    await verifyFile(run.stderr, `${label}.stderr`, candidate.repository, problems);
  }
  const gates = isObject(manifest.gates) ? manifest.gates : {};
  const gateRunIds = [];
  for (const [gate, expectedCommand] of Object.entries(REQUIRED_GATES)) {
    const runId = gates[gate];
    if (typeof runId !== 'string' || !byId.has(runId)) {
      issue(problems, 'REQUIRED_GATE_MISSING', `Required local gate is missing: ${gate}`, `gates.${gate}`);
      continue;
    }
    gateRunIds.push(runId);
    if (!sameCommand(byId.get(runId).command, expectedCommand)) issue(problems, 'GATE_COMMAND_MISMATCH', `${gate} does not bind its governed command.`, `gates.${gate}`);
  }
  if (new Set(gateRunIds).size !== gateRunIds.length) issue(problems, 'GATE_RUN_REUSED', 'Each required local gate needs a distinct run receipt.', 'gates');
  return byId;
}

async function validateLive(manifest, runById, problems) {
  const live = manifest.live_v063;
  if (!isObject(live)) {
    issue(problems, 'LIVE_V063_MISSING', 'Live v0.6.3 evidence is missing.', 'live_v063');
    return;
  }
  const run = runById.get(live.run_id);
  if (live.status !== 'passed' || !run || !sameCommand(run.command, ['npm', 'run', 'test:compat:v063-live'])) issue(problems, 'LIVE_V063_RUN_INVALID', 'Live v0.6.3 does not bind a successful governed run.', 'live_v063.run_id');
  if (live.source_version !== 'v0.6.3' || !isHex(live.tag_object, 40) || !isHex(live.commit, 40) || !isHex(live.tree, 40) || !isHex(live.normalized_source_sha256, 64)) issue(problems, 'LIVE_V063_SOURCE_INVALID', 'Live v0.6.3 source identity is incomplete.', 'live_v063');
  if (typeof live.migration_id !== 'string' || !live.migration_id || typeof live.rollback_id !== 'string' || !live.rollback_id || live.rollback_result !== 'restored') issue(problems, 'LIVE_V063_ROLLBACK_INVALID', 'Migration and restored rollback identities are required.', 'live_v063');
  if (live.post_rollback_matches !== true || live.user_edit_preserved !== true) issue(problems, 'LIVE_V063_BYTES_INVALID', 'Post-rollback bytes and the user edit must be preserved.', 'live_v063');
  const before = await verifyFile(live.before_inventory, 'live_v063.before_inventory', manifest.candidate.repository, problems);
  const after = await verifyFile(live.post_rollback_inventory, 'live_v063.post_rollback_inventory', manifest.candidate.repository, problems);
  if (before && after && createHash('sha256').update(before).digest('hex') !== createHash('sha256').update(after).digest('hex')) issue(problems, 'LIVE_V063_BYTES_INVALID', 'Post-rollback inventory differs from the protected baseline.', 'live_v063.post_rollback_inventory');
}

function validateMatrix(manifest, problems) {
  const jobs = Array.isArray(manifest.matrix) ? manifest.matrix : [];
  if (jobs.length !== 4) issue(problems, 'MATRIX_INCOMPLETE', 'Exactly four terminating matrix jobs are required.', 'matrix');
  const tuples = new Set();
  const jobIds = new Set();
  const urls = new Set();
  for (const [index, job] of jobs.entries()) {
    const label = `matrix.${index}`;
    const tuple = `${job?.platform}/${job?.node}`;
    if (!FINAL_MATRIX.has(tuple) || tuples.has(tuple)) issue(problems, 'MATRIX_AXIS_INVALID', `Matrix axis is missing or duplicated: ${tuple}`, label);
    tuples.add(tuple);
    if (typeof job?.job_id !== 'string' || !job.job_id || jobIds.has(job.job_id) || typeof job?.url !== 'string' || urls.has(job.url)) issue(problems, 'MATRIX_JOB_DUPLICATE', 'Matrix job IDs and URLs must be distinct.', label);
    jobIds.add(job?.job_id);
    urls.add(job?.url);
    const numericIds = /^\d+$/.test(job?.run_id ?? '') && /^\d+$/.test(job?.job_id ?? '');
    const expectedUrl = numericIds
      && new RegExp(`/actions/runs/${job.run_id}/job/${job.job_id}$`).test(job.url ?? '');
    if (job?.status !== 'completed' || job?.conclusion !== 'success' || !expectedUrl) issue(problems, 'MATRIX_JOB_NOT_SUCCESSFUL', `${tuple} is configured, incomplete, unsuccessful, or lacks a real job URL.`, label);
    if (job?.head_sha !== manifest.candidate.commit) issue(problems, 'MATRIX_COMMIT_MISMATCH', `${tuple} ran on a different commit.`, `${label}.head_sha`);
  }
  for (const tuple of FINAL_MATRIX) if (!tuples.has(tuple)) issue(problems, 'MATRIX_INCOMPLETE', `Matrix result is missing: ${tuple}`, 'matrix');
}

async function validateReview(manifest, problems) {
  const review = manifest.review;
  if (!isObject(review)) {
    issue(problems, 'REVIEW_MISSING', 'Independent review is missing.', 'review');
    return;
  }
  if (review.reviewer_id === manifest.candidate.implementer_id || review.reviewer_level !== 'independent-read-only') issue(problems, 'REVIEW_NOT_INDEPENDENT', 'Self-review cannot satisfy independent review.', 'review');
  if (review.review_branch !== 'refs/heads/codex/vibetether-stage0-review' || review.commit !== manifest.candidate.commit || review.package_sha256 !== manifest.artifacts?.tgz?.sha256) issue(problems, 'REVIEW_IDENTITY_MISMATCH', 'Review does not bind the review branch, candidate, and TGZ.', 'review');
  if (!validTime(review.started_at) || !validTime(review.completed_at) || Date.parse(review.completed_at) < Date.parse(review.started_at)) issue(problems, 'REVIEW_TIME_INVALID', 'Review timestamps are invalid.', 'review');
  if (!Array.isArray(review.findings)) issue(problems, 'REVIEW_FINDINGS_MISSING', 'Review findings must be explicit, including an empty list.', 'review.findings');
  for (const finding of review.findings ?? []) {
    if (!isObject(finding) || typeof finding.id !== 'string' || !['P0', 'P1', 'P2', 'P3'].includes(finding.severity) || typeof finding.status !== 'string' || typeof finding.summary !== 'string') issue(problems, 'REVIEW_FINDING_INVALID', 'Review finding is incomplete.', 'review.findings');
    if (['P0', 'P1'].includes(finding?.severity) && !['resolved', 'closed'].includes(finding?.status)) issue(problems, 'REVIEW_BLOCKING_FINDING', `Blocking finding remains open: ${finding.id}`, 'review.findings');
  }
  if (review.disposition !== 'ready-for-owner-review') issue(problems, 'REVIEW_DISPOSITION_INVALID', 'Review disposition is not ready for owner review.', 'review.disposition');
  await verifyFile(review.receipt, 'review.receipt', manifest.candidate.repository, problems);
}

function validateControls(manifest, problems) {
  const controls = manifest.controls;
  if (!isObject(controls) || controls.main_merged !== false || controls.released !== false || controls.release_authorized !== false || manifest.status === 'RELEASE_READY') {
    issue(problems, 'RELEASE_BOUNDARY_IMPERSONATION', 'Evidence must explicitly keep main unmerged, release absent, and release authorization false.', 'controls');
  }
}

function validateOpenAxes(manifest, boundary, problems) {
  const axes = Array.isArray(manifest.open_axes) ? manifest.open_axes : [];
  if (!Array.isArray(manifest.open_axes) || axes.some((item) => typeof item !== 'string') || new Set(axes).size !== axes.length) issue(problems, 'OPEN_AXES_INVALID', 'Open axes must be a unique string list.', 'open_axes');
  const allowed = boundary === 'owner-review' ? FINAL_OPEN_AXES : LOCAL_OPEN_AXES;
  for (const axis of axes) if (!allowed.has(axis)) issue(problems, 'OPEN_AXIS_UNEXPECTED', `Unexpected open axis at ${boundary}: ${axis}`, 'open_axes');
  const required = boundary === 'owner-review' ? ['owner_acceptance'] : ['live_v063', 'remote_matrix', 'independent_review', 'owner_acceptance'];
  for (const axis of required) if (!axes.includes(axis)) issue(problems, 'OPEN_AXIS_MISSING', `Expected open axis is not declared: ${axis}`, 'open_axes');
}

export async function validateStage0Evidence(manifest, { boundary = null, currentIdentity = null } = {}) {
  const problems = [];
  if (!isObject(manifest) || manifest.schema_version !== 1) {
    issue(problems, 'MANIFEST_SCHEMA_INVALID', 'Stage 0 evidence requires schema_version 1.', 'schema_version');
    return { schema_version: 1, ok: false, boundary: boundary ?? 'unknown', status: manifest?.status ?? null, problems };
  }
  const effectiveBoundary = boundary ?? (manifest.status === 'STAGE0_EVIDENCE_READY_FOR_OWNER_REVIEW' ? 'owner-review' : 'exact-package');
  if (!['exact-package', 'owner-review'].includes(effectiveBoundary)) issue(problems, 'BOUNDARY_INVALID', `Unsupported evidence boundary: ${effectiveBoundary}`, 'boundary');
  if (effectiveBoundary === 'owner-review' && manifest.status !== 'STAGE0_EVIDENCE_READY_FOR_OWNER_REVIEW') issue(problems, 'STATUS_INVALID', 'Owner-review evidence must use STAGE0_EVIDENCE_READY_FOR_OWNER_REVIEW.', 'status');
  if (effectiveBoundary === 'exact-package' && manifest.status !== 'LOCAL_STAGE0_ARTIFACTS_READY') issue(problems, 'STATUS_INVALID', 'Exact-package evidence must use LOCAL_STAGE0_ARTIFACTS_READY.', 'status');

  validateCandidate(manifest.candidate, currentIdentity, problems);
  validateControls(manifest, problems);
  validateOpenAxes(manifest, effectiveBoundary, problems);
  if (isObject(manifest.candidate)) {
    await verifyArchive('tgz', manifest.artifacts?.tgz, manifest.candidate, problems);
    await verifyArchive('zip', manifest.artifacts?.zip, manifest.candidate, problems);
  }
  const runById = await validateRuns(manifest, problems);
  if (effectiveBoundary === 'owner-review') {
    await validateLive(manifest, runById, problems);
    validateMatrix(manifest, problems);
    await validateReview(manifest, problems);
  }
  return {
    schema_version: 1,
    ok: problems.length === 0,
    boundary: effectiveBoundary,
    status: manifest.status,
    candidate_commit: manifest.candidate?.commit ?? null,
    problems,
  };
}

export function readGitIdentity(repository) {
  const run = (args) => spawnSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true });
  const commitResult = run(['rev-parse', 'HEAD']);
  const treeResult = run(['rev-parse', 'HEAD^{tree}']);
  const statusResult = run(['status', '--porcelain=v1']);
  if (commitResult.status !== 0 || treeResult.status !== 0 || statusResult.status !== 0) throw new Error(commitResult.stderr || treeResult.stderr || statusResult.stderr || 'Git identity is unavailable.');
  return { commit: commitResult.stdout.trim(), tree: treeResult.stdout.trim(), clean: statusResult.stdout.trim() === '' };
}

function option(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

async function main(argv = process.argv.slice(2)) {
  const manifestPath = path.resolve(option(argv, '--manifest', defaultManifestPath));
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    const report = { schema_version: 1, ok: false, boundary: option(argv, '--boundary', 'unknown'), status: null, candidate_commit: null, problems: [{ code: 'MANIFEST_UNREADABLE', message: error.message, field: 'manifest' }] };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  let currentIdentity;
  try {
    currentIdentity = readGitIdentity(manifest.candidate?.repository ?? packageRoot);
  } catch (error) {
    const report = { schema_version: 1, ok: false, boundary: option(argv, '--boundary', 'unknown'), status: manifest.status ?? null, candidate_commit: manifest.candidate?.commit ?? null, problems: [{ code: 'CANDIDATE_GIT_UNAVAILABLE', message: error.message, field: 'candidate.repository' }] };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  const report = await validateStage0Evidence(manifest, { boundary: option(argv, '--boundary'), currentIdentity });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) await main();
