# VibeTether Beginner-First README Refresh Design

**Status:** Ready for user review
**Date:** 2026-07-15
**Scope:** Public README and documentation contract only; no runtime or routing behavior change

## 1. Problem

The current README accurately describes VibeTether's mechanisms, but its opening no longer preserves the user's original product thesis strongly enough. The project-control-plane implementation has become the headline, while the motivating user problem is delayed or fragmented:

- strong coding Agents can still drift as tasks and context grow;
- project rules and approved direction may stop governing after compaction, resume, or phase changes;
- beginners may not know which Skill exists or when to invoke it;
- experienced users may still skip Skill selection or forget it during a long task;
- a workflow that succeeded once may be rediscovered from scratch and fail again;
- rigid workflow enforcement would undermine the technical autonomy that makes modern Agents useful.

The README also says users may edit VibeTether's project files without showing enough safe, copyable examples or distinguishing user-owned semantic files from generated runtime files.

## 2. Original Product Thesis

VibeTether is not primarily a file manager or a generic workflow engine. It is a beginner-friendly entry Skill for long-running Codex and Claude work.

Its purpose is to help a capable Agent, at the moments that matter:

1. re-check the user-owned goal;
2. reread applicable project rules and confirmed truth;
3. decide whether the task is ready or still depends on a user decision;
4. recommend an appropriate installed Skill without requiring the user to know Skill names;
5. preserve phase, evidence, and the current bounded slice through context loss;
6. recall a workflow that already succeeded before rediscovering it;
7. stop expensive directional rework before it spreads.

The Agent remains autonomous for low-risk, reversible technical work inside an unchanged approved slice. VibeTether re-enters at task, goal, phase, risk, authority, source, compaction, handoff, completion, deployment, and release boundaries rather than before every individual edit or test.

The implementation is a project-local control plane for intent, truth, routing, state, evidence, and experience. That is the mechanism supporting the promise, not the first-line product story.

## 3. Audience and Voice

The primary audience is a beginner who can describe a project in ordinary language but does not know the available Skill catalog or a mature development workflow. The secondary audience is an experienced Agent user who wants less long-task drift and less repeated operational discovery.

The voice must be direct, practical, and respectful of strong Agents. It must not imply that Codex or Claude is weak, that every task needs ceremony, or that VibeTether guarantees compliance.

## 4. Approved Opening

The README will open with:

```markdown
# VibeTether

> Strong agents can build fast. Long tasks still drift.

VibeTether is a beginner-friendly entry Skill for long-running Codex and
Claude projects. At the moments that matter, it helps the Agent re-check the
goal, reread project rules, decide whether the work is ready, choose the right
installed Skill, and recall workflows that already worked.

You do not need to memorize Skill names or manage a rigid workflow.
VibeTether turns recurring lessons from experienced developers into a
project-local guidance layer—so capable Agents stay autonomous without
quietly drifting into expensive rework.
```

The control-plane wording appears after the beginner promise:

```markdown
Under the hood, VibeTether provides a project-local control plane for intent,
truth, routing, checkpoints, evidence, and proven workflows.
```

## 5. README Information Architecture

The README will use this order:

1. approved beginner-first opening and badges;
2. easiest one-command installation;
3. concise `What's new in 0.4` capability summary;
4. a 30-second ordinary-language example showing automatic phase routing;
5. the original motivation and community-practice basis;
6. the project control-plane artifact map;
7. `Manage VibeTether your way` with Agent-assisted and direct-management paths;
8. the existing control loop, routing, customization, Proven Path, providers, verification, and honest limits;
9. links to complete reference documentation.

The README remains scannable. Complete schemas stay in dedicated documents; the README contains the smallest copyable examples that let a beginner act safely.

## 6. What's New in 0.4

The new-feature block must make these shipped capabilities visible:

