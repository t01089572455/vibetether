import { conflictError } from './errors.mjs';
import { normalizeSignal } from './files.mjs';
import { routeMatches } from './routes.mjs';

function channelAllowed(channel, policy, explicit) {
  if (explicit) return !['quarantined','retired'].includes(channel);
  if (policy === 'explicit-only') return false;
  if (policy === 'stable-only') return channel === 'stable';
  return ['stable','beta'].includes(channel);
}
function permissionAllowed(provider, granted) {
  return Object.entries(provider.permissions).every(([key, required]) => !required || granted[key] === true);
}
function eligible(provider, request, lock, pinMap, explicit = false) {
  const signals = new Set((request.signals ?? []).map(normalizeSignal));
  if (!provider.phases.includes(request.phase) || !provider.capabilities.includes(request.capability)) return false;
  if (!provider.hosts.includes(request.agent) || !provider.operating_systems.includes(process.platform)) return false;
  if (!channelAllowed(provider.channel, lock.auto_activate, explicit)) return false;
  if (!permissionAllowed(provider, request.permissions ?? {})) return false;
  if (lock.disabled.includes(provider.id)) return false;
  if (!provider.packs.includes('core') && !provider.packs.some((pack) => lock.packs.includes(pack))) return false;
  if (!provider.builtin) {
    const pin = pinMap.get(provider.id);
    if (!pin || pin.object_hash !== provider.object_hash || pin.fingerprint !== provider.fingerprint) return false;
  }
  if (provider.negative_triggers.some((signal) => signals.has(normalizeSignal(signal)))) return false;
  if (provider.positive_triggers.length && !provider.positive_triggers.some((signal) => signals.has(normalizeSignal(signal)))) return false;
  return true;
}

export function brokerSkills(registry, request, lock, routes = null, stats = {}) {
  const phase = String(request.phase ?? '').toUpperCase();
  const capability = registry.capabilities.capabilities.find((item) => item.id === request.capability);
  if (!capability || !capability.phases.includes(phase)) throw conflictError(`Capability ${request.capability} is not valid in phase ${phase}.`, 'UNKNOWN_CAPABILITY');
  const normalized = { ...request, phase, signals: (request.signals ?? []).map(normalizeSignal) };
  const pinMap = new Map(lock.pins.map((pin) => [pin.id,pin]));
  const matchedRoutes = (routes?.routes ?? []).filter((route) => routeMatches(route, normalized));
  const explicit = request.provider ?? null;
  if (explicit) {
    const card = registry.providers.find((item) => item.id === explicit);
    if (!card || !eligible(card, normalized, lock, pinMap, true)) throw conflictError(`Explicit Provider is unavailable or inapplicable: ${explicit}`, 'PROVIDER_UNAVAILABLE');
    return result(capability, normalized, lock, [{ provider: card, score: 10_000, reasons: ['explicit-provider'] }], matchedRoutes, []);
  }
  const routeScores = new Map();
  for (const route of matchedRoutes) {
    const role = route.role === 'primary' ? 2000 : route.role === 'overlay' ? 1000 : 500;
    routeScores.set(route.provider, Math.max(routeScores.get(route.provider) ?? -Infinity, role + route.priority));
  }
  const signals = new Set(normalized.signals);
  const candidates = [];
  const overlays = [];
  for (const provider of registry.providers) {
    if (!eligible(provider, normalized, lock, pinMap)) continue;
    if (provider.workflow_role === 'overlay') {
      overlays.push({id:provider.id,description:provider.description,context_bytes:provider.context_bytes});
      continue;
    }
    let score = routeScores.get(provider.id) ?? 0;
    // Built-in providers are safe fallbacks. Prefer an applicable curated Provider pack when available.
    if (provider.builtin && provider.packs.includes('core')) score -= 1000;
    const reasons = [];
    if (routeScores.has(provider.id)) reasons.push('project-route');
    const matches = provider.positive_triggers.filter((signal) => signals.has(normalizeSignal(signal))).length;
    score += matches * 100;
    if (matches) reasons.push(`${matches}-trigger-match`);
    const preference = lock.preferences.indexOf(provider.id);
    if (preference >= 0) { score += 400 - preference; reasons.push('project-preference'); }
    const outcome = stats[provider.id];
    if (outcome) {
      score += Math.min(300, (outcome.successes ?? 0) * 20) - Math.min(500, (outcome.failures ?? 0) * 100);
      if ((outcome.failures ?? 0) >= 2) continue;
      reasons.push('project-affinity');
    }
    score += Math.round(provider.quality.trigger_precision * 50 + provider.quality.trigger_recall * 50 + provider.quality.output_gain * 100);
    score -= Math.ceil(provider.context_bytes / 1024);
    candidates.push({ provider, score, reasons: reasons.length ? reasons : ['capability-fit'] });
  }
  candidates.sort((a,b) => b.score - a.score || a.provider.context_bytes - b.provider.context_bytes || a.provider.id.localeCompare(b.provider.id));
  if (!candidates.length) {
    const fallback = registry.providers.find((item) => item.id === capability.fallback);
    if (!fallback || !fallback.builtin) throw conflictError(`Capability fallback is unavailable or not built in: ${capability.fallback}`, 'INVALID_REGISTRY');
    if (!fallback.hosts.includes(normalized.agent) || !fallback.operating_systems.includes(process.platform) || !permissionAllowed(fallback, normalized.permissions ?? {})) {
      throw conflictError(`Capability fallback requires permissions or compatibility that are not available: ${capability.fallback}`, 'PROVIDER_UNAVAILABLE');
    }
    candidates.push({ provider: fallback, score: 0, reasons: ['built-in-fallback'] });
  }
  return result(capability, normalized, lock, candidates, matchedRoutes, overlays);
}

function result(capability, request, lock, candidates, matchedRoutes = [], overlays = []) {
  const shortlist = candidates.slice(0, lock.shortlist_max).map(({ provider, score, reasons }) => ({
    id: provider.id,
    channel: provider.channel,
    description: provider.description,
    score,
    reasons,
    context_bytes: provider.context_bytes,
    builtin: provider.builtin,
  }));
  const selected = candidates[0].provider;
  const gap = candidates.length > 1 ? candidates[0].score - candidates[1].score : Infinity;
  return {
    schema_version: 1,
    phase: request.phase,
    capability: request.capability,
    signals: request.signals,
    shortlist,
    overlays: overlays.slice(0,2),
    selected: {
      id: selected.id,
      channel: selected.channel,
      builtin: selected.builtin,
      fingerprint: selected.fingerprint,
      object_hash: selected.object_hash,
      resolved_path: selected.resolved_path,
      context_bytes: selected.context_bytes,
      permissions: selected.permissions,
      worker_recommended: selected.worker_recommended === true || selected.context_bytes > 12 * 1024,
    },
    confidence: gap === Infinity || gap >= 250 ? 'high' : gap >= 50 ? 'medium' : 'low',
    required_outputs: [...new Set([...(capability.required_outputs ?? []), ...matchedRoutes.flatMap((route) => route.required_outputs ?? [])])],
    exit_evidence: [...new Set([...(capability.exit_evidence ?? []), ...matchedRoutes.flatMap((route) => route.exit_evidence ?? [])])],
    fallback: capability.fallback,
  };
}
