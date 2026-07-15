# VibeTether Beginner-First README and Smallest Verifiable Slice Design

**Status:** Ready for user review

**Date:** 2026-07-15

**Target release:** 0.5.0
**Scope:** Public positioning, management guidance, and one narrow execution-scope invariant

## 1. Problem

VibeTether exists because capable coding Agents can still drift during long tasks. As context grows, the approved goal, project rules, applicable Skills, and previously proven workflows can stop governing the next action. Beginners may not know which Skill to request, while experienced users may simply forget to route or preserve a successful operational path.

The current 0.4 implementation already provides a user-owned project control plane for intent, confirmed truth, routing, checkpoints, evidence, and Proven Paths. Its README does not yet explain that complete story in the simplest order, show beginners how to manage the control files safely, or preserve the user's original motivation strongly enough.

GPT-5.6 Ultra and current Codex releases also make parallel Subagent workflows more available. OpenAI's current documentation already assigns spawning, routing, waiting, closing, and bounded task decomposition to the host Agent. VibeTether must not duplicate or constrain that orchestration. The remaining project-level gap is smaller: before work expands, keep the active execution slice tied to the smallest verifiable result that meaningfully advances the approved user goal.

## 2. Product Thesis

VibeTether is a beginner-friendly entry Skill for long-running Codex and Claude work. At meaningful boundaries it helps a capable Agent:

1. re-check the user-owned goal;
2. reread applicable project rules and confirmed truth;
3. decide whether work is ready or still depends on a user decision;
4. recommend an appropriate installed Skill without requiring the user to know Skill names;
5. preserve phase, evidence, and the active slice through compaction, resume, and handoff;
6. recall a workflow that already succeeded before rediscovering it;
7. keep the next implementation slice as small as practical and verifiable;
8. stop expensive directional rework before it spreads.

The Agent remains autonomous for local, reversible technical decisions. VibeTether controls direction, authority, phase transitions, project truth, evidence, and scope boundaries; it does not replace the Agent's implementation or orchestration ability.

## 3. Approved README Opening

The README opens with the user problem, not control-plane terminology:

```markdown
# VibeTether

> Strong agents can build fast. Long tasks still drift.

VibeTether is a beginner-friendly entry Skill for long-running Codex and
Claude projects. At the moments that matter, it helps the Agent re-check the
goal, reread project rules, decide whether the work is ready, choose the right
installed Skill, and recall workflows that already worked.

You do not need to memorize Skill names or manage a rigid workflow.
VibeTether turns recurring lessons from experienced developers into a
project-local guidance layer, so capable Agents stay autonomous without
quietly drifting into expensive rework.
```

Only after this promise does the README explain the mechanism:

```markdown
Under the hood, VibeTether provides a project-local control plane for intent,
truth, routing, checkpoints, evidence, and proven workflows.
```

## 4. Smallest Verifiable Slice

VibeTether adds exactly one execution-scope invariant:

> Before implementation or the next slice, define the smallest verifiable outcome that meaningfully advances the approved user goal. Keep the current slice, including delegated work, inside that boundary.

This invariant strengthens the existing `READY_FOR_IMPLEMENT_ONE`, `PLAN`, and `EXECUTE_ONE` contracts. It does not introduce a second workflow engine or a new checkpoint schema. The existing checkpoint `slice`, readiness evidence, route state, and scope-drift response remain the durable and observable mechanisms.

For a clear low-risk task, the Agent may satisfy the invariant in one compact sentence. For a larger task, the plan may contain many future slices, but only the current smallest verifiable slice enters execution. Once its stated evidence passes, the Agent stops that slice; unrelated improvements remain outside the active boundary or become a later proposed slice.

If the active slice must expand materially to succeed, VibeTether applies its existing decision ownership rules: investigate discoverable facts, decide local reversible technical details autonomously, and ask the user only when the expansion changes product direction, scope, architecture, visual direction, durable contracts, risk, permissions, or release behavior.

## 5. Relationship to Subagents

Subagent orchestration remains owned by Codex, Claude, and their applicable specialist Skills.

