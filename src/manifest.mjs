import YAML from 'yaml';
import { unresolvedIntent } from './bootstrap-model.mjs';

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
    },
    { lineWidth: 0 },
  );
}

export const DEFAULT_INTENT = unresolvedIntent();
