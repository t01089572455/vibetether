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
    assertOptionalStringArray(capability[field], `capability ${capability.id}.${field}`);
  }
}

function assertProvider(provider) {
  if (!isRecord(provider) || typeof provider.skill !== 'string' || provider.skill.length === 0) {
    throw new Error('Capability board providers must contain identified mappings');
  }
  for (const field of ['capabilities', 'available_in', 'routed_by', 'use_when', 'auto_covered_by']) {
    assertOptionalStringArray(provider[field], `provider ${provider.skill}.${field}`);
  }
  assertInstallations(provider.installations, `provider ${provider.skill}.installations`);
}

function assertRoute(route) {
  if (!isRecord(route)
      || typeof route.id !== 'string' || route.id.length === 0
      || typeof route.phase !== 'string' || route.phase.length === 0
      || typeof route.capability !== 'string' || route.capability.length === 0) {
    throw new Error('Capability board routes must contain identified phase and capability mappings');
  }
  assertOptionalRecord(route.signals, `route ${route.id}.signals`);
  for (const field of ['all', 'any']) {
    assertOptionalStringArray(route.signals?.[field], `route ${route.id}.signals.${field}`);
  }
  if (!isRecord(route.recommendation)
      || typeof route.recommendation.skill !== 'string' || route.recommendation.skill.length === 0) {
    throw new Error(`Capability board route ${route.id} requires a recommendation mapping`);
  }
  assertOptionalStringArray(route.recommendation.available_in, `route ${route.id}.recommendation.available_in`);
  assertInstallations(route.recommendation.installations, `route ${route.id}.recommendation.installations`);
  assertOptionalStringArray(route.expected_outputs, `route ${route.id}.expected_outputs`);
  assertOptionalStringArray(route.exit_evidence, `route ${route.id}.exit_evidence`);
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
    ? available.id === preferred.id ? 'recommended' : 'available-alternative'
    : 'declared-fallback';
  const rationale = selectionSource === 'available-alternative'
    ? `The preferred Skill is unavailable in ${request.harness ?? 'enabled harnesses'}; use the next matching installed route.`
    : selectionSource === 'declared-fallback'
      ? 'No matching provider is available; use the declared fallback and record why.'
      : 'The preferred matching Skill is available.';
  const primary = {
    skill: preferred.recommendation.skill,
    available: preferredAvailable,
    available_in: preferred.recommendation.available_in ?? [],
    reason: preferred.recommendation.reason,
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
      skill: route.recommendation.skill,
      available: routeAvailable(route, request.harness),
      reason: route.recommendation.reason,
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