VibeTether does not:

- limit the number of Subagents;
- require user approval for ordinary technical delegation;
- define spawning, waiting, polling, nesting, cancellation, or closing behavior;
- add a delegation budget or concurrency setting;
- replace host safeguards for independent or write-heavy work;
- claim control over hidden platform-internal Ultra orchestration.

Delegated work is mentioned only because it is still part of the active project slice. The same outer scope ceiling applies whether the host uses one Agent, several Subagents, or no explicit delegation at all.

This boundary follows the current OpenAI documentation: Subagents handle specific tasks and bounded pieces, while the host manages orchestration. Public Codex issues show that orchestration heuristics may still duplicate work, but VibeTether will not overfit to individual host bugs. It supplies the missing project-owned finish line and leaves execution mechanics to the host.

## 6. README Information Architecture

The README uses this order:

1. beginner-first opening and concise badges;
2. easiest reliable one-command installation;
3. a compact feature section explaining drift control, readiness, automatic Skill routing, project truth, Smallest Verifiable Slice, checkpoints, and Proven Paths;
4. a 30-second ordinary-language example showing vague-request clarification, phase routing, one smallest verifiable implementation slice, verification, and success capture;
5. the original motivation and community-practice basis;
6. the project control-plane artifact map;
7. `Manage VibeTether your way`, with Agent-assisted and direct-management paths;
8. routing customization, provider bundles, verification, troubleshooting, and honest limits;
9. links to focused reference documentation.

The README remains scannable. Full schemas and provider inventories stay in dedicated documents.

## 7. Shipped Control-Plane Capabilities to Expose

The feature section must accurately include the existing 0.4 control plane plus the 0.5 scope invariant:

1. fresh initialization creates a blank truth registry and never silently activates PRDs, ADRs, or similarly named files;
2. the Agent may find and explain truth candidates, but candidates remain non-authoritative;
3. active additions, removals, moves, role changes, scope changes, and supersession require user confirmation;
4. documents produced during discussion still enter as candidates;
5. applicable truth is reread at meaningful long-task boundaries without reloading everything before every edit;
6. route entry fingerprints confirmed authority so later source drift becomes visible;
7. confirmed truth cannot be silently overridden by an old Proven Path; unresolved conflicts return to the user;
8. reusable first successes become sanitized candidates and require confirmation before active indexing;
9. route state and the semantic checkpoint update together, with rollback on partial write failure;
10. `doctor` reports health for bootstrap, intent, truth, state, routing, experience, and providers;
11. the artifacts operate as one coordinated project control plane rather than an isolated Skill lookup table;
12. implementation enters only the smallest verifiable slice that meaningfully advances the approved goal.

## 8. Management Tutorial

The README contains common copyable operations and links complete schemas elsewhere.

| Artifact | Ownership | Beginner action |
| --- | --- | --- |
| `.vibetether/TRUTH.md` | User-owned authority registry | Edit directly or ask the Agent; every active authority change requires explicit confirmation |
| `.vibetether/intent.md` | User-owned direction with integrity metadata | Use `vibetether bootstrap --project .` or ask the Agent to propose the change |
| `.vibetether/routes.local.yaml` | User-owned live route overlay | Use `vibetether customize --project .` or edit validated YAML directly |
| Proven Path documents | User-owned reusable procedures | Edit the referenced runbook or artifact; never include secrets |
| `.vibetether/experience-index.yaml` | Strict metadata index | Prefer an Agent-generated sanitized candidate and confirm before activation |
| `.vibetether/project.yaml` | CLI-maintained topology | Inspect it; normally update or repair through `vibetether init` |
| `.vibetether/capabilities.yaml` | Generated capability board | Inspect it with `vibetether capabilities`; do not use it as the local override |
| `.vibetether/state/current.yaml` and route handshake | Agent/CLI runtime state | Inspect for diagnosis; normally let VibeTether maintain them |
| Managed `AGENTS.md` / `CLAUDE.md` block | CLI-maintained host entry | Edit project prose outside the markers and rerun `init` to repair the block |

