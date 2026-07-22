import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultBaselinePath,
  defaultStatusPath,
  expectedCapabilityStatus,
  packageRoot,
} from './render-capability-status.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const allowedMaturity = new Set(['implemented', 'partial-advisory', 'designed']);

function option(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 ? path.resolve(packageRoot, argv[index + 1]) : fallback;
}

function sameMembers(left, right) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function issue(code, message) {
  return { code, message };
}

export async function auditStage0({
  baselinePath = defaultBaselinePath,
  statusPath = defaultStatusPath,
  projectPath = path.join(packageRoot, '.vibetether', 'project.json'),
} = {}) {
  const problems = [];
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const registry = JSON.parse(await readFile(path.join(packageRoot, 'registry', 'capabilities.json'), 'utf8'));
  const entries = baseline.public_capabilities ?? [];
  const entryIds = entries.map(({ id }) => id);
  const registryIds = registry.capabilities.map(({ id }) => id);
  const classifications = baseline.capability_classification ?? {};
  const retained = classifications.retained_public ?? [];
  const candidates = classifications.stage0_candidate_public ?? [];
  const classified = [...retained, ...(classifications.internal ?? []), ...(classifications.later_designed ?? []), ...candidates];
  const journeys = new Map((baseline.package_journeys ?? []).map((journey) => [journey.id, journey]));

  if (new Set(entryIds).size !== entryIds.length) problems.push(issue('DUPLICATE_CAPABILITY', 'Stage 0 capability IDs must be unique.'));
  if (entryIds.length !== baseline.candidate_capability_count) problems.push(issue('CAPABILITY_COUNT_MISMATCH', 'Candidate capability count does not match the inventory.'));
  if (retained.length !== baseline.baseline_capability_count) problems.push(issue('BASELINE_COUNT_MISMATCH', 'Retained-public count does not match the baseline count.'));
  if (!sameMembers(classified, entryIds)) problems.push(issue('CAPABILITY_CLASSIFICATION_INCOMPLETE', 'Every inventory capability must have exactly one visibility/disposition classification.'));
  if (!sameMembers(registryIds, entryIds)) problems.push(issue('CAPABILITY_INVENTORY_STALE', 'registry/capabilities.json and the Stage 0 candidate inventory differ.'));
  for (const entry of entries) {
    if (!allowedMaturity.has(entry.maturity)) problems.push(issue('INVALID_MATURITY', `${entry.id} has unsupported maturity ${entry.maturity}.`));
    if (!Array.isArray(entry.journeys) || entry.journeys.length === 0) problems.push(issue('PUBLIC_JOURNEY_MISSING', `${entry.id} has no public journey.`));
    for (const journeyId of entry.journeys ?? []) {
      const journey = journeys.get(journeyId);
      if (!journey?.test_id || !journey?.test_file || !journey?.public_path) problems.push(issue('PUBLIC_JOURNEY_INVALID', `${entry.id} references incomplete journey ${journeyId}.`));
    }
  }
  for (const relative of [
    ...(baseline.capability_locator_defaults?.source ?? []),
    ...(baseline.capability_locator_defaults?.tests ?? []),
    ...(baseline.capability_locator_defaults?.documentation ?? []),
    ...[...journeys.values()].map(({ test_file: testFile }) => testFile),
  ]) {
    await access(path.join(packageRoot, relative)).catch(() => problems.push(issue('LOCATOR_MISSING', `Missing Stage 0 locator: ${relative}`)));
  }
  if (!Array.isArray(baseline.completion_evidence_axes) || baseline.completion_evidence_axes.length === 0) {
    problems.push(issue('COMPLETION_AXES_MISSING', 'Stage 0 completion evidence axes are missing.'));
  }
  await access(projectPath).catch(() => problems.push(issue('SELF_CONTRACT_MISSING', 'The repository has no tracked VibeTether Project Contract.')));

  if (path.extname(statusPath).toLowerCase() === '.json') {
    const status = JSON.parse(await readFile(statusPath, 'utf8'));
    if (status.generated !== true || status.source_snapshot !== baseline.baseline_ref) {
      problems.push(issue('SELF_STATUS_STALE', 'The supplied status fixture is not generated from the current baseline.'));
    }
  } else {
    const [expected, actual] = await Promise.all([
      expectedCapabilityStatus(baselinePath),
      readFile(statusPath, 'utf8').catch(() => ''),
    ]);
    if (actual !== expected) problems.push(issue('SELF_STATUS_STALE', 'The generated capability status does not match the canonical manifest.'));
  }
  return {
    schema_version: 1,
    ok: problems.length === 0,
    baseline_ref: baseline.baseline_ref,
    registry_capability_count: registryIds.length,
    candidate_capability_count: entryIds.length,
    problems,
  };
}

async function main(argv = process.argv.slice(2)) {
  const report = await auditStage0({
    baselinePath: option(argv, '--baseline', defaultBaselinePath),
    statusPath: option(argv, '--status', defaultStatusPath),
    projectPath: option(argv, '--project-contract', path.join(packageRoot, '.vibetether', 'project.json')),
  });
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else if (report.ok) process.stdout.write(`Stage 0 baseline audit passed (${report.registry_capability_count} capabilities).\n`);
  else for (const problem of report.problems) process.stderr.write(`${problem.code}: ${problem.message}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) {
  await main();
}
