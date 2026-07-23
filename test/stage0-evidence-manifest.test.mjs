import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { retainRollbackEvidence } from '../scripts/test-live-v063-migration.mjs';
import { validateStage0Evidence } from '../scripts/verify-stage0-evidence.mjs';

const root = path.resolve(import.meta.dirname, '..');
const officialRepository = 't01089572455/vibetether';
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

function tarOctal(value, length) {
  return `${value.toString(8).padStart(length - 1, '0')}\0`;
}

function tarBytes(entries, trailing = Buffer.alloc(0)) {
  const chunks = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content);
    const header = Buffer.alloc(512);
    header.write(entry.path, 0, 100, 'utf8');
    header.write(tarOctal(entry.mode ?? 0o644, 8), 100, 8, 'ascii');
    header.write(tarOctal(0, 8), 108, 8, 'ascii');
    header.write(tarOctal(0, 8), 116, 8, 'ascii');
    header.write(tarOctal(content.length, 12), 124, 12, 'ascii');
    header.write(tarOctal(0, 12), 136, 12, 'ascii');
    header.fill(0x20, 148, 156);
    header[156] = entry.typeFlag ?? 0x30;
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    chunks.push(header, content, Buffer.alloc((512 - (content.length % 512)) % 512));
  }
  chunks.push(Buffer.alloc(1024), trailing);
  return gzipSync(Buffer.concat(chunks), { mtime: 0 });
}

