# Truth Reconciliation and Project-local CLI Launcher

## Goal

Prevent a long-running task from being declared complete, handed off, merged, or
released after a consequential route changed the project's known state but the
Agent never decided whether confirmed truth needs an update. Give every
initialized project a deterministic CLI entry without requiring a global npm
installation.

This design addresses the observed failure mode where `state/current.yaml`
advanced while a project-authored `TRUTH.md` still asserted an older worktree
head and integration status.

## Non-goals

- Do not have VibeTether infer or rewrite arbitrary natural-language facts.
- Do not silently modify confirmed truth, activate candidates, or override a
  project-author's edits.
- Do not install a global executable, add a project dependency, start a daemon,
  or enforce a Subagent policy.
- Do not turn every routine edit or test into a reconciliation gate.

## Design

### 1. Truth reconciliation state

Add a strict `truth_reconciliation` object to the runtime checkpoint. It records
only the disposition of a consequential route, never a hidden semantic verdict:

```yaml
truth_reconciliation:
  status: pending # pending | no_material_change | candidate_pending | applied | declined
  trigger: route-complete
  route_id: catalog-example-plan
  reason: null
  candidate_path: null
  updated_at: 2026-07-15T00:00:00.000Z
```

`route complete` and `route abandon` create `pending` after their existing
atomic route/checkpoint write. A new `vibetether truth reconcile` command
requires exactly one explicit disposition:

- `--decision no-material-change --reason <reason>` records that the completed
  route did not alter confirmed project truth;
- `--decision candidate-pending --candidate <safe-project-relative-path>
  --reason <reason>` records a proposed, still non-authoritative truth update;
- `--decision applied --reason <reason>` is valid only after the user has
  confirmed the candidate and the Agent has updated project-owned truth;
- `--decision declined --reason <reason>` records that the user declined the
  proposed truth change.

The command does not write `TRUTH.md`. Candidate creation and confirmed-truth
editing remain visible Agent work governed by the existing user-confirmation
protocol. `candidate-pending` is deliberately not a completion disposition.

### 2. Doctor gate

`doctor` reports reconciliation state as a separate truth-control result:

- a missing or malformed object is an actionable warning for legacy projects;
- `pending` is a warning during ordinary execution and an error for
  completion-like, handoff, merge, release, or publication state;
- `candidate-pending` is an error for those same boundaries until the user
  confirms or declines it;
- `no_material_change`, `applied`, and `declined` are healthy when their route
  ID matches the current route disposition.

This is a reconciliation prompt, not a free-text truth parser. Existing route
authority fingerprints still detect byte changes to confirmed truth after a
route starts. The new state closes the opposite gap: a route changed current
work but no decision was made about whether truth must change.

### 3. Project-local launcher

During `init`, write a VibeTether-owned, zero-dependency Node launcher at:

```text
.vibetether/bin/vibetether.mjs
```

It forwards arguments to the documented portable Codeload `npx --yes
--package=... vibetether` form, selecting `npx.cmd` on Windows. The launcher
accepts `VIBETETHER_CLI_PACKAGE` as an explicit override for controlled
installations. It is not a global installation and does not create
`node_modules`, modify a project's package manifest, or run a background
process.

Managed `AGENTS.md` and `CLAUDE.md` instructions use:

```text
node .vibetether/bin/vibetether.mjs doctor --project . --json
```

and the same launcher for stateful `route` and reconciliation commands. `init`
runs one local doctor inspection after writing the control plane and reports the
initial result. A user can opt out with `--no-cli-launcher`; the managed
instructions then retain the complete portable `npx` fallback rather than an
unresolvable bare `vibetether` command.

### 4. Upgrade and ownership

The launcher is a managed control artifact. Initial installation writes it
atomically; upgrades preserve a different or modified launcher and report an
actionable recovery message instead of overwriting it. Legacy projects without a
launcher are upgraded only through the existing safe `init` transaction.

The migration is additive: legacy checkpoints receive no invented historical
reconciliation decision. They receive an `unknown`/attention doctor result until
their next stateful route establishes a fresh disposition.

## Error handling

- Missing Node or `npx` causes the launcher to return a concise actionable error;
  it never pretends `doctor` ran.
- Failure to start the portable CLI preserves the child exit code and does not
  mutate checkpoint or truth state.
- Unsafe candidate paths, oversized reasons, malformed checkpoint data, and a
  reconciliation attempt that does not belong to the current route fail closed.
- Route/checkpoint/reconciliation writes remain transactionally paired so a
  partial failure restores both files.

## Verification

1. Red tests prove `doctor` blocks a completion-like checkpoint after an
   unresolved route reconciliation, while an ordinary execution checkpoint
   receives a visible warning.
2. Tests prove each allowed disposition, route-ID matching, malformed state, and
   safe candidate path behavior.
3. Init tests prove launcher creation, managed-instruction command rendering,
   opt-out fallback, upgrade preservation, and no project package-manifest or
   global-install mutation.
4. A disposable real initialization executes the local launcher for `doctor`,
   starts and closes a route, proves the pending gate, resolves it, and confirms a
   healthy doctor result.
5. The complete test/eval/release-history suite and package dry-run remain green.

## Self-review

The gate is deliberately narrow: it requires an explicit reconciliation decision
at consequential route boundaries but does not claim to understand all project
prose. A user remains the authority for confirmed truth. The launcher provides a
repeatable command path without global state, but host cooperation remains
necessary; it is not described as a daemon or guaranteed automatic execution.
