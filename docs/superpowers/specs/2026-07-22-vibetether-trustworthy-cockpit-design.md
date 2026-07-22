# VibeTether Trustworthy Cockpit Design

- Status: approved design; implementation planning pending written-spec review
- Decision owner: project user
- Date: 2026-07-22
- Target: post-RC4 staged delivery
- Scope: project-wide observation, four-plane governance, deterministic snapshots, impact invalidation, and a lightweight local Web cockpit
- Approval basis: the user approved a lightweight single-project cockpit, full Git change observation, four-plane governance, deterministic data sources, local Web delivery, and staged implementation in the current session

## 1. Product objective

VibeTether exists to help beginners and experienced users keep capable coding Agents such as Codex and Claude Code aligned during long, multi-phase Vibe Coding work.

The cockpit is not a second project manager and is not a prettier progress report. It is the human-visible projection of VibeTether's control state:

```text
what the user approved
-> what currently governs the project
-> what the Agent is allowed to do next
-> what result remains open
-> what current evidence actually proves
```

The highest product invariant is:

> VibeTether cannot prevent a model from generating an unsupported sentence, but it must prevent an unsupported statement from being accepted as aligned, complete, verified, integrated, deployable, or releasable.

Agent prose is a claim, not authority and not evidence. The strongest verdict shown by the cockpit is computed from current project authority, current worktree bytes, declared acceptance contracts, and fresh evidence.

## 2. Honest boundary

The target is a trustworthy and accurate cockpit, not an absolute enforcement claim.

VibeTether can:

- require a cooperating Agent to inspect facts and project authority before consequential work;
- ask one user-owned decision at a time when direction is unresolved;
- keep confirmed decisions, outcomes, execution state, and evidence outside conversational memory;
- invalidate stale Permits, progress, and evidence after relevant changes;
- expose precisely what remains unknown, open, stale, blocked, unintegrated, or unverified;
- make unsupported completion claims visibly conflict with the strongest evidence-backed verdict.

VibeTether cannot:

- force a host that provides no hook and never invokes VibeTether to cooperate;
- cryptographically prove that an ordinary host message was authored by a human without a trusted host boundary;
- infer the complete semantic meaning of arbitrary source-code or prose changes deterministically;
- prove production, deployment, payment, or owner satisfaction without an applicable authority adapter or explicit user decision;
- guarantee that an unregistered requirement does not exist.

The UI must show these limits as coverage and freshness, not hide them in documentation.

## 3. Preserve the existing VibeTether product

The cockpit extends rather than replaces the control kernel. The following capabilities remain mandatory:

1. adaptive entry for clear, low-risk work;
2. Deep entry for fact checking, requirement expansion, questioning, and explicit implementation permission;
3. Intent, confirmed Truth, candidate isolation, and authority conflict handling;
4. durable Decision Memory and rehydration after compaction, resume, and handoff;
5. capability-based Skill routing with one Primary Provider per controlled step;
6. smallest-verifiable-slice control;
7. Goal and Outcome coverage with exact source-ID accounting when available;
8. per-worktree runtime isolation and integration-worktree closure;
9. evidence bound to current authority and final project bytes;
10. slice, goal, review, owner, and release verdict separation;
11. Success Capture and evidence-aware Experience invalidation;
12. migration, rollback, uninstall, provider-integrity, and Windows recovery protections.

No cockpit action may weaken one of these gates.

## 4. Anti-anchoring rule

Frameworks, plans, patterns, Skills, prior Agent conclusions, and this design are tools or hypotheses rather than authority. VibeTether must re-check them against current user intent, confirmed project truth, observed bytes, and counterexamples.

The operative instruction is:

> 辨证地看待现有框架，实事求是；框架、计划、模式和既有 Agent 结论都只是工具或假设，不是权威。

This does not authorize unbounded redesign. A conflict becomes a bounded finding, an impact report, and a user-owned decision when direction is affected.

## 5. Scope model: full observation, four-plane governance