1. fresh initialization creates a blank truth registry and never silently activates PRDs, ADRs, or similarly named files;
2. the Agent may find and explain truth candidates, but candidates remain non-authoritative;
3. active additions, removals, moves, role changes, scope changes, and supersession require user confirmation;
4. documents produced during a discussion still enter as candidates;
5. relevant truth is reread at meaningful long-task boundaries, while an unchanged low-risk slice avoids repeated full reloads;
6. route entry fingerprints confirmed authority so later source drift becomes visible;
7. confirmed truth cannot be silently overridden by an old Proven Path; unresolved conflicts return to the user;
8. a reusable first success becomes a sanitized candidate and requires confirmation before active indexing;
9. route state and the semantic checkpoint update together, with rollback on partial write failure;
10. `doctor` reports health for bootstrap, intent, truth, state, routing, experience, and providers;
11. the artifacts operate as one coordinated project control plane, not an isolated Skill lookup table.

## 7. Management Tutorial

The tutorial follows the selected compact approach: common operations in the README, complete schemas in linked guides.

### 7.1 Ownership table

| Artifact | Ownership | Beginner action |
| --- | --- | --- |
| `.vibetether/TRUTH.md` | User-owned authority registry | Edit directly or ask the Agent; every active authority change is an explicit user decision |
| `.vibetether/intent.md` | User-owned direction with integrity metadata | Use `vibetether bootstrap --project .` or ask the Agent to propose the change; confirm directional changes |
| `.vibetether/routes.local.yaml` | User-owned live route overlay | Use `vibetether customize --project .` or edit the validated YAML directly |
| Proven Path documents | User-owned reusable procedures | Edit the referenced runbook or executable artifact; never include secrets |
| `.vibetether/experience-index.yaml` | Strict metadata index | Prefer an Agent-generated sanitized candidate; confirm before active indexing |
| `.vibetether/project.yaml` | CLI-maintained topology | Inspect, but normally repair or update through `vibetether init` |
| `.vibetether/capabilities.yaml` | Generated capability board | Inspect with `vibetether capabilities`; do not use as the project-local override |
| `.vibetether/state/current.yaml` and route handshake | Agent/CLI runtime state | Inspect for diagnosis; normally let route and checkpoint commands maintain them |
| Managed `AGENTS.md` / `CLAUDE.md` block | CLI-maintained host entry | Edit project prose outside the markers; rerun `init` to repair the managed block |

### 7.2 Copyable examples

The README will include:

- a valid `TRUTH.md` candidate entry with `path`, `role`, `scope`, and reason;
- the exact natural-language request for candidate discovery and one-at-a-time activation;
- `vibetether bootstrap --project .` plus an example request to change goal, success evidence, constraints, or visual direction;
- `vibetether customize --project .` and one minimal local route example;
- an experience workflow showing a sanitized runbook first, an index candidate second, user confirmation third, and `doctor` verification last;
- `vibetether doctor --project . --json` after active control changes.

The README must not tell users to hand-edit canonical Intent Contract metadata, generated capability output, or runtime checkpoint internals.

## 8. Claims and Boundaries

Use wording such as "distilled from recurring practices shared by experienced developers." Do not claim to represent every community post or universal consensus.

VibeTether may be described as designed for stronger Agents and intended to reduce long-task drift and expensive rework. It must not claim zero drift, guaranteed automatic invocation, guaranteed semantic correctness, or measured Token savings.

The README must explain that automatic behavior depends on a cooperating host reading the installed `AGENTS.md` or `CLAUDE.md` instructions. VibeTether is advisory behavioral control, not a background daemon or security sandbox.

## 9. Acceptance Criteria

- A new reader understands the original problem and beginner promise before seeing implementation terminology.
- The opening makes clear that strong Agents remain technically autonomous.
- Every shipped 0.4 capability listed in section 6 is visible in the README.
- A beginner can identify which control files are safe to edit, which should be changed through a command or Agent, and which are generated state.
- The README provides copyable truth, intent, route, experience, and validation workflows without duplicating full reference schemas.
- Existing one-command installation remains above advanced setup details.
- Public-release tests assert the original positioning, control-file ownership guidance, 0.4 feature coverage, and honest limits.
- No runtime behavior, package schema, provider selection, or release identity changes are introduced by this documentation slice.

## 10. Non-Goals

- Redesigning the CLI or management file schemas.
- Adding a second router, background process, or automatic document activation.
- Turning the README into a complete schema reference.
- Repeating every provider Skill or every community source on the landing page.
- Claiming that a project-control-plane file is more important than the user's original goal.
