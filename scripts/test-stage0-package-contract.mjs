#!/usr/bin/env node
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANAGED_END, MANAGED_START } from '../src/constants.mjs';
import { renderProjectLauncher } from '../src/launcher.mjs';

export const REQUIRED_ARCHIVE_FILES = Object.freeze([
  'package/bin/vibetether.mjs',
  'package/package.json',
  'package/registry/capabilities.json',
  'package/registry/providers.json',
  'package/src/cli.mjs',
  'package/skills/vibe-tether/SKILL.md',
]);

export const STAGE0_PACKAGE_JOURNEYS = Object.freeze([
  'installed-capability-routing',
  'fresh-contract',
  'provider-profiles-and-provenance',
  'provider-integrity-tamper',
  'custom-route-non-weakening',
  'installed-ui-gate',
  'upgrade-rollback-user-routes',
  'proven-path-recall-and-invalidation',
  'outcome-evidence',
  'release-guard',
  'deep-permit-revocation',
]);

const RC1_BODY = `Use the \`vibe-tether\` Skill at task entry, after compaction or resume, before a consequential decision, and before completion or handoff.\n\nRun \`vibetether context --boundary <boundary> --json\` before reading VibeTether state. Follow only its confirmed truth handles, current slice, blockers, selected provider, and fresh applicable experience.\n\nDo not read raw VibeTether runtime state, provider catalogs, unselected Skills, or unselected experience. Do not alter project direction or activate project truth without the required user confirmation.`;
const RC1_BLOCK = `${MANAGED_START}\n${RC1_BODY}\n${MANAGED_END}`;

function contractError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function safeArchivePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')
      || /^[/\\]/.test(value) || /^[a-zA-Z]:/.test(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment && segment !== '.' && segment !== '..' && !segment.includes(':'));
}

export function validateArchiveContract({ entries, sha256, expected_sha256: expectedSha256 }) {
  if (!Array.isArray(entries) || entries.length === 0) throw contractError('PACKAGE_ARCHIVE_EMPTY', 'Archive entries are required.');
  const paths = new Set();
  for (const raw of entries) {
    const entry = typeof raw === 'string' ? { path: raw, type: 'file' } : raw;
    if (!safeArchivePath(entry?.path) || !entry.path.startsWith('package/')) {
      throw contractError('PACKAGE_ARCHIVE_UNSAFE', `Unsafe archive path: ${entry?.path ?? 'missing'}`);
    }
    if (!['file', 'directory'].includes(entry.type)) {
      throw contractError('PACKAGE_ARCHIVE_ENTRY_TYPE', `Unsupported archive entry type ${entry.type ?? 'missing'} at ${entry.path}.`);
    }
    const folded = entry.path.toLocaleLowerCase('en-US');
    if (paths.has(folded)) throw contractError('PACKAGE_ARCHIVE_COLLISION', `Duplicate or case-colliding archive path: ${entry.path}`);
    paths.add(folded);
  }
  const missing = REQUIRED_ARCHIVE_FILES.filter((item) => !paths.has(item.toLocaleLowerCase('en-US')));
  if (missing.length) throw contractError('PACKAGE_ARCHIVE_MISSING', `Required package files are missing: ${missing.join(', ')}`);
  if (!/^[a-f0-9]{64}$/.test(sha256 ?? '') || sha256 !== expectedSha256) {
    throw contractError('PACKAGE_DIGEST_MISMATCH', 'TGZ digest does not match the expected exact artifact digest.');
  }
  return { safe: true, files: [...paths].sort(), sha256 };
}

export function assertCapabilityCoverage({ baseline, registry, observed }) {
  const expected = (baseline?.public_capabilities ?? []).map((item) => item.id).sort();
  const actual = (registry?.capabilities ?? []).map((item) => item.id).sort();
  const observedIds = (observed ?? []).map((item) => item.id);
  if (expected.length !== baseline?.candidate_capability_count) {
    throw contractError('CAPABILITY_BASELINE_COUNT', 'Candidate capability count does not match the public inventory.');
  }
  const unrepresented = actual.filter((id) => !expected.includes(id));
  const missingRegistry = expected.filter((id) => !actual.includes(id));
  const missingObserved = expected.filter((id) => !observedIds.includes(id));
  const duplicates = observedIds.filter((id, index) => observedIds.indexOf(id) !== index);
  for (const item of observed ?? []) {
    if (!item.journey_id || !/^[a-f0-9]{64}$/.test(item.provider_fingerprint ?? '')
        || !/^[a-f0-9]{64}$/.test(item.provider_object_hash ?? '')
        || !Number.isInteger(item.shortlist_size) || item.shortlist_size < 1 || item.shortlist_size > 3) {
      throw contractError('CAPABILITY_JOURNEY_INVALID', `Capability journey is incomplete: ${item.id ?? 'unknown'}`);
    }
  }
  if (unrepresented.length || missingRegistry.length || missingObserved.length || duplicates.length) {
    throw contractError(
      'CAPABILITY_COVERAGE_INCOMPLETE',
      `Unrepresented: ${unrepresented.join(', ') || 'none'}; missing registry: ${missingRegistry.join(', ') || 'none'}; missing journey: ${missingObserved.join(', ') || 'none'}; duplicates: ${duplicates.join(', ') || 'none'}.`,
    );
  }
  return {
    complete: true,
    covered_ids: [...expected],
    missing_ids: [],
    unrepresented_ids: [],
    journeys: structuredClone(observed),
  };
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw contractError('PACKAGE_REPORT_INCOMPLETE', `${field} is required.`);
  return value;
}

