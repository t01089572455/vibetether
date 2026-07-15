# VibeTether Project Routing and Resilient Upgrades Design

Date: 2026-07-15
Status: approved for implementation planning
Audience: VibeTether maintainers and contributors

## 1. Context

VibeTether was created after repeated long-running coding failures with otherwise capable agents:

- a project contained durable rules, but the agent did not reread the applicable source before a later decision;
- the initial request was clarified, then the agent failed to reassess which Skill fit the next lifecycle phase;
- beginners did not know which Skill name to invoke, while experienced users sometimes skipped selection or forgot it during a long task;
- a build, deployment, local-environment, or publication workflow succeeded, but its decisive conditions were not captured and the next task rediscovered the path from scratch;
- on Windows, an active Codex or Claude process could hold the installed VibeTether Skill directory open while `init` attempted an in-place upgrade.

The current product already has project-local truth routing, an automatic readiness gate, advisory capability routing, checkpoints, Proven Path recall, a Success Capture Gate, curated provider installation, and transactional rollback. This change makes those capabilities easier to understand, safer to extend, and harder to forget at phase boundaries.

It also corrects a reproduced Windows recovery defect. When renaming an active Skill directory failed with `EPERM`, the outer transaction recovery removed the target without knowing whether the inner installer had moved it. Windows could then leave the name unavailable while an open directory handle remained, stranding the installed Codex Skill in a transaction backup. The design must preserve the last known-good copy and recover automatically when the lock is released.

## 2. Product Position

The public promise is:

> Long tasks drift. Skills get forgotten. Proven fixes disappear. VibeTether keeps coding agents anchored to project truth, routes each phase to the right Skill, and recalls workflows that already worked.

VibeTether remains a project-local control layer, not a replacement coding agent and not a coercive workflow engine. It improves default behavior, visibility, recovery, and auditability. It does not claim that project instructions are a security sandbox, that every host model will obey every route, or that Token savings have been measured.

The public story may accurately say that project documentation alone is insufficient when an agent does not reread the applicable source at the moment a decision is made. It must not claim that documents are useless or that VibeTether can force model compliance.

## 3. Community Reference Intake

The README information architecture is informed by these public repositories:

| Source | Classification | Adopt | Do not copy |
| --- | --- | --- | --- |
| `obra/superpowers` | rewrite pattern | A plain-language workflow narrative and automatic Skill-trigger explanation | Its complete methodology or enforcement language |
| `mattpocock/skills` | rewrite pattern | Start from concrete agent failure modes and map each to a useful workflow | Personal quotations, prose, or repository-specific commands |
| `Fission-AI/OpenSpec` | rewrite pattern | Show a short real interaction before exhaustive reference material | Its artifact tree or slash-command workflow |
| `github/spec-kit` | architecture reference | Separate managed core, project-local overrides, and reusable extensions | A second specification tree or its extension CLI |
| `bmad-code-org/BMAD-METHOD` | README pattern | Put one simple installation path and next-step guidance near the top | Its agent/module hierarchy |
| `addyosmani/agent-skills` | routing reference | Explain which Skill applies, when, and why; retain verification gates | A competing entry router or duplicate lifecycle Skills |

External references remain lower authority than the approved VibeTether specifications and this design.

## 4. Goals

1. Make the README immediately communicate the lived problem, differentiators, simplest installation path, and a concrete automatic-routing example.
2. Let a project safely route its own installed Skills without editing a generated file or forking VibeTether.
3. Re-enter VibeTether at long-task phase boundaries and record the current route in a mechanically inspectable handshake.
4. Detect missing, stale, unavailable, or unresolved phase routes before a completion-like state.
5. Make active Windows Skill upgrades non-destructive and recoverable on the next `init` after the host releases the lock.
6. Recover the reproduced legacy state where the Codex target is missing but one or more canonical transaction copies remain.
7. Preserve provider provenance, project authority, advisory selection, high-risk gates, experience recall, and customization safety.

## 5. Non-Goals

