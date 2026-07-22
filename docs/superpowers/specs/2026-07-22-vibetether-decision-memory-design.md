# VibeTether Decision Memory and Rehydration Design

- Status: proposed for written-spec review
- Decision owner: project user
- Target: RC5-A after the reviewed RC4 branch
- Scope: durable decisions, visible-session reconciliation, compaction/resume rehydration, document synchronization, lifecycle applicability, and Permit binding
- Approval basis: the user approved this bounded direction in conversation; the exact written contract remains subject to this document review

## Problem

VibeTether currently separates Intent, confirmed Truth, Outcomes, Experience, and runtime evidence. Deep mode also records one answer receipt per question. This is not enough to survive a long design conversation safely:

- Deep receipts live only in per-worktree runtime state;
- the compact Context Capsule reports answer counts, not the confirmed resolutions;
- a summary can omit a material decision, a withdrawal, or a supersession;
- the raw transcript contains proposals, system/developer context, tools, compacted summaries, duplicates, and obsolete branches, so it cannot be treated as authority;
- an Implementation Permit is bound to its Start Card receipts, but not to a project-level durable decision inventory or its document synchronization state;
- a later Agent can therefore resume from an incomplete summary, reinterpret an earlier answer, or start implementation while the governing design document is stale.

The required behavior is:

```text
inspect facts and current authority
-> expand the request into explicit decisions
-> ask one user-owned question at a time
-> reconcile the visible raw conversation incrementally
-> show one bounded Decision Diff and document-sync impact
-> obtain explicit confirmation
-> persist stable decisions and regenerate their projection
-> mint a Permit bound to the resulting decision digest
-> rehydrate those decisions after compaction, resume, and handoff
```

The goal is to prevent expensive rework caused by lost or guessed intent. It is not to preserve every chat message or turn VibeTether into a transcript database.

“Ready to implement” does not mean that the Agent claims omniscience. It means that, for the approved bounded slice, discoverable facts have been checked, every known consequential ambiguity has an explicit disposition, applicable lifecycle domains are resolved, governing documents and Outcomes reflect the decision set, and the user has confirmed the resulting implementation contract.

## Product decisions

### 1. Add a Decision Plane, not another Truth tree

VibeTether will model six distinct concerns:

1. **Intent** — the user-owned goal and success boundary;
2. **Truth** — the confirmed documents that govern work;
3. **Decisions** — confirmed, declined, withdrawn, or superseded user-owned branches;
4. **Outcomes** — the required observable results and their acceptance contracts;
5. **Experience** — reusable procedures proven by evidence;
6. **Runtime** — the current worktree, route, Permit, evidence, and recovery state.

Decisions answer “which branch did the user choose?” Truth answers “which source governs?” Outcomes answer “what still must be delivered?” Experience answers “what procedure has worked?” None may silently substitute for another.

### 2. Keep one product and one repository

RC5-A remains one npm package, one CLI, one repository, and the existing adaptive/deep entry pair. It adds internal modules and two compact project files; it does not create a daemon, database, remote service, second project-management system, or multi-package protocol ecosystem.

### 3. Use progressive disclosure

The tracked registry is machine-readable. The generated Markdown projection is human-readable. Context returns only applicable summaries and stable handles. Raw session text is read locally and incrementally when explicitly attached; it is never copied into the repository or loaded wholesale at task entry.

## Alternatives considered

### A. Trust the conversation summary

This is the smallest implementation, but it preserves the exact failure mode: a summary can omit a decision, flatten a supersession, or treat an Agent proposal as user approval.

Verdict: rejected.

### B. Treat the raw transcript as authority

This preserves more bytes but mixes user decisions with Agent proposals, developer instructions, tool output, generated context, duplicate records, and obsolete directions. It also creates privacy and context-size problems.

Verdict: rejected.

### C. Stable decision registry plus raw-session provenance and bounded rehydration

The Agent reads only visible user/assistant messages from an explicitly attached local session, proposes a structured Decision Diff, and advances a reconciliation cursor only after the user confirms the exact diff. Confirmed decisions become compact project authority; raw text remains local provenance.

Verdict: selected.

## Project Contract

The Project Contract schema advances from 2 to 3 and adds:

```json
{
  "decision_index": ".vibetether/decisions.json",
  "decision_projection": ".vibetether/DECISIONS.md"
}
```

