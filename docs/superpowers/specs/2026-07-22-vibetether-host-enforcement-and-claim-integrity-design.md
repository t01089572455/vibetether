# VibeTether Host Enforcement and Claim Integrity Design

- Status: proposed written consolidation for user review
- Decision owner: project user
- Date: 2026-07-22
- Target: staged work after the reviewed RC4 control-kernel baseline
- Scope: pre-work understanding, host lifecycle enforcement, claim adjudication, evidence maturity, runtime identity, and progress-efficiency checkpoints
- Implementation status: not implemented by this document
- Evidence basis: `docs/research/2026-07-22-gyws-long-task-failure-forensics.md`

## 1. Product objective

VibeTether exists because a capable coding agent can perform a large amount of technically valid work while still solving the wrong problem, testing the wrong path, omitting requirements, or calling a local success “done.”

The product objective is not to make the model obedient through a stronger prompt. It is to make the project's acceptance of agent actions and claims depend on current facts, explicit user decisions, declared outcomes, exact evidence, and recoverable lifecycle state.

The core invariant is:

> Agent prose is a claim. It becomes an accepted verdict only within the scope actually proven by current authority and evidence.

## 2. What “understood enough to start” means

VibeTether must not demand omniscience before every edit. It must demand bounded clarity before a consequential action.

For an approved slice, “ready” means:

- discoverable project facts have been inspected;
- the raw user request has been expanded into observable desired outcomes;
- applicable confirmed Truth has been identified;
- known contradictions are resolved or explicitly blocked;
- every known directional ambiguity has a user-owned disposition;
- success criteria identify how the result will be observed;
- the execution environment and permission boundary are declared;
- the user has confirmed the resulting contract when direction is consequential.

It does not mean that the agent predicts every implementation detail or asks the user technical questions it can answer safely itself.

## 3. Prompt-intake and understanding gate

### 3.1 Intake sequence

At task entry, Deep mode follows:

```text
preserve raw request
-> inspect current facts and authority
-> expand the request into candidate outcomes and hidden decisions
-> distinguish facts, assumptions, proposals, and user-owned choices
-> challenge the most expensive counterexample
-> ask one highest-value question at a time
-> show a bounded Start Card and Acceptance Contract
-> obtain explicit confirmation
-> issue an Implementation Permit
```

The adaptive entry may remain lightweight for read-only or clearly local, reversible work. It must escalate before the next consequential action when behavior, structure, authority, risk, permissions, external effects, or persistent coordination changes.

### 3.2 Request expansion

Request expansion is not permission to invent product requirements. The agent may propose:

- intended user and observable transformation;
- in-scope and out-of-scope behavior;
- inputs, outputs, failure states, and non-functional constraints;
- visual or interaction decisions;
- data, permission, migration, deployment, and compatibility impacts;
- required owner and machine evidence.

Each proposed item is labeled as discovered fact, confirmed Truth, inferred assumption, recommendation, or unresolved decision. Only user-confirmed or already-authoritative items govern implementation.

### 3.3 One-question policy

When user direction is required, VibeTether asks one consequential question with:

- the exact ambiguity;
- why it changes the result;
- a recommended answer;
- two or three concrete alternatives when useful;
- the consequence of deferring it.

Questions about discoverable repository facts, standard low-risk implementation choices, or reversible technical details are investigated or decided autonomously.

### 3.4 Permit semantics

An Implementation Permit is bound to:

- the exact bounded slice;
- confirmed user decision receipts;
- authority and Decision Memory digests;
- Outcome revision;
- worktree and repository identity;
- declared environment class;
- allowed action and permission classes;
- expiry and control generation.

A Permit is invalidated by material Truth or decision changes, scope expansion, worktree change, permission expansion, route closure, explicit revocation, or expiry.

## 4. Three enforcement levels

VibeTether exposes the actual enforcement level rather than presenting every installation as equivalent.

### Level 1: advisory cooperation

Mechanisms:

- Entry Skills;
- `AGENTS.md` and `CLAUDE.md` managed blocks;
- CLI context, route, and Doctor commands.

This improves agent behavior but cannot stop a thread that ignores VibeTether.

### Level 2: host lifecycle enforcement

Mechanisms:

- host hooks or lifecycle callbacks;
- permission interception;
- pre-write Permit checks;
- compaction and handoff rehydration;
- completion interception.

This can block or ask inside a cooperating host, subject to the host's actual hook semantics and bypass boundaries.

### Level 3: external hard gates

Mechanisms:

- CI and protected-branch checks;
- merge, deployment, publication, and migration gates;
- production or data authority adapters;
- independent owner approval.

Only this level can govern actions outside the conversational host. VibeTether must not advertise Level 1 or Level 2 as an operating-system sandbox or production authority.

