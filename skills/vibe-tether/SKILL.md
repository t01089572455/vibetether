---
name: vibe-tether
description: Use when a coding request is vague, project context is incomplete, work is long-running or multi-phase, context was compacted or handed off, implementation may start from assumptions, a specialist Skill may help, or the next consequential action could drift from project instructions.
---

# VibeTether

## Overview

Keep capable coding agents tethered to project truth. Re-anchor intent before consequential actions, expose the available capability map, recommend one focused specialist when useful, and require evidence before advancing.

Do not replace the coding agent's implementation ability. Control direction, authority, phase transitions, risk, recovery, and proof.

## Start Here

1. Read the nearest project instruction file and `.vibetether/project.yaml` when present.
2. Read `.vibetether/capabilities.yaml` and identify the phase, capability, observed signals, available providers, fallback, expected outputs, and exit evidence. Use the offline resolver for live availability before invoking a provider.
3. Identify the approved goal, current lifecycle state, active task slice, and last checkpoint.
4. Run the automatic work-readiness gate and decide whether the next action needs a lightweight preflight or full re-anchor.
5. Resolve applicable project sources and conflicts before choosing an implementation action.
6. Classify uncertainty as directional, local technical, or structural technical.
7. Treat the route as advice: invoke the recommended installed Skill when it fits, choose a better installed alternative when justified, or use the declared built-in fallback.
8. Record the selected path and material reason in `provider_selection`; then act within the approved slice, collect evidence, and checkpoint the result.

If no project manifest exists, run `vibetether init` or create one using [project-manifest.md](references/project-manifest.md) before long-running product work.

## Project Bootstrap and Proven Path Recall

When project direction is unresolved, route to `project-bootstrap`; do not start product implementation from a directory name, package metadata, or agent preference. In an interactive terminal, use guided `vibetether init` or `vibetether bootstrap`. In automation, require explicit goal and success evidence or leave the lifecycle at `DISCOVER`.

Before repeatable operational work, resolve `proven-path-recall` with current task and environment signals. Read only returned artifacts, not the entire index corpus. A `provisional` result or `requires_revalidation: true` guides investigation but is not known-good until fresh evidence passes. If a matching proven path is not used, record the material applicability reason.

## Automatic Work-Readiness Gate

At task entry, phase changes, consequential actions, resume, and compaction recovery, assess readiness before implementation. Keep this proportional: a clear low-risk task may pass in one compact line, while a vague or conflicting task must not advance on guesses.

Classify each dimension as `known`, `discoverable`, `user-decision`, `conflicted`, or `not-applicable`:

- user and intended outcome;
- scope, non-goals, and protected capabilities;
- success evidence and acceptance criteria;
- applicable project truth and reference meaning;
- unresolved document or authority conflicts;
- product, workflow, architecture, data, and visual decisions;
- the current bounded slice and its dependencies;
- verification path;
- authorization, reversibility, and risk.

Investigate every discoverable fact before asking the user. Do not ask the user for facts available in the repository, configured tools, or an authorized source. When a directional decision remains, automatically route to requirements clarification or document alignment and ask one recommended question at a time. Use `grilling` for the model-invokable interview. The upstream `grill-me` command is only an explicit alias for `grilling`; its behavior is automatically covered. The upstream `grill-with-docs` command is an explicit alias for `grilling` plus `domain-modeling`; automatically compose those providers when durable domain decisions or documents are required.

Use exactly one readiness verdict:

- `READY_FOR_IMPLEMENT_ONE`: direction, scope, slice, evidence, and authorization are sufficient; remaining uncertainty is local and reversible.
- `INVESTIGATE_FACTS`: the agent can close factual gaps without a user decision.
- `ASK_USER_DECISION`: a product, scope, acceptance, visual, or structural decision belongs to the user.
- `BLOCKED_BY_CONFLICT_OR_AUTHORIZATION`: authority, permission, or risk prevents safe progress.

Until `READY_FOR_IMPLEMENT_ONE`, allow read-only discovery and reversible direction-neutral preparation only. Do not write product behavior, propagate UI, choose architecture, or broaden scope. Ordinary provider selection remains advisory; the readiness assessment itself is automatic.

## Lifecycle

```text
DISCOVER -> ALIGN -> DESIGN -> PLAN -> EXECUTE_ONE -> VERIFY -> REVIEW
                                                           |-> SHIP
                                                           |-> NEXT
                                                           |-> STOP

Any state may enter DIAGNOSE, BLOCKED, ROLLBACK_PROPOSAL, or DISCOVER.
```

Do not advance because a document, test, or implementation exists. Advance only when the state's exit contract has current evidence.