Initialization creates an empty registry and deterministic projection. It does not scan the repository, infer decisions, attach a session, or activate a document.

### Canonical registry

`.vibetether/decisions.json` is tracked, user-governed, strictly validated, and size bounded:

```json
{
  "schema_version": 1,
  "registry_id": "decision-registry-project",
  "revision": 1,
  "decisions": [
    {
      "id": "decision_relationship_first_home",
      "status": "confirmed",
      "kind": "product",
      "durability": "project",
      "lifecycle_domain": "ui",
      "subject": "What does the contact home prioritize?",
      "resolution": "Prioritize relationships and support multiple contacts; do not make a single frequent-contact list the governing model.",
      "rationale": "This replaces the earlier single-list proposal and preserves multi-contact behavior.",
      "scope": {
        "goal_id": "goal_product_delivery",
        "slice_digest": null,
        "paths": ["src/contact/**"]
      },
      "supersedes": ["decision_frequent_contact_home"],
      "superseded_by": [],
      "provenance": [
        {
          "host": "codex",
          "session_id": "session-id",
          "message_id": "msg-id",
          "role": "user",
          "message_sha256": "sha256:...",
          "observed_at": "ISO-8601"
        }
      ],
      "document_sync": {
        "status": "current",
        "reason": "The confirmed UI contract contains this exact direction.",
        "targets": [
          {
            "path": "docs/product/contact-ui.md",
            "truth_id": "truth_contact_ui",
            "revision_digest": "sha256:..."
          }
        ]
      },
      "outcome_sync": {
        "status": "current",
        "reason": "The active Outcome registry represents the approved relationship-first behavior.",
        "affected_outcome_ids": ["outcome_contact_home_relationships"],
        "outcome_registry_digest": "sha256:..."
      },
      "approved_at": "ISO-8601",
      "revision_digest": "sha256:..."
    }
  ]
}
```

Unknown fields fail closed. Stable logical IDs are separate from revision digests. Content movement or revision does not silently change logical identity.

### States

A decision has exactly one state:

- `proposed` — visible candidate; it does not govern work;
- `confirmed` — explicitly approved and applicable within scope;
- `superseded` — replaced by named confirmed decisions;
- `withdrawn` — the user explicitly withdrew it without a replacement;
- `declined` — reviewed but never approved.

Only `confirmed` entries govern. An Agent may propose a candidate or automatically lower trust after drift. It may not confirm, withdraw, decline, supersede, broaden scope, or raise durability without a user-grounded receipt.

### Kinds and durability

Kinds are bounded to `product`, `scope`, `acceptance`, `domain`, `architecture`, `data`, `api`, `ui`, `security`, `permission`, `release`, and `technical`.

Durability is:

- `slice` — needed for the current bounded implementation and resumability;
- `project` — expected to govern later work and therefore requires document synchronization unless explicitly classified as registry-only with a reviewed reason.

Routine local, reversible implementation choices remain checkpoint assumptions; they do not become project decisions merely because an Agent made them.

### Generated projection

`.vibetether/DECISIONS.md` is a deterministic, tracked projection containing:

- registry revision and digest;
- active confirmed decisions grouped by lifecycle domain;
- supersession and withdrawal relationships;
- pending document synchronization;
- stable `decision:<id>` handles;
- regeneration command and projection digest.

It is system-generated, non-authoritative, and must not be hand edited. The JSON registry plus confirmed Truth documents remain canonical.

The projection also shows pending Outcome synchronization. It does not replace `.vibetether/outcomes.json` or its generated `PROGRESS.md` projection.

## Visible-session reconciliation

### Explicit attachment

RC5-A supports a host-adapter interface and ships one concrete reader for Codex JSONL. A session source is attached explicitly with its host and local path. VibeTether does not guess the newest session or search all user conversations automatically.

The attached source and reconciliation cursor are stored only in per-worktree local state. The local state may retain the canonical path, file identity, session ID, last inspected message, last confirmed cursor, and digests. It never stores message bodies.

### Visible-message filter

The Codex adapter accepts only records where:

```text
record.type == response_item
payload.type == message
payload.role in {user, assistant}
content.type in {input_text, output_text}
```