## 5. Host-neutral hook dispatcher

VibeTether remains one product. Codex and Claude adapters translate available host events into a small host-neutral protocol:

| Neutral event | Required control |
| --- | --- |
| `SESSION_ENTER` | inspect control health, current task, authority, decisions, progress, and stale state |
| `USER_REQUEST` | preserve request, classify impact, route adaptive or Deep intake |
| `USER_CORRECTION_OR_RECHECK` | preserve the exact message; when a local session is attached, run incremental or bounded full raw-session reconciliation before consequential replanning |
| `BEFORE_CONSEQUENTIAL_ACTION` | require current Permit, allowed scope, permission, and applicable Truth |
| `AFTER_MUTATION` | record changed paths and invalidate affected evidence, progress, experience, or Permit |
| `BEFORE_COMPACTION` | reconcile visible decisions and persist a bounded recovery capsule |
| `AFTER_COMPACTION` | rehydrate from durable decisions and current bytes; never trust summary alone |
| `DELEGATE_START` | issue a bounded handoff contract and accepted claim scope |
| `DELEGATE_STOP` | verify returned bytes, evidence, open blockers, and integration status |
| `BEFORE_STOP` | adjudicate the intended claim and block unsupported completion language |
| `PERMISSION_REQUEST` | compare requested capability with approved risk and external-effect scope |

Each host adapter declares which events it can truly intercept. Missing events degrade control health and are visible in CLI and cockpit output.

The dispatcher never substitutes an Agent-authored summary for a requested raw-session audit. If the host exposes no stable current-session locator, it asks for an explicit local path or reports provenance as unavailable; it does not search unrelated conversations or guess the newest file.

### 5.1 Before-action behavior

The dispatcher returns one of:

- `ALLOW` — current action fits the approved slice and permission class;
- `ASK` — a user-owned decision or new permission is required;
- `BLOCK` — authority, scope, state, or evidence conflict makes the action invalid;
- `ADVISE` — the host cannot enforce this boundary, but records the unsupported action risk.

### 5.2 Stop behavior

Before an agent reports aligned, complete, verified, integrated, deployable, or releasable, the dispatcher requires a Claim Envelope and invokes the applicable Doctor boundary.

The Stop gate blocks when:

- progress is stale or missing;
- the current bytes differ from verified bytes;
- the runtime environment differs from the evidence environment;
- required Outcome IDs remain open;
- a delegated result is not integrated;
- contradictory findings remain unresolved;
- owner acceptance is required but missing;
- Success Capture disposition is pending;
- the requested verdict exceeds the strongest proven claim scope.

The agent may still report a bounded checkpoint or blocker. It may not relabel that state as completion.

## 6. Claim Envelope

Every material status claim is represented as data:

```json
{
  "claim_id": "claim_...",
  "claim_type": "slice_verified",
  "requested_verdict": "PASS",
  "outcome_ids": ["outcome_..."],
  "authority_digest": "sha256:...",
  "decision_digest": "sha256:...",
  "worktree_id": "...",
  "final_bytes_digest": "sha256:...",
  "environment_id": "env_...",
  "evidence_ids": ["evidence_..."],
  "unverified_axes": ["owner_visual_acceptance"],
  "open_blocker_ids": [],
  "review_independence": "self-review"
}
```

Claim types are non-substitutable:

- `inspection_complete`;
- `slice_green`;
- `goal_engineering_closed`;
- `integration_verified`;
- `owner_accepted`;
- `deployment_verified`;
- `release_ready`.

No higher claim is inferred from a lower claim. In particular:

```text
tests pass != owner accepted
slice green != goal complete
goal engineering closed != integrated
integrated != deployed
deployed != correct production state
self-review != independent review
```

## 7. Evidence vector, not one green badge

Evidence retains independent axes:

| Axis | Example proof |
| --- | --- |
| source structure | static/source contract |
| unit behavior | isolated deterministic tests |
| fixture journey | seeded browser state |
| component integration | real component with injected boundary |
| exact local environment | declared backend, database, dataset, config, and process |
| external authority | production, deployment, payment, data, or service adapter |
| owner acceptance | explicit user approval of required visual or semantic result |
| independent review | reviewer separated from implementation under a declared standard |

A product may have strong evidence on one axis and none on another. The cockpit shows the vector and omitted axes. It does not average them into a misleading percentage.

### 7.1 Exact environment identity

Environment evidence binds at minimum:

- runtime and backend identity;
- database or datastore identity without storing credentials;
- dataset/schema fingerprint when relevant;
- model/provider class and pinned implementation where relevant;
- configuration class and feature flags;
- running process artifact/version;
- base URL or execution target class;
- worktree HEAD and dirty-byte digest;
- journey or command executed.

A different “real” database does not prove the requested database. A new process or configuration invalidates the earlier runtime claim until reverified.

