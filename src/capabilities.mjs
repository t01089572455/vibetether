import { access, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { CliError } from './errors.mjs';

function inside(root, relativePath, label) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new CliError(`${label} path escapes the project: ${relativePath}`, 3);
  }
  return target;
}

async function parseYaml(target, label) {
  try {
    const value = YAML.parse(await readFile(target, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('document must be a mapping');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') throw new CliError(`Missing ${label}: ${target}`, 3);
    if (error instanceof CliError) throw error;
    throw new CliError(`Cannot read ${label}: ${error.message}`, 3);
  }
}

function routeMatches(route, signals) {
  if ((route.signals?.all ?? []).some((signal) => !signals.has(signal))) return false;
  const any = route.signals?.any ?? [];
  return any.length === 0 || any.some((signal) => signals.has(signal));
}

function routeAvailable(route, harness) {
  const available = route.recommendation?.available_in ?? [];
  return harness ? available.includes(harness) : available.length > 0;
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
  const phase = String(request.phase ?? '').toUpperCase();
  const signals = new Set(request.signals ?? []);
  const capability = (board.capabilities ?? []).find((entry) => entry.id === request.capability);
  if (!capability) throw new CliError(`Unknown capability: ${request.capability}`);

  const matches = (board.routes ?? [])
    .filter((route) => String(route.phase).toUpperCase() === phase && route.capability === request.capability)
    .filter((route) => routeMatches(route, signals))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  const preferred = matches[0] ?? null;
  const available = matches.find((route) => routeAvailable(route, request.harness)) ?? null;
  const confirmationGates = (board.high_risk_gates ?? []).filter((gate) => signals.has(gate));

  if (!preferred) {
    return {
      advisory: true,
      phase,
      capability: request.capability,
      signals: [...signals],
      recommendation: null,
      selection: {
        skill: 'vibe-tether',
        source: 'built-in-fallback',
        reason: capability.fallback,
      },
      should_invoke_provider: false,
      expected_outputs: capability.expected_outputs ?? [],
      exit_evidence: capability.exit_evidence ?? [],
      confirmation_required: confirmationGates.length > 0,
      confirmation_gates: confirmationGates,
    };
  }

  const preferredAvailable = routeAvailable(preferred, request.harness);
  const selectedSkill = available?.recommendation?.skill ?? preferred.fallback ?? 'vibe-tether';
  const selectionSource = available
    ? available.id === preferred.id ? 'recommended' : 'available-alternative'
    : 'declared-fallback';
  return {
    advisory: true,
    phase,
    capability: request.capability,
    signals: [...signals],
    recommendation: {
      skill: preferred.recommendation.skill,
      available: preferredAvailable,
      available_in: preferred.recommendation.available_in ?? [],
      reason: preferred.recommendation.reason,
    },
    selection: {
      skill: selectedSkill,
      source: selectionSource,
      reason: selectionSource === 'available-alternative'
        ? `The preferred Skill is unavailable in ${request.harness ?? 'enabled harnesses'}; use the next matching installed route.`
        : selectionSource === 'declared-fallback'
          ? `No matching provider is available; use the declared fallback and record why.`
          : 'The preferred matching Skill is available.',
    },
    should_invoke_provider: Boolean(available),
    alternatives: matches.slice(1).map((route) => ({
      skill: route.recommendation.skill,
      available: routeAvailable(route, request.harness),
      reason: route.recommendation.reason,
    })),
    expected_outputs: preferred.expected_outputs ?? capability.expected_outputs ?? [],
    exit_evidence: preferred.exit_evidence ?? capability.exit_evidence ?? [],
    confirmation_required: confirmationGates.length > 0,
    confirmation_gates: confirmationGates,
  };
}

export async function loadCapabilityBoard(project) {
  let root;
  try {
    root = await realpath(path.resolve(project));
  } catch {
    throw new CliError(`Project directory does not exist: ${project}`);
  }
  const manifest = await parseYaml(path.join(root, '.vibetether', 'project.yaml'), 'VibeTether manifest');
  if (!manifest.capability_board) throw new CliError('Manifest does not declare capability_board. Run VibeTether init to upgrade the project.', 3);
  const board = await parseYaml(inside(root, manifest.capability_board, 'Capability board'), 'capability board');
  if (board.schema_version !== 1 || board.mode !== 'advisory-router') {
    throw new CliError('Unsupported capability board; expected schema_version 1 and advisory-router mode.', 3);
  }
  return { root, board };
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
  return [
    `VibeTether advisory route: ${result.phase} / ${result.capability}`,
    `Recommended: ${recommended}`,
    `Selected path: ${result.selection.skill} [${result.selection.source}]`,
    `Reason: ${result.selection.reason}`,
    `Expected outputs: ${result.expected_outputs.join(', ')}`,
    `Exit evidence: ${result.exit_evidence.join(' ')}`,
    `User confirmation required: ${result.confirmation_required ? `yes (${result.confirmation_gates.join(', ')})` : 'no route-level gate detected'}`,
  ].join('\n') + '\n';
}

export async function showCapabilities(options) {
  const loaded = await loadCapabilityBoard(options.project);
  const root = loaded.root;
  const board = await refreshBoardAvailability(loaded.board, root);
  const queried = options.phase || options.capability;
  if (Boolean(options.phase) !== Boolean(options.capability)) {
    throw new CliError('--phase and --capability must be provided together.');
  }
  const result = queried
    ? resolveBoardRoute(board, {
        phase: options.phase,
        capability: options.capability,
        signals: options.signals,
        harness: options.agent,
      })
    : board;
  if (options.json) return `${JSON.stringify(result, null, 2)}\n`;
  return queried ? humanResolution(result) : humanDashboard(root, board);
}