It excludes developer/system messages, reasoning items, tool calls and outputs, `event_msg`, `compacted` summaries, world state, inter-agent metadata, and unsupported attachments. Known host-injected segments—including plugin inventories, `AGENTS.md`/workspace instructions, environment context, and ambient UI state—are separated from user-authored text and reported as ignored segments. If the adapter cannot unambiguously separate an injected segment from authored text, it stops with `SESSION_SEGMENT_AMBIGUOUS` instead of treating the segment as a decision. Assistant messages can explain a proposal but can never authorize a decision.

Messages are identified by host message ID plus a digest of the exact ordered user-authored text segments after host-envelope separation. Normalized text may support duplicate-candidate detection, but it is never the provenance identity. Duplicate IDs or conflicting accepted bytes fail closed. The reader uses a shared read stream, imposes file/line/message limits, accepts only a regular JSONL file, and ignores one incomplete trailing record while rejecting malformed interior records.

### Incremental flow

```text
decisions source attach
-> decisions reconcile --dry-run
-> return new visible message handles and the prior confirmed cursor
-> Agent proposes a complete reconciliation batch
-> user reviews one bounded Decision Diff
-> decisions reconcile --apply records every user-message disposition
-> registry/projection/cursor advance atomically
```

Every newly inspected user message receives one batch disposition:

- `no-material-decision`;
- `proposes`;
- `confirms`;
- `supersedes`;
- `withdraws`;
- `declines`.

The CLI validates provenance and batch coverage but does not perform semantic extraction. The Agent proposes meanings; the user confirms the resulting diff. A no-material classification is therefore part of the reviewed batch rather than a silent cursor skip.

If the source is missing, moved without matching identity, truncated before the confirmed cursor, conflicting, or unavailable, VibeTether returns `PROVENANCE_UNAVAILABLE` or `SESSION_RECONCILIATION_CONFLICT`. It never invents a locator or silently trusts the summary.

## Decision confirmation, document synchronization, and Outcome synchronization

### Confirmation transaction

A user confirmation names the exact Decision Diff and, when applicable, the exact governing-document and Outcome revisions. Applying it atomically:

1. validates every user-message provenance receipt;
2. validates stable IDs, scopes, supersession edges, and no active conflict;
3. verifies every declared document target against confirmed Truth;
4. validates the Outcome-impact disposition and any reviewed Outcome diff;
5. writes the decision registry and any approved VibeTether-owned Outcome change as one recoverable transaction;
6. regenerates `DECISIONS.md` and `PROGRESS.md`;
7. advances the local confirmed reconciliation cursor;
8. writes a tamper-evident local receipt;
9. invalidates any older active Permit or route whose decision, document, Outcome, or cursor digest changed.

A boolean, `--yes`, Agent-authored summary, assistant message, or caller-supplied confidence score cannot independently authorize the transaction. On hosts without a mandatory hook, the user-message locator remains cooperation evidence rather than cryptographic proof of identity.

### Document Sync Gate

Project-durable directional decisions must be reflected in the correct confirmed Truth document. The Agent may prepare and show a document diff, but VibeTether does not silently rewrite user-authored Truth semantics.

Document sync is:

- `pending` — no reviewed governing revision exists; consequential implementation is blocked;
- `current` — every target is a confirmed Truth entry and its current digest matches the recorded revision;
- `not-required` — permitted only for bounded slice decisions with a substantive reviewed reason.

Adding a new governing document, changing its role or scope, removing it, or superseding another Truth source continues to use the existing Truth confirmation lifecycle. Confirming a decision does not silently activate a candidate document.

If a confirmed decision conflicts with confirmed Truth, VibeTether returns `DECISION_TRUTH_CONFLICT`, shows both statements and affected scope, recommends a bounded correction, and asks the user. Neither source is silently preferred by an Agent.

### Outcome Sync Gate

A decision that changes goal scope, user-visible behavior, acceptance criteria, lifecycle coverage, or a promised deliverable must declare its impact on the canonical Outcome registry. Outcome sync is:

- `pending` — the current Outcome universe or acceptance contract does not yet represent the confirmed decision;
- `current` — affected Outcome IDs and the current Outcome-registry digest match the reviewed decision impact;
- `not-required` — the decision cannot alter required delivery or completion claims, with a substantive reviewed reason.

The normal Deep confirmation view combines the Decision Diff, governing-document diff, and Outcome diff so the user can approve one coherent change rather than answer three disconnected control-plane questions. The Agent may prepare those diffs, but only the exact user-approved payload may be applied. A partial file failure rolls back the owned transaction and leaves the Permit blocked.

