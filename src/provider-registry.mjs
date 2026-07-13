import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(packageRoot, 'registry', 'bundles.json');
const capabilityPath = path.join(packageRoot, 'registry', 'capabilities.json');

export async function loadProviderRegistry() {
  const [registry, capabilities] = await Promise.all([
    JSON.parse(await readFile(registryPath, 'utf8')),
    JSON.parse(await readFile(capabilityPath, 'utf8')),
  ]);
  return {
    ...registry,
    capability_catalog: capabilities.capabilities ?? [],
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

export function resolveProfileProviders(registry, profileName) {
  const selected = new Set(profileSkillIds(registry, profileName));
  const providers = [];
  for (const source of registry.sources ?? []) {
    for (const skill of source.skills ?? []) {
      if (!selected.has(skill.id)) continue;
      providers.push({
        ...skill,
        source_id: source.id,
        repository: source.repository,
        ref: source.ref,
        commit: source.commit,
        license: source.license,
        license_path: source.license_path,
      });
      selected.delete(skill.id);
    }
  }
  if (selected.size > 0) throw new Error(`Unknown provider skills in ${profileName}: ${[...selected].join(', ')}`);
  return providers;
}

export function buildRoutingDocument(registry, profileName) {
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
  if (route.when_any && !route.when_any.some((signal) => signals.has(signal))) return false;
  return true;
}

export function resolveRoute(routing, request) {
  const phase = String(request.phase ?? '').toUpperCase();
  const signals = new Set(request.signals ?? []);
  const matches = routing.routes
    .filter((route) => route.phase.toUpperCase() === phase && route.capability === request.capability)
    .filter((route) => routeMatches(route, signals))
    .sort((left, right) => right.priority - left.priority);
  return matches[0] ?? null;
}
