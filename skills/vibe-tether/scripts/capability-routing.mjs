function routeMatches(route, signals) {
  if ((route.signals?.all ?? []).some((signal) => !signals.has(signal))) return false;
  const any = route.signals?.any ?? [];
  return any.length === 0 || any.some((signal) => signals.has(signal));
}

function routeAvailable(route, harness) {
  const available = route.recommendation?.available_in ?? [];
  return harness ? available.includes(harness) : available.length > 0;
}

export function assertCapabilityBoard(board) {
  if (board === null || typeof board !== 'object' || Array.isArray(board)) {
    throw new Error('Capability board must be a mapping');
  }
  if (board.schema_version !== 1 || board.mode !== 'advisory-router') {
    throw new Error('Capability board requires schema_version 1 and advisory-router mode');
  }
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