- No background daemon, model hook framework, forced process termination, or host-specific security claim.
- No automatic download of an arbitrary Skill referenced by a local route.
- No remote community-route marketplace in this release.
- No project-defined weakening of readiness, authority, evidence, security, destructive-data, or release gates.
- No natural-language classifier that silently invents phases, capabilities, or signals.
- No mandatory route query before every small local technical action.
- No measured Token-savings claim.

## 6. README Information Architecture

The main README remains English and becomes a concise product landing page. Detailed reference material moves to focused documents without deleting useful information.

The order is:

1. centered product name, one-line promise, CI/license/release badges;
2. a three-symptom hook: long-task drift, forgotten Skill selection, and lost proven workflows;
3. the most reliable copy-paste installation command;
4. a short “why I built this” paragraph grounded in the maintainer's experience;
5. a 30-second plain-language routing example;
6. a compact feature grid;
7. one small control-loop diagram;
8. project-local custom routing with one wizard command and one YAML example;
9. an honest boundary statement;
10. links to installation, routing, Proven Path, provider, troubleshooting, and contributor references.

The top-level README should explain the product before exposing provider inventories. Full provider tables, the personal acceptance tour, detailed upgrade recovery, and exhaustive troubleshooting move under `docs/` and remain linked.

The simplest interactive command remains the GitHub Codeload tarball form because it bypasses the machine's Git/SSH stack during package acquisition. The maximum reviewed installation remains available immediately below it. The README must not make the shorter `github:` package spec the default while it can fail before the VibeTether CLI starts.

## 7. Project-Local Route Overlay

### 7.1 Ownership and location

Initialization declares an optional project-owned route overlay:

```text
.vibetether/routes.local.yaml
```

The file is never generated, overwritten, deleted, or silently normalized by `init`, `bootstrap`, upgrade, or uninstall. The project manifest records its conventional route when the file exists. The generated `.vibetether/capabilities.yaml` remains a VibeTether-owned base snapshot. `init` and `bootstrap` validate the overlay, while `capabilities`, `route`, the installed resolver, and `doctor` reload and merge the live overlay at query time. A safe manual edit therefore takes effect without regenerating the base board.

### 7.2 Version-one schema

Version one maps an installed project Skill to an existing VibeTether capability. It may introduce project-specific observable signals, additional expected outputs, and additional exit evidence. It may not create a new lifecycle phase or remove the base capability contract.

```yaml
schema_version: 1
routes:
  - id: project-prd-to-issues
    phases: [PLAN]
    capability: planning
    when_any: [prd-approved]
    skill: to-issues
    role: primary
    use_when:
      - A reviewed PRD needs to become actionable issues.
    expected_outputs:
      - scoped-issues
      - acceptance-criteria
      - dependency-order
    exit_evidence:
      - Every approved requirement is mapped to an issue.
```

Required route fields are `id`, `phases`, `capability`, `skill`, and `role`. At least one observable signal is required for a project-local `primary`. `use_when` is required for the human dashboard. Additional outputs and evidence are additive to the base capability contract.

Supported roles are:

- `primary`: preferred when its declared signals match and the Skill is available;
- `alternative`: displayed and selectable without replacing the matching primary;
- `overlay`: adds a non-overlapping domain or policy method to the selected primary.

### 7.3 Skill discovery

Version one references Skills by install name and discovers only project-local regular Skill directories under the enabled harness roots:

- `.agents/skills/<skill>/SKILL.md`;
- `.claude/skills/<skill>/SKILL.md`.

Names must be safe single directory names. Paths cannot traverse outside the project, target a generated provider catalog, or reference a sensitive or linked authority artifact. The overlay never fetches a missing Skill. A missing Skill remains visible as unavailable with the curated fallback intact.

### 7.4 Merge and conflict rules

The merge order is base capability contract, curated provider routes, then validated project routes. A matching available project `primary` may replace the curated recommendation for that capability, but it inherits every base output, exit-evidence, readiness, authority, and high-risk gate.

The merge rejects:

- duplicate local route IDs;
- unknown phases or capabilities;
- unsafe Skill names or paths;
- a `primary` without a signal;
- two equally matching project primaries for the same phase, capability, and signals;
- any attempt to weaken base outputs, exit evidence, fallbacks, readiness, or high-risk confirmation gates;
- a route that claims a Skill installation outside enabled project harness roots.

