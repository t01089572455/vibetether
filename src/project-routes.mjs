import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { CliError } from './errors.mjs';

export const PROJECT_ROUTES_PATH = '.vibetether/routes.local.yaml';
export const PROJECT_ROUTE_ROLES = new Set(['primary', 'alternative', 'overlay']);

const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const DOCUMENT_KEYS = new Set(['schema_version', 'routes']);
const ROUTE_KEYS = new Set([
  'id',
  'phases',
  'capability',
  'when_any',
  'skill',
  'role',
  'use_when',
  'expected_outputs',
  'exit_evidence',
]);
const REQUIRED_ROUTE_KEYS = ['id', 'phases', 'capability', 'skill', 'role', 'use_when'];
const HARNESS_SKILL_ROOTS = Object.freeze({
  codex: '.agents/skills',
  claude: '.claude/skills',
});

function isMapping(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new CliError(`${label} contains unknown field: ${unknown}`, 3);
}

function normalizeRequiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CliError(`${label} must be a non-empty string.`, 3);
  }
  return value.trim();
}

function normalizeStringArray(value, label, { required = false } = {}) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) throw new CliError(`${label} must be an array of non-empty strings.`, 3);
  const normalized = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new CliError(`${label} must contain only non-empty strings.`, 3);
    }
    const item = entry.trim();
    if (!normalized.includes(item)) normalized.push(item);
  }
  return normalized;
}

function capabilityIndex(board) {
  if (!isMapping(board) || !Array.isArray(board.capabilities)) {
    throw new CliError('Capability board must declare a capabilities array.', 3);
  }
  const capabilities = new Map();
  for (const capability of board.capabilities) {
    if (!isMapping(capability) || typeof capability.id !== 'string' || !Array.isArray(capability.phases)) {
      throw new CliError('Capability board contains an invalid capability contract.', 3);
    }
    capabilities.set(capability.id, capability);
  }
  return capabilities;
}

function validateSafeName(value, label) {
  if (!SAFE_NAME.test(value)) throw new CliError(`${label} must be a safe single directory name.`, 3);
}

function normalizeRoute(value, index, capabilities) {
  const label = `Project route ${index + 1}`;
  if (!isMapping(value)) throw new CliError(`${label} must be a mapping.`, 3);
  rejectUnknownKeys(value, ROUTE_KEYS, label);
  for (const key of REQUIRED_ROUTE_KEYS) {
    if (!Object.hasOwn(value, key)) throw new CliError(`${label} is missing required field: ${key}`, 3);
  }

  const id = normalizeRequiredString(value.id, `${label} id`);
  validateSafeName(id, `${label} route id`);
  const skill = normalizeRequiredString(value.skill, `${label} skill`);
  validateSafeName(skill, `${label} Skill name`);
  const capability = normalizeRequiredString(value.capability, `${label} capability`);
  const contract = capabilities.get(capability);
  if (!contract) throw new CliError(`${label} references unknown capability: ${capability}`, 3);

  const phases = normalizeStringArray(value.phases, `${label} phases`, { required: true });
  if (phases.length === 0) throw new CliError(`${label} phases must contain at least one non-empty string.`, 3);
  for (const phase of phases) {
    if (!contract.phases.includes(phase)) {
      throw new CliError(`${label} references unknown phase ${phase} for capability ${capability}.`, 3);
    }
  }

  const role = normalizeRequiredString(value.role, `${label} role`);
  if (!PROJECT_ROUTE_ROLES.has(role)) {
    throw new CliError(`${label} role must be primary, alternative, or overlay.`, 3);
  }
  const whenAny = normalizeStringArray(value.when_any, `${label} when_any`);
  if (role === 'primary' && whenAny.length === 0) {
    throw new CliError(`${label} primary requires at least one observable signal in when_any.`, 3);
  }
  const useWhen = normalizeStringArray(value.use_when, `${label} use_when`, { required: true });
  if (useWhen.length === 0) throw new CliError(`${label} use_when must contain at least one non-empty string.`, 3);

  return {
    id,
    phases,
    capability,
    when_any: whenAny,
    skill,
    role,
    use_when: useWhen,
    expected_outputs: normalizeStringArray(value.expected_outputs, `${label} expected_outputs`),
    exit_evidence: normalizeStringArray(value.exit_evidence, `${label} exit_evidence`),
  };
}