function paxRecord(key, value) {
  const body = `${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 2;
  while (true) {
    const next = Buffer.byteLength(String(length)) + 1 + Buffer.byteLength(body);
    if (next === length) return `${length} ${body}`;
    length = next;
  }
}

function git(repository, args, environment = process.env) {
  const result = spawnSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    env: environment,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function zipBytes(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path);
    const content = Buffer.from(entry.content);
    const flags = entry.flags ?? 0x0800;
    const localExtra = Buffer.from(entry.localExtra ?? []);
    const centralExtra = Buffer.from(entry.centralExtra ?? []);
    const crc = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(localExtra.length, 28);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(entry.madeBy ?? (entry.unixMode === undefined ? 20 : ((3 << 8) | 20)), 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(entry.centralSize ?? content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(centralExtra.length, 30);
    if (entry.externalAttributes !== undefined) centralHeader.writeUInt32LE(entry.externalAttributes >>> 0, 38);
    else if (entry.unixMode !== undefined) centralHeader.writeUInt32LE((entry.unixMode << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    local.push(localHeader, name, localExtra, content);
    central.push(centralHeader, name, centralExtra);
    offset += localHeader.length + name.length + localExtra.length + content.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

function zipExtra(id, data = Buffer.alloc(0)) {
  const value = Buffer.from(data);
  const header = Buffer.alloc(4);
  header.writeUInt16LE(id, 0);
  header.writeUInt16LE(value.length, 2);
  return Buffer.concat([header, value]);
}

function matrixIdentityLog(identity) {
  const timestamp = '2026-07-22T16:17:30.1234567Z';
  return `${timestamp} VIBETETHER_STAGE0_IDENTITY=${JSON.stringify(identity)}\n${timestamp} VIBETETHER_STAGE0_PACKAGE_SHA256=${identity.package_sha256}\n`;
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

  const committedAt = '2026-07-22T15:00:00.000Z';
  const packageJson = `${JSON.stringify({ name: 'vibetether', version: '1.0.0-rc.4', files: ['bin'] }, null, 2)}\n`;
  await mkdir(path.join(repository, 'bin'));
  await Promise.all([
    writeFile(path.join(repository, 'package.json'), packageJson),
    writeFile(path.join(repository, 'bin', 'vibetether.mjs'), '#!/usr/bin/env node\n'),
  ]);
  git(repository, ['init', '-q']);
  git(repository, ['config', 'user.name', 'Stage 0 Fixture']);
  git(repository, ['config', 'user.email', 'stage0-fixture@example.test']);
  git(repository, ['config', 'core.autocrlf', 'false']);
  git(repository, ['add', '--', 'package.json', 'bin/vibetether.mjs']);
  git(repository, ['commit', '-qm', 'fixture candidate'], {
    ...process.env,
    GIT_AUTHOR_DATE: committedAt,
    GIT_COMMITTER_DATE: committedAt,
  });
  const commit = git(repository, ['rev-parse', 'HEAD']);
  const tree = git(repository, ['rev-parse', 'HEAD^{tree}']);
  const packageFiles = [
    { path: 'package/package.json', content: packageJson },
    { path: 'package/bin/vibetether.mjs', content: '#!/usr/bin/env node\n' },
  ];
  const timestampExtra = zipExtra(0x5455, Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00]));
  const sourceFiles = packageFiles.map((entry) => ({
    ...entry,
    path: entry.path.replace(/^package\//, ''),
    unixMode: 0o100644,
    localExtra: timestampExtra,
    centralExtra: timestampExtra,
  }));
  const tgz = await evidenceFile(evidence, 'vibetether-1.0.0-rc.4.tgz', tarBytes(packageFiles));
  const zip = await evidenceFile(evidence, 'vibetether-1.0.0-rc.4-source.zip', zipBytes(sourceFiles));
  const listingEntries = packageFiles.map((entry) => ({ path: entry.path, type: 'file', size: Buffer.byteLength(entry.content) }));
  const tgzListingBytes = `${JSON.stringify({ schema_version: 1, format: 'tgz', artifact_sha256: tgz.sha256, entries: listingEntries }, null, 2)}\n`;
  const zipListingBytes = `${JSON.stringify({ schema_version: 1, format: 'zip', artifact_sha256: zip.sha256, entries: listingEntries.map((entry) => ({ ...entry, path: entry.path.replace(/^package\//, '') })) }, null, 2)}\n`;
  const tgzListing = await evidenceFile(evidence, 'tgz-listing.json', tgzListingBytes);
  const zipListing = await evidenceFile(evidence, 'zip-listing.json', zipListingBytes);

  const runs = [];
  const gates = {};
  for (const [gate, command] of Object.entries(requiredGates)) {
    const id = `run-${gate.replaceAll('_', '-')}`;
    const stdout = await evidenceFile(
      evidence,
      `${id}.stdout.txt`,
      gate === 'package_journey'
        ? `${gate} passed\nVIBETETHER_STAGE0_PACKAGE_JOURNEY_SHA256=${tgz.sha256}\n`
        : `${gate} passed\n`,
    );
    const stderr = await evidenceFile(evidence, `${id}.stderr.txt`, '');
    const run = {
      id,
      command,
      exit_code: 0,
      started_at: '2026-07-22T16:00:00.000Z',
      finished_at: '2026-07-22T16:00:01.000Z',
      runtime: { node: 'v24.11.1', npm: '11.6.2', os: 'win32', arch: 'x64' },
      stdout,
      stderr,
      repository,
      cwd: repository,
      commit,
      tree,
      committed_at: committedAt,
      clean_before: true,
      clean_after: true,
      package_sha256: tgz.sha256,
    };
    run.receipt = await evidenceFile(evidence, `${id}.meta.json`, `${JSON.stringify(run, null, 2)}\n`);
    runs.push(run);
    gates[gate] = id;
  }
  const liveRunStdout = await evidenceFile(evidence, 'run-live-v063.stdout.txt', 'live v0.6.3 passed\n');
  const liveRunStderr = await evidenceFile(evidence, 'run-live-v063.stderr.txt', '');
  const liveRun = {
    id: 'run-live-v063',
    command: ['npm.cmd', 'run', 'test:compat:v063-live'],
    exit_code: 0,
    started_at: '2026-07-22T16:10:00.000Z',
    finished_at: '2026-07-22T16:11:00.000Z',
    runtime: { node: 'v24.11.1', npm: '11.6.2', os: 'win32', arch: 'x64' },
    stdout: liveRunStdout,
    stderr: liveRunStderr,
    repository,
    cwd: repository,
    commit,
    tree,
    committed_at: committedAt,
    clean_before: true,
    clean_after: true,
    package_sha256: tgz.sha256,
  };
  liveRun.receipt = await evidenceFile(evidence, 'run-live-v063.meta.json', `${JSON.stringify(liveRun, null, 2)}\n`);
  runs.push(liveRun);

  const before = await evidenceFile(evidence, 'v063-before.json', '{"legacy":true}\n');
  const after = await evidenceFile(evidence, 'v063-after.json', '{"legacy":true}\n');
  const liveReportValue = {
    schema_version: 1,
    status: 'pass',
    ok: true,
    tag: 'v0.6.3',
    legacy: {
      tag_object: 'c'.repeat(40), commit: 'd'.repeat(40), tree: 'e'.repeat(40), content_sha256: 'f'.repeat(64),
    },
    candidate: { repository, commit, tree, committed_at: committedAt, clean_before: true, clean_after: true, tgz_sha256: tgz.sha256 },
    fixtures: ['codex', 'claude', 'both'].map((agent) => ({
      agent,
      migration_id: `migration-${agent}`,
      rollback_id: `migration-${agent}`,
      rollback_result: 'restored',
      post_rollback_matches: true,
      conflict_preserved_post_migration_edit: true,
    })),
  };
  const liveReport = await evidenceFile(evidence, 'live-v063-report.json', `${JSON.stringify(liveReportValue, null, 2)}\n`);
  const reviewReceiptValue = {
    schema_version: 1,
    reviewer_id: 'independent-reviewer',
    reviewer_level: 'independent-read-only',
    review_branch: 'refs/heads/codex/vibetether-stage0-review',
    repository,
    commit,
    tree,
    committed_at: committedAt,
    clean: true,
    package_sha256: tgz.sha256,
    started_at: '2026-07-22T16:20:00.000Z',
    completed_at: '2026-07-22T16:25:00.000Z',
    findings: [{ id: 'review-1', severity: 'P2', status: 'resolved', summary: 'Documentation wording corrected before candidate freeze.' }],
    disposition: 'ready-for-owner-review',
  };
  const reviewReceipt = await evidenceFile(evidence, 'independent-review.json', `${JSON.stringify(reviewReceiptValue, null, 2)}\n`);
  const manifest = {
    schema_version: 1,
    status: 'STAGE0_EVIDENCE_READY_FOR_OWNER_REVIEW',
    candidate: {
      repository,
      remote_repository: officialRepository,
      branch: 'codex/vibetether-stage0-review',
      commit,
      tree,
      clean: true,
      committed_at: committedAt,
      package_version: '1.0.0-rc.4',
      implementer_id: 'codex-primary',
    },
    artifacts: {
      tgz: { ...tgz, format: 'tgz', commit, tree, package_sha256: tgz.sha256, listing: { ...tgzListing, entry_count: 2 } },
      zip: { ...zip, format: 'zip', commit, tree, package_sha256: tgz.sha256, listing: { ...zipListing, entry_count: 2 } },
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
      candidate_repository: repository,
      candidate_commit: commit,
      candidate_tree: tree,
      candidate_committed_at: committedAt,
      candidate_clean: true,
      package_sha256: tgz.sha256,
      report: liveReport,
    },
    matrix: await Promise.all([
      ['ubuntu', 20, '1001'],
      ['ubuntu', 24, '1002'],
      ['windows', 20, '1003'],
      ['windows', 24, '1004'],
    ].map(async ([platform, node, jobId]) => {
      const url = `https://github.com/t01089572455/vibetether/actions/runs/9001/job/${jobId}`;
      const api = {
        id: Number(jobId), run_id: 9001, head_sha: commit, html_url: url,
        url: `https://api.github.com/repos/t01089572455/vibetether/actions/jobs/${jobId}`,
        run_url: 'https://api.github.com/repos/t01089572455/vibetether/actions/runs/9001',
        name: `${platform} / Node ${node}`, status: 'completed', conclusion: 'success',
        started_at: '2026-07-22T16:12:00.000Z', completed_at: '2026-07-22T16:18:00.000Z',
        steps: [{ name: 'Run Stage 0 gates', status: 'completed', conclusion: 'success' }, { name: 'Record exact package digest', status: 'completed', conclusion: 'success' }],
      };
      const apiSnapshot = await evidenceFile(evidence, `job-${jobId}.api.json`, `${JSON.stringify(api, null, 2)}\n`);
      const identity = {
        schema_version: 1,
        repository: officialRepository,
        commit,
        tree,
        committed_at: committedAt,
        clean: true,
        package_sha256: tgz.sha256,
      };
      const jobLog = await evidenceFile(evidence, `job-${jobId}.log.txt`, matrixIdentityLog(identity));
      return {
        platform,
        node,
        status: 'completed',
        conclusion: 'success',
        repository: officialRepository,
        commit,
        tree,
        committed_at: committedAt,
        clean: true,
        head_sha: commit,
        package_sha256: tgz.sha256,
        run_id: '9001',
        job_id: jobId,
        url,
        api_snapshot: apiSnapshot,
        job_log: jobLog,
      };
    })),
    review: {
      reviewer_id: 'independent-reviewer',
      reviewer_level: 'independent-read-only',
      review_branch: 'refs/heads/codex/vibetether-stage0-review',
      repository,
      commit,
      tree,
      committed_at: committedAt,
      clean: true,
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
  return { manifest, currentIdentity: { repository, commit, tree, clean: true, committed_at: committedAt }, evidence };
}

test('complete and exact-package evidence manifests validate at their own boundaries', async (t) => {
  const fixtureValue = await validFixture(t);
  const complete = await validateStage0Evidence(fixtureValue.manifest, {
    boundary: 'owner-review',
    currentIdentity: fixtureValue.currentIdentity,
  });
  assert.equal(complete.ok, true, JSON.stringify(complete.problems, null, 2));

  const local = structuredClone(fixtureValue.manifest);
  local.status = 'LOCAL_STAGE0_READY';
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

test('archive listings are derived from real TGZ and ZIP bytes instead of trusted claims', async (t) => {
  const fixtureValue = await validFixture(t);
  const candidatePackageJson = await readFile(path.join(fixtureValue.manifest.candidate.repository, 'package.json'), 'utf8');
  const timestampExtra = zipExtra(0x5455, Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00]));
  const windowsGitZip = structuredClone(fixtureValue.manifest);
  const windowsGitEntries = [
    { path: 'package.json', content: candidatePackageJson, madeBy: 20, flags: 0, externalAttributes: 0, localExtra: timestampExtra, centralExtra: timestampExtra },
    { path: 'bin/', content: '', madeBy: 20, flags: 0, externalAttributes: 0x10, localExtra: timestampExtra, centralExtra: timestampExtra },
    { path: 'bin/vibetether.mjs', content: '#!/usr/bin/env node\n', madeBy: 20, flags: 0, externalAttributes: 0, localExtra: timestampExtra, centralExtra: timestampExtra },
  ];
  const windowsGitZipFile = await evidenceFile(fixtureValue.evidence, 'windows-git-archive.zip', zipBytes(windowsGitEntries));
  const windowsGitListingValue = {
    schema_version: 1,
    format: 'zip',
    artifact_sha256: windowsGitZipFile.sha256,
    entries: windowsGitEntries.map((entry) => ({
      path: entry.path.replace(/\/$/, ''),
      type: entry.path.endsWith('/') ? 'directory' : 'file',
      size: Buffer.byteLength(entry.content),
    })),
  };
  const windowsGitListing = await evidenceFile(fixtureValue.evidence, 'windows-git-archive-listing.json', `${JSON.stringify(windowsGitListingValue, null, 2)}\n`);
  windowsGitZip.artifacts.zip = {
    ...windowsGitZip.artifacts.zip,
    ...windowsGitZipFile,
    listing: { ...windowsGitListing, entry_count: windowsGitListingValue.entries.length },
  };
  const windowsGitReport = await validateStage0Evidence(windowsGitZip, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.equal(windowsGitReport.ok, true, JSON.stringify(windowsGitReport.problems, null, 2));
  const forged = structuredClone(fixtureValue.manifest);
  const fake = await evidenceFile(fixtureValue.evidence, 'forged-tgz.bin', 'not a tar archive');
  const claimed = JSON.parse(await readFile(forged.artifacts.tgz.listing.path, 'utf8'));
  claimed.artifact_sha256 = fake.sha256;
  const forgedListing = await evidenceFile(fixtureValue.evidence, 'forged-tgz-listing.json', `${JSON.stringify(claimed, null, 2)}\n`);
  forged.artifacts.tgz = {
    ...forged.artifacts.tgz,
    ...fake,
    package_sha256: fake.sha256,
    listing: { ...forgedListing, entry_count: claimed.entries.length },
  };
  const forgedReport = await validateStage0Evidence(forged, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(forgedReport).has('ARCHIVE_BYTES_INVALID'));

  const staleListing = structuredClone(fixtureValue.manifest);
  const listing = JSON.parse(await readFile(staleListing.artifacts.tgz.listing.path, 'utf8'));
  listing.entries[0].size += 1;
  const listingFile = await evidenceFile(fixtureValue.evidence, 'stale-tgz-listing.json', `${JSON.stringify(listing, null, 2)}\n`);
  staleListing.artifacts.tgz.listing = { ...listingFile, entry_count: listing.entries.length };
  const listingReport = await validateStage0Evidence(staleListing, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(listingReport).has('ARCHIVE_CONTENT_MISMATCH'));

  const forgedZipSize = structuredClone(fixtureValue.manifest);
  const forgedZipEntries = [
    { path: 'package.json', content: candidatePackageJson, centralSize: 4096 },
    { path: 'bin/vibetether.mjs', content: '#!/usr/bin/env node\n' },
  ];
  const forgedZipFile = await evidenceFile(fixtureValue.evidence, 'forged-central-size.zip', zipBytes(forgedZipEntries));
  const forgedZipListingValue = {
    schema_version: 1,
    format: 'zip',
    artifact_sha256: forgedZipFile.sha256,
    entries: forgedZipEntries.map((entry) => ({ path: entry.path, type: 'file', size: entry.centralSize ?? Buffer.byteLength(entry.content) })),
  };
  const forgedZipListing = await evidenceFile(fixtureValue.evidence, 'forged-central-size-listing.json', `${JSON.stringify(forgedZipListingValue, null, 2)}\n`);
  forgedZipSize.artifacts.zip = {
    ...forgedZipSize.artifacts.zip,
    ...forgedZipFile,
    listing: { ...forgedZipListing, entry_count: forgedZipListingValue.entries.length },
  };
  const forgedZipReport = await validateStage0Evidence(forgedZipSize, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(forgedZipReport).has('ARCHIVE_BYTES_INVALID'));

  const symlinkZip = structuredClone(fixtureValue.manifest);
  const symlinkEntries = [
    { path: 'package.json', content: candidatePackageJson },
    { path: 'bin/vibetether.mjs', content: '#!/usr/bin/env node\n' },
    { path: 'bin/vibetether-link', content: 'vibetether.mjs', unixMode: 0o120777 },
  ];
  const symlinkZipFile = await evidenceFile(fixtureValue.evidence, 'forged-symlink.zip', zipBytes(symlinkEntries));
  const symlinkListingValue = {
    schema_version: 1,
    format: 'zip',
    artifact_sha256: symlinkZipFile.sha256,
    entries: symlinkEntries.map((entry) => ({ path: entry.path, type: 'file', size: Buffer.byteLength(entry.content) })),
  };
  const symlinkListing = await evidenceFile(fixtureValue.evidence, 'forged-symlink-listing.json', `${JSON.stringify(symlinkListingValue, null, 2)}\n`);
  symlinkZip.artifacts.zip = {
    ...symlinkZip.artifacts.zip,
    ...symlinkZipFile,
    listing: { ...symlinkListing, entry_count: symlinkListingValue.entries.length },
  };
  const symlinkReport = await validateStage0Evidence(symlinkZip, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(symlinkReport).has('ARCHIVE_BYTES_INVALID'));

  const substitutedZip = structuredClone(fixtureValue.manifest);
  const substitutedZipEntries = [
    { path: 'package.json', content: candidatePackageJson, unixMode: 0o100644 },
    { path: 'bin/vibetether.mjs', content: '#!/usr/bin/env node\nprocess.stdout.write("substituted");\n', unixMode: 0o100644 },
  ];
  const substitutedZipFile = await evidenceFile(fixtureValue.evidence, 'substituted-candidate.zip', zipBytes(substitutedZipEntries));
  const substitutedZipListingValue = {
    schema_version: 1,
    format: 'zip',
    artifact_sha256: substitutedZipFile.sha256,
    entries: substitutedZipEntries.map((entry) => ({ path: entry.path, type: 'file', size: Buffer.byteLength(entry.content) })),
  };
  const substitutedZipListing = await evidenceFile(fixtureValue.evidence, 'substituted-candidate-zip-listing.json', `${JSON.stringify(substitutedZipListingValue, null, 2)}\n`);
  substitutedZip.artifacts.zip = {
    ...substitutedZip.artifacts.zip,
    ...substitutedZipFile,
    listing: { ...substitutedZipListing, entry_count: substitutedZipListingValue.entries.length },
  };
  const substitutedZipReport = await validateStage0Evidence(substitutedZip, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(substitutedZipReport).has('ARTIFACT_CANDIDATE_MISMATCH'));

  const substitutedTgz = structuredClone(fixtureValue.manifest);
  const substitutedTgzEntries = [
    { path: 'package/package.json', content: candidatePackageJson },
    { path: 'package/bin/vibetether.mjs', content: '#!/usr/bin/env node\nprocess.stdout.write("substituted");\n' },
  ];
  const substitutedTgzFile = await evidenceFile(fixtureValue.evidence, 'substituted-candidate.tgz', tarBytes(substitutedTgzEntries));
  const substitutedTgzListingValue = {
    schema_version: 1,
    format: 'tgz',
    artifact_sha256: substitutedTgzFile.sha256,
    entries: substitutedTgzEntries.map((entry) => ({ path: entry.path, type: 'file', size: Buffer.byteLength(entry.content) })),
  };
  const substitutedTgzListing = await evidenceFile(fixtureValue.evidence, 'substituted-candidate-tgz-listing.json', `${JSON.stringify(substitutedTgzListingValue, null, 2)}\n`);
  substitutedTgz.artifacts.tgz = {
    ...substitutedTgz.artifacts.tgz,
    ...substitutedTgzFile,
    package_sha256: substitutedTgzFile.sha256,
    listing: { ...substitutedTgzListing, entry_count: substitutedTgzListingValue.entries.length },
  };
  const substitutedTgzReport = await validateStage0Evidence(substitutedTgz, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(substitutedTgzReport).has('ARTIFACT_CANDIDATE_MISMATCH'));

  const trailingTgz = structuredClone(fixtureValue.manifest);
  const trailingTgzFile = await evidenceFile(fixtureValue.evidence, 'trailing-content.tgz', tarBytes([
    { path: 'package/package.json', content: candidatePackageJson },
    { path: 'package/bin/vibetether.mjs', content: '#!/usr/bin/env node\n' },
  ], Buffer.from('hidden trailing content')));
  const trailingListing = JSON.parse(await readFile(trailingTgz.artifacts.tgz.listing.path, 'utf8'));
  trailingListing.artifact_sha256 = trailingTgzFile.sha256;
  const trailingListingFile = await evidenceFile(fixtureValue.evidence, 'trailing-content-listing.json', `${JSON.stringify(trailingListing, null, 2)}\n`);
  trailingTgz.artifacts.tgz = {
    ...trailingTgz.artifacts.tgz,
    ...trailingTgzFile,
    package_sha256: trailingTgzFile.sha256,
    listing: { ...trailingListingFile, entry_count: trailingListing.entries.length },
  };
  const trailingReport = await validateStage0Evidence(trailingTgz, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(trailingReport).has('ARCHIVE_BYTES_INVALID'));

  for (const [name, entries] of [
    ['unknown-pax', [
      { path: 'PaxHeader', content: paxRecord('size', '4096'), typeFlag: 0x78 },
      { path: 'package/package.json', content: candidatePackageJson },
      { path: 'package/bin/vibetether.mjs', content: '#!/usr/bin/env node\n' },
    ]],
    ['special-mode', [
      { path: 'package/package.json', content: candidatePackageJson, mode: 0o4644 },
      { path: 'package/bin/vibetether.mjs', content: '#!/usr/bin/env node\n' },
    ]],
    ['directory-payload', [
      { path: 'package/bin', content: 'hidden', typeFlag: 0x35, mode: 0o755 },
      { path: 'package/package.json', content: candidatePackageJson },
      { path: 'package/bin/vibetether.mjs', content: '#!/usr/bin/env node\n' },
    ]],
  ]) {
    const adversarial = structuredClone(fixtureValue.manifest);
    const archive = await evidenceFile(fixtureValue.evidence, `${name}.tgz`, tarBytes(entries));
    const listing = JSON.parse(await readFile(adversarial.artifacts.tgz.listing.path, 'utf8'));
    listing.artifact_sha256 = archive.sha256;
    const listingFile = await evidenceFile(fixtureValue.evidence, `${name}-listing.json`, `${JSON.stringify(listing, null, 2)}\n`);
    adversarial.artifacts.tgz = {
      ...adversarial.artifacts.tgz,
      ...archive,
      package_sha256: archive.sha256,
      listing: { ...listingFile, entry_count: listing.entries.length },
    };
    const report = await validateStage0Evidence(adversarial, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
    assert.ok(codes(report).has('ARCHIVE_BYTES_INVALID'), name);
  }

  for (const [name, entryOptions] of [
    ['unknown-extra', { localExtra: zipExtra(0x9999), centralExtra: zipExtra(0x9999) }],
    ['unknown-flag', { flags: 0x0810 }],
    ['unknown-host', { madeBy: (10 << 8) | 20 }],
    ['unknown-dos-attributes', { madeBy: 20, flags: 0, externalAttributes: 0x20 }],
  ]) {
    const adversarial = structuredClone(fixtureValue.manifest);
    const entries = [
      { path: 'package.json', content: candidatePackageJson, unixMode: 0o100644, ...entryOptions },
      { path: 'bin/vibetether.mjs', content: '#!/usr/bin/env node\n', unixMode: 0o100644 },
    ];
    const archive = await evidenceFile(fixtureValue.evidence, `${name}.zip`, zipBytes(entries));
    const listing = JSON.parse(await readFile(adversarial.artifacts.zip.listing.path, 'utf8'));
    listing.artifact_sha256 = archive.sha256;
    const listingFile = await evidenceFile(fixtureValue.evidence, `${name}-listing.json`, `${JSON.stringify(listing, null, 2)}\n`);
    adversarial.artifacts.zip = {
      ...adversarial.artifacts.zip,
      ...archive,
      listing: { ...listingFile, entry_count: listing.entries.length },
    };
    const report = await validateStage0Evidence(adversarial, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
    assert.ok(codes(report).has('ARCHIVE_BYTES_INVALID'), name);
  }

  const specialDirectoryZip = structuredClone(fixtureValue.manifest);
  const specialDirectoryEntries = [
    { path: 'bin/', content: '', unixMode: 0o044755 },
    { path: 'package.json', content: candidatePackageJson, unixMode: 0o100644 },
    { path: 'bin/vibetether.mjs', content: '#!/usr/bin/env node\n', unixMode: 0o100644 },
  ];
  const specialDirectoryFile = await evidenceFile(fixtureValue.evidence, 'special-directory-mode.zip', zipBytes(specialDirectoryEntries));
  const specialDirectoryListingValue = {
    schema_version: 1,
    format: 'zip',
    artifact_sha256: specialDirectoryFile.sha256,
    entries: specialDirectoryEntries.map((entry) => ({
      path: entry.path.replace(/\/$/, ''),
      type: entry.path.endsWith('/') ? 'directory' : 'file',
      size: Buffer.byteLength(entry.content),
    })),
  };
  const specialDirectoryListing = await evidenceFile(fixtureValue.evidence, 'special-directory-mode-listing.json', `${JSON.stringify(specialDirectoryListingValue, null, 2)}\n`);
  specialDirectoryZip.artifacts.zip = {
    ...specialDirectoryZip.artifacts.zip,
    ...specialDirectoryFile,
    listing: { ...specialDirectoryListing, entry_count: specialDirectoryListingValue.entries.length },
  };
  const specialDirectoryReport = await validateStage0Evidence(specialDirectoryZip, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(specialDirectoryReport).has('ARCHIVE_BYTES_INVALID'));
});

test('every governed run receipt binds repository, commit, tree, package, cleanliness, and candidate time', async (t) => {
  const fixtureValue = await validFixture(t);
  const wrongIdentity = structuredClone(fixtureValue.manifest);
  const run = JSON.parse(await readFile(wrongIdentity.runs[0].receipt.path, 'utf8'));
  Object.assign(run, {
    repository: path.join(fixtureValue.evidence, 'wrong-repository'),
    cwd: path.join(fixtureValue.evidence, 'wrong-repository'),
    commit: '0'.repeat(40),
    tree: '1'.repeat(40),
    clean_before: false,
    package_sha256: '2'.repeat(64),
  });
  const receipt = await evidenceFile(fixtureValue.evidence, 'wrong-run.meta.json', `${JSON.stringify(run, null, 2)}\n`);
  wrongIdentity.runs[0] = { ...wrongIdentity.runs[0], ...run, receipt };
  const wrongReport = await validateStage0Evidence(wrongIdentity, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(wrongReport).has('RUN_IDENTITY_MISMATCH'));

  const staleTime = structuredClone(fixtureValue.manifest);
  const oldRun = JSON.parse(await readFile(staleTime.runs[0].receipt.path, 'utf8'));
  oldRun.started_at = '2000-01-01T00:00:00.000Z';
  oldRun.finished_at = '2000-01-01T00:00:01.000Z';
  const oldReceipt = await evidenceFile(fixtureValue.evidence, 'old-run.meta.json', `${JSON.stringify(oldRun, null, 2)}\n`);
  staleTime.runs[0] = { ...staleTime.runs[0], ...oldRun, receipt: oldReceipt };
  const oldReport = await validateStage0Evidence(staleTime, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(oldReport).has('RUN_TIME_INVALID'));

  const missingCommitTime = structuredClone(fixtureValue.manifest);
  const timelessRun = JSON.parse(await readFile(missingCommitTime.runs[0].receipt.path, 'utf8'));
  delete timelessRun.committed_at;
  const timelessReceipt = await evidenceFile(fixtureValue.evidence, 'timeless-run.meta.json', `${JSON.stringify(timelessRun, null, 2)}\n`);
  missingCommitTime.runs[0] = { ...timelessRun, receipt: timelessReceipt };
  const timelessReport = await validateStage0Evidence(missingCommitTime, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(timelessReport).has('RUN_IDENTITY_MISMATCH'));

  const missingPath = structuredClone(fixtureValue.manifest);
  const cwdRepository = path.resolve();
  missingPath.status = 'LOCAL_STAGE0_READY';
  missingPath.candidate.repository = cwdRepository;
  missingPath.live_v063 = null;
  missingPath.matrix = [];
  missingPath.review = null;
  missingPath.open_axes = ['ui_golden_screen', 'ui_visual', 'live_v063', 'remote_matrix', 'independent_review', 'owner_acceptance'];
  for (const [index, declared] of missingPath.runs.entries()) {
    const receiptValue = JSON.parse(await readFile(declared.receipt.path, 'utf8'));
    receiptValue.repository = cwdRepository;
    receiptValue.cwd = cwdRepository;
    if (index === 0) delete receiptValue.repository;
    const receiptFile = await evidenceFile(fixtureValue.evidence, `missing-path-run-${index}.meta.json`, `${JSON.stringify(receiptValue, null, 2)}\n`);
    missingPath.runs[index] = { ...receiptValue, receipt: receiptFile };
  }
  const missingPathReport = await validateStage0Evidence(missingPath, {
    boundary: 'exact-package',
    currentIdentity: { ...fixtureValue.currentIdentity, repository: cwdRepository },
  });
  assert.ok(codes(missingPathReport).has('RUN_IDENTITY_MISMATCH'));

  const relabeledJourney = structuredClone(fixtureValue.manifest);
  const journeyIndex = relabeledJourney.runs.findIndex((item) => item.id === 'run-package-journey');
  const journey = JSON.parse(await readFile(relabeledJourney.runs[journeyIndex].receipt.path, 'utf8'));
  journey.stdout = await evidenceFile(
    fixtureValue.evidence,
    'relabeled-package-journey.stdout.txt',
    `package journey passed\nVIBETETHER_STAGE0_PACKAGE_JOURNEY_SHA256=${'0'.repeat(64)}\n`,
  );
  const journeyReceipt = await evidenceFile(fixtureValue.evidence, 'relabeled-package-journey.meta.json', `${JSON.stringify(journey, null, 2)}\n`);
  relabeledJourney.runs[journeyIndex] = { ...journey, receipt: journeyReceipt };
  const relabeledJourneyReport = await validateStage0Evidence(relabeledJourney, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(relabeledJourneyReport).has('PACKAGE_JOURNEY_IDENTITY_MISMATCH'));
});

test('live, matrix, and review summaries are cross-checked against retained authoritative receipts', async (t) => {
  const fixtureValue = await validFixture(t);

  const wrongLive = structuredClone(fixtureValue.manifest);
  const liveReport = JSON.parse(await readFile(wrongLive.live_v063.report.path, 'utf8'));
  liveReport.candidate.tgz_sha256 = '0'.repeat(64);
  wrongLive.live_v063.report = await evidenceFile(fixtureValue.evidence, 'wrong-live-report.json', `${JSON.stringify(liveReport, null, 2)}\n`);
  const wrongLiveReport = await validateStage0Evidence(wrongLive, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(wrongLiveReport).has('LIVE_V063_IDENTITY_MISMATCH'));

  const timelessLive = structuredClone(fixtureValue.manifest);
  const timelessLiveReportValue = JSON.parse(await readFile(timelessLive.live_v063.report.path, 'utf8'));
  delete timelessLiveReportValue.candidate.committed_at;
  timelessLive.live_v063.report = await evidenceFile(fixtureValue.evidence, 'timeless-live-report.json', `${JSON.stringify(timelessLiveReportValue, null, 2)}\n`);
  const timelessLiveReport = await validateStage0Evidence(timelessLive, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(timelessLiveReport).has('LIVE_V063_IDENTITY_MISMATCH'));

  const wrongMatrix = structuredClone(fixtureValue.manifest);
  const api = JSON.parse(await readFile(wrongMatrix.matrix[0].api_snapshot.path, 'utf8'));
  api.head_sha = '0'.repeat(40);
  wrongMatrix.matrix[0].api_snapshot = await evidenceFile(fixtureValue.evidence, 'wrong-job-api.json', `${JSON.stringify(api, null, 2)}\n`);
  wrongMatrix.matrix[0].job_log = await evidenceFile(fixtureValue.evidence, 'wrong-job.log.txt', matrixIdentityLog({
    schema_version: 1,
    repository: officialRepository,
    commit: '0'.repeat(40),
    tree: wrongMatrix.matrix[0].tree,
    committed_at: wrongMatrix.matrix[0].committed_at,
    clean: true,
    package_sha256: '0'.repeat(64),
  }));
  const wrongMatrixReport = await validateStage0Evidence(wrongMatrix, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(wrongMatrixReport).has('MATRIX_COMMIT_MISMATCH'));
  assert.ok(codes(wrongMatrixReport).has('MATRIX_PACKAGE_MISMATCH'));

  const wrongMatrixIdentity = structuredClone(fixtureValue.manifest);
  const matrixIdentity = {
    schema_version: 1,
    repository: officialRepository,
    commit: wrongMatrixIdentity.candidate.commit,
    tree: '0'.repeat(40),
    committed_at: wrongMatrixIdentity.candidate.committed_at,
    clean: true,
    package_sha256: wrongMatrixIdentity.artifacts.tgz.sha256,
  };
  wrongMatrixIdentity.matrix[0].job_log = await evidenceFile(fixtureValue.evidence, 'wrong-job-identity.log.txt', matrixIdentityLog(matrixIdentity));
  const wrongMatrixIdentityReport = await validateStage0Evidence(wrongMatrixIdentity, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(wrongMatrixIdentityReport).has('MATRIX_IDENTITY_MISMATCH'));

  const strippedMatrixLog = structuredClone(fixtureValue.manifest);
  const authenticLog = await readFile(strippedMatrixLog.matrix[0].job_log.path, 'utf8');
  strippedMatrixLog.matrix[0].job_log = await evidenceFile(
    fixtureValue.evidence,
    'stripped-job-identity.log.txt',
    authenticLog.replace(/^\d{4}-\d{2}-\d{2}T[^ ]+ /gm, ''),
  );
  const strippedMatrixLogReport = await validateStage0Evidence(strippedMatrixLog, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(strippedMatrixLogReport).has('MATRIX_IDENTITY_MISMATCH'));
  assert.ok(codes(strippedMatrixLogReport).has('MATRIX_PACKAGE_MISMATCH'));

  const wrongReview = structuredClone(fixtureValue.manifest);
  const reviewReceipt = JSON.parse(await readFile(wrongReview.review.receipt.path, 'utf8'));
  reviewReceipt.commit = '0'.repeat(40);
  wrongReview.review.receipt = await evidenceFile(fixtureValue.evidence, 'wrong-review.json', `${JSON.stringify(reviewReceipt, null, 2)}\n`);
  const wrongReviewReport = await validateStage0Evidence(wrongReview, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(wrongReviewReport).has('REVIEW_IDENTITY_MISMATCH'));

  const missingReviewRepository = structuredClone(fixtureValue.manifest);
  const repositorylessReview = JSON.parse(await readFile(missingReviewRepository.review.receipt.path, 'utf8'));
  delete repositorylessReview.repository;
  missingReviewRepository.review.receipt = await evidenceFile(fixtureValue.evidence, 'repositoryless-review.json', `${JSON.stringify(repositorylessReview, null, 2)}\n`);
  const repositorylessReviewReport = await validateStage0Evidence(missingReviewRepository, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(repositorylessReviewReport).has('REVIEW_IDENTITY_MISMATCH'));
});

test('owner-review boundary requires the golden-screen and owner decisions to remain explicitly open', async (t) => {
  const fixtureValue = await validFixture(t);
  fixtureValue.manifest.open_axes = ['owner_acceptance'];
  const report = await validateStage0Evidence(fixtureValue.manifest, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(report).has('OPEN_AXIS_MISSING'));
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

  const missingReviewer = structuredClone(fixtureValue.manifest);
  const missingReviewerReceipt = JSON.parse(await readFile(missingReviewer.review.receipt.path, 'utf8'));
  delete missingReviewer.review.reviewer_id;
  delete missingReviewerReceipt.reviewer_id;
  missingReviewer.review.receipt = await evidenceFile(fixtureValue.evidence, 'missing-reviewer.json', `${JSON.stringify(missingReviewerReceipt, null, 2)}\n`);
  const missingReviewerReport = await validateStage0Evidence(missingReviewer, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(missingReviewerReport).has('REVIEW_NOT_INDEPENDENT'));

  const aliasSelfReview = structuredClone(fixtureValue.manifest);
  const aliasReceipt = JSON.parse(await readFile(aliasSelfReview.review.receipt.path, 'utf8'));
  aliasSelfReview.review.reviewer_id = aliasSelfReview.candidate.implementer_id.toUpperCase();
  aliasReceipt.reviewer_id = aliasSelfReview.review.reviewer_id;
  aliasSelfReview.review.receipt = await evidenceFile(fixtureValue.evidence, 'alias-self-review.json', `${JSON.stringify(aliasReceipt, null, 2)}\n`);
  const aliasSelfReviewReport = await validateStage0Evidence(aliasSelfReview, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(aliasSelfReviewReport).has('REVIEW_NOT_INDEPENDENT'));

  const blankImplementer = structuredClone(fixtureValue.manifest);
  blankImplementer.candidate.implementer_id = '   ';
  const blankImplementerReport = await validateStage0Evidence(blankImplementer, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(blankImplementerReport).has('IMPLEMENTER_ID_MISSING'));

  const configured = structuredClone(fixtureValue.manifest);
  configured.matrix[0].status = 'configured';
  configured.matrix[0].conclusion = null;
  configured.matrix[0].url = 'https://github.com/t01089572455/vibetether/actions/workflows/ci.yml';
  const configuredReport = await validateStage0Evidence(configured, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(configuredReport).has('MATRIX_JOB_NOT_SUCCESSFUL'));

  const foreignOrigin = structuredClone(fixtureValue.manifest);
  foreignOrigin.matrix[0].url = `https://evidence.invalid/actions/runs/${foreignOrigin.matrix[0].run_id}/job/${foreignOrigin.matrix[0].job_id}`;
  const foreignApi = JSON.parse(await readFile(foreignOrigin.matrix[0].api_snapshot.path, 'utf8'));
  foreignApi.html_url = foreignOrigin.matrix[0].url;
  foreignOrigin.matrix[0].api_snapshot = await evidenceFile(fixtureValue.evidence, 'foreign-origin-api.json', `${JSON.stringify(foreignApi, null, 2)}\n`);
  const foreignOriginReport = await validateStage0Evidence(foreignOrigin, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(foreignOriginReport).has('MATRIX_JOB_NOT_SUCCESSFUL'));

  const impersonated = structuredClone(fixtureValue.manifest);
  impersonated.controls.release_authorized = true;
  impersonated.status = 'RELEASE_READY';
  const impersonatedReport = await validateStage0Evidence(impersonated, { boundary: 'owner-review', currentIdentity: fixtureValue.currentIdentity });
  assert.ok(codes(impersonatedReport).has('RELEASE_BOUNDARY_IMPERSONATION'));
});

test('malformed candidate prerequisites return structured problems instead of throwing', async (t) => {
  const report = await validateStage0Evidence({
    schema_version: 1,
    status: 'LOCAL_STAGE0_READY',
    candidate: null,
    artifacts: {},
    runs: [{ receipt: { path: path.resolve('missing-receipt.json'), sha256: '0'.repeat(64) } }],
    gates: {},
    controls: { main_merged: false, released: false, release_authorized: false },
    open_axes: ['ui_golden_screen', 'ui_visual', 'live_v063', 'remote_matrix', 'independent_review', 'owner_acceptance'],
  }, { boundary: 'exact-package', currentIdentity: null });
  assert.equal(report.ok, false);
  assert.ok(codes(report).has('CANDIDATE_MISSING'));

  const fixtureValue = await validFixture(t);
  const missingOwnerCandidate = structuredClone(fixtureValue.manifest);
  missingOwnerCandidate.candidate = null;
  const missingOwnerReport = await validateStage0Evidence(missingOwnerCandidate, { boundary: 'owner-review', currentIdentity: null });
  assert.ok(codes(missingOwnerReport).has('CANDIDATE_MISSING'));

  const wrongTypes = structuredClone(fixtureValue.manifest);
  wrongTypes.candidate.repository = 42;
  wrongTypes.review.findings = { unexpected: true };
  const wrongTypesReport = await validateStage0Evidence(wrongTypes, { boundary: 'owner-review', currentIdentity: null });
  assert.ok(codes(wrongTypesReport).has('CANDIDATE_REPOSITORY_INVALID'));
  assert.ok(codes(wrongTypesReport).has('REVIEW_FINDINGS_MISSING'));
});

test('package scripts and remote matrix execute the governed Stage 0 checks', async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['verify:stage0-evidence'], 'node scripts/verify-stage0-evidence.mjs');
  assert.equal(packageJson.scripts['test:stage0-evidence'], 'node --test test/stage0-evidence-manifest.test.mjs');
  assert.equal(packageJson.scripts['test:stage0-package'], 'node --test test/rc4-package-journey.test.mjs test/stage0-package-capabilities.test.mjs test/stage0-package-contract.test.mjs');
  assert.equal(packageJson.scripts['record:stage0-package-digest'], 'node scripts/record-stage0-package-digest.mjs');
  assert.match(packageJson.scripts.check, /npm run audit:stage0/);

  const workflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  for (const command of ['npm run audit:stage0', 'npm run test:stage0-evidence', 'npm run test:stage0-package', 'npm run record:stage0-package-digest']) {
    assert.match(workflow, new RegExp(command.replaceAll(':', '\\:')));
  }
  assert.match(workflow, /name:\s+Run Stage 0 gates[\s\S]*name:\s+Record exact package digest/);

  const recorder = await readFile(path.join(root, 'scripts', 'record-stage0-package-digest.mjs'), 'utf8');
  assert.match(recorder, /VIBETETHER_STAGE0_IDENTITY=/);
  assert.match(recorder, /committed_at:\s*committedAt/);
  assert.match(recorder, /status'\s*,\s*'--porcelain=v1/);

  const attributes = await readFile(path.join(root, '.gitattributes'), 'utf8');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.match(attributes, /^registry\/community\/\*\* -text -whitespace$/m);
  assert.match(attributes, /^registry\/licenses\/\*\* -text$/m);
});

test('live v0.6.3 exports the exact rollback receipt consumed by final evidence', async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'vibetether-live-v063-receipt-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const before = [{ path: 'AGENTS.md', kind: 'file', bytes: 12, sha256: 'a'.repeat(64) }];
  const receipt = await retainRollbackEvidence(base, 'codex', {
    migrationId: 'migration-live-codex',
    rollbackResult: { status: 'rolled-back', migration_id: 'migration-live-codex' },
    before,
    after: structuredClone(before),
  });

  assert.equal(receipt.migration_id, 'migration-live-codex');
  assert.equal(receipt.rollback_id, 'migration-live-codex');
  assert.equal(receipt.rollback_result, 'restored');
  assert.equal(receipt.post_rollback_matches, true);
  assert.deepEqual(JSON.parse(await readFile(receipt.before_inventory.path, 'utf8')), before);
  assert.deepEqual(
    await readFile(receipt.post_rollback_inventory.path),
    await readFile(receipt.before_inventory.path),
  );
  assert.equal(receipt.before_inventory.sha256, receipt.post_rollback_inventory.sha256);

  await assert.rejects(
    retainRollbackEvidence(base, 'claude', {
      migrationId: 'migration-live-claude',
      rollbackResult: { status: 'rolled-back', migration_id: 'migration-live-claude' },
      before,
      after: [{ ...before[0], bytes: 13 }],
    }),
    /inventory differs/i,
  );
});
