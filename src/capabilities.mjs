import { access, lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from './errors.mjs';
import { isSafeProjectRelativeArtifactPath, isSensitiveArtifactPath } from './artifact-safety.mjs';
import { matchExperience, parseExperienceIndex } from './experience-index.mjs';
import { parseManifest } from './manifest.mjs';
import {
  assertCapabilityBoard,
  resolveCapabilityRoute,
} from '../skills/vibe-tether/scripts/capability-routing.mjs';
import { parseCanonicalManifest } from '../skills/vibe-tether/scripts/manifest.mjs';

const DEFAULT_EXPERIENCE_INDEX = '.vibetether/experience-index.yaml';

function inside(root, relativePath, label) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new CliError(`${label} path escapes the project: ${relativePath}`, 3);
  }
  return target;
}

function parseBoardSource(source) {
  try {
    return JSON.parse(source);
  } catch {
    throw new CliError('Cannot parse capability board. Run vibetether doctor for details.', 3);
  }
}

async function readSafeProjectFile(root, relativePath, label, { authorityRoute = false } = {}) {
  if (typeof relativePath !== 'string'
      || relativePath.length === 0
      || !isSafeProjectRelativeArtifactPath(relativePath)
      || (authorityRoute && isSensitiveArtifactPath(relativePath))) {
    throw new CliError(`${label} path is unsafe. Run vibetether doctor for details.`, 3);
  }
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  let current = root;
  if (!relative) throw new CliError(`${label} must be a regular file. Run vibetether doctor for details.`, 3);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      throw new CliError(`${label} path is linked. Run vibetether doctor for details.`, 3);
    }
    if (current === target && !metadata.isFile()) {
      throw new CliError(`${label} must be a regular file. Run vibetether doctor for details.`, 3);
    }
  }
  return readFile(target, 'utf8');
}

