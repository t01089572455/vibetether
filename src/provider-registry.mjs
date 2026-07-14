import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(packageRoot, 'registry', 'bundles.json');
const capabilityPath = path.join(packageRoot, 'registry', 'capabilities.json');
const scenarioPath = path.join(packageRoot, 'registry', 'scenarios.json');
const registryRoot = path.dirname(registryPath);

function catalogPath(relativePath) {
  const target = path.resolve(registryRoot, relativePath);
  const relative = path.relative(registryRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Provider catalog path escapes the registry: ${relativePath}`);
  }
  return target;
}

export async function loadProviderRegistry() {
  const [registry, capabilities, scenarios] = await Promise.all([
    JSON.parse(await readFile(registryPath, 'utf8')),
    JSON.parse(await readFile(capabilityPath, 'utf8')),
    JSON.parse(await readFile(scenarioPath, 'utf8')),
  ]);
  const catalogSources = await Promise.all(
    (registry.catalogs ?? []).map(async (relativePath) => JSON.parse(await readFile(catalogPath(relativePath), 'utf8'))),
  );
  return {
    ...registry,
    sources: [...(registry.sources ?? []), ...catalogSources],
    capability_catalog: capabilities.capabilities ?? [],
    scenario_catalog: scenarios.scenarios ?? [],
    readiness_gate: capabilities.readiness_gate,
  };
}

function profileSkillIds(registry, profileName, seen = new Set()) {
  const profile = registry.profiles?.[profileName];
  if (!profile) throw new Error(`Unknown profile: ${profileName}`);
  if (seen.has(profileName)) throw new Error(`Profile inheritance cycle at ${profileName}`);
  seen.add(profileName);
  const inherited = profile.extends ? profileSkillIds(registry, profile.extends, seen) : [];
  return [...inherited, ...(profile.skills ?? [])];
}

function profileCatalogSourceIds(registry, profileName, seen = new Set()) {
  const profile = registry.profiles?.[profileName];
  if (!profile) throw new Error(`Unknown profile: ${profileName}`);
  if (seen.has(profileName)) throw new Error(`Profile inheritance cycle at ${profileName}`);
  seen.add(profileName);
  const inherited = profile.extends ? profileCatalogSourceIds(registry, profile.extends, seen) : [];
  return [...inherited, ...(profile.catalog_sources ?? [])];
}

function providerRecord(source, skill) {
  return {
    ...skill,
    source_id: source.id,
    repository: source.repository,
    ref: source.ref,
    commit: source.commit,
    license: source.license,
    license_path: source.license_path,
    license_evidence: source.license_evidence,
  };
}

export function resolveProfileProviders(registry, profileName) {
  const selected = new Set(profileSkillIds(registry, profileName));
  const providers = [];
  for (const source of registry.sources ?? []) {
    for (const skill of source.skills ?? []) {
      if (!selected.has(skill.id)) continue;
      providers.push(providerRecord(source, skill));
      selected.delete(skill.id);
    }
  }
  if (selected.size > 0) throw new Error(`Unknown provider skills in ${profileName}: ${[...selected].join(', ')}`);
  return providers;
}

export function resolveCatalogSources(registry, profileName, bundles = []) {
  const selected = new Set(profileCatalogSourceIds(registry, profileName));
  for (const bundleName of bundles) {
    const bundle = registry.bundles?.[bundleName];
    if (!bundle) throw new Error(`Unknown provider bundle: ${bundleName}`);
    for (const sourceId of bundle.catalog_sources ?? []) selected.add(sourceId);
  }
  const sources = registry.sources.filter((source) => selected.has(source.id));
  const missing = [...selected].filter((sourceId) => !sources.some((source) => source.id === sourceId));
  if (missing.length > 0) throw new Error(`Unknown catalog sources: ${missing.join(', ')}`);
  return sources;
}

export function resolveExposurePlan(registry, profileName, options = {}) {
  const selected = new Map(resolveProfileProviders(registry, profileName).map((provider) => [provider.id, provider]));
  const signals = new Set(options.signals ?? []);
  const explicit = new Set(options.explicit_bundles ?? []);
  for (const bundleName of options.bundles ?? []) {
    const bundle = registry.bundles?.[bundleName];
    if (!bundle) throw new Error(`Unknown provider bundle: ${bundleName}`);
    const sourceIds = new Set(bundle.catalog_sources ?? []);
    for (const source of registry.sources.filter((candidate) => sourceIds.has(candidate.id))) {
      for (const skill of source.skills) {
        if (skill.exposure !== 'bundle') continue;
        if (!explicit.has(bundleName) && skill.when_any?.length > 0 && !skill.when_any.some((signal) => signals.has(signal))) {
          continue;
        }
        selected.set(skill.id, providerRecord(source, skill));
      }
    }
  }
  return [...selected.values()];
}

export function validateProviderRegistry(registry) {
  const ids = new Set();
  const exposedNames = new Set();
  const capabilityIds = new Set((registry.capability_catalog ?? []).map((capability) => capability.id));
  for (const source of registry.sources ?? []) {
    if (registry.schema_version >= 2) {
      if (!['complete', 'selected'].includes(source.catalog_mode) || !source.skill_root) {
        throw new Error(`Provider source ${source.id} has incomplete catalog classification`);
      }
      if (!['full-text', 'readme-declaration'].includes(source.license_evidence?.mode)) {
        throw new Error(`Provider source ${source.id} has incomplete license evidence`);
      }
      if (
        source.license_evidence.mode === 'readme-declaration' &&
        (!source.license_evidence.declaration || !/^[a-f0-9]{64}$/.test(source.license_evidence.sha256 ?? ''))
      ) {
        throw new Error(`Provider source ${source.id} has incomplete declared license evidence`);
      }
    }
    for (const skill of source.skills ?? []) {
      if (ids.has(skill.id)) throw new Error(`Duplicate provider id: ${skill.id}`);
      ids.add(skill.id);
      if (registry.schema_version >= 2) {
        for (const field of ['catalog_status', 'workflow_role', 'invocation_policy', 'exposure', 'fallback']) {
          if (!skill[field]) throw new Error(`Provider classification for ${skill.id} is missing ${field}`);
        }
        for (const field of ['capabilities', 'conflicts', 'required_outputs', 'exit_evidence']) {
          if (!Array.isArray(skill[field])) {
            throw new Error(`Provider classification for ${skill.id} is missing ${field}`);
          }
        }
      }
      for (const capability of skill.capabilities ?? []) {
        if (!capabilityIds.has(capability)) {
          throw new Error(`Provider ${skill.id} references unknown capability ${capability}`);
        }
      }
      if (
        skill.workflow_role === 'competing-router' &&
        !['catalog-only', 'explicit-only'].includes(skill.exposure)
      ) {
        throw new Error(`Competing router ${skill.install_name} cannot be automatically exposed`);
      }
      if (skill.exposure !== 'catalog-only') {
        if (exposedNames.has(skill.install_name)) {
          throw new Error(`Duplicate exposed provider install name: ${skill.install_name}`);
        }
        exposedNames.add(skill.install_name);
      }
    }
  }
  return registry;
}

export function buildRoutingDocument(registry, profileName) {
  validateProviderRegistry(registry);
  if (
    registry.readiness_gate?.mode !== 'automatic' ||
    !Array.isArray(registry.readiness_gate.dimensions) ||
    registry.readiness_gate.dimensions.length === 0 ||
    !registry.readiness_gate.implementation_requires
  ) {
    throw new Error('The registry requires a complete automatic readiness gate');
  }
  const selectedProviders = resolveProfileProviders(registry, profileName);
  const installed = new Set(selectedProviders.map((provider) => provider.install_name));
  const routes = (registry.routes ?? [])
    .filter((route) => route.profiles.includes(profileName))
    .map(({ profiles, priority = 0, ...route }) => ({ ...route, priority }));
  const primaryOwners = new Map();
  for (const route of routes.filter((candidate) => candidate.workflow_role === 'primary')) {
    const signature = JSON.stringify({
      phase: route.phase,
      capability: route.capability,
      priority: route.priority,
      when_all: [...(route.when_all ?? [])].sort(),
      when_any: [...(route.when_any ?? [])].sort(),
    });
    const previous = primaryOwners.get(signature);
    if (previous && previous.provider !== route.provider) {
      throw new Error(
        `Ambiguous primary routes ${previous.id} and ${route.id} have equal ownership for ${route.phase}/${route.capability}`,
      );
    }
    primaryOwners.set(signature, route);
  }
  for (const route of routes) {
    if (!installed.has(route.provider)) {
      throw new Error(`Route ${route.id} recommends ${route.provider}, which is not installed by profile ${profileName}`);
    }
  }
  for (const provider of selectedProviders) {
    if (provider.invocation_policy !== 'upstream-explicit-alias') continue;
    if (!Array.isArray(provider.auto_covered_by) || provider.auto_covered_by.length === 0) {
      throw new Error(`Upstream explicit alias ${provider.install_name} requires automatic coverage`);
    }
    for (const automaticProvider of provider.auto_covered_by) {
      if (!installed.has(automaticProvider)) {
        throw new Error(`Automatic coverage for ${provider.install_name} references unavailable provider ${automaticProvider}`);
      }
      if (!routes.some((route) => route.provider === automaticProvider)) {
        throw new Error(`Automatic coverage provider ${automaticProvider} for ${provider.install_name} has no route in ${profileName}`);
      }
    }
  }
  return {
    schema_version: 1,
    profile: profileName,
    selection_policy: {
      entry_skill: 'vibe-tether',
      one_primary_workflow_provider_per_phase: true,
      project_truth_overrides_provider_advice: true,
      runtime_auto_install: false,
      provider_selection: 'advisory',
      readiness_assessment: 'automatic-before-consequential-work',
      live_availability: 'check-recorded-installation-paths-before-selection',
      missing_provider: 'use-declared-fallback-and-record-the-choice',
    },
    routes,
  };
}

function routeMatches(route, signals) {
  if (route.when_all?.some((signal) => !signals.has(signal))) return false;
  if (route.when_any?.length > 0 && !route.when_any.some((signal) => signals.has(signal))) return false;
  return true;
}

export function matchingRoutes(routing, request) {
  const phase = String(request.phase ?? '').toUpperCase();
  const signals = new Set(request.signals ?? []);
  return routing.routes
    .filter((route) => route.phase.toUpperCase() === phase && route.capability === request.capability)
    .filter((route) => routeMatches(route, signals))
    .sort((left, right) => right.priority - left.priority);
}

export function resolveRoute(routing, request) {
  return matchingRoutes(routing, request)[0] ?? null;
}