When Outcome sync changes, VibeTether regenerates `PROGRESS.md`. Existing evidence is preserved as history but becomes stale wherever its Outcome contract, acceptance definition, decision dependency, or final-byte basis changed. A slice, goal, or release cannot be closed while an applicable decision has pending or stale Outcome sync.

## Lifecycle applicability

VibeTether does not force a universal waterfall. Deep Start Cards classify the following domains only when the task's actual behavior, structure, risk, or persistent coordination makes them applicable:

```text
requirements
domain
architecture
data
api
ui
plan
verification
release
```

Before asking for directional choices, the Agent reads applicable confirmed Truth, inspects discoverable repository and environment facts, and marks claims as observed, inferred, or still unknown. It must not ask the user to rediscover facts available in the scoped workspace. Fact inspection cannot authorize a product choice; unresolved user-owned branches still require the user.

Each domain receives exactly one disposition:

- `approved` — the required decision or governing artifact exists;
- `not-applicable` — excluded with a reviewed reason;
- `deferred-by-user` — intentionally postponed by the user and outside the current Permit;
- `unresolved` — implementation remains blocked.

For a major new product or feature, the default review order is:

```text
DISCOVER -> ALIGN -> REQUIREMENTS -> DOMAIN/ARCHITECTURE
-> DATA/API -> UI/FLOWS -> PLAN -> EXECUTE_ONE -> VERIFY -> REVIEW -> RELEASE
```

For a read-only request or a clear local edit, only relevant domains appear. File count, elapsed time, use of a subagent, or existence of a worktree does not mechanically force the full lifecycle. Actual effect determines the gate.

The Start Card records the applicability matrix, its evidence and related decision handles. Final confirmation covers the matrix. A Permit cannot be minted while any required domain is `unresolved`, while a deferred domain leaks into the current slice, or while an applicable project decision has stale document or Outcome sync.

## Compaction, resume, and handoff

At `task-entry`, `compaction`, `resume`, `handoff`, phase change, or a consequential boundary, Context returns a bounded Decision Capsule:

```json
{
  "registry_digest": "sha256:...",
  "applicable_total": 12,
  "returned": 4,
  "omitted": 8,
  "handles": ["decision:decision_relationship_first_home"],
  "active": [
    {
      "id": "decision_relationship_first_home",
      "kind": "product",
      "resolution": "bounded summary",
      "revision_digest": "sha256:...",
      "document_sync": "current",
      "outcome_sync": "current"
    }
  ],
  "session_reconciliation": {
    "status": "current",
    "pending_user_messages": 0
  },
  "blockers": []
}
```

The Agent reads a full entry through `context read decision:<id>`. Pagination uses stable handles and an omitted count; no active decision is silently truncated without a continuation path.

After compaction or resume, a cooperating host must run Context before consequential work. If an attached session has unreconciled visible user messages, a Deep or Controlled consequential action fails with `DECISION_COVERAGE_INCOMPLETE`. Read-only investigation may continue. If no session adapter is attached, Context reports `not-attached`; it does not claim raw-session coverage.

The managed `AGENTS.md`/`CLAUDE.md` block and both VibeTether entry Skills must explicitly require this re-entry check at task entry, compaction, resume, handoff, and phase change. This improves automatic cooperation but remains subject to the host limitation described below.

Handoff capsules carry only applicable decision IDs and registry digest, not transcript text. The receiving worktree revalidates current registry bytes, Truth, documents, and any attached local provenance before acting.

## Permit and route binding

The Deep Start Card, Implementation Permit, controlled route, checkpoint, Evidence receipts, completion seal, and Doctor all bind:

```text
decision_registry_digest
applicable_decision_ids and revision digests
lifecycle applicability digest
document-sync verdict
outcome-registry digest and Outcome-sync verdict
session reconciliation cursor digest when attached
```

Any confirmation, supersession, withdrawal, scope change, document drift, Outcome drift, or newly pending reconciled message invalidates the Permit before the next consequential action. A route already active becomes broken/recoverable; it cannot finish against stale decisions.

The safe ordering is deliberate:

```text
final user confirmation
-> apply decision/document/Outcome reconciliation
-> recompute decision digest
-> mint Permit
-> start route
```

This prevents a Permit from becoming stale immediately after it is issued.

## Anti-anchoring invariant

VibeTether adopts the following internal and Skill-level rule:

