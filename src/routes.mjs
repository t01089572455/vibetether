import { conflictError } from './errors.mjs';
import { assertSafeId, normalizeSignal } from './files.mjs';

const ROLES = new Set(['primary','alternative','overlay']);
const ROUTE_KEYS = new Set(['id','phases','capability','signals','provider','role','priority','required_outputs','exit_evidence']);
const SIGNAL_KEYS = new Set(['all','any','none']);

function strings(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== 'string' || !item.trim())) throw conflictError(`${label} must be an array of strings.`, 'INVALID_ROUTES');
  return [...new Set(value.map((item) => item.trim()))];
}
function only(value, allowed, label) { for (const key of Object.keys(value)) if (!allowed.has(key)) throw conflictError(`${label} contains unsupported field: ${key}`, 'INVALID_ROUTES'); }

export function validateRoutes(document, capabilities, providers) {
  if (!document || typeof document !== 'object' || Array.isArray(document) || document.schema_version !== 1 || !Array.isArray(document.routes)) throw conflictError('Project routes require schema_version 1 and routes array.', 'INVALID_ROUTES');
  const capabilityMap = new Map(capabilities.capabilities.map((item) => [item.id,item]));
  const providerIds = new Set(providers.map((item) => item.id));
  const ids = new Set();
  const primaryKeys = new Set();
  const routes = document.routes.map((route, index) => {
    if (!route || typeof route !== 'object' || Array.isArray(route)) throw conflictError(`Route ${index + 1} must be an object.`, 'INVALID_ROUTES');
    only(route, ROUTE_KEYS, `Route ${index + 1}`);
    assertSafeId(route.id, 'Route id');
    if (ids.has(route.id)) throw conflictError(`Duplicate route id: ${route.id}`, 'INVALID_ROUTES');
    ids.add(route.id);
    const capability = capabilityMap.get(route.capability);
    if (!capability) throw conflictError(`Route ${route.id} references unknown capability.`, 'INVALID_ROUTES');
    assertSafeId(route.provider, 'Route provider');
    if (!providerIds.has(route.provider)) throw conflictError(`Route ${route.id} references unavailable provider: ${route.provider}`, 'INVALID_ROUTES');
    if (!ROLES.has(route.role)) throw conflictError(`Route ${route.id} role is invalid.`, 'INVALID_ROUTES');
    const phases = strings(route.phases, `Route ${route.id} phases`, { allowEmpty: false });
    for (const phase of phases) if (!capability.phases.includes(phase)) throw conflictError(`Route ${route.id} phase ${phase} is invalid for ${route.capability}.`, 'INVALID_ROUTES');
    if (!route.signals || typeof route.signals !== 'object' || Array.isArray(route.signals)) throw conflictError(`Route ${route.id} signals must be an object.`, 'INVALID_ROUTES');
    only(route.signals, SIGNAL_KEYS, `Route ${route.id} signals`);
    const signals = Object.fromEntries([...SIGNAL_KEYS].map((key) => [key, strings(route.signals[key] ?? [], `Route ${route.id} signals.${key}`).map(normalizeSignal)]));
    if (route.role === 'primary' && signals.any.length === 0 && signals.all.length === 0) throw conflictError(`Primary route ${route.id} requires an observable signal.`, 'INVALID_ROUTES');
    const priority = route.priority ?? 0;
    if (!Number.isInteger(priority) || priority < -1_000_000 || priority > 1_000_000) throw conflictError(`Route ${route.id} priority is invalid.`, 'INVALID_ROUTES');
    if (route.role === 'primary') {
      for (const phase of phases) {
        const key = `${phase}\0${route.capability}\0${[...signals.all].sort().join(',')}\0${[...signals.any].sort().join(',')}\0${priority}`;
        if (primaryKeys.has(key)) throw conflictError(`Project routes have equally matching primaries for ${phase}/${route.capability}.`, 'AMBIGUOUS_ROUTE');
        primaryKeys.add(key);
      }
    }
    return {
      id: route.id, phases, capability: route.capability, signals, provider: route.provider,
      role: route.role, priority,
      required_outputs: strings(route.required_outputs ?? [], `Route ${route.id} required_outputs`),
      exit_evidence: strings(route.exit_evidence ?? [], `Route ${route.id} exit_evidence`),
    };
  });
  return { schema_version: 1, routes };
}

export function routeMatches(route, request) {
  const signals = new Set((request.signals ?? []).map(normalizeSignal));
  if (!route.phases.includes(request.phase) || route.capability !== request.capability) return false;
  if (route.signals.all.some((signal) => !signals.has(signal))) return false;
  if (route.signals.none.some((signal) => signals.has(signal))) return false;
  return route.signals.any.length === 0 || route.signals.any.some((signal) => signals.has(signal));
}
