# VibeTether Final Comprehensive Upgrade Design

- Status: proposed final written consolidation for user review
- Decision owner: project user
- Date: 2026-07-22
- Baseline: VibeTether `1.0.0-rc.4` on `integration/rc3-hardening-v1`
- Scope: long-task alignment, local-session recheck, correction control, durable decisions, Truth lifecycle, lifecycle routing, UI control, Provider extensibility, outcome completeness, evidence-bound claims, host enforcement, failure generalization, self-governance, beginner installation, and a lightweight cockpit
- Approval basis: the user approved the product direction and individual design branches in conversation; this consolidated written contract remains pending exact user review
- Implementation status: this document is a design and staged-delivery contract, not evidence that the missing capabilities exist

## 1. Executive decision

VibeTether remains one lightweight, installable product for Codex, Claude Code, and compatible coding-agent hosts:

```text
one repository
+ one package and CLI
+ one normal entry Skill
+ one explicit Deep entry Skill
+ host adapters where the host truly supports interception
+ one local read-mostly cockpit
```

It does not become a database-backed project manager, daemon, remote orchestration platform, multi-package protocol ecosystem, or operating-system sandbox.

The governance invariants are domain-neutral: authority, action scope, evidence, claims, correction, and experience apply to coding and non-coding artifacts alike. Formal 1.0 conformance and bundled host adapters remain coding-first for Codex and Claude Code. Other work types or hosts may reuse the kernel only with an explicit capability/authority adapter and must be labeled experimental or advisory until their public journeys pass conformance.

The product promise is:

> VibeTether makes consequential work start from an explicit bounded contract and makes actions and completion claims answerable to current user decisions, project authority, final bytes, exact evidence, and the strongest enforcement boundary actually installed.

VibeTether cannot guarantee that a model never misunderstands, lies, over-engineers, or under-delivers. It must instead make those failures observable and prevent unsupported actions or claims from being accepted as aligned, complete, verified, integrated, deployable, or releasable inside an enforced boundary.

## 2. What the failure history proves

Long context is an amplifier, not the common root cause. The same failures can occur in a short session:

- an Agent replaces the literal request with a preferred interpretation;
- a selected subset is presented as the complete source universe;
- implementation and tests migrate together into a self-confirming but weaker definition;
- a different backend, database, Provider, process, or worktree is called “real”;
- a local green result is promoted into whole-product completion;
- user rejection changes the prose but not the Agent's actual next action;
- a copied file is treated as activated, integrated, or governing;
- a detailed external-agent report is treated as delivered bytes;
- a successful operational path is forgotten and rediscovered incorrectly.

Long sessions add further pressure:

- confirmed decisions disappear during compaction or handoff;
- rejected branches return through summaries;
- the target gradually changes without a new user decision;
- repeated activity creates the appearance of progress while no Outcome closes;
- the Agent selects a convenient green checkpoint to end an expensive task.

The engineering response must therefore combine memory with authorization, completeness, evidence, claim control, and host interception. Context management alone is insufficient.

## 3. Evidence basis and known incident families

This design consolidates the following local evidence families:

| Incident family | Representative failure | Required control |
| --- | --- | --- |
| GYWS product drift | extensive implementation and tests proved a different runtime and product path | Outcome coverage, exact environment identity, bounded claims |
| GYWS false-green runtime | 889 contracts passed while the user-opened backend, database, permissions, and SQL path failed | evidence vector, process receipt, owner journey |
| LoveBuddy local-green inflation | one slice or thousands of tests were presented as the whole TA-core objective | slice/goal/release separation and source-ID coverage |
| LoveBuddy Truth migration | the requested full source was replaced by a selected 6+7 or another inferred subset | Owner Correction Lock, independent source universe, literal source binding |
| LoveBuddy repeated correction | after rejection, the Agent changed migration strategy and repository structure without a reviewed correction plan | Adaptive Correction Protocol and rejection memory |
| GPT Pro delivery reports | polished reports, hashes, and high pass counts omitted final-ZIP, Windows, migration, or adversarial proof | untrusted Claim Envelope, exact artifact testing, independent review |
| Delegated work | a subagent or external model said complete outside the integration worktree | bounded handoff and integration-byte gate |
| Compaction and summary loss | raw user decisions were omitted or flattened into an Agent summary | Decision Memory and bounded raw-session reconciliation |
| Installation and release recovery | Windows locks, TLS failures, rollback defects, and successful paths were not retained correctly | fault recovery and Success Capture |
| VibeTether self-drift | an implementation plan remained unchecked after the corresponding code existed | generated capability/progress status and self-hosting health |

The sanitized evidence records and detailed scenario corpus remain in:

- `docs/research/2026-07-22-gyws-long-task-failure-forensics.md`;
- `docs/superpowers/specs/2026-07-22-vibetether-real-project-failure-replay-suite.md`.

## 4. Current capability truth

The RC4 baseline already provides useful, tested mechanics:

- guided project initialization;
- adaptive task classification;
- Deep Start Card and scoped Implementation Permit;
- confirmed Truth lifecycle, candidate isolation, stable Truth IDs, applicability, and revision drift;
- cold Provider catalog, capability routing, and one primary Provider per controlled step;
- versioned Outcome registry, exact source-ID coverage, generated `PROGRESS.md`, and slice/goal/release Doctor boundaries;
- final-byte command and artifact evidence;
- per-worktree runtime, lease, handoff, and integration-worktree closure;
- Success Capture and Experience invalidation;
- migration, upgrade, rollback, uninstall, Provider-integrity, and Windows recovery protections.

### 4.1 Baseline non-regression contract

The upgrade may replace internal modules and schemas, but it may not silently remove these existing user outcomes:

- one normal adaptive entry and one explicit `vibe-tether-deep` entry;
- guided project initialization for Codex, Claude Code, or both;
- a fresh project with no automatically activated repository Truth;
- a user-editable Truth entry list plus natural-language candidate discovery;
- automatic routing of vague requests to requirements clarification and one recommended question at a time;
- `standard`, `extended`, `web`, and `production` Provider profiles or capability-equivalent replacements;
- a cold capability catalog, a shortlist of at most three, one Primary Provider, and a safe built-in fallback;
- project-owned route customization that may strengthen but never weaken universal gates;
- explicit UI direction and browser-verification capabilities;
- compact Context, stable handles, omission counts, and bounded Experience recall;
- Outcome coverage, generated progress, layered completion, worktree isolation, final-byte evidence, Success Capture, migration, repair, rollback, and uninstall protection.