When a local primary is missing, the resolver uses the curated recommendation or declared built-in fallback and records the reason.

### 7.5 Guided customization

`vibetether customize --project .` is the beginner path. It scans installed project Skills and presents numbered choices for:

1. Skill;
2. existing phase and capability;
3. `primary`, `alternative`, or `overlay` role;
4. one or more observable trigger signals;
5. optional additional outputs and exit evidence;
6. preview and final confirmation.

The recommendation is `alternative` unless the user explicitly chooses to make the Skill primary for a specific signal. Cancellation writes nothing. `--dry-run` previews the overlay change. Advanced users may edit the YAML directly and validate it with `doctor`.

## 8. Phase Route Handshake

### 8.1 Re-entry contract

Managed `AGENTS.md` and `CLAUDE.md` instructions explicitly require VibeTether re-entry:

- at task entry;
- before a consequential action;
- after compaction, resume, handoff, repeated failure, or direction change;
- before a phase transition or next slice;
- before completion, review, merge, release, or publication.

At a phase boundary the agent rereads the manifest and applicable truth, determines one phase and capability from observable facts, resolves the live route, invokes the selected installed Skill or fallback, and requires the route's output and exit evidence before advancing.

### 8.2 Stateful route command

The existing `capabilities` command remains read-only. A new stateful command records the operational decision:

```sh
vibetether route --project . --phase PLAN --capability planning \
  --signal prd-approved --agent codex
```

The command loads the current manifest, curated board, local overlay, live harness availability, checkpoint, and applicable experience. It returns the recommendation, overlays, alternatives, fallback, expected outputs, exit evidence, and selected path. By default it selects the highest-priority available matching primary or fallback.

An installed alternative can be selected explicitly with `--select SKILL --reason TEXT`. The reason is required when departing from the recommendation. The command never installs a Skill.

### 8.3 Machine-owned state

The command writes a machine-owned local state artifact under `.vibetether/state/route-handshake.yaml`:

```yaml
schema_version: 1
phase: PLAN
capability: planning
signals: [prd-approved]
recommended_skill: to-issues
selected_skill: to-issues
selection_source: project-local
expected_outputs: [scoped-issues, acceptance-criteria, dependency-order]
exit_evidence:
  - Every approved requirement is mapped to an issue.
status: active
```

The artifact stores public decision metadata, not private reasoning. It is local checkpoint state and remains ignored by Git. The user- or agent-authored checkpoint continues to hold material decisions, evidence summaries, and `provider_selection`; the route command updates only the bounded machine-owned handshake.

When a new phase route is requested, the prior handshake must be satisfied, explicitly abandoned with a material reason, or remain in the same phase and capability. The agent closes a route with safe evidence references:

```sh
vibetether route complete --project . \
  --evidence "Focused tests exited 0" --artifact test/planning.test.mjs
```

If the approved direction changes or a route becomes inapplicable, the agent records the exception instead of fabricating evidence:

```sh
vibetether route abandon --project . --reason "User replaced the approved design."
```

`complete` requires at least one bounded evidence description and permits repeatable safe project-relative artifact paths. `abandon` requires a non-empty material reason and leaves the next route responsible for re-anchoring. Neither operation proves semantic correctness; it proves only that the required disposition and evidence references were recorded. Fresh tests, runtime output, browser evidence, or remote state remain the authority for success.

### 8.4 Doctor validation

`doctor` reports and, at a completion-like state, rejects:

- `missing-route-handshake`;
- `stale-route-handshake` relative to checkpoint phase;
- `selected-skill-unavailable`;
- `route-source-missing` for a removed local route;
- `ambiguous-local-route`;
- `pending-route-exit` when a new phase or completion is claimed without disposition;
- a selection that no longer matches the effective board and has no material alternative reason.

This turns forgotten phase routing into a visible, testable defect. It still cannot force a host model to call the command if the host ignores project instructions.

## 9. Long-Task Example

For “build a customer portal”:

