import { buildRoutingDocument, resolveCatalogSources, resolveProfileProviders } from './provider-registry.mjs';

export function resolveProfileSources(registry, profile, bundles = []) {
  if (registry.profiles?.[profile]?.catalog_sources || bundles.length > 0) {
    return resolveCatalogSources(registry, profile, bundles);
  }
  const selected = new Set(resolveProfileProviders(registry, profile).map((provider) => provider.id));
  return registry.sources
    .map((source) => ({ ...source, skills: source.skills.filter((skill) => selected.has(skill.id)) }))
    .filter((source) => source.skills.length > 0);
}

export function priorInstallationOwnership(existingLock, provider, harness, relativePath) {
  const previous = (existingLock?.exposures ?? existingLock?.skills)?.find((skill) => skill.id === provider.id);
  if (
    previous?.fingerprint === provider.fingerprint &&
    previous.installations?.[harness]?.path === relativePath &&
    previous.installations[harness].ownership === 'vibetether'
  ) {
    return 'vibetether';
  }
  return null;
}

export function priorCatalogOwnership(existingLock, provider, relativePath) {
  const previous = existingLock?.catalog?.find((skill) => skill.id === provider.id);
  if (
    previous?.fingerprint === provider.fingerprint &&
    previous.installation?.path === relativePath &&
    previous.installation.ownership === 'vibetether'
  ) {
    return 'vibetether';
  }
  return null;
}

export function createProviderLock({
  profile,
  bundles = [],
  sources,
  providers,
  installations,
  catalogInstallations = [],
  existingLock = null,
}) {
  const activeIds = new Set(providers.map((provider) => provider.id));
  const exposures = providers.map((provider) => {
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

  for (const previous of existingLock?.exposures ?? existingLock?.skills ?? []) {
    if (activeIds.has(previous.id)) continue;
    exposures.push({ ...previous, active: false });
  }

  const activeCatalogIds = new Set(sources.flatMap((source) => source.skills.map((skill) => skill.id)));
  const catalog = sources.flatMap((source) => source.skills.map((skill) => {
    const installation = catalogInstallations.find((value) => value.provider_id === skill.id);
    return {
      id: skill.id,
      install_name: skill.install_name,
      source_id: source.id,
      fingerprint: skill.fingerprint,
      workflow_role: skill.workflow_role ?? 'unclassified',
      invocation_policy: skill.invocation_policy ?? 'advisory-auto-eligible',
      exposure: skill.exposure ?? 'profile',
      capabilities: skill.capabilities ?? [],
      conflicts: skill.conflicts ?? [],
      active: true,
      installation: installation ? { path: installation.path, ownership: installation.ownership } : null,
    };
  }));
  for (const previous of existingLock?.catalog ?? []) {
    if (activeCatalogIds.has(previous.id)) continue;
    catalog.push({ ...previous, active: false });
  }

  const sourceIds = new Set(catalog.map((skill) => skill.source_id));
  const lockSources = sources
    .filter((source) => sourceIds.has(source.id))
    .map((source) => ({
      id: source.id,
      repository: source.repository,
      ref: source.ref,
      commit: source.commit,
      license: source.license,
      license_path: source.license_path,
      ...(source.license_evidence ? { license_evidence: source.license_evidence } : {}),
      ...(source.license_sha256 ? { license_sha256: source.license_sha256 } : {}),
      ...(source.license_installation ? { license_installation: source.license_installation } : {}),
    }));
  for (const previous of existingLock?.sources ?? []) {
    if (!sourceIds.has(previous.id) || lockSources.some((source) => source.id === previous.id)) continue;
    lockSources.push(previous);
  }

  return {
    schema_version: 2,
    profile,
    bundles,
    install_time_only: true,
    sources: lockSources,
    catalog,
    exposures,
    skills: exposures,
  };
}

export function createCapabilityBoard(registry, profile, lock, harnesses) {
  const routing = buildRoutingDocument(registry, profile);
  const activeExposures = lock.exposures ?? lock.skills ?? [];
  const skills = new Map(activeExposures.map((skill) => [skill.install_name, skill]));
  const definitions = new Map(
    (registry.sources ?? []).flatMap((source) =>
      (source.skills ?? []).map((skill) => [skill.id, { ...skill, source_id: source.id }]),
    ),
  );
  const catalog = new Map((registry.capability_catalog ?? []).map((capability) => [capability.id, capability]));
  const routedProviders = new Set(routing.routes.map((route) => `${route.provider}:${route.capability}`));
  const specialistRoutes = activeExposures
    .filter((skill) => skill.active !== false)
    .flatMap((skill) => {
      const definition = definitions.get(skill.id) ?? {};
      if (definition.invocation_policy !== 'advisory-auto-eligible') return [];
      return (skill.capabilities ?? []).flatMap((capabilityId) => {
        if (routedProviders.has(`${skill.install_name}:${capabilityId}`)) return [];
        const contract = catalog.get(capabilityId);
        const phases = definition.route_phases ?? contract?.phases?.slice(0, 1) ?? [];
        return phases.map((phase) => ({
          id: `catalog-${skill.id}-${String(phase).toLowerCase()}`,
          priority: definition.route_priority ?? 50,
          phase,
          capability: capabilityId,
          provider: skill.install_name,
          workflow_role: definition.workflow_role ?? 'domain',
          when_any: definition.when_any ?? [],
          when_all: definition.when_all ?? [],
          reason: definition.use_when?.[0] ?? `Use ${skill.install_name} for ${capabilityId}.`,
          fallback: definition.fallback ?? contract?.fallback,
          selection: 'recommend',
          expected_outputs: definition.required_outputs?.length
            ? definition.required_outputs
            : contract?.required_outputs ?? [],
          exit_evidence: definition.exit_evidence?.length
            ? definition.exit_evidence
            : contract?.exit_evidence ?? [],
        }));
      });
    });
  const routeDefinitions = [...routing.routes, ...specialistRoutes];
  const routes = routeDefinitions.map((route) => {
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
    readiness_gate: registry.readiness_gate,
    high_risk_gates: [
      'direction-ambiguity',
      'architecture-or-public-contract',
      'visual-direction',
      'destructive-data-change',
      'permission-security-or-privacy',
      'merge-deploy-release-or-publish',
    ],
    scenarios: registry.scenario_catalog ?? [],
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
      catalog_alternatives: [...new Set([...definitions.values()]
        .filter((provider) => provider.exposure === 'catalog-only' && provider.capabilities?.includes(capability.id))
        .map((provider) => provider.install_name))],
      fallback: capability.fallback,
    })),
    providers: activeExposures.map((skill) => {
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
        auto_covered_by: definition.auto_covered_by ?? [],
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