| State | Entry signal | Exit contract |
| --- | --- | --- |
| `DISCOVER` | Goal, user, scope, or success is unclear | Approved lightweight Intent Contract |
| `ALIGN` | Sources exist or may conflict | Applicable authority and conflicts resolved |
| `DESIGN` | Direction is known; solution is not | User approves product, architecture, or UI direction |
| `PLAN` | Design is approved | Small, testable slices with evidence and stop conditions |
| `EXECUTE_ONE` | One slice is ready | Only that slice changed; fresh local evidence exists |
| `VERIFY` | Implementation claims readiness | Required functional, visual, safety, and scope evidence exists |
| `REVIEW` | Evidence is complete | Review uses request, sources, diff, and raw evidence |
| `SHIP` | All applicable gates pass | Explicit release authorization and reproducible release evidence |

Use `DIAGNOSE` for unexpected behavior. Use `BLOCKED` for unresolved direction, authority, permission, or verification gaps. Use `ROLLBACK_PROPOSAL` to present options; never perform destructive rollback automatically.

## Lightweight Preflight

Before every consequential action, answer compactly:

```text
Goal: What approved outcome am I preserving?
State: Which lifecycle state and slice am I in?
Sources: Which project facts govern this action?
Alignment: Does the action preserve approved capabilities and constraints?
Decision: Directional, local technical, or structural technical?
Risk: Authorized, reversible, scoped, and supported by evidence?
Verdict: PROCEED, INVESTIGATE, ASK, STOP, or PROPOSE_ROLLBACK?
```

Do not reload the entire repository for a lightweight preflight. Read only the manifest routes and sources needed for the proposed action.

## Full Re-Anchor

Perform a full re-anchor when:

- the lifecycle phase changes;
- context is compacted or summarized;
- work resumes after interruption;
- responsibility moves to another agent;
- the user changes goal, scope, or direction;
- the proposed action conflicts with a project source;
- the same failure or correction repeats;
- a UI direction will be selected or propagated;
- architecture, public contracts, data, security, or production dependencies change;
- a large refactor, merge, release, deployment, or publication is proposed;
- the checkpoint is missing, stale, or inconsistent with the working tree.

During a full re-anchor:

1. Reload the manifest and applicable sources in declared order.
2. Compare the current request, durable decisions, checkpoint, working tree, and runtime evidence.
3. List unresolved conflicts and high-impact assumptions.
4. Reconstruct the current goal, protected capabilities, approved slice, and evidence gap.
5. Write a fresh checkpoint before continuing.

Read [checkpoint-and-drift.md](references/checkpoint-and-drift.md) for the checkpoint schema, recovery rules, and drift response.

## Decision Ownership

### Directional uncertainty: always ask

Ask when uncertainty affects product goals, users, scope, capabilities, workflows, reference meaning, visual direction, acceptance criteria, or product trade-offs. Give a recommended answer and impact; do not hide direction behind an agent assumption.

### Local technical uncertainty: decide after investigation

Decide autonomously when the choice is local, reversible, within approved architecture, not externally visible, and not security-, data-, dependency-, or release-sensitive. Record important assumptions in the checkpoint.

### Structural technical uncertainty: investigate, recommend, then ask

Gate architecture, public APIs, durable data models, migrations, permissions, security, privacy, production dependencies, major reliability/cost trade-offs, and difficult-to-reverse refactors.

Read [authority-and-conflicts.md](references/authority-and-conflicts.md) whenever direction is unclear, sources disagree, or a structural gate applies.

## Capability Routing

Keep VibeTether as the stable information router and use replaceable specialist Skills for execution methods.

- Consult the generated capability board before a phase transition or consequential action.
- Recommend one primary workflow provider for the current phase; do not force an optional provider.
- Add a domain provider only when responsibilities do not overlap.
- Prefer installed, approved, compatible, and evaluated providers.
- Require structured outputs and phase exit evidence.
- Do not let a provider override project authority.
- Do not silently download an unplanned provider during an active task.
- Use the minimal safe built-in path when an optional provider is absent.
- Record `recommended`, `selected`, `selection_reason`, and `invocation_status` without exposing private reasoning.
- Stop when a required safety, migration, UI-validation, or release capability is unavailable.

For a deterministic local recommendation, run:

```bash
node .agents/skills/vibe-tether/scripts/resolve-route.mjs --project . --phase PLAN --capability planning --signal multi-step-change --agent codex
```

Use `.claude/skills/vibe-tether/scripts/resolve-route.mjs` for Claude projects. The script is offline and reads only the project capability board. `vibetether capabilities --project .` provides the human dashboard; add `--phase`, `--capability`, repeatable `--signal`, `--agent`, and `--json` for a query.

Read [capability-routing.md](references/capability-routing.md) before selecting or changing a provider.
Read [scenario-routing.md](references/scenario-routing.md) when translating a plain-language situation into phase, capability, signals, primary provider, overlays, alternatives, and fallback.

## UI Branch

Treat UI direction as product direction, not a cosmetic implementation detail.

Do not propagate a visual pattern until one representative direction or golden screen is approved. Separate functional acceptance from visual acceptance. Never remove or hide product capabilities merely to make the interface look cleaner.