Every retained capability needs a public-path black-box test. A new implementation may replace a named community Provider only when the replacement preserves or improves the capability contract and passes trigger, output, license, compatibility, and context-cost evaluation. Compatibility protects user outcomes and user data, not a historical filename or brand list.

The following product promises are not yet implemented end to end:

- durable project-level Decision Memory;
- privacy-safe raw-session reconciliation and post-compaction rehydration;
- Owner Correction Lock and rejection memory;
- Action Envelope checks against the approved correction or implementation contract;
- completion Claim Envelope and evidence-maturity vector;
- exact backend, process, database, dataset, Provider, and journey identity;
- Codex and Claude lifecycle interception;
- before-write and before-stop host gates;
- real-project failure replays through public host and package paths;
- deterministic `inspect` snapshots and the local cockpit;
- automatic self-governance status derived from current bytes and executed gates.

The current source check observed `214 passed / 1 failed`; the failure was the exact-package journey correctly refusing to package a dirty source tree containing uncommitted design work. This is not evidence of a released product defect, nor is it a passing release gate. Exact package verification must be rerun from a clean, reviewed source identity.

## 5. Alternatives and selected architecture

### 5.1 Stronger instructions only

Adding more text to `SKILL.md`, `AGENTS.md`, or `CLAUDE.md` is cheap and useful, but cannot stop a host thread that never re-enters VibeTether or ignores a boundary.

Verdict: retain as the advisory layer, reject as the complete solution.

### 5.2 Heavy orchestration platform

A daemon, database, remote registry, workflow service, and multi-package protocol could centralize more state. It would also create more installation, compatibility, migration, security, and product-scope failure before the single-repository use case is proven.

Verdict: defer.

### 5.3 Minimal coordinating kernel with truthful adapters

Keep one product and logically separate:

1. governance;
2. runtime;
3. Provider routing;
4. host adaptation;
5. deterministic inspection.

Add hard interception only where a host or external gate genuinely supplies it. Expose advisory or missing boundaries honestly.

Verdict: selected.

## 6. Product planes

VibeTether governs four user-visible planes and one adapter boundary.

### 6.1 Authority

Authority contains:

- raw request provenance;
- an optional attached host-owned local session source and reconciliation cursor;
- Intent;
- confirmed Truth;
- durable Decisions and rejected branches;
- required Outcomes and acceptance contracts.

Only the user or a predeclared deterministic authority contract may raise authority. Automation may propose candidates or lower trust after drift; it may not silently confirm a direction.

#### Truth bootstrap and lifecycle

A fresh installation creates an empty active Truth registry. It does not scan filenames and activate likely PRDs, ADRs, requirements, UI documents, or host instructions as product authority. The user may edit the entry list directly or ask the Agent to inspect the repository and propose candidates.

Candidate discovery inspects content rather than names and reports proposed role, scope, directionality, revision digest, applicability, conflicts, and reason. A document produced during an approved discussion is still a candidate until the user separately confirms its path, role, scope, and any supersession. Every active addition, removal, role change, scope change, reordering that changes precedence, and supersession requires a user-grounded decision. Automation may mark a changed source stale or blocked, but may not silently delete, decline, replace, or reactivate it.

Truth entries use stable logical IDs independent of path and revision digest. File and directory entries have bounded digest semantics; directory authority uses a Git tree or reviewed manifest rather than an unbounded filesystem scan. Applicability considers phase, operation, module, path, role, risk, and current slice. Any bounded response reports total, returned, omitted, and a stable continuation handle rather than silently truncating authority.

### 6.2 Execution

Execution contains:

- current task and bounded slice;
- adaptive or Deep control mode;
- Permit and Action Envelope;
- Route and one Primary Provider;
- worktree, lease, checkpoint, handoff, and integration status.

### 6.3 Proof

Proof contains:

- acceptance items;
- command, artifact, review, owner, and external-authority evidence;
- final project bytes;
- exact environment and running-process identity;
- Claim Envelopes and the strongest allowed verdict.

### 6.4 Experience

Experience contains reusable, evidence-backed procedure:

- candidate;
- proven;
- suspect;
- quarantined;
- superseded;
- retired.

Experience can guide procedure but never override Authority.

Before repeatable environment, build, authentication, CI, migration, recovery, deployment, publication, or release work, VibeTether queries applicable Experience and reads only the selected artifacts. If a matching path is not used, the route records why it is stale, incompatible, or inapplicable. A conflict between confirmed Truth and Experience blocks only the affected action, shows the mismatch, recommends the durable correction, and asks the user; Experience never wins by recency or prior success alone.

### 6.5 Host and external enforcement

Host adapters translate real host events into the kernel. CI, merge, deploy, publication, payment, data, or production adapters remain separate external authority boundaries. Missing enforcement is reported, not simulated.

### 6.6 Raw local session provenance

VibeTether does not build a conversation-memory database. When a host retains a local session file, the user may attach its exact path, session ID, or a deterministic host-provided current-session handle. VibeTether stores only local attachment metadata, cursor, identities, and digests; it never copies transcript bodies into tracked project state.

The session adapter reads visible user and assistant text only. System/developer messages, tool calls and outputs, private reasoning, compacted summaries, ambient UI state, plugin inventories, and injected workspace context are excluded or reported as ambiguous. Assistant text can explain a proposal but cannot authorize it.

Incremental reconciliation reads after the last confirmed cursor. A bounded full recheck rereads the attached visible conversation when the user requests self-audit, reports a misunderstanding or omission, the same alignment error repeats, the cursor is suspect, or a high-impact Start Card/completion claim depends on unresolved history. The result is a candidate Decision Diff and correction report; the user confirms the durable meaning. Missing, rotated, malformed, ambiguous, or identity-mismatched session files produce an explicit provenance blocker rather than a fabricated memory.

Large files are streamed through bounded windows and stable continuations; a resource limit reports incomplete coverage instead of silently calling a partial scan “full.” Codex JSONL is the first concrete adapter. Claude Code and other hosts advertise this capability only when a stable user-authorized local source and visible-message filter exist; otherwise control health shows raw-session replay as unsupported.

## 7. End-to-end control flow