### 5.1 Full observation

For the current repository and every attached Git worktree, VibeTether observes:

- Git-tracked file additions, removals, renames, and content changes;
- non-ignored untracked files;
- VibeTether Project Contract and generated projection changes;
- worktree, branch, HEAD, index, and content-sensitive dirty state;
- VibeTether runtime changes and handoffs.

Default exclusions are `.git` administration data, Git-ignored dependencies and caches, secrets, provider caches, external paths, and unsupported special files. The cockpit displays the exact observation coverage and excluded classes. A registered Truth source remains governed by its Truth contract even when it needs an explicit safe reader.

Full observation does not mean reading every file body on every refresh. Git inventories identify changed paths; VibeTether fingerprints and parses only the changed or governing assets required for the new snapshot.

### 5.2 Four governance planes

VibeTether governs only four product concerns:

1. **Authority** — Intent, Truth, Decisions, and Outcomes.
2. **Execution** — current slice, Route, Permit, Lease, Worktree, Provider, and handoff.
3. **Proof** — Acceptance, Evidence, review disposition, owner acceptance, and release authorization.
4. **Experience** — candidate, proven, suspect, quarantined, superseded, or retired reusable paths.

Requirements, designs, plans, code, tests, CI files, documentation, and release artifacts do not become parallel management systems. They are sources, mappings, execution artifacts, or evidence connected to these four planes.

## 6. Change and invalidation rules

Every observed change receives an observation record. Deeper effects depend on an explicit relation or a safe fail-closed rule.

### 6.1 Exact impact available

When a changed asset is linked through Truth scope, Decision document sync, Outcome authority, acceptance coverage, route output, or Evidence artifact digests, VibeTether invalidates only the linked downstream state.

### 6.2 Directional impact unknown

When a confirmed directional source changes but no exact impact mapping exists:

- mark the source `changed`;
- invalidate active Permit and Route state inside its declared scope;
- mark potentially governed Outcomes and Evidence `stale-impact-unknown`;
- block consequential work for that scope;
- ask the Agent and user to classify the change and approve the resulting Decision/Outcome diff.

The system must not guess that the change is harmless.

### 6.3 Ordinary implementation change

A code or test change that does not alter authority does not create a new product decision. It does invalidate Evidence whose final-byte or covered-path contract predates the change. Progress remains open or stale until the relevant validator is run again.

### 6.4 New or unregistered document

The document appears in the change view as observed and unclassified. It may be proposed as candidate Truth or Decision evidence, but it cannot govern work automatically.

### 6.5 Integration boundary

Evidence from a sibling worktree may prove its bounded contribution. It cannot close the parent goal until those exact bytes are present and reverified in the designated integration worktree.

## 7. Deterministic snapshot contract

The cockpit consumes one versioned read model rather than reading project files independently.

The CLI adds:

```text
vibetether inspect --project . --json
vibetether inspect --project . --handle <stable-handle> --json
```

The top-level snapshot contains:

```json
{
  "schema_version": 1,
  "snapshot_id": "sha256:...",
  "generation": 42,
  "generated_at": "ISO-8601",
  "project": {},
  "coverage": {},
  "authority": {},
  "execution": {},
  "proof": {},
  "experience": {},
  "changes": {},
  "worktrees": [],
  "allowed_verdict": "SLICE_GREEN",
  "blockers": [],
  "warnings": [],
  "continuations": []
}
```

All cards in one rendered cockpit use the same `snapshot_id` and generation. If a dependent reader fails, the new generation is not presented as current. The previous snapshot may remain visible only with a page-wide `STALE` marker and the exact failed source.

### 7.1 UI data-source mapping