export function validateStage0PackageReport(report) {
  requireObject(report, 'report');
  const source = requireObject(report.source, 'source');
  const archive = requireObject(report.archive, 'archive');
  const install = requireObject(report.install, 'install');
  const runtime = requireObject(report.runtime, 'runtime');
  if (report.ok !== true || source.clean !== true || !/^[a-f0-9]{40}$/.test(source.commit ?? '')
      || !Array.isArray(source.tree_status) || source.tree_status.length !== 0) {
    throw contractError('PACKAGE_SOURCE_IDENTITY', 'A clean exact 40-character source commit and empty tree status are required.');
  }
  validateArchiveContract({
    entries: (archive.files ?? []).map((entry) => typeof entry === 'string' ? { path: entry, type: entry.endsWith('/') ? 'directory' : 'file' } : entry),
    sha256: archive.sha256,
    expected_sha256: install.tgz_sha256,
  });
  if (!runtime.node || !runtime.platform || !runtime.arch || !install.version) {
    throw contractError('PACKAGE_RUNTIME_IDENTITY', 'Node, platform, architecture, and installed package version are required.');
  }
  if (!Array.isArray(report.journey_ids)
      || STAGE0_PACKAGE_JOURNEYS.some((id) => !report.journey_ids.includes(id))) {
    throw contractError('PACKAGE_JOURNEY_INCOMPLETE', 'The complete Stage 0 installed-package journey set is required.');
  }
  if (report.providers?.runtime_download_directory_created !== false
      || report.capability_coverage?.complete !== true
      || report.cleanup?.completed !== true
      || report.cleanup?.base_removed !== true) {
    throw contractError('PACKAGE_REPORT_BOUNDARY', 'Provider-download, capability-coverage, and cleanup boundaries must be proven.');
  }
  return { ok: true, source_commit: source.commit, tgz_sha256: archive.sha256, journey_ids: [...report.journey_ids] };
}

function replaceManagedBlock(source) {
  const start = source.indexOf(MANAGED_START);
  const endStart = source.indexOf(MANAGED_END, start);
  if (start < 0 || endStart < 0) throw contractError('MANAGED_BLOCK_MISSING', 'The installed host file has no managed VibeTether block.');
  return `${source.slice(0, start)}${RC1_BLOCK}${source.slice(endStart + MANAGED_END.length)}`;
}

export async function downgradeProjectToRc1(project, { agent = 'codex' } = {}) {
  const manifestPath = path.join(project, '.vibetether', 'project.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.vibetether_version = '1.0.0-rc.1';
  manifest.control_generation = '11111111-1111-4111-8111-111111111111';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(project, '.vibetether', 'vt.mjs'), renderProjectLauncher('1.0.0-rc.1'));
  const hosts = agent === 'both'
    ? [['AGENTS.md', '.agents'], ['CLAUDE.md', '.claude']]
    : agent === 'claude' ? [['CLAUDE.md', '.claude']] : [['AGENTS.md', '.agents']];
  for (const [instructions, root] of hosts) {
    const target = path.join(project, instructions);
    await writeFile(target, replaceManagedBlock(await readFile(target, 'utf8')));
    await rm(path.join(project, root, 'skills', 'vibe-tether-deep'), { recursive: true, force: true });
  }
  return { project, version: manifest.vibetether_version };
}

async function commandLine() {
  const index = process.argv.indexOf('--report');
  if (index < 0 || !process.argv[index + 1]) throw contractError('PACKAGE_REPORT_REQUIRED', 'Use --report <path>.');
  const report = JSON.parse(await readFile(path.resolve(process.argv[index + 1]), 'utf8'));
  process.stdout.write(`${JSON.stringify(validateStage0PackageReport(report), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  commandLine().catch((error) => {
    process.stderr.write(`VibeTether Stage 0 package contract failed: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