Read [ui-control-loop.md](references/ui-control-loop.md) for any user-visible interface, screenshot reference, redesign, dashboard, workbench, responsive state, or visual acceptance claim.

## Universal Gates

Stop and ask before:

- changing goals, users, scope, workflows, or public behavior;
- adding, removing, hiding, or weakening a product capability;
- changing architecture, public APIs, or durable data contracts;
- running migrations, bulk data changes, or destructive operations;
- changing permissions, security, privacy, or external service configuration;
- adding a production dependency or remote execution path;
- choosing or changing UI direction, design tokens, or a golden screen;
- starting a large cross-module refactor;
- merging, deploying, releasing, publishing, or transmitting project data;
- overriding a project source;
- acting on an unconfirmed high-impact assumption.

Project-defined gates may add restrictions. They may not weaken platform safety or the universal protections above.

## Evidence Ladder

Use the narrowest truthful verdict:

```text
INTENT_ALIGNED
DESIGN_APPROVED
PLAN_READY
LOCAL_VERIFICATION_PASS
FUNCTIONAL_ACCEPTANCE_PASS
VISUAL_ACCEPTANCE_PASS
REVIEW_PASS
RELEASE_READY
VERIFIED_DELIVERY
```

Never promote:

- a plan into implementation evidence;
- type checking into runtime evidence;
- unit tests into browser acceptance;
- screenshots into functional acceptance;
- the implementer's summary into independent review;
- local success into release readiness.

Record commands, exit codes, result summaries, artifact paths, scope review, and known evidence limitations. Do not expose private chain-of-thought, raw ReAct reasoning, credentials, sensitive data, or unfinished internal tool plans.

Keep lifecycle labels, checkpoint mechanics, and control-kernel terminology internal unless they help the user decide. User-facing messages should state the conflict or result, impact, recommendation, and confirmation needed without narrating the whole control process.

## Success Capture Gate

After every verified user-level or engineering-level success, determine whether the outcome establishes or changes a reusable workflow. A first verified reusable workflow is a `first-proven-path` and must be captured immediately even when its first attempt succeeded. Recovered or materially changed paths must update their durable artifacts; unchanged repeated paths must point to existing encoding without duplicate documentation; routine non-paths create no document.

Use exactly one final disposition: `captured`, `already-encoded`, or `not-reusable`. Record the trigger, reason, and artifact paths in checkpoint `experience_feedback`. Fresh tests, runtime, remote, browser, deployment, or CI evidence proves success; the checkpoint only records the disposition.

Before completion, handoff, the next slice, merge, release, or publication, run `vibetether doctor`. Do not advance while the disposition is `pending`. Never persist credentials, private keys, one-time codes, private reasoning, sensitive tool output, or full transcripts.

Read [success-capture.md](references/success-capture.md) for first, recovered, changed, repeated, and routine path classification; durable destination routing; deduplication; redaction; and revalidation rules.

## Drift Response

- `L1_LOCAL`: correct a local, reversible deviation and record it.
- `L2_DIRECTION`: stop propagation, cite the conflict, recommend a resolution, and ask.
- `L3_HIGH_IMPACT`: freeze expansion and produce a drift report with preserve, repair, and rollback options.

Do not destructively reset, overwrite user work, or roll back without explicit authorization.

## Stop Conditions

Return a precise blocker when:

- direction is ambiguous;
- sources conflict and the conflict cannot be resolved by declared authority;
- the active slice has expanded materially;
- a protected capability would be removed or weakened;
- a reference has not been inspected or classified;
- evidence proves only a proxy for the requested outcome;
- a provider or tool would expand permission, network, cost, or external-write scope;
- the same correction fails twice;
- the checkpoint cannot be reconciled with the working tree;
- release evidence is stale or incomplete.

## Common Rationalizations

| Rationalization | Required response |
| --- | --- |
| "The model is capable enough to remember" | Re-anchor from durable project sources after compaction or resume. |
| "The document exists, so the agent knows it" | Route and reread the applicable source before the decision. |
| "This is only a technical choice" | Gate it if it changes architecture, contracts, data, security, dependencies, or product experience. |
| "All design Skills will make the UI safer" | Select one aesthetic director and separate engineering from validation. |
| "Tests pass, so the UI is right" | Require both functional and visual acceptance. |
| "I can clean up the drift automatically" | Stop propagation and propose options; do not perform destructive rollback. |
| "One more large batch will save time" | Return to one approved, rejectable, verifiable slice. |

## Completion

Before claiming completion:

1. Run a fresh full re-anchor.
2. Confirm the final diff stays within approved scope.
3. Run every applicable verification command.
4. Check functional, visual, safety, and release evidence separately.
5. Record independence limitations honestly.
6. Run the Success Capture Gate and update the correct durable source for accepted decisions, reusable failures, and first, recovered, or changed Proven Paths.
7. Write `experience_feedback`, run `vibetether doctor`, and record the exact verdict.