| Cockpit element | Deterministic source |
| --- | --- |
| Project, branch, and Worktree | Git plus VibeTether stable Worktree identity |
| Last observed | snapshot generation time |
| Last verified | latest still-valid Evidence or completion seal |
| Overall blockers | current Truth, Decision, Outcome, Permit, Evidence, and Doctor findings |
| Direction status | Intent, Truth, and Decision registry |
| Goal progress | Outcome Contract plus per-worktree Outcome Progress |
| Proof maturity | Acceptance items and Evidence receipts |
| Execution status | Route, Permit, Lease, Checkpoint, Provider, and handoff |
| File changes | tracked and non-ignored untracked Git inventory |
| Impact | explicit authority, Outcome, acceptance, route, and Evidence relations |
| Agent/worktree state | per-worktree runtime plus integration projection |
| Experience | Experience registry and validation status |

Model summaries, card-local caches, CSS markers, and caller-supplied `PASS` fields are prohibited data sources.

## 8. Components

The implementation contains five bounded modules:

### 8.1 Snapshot Engine

Loads and validates Git observations plus all four VibeTether planes. It produces the immutable generation consumed by CLI and Web views.

### 8.2 Impact Engine

Uses explicit stable IDs and scope relations to propagate `STALE` and `BLOCKED`. It never uses an LLM inside the deterministic CLI. Unknown directional impact follows the fail-closed rule above.

### 8.3 Worktree Aggregator

Enumerates attached worktrees through Git, resolves their stable VibeTether IDs, loads bounded runtime projections, and identifies the integration worktree. Missing, moved, pruned, foreign-repository, or inaccessible entries receive explicit states.

### 8.4 Local Dashboard Server

Uses Node.js built-ins only. It binds to `127.0.0.1` on a random available port, serves versioned static assets, exposes the snapshot API, and emits snapshot-invalidated events through SSE.

### 8.5 Static Dashboard UI

Uses packaged HTML, CSS, and browser JavaScript with no framework runtime, build service, Electron, Tauri, database, or remote dependency.

## 9. Delivery shape

The beginner command is:

```bash
vibetether dashboard
```

Supporting commands are:

```bash
vibetether dashboard --project . --no-open
vibetether dashboard --project . --port 0
vibetether dashboard snapshot --project . --output vibetether-report.html
```

The process exists only while the command runs. There is no installed service or daemon. The static snapshot command produces a portable read-only report whose header identifies the generation and states that it does not update live.

## 10. Main interface

The approved main screen is:

```text
┌ VibeTether · project · worktree · observed/verified freshness ┐
│ strongest allowed verdict · blockers · coverage limitations   │
├───────────────────────────────────────────────────────────────┤
│ Authority       │ Goal progress    │ Proof       │ Execution  │
├───────────────────────────────┬───────────────────────────────┤
│ Current goal and Outcomes     │ Latest changes and impacts    │
│ verified / open / stale       │ changed / unknown / blocked   │
├───────────────────────────────┴───────────────────────────────┤
│ Worktrees · unintegrated work · Experience alerts             │
└───────────────────────────────────────────────────────────────┘
```

The navigation is limited to:

- Overview;
- All Changes;
- Direction;
- Progress;
- Evidence;
- Experience.

Every number and verdict supports drill-down through stable handles. The cockpit does not display a single unqualified completion percentage. If a ratio is useful, it names its numerator, denominator, excluded items, and maturity level.

## 11. Visual direction

The cockpit uses a restrained light technical-console language:

- system fonts and no downloaded font dependency;
- off-white surfaces, dark navy text, blue/cyan interaction accent;
- green only for current verified claims, amber for decisions or freshness debt, red for blockers, and gray for unknown or excluded state;
- compact 8-pixel spacing rhythm, thin borders, minimal shadow, and high information clarity;
- small pixel-like status lamps as a distinctive accent, not a game aesthetic;
- motion limited to snapshot refresh, expanded details, and new-change emphasis, with reduced-motion support;
- desktop-first layout with a stacked narrow view; no mobile editing requirement.

The representative overview screen is the golden screen. A visual pattern may not spread to every detail view before this screen has real data, desktop and narrow captures, functional verification, and visual acceptance.

## 12. User actions

The cockpit is read-mostly.

