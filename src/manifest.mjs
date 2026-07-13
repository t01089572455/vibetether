import YAML from 'yaml';

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
    },
    { lineWidth: 0 },
  );
}

export const DEFAULT_INTENT = `# VibeTether Intent Contract

This contract is the durable statement of direction for long-running agent work. Resolve product ambiguity with the user before changing consequential behavior.

## Goal

No project goal has been recorded yet.

## Success evidence

No acceptance evidence has been recorded yet.

## Scope boundaries

No additional boundaries have been recorded yet.

## Non-negotiable constraints

- Preserve existing project instructions and higher-authority decisions.
- Confirm destructive actions and releases before execution.

## Visual direction

No visual direction has been recorded yet.

## Open direction decisions

- Confirm the goal and success evidence before consequential product work.
`;
