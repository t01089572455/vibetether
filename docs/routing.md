# Routing and Phase Re-entry

VibeTether is a stateful advisory router. It does not force one giant workflow.
It combines the current lifecycle phase, requested capability, observable
signals, installed Skill availability, project truth, and any project-local
routes to select one primary method plus non-conflicting overlays.

## When the agent must re-enter

The managed project instructions tell a cooperating host to reload VibeTether at:

- task entry;
- every consequential phase change;
- compaction, resume, or handoff;
- repeated failure or a material direction change;
- selection of the next slice;
- completion, merge, release, or publication.

Re-entry reloads `.vibetether/project.yaml`, `.vibetether/TRUTH.md`, the Intent
Contract, the current checkpoint, only applicable confirmed truth sources,
`.vibetether/routes.local.yaml` when present, and matching Proven Path metadata.
Candidates remain non-authoritative. This is more reliable than assuming the
first prompt or an old conversation summary is still complete.

## Route one phase

Inspect the dashboard:

```sh
node .vibetether/bin/vibetether.mjs capabilities --project .
```

Start an inspectable route handshake:

```sh
node .vibetether/bin/vibetether.mjs route --project . --execution-root . --phase PLAN --capability planning --signal multi-step-change --agent codex
```

The route phase must match the current semantic checkpoint phase in
`.vibetether/state/current.yaml`. At a real phase transition, re-anchor and
update that checkpoint first; then run the matching route command. This prevents
a new route from silently disagreeing with the resumable project state.

The result names the recommendation, selected Skill or built-in fallback,
selection source, detected signals, required outputs, and exit evidence. An
alternative can be selected only with a material reason:

```sh
node .vibetether/bin/vibetether.mjs route --project . --execution-root . --phase PLAN --capability planning --signal approved-refactor --select request-refactor-plan --reason "The approved task is specifically a staged refactor."
```

Close it with bounded evidence and optional safe project-relative artifacts:

```sh
node .vibetether/bin/vibetether.mjs route complete --project . \
  --evidence "The plan has bounded slices and verification commands." \
  --artifact docs/plan.md \
  --truth-decision no-material-change \
  --truth-reason "The plan changed, but confirmed project authority did not."
```

Or abandon it honestly:

```sh
node .vibetether/bin/vibetether.mjs route abandon --project . \
  --reason "The selected method cannot satisfy the approved direction." \
  --truth-decision no-material-change \
  --truth-reason "Changing the method did not change confirmed authority."
```

The handshake prevents silently entering a different phase while the old route
is active. It proves selection and disposition, not private reasoning or the
semantic quality of the work.

If confirmed authority may have changed, omit the inline decision. Move the
relevant path through the user-confirmed `TRUTH.md` lifecycle, then record one
matching disposition:

```sh
node .vibetether/bin/vibetether.mjs truth reconcile --project . \
  --decision candidate-pending \
  --candidate docs/proposed-direction.md \
  --reason "The candidate is waiting for the user's activation decision."
```

`truth reconcile` accepts `no-material-change`, `candidate-pending`, `applied`,
or `declined`. It validates authority fingerprints and Truth Map membership; it
does not edit `TRUTH.md`. Candidate paths may be regular files or project
directories. Candidate and declined decisions require confirmed authority to
remain unchanged; `applied` may re-anchor only its declared confirmed path.
Additional confirmed-source or Intent changes require a separate consequential
route.

For `candidate-pending`, `applied`, and `declined`, successful reconciliation
updates the handshake's final Truth disposition and refreshes its execution-end
snapshot after the visible Truth action. Doctor therefore compares the
post-decision worktree at later boundaries. The snapshot is integrity evidence,
not semantic proof that no unrelated change occurred; current tests, review, and
declared artifacts still own that claim.

### What the CLI writes—and what it does not