Safe actions are:

- refresh or rescan;
- regenerate an owned projection after ownership validation;
- copy a stable handle, path, or evidence reference;
- copy a bounded “ask the Agent to handle this” prompt containing facts and handles;
- open or reveal a source file;
- change local filters, density, and display preferences;
- add a local non-authoritative candidate memo.

The first release does not directly confirm Truth, change Intent, approve a Decision, defer an Outcome, satisfy Evidence, merge, deploy, or release. Those actions remain in the Agent/CLI confirmation path. A file edited through an external editor is detected as changed and passes through the same reconciliation gates.

Generated projections such as `DECISIONS.md` and `PROGRESS.md` can be regenerated but never hand edited through the cockpit.

## 13. Update model

While the cockpit is running:

```text
filesystem or runtime hint
-> 500 ms debounce
-> full bounded snapshot recomputation
-> generation and digest validation
-> old/new snapshot diff
-> SSE snapshot-invalidated event
-> client fetches and atomically switches generation
```

File watchers are hints rather than authority. A periodic low-frequency rescan and every manual refresh recompute from Git and canonical VibeTether state, so a dropped watcher event cannot permanently hide a change.

The UI shows separately:

- last observed time;
- last authority alignment time;
- last evidence verification time;
- whether the view is live, static, stale, or incomplete.

## 14. Local security and privacy

- Bind only to `127.0.0.1` by default.
- Generate an unguessable process-session token and require it for API and SSE requests.
- Validate `Host` and `Origin`; reject cross-origin mutations.
- Emit restrictive CSP, no-store caching for API state, and safe content types.
- Make no outbound network request from the cockpit.
- Escape all project-controlled text and never render repository HTML directly.
- Do not expose environment variables, credentials, private keys, secret-like values, raw reasoning, tool transcripts, full session transcripts, or provider bodies.
- Redact sensitive command arguments and artifact excerpts using the existing Evidence policy.
- Treat “open file” as a local convenience action with path containment and regular-file checks.
- Keep local preferences and candidate memos outside the tracked Project Contract unless the user explicitly exports them.

This is a local policy boundary, not an operating-system sandbox.

## 15. Failure and recovery

| Failure | Required behavior |
| --- | --- |
| Git state unavailable | preserve the previous view as stale; no completion verdict |
| One worktree unavailable | mark it offline/unknown; do not count its work as integrated |
| Truth or Decision registry invalid | show the parser error and block affected direction |
| Outcome progress corrupt | quarantine runtime state and show reconstruction status |
| Snapshot generation fails | do not publish a partial generation |
| Watcher drops an event | periodic or manual recomputation restores truth |
| Event history is truncated | display the retained range and omission count |
| Generated projection was edited | report ownership conflict; regenerate only after safe validation |
| Confirmed directional change has no mapping | fail closed for the declared scope |
| Ordinary code changed after validation | invalidate covered Evidence and recompute the allowed verdict |
| Local port is occupied | select another port unless the user pinned one |
| Browser token is missing or invalid | reject the request without disclosing state |

## 16. Performance and size budgets

Budgets prevent a lightweight cockpit from becoming a platform:

- no production runtime dependency;
- packaged UI target below 250 KiB uncompressed before source maps;
- initial snapshot target below 512 KiB; larger collections use handles and pagination;
- initial render target below two seconds for a normal repository on a supported local machine;
- changed-path refresh parses only affected governing sources and bounded runtime projections;
- at most 100 change rows, 100 Outcome rows, or 100 Evidence rows per page;
- event history is bounded and reports omitted generations rather than silently claiming full history;
- no full dependency, cache, ignored-file, provider-body, transcript, or repository-history scan.

These are regression budgets, not marketing claims about Token savings.

## 17. Compatibility and migration