> Treat frameworks, plans, patterns, and prior Agent conclusions as tools and hypotheses, not authority. Re-check them against confirmed user intent, current project truth, raw evidence, and counterexamples. If a framework conflicts with facts, report the conflict and recommend a bounded correction; “thinking independently” is not permission for an unbounded redesign.

The corresponding Chinese instruction is: **“辨证地看待现有框架，实事求是；框架、计划、模式和既有 Agent 结论都只是工具或假设，不是权威。”**

This is enforced by behavior, not marketing text:

- Deep requires a counterexample challenge;
- session reconciliation distinguishes proposals from user decisions;
- provider advice remains below Intent, Truth, and confirmed decisions;
- a framework conflict becomes an explicit blocker or bounded recommendation;
- no “break free of the framework” phrase can authorize a product-direction change.

## CLI surface

RC5-A adds one noun while keeping beginner usage conversational:

```text
vibetether decisions status
vibetether decisions list
vibetether decisions read ID
vibetether decisions propose --decision-json ...
vibetether decisions confirm|supersede|withdraw|decline ...
vibetether decisions sync --id ID --document PATH --outcome OUTCOME_ID ...
vibetether decisions source attach --host codex --path SESSION.jsonl
vibetether decisions source status
vibetether decisions reconcile --dry-run
vibetether decisions reconcile --batch-json ... --yes
```

Mutation commands preview by default. The normal beginner path remains: tell the Agent what to do, answer one question when needed, review one consolidated Decision Diff, and continue. Users do not need to memorize these commands.

## Ownership and automatic file management

RC5-A preserves the existing ownership model:

- VibeTether automatically writes its Decision registry, generated Decision projection, Outcome registry changes explicitly included in the approved diff, generated Progress projection, local cursor, receipts, Context Capsule, checkpoint, and Permit state;
- it proposes candidate Truth and document diffs;
- it never silently changes a user-authored product specification, ADR, UI contract, requirement, or release policy;
- it tracks product code through Git snapshots, Outcome scope, and evidence rather than pretending to semantically maintain every source file.

Therefore “automatic management of all VibeTether files” means deterministic ownership and synchronization of VibeTether's own canonical/projection/runtime files, plus guarded coordination with user-owned documents. It does not mean autonomous rewriting of every repository file.

## Migration, upgrade, rollback, and uninstall

- Existing schema-2 projects upgrade explicitly to schema 3.
- Upgrade creates an empty Decision registry and projection; it does not mine old transcripts or promote Deep receipts.
- Existing active Deep state is preserved but marked `decision-reconciliation-required` before a new Permit or consequential route.
- v0.6.3 migration creates the same empty Decision assets after preserving all legacy bytes and candidate-first semantics.
- Rollback restores file existence and exact pre-upgrade bytes when current bytes still equal the migration output.
- Post-upgrade user edits trigger a three-way conflict report and are never overwritten.
- Uninstall protects modified Decision assets and removes only unchanged VibeTether-owned generated content under the selected contract-removal policy.

## Security and privacy

- Raw transcripts are local inputs, never tracked artifacts.
- Message content is not stored in the cursor or decision registry; only bounded summaries, IDs, timestamps, roles, and digests are stored.
- Secrets, private reasoning, tool output, developer/system instructions, full provider responses, and unsupported attachments are excluded.
- A reconciliation batch containing secret-like material fails before persistence.
- External session paths are never emitted into tracked files or generated projections.
- The Codex adapter is a provenance parser, not an authentication boundary.
- A host without hooks still depends on Agent cooperation; VibeTether cannot stop a thread that never invokes it.

## Budgets

Budgets prevent context and Contract growth; they are not token-savings claims:

- Decision registry: at most 512 entries and 256 KiB;
- one decision summary: at most 1 KiB of persisted semantic text;
- one provenance receipt: metadata and digests only;
- Context Capsule: remains within the existing 4 KiB total budget;
- Context returns at most four decision summaries before compaction and fewer when needed;
- one raw reconciliation batch: at most 64 visible messages and 64 KiB of returned text;
- attached JSONL file: bounded size, line length, and record count;
- `DECISIONS.md`: compact projection, not a transcript or full design archive.

When a limit is exceeded, return stable continuation handles or a precise blocker. Never silently drop active decisions.

## Failure and recovery