The project-local `route` command writes the current route snapshot to
`.vibetether/state/route-handshake.yaml` and synchronizes provider selection in
`.vibetether/state/current.yaml`. Every start gets a unique route instance and
captures the real project-contained execution root. When Git is available, the
snapshot includes worktree, ref, HEAD, status, and content-sensitive dirty-tree
fingerprints. `route complete` replaces that snapshot's active status with
`satisfied` plus bounded evidence and optional safe project-relative artifacts;
`route abandon` replaces it with `abandoned` and a material reason. The file is
the latest route disposition, not a background history or semantic proof.

No executed command means no CLI route snapshot. The phase re-entry instructions
in `AGENTS.md` or `CLAUDE.md` remain behavioral guidance that a cooperating host
Agent follows; VibeTether cannot secretly run a daemon, force a host to reread a
file, or claim that every Agent action created a record.

Before a completion-like boundary, pass the actual lifecycle boundary:

```sh
node .vibetether/bin/vibetether.mjs doctor --project . --boundary handoff --json
```

Pending Truth reconciliation, execution drift after route exit, and a project
CLI version mismatch are attention during ordinary work and block applicable
completion, handoff, merge, deployment, release, or publication boundaries.

## Automatic phase example

| Situation | Phase and capability | Typical primary |
| --- | --- | --- |
| Vague goal or missing acceptance | `DISCOVER / requirements-clarification` | `grilling` |
| Approved intent needs alternatives | `DESIGN / product-design` | `brainstorming` |
| Approved direction needs slices | `PLAN / planning` | `writing-plans` |
| Unexpected behavior | `EXECUTE / bug-diagnosis` | `systematic-debugging` |
| Approved behavior change | `EXECUTE / implementation` | execution route plus test-first method |
| About to claim completion | `VERIFY / completion-verification` | `verification-before-completion` |

Routes are determined from inspectable fields and observable signals. VibeTether
does not score hidden reasoning or claim a probability that a model will comply.

## Project-local routes

Run the guided editor after installing a project Skill:

```sh
node .vibetether/bin/vibetether.mjs customize --project .
```

It writes the project-owned `.vibetether/routes.local.yaml` and registers it in
the manifest. The three roles are:

- `primary`: preferred only for matching observable signals;
- `alternative`: selectable without replacing the curated default;
- `overlay`: an additive policy or domain method that does not own the phase.

Example:

```yaml
schema_version: 1
routes:
  - id: project-to-issues-planning
    phases: [PLAN]
    capability: planning
    when_any: [prd-approved]
    skill: to-issues
    role: primary
    use_when:
      - Turn an approved PRD into independently claimable issues.
    expected_outputs: [scoped-issues]
    exit_evidence:
      - Each issue has scope, dependencies, and acceptance evidence.
```

The file is re-read live; safe edits do not require reinitialization. Schema,
path, Skill name, capability, phase, duplicate-ID, and competing-primary errors
fail closed. A missing local primary is reported and falls back to the curated
route rather than blocking all work.

### Agent-assisted project routes

You can let an Agent discover candidates without granting it silent authority.
Ask it: “Inspect my installed project Skills, explain each relevant candidate's
source and role, propose one smallest-scope route with phase, capability,
observable signals, role, output, and exit evidence, show the
`routes.local.yaml` diff, and wait for my confirmation before writing.”

The Agent may read the resulting live board with `capabilities` and propose a
signal-matched `route` handshake. User confirmation is still required before it
writes or replaces project-owned route configuration.

## Authority and safety

Project routes are additive and advisory. They cannot weaken project authority,
readiness, required evidence, high-risk confirmation, destructive-data,
permission, security, privacy, merge, release, deployment, or publication gates.
An installed provider never becomes project authority.

Automatic phase re-entry is a behavioral control, not a privileged hook. The
host agent must cooperate with `AGENTS.md` or `CLAUDE.md`; VibeTether cannot force
an arbitrary host to read files or invoke a Skill.