1. `DISCOVER / requirements-clarification` routes to `grilling` because goal and success evidence are unclear.
2. After the Intent Contract is approved, VibeTether re-enters at `DESIGN / product-design` and routes to `brainstorming` or a matching approved local primary.
3. After design approval, VibeTether re-enters at `PLAN / planning` and routes to `writing-plans` or a project `to-issues` route when `prd-approved` matches.
4. Each approved execution slice re-enters at `EXECUTE_ONE`; `executing-plans` owns plan execution and `test-driven-development` owns new-behavior or bug-fix evidence.
5. `VERIFY` routes to `verification-before-completion`; matching Proven Paths are returned before repeatable operational work.
6. `REVIEW` and `SHIP` resolve their own routes and gates rather than inheriting the first task-entry decision.

The chain is phase-aware; it is not a hard-coded sequence of Skill names.

## 10. Windows Active-Skill Upgrade Recovery

### 10.1 Failure model

On Windows an active host, filesystem watcher, antivirus process, or indexer may hold a directory handle that prevents rename or name reuse. A self-upgrade cannot safely force the handle closed. The installer must never treat `EPERM` as authorization to remove the last known-good target.

### 10.2 Pending-upgrade state

Before replacing an existing canonical VibeTether Skill, initialization creates a verified transaction record with:

- enabled harness and target path;
- previous canonical identity and transaction-copy path;
- replacement canonical identity and staged replacement path;
- transaction state;
- timestamps used only for diagnostics, not authority;
- no credentials or sensitive output.

If target rename or replacement commit returns `EPERM`, `EACCES`, or a Windows sharing violation:

1. preserve or restore the target if it remains addressable;
2. preserve the transaction copy and complete staged replacement under `.vibetether/pending/`;
3. record `waiting-for-host-release`;
4. stop before unrelated Skill or text commits advance further;
5. explain that the active Codex/Claude workspace must close, then the same `init` command can be rerun.

No background process waits indefinitely. VibeTether does not terminate Codex, Claude, antivirus, indexers, or user processes.

### 10.3 Recovery on the next init

Before planning new writes or provider fetches, `init` inspects pending and legacy transaction state:

- if the canonical old target still exists, verify it and retry the pending replacement;
- if the target is missing and a new transaction manifest identifies a verified old copy, restore or replace it transactionally;
- for legacy 0.2.3 orphan directories without a manifest, consider only registered canonical VibeTether identities;
- if multiple legacy candidates exist, prefer the candidate whose identity exactly matches the enabled peer harness; otherwise stop and show explicit recovery choices;
- never infer authority from a directory timestamp alone;
- never restore an unknown or modified copy automatically.

If the namespace remains locked, recovery leaves every verified copy intact and returns the same actionable waiting state. Once the lock is released, rerunning `init` completes recovery and the requested upgrade without provider refetch when exact provider caches remain valid.

### 10.4 Doctor behavior

Doctor distinguishes:

- `pending-skill-upgrade`: a known-good target remains and a replacement awaits host release;
- `recoverable-missing-skill`: the target is missing but a verified transaction copy is authoritative;
- `ambiguous-recovery`: multiple candidates cannot be resolved safely;
- `unrecoverable-skill-state`: no canonical target or verified backup exists.

Messages show one recommended next action. Raw OS stack traces and internal temporary names remain optional diagnostics, not the primary user instruction.

## 11. Transaction and Ownership Safety

- Text changes, route-overlay discovery, Skill replacement, pending state, provider lock, and capability board remain one reviewed initialization plan.
- A local route file is user-owned; VibeTether may validate and read it but never replace it.
- Generated boards and machine state are VibeTether-owned.
- Existing modified Skills remain protected from overwrite and uninstall.
- A pending replacement is applied only if its source identity, target, old-copy identity, and release registry still agree.
- Provider repositories remain pinned and license-checked; local routes do not weaken provider provenance.
- All recovery paths reject symlinks, unsafe traversal, sensitive files, and unknown identities.

## 12. Compatibility and Migration

