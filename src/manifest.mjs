import YAML from 'yaml';
import { unresolvedIntent } from './bootstrap-model.mjs';

export const EXPERIENCE_INDEX_PATH = '.vibetether/experience-index.yaml';
export const TRUTH_INDEX_OWNERSHIP = Object.freeze({
  owner: 'vibetether',
  fingerprint: 'canonical-empty-v1',
});
export const OPERATIONS_SOURCE_PATH = 'docs/operations/';
export const EXPERIENCE_INDEX_OWNERSHIP = Object.freeze({
  owner: 'vibetether',
  fingerprint: 'canonical-empty-v1',
});

function isMapping(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireMapping(value, label) {
  if (!isMapping(value)) throw new Error(`${label} must be a mapping`);
  return value;
}

function hasSafeCanonicalOperationsSource(scanned) {
  const routes = scanned?.sources?.conditional?.operations;
  const discovery = scanned?.discovery?.[OPERATIONS_SOURCE_PATH];
  return Array.isArray(routes)
    && routes.includes(OPERATIONS_SOURCE_PATH)
    && isMapping(discovery)
    && discovery.role === 'operational proven paths'
    && discovery.confidence === 'high'
    && discovery.kind === 'directory';
}

export function refreshCanonicalOperationsSource(manifest, scanned) {
  const sources = manifest.sources === undefined
    ? {}
    : requireMapping(manifest.sources, 'manifest sources');
  const conditional = sources.conditional === undefined
    ? {}
    : requireMapping(sources.conditional, 'manifest conditional sources');
  const operations = conditional.operations ?? [];
  if (!Array.isArray(operations)) throw new Error('manifest conditional operations must be an array');
  const customOperations = operations.filter((route) => route !== OPERATIONS_SOURCE_PATH);
  const canonicalIsSafe = hasSafeCanonicalOperationsSource(scanned);
  const nextOperations = [...customOperations];
  if (canonicalIsSafe) {
    const priorCanonicalIndex = operations.indexOf(OPERATIONS_SOURCE_PATH);
    const insertionIndex = priorCanonicalIndex === -1
      ? nextOperations.length
      : Math.min(priorCanonicalIndex, nextOperations.length);
    nextOperations.splice(insertionIndex, 0, OPERATIONS_SOURCE_PATH);
  }
  const discovery = manifest.discovery === undefined
    ? {}
    : requireMapping(manifest.discovery, 'manifest discovery');
  const nextDiscovery = { ...discovery };
  delete nextDiscovery[OPERATIONS_SOURCE_PATH];
  if (canonicalIsSafe) {
    nextDiscovery[OPERATIONS_SOURCE_PATH] = { ...scanned.discovery[OPERATIONS_SOURCE_PATH] };
  }
  return {
    ...manifest,
    sources: {
      ...sources,
      conditional: {
        ...conditional,
        operations: nextOperations,
      },
    },
    discovery: nextDiscovery,
  };
}

export function serializeManifest(manifest) {
  return YAML.stringify(manifest, { lineWidth: 0 });
}

export function parseManifest(source) {
  const manifest = YAML.parse(source);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('manifest must be a mapping');
  if (manifest.schema_version !== 1) throw new Error('manifest schema_version must be 1');
  return manifest;
}

export function enableHarnesses(manifest, adapters) {
  const harnesses = { ...(manifest.harnesses ?? {}) };
  for (const adapter of adapters) {
    harnesses[adapter] = {
      ...(harnesses[adapter] ?? {}),
      enabled: true,
      instruction_file: adapter === 'codex' ? 'AGENTS.md' : 'CLAUDE.md',
    };
  }
  return { ...manifest, harnesses };
}

export function createInitialExperienceFeedback() {
  return {
    trigger: null,
    disposition: 'pending',
    reason: '',
    artifacts: [],
  };
}

export function createInitialTruthReconciliation({ legacy = false } = {}) {
  return {
    status: legacy ? 'unknown' : 'no_material_change',
    trigger: legacy ? 'legacy-upgrade' : 'initialization',
    route_instance_id: null,
    reason: legacy
      ? 'No historical Truth disposition was invented during upgrade.'
      : 'Initialization did not activate or change confirmed project truth.',
    candidate_path: null,
    updated_at: new Date().toISOString(),
  };
}

export function isVibeTetherOwnedExperienceIndex(value) {
  return value?.owner === EXPERIENCE_INDEX_OWNERSHIP.owner
    && value?.fingerprint === EXPERIENCE_INDEX_OWNERSHIP.fingerprint;
}

export function isVibeTetherOwnedTruthIndex(value) {
  return value?.owner === TRUTH_INDEX_OWNERSHIP.owner
    && value?.fingerprint === TRUTH_INDEX_OWNERSHIP.fingerprint;
}

export function createInitialCheckpoint(goalSource, recommendedProvider = 'vibe-tether') {
  return YAML.stringify(
    {
      schema_version: 1,
      goal: `Resolve the current approved goal from ${goalSource}`,
      phase: 'DISCOVER',
      slice: 'Confirm the goal and success evidence before consequential product work.',
      last_reanchor: new Date().toISOString(),
      approved_decisions: [],
      important_assumptions: [],
      protected_capabilities: [],
      files_touched: [],
      evidence_collected: [],
      negative_evidence: [],
      open_risks: ['The project goal and success evidence are not yet confirmed.'],
      next_intended_action: 'Confirm the Intent Contract with the user.',
      alignment_reason: 'Initialization creates recovery state without assuming product direction.',
      provider_selection: {
        capability: 'requirements-clarification',
        recommended: recommendedProvider,
        selected: null,
        selection_reason: null,
        invocation_status: 'not-started',
      },
      experience_feedback: createInitialExperienceFeedback(),
      truth_reconciliation: createInitialTruthReconciliation(),
    },
    { lineWidth: 0 },
  );
}

export const DEFAULT_INTENT = unresolvedIntent();