- RC4 is stabilized and reviewed before cockpit product code begins.
- RC5-A Decision Memory is implemented before the cockpit claims Decision coverage.
- Older projects without Decisions or Outcomes remain inspectable with explicit capability gaps.
- Inspection never performs an implicit Project Contract migration.
- A dashboard-related contract upgrade has an explicit preview, recovery transaction, and rollback inventory.
- Existing `vibe-tether` and `vibe-tether-deep` entry Skills remain the only default host-visible entries.
- The cockpit does not require users to expose every cold Provider Skill.

## 18. Delivery stages

The work is divided into four independently closable stages:

### Stage 0: RC4 and self-control baseline

- finish current RC4 delivery gates;
- install or attach a current VibeTether Project Contract to the VibeTether repository itself through an explicit reviewed flow;
- prove that RC4 does not use a stale parent-project checkpoint as its own project status.

### Stage 1: Decision Memory

- implement the separately reviewed RC5-A Decision Memory contract;
- bind Decisions, document sync, Outcome sync, Permit, route, and resume behavior;
- do not build cockpit UI in this stage.

### Stage 2: Snapshot and impact substrate

- implement `inspect`, immutable generations, four-plane joins, impact invalidation, Worktree aggregation, pagination, and security redaction;
- prove the entire dataset through CLI black-box tests before Web rendering.

### Stage 3: Lightweight local cockpit

- implement local HTTP/SSE and packaged static UI;
- first ship the approved overview golden screen with real data;
- add drill-down pages one bounded state family at a time;
- verify functional and visual behavior separately.

No stage may claim the later stage is complete.

## 19. Acceptance criteria

The design is delivered only when black-box tests prove:

1. a confirmed Truth edit appears with old/new revision, affected scope, and a non-green downstream verdict;
2. a new requirement or design document remains observed/candidate until user confirmation;
3. code changed after a passing validator invalidates the relevant Evidence;
4. sibling-worktree completion remains unintegrated until final bytes exist and are reverified in the integration worktree;
5. green Outcomes cannot close a goal while a declared source ID is unmapped;
6. dashboard restart recomputes current state instead of trusting browser storage;
7. every unavailable datum renders `UNKNOWN`, `STALE`, `EXCLUDED`, or an exact blocker rather than a fabricated value;
8. every visible number and verdict drills down to stable source handles;
9. ignored files, secrets, transcripts, environment values, and raw reasoning are absent from API and static-report output;
10. Windows locks, path variants, moved worktrees, process interruption, and corrupt runtime state preserve prior valid state and expose recovery;
11. one snapshot generation is internally consistent across every card;
12. a dropped watcher event is repaired by recomputation;
13. the cockpit displays the strongest allowed claim and cannot promote `SLICE_GREEN` to goal or release completion;
14. adaptive entry, Deep questioning, Skill routing, Outcome coverage, Evidence completion, and Success Capture continue passing their existing tests;
15. a host that does not cooperate is reported as an enforcement limitation rather than shown as controlled;
16. desktop and narrow browser tasks pass with no console errors, keyboard blockers, unsafe HTML, or misleading state color.

## 20. Non-scope

This design does not authorize:

- a multi-project portfolio dashboard;
- Electron, Tauri, a background daemon, database, or cloud service;
- remote collaboration, accounts, billing, RBAC, or an Agent marketplace;
- editing confirmed project authority directly in the first cockpit release;
- semantic AI classification inside the deterministic Snapshot/Impact Engine;
- automatic promotion of discovered documents, decisions, outcomes, or experience;
- deployment, merge, release, or destructive project actions from the cockpit;
- storing raw transcripts or private model reasoning;
- claiming absolute prevention of Agent dishonesty or guaranteed host invocation.

## 21. Design exit contract

This approved design authorizes documentation and implementation planning for the four staged deliveries. It does not authorize product-code implementation until:

1. this written specification is reviewed by the user;
2. the Stage 0 plan names exact files, tests, boundaries, and recovery evidence;
3. the current stale/mismatched parent VibeTether control state is not used as proof of the RC4 repository's status;
4. each later stage receives its own bounded plan and completion verdict.