export async function refreshBoardAvailability(board, root) {
  const refreshed = structuredClone(board);
  for (const route of refreshed.routes ?? []) {
    const available = [];
    for (const [harness, relativePath] of Object.entries(route.recommendation?.installations ?? {})) {
      const target = inside(root, relativePath, 'Provider installation');
      try {
        await access(target);
        available.push(harness);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (route.recommendation?.installations) route.recommendation.available_in = available;
  }
  for (const provider of refreshed.providers ?? []) {
    const available = [];
    for (const [harness, relativePath] of Object.entries(provider.installations ?? {})) {
      const target = inside(root, relativePath, 'Provider installation');
      try {
        await access(target);
        available.push(harness);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    provider.available_in = available;
  }
  return refreshed;
}

export function resolveBoardRoute(board, request) {
  try {
    return resolveCapabilityRoute(board, request);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(error.message, error.exitCode ?? 2);
  }
}

async function loadCapabilitySnapshot(project, { includeExperience = false } = {}) {
  let root;
  try {
    root = await realpath(path.resolve(project));
  } catch {
    throw new CliError(`Project directory does not exist: ${project}`);
  }
  let manifest;
  try {
    const source = await readSafeProjectFile(root, '.vibetether/project.yaml', 'VibeTether manifest');
    parseCanonicalManifest(source);
    manifest = parseManifest(source);
  } catch {
    throw new CliError('Cannot read VibeTether manifest because it is missing, linked, or structurally invalid. Run vibetether doctor for details.', 3);
  }
  if (!manifest.capability_board) {
    throw new CliError('Manifest does not declare capability_board. Run vibetether doctor, then init to upgrade the project.', 3);
  }
  let board;
  try {
    const source = await readSafeProjectFile(
      root,
      manifest.capability_board,
      'Capability board',
      { authorityRoute: true },
    );
    board = parseBoardSource(source);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('Cannot read capability board. Run vibetether doctor for details.', 3);
  }
  try {
    assertCapabilityBoard(board);
  } catch {
    throw new CliError('Unsupported capability board; expected schema_version 1 and advisory-router mode. Run vibetether doctor for details.', 3);
  }
  if (!includeExperience) return { root, manifest, board };
  try {
    const route = manifest.experience_index === undefined
      ? DEFAULT_EXPERIENCE_INDEX
      : manifest.experience_index;
    const source = await readSafeProjectFile(root, route, 'Experience index', { authorityRoute: true });
    const experience = parseExperienceIndex(source);
    return { root, manifest, board, experience };
  } catch {
    throw new CliError('Cannot read experience index because it is missing, unsafe, or structurally invalid. Run vibetether doctor for details.', 3);
  }
}

export async function loadCapabilityBoard(project) {
  return loadCapabilitySnapshot(project);
}

export async function loadCapabilityContext(project) {
  return loadCapabilitySnapshot(project, { includeExperience: true });
}

function humanDashboard(root, board) {
  const lines = [
    `VibeTether capability dashboard - ${board.profile} profile (advisory routing)`,
    `Project: ${root}`,
    '',
  ];
  if (board.readiness_gate) {
    lines.push('Automatic work-readiness gate:');
    lines.push(`  Run before: ${(board.readiness_gate.run_before ?? []).join(', ')}`);
    lines.push(`  Dimensions: ${(board.readiness_gate.dimensions ?? []).join(', ')}`);
    lines.push(`  Implementation requires: ${board.readiness_gate.implementation_requires}`);
    lines.push('  Discoverable facts are investigated automatically; unresolved direction is routed to one recommended user question at a time.');
    lines.push('');
  }
  for (const capability of board.capabilities ?? []) {
    const providers = capability.provider_options?.length ? capability.provider_options.join(', ') : 'vibe-tether built-in';
    lines.push(`${(capability.phases ?? []).join('/')} | ${capability.id} | ${providers}`);
    lines.push(`  When to use: ${(capability.invoke_when ?? []).join(', ') || 'Use the capability purpose and project signals.'}`);
    lines.push(`  Outputs: ${(capability.expected_outputs ?? []).join(', ') || 'See the project contract.'}`);
    lines.push(`  Exit evidence: ${(capability.exit_evidence ?? []).join(' ') || 'Record fresh evidence before moving phases.'}`);
    if (capability.catalog_alternatives?.length) {
      lines.push(`  Catalog-only alternatives: ${capability.catalog_alternatives.join(', ')}`);
    }
  }
  lines.push('');
  lines.push('Installed Skill inventory:');
  if (!(board.providers ?? []).length) lines.push('  None. All capabilities use the VibeTether built-in fallback.');
  for (const provider of board.providers ?? []) {
    lines.push(`  ${provider.skill} | ${provider.selection_status} | ${provider.invocation_policy} | ${provider.available_in.join(', ') || 'unavailable'}`);
    lines.push(`    Capabilities: ${provider.capabilities.join(', ')}`);
    lines.push(`    Routed by: ${provider.routed_by.length ? provider.routed_by.join(', ') : 'upstream command alias'}`);
    if (provider.auto_covered_by?.length) lines.push(`    Automatic behavior coverage: ${provider.auto_covered_by.join(' + ')}`);
    lines.push(`    Use when: ${provider.use_when.join(' ')}`);
  }
  lines.push('');
  lines.push(`High-risk confirmation gates: ${(board.high_risk_gates ?? []).join(', ')}`);
  lines.push('Recommendations are advisory. Use a better installed alternative when justified and record the material reason.');
  return `${lines.join('\n')}\n`;
}

function humanResolution(result) {
  const recommended = result.recommendation
    ? `${result.recommendation.skill} (${result.recommendation.available ? 'available' : 'unavailable'})`
    : 'no external provider; use VibeTether built-in control';
  const overlays = result.overlays?.length
    ? result.overlays.map((overlay) => `${overlay.skill} (${overlay.available ? 'available' : 'unavailable'})`).join(', ')
    : 'none';
  const alternatives = result.alternatives?.length
    ? result.alternatives.map((alternative) => `${alternative.skill} (${alternative.available ? 'available' : 'unavailable'})`).join(', ')
    : 'none';
  const lines = [
    `VibeTether advisory route: ${result.phase} / ${result.capability}`,
    `Detected signals: ${(result.detected_signals ?? result.signals ?? []).join(', ') || 'none'}`,
    `Recommended: ${recommended}`,
    `Policy/domain overlays: ${overlays}`,
    `Alternatives: ${alternatives}`,
    `Selected path: ${result.selection.skill} [${result.selection.source}]`,
    `Reason: ${result.rationale ?? result.selection.reason}`,
    `Fallback: ${result.fallback ?? 'vibe-tether'}`,
    `Required outputs: ${(result.required_outputs ?? result.expected_outputs).join(', ')}`,
    `Exit evidence: ${result.exit_evidence.join(' ')}`,
    `User confirmation required: ${result.confirmation_required ? `yes (${result.confirmation_gates.join(', ')})` : 'no route-level gate detected'}`,
    'Applicable experience:',
  ];
  if (!(result.applicable_experience ?? []).length) {
    lines.push('  none');
  } else {
    for (const entry of result.applicable_experience) {
      const label = entry.requires_revalidation
        ? `${entry.status} / requires_revalidation`
        : entry.status;
      lines.push(`  ${entry.id} | ${label}`);
      for (const artifact of entry.artifacts) lines.push(`    ${artifact}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function showCapabilities(options) {
  const queried = options.phase || options.capability;
  if (Boolean(options.phase) !== Boolean(options.capability)) {
    throw new CliError('--phase and --capability must be provided together.');
  }
  const loaded = queried
    ? await loadCapabilityContext(options.project)
    : await loadCapabilityBoard(options.project);
  const root = loaded.root;
  const board = await refreshBoardAvailability(loaded.board, root);
  const result = queried
    ? resolveBoardRoute(board, {
        phase: options.phase,
        capability: options.capability,
        signals: options.signals,
        harness: options.agent,
      })
    : board;
  if (queried) {
    result.applicable_experience = await matchExperience(loaded.experience, {
      root,
      signals: options.signals,
    });
  }
  if (options.json) return `${JSON.stringify(result, null, 2)}\n`;
  return queried ? humanResolution(result) : humanDashboard(root, board);
}
