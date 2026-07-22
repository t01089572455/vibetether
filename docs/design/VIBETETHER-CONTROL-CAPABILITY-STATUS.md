# VibeTether Control Capability Status

- Status date: 2026-07-22
- Source snapshot reviewed: RC4 branch at `2ea8de1`
- Purpose: prevent design documents, source presence, and release-ready capability from being conflated
- Rule: this file is a review snapshot, not generated runtime truth and not a release verdict

## Status vocabulary

- **Implemented** — a public CLI/runtime path exists in the reviewed RC4 source and has focused tests in the repository.
- **Partial** — useful mechanics exist, but a material boundary required by the product promise is absent.
- **Designed** — an approved or proposed written design exists; product code does not yet provide the capability.
- **Deferred** — intentionally outside the current bounded delivery.

“Implemented” does not mean cross-platform release-ready. Packaging, exact migration, host, fault-injection, and independent review gates remain separate.

## Capability map

| Capability | Status | Current evidence | Missing boundary or next proof |
| --- | --- | --- | --- |
| one-command project initialization | Implemented | `src/init.mjs`, `src/bootstrap.mjs`, `test/beginner-ux.test.mjs` | final Windows and packaged-artifact journeys |
| adaptive task classification | Partial | `src/task-classifier.mjs`, `src/context.mjs`, router tests | natural-language generalization remains bounded; no host request hook |
| Deep Start Card and Implementation Permit | Implemented | `src/deep.mjs`, `test/rc3-deep-semantic.test.mjs` | lifecycle interception must prevent bypass in real hosts |
| prompt fact harvest and request expansion | Partial | Deep facts, assumptions, decisions, and success checks | no durable raw-request registry or full Decision Memory reconciliation |
| confirmed Truth lifecycle and applicability | Implemented | `src/truth.mjs`, `src/context.mjs`, Truth tests | project installers still need reliable discovery/review UX and host re-entry |
| candidate isolation and user confirmation | Implemented | Truth CLI and confirmation paths | real host bypass remains possible without hooks |
| stable Outcome registry and exact coverage | Implemented | `src/outcomes.mjs`, RC4 Outcome tests | real-project source-ID adapters and broader corpus proof |
| generated progress projection | Implemented | `src/outcome-progress.mjs`, progress tests | cockpit integration and automatic lifecycle refresh |
| slice/goal completion separation | Implemented | `src/doctor.mjs`, RC4 Goal Doctor tests | claim language interception and owner/deployment boundaries |
| validator migration mapping | Implemented | `recordValidatorMigration`, lifecycle tests | real weakened-test replay corpus |
| cold Provider catalog and one-primary routing | Implemented | Provider registry/cache/broker modules and pack tests | live host activation UX and larger held-out evaluation |
| project-owned custom routes and Provider non-regression | Partial | route overlay tests, Provider locks, integrity/cache modules | final contract must preserve bundle profiles, permission/environment limits, activation expiry, and no runtime download across upgrades |
| project-wide UI control loop | Partial | frontend design/browser capabilities and golden-screen output contracts | RC4 Entry Skills do not yet carry the complete reference-intake, design-token, one-screen, render/compare, and dual-acceptance workflow |
| phase re-entry and automatic capability routing | Partial | Context classification, managed host block, Provider broker | no real host phase/correction hook; package-path lifecycle transition corpus remains incomplete |
| compact re-anchor and context budgets | Implemented | Context budgets, stable handles, cold Provider selection | raw-session recheck and post-compaction Decision coverage remain designed only |
| final-byte command/artifact evidence | Implemented | `src/step.mjs`, evidence and completion-race tests | exact runtime process/backend/database identity |
| owner acceptance recording | Partial | `recordAcceptanceDecision` | owner-required Outcomes are not yet enforced by host Stop hooks or cockpit |
| per-worktree runtime, lease, and handoff | Implemented | `src/runtime.mjs`, `src/worktree.mjs`, lifecycle/worktree tests | actual multi-host concurrency and fault-injection matrix |
| Success Capture and Experience invalidation | Implemented | `src/experience.mjs`, success-capture tests | automatic host lifecycle invocation and real operational-path replay |
| migration, upgrade, rollback, uninstall protection | Implemented | migration/upgrade/uninstall modules and tests | exact live v0.6.3 and Windows matrix remain release gates |
| durable Decision Memory | Designed | `2026-07-22-vibetether-decision-memory-design.md` | registry, projection, CLI, digests, tests, migration |
| raw-session reconciliation and post-compaction rehydration | Designed | Decision Memory design | host adapters, privacy-safe cursor, bounded Decision Diff |
| user-requested whole-session self-audit | Designed | local-session source-of-record, full-recheck triggers, and anti-summary-on-summary invariant in the final design | Codex JSONL public reader, coverage report, correction binding, malformed/rotated-source replays |
| Codex and Claude lifecycle hooks | Designed | host-enforcement design | installer, dispatcher, real adapters, bypass/degradation tests |
| before-write Permit enforcement | Designed | host-enforcement design | real host interception; currently CLI cooperation only |
| completion-claim interception | Designed | Claim Envelope and Stop design | real Stop hook and bounded claim renderer |
| Claim Envelope and adversarial adjudication | Designed | host-enforcement design | schema, receipts, CLI, Doctor integration, replay tests |
| evidence maturity vector | Designed | host-enforcement design | replace aggregated green presentation without breaking existing evidence |
| exact environment/process identity | Designed | GYWS forensics and host-enforcement design | environment adapters, redaction, invalidation, process receipt |
| progress-efficiency/churn checkpoint | Designed | host-enforcement design | explainable thresholds, state, UX, longitudinal tests |
| trustworthy local Web cockpit | Designed | `2026-07-22-vibetether-trustworthy-cockpit-design.md` | deterministic snapshot API and UI implementation |
| project-wide change impact projection | Designed | cockpit design | dependency/authority impact engine and conservative unknown state |
| external CI, merge, deploy, and authority adapters | Deferred | architectural boundary only | start only after core host and claim controls are proven |
| remote registry, daemon, database, multi-package protocol | Deferred | explicitly excluded by design | require real user evidence before reopening scope |

## What RC4 can honestly claim

The reviewed source can coordinate a cooperating agent through current Truth, a bounded Deep permit, one routed Provider, Outcome-linked work, final-byte evidence, layered slice/goal Doctor checks, worktree state, and Success Capture.

It cannot yet honestly claim that:

- Codex or Claude is mechanically prevented from skipping VibeTether;
- a completion sentence is intercepted before it reaches the user;
- long-session decisions are automatically recovered from raw session provenance;
- a request to reread the whole local session bypasses compacted memory through a tested public adapter;
- a “real” test is bound to the exact backend, database, process, and user environment;
- the proposed cockpit exists;
- all project changes are automatically classified and visualized;
- GYWS or LoveBuddy is currently governed end to end merely because VibeTether files are installed.

## Promotion rule

A row may move from Designed to Partial or Implemented only when:

1. its public behavior and honest boundary are defined;
2. product code provides the public path;
3. a known-failure replay fails before the change and passes afterward;
4. bypass and degraded-host behavior are tested;
5. docs and cockpit projection use the same status;
6. final packaged bytes pass the applicable cross-platform gate.

No commit message, source file, test count, or design approval can promote a row by itself.
