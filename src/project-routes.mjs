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