```text
preserve the raw request or correction
-> reconcile newly visible session messages when attached or explicitly requested
-> inspect facts and applicable authority
-> expand observable Outcomes and hidden directional choices
-> reconcile durable Decisions and rejected branches
-> ask one highest-value user question when required
-> show a bounded Start Card, Acceptance Contract, or Correction Card
-> obtain explicit approval when direction is consequential
-> issue a digest-bound Permit and Action Envelope
-> route one Primary Provider
-> execute one smallest verifiable slice
-> bind evidence to final bytes and exact environment
-> adjudicate a typed Claim Envelope
-> update Outcome progress and generated projections
-> classify Success Capture
-> expose the result through Context, Doctor, and cockpit
```

The beginner experience remains:

```text
install
-> describe the work normally
-> answer one important question when needed
-> approve one clear contract when direction matters
-> see what is actually proved and what remains open
```

### 7.1 Task acceptance and lifecycle re-entry

Every consequential task derives a bounded Acceptance Contract from the raw request:

- exact requested outcome and literal operations;
- scope, non-goals, protected capabilities, and rejected strategies;
- applicable lifecycle domains;
- user-owned decisions versus discoverable facts;
- required Outputs, acceptance IDs, verification paths, and completion boundary;
- allowed paths, permissions, external effects, and worktree identity.

The normal entry may render this in one compact line for a clear, low-risk slice. Deep renders the full Start Card and waits for confirmation. Neither mode may turn request expansion into invented product authority.

VibeTether re-enters at task entry and every phase or slice transition, after compaction/resume/handoff, after correction or repeated failure, after relevant Truth/Decision/Outcome/Experience drift, and before merge, deployment, publication, release, or completion-like claims. Re-entry reloads the compact Context, rechecks applicable authority and Experience, and reruns capability routing. It is not a one-time Skill selection at the beginning of a long task.

The default lifecycle for a major feature is:

```text
DISCOVER -> ALIGN -> REQUIREMENTS -> DOMAIN/ARCHITECTURE
-> DATA/API -> UI/FLOWS -> PLAN -> EXECUTE_ONE
-> DIAGNOSE when needed -> VERIFY -> REVIEW -> INTEGRATE -> RELEASE -> LEARN
```

Only applicable domains are required; VibeTether does not impose a universal waterfall. Each transition closes the current Route's required outputs and exit evidence before selecting one Primary Provider for the next phase. Typical routes include requirements clarification or grilling, document/domain alignment, design, planning, TDD implementation, systematic debugging, browser verification, review, completion verification, migration, and release. Users do not need to know Provider names.

## 8. Adaptive work control

### 8.1 Lightweight Observation

Lightweight work is allowed for read-only investigation, explanation, and genuinely local, reversible edits that do not change public behavior, structure, authority, permissions, external state, or persistent coordination.

It performs a compact preflight and local verification. It still classifies Success Capture and checks whether an escalation signal appeared.

### 8.2 Controlled Session

A Controlled Session is required when work changes behavior, structure, authority, security, data, permissions, UI direction, architecture, migration, external state, release scope, or durable coordination.

Lightweight may escalate to Controlled before the next consequential action. The transition is one-way for the current task or slice. Pre-escalation mutations enter the controlled snapshot.

### 8.3 Deep mode

Deep mode is explicit or automatically recommended when prompt ambiguity can cause expensive rework. It must:

- investigate discoverable facts before asking;
- distinguish fact, confirmed Truth, assumption, recommendation, and user decision;
- expand the request without inventing authority;
- challenge the most expensive counterexample;
- ask one question at a time;
- obtain user approval of the final Start Card;
- prevent code-write until a current Permit exists.

### 8.4 Project-wide UI control branch

UI direction is a product decision, not a cosmetic implementation preference. Every user-visible application, dashboard, workbench, responsive flow, redesign, or screenshot-based reference follows:

```text
UI_DISCOVER
-> PRODUCT_UX_CONTRACT
-> REFERENCE_INTAKE
-> DESIGN_CONTRACT
-> GOLDEN_SCREEN_APPROVAL
-> IMPLEMENT_ONE_STATE
-> RENDER_AND_COMPARE
-> FUNCTIONAL_ACCEPTANCE + VISUAL_ACCEPTANCE
-> LOCK_AND_PROPAGATE
```

Reference intake records what to reproduce, adapt, intentionally differ from, defer, or reject; a reference's popularity or screenshot is not authority. The Design Contract freezes information hierarchy, required capabilities, typography, semantic color, density, spacing, components, motion/reduced motion, responsive behavior, accessibility, and anti-patterns. One representative golden screen or genuinely distinct low-cost directions receive user approval before the visual system spreads.

Use one aesthetic director, an engineering Provider, and independent validation where applicable; do not activate overlapping design Skills. Existing design systems take precedence unless the user approves replacement. Functional evidence covers real tasks, states, data/API behavior, accessibility, keyboard, console, and network health. Visual evidence separately covers hierarchy, density, alignment, tokens, reference intent, desktop/narrow behavior, state consistency, and capability preservation. Neither evidence axis substitutes for the other.

### 8.5 Context economy and re-anchor

Within one unchanged, approved, low-risk slice, VibeTether compares known fingerprints and rereads only affected confirmed sources, Decisions, Outcomes, selected Experience, and the active Provider. It does not replay the whole project or conversation before every edit or routine test.

A full re-anchor occurs on goal, phase, scope, risk, authority, source, correction, compaction, resume, handoff, worktree/integration, merge, deployment, publication, release, or stale-checkpoint boundaries. It reloads the host instructions, project manifest, Truth registry, Intent, Decision capsule, Outcomes, checkpoint, applicable confirmed sources and Experience, then reconciles them with current bytes and the raw request provenance.

Hard budgets remain regression limits rather than token-saving claims: each Entry Skill stays bounded, the Context Capsule remains compact, the Skill shortlist and recalled Experience bodies are at most three, and every truncated collection returns stable handles plus omission counts. State is queried, history is referenced, and Provider content remains cold until selected.

## 9. Adaptive Correction Protocol and Owner Correction Lock

This is the first new capability after RC4 stabilization.

### 9.1 Correction classes

| Class | Example | Behavior |
| --- | --- | --- |
| execution fault | quoting error, transient lock, retryable network failure | retry the same approved action without re-asking |
| bounded implementation defect | a test exposes a defect inside the approved slice | diagnose and repair without expanding the contract |
| alignment fault | wrong source, wrong scope, rejected UI, selected subset instead of full migration | freeze and require a reviewed Correction Card |
| structural or authority change | repository rebuild, architecture, Truth set, data model, permissions, release | freeze and require explicit approval |
| repeated correction | the same alignment issue is reported again | mandatory trust downgrade and independent scope review |

