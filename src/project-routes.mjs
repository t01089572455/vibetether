import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import {
  mergeProjectRouteDocument,
  validateProjectRouteDocument,
} from '../skills/vibe-tether/scripts/capability-routing.mjs';
import { CliError } from './errors.mjs';

export const PROJECT_ROUTES_PATH = '.vibetether/routes.local.yaml';
export const PROJECT_ROUTE_ROLES = new Set(['primary', 'alternative', 'overlay']);

const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const HARNESS_SKILL_ROOTS = Object.freeze({
  codex: '.agents/skills',
  claude: '.claude/skills',
});

function asCliError(error) {
  if (error instanceof CliError) return error;
  return new CliError(error.message, error.exitCode ?? 3);
}

export function parseProjectRoutes(source) {
  let value;
  try {
    value = YAML.parse(source);
  } catch {
    throw new CliError('Cannot parse project routes as a YAML mapping.', 3);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CliError('Project routes must be a YAML mapping.', 3);
  }
  return value;
}

export function validateProjectRoutes(document, board) {
  try {
    return validateProjectRouteDocument(document, board);
  } catch (error) {
    throw asCliError(error);
  }
}

function resolveProjectPath(root, relativePath, label) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new CliError(`${label} path must stay inside the project.`, 3);
  }
  return { target, relative };
}

async function inspectRegularProjectEntry(root, relativePath, expectedType, label) {
  const { target, relative } = resolveProjectPath(root, relativePath, label);
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new CliError(`${label} cannot be inspected safely.`, 3);
    }
    if (metadata.isSymbolicLink()) throw new CliError(`${label} path is linked or symbolic.`, 3);
    if (current !== target && !metadata.isDirectory()) {
      throw new CliError(`${label} has a non-directory ancestor.`, 3);
    }
    if (current === target) {
      const valid = expectedType === 'directory' ? metadata.isDirectory() : metadata.isFile();
      if (!valid) throw new CliError(`${label} must be a regular ${expectedType}.`, 3);
    }
  }
  return target;
}

function enabledHarnesses(manifest) {
  return Object.entries(manifest?.harnesses ?? {})
    .filter(([name, value]) => Object.hasOwn(HARNESS_SKILL_ROOTS, name) && value?.enabled)
    .map(([name]) => name);
}

export async function discoverProjectSkill(root, skill, harnesses) {
  if (!SAFE_NAME.test(skill)) throw new CliError('Project Skill name must be a safe single directory name.', 3);
  const installations = {};
  for (const harness of harnesses) {
    const skillRoot = HARNESS_SKILL_ROOTS[harness];
    if (!skillRoot) continue;
    const relativePath = `${skillRoot}/${skill}`;
    const directory = await inspectRegularProjectEntry(
      root,
      relativePath,
      'directory',
      `Project Skill ${skill}`,
    );
    if (!directory) continue;
    const entry = await inspectRegularProjectEntry(
      root,
      `${relativePath}/SKILL.md`,
      'file',
      `Project Skill ${skill} entry`,
    );
    if (entry) installations[harness] = relativePath;
  }
  return installations;
}

export async function listInstalledProjectSkills(root, harnesses) {
  const candidates = new Set();
  for (const harness of harnesses) {
    const skillRoot = HARNESS_SKILL_ROOTS[harness];
    if (!skillRoot) continue;
    let entries;
    try {
      entries = await readdir(path.resolve(root, skillRoot), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new CliError(`Project Skill root for ${harness} cannot be inspected safely.`, 3);
    }
    for (const entry of entries) {
      if (entry.isDirectory() && SAFE_NAME.test(entry.name)) candidates.add(entry.name);
    }
  }
  const installed = [];
  for (const skill of [...candidates].sort()) {
    const installations = await discoverProjectSkill(root, skill, harnesses);
    if (Object.keys(installations).length > 0) installed.push({ skill, installations });
  }
  return installed;
}

export async function mergeProjectRoutes({ root, board, document, harnesses }) {
  const validated = validateProjectRoutes(document, board);
  const installations = {};
  for (const route of validated.routes) {
    if (!Object.hasOwn(installations, route.skill)) {
      installations[route.skill] = await discoverProjectSkill(root, route.skill, harnesses);
    }
  }
  try {
    return mergeProjectRouteDocument(board, validated, installations);
  } catch (error) {
    throw asCliError(error);
  }
}

export async function loadEffectiveProjectRoutes(root, manifest, board) {
  const declared = Object.hasOwn(manifest, 'project_routes');
  if (declared && manifest.project_routes !== PROJECT_ROUTES_PATH) {
    throw new CliError(`Manifest project_routes must use ${PROJECT_ROUTES_PATH}.`, 3);
  }
  const target = await inspectRegularProjectEntry(
    root,
    PROJECT_ROUTES_PATH,
    'file',
    'Project routes',
  );
  if (!target) {
    if (declared) throw new CliError(`Manifest declares missing project routes at ${PROJECT_ROUTES_PATH}.`, 3);
    return { board, overlay: { path: PROJECT_ROUTES_PATH, present: false } };
  }
  const document = parseProjectRoutes(await readFile(target, 'utf8'));
  return {
    board: await mergeProjectRoutes({ root, board, document, harnesses: enabledHarnesses(manifest) }),
    overlay: { path: PROJECT_ROUTES_PATH, present: true },
  };
}
