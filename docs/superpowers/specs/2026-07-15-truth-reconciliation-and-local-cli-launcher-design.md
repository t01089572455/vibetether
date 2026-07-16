# Truth Reconciliation, Execution Anchoring, and Project-local CLI

## Goal

Prevent a long-running task from being declared complete, handed off, merged, or
released after a consequential route changed the project's known state but the
Agent never decided whether confirmed truth needs an update. Record which
project-contained execution root and Git worktree a route actually used. Give
every initialized project a stable CLI entry and an observable version baseline
without requiring a global npm installation.

This design addresses the observed failure mode where `state/current.yaml`
advanced while a project-authored `TRUTH.md` still asserted an older worktree
head and integration status.

## Non-goals

- Do not have VibeTether infer or rewrite arbitrary natural-language facts.
- Do not silently modify confirmed truth, activate candidates, or override a
  project-author's edits.
- Do not install a global executable, add a project dependency, start a daemon,
  or enforce a Subagent policy.
- Do not add a process lease or lock file. The existing active-route guard and
  transactional route/checkpoint writes remain the concurrency boundary.
- Do not claim that the launcher works offline or removes npm, GitHub, TLS, and
  network dependencies.
- Do not turn every routine edit or test into a reconciliation gate.

## Design

### 1. Route instance and truth reconciliation state

Every new route receives a random `route_instance_id`. `route_id` continues to
identify the capability-board rule; it is not used as a transaction identity.
An idempotent refresh of the same active phase/capability preserves the current
instance ID, original authority snapshot, and original execution snapshot. It
may refresh routing availability, but it must not re-anchor changes that
occurred after the route began. A later route using the same rule receives a new
instance ID.

Add a strict `truth_reconciliation` object to the runtime checkpoint. It records
only the disposition of a consequential route, never a hidden semantic verdict:

```yaml
truth_reconciliation:
  status: pending # unknown | pending | no_material_change | candidate_pending | applied | declined
  trigger: route-complete
  route_instance_id: 38e23872-0692-43db-ae71-086746a34d3a
  reason: null
  candidate_path: null
  updated_at: 2026-07-15T00:00:00.000Z
```

`route complete` and `route abandon` create `pending` through the existing
atomic route/checkpoint write. A new route cannot replace an unresolved
`pending` or `candidate_pending` disposition. A new `vibetether truth
reconcile` command requires exactly one explicit disposition:

- `--decision no-material-change --reason <reason>` records that the completed
  route did not alter confirmed project truth and fails if the anchored
  authority fingerprints changed;
- `--decision candidate-pending --candidate <safe-project-relative-path>
  --reason <reason>` records an existing, safe, non-sensitive proposal that is
  still non-authoritative and requires that path in the Truth Map candidate
  section;
- `--decision applied --candidate <safe-project-relative-path> --reason
  <reason>` is valid only after the user has confirmed the governing path,
  role, scope, and supersession and the Agent has updated project-owned truth;
- `--decision declined --candidate <safe-project-relative-path> --reason
  <reason>` records that the user declined the proposed truth change and
  requires that path in the Truth Map declined section.

For the common low-friction case, `route complete` and `route abandon` accept
`--truth-decision no-material-change --truth-reason <reason>`. The inline
decision is valid only when the full anchored authority snapshot still matches;
otherwise the route exits with `pending` and the Agent must use the visible
reconciliation flow. User-confirmed candidate, applied, and declined decisions
remain separate commands.

The command does not write `TRUTH.md`. Candidate creation and confirmed-truth
editing remain visible Agent work governed by the existing user-confirmation
protocol. `candidate-pending` is deliberately not a completion disposition.
`applied`, `candidate-pending`, and `declined` refresh the authority snapshot
only after their declared user-visible truth action; `no-material-change`
proves the prior snapshot still matches rather than hiding drift.

Authority snapshots separate the full Truth Map file fingerprint from a
canonical projection of only the confirmed entries (`path`, `role`, `scope`,
and order) plus their source-content fingerprints. Candidate-only or
declined-only changes remain visible as Truth Map metadata changes but do not
masquerade as confirmed authority drift. An `applied` reconciliation refreshes
both projections after the user-confirmed active change.

### 2. Doctor gate

`doctor` reports reconciliation state as a separate truth-control result:

- a missing or malformed object is an actionable warning for legacy projects;
- `pending` is a warning during ordinary execution and an error for
  completion-like, handoff, merge, release, or publication state;
- `candidate-pending` is an error for those same boundaries until the user
  confirms or declines it;
- `no_material_change`, `applied`, and `declined` are healthy when their route
  instance ID matches the current route disposition.

The CLI accepts `doctor --boundary ordinary|completion|handoff|merge|deployment|
release|publication`. `ordinary` is the default. `REVIEW` and `SHIP` checkpoint
phases remain completion-like even without an explicit flag. Managed
instructions pass the actual boundary before claiming completion, handoff,
merge, deployment, release, or publication.

