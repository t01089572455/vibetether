# Checkpoints and Drift

## Two Persistence Layers

Durable project truth may be version controlled:

- approved Intent Contract;
- product direction and boundaries;
- architecture decisions;
- UI design contract;
- accepted user overrides;
- reusable failure knowledge and regression tests.

Runtime checkpoints are local by default. Team sharing is explicit. Never auto-commit either layer.

## Checkpoint Schema

Persist decision and recovery state, never private chain-of-thought:

```yaml
schema_version: 1
goal: current approved goal
phase: EXECUTE_ONE
slice: one rejectable and verifiable unit
last_reanchor: 2026-07-13T12:00:00Z
approved_decisions: []
important_assumptions: []
protected_capabilities: []
files_touched: []
evidence_collected: []
negative_evidence: []
open_risks: []
next_intended_action: one concrete action
alignment_reason: why the action serves the goal
```

Exclude prompts, credentials, sensitive tool output, raw reasoning, full provider responses, and private user data.

## Resume Protocol

1. Read project instructions and manifest.
2. Read the latest checkpoint.
3. Compare checkpoint paths and scope with the working tree.
4. Reload sources applicable to the next action.
5. Resolve stale decisions or conflicts.
6. Restate goal, phase, protected capabilities, evidence gap, and next action.
7. Write a fresh checkpoint before acting.

Never resume directly from a compacted conversational summary.

## Drift Levels

### L1_LOCAL

Local, reversible deviation with no product or contract effect. Correct it, verify it, and record the correction.

### L2_DIRECTION

The implementation conflicts with approved direction, UI, architecture, or a protected capability. Stop propagation, cite the conflict, recommend a resolution, and ask.

### L3_HIGH_IMPACT

The drift affects many files, removes capabilities, changes contracts or data behavior, or approaches release. Freeze expansion and produce a drift report.

## Drift Report

Include:

- original approved goal;
- current observed direction;
- violated sources and gates;
- earliest known divergence point;
- affected files, capabilities, contracts, and evidence;
- verified and unverified work;
- preserve, repair, and rollback options;
- cost, risk, and evidence required for each option.

Do not run destructive rollback automatically. Preserve user work and request explicit authorization.

## Drift Signals

- recent implementation replaces original product language;
- the same correction repeats;
- scope expands without an updated slice;
- tests prove markers rather than user outcomes;
- a visual pattern spreads before approval;
- a provider introduces a second truth source;
- a new dependency or architecture appears without a decision;
- the checkpoint and working tree disagree;
- release evidence predates the final diff.