## 8. Bounded adversarial adjudication

VibeTether adopts the useful core of adversarial review without becoming a separate Falsify clone:

```text
define the claim
-> attack its assumptions and likely false-green paths
-> identify the actual authority for each disputed fact
-> execute or independently recompute the checks
-> issue PASS, PASS_WITH_DEBT, or BLOCK for the proven scope only
```

Rules:

- no evidence means no `PASS`;
- prose, logs, test names, and another model's confidence are not authority;
- `PASS_WITH_DEBT` lists debt that does not invalidate the declared scope;
- a missing required axis is `BLOCK`, not debt;
- an authority adapter may validate external state but may not silently expand authorization;
- a completion receipt states what was not proved.

## 9. Progress-efficiency and churn checkpoint

VibeTether must not promise a fixed token saving and must not treat token count as product progress. It should detect work patterns that make expensive drift likely.

A churn checkpoint is triggered by explainable signals such as:

- repeated compactions without Outcome state change;
- repeated failure on the same acceptance item;
- repeated commands or edits that do not change the blocking evidence;
- growing changed-path scope without approved Outcome expansion;
- unresolved contradictory worker reports;
- a large activity interval with no newly satisfied Outcome;
- repeated redefinition of the target or environment;
- implementation continuing while owner-required acceptance remains undefined.

The checkpoint does not automatically terminate work. It requires:

1. re-read current intent, Truth, decisions, and open Outcomes;
2. show what changed since the last useful checkpoint;
3. identify the current blocker or scope-growth cause;
4. recommend continue, narrow, redesign, abandon, or ask the user;
5. obtain user confirmation when the goal or direction changes.

Raw token counters may be displayed as diagnostics when the host exposes them, but never as billing truth or a substitute for value.

## 10. Installation UX

Initialization offers:

1. `Guarded (recommended)` — install supported host hooks plus advisory files;
2. `Advisory` — install Skills and managed instruction blocks only;
3. `Skip host integration` — initialize project contracts without host automation.

The installer must:

- explain what can and cannot be enforced;
- merge structured host configuration safely;
- back up affected files;
- own only namespaced VibeTether entries;
- fingerprint installed content;
- refuse destructive overwrite of user modifications;
- support dry-run, repair, health, upgrade, and uninstall;
- preserve unrelated hooks and settings;
- report `ENFORCED`, `PARTIAL`, `ADVISORY`, `STALE`, `INCOMPATIBLE`, or `UNENFORCED`.

Non-interactive installation requires an explicit profile and never silently enables hooks.

## 11. Rule completeness schema

Every enforceable rule defines:

- owner;
- trigger;
- authoritative input;
- deterministic or bounded-semantic decision procedure;
- `ALLOW`, `ASK`, `BLOCK`, and degraded behavior;
- evidence emitted;
- failure behavior;
- recovery path;
- audit representation;
- conformance and fault-injection tests.

A prose statement without these fields is guidance, not an engineered gate.

## 12. Beginner-facing behavior

The default user experience remains simple:

```text
install
-> describe the work normally
-> answer one important question when necessary
-> see what the agent is about to prove
-> let it execute one bounded slice
-> see what is actually done, open, stale, or unverified
```

Users do not manage phases, Provider Cards, receipts, or hook event names. Advanced details remain inspectable through stable handles and the cockpit.

## 13. Anti-anchoring instruction

The kernel and host instructions include:

> 辩证地看待现有框架，实事求是；框架、计划、模式、Skills 和既有 Agent 结论都只是工具或假设，不是权威。

This does not authorize endless redesign. A counterexample becomes a bounded finding. If it changes direction, authority, acceptance, or scope, the agent stops and asks the user.

## 14. Delivery stages

This design must be implemented in bounded stages:

1. Claim Envelope and evidence-vector contracts;
2. exact runtime/environment receipts and invalidation;
3. host-neutral dispatcher with fake-adapter conformance tests;
4. one real host adapter in advisory mode;
5. guarded before-action and stop interception;
6. compaction, handoff, and permission events;
7. second host adapter;
8. external CI/merge gate integration;
9. cockpit projection and beginner journeys.

Each stage must pass the real-project replay suite before the next stage. No cockpit badge may imply a gate that the installed host cannot enforce.

## 15. Honest boundary

This design can reduce false starts, forgotten decisions, unsupported completion, and expensive rework. It cannot guarantee that a model never lies, never misunderstands, or never produces poor code. It cannot control a host that never invokes it, and it cannot prove production or owner satisfaction without the relevant authority.

The defensible promise is narrower and stronger:

> VibeTether makes consequential work start from an explicit bounded contract and makes completion claims answerable to current facts, final bytes, declared evidence, and the strongest enforcement boundary actually installed.
