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
vibetether capabilities --project .
```

Start an inspectable route handshake:

```sh
vibetether route --project . --phase PLAN --capability planning --signal multi-step-change --agent codex
```

The result names the recommendation, selected Skill or built-in fallback,
selection source, detected signals, required outputs, and exit evidence. An
alternative can be selected only with a material reason:

```sh
vibetether route --project . --phase PLAN --capability planning --signal approved-refactor --select request-refactor-plan --reason "The approved task is specifically a staged refactor."
```

Close it with bounded evidence and optional safe project-relative artifacts:

```sh
vibetether route complete --project . --evidence "The plan has bounded slices and verification commands." --artifact docs/plan.md
```

Or abandon it honestly:

```sh
vibetether route abandon --project . --reason "A new product decision invalidated the plan."
```

The handshake prevents silently entering a different phase while the old route
is active. It proves selection and disposition, not private reasoning or the
semantic quality of the work.

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
vibetether customize --project .
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

## Authority and safety

Project routes are additive and advisory. They cannot weaken project authority,
readiness, required evidence, high-risk confirmation, destructive-data,
permission, security, privacy, merge, release, deployment, or publication gates.
An installed provider never becomes project authority.

Automatic phase re-entry is a behavioral control, not a privileged hook. The
host agent must cooperate with `AGENTS.md` or `CLAUDE.md`; VibeTether cannot force
an arbitrary host to read files or invoke a Skill.