### 9.2 Correction transaction

On an alignment correction:

1. preserve the exact user message and its digest;
2. revoke the current Permit and mark the Route `broken-by-alignment`;
3. stop consequential mutation;
4. inspect the actual bytes and side effects read-only;
5. produce a Correction Card;
6. wait for explicit user confirmation;
7. issue a one-use Correction Permit;
8. execute only the approved delta;
9. verify the correction against the original user feedback;
10. retain the rejected strategy in Decision Memory.

### 9.3 Correction Card

The card contains:

- the original request and latest correction;
- the observed mismatch;
- current changed files, commits, branches, external effects, and recoverable backups;
- exact sources and destinations;
- preserve, remove, restore, and redo sets;
- the proposed minimal sequence;
- explicit non-goals and forbidden strategies;
- destructive or permission effects;
- acceptance evidence;
- rollback or conflict-preservation behavior;
- the strategies being rejected or superseded.

The user confirms one consolidated card, not every command.

### 9.4 Literal task fidelity

When the user specifies an exact source, target, operation, and non-goal, the Agent may not substitute summarization, selection, restructuring, scaffolding, or an allegedly better architecture. Safety-required preparation is allowed only when it is disclosed and does not change the requested result.

For example:

```text
copy exact file A to destination B
```

cannot become:

```text
select related documents
-> rewrite a concise version
-> place it in a newly invented hierarchy
```

### 9.5 Necessity gate

Every consequential action after correction must satisfy at least one condition:

- directly produces an approved output;
- obtains required acceptance evidence;
- is necessary to preserve user data or satisfy a non-overridable safety boundary.

Otherwise it is unapproved scope expansion and is blocked.

### 9.6 Trust downgrade

After one alignment failure, autonomy is reduced for the affected task. After the same correction fails twice:

- no further autonomous replanning is allowed;
- each new slice requires a reviewed Correction Card;
- the cockpit reports `REPEATED_ALIGNMENT_FAILURE`;
- completion requires an independent scope review or explicit owner waiver.

## 10. Durable Decision Memory and rehydration

Decision Memory records user-owned branch choices separately from Truth and Outcomes:

- proposed;
- confirmed;
- rejected;
- declined;
- withdrawn;
- superseded.

A decision uses a stable logical ID, revision digest, scope, lifecycle domain, provenance receipt, Truth-document synchronization status, and Outcome synchronization status.

The raw conversation is never project authority. An explicitly attached local session may be parsed for visible user and assistant messages only. The Agent proposes a bounded Decision Diff; the user confirms it. Raw text remains local provenance, while the durable registry stores only bounded decisions and digests.

After compaction, resume, or handoff:

- Context reloads applicable confirmed Decisions and rejected branches;
- a summary cannot delete or authorize a decision;
- unreconciled user messages block consequential work;
- a changed decision, document, Outcome, or cursor invalidates the Permit.

Detailed behavior remains governed by `2026-07-22-vibetether-decision-memory-design.md`.

## 11. Outcome completeness and progress

The existing Outcome layer remains the canonical completeness control.

### 11.1 Independent denominator

Completeness is measured against a user-reviewed source universe, not the Agent's selected implementation list. For stable-ID sources:

```text
source revision
+ exact ID count and set digest
+ reviewed mapping sidecar
+ explicit disposition for every ID
```

must match before coverage can be confirmed.

An implementation-derived whitelist plus a test that checks the same whitelist is circular evidence and cannot prove completeness.

### 11.2 Generated progress

`PROGRESS.md` is a deterministic projection of Outcome definitions and verified runtime receipts. It is never hand-maintained authority.

At each verified boundary, VibeTether updates atomically:

- Outcome progress;
- Route disposition;
- checkpoint;
- Success Capture disposition;
- generated progress projection.

If those disagree, completion blocks.

### 11.3 Layered completion

The canonical ladder is:

```text
START_CARD_CONFIRMED
-> PERMIT_VALID
-> SLICE_GREEN
-> GOAL_ENGINEERING_CLOSED
-> INTEGRATION_VERIFIED
-> EXTERNAL_EVIDENCE_VERIFIED when applicable
-> REVIEW_DISPOSITION_RECORDED when applicable
-> OWNER_ACCEPTED when applicable
-> RELEASE_READY
```

No lower state implies a higher state.

## 12. Action Envelope and routing

A consequential action is authorized by an Action Envelope bound to:

- raw request or Correction Card digest;
- applicable Decisions and rejected branches;
- authority and Outcome revisions;
- exact bounded slice;
- allowed and forbidden path scopes;
- action and permission classes;
- external-effect boundary;
- success checks and acceptance IDs;
- worktree and integration identity;
- expiry and control generation.

Before action, VibeTether returns `ALLOW`, `ASK`, `BLOCK`, or `ADVISE`.

Provider routing remains advisory and subordinate to the envelope. The catalog stays cold, the shortlist contains at most three candidates, and a controlled step activates one Primary Provider. A Skill can choose a method; it cannot broaden authority, weaken acceptance, or resurrect a rejected plan.

### 12.1 Provider ecosystem and project extension contract

The bundled ecosystem remains rich but cold. Installation, update, or explicit repair may resolve Provider packs; an active task may never silently download a new Provider. Optional absence uses a declared built-in fallback. A missing mandatory security, migration, UI-validation, or release capability blocks the affected boundary with an actionable repair path.

Each Provider record contains:

- capability contract, positive and negative triggers, required outputs, and exit evidence;
- supported hosts, operating systems, runtime constraints, context cost, conflicts, and permissions;
- source repository, requested reference, resolved immutable commit/tree, normalized content digest, and provenance;
- complete license evidence for redistributed content;
- declared scripts, allowed environment variables, network/external-write requirements, and activation lifetime;
- evaluation state and promotion status.

A tag or release name is discovery metadata, not an immutable identity. Import resolves it to a commit/tree and content digest; a moved tag is a new candidate, never a silent update. Archives have compressed/unpacked size, file-count, path-depth, compression-ratio, regular-file, traversal, link, device, ADS, reserved-name, and case-collision limits. Damaged or mismatched content is quarantined. Script execution inherits only an explicit minimal environment and does not claim OS sandboxing.

Provider Activation binds the active Route, Permit, worktree, authority revision, requested permissions, and expiry. It becomes invalid after Route satisfaction/abandonment/breakage, Permit revocation, authority or worktree drift, expiry, or Provider disablement.