| Failure | Required behavior |
| --- | --- |
| Session file locked while Agent is writing | Read with sharing; process complete lines only |
| Trailing partial JSON record | Ignore only the final incomplete record and report it |
| Malformed interior record | Stop with `SESSION_SOURCE_INVALID` |
| Same message ID with different bytes | Stop with `SESSION_RECONCILIATION_CONFLICT` |
| Summary disagrees with raw visible message | Raw message is provenance; ask the user before changing authority |
| Confirmed decision conflicts with Truth | Stop with `DECISION_TRUTH_CONFLICT` |
| Decision document changed after sync | Mark sync stale and invalidate Permit/route |
| Decision changes delivery but Outcomes remain old | Mark Outcome sync pending and block Permit/completion |
| User withdraws or supersedes a decision | Preserve history, update edges, invalidate affected progress |
| Cursor write fails after registry write | Recover as one transaction; do not report applied |
| Projection missing or edited | Regenerate after ownership validation; Doctor blocks until current |
| Host provenance unavailable | Report the limitation; never fabricate a source |

## Doctor boundaries

At a slice boundary, Doctor additionally requires:

- current decision registry and projection;
- no unresolved applicable lifecycle domain;
- no pending project-direction document sync;
- no pending or stale Outcome sync for an applicable decision;
- no attached-session messages left outside the confirmed reconciliation cursor;
- route, Permit, and completion seal decision digests equal current state.

Goal and release boundaries inherit those checks. A complete Decision registry does not prove Outcome completeness, functional correctness, external state, independent review, owner satisfaction, or release authorization; the existing layered verdicts remain unchanged.

## Acceptance criteria

RC5-A is acceptable only when black-box tests prove all of the following:

1. A confirmed Deep answer survives a new process and appears in `context` as a stable decision handle after compaction/resume.
2. The old “single frequent-contact home” decision can be superseded by the later “relationship-first, multi-contact” decision without either disappearing from history or both remaining active.
3. Developer messages, tool output, reasoning, compacted summaries, ambient context, and assistant proposals cannot authorize a decision.
4. A locked live Codex JSONL can be read incrementally; a trailing partial record is ignored; an interior malformed record fails.
5. A reconciliation cursor cannot advance unless every new visible user message has a reviewed disposition.
6. A project-direction decision with pending or stale document sync cannot mint or retain an Implementation Permit.
7. A confirmed candidate Truth document is required before it can become a governing document-sync target.
8. Permit, active route, evidence, finish, and Doctor fail after decision, document, lifecycle, or cursor drift.
9. Context reports total, returned, omitted, and stable continuation handles within the 4 KiB budget.
10. Small read-only work remains lightweight and does not require a transcript or full lifecycle matrix.
11. A major product request cannot begin code-write while any applicable requirements, architecture, data/API, UI, plan, verification, or release disposition is unresolved.
12. Framework/provider advice that conflicts with confirmed facts produces a bounded conflict instead of an unapproved redesign.
13. Schema-2 upgrade, v0.6.3 migration, rollback, post-migration user-edit protection, package install, and uninstall preserve Decision assets correctly.
14. `doctor --boundary slice|goal|release` reports decision failures separately from Outcome, Truth, Evidence, and release failures.
15. A confirmed scope or acceptance change cannot leave the old Outcome registry or `PROGRESS.md` current; the reviewed Outcome diff is applied and regenerated, or Permit and completion remain blocked.
16. Generated host instructions and both entry Skills require Decision Context re-entry after compaction/resume and fail closed before consequential work when reconciliation is incomplete.

## Non-scope

RC5-A does not include:

- a visual cockpit or dashboard;
- browser automation for ChatGPT/GPT Pro;
- Claude or ChatGPT raw-session parsers beyond the generic adapter contract;
- semantic decision extraction inside the deterministic CLI;
- remote transcript storage or synchronization;
- background watchers or hooks not already supplied by a host;
- autonomous edits to user-authored Truth documents;
- a database, daemon, remote registry, or multi-package split;
- formal release, remote `main` update, or user-project migration.

Those remain separate, reviewable slices after Decision Memory proves its value.

## Honest boundary

VibeTether can make loss and drift visible once the host invokes it. It can persist confirmed choices, compare raw visible provenance, block stale Permits, and require documents/evidence. It cannot guarantee that an uncooperative host invokes the Skill, cannot cryptographically prove a human authored a host message without a trusted hook, and cannot prove a semantic extraction is correct without user review.

That boundary is a product constraint, not a documentation footnote.
