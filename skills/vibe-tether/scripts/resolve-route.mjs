#!/usr/bin/env node

import { access, lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  experienceIndexRouteFromManifest,
  matchExperience,
  parseExperienceIndex,
} from './experience-index.mjs';

function fail(message, code = 2) {
  console.error(`ERROR ${message}`);
  process.exitCode = code;
}

function valueAfter(args, index, flag) {
  if (index + 1 >= args.length || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return args[index + 1];
}

function parseArgs(args) {
  const options = { project: process.cwd(), phase: null, capability: null, signals: [], agent: null };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--project') options.project = valueAfter(args, index++, flag);
    else if (flag === '--phase') options.phase = valueAfter(args, index++, flag);
    else if (flag === '--capability') options.capability = valueAfter(args, index++, flag);
    else if (flag === '--signal') options.signals.push(valueAfter(args, index++, flag));
    else if (flag === '--agent') options.agent = valueAfter(args, index++, flag);
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.phase || !options.capability) throw new Error('--phase and --capability are required');
  if (options.agent && !['codex', 'claude'].includes(options.agent)) throw new Error('--agent must be codex or claude');
  return options;
}

function matches(route, signals) {
  if ((route.signals?.all ?? []).some((signal) => !signals.has(signal))) return false;
  const any = route.signals?.any ?? [];
  return any.length === 0 || any.some((signal) => signals.has(signal));
}

function available(route, harness) {
  const harnesses = route.recommendation?.available_in ?? [];
  return harness ? harnesses.includes(harness) : harnesses.length > 0;
}

async function readSafeProjectFile(root, relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error(`${label} path must be a non-empty project-relative string`);
  }
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} path escapes the project: ${relativePath}`);
  }
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) throw new Error(`${label} path contains a symbolic link: ${relativePath}`);
    if (current === target && !metadata.isFile()) throw new Error(`${label} must be a regular file: ${relativePath}`);
  }
  return readFile(target, 'utf8');
}

async function refreshAvailability(board, root) {
  for (const route of board.routes ?? []) {
    const current = [];
    for (const [harness, relativePath] of Object.entries(route.recommendation?.installations ?? {})) {
      const target = path.resolve(root, relativePath);
      const relative = path.relative(root, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Provider installation escapes the project: ${relativePath}`);
      }
      try {
        await access(target);
        current.push(harness);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (route.recommendation?.installations) route.recommendation.available_in = current;
  }
}

function resolve(board, request) {
  const phase = request.phase.toUpperCase();
  const signals = new Set(request.signals);
  const capability = (board.capabilities ?? []).find((entry) => entry.id === request.capability);
  if (!capability) throw new Error(`Unknown capability: ${request.capability}`);
  const routes = (board.routes ?? [])
    .filter((route) => String(route.phase).toUpperCase() === phase && route.capability === request.capability)
    .filter((route) => matches(route, signals))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  const preferred = routes[0] ?? null;
  const usable = routes.find((route) => available(route, request.agent)) ?? null;
  const confirmationGates = (board.high_risk_gates ?? []).filter((gate) => signals.has(gate));
  if (!preferred) {
    return {
      advisory: true,
      phase,
      capability: request.capability,
      signals: [...signals],
      recommendation: null,
      selection: { skill: 'vibe-tether', source: 'built-in-fallback', reason: capability.fallback },
      should_invoke_provider: false,
      expected_outputs: capability.expected_outputs ?? [],
      exit_evidence: capability.exit_evidence ?? [],
      confirmation_required: confirmationGates.length > 0,
      confirmation_gates: confirmationGates,
    };
  }
  const source = usable
    ? usable.id === preferred.id ? 'recommended' : 'available-alternative'
    : 'declared-fallback';
  return {
    advisory: true,
    phase,
    capability: request.capability,
    signals: [...signals],
    recommendation: {
      skill: preferred.recommendation.skill,
      available: available(preferred, request.agent),
      available_in: preferred.recommendation.available_in ?? [],
      reason: preferred.recommendation.reason,
    },
    selection: {
      skill: usable?.recommendation?.skill ?? preferred.fallback ?? 'vibe-tether',
      source,
      reason: source === 'recommended'
        ? 'The preferred matching Skill is available.'
        : source === 'available-alternative'
          ? 'The preferred Skill is unavailable; use the next matching installed route.'
          : 'No matching provider is available; use the declared fallback and record why.',
    },
    should_invoke_provider: Boolean(usable),
    alternatives: routes.slice(1).map((route) => ({
      skill: route.recommendation.skill,
      available: available(route, request.agent),
      reason: route.recommendation.reason,
    })),
    expected_outputs: preferred.expected_outputs ?? capability.expected_outputs ?? [],
    exit_evidence: preferred.exit_evidence ?? capability.exit_evidence ?? [],
    confirmation_required: confirmationGates.length > 0,
    confirmation_gates: confirmationGates,
  };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const root = await realpath(path.resolve(options.project));
  const boardPath = path.join(root, '.vibetether', 'capabilities.yaml');
  let board;
  try {
    board = JSON.parse(await readFile(boardPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read the zero-dependency capability board at ${boardPath}: ${error.message}. Run VibeTether init to upgrade it.`);
  }
  await refreshAvailability(board, root);
  let experience;
  try {
    const manifestSource = await readSafeProjectFile(root, '.vibetether/project.yaml', 'VibeTether manifest');
    const experiencePath = experienceIndexRouteFromManifest(manifestSource);
    const experienceSource = await readSafeProjectFile(root, experiencePath, 'Experience index');
    experience = parseExperienceIndex(experienceSource);
  } catch (error) {
    throw new Error('Cannot read experience index because it is missing, unsafe, or structurally invalid. Run vibetether doctor for details.');
  }
  const resolution = resolve(board, options);
  const applicableExperience = await matchExperience(experience, {
    root,
    signals: options.signals,
  });
  console.log(JSON.stringify({ ...resolution, applicable_experience: applicableExperience }, null, 2));
} catch (error) {
  fail(error.message);
}