The user-owned route overlay may add a primary, alternative, policy overlay, validator, required output, or evidence requirement. It may not remove or weaken Authority, readiness, Truth confirmation, high-risk, destructive-data, permission, evidence, correction, owner, merge, deployment, or release gates. The generated capability overview makes installed and custom capabilities discoverable to the Agent without loading all Skill bodies.

## 13. Evidence vector and exact environment

Evidence is preserved as independent axes:

| Axis | What it may prove |
| --- | --- |
| source structure | source or schema shape |
| unit behavior | isolated deterministic behavior |
| fixture journey | seeded or simulated product path |
| component integration | real component with declared injected boundaries |
| exact local environment | declared backend, database, process, config, and journey |
| external authority | production, deployment, payment, data, or service state |
| review | a scoped review with an honest independence label |
| owner acceptance | the exact user-owned visual or semantic decision |

Evidence is never averaged into one unqualified green percentage.

An exact environment receipt binds:

- worktree, HEAD, and dirty-byte digest;
- runtime and backend implementation;
- database or datastore identity without secrets;
- dataset/schema fingerprint when applicable;
- Provider/model class and pinned implementation when applicable;
- configuration class and feature flags;
- running process artifact/version;
- execution target or base-URL class;
- command or journey;
- generated and observed artifact digests.

Changing final bytes, process, configuration, database, Provider, or target invalidates only the affected evidence and claims.

## 14. Claim Envelope and adversarial adjudication

Agent prose is a claim, not authority or evidence. Material claims use a typed Claim Envelope containing:

- claim type and requested verdict;
- Outcome and acceptance IDs;
- Authority, Decision, Permit, worktree, environment, and final-byte digests;
- Evidence IDs;
- open blockers and unverified axes;
- review independence;
- enforcement-level limitations.

Claim types are non-substitutable:

- inspection complete;
- slice green;
- goal engineering closed;
- integration verified;
- owner accepted;
- deployment verified;
- release ready.

Before accepting a claim, VibeTether performs bounded adversarial adjudication:

```text
define claim
-> attack likely false-green assumptions
-> identify the authority for each disputed fact
-> execute or recompute the required checks
-> issue PASS, PASS_WITH_DEBT, or BLOCK for that scope only
```

No evidence means no `PASS`. Missing required evidence is a blocker, not debt.

## 15. Failure Generalization Gate

VibeTether must generalize from failures without hard-coding project names or exact filenames into the kernel.

### 15.1 Always-on invariant kernel

The small invariant set is:

1. existence is not activation, integration, acceptance, or completion;
2. completeness requires an independently declared denominator;
3. user rejection invalidates the rejected strategy and its Permit;
4. changing direction, source, structure, or acceptance requires a user-grounded decision;
5. self-derived scope plus a matching self-authored test cannot prove completeness;
6. action scope cannot exceed the approved envelope;
7. claim scope cannot exceed current evidence scope;
8. final-byte, environment, authority, or validator drift invalidates affected evidence;
9. delegated prose cannot close an unintegrated parent Outcome;
10. a second equivalent correction is a stop condition, not another autonomous retry.
11. a compacted summary, Decision projection, checkpoint, or Agent-authored memory cannot prove that it faithfully represents earlier user messages;
12. when misunderstanding, omission, or self-audit is disputed, the review source is the attached raw visible session range, not another summary of the current summary.

### 15.2 Failure Cards

Each sanitized case records:

- failure family;
- trigger conditions;
- violated invariant;
- misleading evidence or rationalization;
- costly counterexample;
- required detection;
- required action or claim verdict;
- recovery contract;
- reusable variants;
- source evidence handles without private transcript content.

Cards remain cold. At a consequential boundary the semantic layer retrieves at most three analogous cards; deterministic gates enforce the invariant rather than trusting the analogy.

### 15.3 Replay and metamorphic evaluation

Every expensive failure becomes a black-box replay through public CLI, installed Skills, host adapters, and Doctor. The corpus includes:

- short-context and long-context versions;
- Chinese and English prompts;
- should-trigger, should-not-trigger, near-miss, and held-out sets;
- the same invariant transformed across documents, code, UI, database, deployment, migration, and release;
- literal-copy versus selected-migration attacks;
- source-universe omission and circular whitelist proof;
- wrong environment and stale process;
- rejected strategy resurrection;
- summary omission and compaction recovery;
- summary-on-summary self-audit versus raw-session recheck;
- user correction whose decisive message predates the confirmed reconciliation cursor;
- delegated claim without integrated bytes;
- local green with parent Outcomes open.

Fixed cases are regression evidence, not a claim of universal zero-shot accuracy.

## 16. Host enforcement

VibeTether exposes the actual installed control level.

### Level 1: Advisory

- Entry Skills;
- managed `AGENTS.md` and `CLAUDE.md` blocks;
- Context, Route, and Doctor commands.

### Level 2: Guarded host

Where supported:

- session entry;
- user request and correction;
- before consequential action;
- after mutation;
- before and after compaction;
- delegate start and stop;
- permission request;
- before stop or completion-like output.

### Level 3: External hard gate

- CI and protected branch;
- merge, deployment, publication, and migration;
- production, payment, or data authority adapters;
- independent owner authorization.

The installer offers `Guarded`, `Advisory`, or `Skip host integration`, safely merges namespaced configuration, backs up affected files, fingerprints owned entries, preserves unrelated hooks, supports dry-run/repair/uninstall, and reports:

```text
ENFORCED | PARTIAL | ADVISORY | STALE | INCOMPATIBLE | UNENFORCED
```

If a host cannot intercept an event, VibeTether must not claim that event is enforced.

## 17. Lifecycle event behavior

| Event | Required action |
| --- | --- |
| task entry | health, Authority, Decisions, Outcomes, Experience, and stale-state check |
| user request | preserve request, classify impact, choose lightweight or Deep |
| user correction | classify execution versus alignment fault; invoke Correction Lock when needed |
| before action | validate Permit, Action Envelope, rejection memory, scope, and permission |
| after mutation | record changed paths and invalidate affected state |
| before compaction | reconcile visible Decisions and persist bounded recovery state |
| after compaction | rehydrate durable state; never trust summary alone |
| delegate start | issue bounded handoff outputs, paths, and accepted claim scope |
| delegate stop | verify returned bytes, evidence, blockers, and integration state |
| permission request | compare requested capability with approved risk and external effects |
| before stop | adjudicate Claim Envelope and refresh progress/experience disposition |

