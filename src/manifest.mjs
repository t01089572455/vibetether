import YAML from 'yaml';

export function serializeManifest(manifest) {
  return YAML.stringify(manifest, { lineWidth: 0 });
}

export function createInitialCheckpoint(goalSource) {
  return YAML.stringify(
    {
      schema_version: 1,
      lifecycle_state: 'DISCOVER',
      goal_source: goalSource,
      current_slice: null,
      last_verdict: 'INITIALIZED',
      updated_at: new Date().toISOString(),
      source_fingerprint: null,
      working_tree_fingerprint: null,
      evidence: [],
      known_blockers: ['Confirm the goal and success evidence before consequential product work.'],
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
