# VibeTether Beginner and Capability Contract

Status: release-candidate design contract  
Decision owner: project user  
Implementation target: VibeTether 1.0 release-candidate line

## Product promise

VibeTether helps a cooperating coding agent stay aligned during long, multi-stage work without requiring the user to memorize Skill names, lifecycle terminology, or internal control files.

The beginner-facing journey is:

1. install or initialize with one command;
2. describe the task in ordinary language;
3. answer at most one most-important directional question at a time when direction is unresolved;
4. let VibeTether select one suitable primary Provider or a built-in fallback;
5. execute one bounded outcome;
6. verify the final project bytes with fresh evidence;
7. preserve a reusable success only when it is verified and worth rediscovering.

VibeTether is a cooperating-agent control layer. Where a host has no mandatory lifecycle hook, the Entry Skill and project instructions improve re-entry but cannot force an agent thread that never invokes VibeTether.

## Core users

The 1.0 target user is an individual developer or small team using Codex or Claude Code for work that may span multiple phases, context compaction, worktrees, or handoffs, while preferring a simple interface over an agent-orchestration framework.

The first release is not a general multi-tenant agent platform, CI/CD service, marketplace, daemon, database-backed workflow engine, or operating-system security sandbox.

## Adaptive control modes

### Lightweight observation

Use lightweight observation for read-only investigation, explanation, and low-risk local work whose impact remains behaviorally and structurally local, reversible, and free of new permissions or persistent coordination.

Lightweight classification is an initial judgment, not an exemption. Before every consequential action, the host must re-evaluate impact. Escalate to a controlled session when the task materially changes behavior, structure, authority, risk, permissions, scope, external effects, or persistent coordination.

Examples of escalation signals include:

- public behavior, API, data meaning, UI direction, architecture, security, permissions, migration, deployment, publication, or release changes;
- a Provider script, external write, credential boundary, worktree handoff, or persistent multi-agent state;
- repeated failure or discovery that the original slice is materially broader;
- newly applicable or changed confirmed Truth.

File count, use of a read-only subagent, or presence of a worktree does not by itself require escalation.

### Controlled session

A controlled session binds the task to confirmed authority, one bounded slice, a worktree identity, a single primary Provider, permissions, required outputs, exit evidence, and final-byte verification.

The transition from lightweight to controlled is one-way for the current task or slice. Modifications made before escalation are included in the controlled execution snapshot. A controlled session ends only as satisfied, abandoned, blocked, or explicitly closed.

## Deep mode

An explicit deep request or unresolved high-impact direction uses the `vibe-tether-deep` Entry Skill.

Deep mode has two separate artifacts:

- **Start Card** — a reviewed statement of task, bounded slice, success evidence, facts, assumptions, and decisions still owned by the user;
- **Implementation Permit** — a user-confirmed, expiring receipt bound to the Start Card, current authority digest, control generation, worktree ID, and exact slice.

A Start Card is not permission to write product code. Deep implementation cannot start until the user explicitly confirms the Start Card and the CLI issues a valid Permit. A Permit becomes invalid when it expires, is revoked or consumed, the authority changes, the control generation changes, the worktree changes, or the requested slice differs.

Deep mode does not implicitly authorize network access, credential use, external writes, destructive data changes, migration, deployment, publication, merge, or release.

## Readiness and user decisions

Readiness verdicts are discrete and explainable:

- `READY_FOR_IMPLEMENT_ONE`
- `ASK_USER_DECISION`
- `INVESTIGATE_FACTS`
- `BLOCKED_BY_CONFLICT_OR_AUTHORIZATION`

A model-supplied numeric confidence is not an authorization. Gates use observable conditions: missing direction, authority conflicts, high-risk categories, permission requirements, verification availability, and Provider compatibility.

When `needs_user_decision` is true, an implementation step cannot start without an explicit user confirmation and a durable bounded reason describing what was approved. Deep work additionally requires its Implementation Permit.

## Truth contract

Every Truth entry has a stable logical ID and a separate revision digest. The ID persists across candidate, confirmed, declined, moved, and superseded states. The digest identifies current content bytes and is never a stable identity.

Truth applicability uses:

- role;
- scope and current paths or module;
- lifecycle phase;
- operation or capability;
- directionality.

Context uses stable handles, reports total/returned/omitted counts, and provides bounded directory listings. It never silently treats a truncated list as the complete applicable authority.

A changed revision is not automatically accepted. Automatic revision refresh is permitted only when the Truth entry was predeclared machine-verifiable, its versioned deterministic validator succeeds, and the change cannot alter product, architecture, UI, data, security, permissions, migration, or release direction. Other changes require a user decision.

Automatic behavior may lower trust; it may not silently raise authority.

## Skill routing

The Provider catalog may be rich, but remains cold by default. Project initialization exposes only the small VibeTether entry Skills. Routing forms a shortlist of at most three compatible candidates and activates one primary Provider for a controlled step.

Provider selection must respect:

- phase and capability;
- positive and negative task signals;
- host and operating-system compatibility;
- declared permissions;
- project disable/preference rules;
- evaluation channel and current cache integrity;
- route additions to required outputs and exit evidence.

A Provider cannot weaken project authority, readiness, permission, evidence, destructive-operation, migration, deployment, merge, release, or publication gates.

The user can explicitly name an applicable Provider. A named Provider still cannot bypass capability, permission, or authority constraints.

## Evidence and completion

A satisfied controlled step must have:

- a valid route with status `satisfied`;
- successful non-assertion evidence for evidence-required phases;
- evidence bound to route, authority, skills configuration, worktree, pre-command state, and post-command state;
- all required outputs present and validated;
- all declared exit-evidence statements explicitly satisfied;
- final project bytes matching the last successful evidence, except for specifically declared governance-only writes such as the non-authoritative Experience candidate;
- resolved Truth reconciliation;
- a Success Capture disposition.

An abandoned, broken, active, or missing route cannot pass a completion-like Doctor boundary. State text such as `PASS`, `VERIFIED_DELIVERY`, or a self-reported Doctor verdict is never evidence.

## Success Capture

Every completed lightweight or controlled task performs a quick classification:

- routine non-path;
- unchanged repeat;
- first reusable path;
- recovered path;
- materially changed reusable path.

A candidate is generated only when the outcome has fresh evidence, is plausibly reusable, and contains a non-obvious decisive condition or a meaningful rediscovery cost. Candidates are sanitized, remain non-authoritative, and can be reviewed together at completion or handoff instead of interrupting the user after every step.

A candidate records a bounded observed sequence, reusability reasons, decisive conditions, evidence receipts, and any validated durable output artifacts. It does not store full transcripts, credentials, private reasoning, or sensitive provider output.

## Beginner experience acceptance

The implementation must demonstrate, in English and Chinese, that:

- a clear read-only request has negligible control overhead;
- a vague feature request is not silently implemented;
- an explicit deep request produces a Start Card and waits for confirmation;
- a user does not need to know a Provider name;
- the selected Provider is explained in one short reason;
- error messages give the next executable action;
- installation, upgrade, recovery, and uninstall preserve user work;
- context remains bounded without deleting core Provider, routing, or Success Capture capability.