## 18. VibeTether self-governance

VibeTether must govern its own repository before claiming that it can govern others.

Required self-controls are:

- a current, repository-owned Project Contract rather than stale parent-project state;
- generated capability status derived from public commands and executed gates;
- plans reconciled with current commits and Outcome state;
- design-only rows never displayed as implemented;
- every release claim bound to one clean commit, exact ZIP/TGZ, and package journey;
- Windows and Ubuntu Node 20/24 results recorded as executed or unproven;
- exact v0.6.3 migration and rollback evidence;
- independent review on the exact candidate bytes;
- uncommitted user work preserved and excluded from clean-package claims.

A stale plan checkbox, capability document, or verification report is itself a control-health finding.

## 19. Deterministic inspection and lightweight cockpit

The cockpit is implemented only after the underlying state is queryable and tested.

The canonical read model is:

```text
vibetether inspect --project . --json
vibetether inspect --project . --handle <stable-handle> --json
```

One immutable snapshot generation joins:

- Authority;
- Execution;
- Proof;
- Experience;
- changed files and impact;
- worktrees and unintegrated contributions;
- enforcement health;
- strongest allowed verdict;
- blockers, warnings, omissions, and continuations.

The local UI uses Node.js built-ins and packaged static assets, binds to `127.0.0.1`, makes no outbound request, has no daemon or database, and is read-mostly.

The first release shows:

- current goal and confirmed direction;
- Truth and Decision changes;
- rejected strategies and active Correction Lock;
- Outcome progress with explicit denominator;
- evidence vector and exact-environment freshness;
- current Permit, Route, Provider, worktree, and handoff;
- unintegrated work;
- Experience candidates or stale paths;
- strongest allowed claim and exact blockers;
- observation and enforcement limitations.

No card may derive a verdict from model prose, a caller-supplied `PASS`, CSS markers, or browser storage. A failed refresh preserves the previous snapshot only with a page-wide `STALE` marker.

The cockpit may refresh, open a source, copy a stable handle, regenerate an owned projection after validation, or generate a bounded “ask the Agent to address this” prompt. It does not directly approve Truth, change Intent, accept Decisions, defer Outcomes, merge, deploy, or release in its first version.

## 20. Experience and first-success retention

Every verified result receives a quick classification:

- routine non-path;
- unchanged repeat;
- first reusable path;
- recovered path;
- materially changed reusable path.

A candidate is generated only when fresh evidence exists and the procedure is reusable, non-obvious, or costly to rediscover. It records decisive conditions, bounded sequence, environment class, evidence handles, and validated artifacts without secrets or transcript bodies.

Candidates remain non-authoritative until user confirmation. Drift in Authority, Provider, environment, validator, artifact, or evidence lowers trust to suspect or quarantined; it never silently deletes or upgrades experience.

Capture and recall are separate gates. Capture decides whether a newly verified result deserves a sanitized candidate. Recall runs before a repeatable operational path and returns only compatible metadata and artifact handles. The Agent reads the selected procedure before inventing a new path, revalidates provisional or drifted entries, records why an apparently matching path was not used, and never treats a prior success as current evidence.

First, recovered, and materially changed paths are proposed automatically but activated only with user confirmation. Routine actions and unchanged repeats do not create noise. A failed or contradicted Proven Path is downgraded to suspect or quarantined; deletion, permanent retirement, or semantic replacement requires user approval or an already approved supersession policy.

## 21. Security, privacy, and safety

VibeTether never persists:

- credentials, private keys, one-time codes, or secret environment values;
- private reasoning or raw ReAct traces;
- raw provider payloads;
- full private transcripts;
- unredacted external connection strings;
- unsafe archive members or special files.

Raw session readers are local provenance adapters, not authentication boundaries. Tracked files contain bounded decisions and digests only. External authority checks redact secrets while preserving identity and freshness.

Destructive operations, data changes, migration, permission expansion, external writes, deployment, publication, merge, and release always use explicit authorization. Correction does not authorize destructive rollback automatically.

## 22. Failure and recovery rules

| Failure | Required behavior |
| --- | --- |
| source, decision, or Outcome changes during work | invalidate affected Permit, progress, and evidence |
| correction changes the approved strategy | revoke old Correction Permit and ask again |
| user edits after migration | stop overwrite and preserve before/output/current variants |
| process or database identity cannot be observed | mark exact-environment axis unknown; do not pass it |
| hook missing or disabled | degrade control health; do not show guarded status |
| snapshot generation fails | retain prior view as stale; publish no partial generation |
| runtime or projection corrupt | quarantine and rebuild only from valid receipts |
| worktree moved or pruned | update locator or mark unknown; never borrow another worktree's state |
| conflicting worker findings | retain one blocker ledger until reproduced, disproved, or fixed |
| same alignment correction repeats | stop autonomous execution and require independent scope review |
| package verification sees dirty source | refuse candidate creation and name the dirty paths |

### 22.1 Beginner installation and documentation contract

The first README path is the smallest safe command for a verified package or immutable source. Guided interactive setup presents recommended choices and their effects for host, control mode, Provider profile, optional bundles, and guarded host integration. Advanced customization, route overlays, offline/manual installation, repair, migration, and uninstall follow afterward rather than obscuring the default path.

The installer and documentation must cover:

- Codex, Claude Code, or both, with formal support and truthful event limitations;
- normal adaptive and explicit Deep entry examples in natural language;
- a new directory, an existing repository, and an already customized installation;
- empty active Truth on first install and natural-language candidate review;
- capability overview, Provider packs, custom routes, and fallback behavior;
- immutable package/source verification and no floating-ref trust claim;
- offline cache, codeload/package alternatives, transient TLS retry, Windows `EPERM`/lock recovery, transaction repair, and preservation of modified installed assets;
- health, dry-run, upgrade, rollback, repair, and uninstall commands;
- the difference between advisory, guarded, partial, and external hard-gate control;
- the fact that VibeTether can reduce costly drift and rework but does not guarantee perfect understanding, honesty, correctness, or net token savings.

README examples lead with user situations rather than internal lifecycle vocabulary: vague project, clear local fix, UI redesign, compaction/resume, correction, first proven path, goal completion, and release. The message may position VibeTether for stronger Agents such as GPT-5.6-class or Fable-class systems while making clear that capability strength does not remove long-task alignment and evidence problems.

