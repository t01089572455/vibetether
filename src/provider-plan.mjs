import { buildRoutingDocument, resolveProfileProviders } from './provider-registry.mjs';

export function resolveProfileSources(registry, profile) {
  const selected = new Set(resolveProfileProviders(registry, profile).map((provider) => provider.id));
  return registry.sources
    .map((source) => ({ ...source, skills: source.skills.filter((skill) => selected.has(skill.id)) }))
    .filter((source) => source.skills.length > 0);
}

export function priorInstallationOwnership(existingLock, provider, harness, relativePath) {
  const previous = existingLock?.skills?.find((skill) => skill.id === provider.id);
  if (
    previous?.fingerprint === provider.fingerprint &&
    previous.installations?.[harness]?.path === relativePath &&
    previous.installations[harness].ownership === 'vibetether'
  ) {
    return 'vibetether';
  }
  return null;
}

export function createProviderLock({ profile, sources, providers, installations, existingLock = null }) {
  const activeIds = new Set(providers.map((provider) => provider.id));
  const skills = providers.map((provider) => {
    const skillInstallations = {};
    for (const value of installations.filter((installation) => installation.provider_id === provider.id)) {
      skillInstallations[value.harness] = {
        path: value.path,
        ownership: value.ownership,
      };
    }
    return {
      id: provider.id,
      install_name: provider.install_name,
      source_id: provider.source_id,
      fingerprint: provider.fingerprint,
      capabilities: provider.capabilities,
      active: true,
      installations: skillInstallations,
    };
  });

  for (const previous of existingLock?.skills ?? []) {
    if (activeIds.has(previous.id)) continue;
    skills.push({ ...previous, active: false });
  }

  const sourceIds = new Set(skills.map((skill) => skill.source_id));
  const lockSources = sources
    .filter((source) => sourceIds.has(source.id))
    .map((source) => ({
      id: source.id,
      repository: source.repository,
      ref: source.ref,
      commit: source.commit,
      license: source.license,
      license_path: source.license_path,
      ...(source.license_sha256 ? { license_sha256: source.license_sha256 } : {}),
      ...(source.license_installation ? { license_installation: source.license_installation } : {}),
    }));
  for (const previous of existingLock?.sources ?? []) {
    if (!sourceIds.has(previous.id) || lockSources.some((source) => source.id === previous.id)) continue;
    lockSources.push(previous);
  }

  return {
    schema_version: 1,
    profile,
    install_time_only: true,
    sources: lockSources,
    skills,
  };
}

export function createCapabilityBoard(registry, profile, lock, harnesses) {
  const routing = buildRoutingDocument(registry, profile);
  const skills = new Map((lock.skills ?? []).map((skill) => [skill.install_name, skill]));
  const definitions = new Map(
    (registry.sources ?? []).flatMap((source) =>
      (source.skills ?? []).map((skill) => [skill.id, { ...skill, source_id: source.id }]),
    ),
  );
  const catalog = new Map((registry.capability_catalog ?? []).map((capability) => [capability.id, capability]));
  const routes = routing.routes.map((route) => {
    const installed = skills.get(route.provider);
    const availableIn = harnesses.filter((harness) => installed?.installations?.[harness]);
    const contract = catalog.get(route.capability);
    return {
      id: route.id,
      priority: route.priority ?? 0,
      phase: route.phase,
      capability: route.capability,
      workflow_role: route.workflow_role,
      signals: {
        all: route.when_all ?? [],
        any: route.when_any ?? [],
      },
      recommendation: {
        skill: route.provider,
        available_in: availableIn,
        installations: Object.fromEntries(
          availableIn.map((harness) => [harness, installed.installations[harness].path]),
        ),
        reason: route.reason,
      },
      fallback: route.fallback ?? contract?.fallback,
      selection: route.selection,
      expected_outputs: route.expected_outputs ?? contract?.required_outputs ?? [],
      exit_evidence: route.exit_evidence ?? contract?.exit_evidence ?? contract?.required_outputs ?? [],
    };
  });
  return {
    schema_version: 1,
    profile,
    mode: 'advisory-router',
    selection_policy: routing.selection_policy,
    high_risk_gates: [
      'direction-ambiguity',
      'architecture-or-public-contract',
      'visual-direction',
      'destructive-data-change',
      'permission-security-or-privacy',
      'merge-deploy-release-or-publish',
    ],
    capabilities: [...catalog.values()].map((capability) => ({
      id: capability.id,
      phases: capability.phases ?? [],
      purpose: capability.purpose,
      invoke_when: capability.invoke_when ?? [],
      required_inputs: capability.required_inputs ?? [],
      expected_outputs: capability.required_outputs ?? [],
      exit_evidence: capability.exit_evidence ?? capability.required_outputs ?? [],
      provider_options: [...new Set(routes
        .filter((route) => route.capability === capability.id)
        .map((route) => route.recommendation.skill))],
      fallback: capability.fallback,
    })),
    providers: (lock.skills ?? []).map((skill) => {
      const definition = definitions.get(skill.id) ?? {};
      const providerRoutes = routes.filter((route) => route.recommendation.skill === skill.install_name);
      const availableIn = harnesses.filter((harness) => skill.installations?.[harness]);
      return {
        skill: skill.install_name,
        provider_id: skill.id,
        source_id: skill.source_id,
        active: skill.active,
        selection_status: skill.active ? 'eligible' : 'inactive-not-recommended',
        invocation_policy: definition.invocation_policy ?? 'advisory-auto-eligible',
        capabilities: skill.capabilities ?? [],
        available_in: availableIn,
        installations: Object.fromEntries(
          availableIn.map((harness) => [harness, skill.installations[harness].path]),
        ),
        routed_by: providerRoutes.map((route) => route.id),
        use_when: definition.use_when ?? providerRoutes.map((route) => route.recommendation.reason),
      };
    }),
    routes,
  };
}
