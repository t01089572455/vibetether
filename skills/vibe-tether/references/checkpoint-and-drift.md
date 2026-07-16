# Checkpoints and Drift

## Two Persistence Layers

Durable project truth may be version controlled:

- approved Intent Contract;
- product direction and boundaries;
- architecture decisions;
- UI design contract;
- accepted user overrides;
- reusable first, recovered, and changed Proven Paths;
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
authority_snapshot:
  anchored_at: 2026-07-15T12:00:00Z
  intent:
    path: .vibetether/intent.md
    kind: file
    sha256: 64-character content fingerprint
  truth_index:
    path: .vibetether/TRUTH.md
    kind: file
    sha256: 64-character content fingerprint
  confirmed_projection_sha256: 64-character confirmed-entry fingerprint
  confirmed_sources:
    - path: docs/product-direction.md
      kind: file
      sha256: 64-character content fingerprint
      role: product-direction
      scope: .
provider_selection:
  capability: planning
  recommended: writing-plans
  selected: writing-plans
  selection_reason: recommended provider is installed and fits the phase
  invocation_status: completed
experience_feedback:
  trigger: first-proven-path
  disposition: captured
  reason: First verified publication workflow for this repository.
  artifacts:
    - docs/operations/publication.md
truth_reconciliation:
  status: no_material_change
  trigger: route-complete
  route_instance_id: unique route execution identifier
  reason: Verified evidence changed without changing confirmed authority.
  candidate_path: null
  updated_at: 2026-07-15T12:05:00Z
```

Exclude prompts, credentials, sensitive tool output, raw reasoning, full provider responses, and private user data.

The route re-anchor writes mechanical content fingerprints. The full Truth Map hash detects metadata and candidate changes; `confirmed_projection_sha256` distinguishes those from changes to active authority. These fingerprints detect bytes and structure; they do not prove the Agent read or understood a source. `doctor` reports truth or intent changed after the last route anchor so the affected slice can return to alignment.

The route handshake also records a unique `route_instance_id`, `execution_start`, and—after completion or abandonment—`execution_end`. Execution snapshots include the real project-contained root and, when Git is available, worktree, branch/ref, HEAD, status hash, and a content-sensitive dirty-worktree hash. This state belongs in the local checkpoint layer, not in durable project truth.

## Resume Protocol

1. Read project instructions, manifest, truth map, and Intent Contract.
2. Read the latest checkpoint.
3. Compare checkpoint paths, truth fingerprints, and scope with the working tree.
4. Reload only confirmed sources applicable to the next action.
5. Resolve stale decisions or conflicts.
6. Consult the capability board and live project route overlay, then start `node .vibetether/bin/vibetether.mjs route` for the current phase, capability, observable signals, and real execution root.
7. Read applicable Proven Paths before inventing a new operational route.
8. Restate goal, phase, protected capabilities, provider selection, experience disposition, evidence gap, and next action.
9. Write a fresh checkpoint before acting.
10. Before a phase transition, close the route with bounded evidence or a material abandonment reason, then resolve `truth_reconciliation`. Use the inline `no-material-change` decision only when confirmed authority did not change.
11. At completion, handoff, merge, deployment, release, or publication, run `node .vibetether/bin/vibetether.mjs doctor --project . --boundary <BOUNDARY>`.

Never resume directly from a compacted conversational summary.

The route handshake is machine-owned runtime state, not durable project truth. It proves that a cooperating host selected and disposed a route; it does not prove that outputs are correct. Use current tests, reviews, captures, or other declared evidence for semantic claims.

When `candidate-pending`, `applied`, or `declined` reconciliation succeeds, the handshake records the final Truth disposition and refreshes its execution-end snapshot after the visible Truth action. Later doctor checks compare against that post-decision snapshot. This remains integrity evidence rather than proof that only intended files changed.

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
- a verified first reusable path reaches completion with `experience_feedback` still pending;
- a known Proven Path is ignored without evidence that it is stale or inapplicable.
- a candidate document influences implementation before user-confirmed activation;
- confirmed truth and a Proven Path disagree without a user decision.