## 23. Staged delivery

No stage may claim a later stage is complete.

### Stage 0: RC4 stabilization and self-control baseline

Deliver:

- reconcile current plans, capability status, docs, and source bytes;
- freeze the baseline non-regression inventory for adaptive/deep entry, Truth, routing, UI, Provider packs, context budgets, Outcome, Evidence, Experience, worktrees, and recovery;
- restore or preserve the complete project-wide UI control loop and phase-reentry capability contracts;
- verify fresh-project Truth behavior, custom route overlays, Provider provenance/security, and Proven Path recall;
- rewrite the beginner README so the shortest verified install path, normal/deep examples, customization, and honest limitations are explicit;
- preserve and review all existing uncommitted work;
- run clean exact-package journey;
- run live v0.6.3 migration/rollback;
- complete Ubuntu/Windows Node 20/24 matrix;
- create an independent review branch and exact evidence record;
- attach a current VibeTether Project Contract to its own repository.

Exit:

- clean candidate identity;
- no stale self-status;
- every retained public capability has a passing package-path non-regression journey;
- no first install activates repository documents or silently downloads a runtime Provider;
- UI design cannot propagate without its golden-screen and dual-acceptance gates;
- package, migration, rollback, and matrix evidence are current;
- no merge to `main` or formal release without separate authorization.

### Stage 1: Correction and failure-generalization kernel

Deliver:

- correction-event schema and classifier;
- Correction Card, rejection memory, and one-use Correction Permit;
- Action Envelope and necessity gate;
- trust downgrade and repeated-correction stop;
- Failure Card registry and invariant kernel;
- sanitized LoveBuddy, GYWS, GPT Pro, installation, and delegated-work replays.

Exit:

- literal-copy cannot become selected migration;
- rejected plans cannot silently return;
- execution faults retry without unnecessary user interruption;
- alignment faults cannot mutate before confirmation;
- short- and long-context variants pass.

### Stage 2: Decision Memory and rehydration

Deliver:

- Decision registry and generated projection;
- document and Outcome synchronization;
- Codex visible-session provenance reader;
- explicit local session attachment by path, session ID, or deterministic host handle;
- incremental reconciliation plus bounded full-session recheck for user-requested self-audit, correction, repeated failure, and untrusted cursors;
- bounded reconciliation cursor and Decision Diff;
- compaction, resume, and handoff rehydration;
- Permit, Route, Evidence, and Doctor binding.

Exit:

- a confirmed or rejected decision survives a new process and compaction;
- assistant proposals and summaries cannot authorize work;
- a user-requested whole-session review reads original visible messages, reports coverage/omissions, and does not depend on a transcript database or Agent-authored summary;
- missing, rotated, malformed, or ambiguous session provenance blocks instead of fabricating remembered decisions;
- pending or stale synchronization blocks consequential action.

### Stage 3: Claim integrity and exact proof

Deliver:

- Claim Envelope;
- evidence vector;
- exact runtime, process, database, dataset, Provider, and journey receipts;
- affected-evidence invalidation;
- before-stop adjudication in a fake-host conformance adapter;
- integration and independent-review labels.

Exit:

- fixture, source-regex, injected, wrong-database, stale-process, and post-test-change replays all produce bounded verdicts;
- an unintegrated external-agent report cannot close the goal;
- stronger completion language is rejected at every lower ladder state.

### Stage 4: Host adapters and guarded installation

Deliver one host at a time:

- host-neutral dispatcher;
- actual supported Codex events and truthful limitations;
- guarded installer, health, repair, and uninstall;
- safe Provider-profile installation and custom-route preservation without runtime downloads;
- actual supported Claude events and truthful limitations;
- bypass, disabled-hook, compaction, correction, permission, and stop tests.

Exit:

- guarded events truly block in the supported host;
- missing events render `PARTIAL` or `UNENFORCED`;
- user configuration and unrelated hooks survive install, repair, upgrade, and uninstall.

### Stage 5: deterministic inspect substrate

Deliver:

- immutable snapshot generations;
- four-plane joins;
- impact invalidation;
- worktree aggregation;
- stable handles, pagination, redaction, and omission counts;
- CLI-only black-box inspection tests.

Exit:

- every displayed field has a deterministic source;
- changed Truth, Decisions, Outcomes, code, tests, environment, and worktrees produce the correct downstream status;
- no UI code is required to prove the dataset.

### Stage 6: lightweight local cockpit

Deliver:

- local HTTP/SSE server;
- packaged static UI;
- approved overview screen with real snapshot data;
- Direction, Progress, Evidence, Changes, Worktrees, and Experience drill-downs;
- desktop and narrow browser verification;
- static read-only report export.

Exit:

- every value drills down to stable handles;
- stale, unknown, excluded, and unenforced states are explicit;
- no visible percentage or badge overstates its denominator or maturity;
- the existing adaptive, Deep, routing, Outcome, Evidence, and Success Capture journeys remain green.

### Stage 7: optional external adapters

Only after the core proves stable, consider:

- GPT Pro or other external-model candidate-delivery adapters;
- CI/merge/deploy adapters;
- project-specific source-ID, environment, or owner-acceptance adapters.

An external model may return a candidate patch, manifest, tests, and claims. VibeTether imports, reviews, integrates, and re-verifies the final bytes. External prose never closes a parent goal.

## 24. Conformance and release gates

The release program uses separate profiles:

1. beginner UX;
2. Authority, Truth bootstrap, and lifecycle;
3. Decision Memory, raw-session provenance, and rehydration;
4. correction and rejection integrity;
5. lifecycle routing, Context economy, and UI control;
6. host adapters;
7. Provider packs and project extensions;
8. Experience capture and recall;
9. evidence and claims;
10. runtime and fault recovery;
11. migration and rollback;
12. cockpit integrity;
13. real-project failure replay.

Formal promotion requires:

- exact ZIP and TGZ testing from final bytes;
- clean source identity;
- real Ubuntu and Windows Node 20/24 matrix;
- exact live v0.6.3 migration and rollback;
- package install, launcher, upgrade, repair, and uninstall journeys;
- natural-language routing from raw prompts without caller-supplied phase/capability labels;
- bilingual train/held-out, should-trigger, should-not-trigger, near-miss, unknown-task, explicit-provider, ambiguous-provider, correction, and compaction cases;
- repeated runs for model-mediated entry behavior, reporting false-start, missed-question, unnecessary-question, wrong-route, premature-claim, and recovery rates rather than claiming universal accuracy;
- comparative beginner journeys for no VibeTether, adaptive VibeTether, explicit Deep, and a specialist Skill alone, without using net token savings as a release KPI;
- project-wide UI journeys with approved golden direction plus separate functional and visual evidence;
- incremental and full local-session recheck, including injected-context exclusion, missing source, file rotation, malformed interior records, and omission reporting;
- fault injection and adversarial security tests;
- independent source and product review;
- no unresolved release-required Outcome or acceptance item;
- explicit release authorization.