- Existing projects without `routes.local.yaml` retain the same effective curated routes.
- Existing `capabilities` queries remain read-only and compatible.
- `core`, `standard`, `extended`, `web`, and `production` behavior remains unchanged unless a validated project route matches.
- Existing managed instruction blocks upgrade through the registered release-identity mechanism.
- Existing checkpoints without route-handshake state remain readable. Doctor recommends establishing a handshake at the next consequential phase; it does not invent historical route evidence.
- The reproduced gyws state is recoverable because the missing Codex target has a registered canonical transaction copy matching the enabled Claude peer identity.

## 13. Verification Strategy

Implementation uses test-driven development. Required evidence includes:

### Route overlay

- parse and validate a minimal local primary, alternative, and overlay;
- inherit base outputs, exit evidence, fallback, readiness, and high-risk gates;
- deterministic local-primary selection when signals match;
- curated fallback when the custom Skill is missing;
- conflict rejection for duplicates, ties, unknown capabilities, unsafe names, and weakening attempts;
- preservation across init, bootstrap, upgrade, and uninstall;
- interactive customization choice, invalid input, preview, confirmation, and cancellation coverage.

### Phase handshake

- route command resolution and live availability;
- custom and curated selection sources;
- explicit alternative with required reason;
- active, satisfied, abandoned, stale, unavailable, and missing-source states;
- checkpoint-phase and handshake-phase doctor validation;
- applicable Proven Path metadata remains present in route output;
- no private reasoning or sensitive data is persisted.

### Windows recovery

- target-rename `EPERM` leaves the original target intact;
- replacement-commit `EPERM` preserves old and new verified copies;
- outer rollback never blindly removes a target after an inner failure;
- missing target plus one authoritative transaction copy recovers;
- multiple legacy copies resolve through exact peer-harness identity or stop as ambiguous;
- a second run after simulated handle release completes the upgrade;
- providers are not refetched when exact verified caches remain valid;
- error messages contain one actionable restart/retry path.

### Public delivery

- full unit and contract suite;
- static routing evaluations;
- acceptance tour;
- package audit and Skill self-validation;
- Windows and Ubuntu on Node 20 and Node 24;
- fresh install from the final public GitHub tarball;
- custom-route and phase-handshake acceptance from the published package;
- locked-upgrade and released-lock recovery acceptance in a disposable Windows project;
- final remote commit and GitHub CI confirmation.

The active gyws Codex directory cannot be safely replaced by the same running Codex process. After the fixed release is published, the real workspace recovery requires closing the Codex and Claude sessions that hold the project, then rerunning the documented command. Disposable projects provide repeatable automated lock evidence before publication.

## 14. README Claims Boundary

The README may claim that VibeTether:

- instructs supported project agents to re-anchor at declared triggers;
- deterministically resolves curated and project-local routes;
- makes missing phase handshakes visible to doctor;
- captures and recalls reusable Proven Paths through project-local metadata;
- safely defers active Windows upgrades and resumes after lock release;
- is designed for beginners who should not need to know every Skill name.

It must also state that host invocation remains instruction-dependent, semantic success still requires real evidence, a first provider download still requires network access, and a locked running host must release its Skill directory before replacement can commit.

## 15. Acceptance Criteria

The change is complete only when:

1. A first-time reader can identify the problem, copy the recommended command, understand automatic routing, and find custom routing without reading the provider catalog.
2. A project can add an installed local Skill to an existing capability through a guided command or user-owned YAML without modifying generated files.
3. The resolver selects that Skill only for declared matching signals and preserves every base safety/evidence contract.
4. A long task can record a fresh route handshake at each phase, and doctor detects missing or stale handshakes before completion.
5. The README's `grilling -> design -> planning -> TDD -> verify` example matches executable registry and CLI behavior.
6. An active Windows self-upgrade never removes the last known-good Skill and produces one clear close-and-rerun instruction.
7. A rerun after handle release completes a pending upgrade automatically.
8. The reproduced missing-Codex-target state can be recovered from a registered canonical transaction copy without choosing by timestamp alone.
9. Existing projects without local routes retain their previous effective route behavior.
10. Full local, package, published-package, and remote CI evidence passes with no unresolved doctor disposition.