The README includes:

- a valid `TRUTH.md` candidate entry and a natural-language candidate-discovery request;
- one-at-a-time confirmation for activating, changing, moving, deleting, or superseding truth;
- `vibetether bootstrap --project .` for goal, evidence, constraints, or direction changes;
- `vibetether customize --project .` and one minimal local route example;
- a sanitized Proven Path candidate workflow followed by user confirmation and `doctor`;
- `vibetether doctor --project . --json` after active control changes.

The README does not instruct users to hand-edit generated capability output, canonical Intent Contract metadata, or runtime checkpoint internals.

## 9. Implementation Surfaces

The implementation plan may change only the surfaces needed to make the contract observable and releasable:

- `skills/vibe-tether/SKILL.md`: readiness, lifecycle, and completion wording;
- `src/adapters.mjs`: the managed Codex/Claude project instruction block;
- `README.md` and focused guides where necessary;
- Skill, adapter, README, release, and static-scenario tests;
- one static scenario proving a large request enters one smallest verifiable slice without suppressing applicable Subagent routing;
- package and compatibility metadata for 0.5.0;
- release documentation and portable Skill fingerprint.

No CLI command, configuration key, checkpoint field, route signal, provider catalog, provider selection rule, truth schema, or experience schema is added.

## 10. Claims and Boundaries

The README may say VibeTether is distilled from recurring practices shared by experienced developers and is designed for stronger Agents such as Claude Fable 5 and GPT-5.6. It may say the project aims to reduce long-task drift, avoid unnecessary scope expansion, and reduce expensive rework.

It must not claim:

- zero drift or guaranteed automatic invocation;
- semantic correctness from route state alone;
- control over Ultra's hidden internal Agent topology;
- guaranteed Token or usage savings;
- representation of every community post or universal consensus.

Automatic behavior depends on a cooperating host reading and following the installed `AGENTS.md` or `CLAUDE.md` instructions. VibeTether is advisory behavioral control, not a background daemon, scheduler, security sandbox, or hard resource limiter.

## 11. Acceptance Criteria

- A new reader understands the original long-task problem and beginner promise before seeing control-plane terminology.
- The opening makes clear that strong Agents remain technically autonomous.
- The easiest reliable installation command appears before advanced setup.
- The README exposes all control-plane capabilities listed in section 7.
- A beginner can identify which files are safe to edit and use copyable truth, intent, route, and Proven Path workflows.
- The Skill and managed host instructions contain the exact Smallest Verifiable Slice invariant or an equivalent tested form.
- A clear low-risk request can pass the scope gate compactly without new ceremony.
- A large request enters only one smallest verifiable implementation slice at a time.
- Applicable Subagent and parallel-execution routes remain available and unchanged.
- Tests prove that no Subagent cap, ordinary-delegation approval requirement, delegation budget, or new configuration surface was introduced.
- The release is published as 0.5.0 with a valid portable Skill fingerprint, passing compatibility audit, full tests, static evaluations, package audit, and acceptance tour.

## 12. Non-Goals

- Managing Subagent counts, hierarchy, lifecycle, prompts, context, or concurrency.
- Measuring or promising Token savings.
- Adding a new workflow engine, daemon, router, or control file.
- Changing truth, checkpoint, experience, provider, or project-route schemas.
- Redesigning the CLI or interactive initialization.
- Turning the README into a complete schema or provider reference.
- Fixing host-specific Subagent bugs inside VibeTether.

## 13. Evidence Basis

- [OpenAI Subagents documentation](https://developers.openai.com/codex/subagents) assigns specific-task decomposition and orchestration to the host and warns that Subagents consume more tokens than comparable single-Agent runs.
- [OpenAI AGENTS.md documentation](https://developers.openai.com/codex/guides/agents-md) documents durable project guidance and its discovery scope.
- [`openai/codex` issue 18148](https://github.com/openai/codex/issues/18148) and [issue 16900](https://github.com/openai/codex/issues/16900) provide bounded evidence that orchestration heuristics can duplicate work; they do not justify a VibeTether concurrency controller.