Passing does not prove universal semantic correctness. It proves that the declared capabilities and known expensive failures have executable boundaries.

## 25. Explicitly deferred scope

The following remain outside the approved delivery unless new user evidence reopens them:

- daemon or background service;
- database-backed runtime;
- remote project-management platform;
- multi-project portfolio dashboard;
- multi-package protocol ecosystem;
- custom cryptographic trust infrastructure;
- self-built TUF or claimed SLSA compliance;
- remote dynamic Provider registry service;
- automatic semantic edits to user-authored Truth;
- unrestricted autonomous deletion or rollback;
- browser-driven GPT Pro control as a core dependency;
- claims of universal zero-shot correctness, guaranteed honesty, or guaranteed token savings.

## 26. Honest public positioning

Recommended public language:

> VibeTether helps capable coding agents stay aligned during long tasks. It checks project facts before consequential work, asks for the decisions the user actually owns, routes one suitable method, preserves progress and proven paths, and limits completion claims to what current evidence really proves.

Optional stronger-Agent positioning:

> Built for GPT-5.6- and Fable-class coding agents: not because they lack implementation ability, but because long tasks still lose decisions, drift from project authority, skip useful Skills, forget proven paths, and overstate local success.

The README must state:

- no-hook hosts depend on Agent cooperation;
- guarded status applies only to events the host actually exposes;
- VibeTether is not an OS sandbox or production authority;
- it can reduce expensive drift and rework but cannot guarantee perfect understanding;
- rich Provider capability stays cold until selected;
- local raw-session recheck uses host-owned files on demand and does not create a transcript database;
- the invariant kernel is domain-neutral, while formal 1.0 support and conformance remain coding-first for Codex and Claude Code;
- the cockpit is a projection of deterministic state, not an AI opinion dashboard.

## 27. Session decision coverage

This table prevents a later implementation from keeping only the new kernel while dropping earlier approved product outcomes. It is a bounded design trace, not a substitute for raw-session provenance or user review.

| Session theme | Governing contract |
| --- | --- |
| beginners should not need to know Skill names | beginner flow, lifecycle routing, capability overview, one Primary Provider |
| long tasks and goal mode must not drift after compaction | Decision Memory, raw-session reconciliation, re-anchor, host events |
| clear local work should remain lightweight | adaptive Lightweight mode and proportional preflight |
| ambiguous or costly work must wait for understanding and confirmation | Deep Start Card, one-question interview, Permit and Acceptance Contract |
| repository facts must be investigated before asking the user | Deep fact inspection and readiness classification |
| project documents must govern only after explicit confirmation | empty fresh Truth registry and full candidate lifecycle |
| the Agent must reread applicable rules at meaningful boundaries | lifecycle re-entry and compact/full re-anchor |
| architecture, data, API, UI, security, permissions, migration, and release need owner decisions when applicable | lifecycle applicability matrix and Action Envelope |
| UI must not drift into an Agent's aesthetic preference | project-wide UI control branch, golden screen, tokens, dual acceptance |
| community/high-adoption Skills should be reused without flooding context | rich cold Provider catalog, packs, immutable provenance, shortlist |
| users need custom Skills and routes | project-owned overlay that may strengthen but not weaken gates |
| a user correction must change the next action, not only the explanation | Owner Correction Lock, Correction Card, rejected-strategy memory |
| the same correction must not trigger endless autonomous replanning | trust downgrade and repeated-correction stop |
| fixed examples must generalize to new projects and work types | invariant kernel, Failure Cards, metamorphic short/long and cross-artifact replay |
| local green must not become whole-product completion | independent Outcome denominator and layered completion ladder |
| changed or weakened tests must not preserve false progress | acceptance migration, Outcome revision, positive/negative replacement evidence |
| subagent or GPT Pro reports must not close parent work | handoff scope, integration-worktree final bytes, untrusted Claim Envelope |
| “real” evidence must identify the real backend, process, database, Provider, and journey | independent evidence vector and exact-environment receipt |
| model prose must be attacked rather than trusted | adversarial Claim adjudication with bounded PASS/PASS_WITH_DEBT/BLOCK |
| a first successful operational path must not be forgotten | automatic candidate capture, user activation, targeted recall, invalidation |
| model-compressed memory must not review itself | host-owned raw session provenance, full recheck, anti-summary-on-summary invariant |
| progress and all VibeTether-owned control files should update coherently | atomic verified transitions and generated projections |
| users need a trustworthy lightweight cockpit | deterministic inspect snapshot, read-mostly local Web UI, stable drill-downs |
| VibeTether must govern its own plans, code, package, and claims | self-hosted Project Contract, generated status, exact package/matrix review |
| installation must be simple and recoverable | shortest verified command first, guided choices, offline/TLS/Windows repair |
| hooks should improve enforcement without fake guarantees | advisory/guarded/external levels and truthful degradation |
| powerful future models do not remove the alignment problem | honest stronger-Agent positioning without correctness or token-saving guarantees |
| non-coding work should benefit without bloating 1.0 | domain-neutral invariants, coding-first formal conformance, explicit later adapters |
| browser-driven GPT Pro control may help but must remain optional | Stage 7 candidate adapter; never a core authority or completion source |

## 28. Design exit contract

After explicit user approval of this exact written specification, it authorizes staged implementation planning for Stages 0 through 6 and optional design exploration for Stage 7. Until that approval, it remains a design-review artifact. It does not authorize:

- product-code implementation before a reviewed implementation plan;
- migration of live user projects;
- merge to remote `main`;
- release, tag, deployment, publication, or external data transmission;
- silent modification of existing uncommitted design work.

Each stage requires its own bounded implementation plan, known-failure RED, public-path GREEN, exact completion claim, and user review before the next stage.

The first implementation plan must cover Stage 0 only. Stage 1 planning begins only after the clean RC4/self-control baseline is reviewed; later stages cannot be bundled into one execution window.
