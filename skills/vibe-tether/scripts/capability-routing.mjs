function routeMatches(route, signals) {
  if ((route.signals?.all ?? []).some((signal) => !signals.has(signal))) return false;
  const any = route.signals?.any ?? [];
  return any.length === 0 || any.some((signal) => signals.has(signal));
}

function routeAvailable(route, harness) {
  const available = route.recommendation?.available_in ?? [];
  return harness ? available.includes(harness) : available.length > 0;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`Capability board ${label} must be an array`);
}

function assertOptionalStringArray(value, label) {
  if (value === undefined) return;
  assertArray(value, label);
  if (value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Capability board ${label} must contain strings`);
  }
}

function assertOptionalRecord(value, label) {
  if (value !== undefined && !isRecord(value)) {
    throw new Error(`Capability board ${label} must be a mapping`);
  }
}

function assertInstallations(value, label) {
  assertOptionalRecord(value, label);
  if (value !== undefined && Object.values(value).some((entry) => typeof entry !== 'string')) {
    throw new Error(`Capability board ${label} must map harnesses to paths`);
  }
}

function assertCapability(capability) {
  if (!isRecord(capability) || typeof capability.id !== 'string' || capability.id.length === 0) {
    throw new Error('Capability board capabilities must contain identified mappings');
  }
  for (const field of [
    'phases',
    'invoke_when',
    'required_inputs',
    'expected_outputs',
    'exit_evidence',
    'provider_options',
    'catalog_alternatives',
  ]) {
    assertOptionalStringArray(capability[field], `capabilities[].${field}`);
  }
}

function assertProvider(provider) {
  if (!isRecord(provider) || typeof provider.skill !== 'string' || provider.skill.length === 0) {
    throw new Error('Capability board providers must contain identified mappings');
  }
  for (const field of ['capabilities', 'available_in', 'routed_by', 'use_when', 'auto_covered_by']) {
    assertOptionalStringArray(provider[field], `providers[].${field}`);
  }
  assertInstallations(provider.installations, 'providers[].installations');
}

function assertRoute(route) {
  if (!isRecord(route)
      || typeof route.id !== 'string' || route.id.length === 0
      || typeof route.phase !== 'string' || route.phase.length === 0
      || typeof route.capability !== 'string' || route.capability.length === 0) {
    throw new Error('Capability board routes must contain identified phase and capability mappings');
  }
  assertOptionalRecord(route.signals, 'routes[].signals');
  for (const field of ['all', 'any']) {
    assertOptionalStringArray(route.signals?.[field], `routes[].signals.${field}`);
  }
  if (!isRecord(route.recommendation)
      || typeof route.recommendation.skill !== 'string' || route.recommendation.skill.length === 0) {
    throw new Error('Capability board routes require a recommendation mapping');
  }
  assertOptionalStringArray(route.recommendation.available_in, 'routes[].recommendation.available_in');
  assertInstallations(route.recommendation.installations, 'routes[].recommendation.installations');
  assertOptionalStringArray(route.expected_outputs, 'routes[].expected_outputs');
  assertOptionalStringArray(route.exit_evidence, 'routes[].exit_evidence');
}

export function assertCapabilityBoard(board) {
  if (board === null || typeof board !== 'object' || Array.isArray(board)) {
    throw new Error('Capability board must be a mapping');
  }
  if (board.schema_version !== 1 || board.mode !== 'advisory-router') {
    throw new Error('Capability board requires schema_version 1 and advisory-router mode');
  }
  assertArray(board.capabilities, 'capabilities');
  assertArray(board.providers, 'providers');
  assertArray(board.routes, 'routes');
  assertOptionalStringArray(board.high_risk_gates, 'high_risk_gates');
  board.capabilities.forEach(assertCapability);
  board.providers.forEach(assertProvider);
  board.routes.forEach(assertRoute);
  return board;
}

const PROJECT_ROUTE_ROLES = new Set(['primary', 'alternative', 'overlay']);
const PROJECT_ROUTE_SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const PROJECT_ROUTE_DOCUMENT_KEYS = new Set(['schema_version', 'routes']);
const PROJECT_ROUTE_KEYS = new Set([
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
const PROJECT_ROUTE_REQUIRED_KEYS = ['id', 'phases', 'capability', 'skill', 'role', 'use_when'];

function projectRouteError(message) {
  const error = new Error(message);
  error.exitCode = 3;
  return error;
}

function rejectProjectRouteUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw projectRouteError(`${label} contains unknown field: ${unknown}`);
}

function projectRouteString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw projectRouteError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function projectRouteStringArray(value, label, { required = false } = {}) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) throw projectRouteError(`${label} must be an array of non-empty strings.`);
  const normalized = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw projectRouteError(`${label} must contain only non-empty strings.`);
    }
    const item = entry.trim();
    if (!normalized.includes(item)) normalized.push(item);
  }
  return normalized;
}

function projectRouteCapabilityIndex(board) {
  if (!isRecord(board) || !Array.isArray(board.capabilities)) {
    throw projectRouteError('Capability board must declare a capabilities array.');
  }
  const capabilities = new Map();
  for (const capability of board.capabilities) {
    if (!isRecord(capability) || typeof capability.id !== 'string' || !Array.isArray(capability.phases)) {
      throw projectRouteError('Capability board contains an invalid capability contract.');
    }
    capabilities.set(capability.id, capability);
  }
  return capabilities;
}

function projectRouteSafeName(value, label) {
  if (!PROJECT_ROUTE_SAFE_NAME.test(value)) {
    throw projectRouteError(`${label} must be a safe single directory name.`);
  }
}

function normalizeProjectRoute(value, index, capabilities) {
  const label = `Project route ${index + 1}`;
  if (!isRecord(value)) throw projectRouteError(`${label} must be a mapping.`);
  rejectProjectRouteUnknownKeys(value, PROJECT_ROUTE_KEYS, label);
  for (const key of PROJECT_ROUTE_REQUIRED_KEYS) {
    if (!Object.hasOwn(value, key)) throw projectRouteError(`${label} is missing required field: ${key}`);
  }

  const id = projectRouteString(value.id, `${label} id`);
  projectRouteSafeName(id, `${label} route id`);
  const skill = projectRouteString(value.skill, `${label} skill`);
  projectRouteSafeName(skill, `${label} Skill name`);
  const capability = projectRouteString(value.capability, `${label} capability`);
  const contract = capabilities.get(capability);
  if (!contract) throw projectRouteError(`${label} references unknown capability: ${capability}`);

  const phases = projectRouteStringArray(value.phases, `${label} phases`, { required: true });
  if (phases.length === 0) throw projectRouteError(`${label} phases must contain at least one non-empty string.`);
  for (const phase of phases) {
    if (!contract.phases.includes(phase)) {
      throw projectRouteError(`${label} references unknown phase ${phase} for capability ${capability}.`);
    }
  }

  const role = projectRouteString(value.role, `${label} role`);
  if (!PROJECT_ROUTE_ROLES.has(role)) {
    throw projectRouteError(`${label} role must be primary, alternative, or overlay.`);
  }
  const whenAny = projectRouteStringArray(value.when_any, `${label} when_any`);
  if (role === 'primary' && whenAny.length === 0) {
    throw projectRouteError(`${label} primary requires at least one observable signal in when_any.`);
  }
  const useWhen = projectRouteStringArray(value.use_when, `${label} use_when`, { required: true });
  if (useWhen.length === 0) throw projectRouteError(`${label} use_when must contain at least one non-empty string.`);

  return {
    id,
    phases,
    capability,
    when_any: whenAny,
    skill,
    role,
    use_when: useWhen,
    expected_outputs: projectRouteStringArray(value.expected_outputs, `${label} expected_outputs`),
    exit_evidence: projectRouteStringArray(value.exit_evidence, `${label} exit_evidence`),
  };
}

function assertUniqueProjectRoutes(routes) {
  const ids = new Set();
  const primaryMatches = new Set();
  for (const route of routes) {
    if (ids.has(route.id)) throw projectRouteError(`Duplicate project route id: ${route.id}`);
    ids.add(route.id);
    if (route.role !== 'primary') continue;
    const signals = [...route.when_any].sort().join('\u0000');
    for (const phase of route.phases) {
      const key = `${phase}\u0000${route.capability}\u0000${signals}`;
      if (primaryMatches.has(key)) {
        throw projectRouteError(
          `Project routes contain equally matching primary routes for ${phase} / ${route.capability}.`,
        );
      }
      primaryMatches.add(key);
    }
  }
}

export function validateProjectRouteDocument(document, board) {
  if (!isRecord(document) || document.schema_version !== 1 || !Array.isArray(document.routes)) {
    throw projectRouteError('Project routes require schema_version 1 and a routes array.');
  }
  rejectProjectRouteUnknownKeys(document, PROJECT_ROUTE_DOCUMENT_KEYS, 'Project routes document');
  const capabilities = projectRouteCapabilityIndex(board);
  const routes = document.routes.map((route, index) => normalizeProjectRoute(route, index, capabilities));
  assertUniqueProjectRoutes(routes);
  return { schema_version: 1, routes };
}

function unionProjectRouteValues(left = [], right = []) {
  return [...new Set([...left, ...right])];
}

function baseProjectRoute(board, phase, capability) {
  return (board.routes ?? [])
    .filter((route) => route.phase === phase && route.capability === capability)
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))[0] ?? null;
}

function effectiveProjectRoute(board, route, phase, installations) {
  const capability = board.capabilities.find((entry) => entry.id === route.capability);
  const baseRoute = baseProjectRoute(board, phase, route.capability);
  const primary = route.role === 'primary';
  const overlay = route.role === 'overlay';
  return {
    id: `project-local:${route.id}:${phase}`,
    project_route_id: route.id,
    project_role: route.role,
    source: 'project-local',
    phase,
    capability: route.capability,
    priority: primary ? 1_000_000 : overlay ? 900_000 : -1,
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
    expected_outputs: unionProjectRouteValues(capability.expected_outputs, route.expected_outputs),
    exit_evidence: unionProjectRouteValues(capability.exit_evidence, route.exit_evidence),
  };
}

export function mergeProjectRouteDocument(board, document, installationsBySkill = {}) {
  const validated = validateProjectRouteDocument(document, board);
  const effective = structuredClone(board);
  const localRoutes = [];
  for (const route of validated.routes) {
    const installations = structuredClone(installationsBySkill[route.skill] ?? {});
    localRoutes.push({ ...route, installations, available_in: Object.keys(installations) });
    for (const phase of route.phases) {
      effective.routes.push(effectiveProjectRoute(effective, route, phase, installations));
    }
  }
  effective.project_routes = localRoutes;
  return effective;
}

export function resolveCapabilityRoute(board, request) {
  assertCapabilityBoard(board);
  const phase = String(request.phase ?? '').toUpperCase();
  const signals = new Set(request.signals ?? []);
  const capability = (board.capabilities ?? []).find((entry) => entry.id === request.capability);
  if (!capability) {
    const error = new Error(`Unknown capability: ${request.capability}`);
    error.exitCode = 2;
    throw error;
  }

  const matches = (board.routes ?? [])
    .filter((route) => String(route.phase).toUpperCase() === phase && route.capability === request.capability)
    .filter((route) => routeMatches(route, signals))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  const overlayMatches = matches.filter(
    (route) => route.workflow_role === 'policy' || route.selection === 'recommend-overlay',
  );
  const primaryMatches = matches.filter((route) => !overlayMatches.includes(route));
  const preferred = primaryMatches[0] ?? null;
  const available = primaryMatches.find((route) => routeAvailable(route, request.harness)) ?? null;
  const confirmationGates = (board.high_risk_gates ?? []).filter((gate) => signals.has(gate));
  const overlays = overlayMatches.map((route) => ({
    id: route.id,
    skill: route.recommendation.skill,
    available: routeAvailable(route, request.harness),
    available_in: route.recommendation.available_in ?? [],
    reason: route.recommendation.reason,
    expected_outputs: route.expected_outputs ?? [],
    exit_evidence: route.exit_evidence ?? [],
    source: route.source ?? 'curated',
    role: route.project_role ?? null,
  }));

  if (!preferred) {
    const rationale = capability.fallback;
    return {
      advisory: true,
      phase,
      capability: request.capability,
      signals: [...signals],
      detected_signals: [...signals],
      recommendation: null,
      primary: null,
      overlays,
      selection: {
        skill: 'vibe-tether',
        source: 'built-in-fallback',
        reason: rationale,
      },
      should_invoke_provider: overlays.some((overlay) => overlay.available),
      alternatives: [],
      rationale,
      fallback: capability.fallback,
      expected_outputs: capability.expected_outputs ?? [],
      required_outputs: capability.expected_outputs ?? [],
      exit_evidence: capability.exit_evidence ?? [],
      confirmation_required: confirmationGates.length > 0,
      confirmation_gates: confirmationGates,
    };
  }

  const preferredAvailable = routeAvailable(preferred, request.harness);
  const selectedSkill = available?.recommendation?.skill ?? preferred.fallback ?? 'vibe-tether';
  const selectionSource = available
    ? available.id === preferred.id
      ? preferred.source === 'project-local' ? 'project-local' : 'recommended'
      : preferred.source === 'project-local' ? 'curated-fallback' : 'available-alternative'
    : preferred.source === 'project-local' ? 'curated-fallback' : 'declared-fallback';
  const rationale = selectionSource === 'curated-fallback'
    ? `The matching project-local Skill is unavailable in ${request.harness ?? 'enabled harnesses'}; use the curated route or declared fallback.`
    : selectionSource === 'available-alternative'
      ? `The preferred Skill is unavailable in ${request.harness ?? 'enabled harnesses'}; use the next matching installed route.`
    : selectionSource === 'declared-fallback'
      ? 'No matching provider is available; use the declared fallback and record why.'
      : 'The preferred matching Skill is available.';
  const primary = {
    id: preferred.id,
    route_id: preferred.project_route_id ?? preferred.id,
    skill: preferred.recommendation.skill,
    available: preferredAvailable,
    available_in: preferred.recommendation.available_in ?? [],
    reason: preferred.recommendation.reason,
    source: preferred.source ?? 'curated',
    role: preferred.project_role ?? 'primary',
  };
  const requiredOutputs = preferred.expected_outputs ?? capability.expected_outputs ?? [];
  return {
    advisory: true,
    phase,
    capability: request.capability,
    signals: [...signals],
    detected_signals: [...signals],
    recommendation: primary,
    primary,
    overlays,
    selection: {
      skill: selectedSkill,
      source: selectionSource,
      reason: rationale,
    },
    should_invoke_provider: Boolean(available) || overlays.some((overlay) => overlay.available),
    alternatives: primaryMatches.slice(1).map((route) => ({
      id: route.id,
      route_id: route.project_route_id ?? route.id,
      skill: route.recommendation.skill,
      available: routeAvailable(route, request.harness),
      reason: route.recommendation.reason,
      source: route.source ?? 'curated',
      role: route.project_role ?? null,
    })),
    rationale,
    fallback: preferred.fallback ?? capability.fallback,
    expected_outputs: requiredOutputs,
    required_outputs: requiredOutputs,
    exit_evidence: preferred.exit_evidence ?? capability.exit_evidence ?? [],
    confirmation_required: confirmationGates.length > 0,
    confirmation_gates: confirmationGates,
  };
}