function validateUniqueRoutes(routes) {
  const ids = new Set();
  const primaryMatches = new Set();
  for (const route of routes) {
    if (ids.has(route.id)) throw new CliError(`Duplicate project route id: ${route.id}`, 3);
    ids.add(route.id);
    if (route.role !== 'primary') continue;
    const signals = [...route.when_any].sort().join('\u0000');
    for (const phase of route.phases) {
      const key = `${phase}\u0000${route.capability}\u0000${signals}`;
      if (primaryMatches.has(key)) {
        throw new CliError(
          `Project routes contain equally matching primary routes for ${phase} / ${route.capability}.`,
          3,
        );
      }
      primaryMatches.add(key);
    }
  }
}

export function parseProjectRoutes(source) {
  let value;
  try {
    value = YAML.parse(source);
  } catch {
    throw new CliError('Cannot parse project routes as a YAML mapping.', 3);
  }
  if (!isMapping(value)) throw new CliError('Project routes must be a YAML mapping.', 3);
  return value;
}

export function validateProjectRoutes(document, board) {
  if (!isMapping(document) || document.schema_version !== 1 || !Array.isArray(document.routes)) {
    throw new CliError('Project routes require schema_version 1 and a routes array.', 3);
  }
  rejectUnknownKeys(document, DOCUMENT_KEYS, 'Project routes document');
  const capabilities = capabilityIndex(board);
  const routes = document.routes.map((route, index) => normalizeRoute(route, index, capabilities));
  validateUniqueRoutes(routes);
  return { schema_version: 1, routes };
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
  validateSafeName(skill, 'Project Skill name');
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

function union(left = [], right = []) {
  return [...new Set([...left, ...right])];
}

function baseRouteFor(board, phase, capability) {
  return (board.routes ?? [])
    .filter((route) => route.phase === phase && route.capability === capability)
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))[0] ?? null;
}

function localBoardRoute(board, route, phase, installations) {
  const capability = board.capabilities.find((entry) => entry.id === route.capability);
  const baseRoute = baseRouteFor(board, phase, route.capability);
  const primary = route.role === 'primary';
  const overlay = route.role === 'overlay';
  const priority = primary ? 1_000_000 : overlay ? 900_000 : -1;
  return {
    id: `project-local:${route.id}:${phase}`,
    project_route_id: route.id,
    project_role: route.role,
    source: 'project-local',
    phase,
    capability: route.capability,
    priority,
    signals: { all: [], any: route.when_any },
    recommendation: {
      skill: route.skill,
      available_in: Object.keys(installations),
      installations,
      reason: route.use_when.join(' '),
    },
    fallback: baseRoute?.fallback ?? capability.fallback,
    selection: overlay ? 'recommend-overlay' : 'recommend',
    workflow_role: overlay ? 'policy' : route.role,
    expected_outputs: union(capability.expected_outputs, route.expected_outputs),
    exit_evidence: union(capability.exit_evidence, route.exit_evidence),
  };
}

export async function mergeProjectRoutes({ root, board, document, harnesses }) {
  const validated = validateProjectRoutes(document, board);
  const effective = structuredClone(board);
  const localRoutes = [];
  for (const route of validated.routes) {
    const installations = await discoverProjectSkill(root, route.skill, harnesses);
    const routeRecord = { ...route, installations, available_in: Object.keys(installations) };
    localRoutes.push(routeRecord);
    for (const phase of route.phases) {
      effective.routes.push(localBoardRoute(effective, route, phase, installations));
    }
  }
  effective.project_routes = localRoutes;
  return effective;
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
