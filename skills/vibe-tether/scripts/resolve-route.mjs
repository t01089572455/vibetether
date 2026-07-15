#!/usr/bin/env node

import { access, lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isSafeProjectRelativeArtifactPath, isSensitiveArtifactPath } from './artifact-safety.mjs';
import {
  assertCapabilityBoard,
  mergeProjectRouteDocument,
  resolveCapabilityRoute,
  validateProjectRouteDocument,
} from './capability-routing.mjs';
import {
  matchExperience,
  parseExperienceIndex,
} from './experience-index.mjs';
import { authorityRoutesFromManifest, parseCanonicalYaml } from './manifest.mjs';

const PROJECT_ROUTES_PATH = '.vibetether/routes.local.yaml';
const HARNESS_SKILL_ROOTS = Object.freeze({
  codex: '.agents/skills',
  claude: '.claude/skills',
});

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

async function readSafeProjectFile(root, relativePath, label, { authorityRoute = false } = {}) {
  if (typeof relativePath !== 'string'
      || relativePath.length === 0
      || !isSafeProjectRelativeArtifactPath(relativePath)
      || (authorityRoute && isSensitiveArtifactPath(relativePath))) {
    throw new Error(`${label} path is unsafe`);
  }
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} path is unsafe`);
  }
  if (!relative) throw new Error(`${label} must be a regular file`);
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) throw new Error(`${label} path contains a symbolic link`);
    if (current === target && !metadata.isFile()) throw new Error(`${label} must be a regular file`);
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
        throw new Error('Provider installation path is unsafe. Run vibetether doctor for details.');
      }
      try {
        await access(target);
        current.push(harness);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw new Error('Provider installation path cannot be inspected. Run vibetether doctor for details.');
        }
      }
    }
    if (route.recommendation?.installations) route.recommendation.available_in = current;
  }
}

async function optionalProjectFile(root, relativePath, label, { required = false } = {}) {
  const target = path.resolve(root, relativePath);
  try {
    await access(target);
  } catch (error) {
    if (error.code === 'ENOENT' && !required) return null;
    if (error.code === 'ENOENT') throw new Error(`${label} is missing`);
    throw error;
  }
  return readSafeProjectFile(root, relativePath, label, { authorityRoute: true });
}

function enabledHarnesses(manifest) {
  return Object.entries(manifest?.harnesses ?? {})
    .filter(([name, value]) => Object.hasOwn(HARNESS_SKILL_ROOTS, name) && value?.enabled)
    .map(([name]) => name);
}

async function projectSkillInstallations(root, document, manifest) {
  const installations = {};
  for (const route of document.routes) {
    if (Object.hasOwn(installations, route.skill)) continue;
    installations[route.skill] = {};
    for (const harness of enabledHarnesses(manifest)) {
      const relativePath = `${HARNESS_SKILL_ROOTS[harness]}/${route.skill}`;
      const entryPath = `${relativePath}/SKILL.md`;
      try {
        await readSafeProjectFile(root, entryPath, `Project Skill ${route.skill} entry`);
        installations[route.skill][harness] = relativePath;
      } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes(error.code)) continue;
        throw error;
      }
    }
  }
  return installations;
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  fail(error.message, 2);
}

if (options) {
  try {
    const root = await realpath(path.resolve(options.project));
    let boardPath;
    let experiencePath;
    let manifest;
    let declaredProjectRoutes;
    try {
      const manifestSource = await readSafeProjectFile(root, '.vibetether/project.yaml', 'VibeTether manifest');
      const routes = authorityRoutesFromManifest(manifestSource);
      boardPath = routes.capabilityBoard;
      experiencePath = routes.experienceIndex;
      manifest = routes.manifest;
      declaredProjectRoutes = routes.projectRoutes;
    } catch {
      throw new Error('Cannot read VibeTether manifest because it is missing, linked, or structurally invalid. Run vibetether doctor for details.');
    }
    let board;
    try {
      board = JSON.parse(await readSafeProjectFile(
        root,
        boardPath,
        'Capability board',
        { authorityRoute: true },
      ));
      assertCapabilityBoard(board);
    } catch {
      throw new Error('Cannot read the zero-dependency capability board. Run vibetether doctor for details.');
    }
    try {
      if (declaredProjectRoutes !== undefined && declaredProjectRoutes !== PROJECT_ROUTES_PATH) {
        throw new Error(`Manifest project_routes must use ${PROJECT_ROUTES_PATH}`);
      }
      const source = await optionalProjectFile(
        root,
        PROJECT_ROUTES_PATH,
        'Project routes',
        { required: declaredProjectRoutes !== undefined },
      );
      if (source !== null) {
        const document = validateProjectRouteDocument(
          parseCanonicalYaml(source, { allowFlowSequences: true }),
          board,
        );
        board = mergeProjectRouteDocument(
          board,
          document,
          await projectSkillInstallations(root, document, manifest),
        );
      }
    } catch {
      throw new Error('Cannot read project routes because they are missing, linked, or structurally invalid. Run vibetether doctor for details.');
    }
    await refreshAvailability(board, root);
    let experience;
    try {
      const experienceSource = await readSafeProjectFile(
        root,
        experiencePath,
        'Experience index',
        { authorityRoute: true },
      );
      experience = parseExperienceIndex(experienceSource);
    } catch {
      throw new Error('Cannot read experience index because it is missing, unsafe, or structurally invalid. Run vibetether doctor for details.');
    }
    const resolution = resolveCapabilityRoute(board, {
      phase: options.phase,
      capability: options.capability,
      signals: options.signals,
      harness: options.agent,
    });
    const applicableExperience = await matchExperience(experience, {
      root,
      signals: options.signals,
    });
    console.log(JSON.stringify({ ...resolution, applicable_experience: applicableExperience }, null, 2));
  } catch (error) {
    fail(error.message, error.exitCode ?? 3);
  }
}