This is a reconciliation prompt, not a free-text truth parser. Existing route
authority fingerprints still detect byte changes to confirmed truth after a
route starts. The new state closes the opposite gap: a route changed current
work but no decision was made about whether truth must change.

### 3. Execution-root and worktree snapshot

`route` accepts an optional `--execution-root <PATH>` and defaults it to the
project root. The path must resolve to a directory inside the declared project.
At route start and route completion or abandonment, VibeTether records:

- the portable project-relative execution root;
- whether Git metadata is available;
- the Git worktree root, relative to the project;
- the current `HEAD`, when one exists;
- a SHA-256 digest of `git status --porcelain=v1 -z --untracked-files=all`;
- a SHA-256 working-tree digest that also hashes the bytes of changed and
  untracked paths without persisting their contents.

Doctor rechecks the completed snapshot. A changed root, worktree, `HEAD`, or
status digest is attention during ordinary work and an error at a completion
boundary. Non-Git projects remain supported and receive no false Git error.
This does not inspect diffs, infer correctness, or prevent the Agent from using
worktrees; it makes the actual execution location observable.

### 4. Project-local launcher and version baseline

During `init`, write a VibeTether-owned, zero-dependency Node launcher at:

```text
.vibetether/bin/vibetether.mjs
```

It forwards arguments to the documented portable Codeload `npx --yes
--package=... vibetether` form, selecting `npx.cmd` on Windows. Its default
package is the immutable release tag matching `expected_version`, not the
moving `main` branch. The launcher accepts `VIBETETHER_CLI_PACKAGE` as an
explicit override for controlled installations. It is not a global
installation and does not create `node_modules`, modify a project's package
manifest, run a background process, or guarantee offline execution.

The manifest records the launcher path, its managed SHA-256, the acquisition
package, and the expected VibeTether release version. `doctor` compares the
running CLI version and launcher bytes with that baseline. A mismatch is
attention during ordinary execution and an error at a completion boundary.

Managed `AGENTS.md` and `CLAUDE.md` instructions use:

```text
node .vibetether/bin/vibetether.mjs doctor --project . --json
```

and the same launcher for stateful `route` and reconciliation commands. `init`
runs one in-process doctor inspection after writing the control plane and
reports the initial result. The public documentation retains the complete
portable `npx` command as the acquisition and recovery fallback.

### 5. Upgrade and ownership

The launcher is a managed control artifact. Initial installation writes it
atomically; upgrades preserve a different or modified launcher and report an
actionable recovery message instead of overwriting it. Legacy projects without a
launcher are upgraded only through the existing safe `init` transaction.

The migration is additive: legacy checkpoints receive no invented historical
reconciliation decision. They receive an `unknown` attention result until their
next stateful route establishes a fresh disposition.

## Error handling

- Missing Node or `npx` causes the launcher to return a concise actionable error;
  it never pretends `doctor` ran.
- Failure to start the portable CLI preserves the child exit code and does not
  mutate checkpoint or truth state.
- Unsafe candidate paths, oversized reasons, malformed checkpoint data, and a
  reconciliation attempt that does not belong to the current route fail closed.
- Missing, external, linked, or non-directory execution roots fail before route
  state is written.
- Route/checkpoint/reconciliation writes remain transactionally paired so a
  partial failure restores both files.

## Verification

1. Red tests prove `doctor` blocks a completion-like checkpoint after an
   unresolved route reconciliation, while ordinary execution receives a visible
   warning.
2. Tests prove each allowed disposition, route-instance matching, malformed
   state, safe candidate path behavior, and unresolved-state transition guards.
3. Tests prove execution-root containment, Git worktree/HEAD/status capture,
   post-route drift reporting, and non-Git compatibility.
4. Init tests prove launcher creation, managed-instruction command rendering,
   version and integrity diagnostics, upgrade preservation, and no project
   package-manifest or global-install mutation.
5. A disposable real initialization executes the local launcher for `doctor`,
   starts and closes a route, proves the pending gate, resolves it, and confirms
   a healthy completion-boundary doctor result.
6. A legacy-project migration establishes `unknown` without inventing history.
7. The complete test/eval/release-history suite and package dry-run remain green.

## Self-review

The gate is deliberately narrow: it requires an explicit reconciliation decision
at consequential route boundaries but does not claim to understand all project
prose. A user remains the authority for confirmed truth. The launcher provides a
repeatable command path without global state, but host cooperation remains
necessary; it is not described as a daemon, offline bundle, or guaranteed
automatic execution. The existing active route is the lightweight logical
writer boundary; adding a second process-level lease without reliable host
session identity would create more stale-state risk than it removes.
