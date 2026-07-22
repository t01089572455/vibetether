# Agent Delivery Packet

Status: in_progress
Task Type: release
Risk: high

## Authority Sources

- `D:/python_workspace/gyws/CONTEXT.md`: project terminology and the rule that a Skill is a tested, governed workflow rather than a prompt fragment.
- `D:/python_workspace/gyws/docs/superpowers/specs/2026-06-20-gyws-product-direction.md`: product work must preserve confirmed capabilities and cannot substitute presentation for working behavior.
- `D:/python_workspace/gyws/docs/superpowers/specs/2026-06-20-history-user-requirements-extraction.md`: successful paths must be reusable, and project work must remain evidence-led.
- `D:/python_workspace/gyws/docs/superpowers/specs/2026-06-16-wenshu-agent-product-design-v2.md`: long-running agents need explicit stop reasons, checkpoints, authority, evidence, recovery, and reviewed success capture.
- `D:/python_workspace/gyws/docs/superpowers/specs/2026-06-16-wenshu-ui-product-design.md`: user-visible errors must state what happened, the impact, and the next recovery action.
- `docs/design/VIBETETHER-BEGINNER-AND-CAPABILITY-CONTRACT.md`: VibeTether beginner journey, adaptive/deep entry modes, and capability preservation contract.
- `docs/design/VIBETETHER-COMPATIBILITY-AND-DATA-CONTRACT.md`: v0.6.3 data preservation, migration, rollback, and host-cooperation boundaries.
- Exact RC.3 source artifact `vibetether-1.0.0-rc.3-source.zip`, SHA-256 `a057bcbbd30948b3b1c97fc578d88de4e80aaf0715ced7236cc96479c20fe45c`, imported as Git tree `d70304a3cb5e2c8ee663c12a64d55dc2af4cbb46`.
- User authorization in the current session: take over RC.3, continue hardening, test locally, and prepare a safe remote update only after review gates pass.

## Scope

Harden the exact RC.3 artifact on an isolated integration branch until its adaptive and deep task entry, authority checks, user-decision gates, evidence-bound completion, success capture, Windows behavior, migration and rollback, provider activation, install, upgrade, and uninstall paths have reproducible tests and truthful release evidence. Add a compact Goal and Outcome Coverage Contract so a satisfied slice cannot be promoted into whole-goal or release completion while required parent outcomes remain open. The immediate output is a reviewable integration branch, not a formal release.

## Non-Scope

- Do not change the remote `main` branch or publish a version tag.
- Do not migrate, upgrade, uninstall, or otherwise mutate a real user project as part of testing.
- Do not add a daemon, database, remote registry service, multi-package release topology, custom trust framework, or unrelated product feature.
- Do not claim universal routing accuracy, guaranteed host invocation, token savings, independent review, or Windows support without matching evidence.
- Do not redesign the public product direction or remove the adaptive/deep two-entry beginner experience.
- Do not turn outcome coverage into a daemon, database, remote project manager, or LoveBuddy-specific ledger.

## Must Preserve

- One repository, one CLI, one beginner-oriented installation path, and default discovery of only `vibe-tether` plus `vibe-tether-deep`.
- Adaptive mode for low-risk work and explicit deep mode for high-ambiguity or user-requested preflight.
- Investigate discoverable facts before asking the user; ask one consequential decision at a time; do not write product code before required direction is confirmed.
- Stable Truth identity separated from revision digest; candidates remain non-authoritative until user confirmation.
- Rich community capability catalog remains cold; one primary Provider controls a step.
- Completion is tied to required outputs, exit evidence, final bytes, current authority, and success-capture disposition.
- Slice, goal, and release completion remain distinct; user-governed required outcomes and their acceptance definitions cannot be omitted by selecting a smaller route.
- Every managed artifact has an ownership class. Verified slice completion atomically refreshes the compact tracked progress projection; user-authority semantics are never rewritten automatically.
- Confirmed goal coverage includes an exact source-ID universe audit where sources provide stable IDs; missing or undispositioned IDs block goal completion.
- First reusable success becomes a sanitized candidate, never automatically authoritative experience.
- v0.6.3 assets, user modifications, managed host files, and rollback bytes are protected from silent overwrite or deletion.
- Windows, linked worktree, short-path, file-lock, and interrupted-transaction behavior must fail safely and offer a recovery action.

## Reference Intake

- Source: exact RC.3 ZIP and its verified manifest from the GPT Pro delivery directory.
- Classification: rewrite contract
- Rationale: preserve the useful RC.3 implementation as a component baseline, but treat all generated reports and self-authored tests as claims requiring independent reproduction. The exact ZIP bytes are imported unchanged before fixes so every later difference is auditable.
- Target differences: remove self-asserted authorization, bind permits and evidence to consequential scope, make completion race-safe, protect user files during lifecycle operations, and pass real Windows behavior instead of Linux-shaped simulations.
- Acceptance: only executable tests against the final package, live compatibility fixtures, fault injection, scope review, and an explicitly labeled review can support a release recommendation.

## Conflicts

- Stable remote `main` is v0.6.3 while RC.3 is a large candidate rewrite. Resolution: keep `main` untouched and import RC.3 as a child commit on `integration/rc3-hardening-v1`.
- RC.3 reports 134 source-tree tests passing, while the exact Windows checkout currently has three failures and a test-summary counting defect. Resolution: Windows results are current evidence; GPT Pro's report remains provenance only.
- Deep mode intends to require user confirmation, but its CLI accepts an Agent-supplied confirmation flag. Resolution: authorization must be represented by a scoped decision receipt created through a user-visible confirmation flow; a bare boolean cannot grant implementation authority.
- Cold Provider richness conflicts with safe redistribution and complete resource activation. Resolution: retain metadata-only records where redistribution is not proven and test that selected Providers receive all declared resources without preloading the catalog into context.

## Skill Routing

- Phase: baseline and diagnosis; Capability: controlled review; Primary Skill: `gyws-controlled-delivery`; Domain Skills: `vibe-tether`, `systematic-debugging`; Exit: exact artifact identity and failing Windows tests are recorded.
- Phase: planning; Capability: bounded implementation plan; Primary Skill: `writing-plans`; Domain Skill: `using-git-worktrees`; Exit: this packet and the implementation plan validate with no unresolved scope.
- Phase: implementation; Capability: correctness changes; Primary Skill: `test-driven-development`; Domain Skills: `systematic-debugging`, `deprecation-and-migration`, `security-and-hardening`; Exit: each regression is red before code changes and green afterward.
- Phase: packaging and release review; Capability: delivery proof; Primary Skill: `verification-before-completion`; Domain Skills: `requesting-code-review`, `ci-cd-and-automation`, `shipping-and-launch`; Exit: final archive/package bytes pass matrices and review findings are dispositioned.

## Change Budget and Slices

- Budget: up to eighteen independently reviewable commits before the first remote review branch; each commit must keep unrelated v0.6.3 and workspace changes untouched. The expansion from nine is limited to the approved RC4 Goal/Outcome slices, exact-package proof, and their review fixes; it does not authorize new product scope.
- Slice 1: Windows path canonicalization, global-test isolation, and accurate test aggregation.
- Slice 2: task classification, one-question deep readiness, decision receipts, and permit scope binding.
- Slice 3: evidence/permit/lease compare-and-set completion, final-byte seal, and non-bypassable success capture.
- Slice 4: migration, upgrade, rollback, uninstall, file-lock, worktree-prune, and interrupted-transaction recovery.
- Slice 5: Provider immutable verification, complete resource activation, permission environment, archive limits, and cache recovery.
- Slice 6: exact-package install journeys, live v0.6.3 migration/rollback, route held-out evaluation, fault injection, Windows/Ubuntu Node matrices, documentation, and review.
- Slice 7: Goal/Outcome Coverage Contract, exact source-ID audit, deterministic tracked progress projection, runtime progress, route-to-outcome binding, layered Doctor boundaries, migration/rollback coverage, longitudinal false-completion evaluation, and exact-package proof.
- Recovery regression: a legacy checkpoint whose satisfied route and pending Truth reconciliation refer to different route instances must enter a recoverable blocked state with an exact repair action; it must not permanently prevent a new plan or require silent manual state edits.
- Checkpoint: after every slice, run its focused tests, `npm run check`, inspect the diff against this packet, and commit only the bounded slice.

## Acceptance Criteria

- The exact RC.3 Windows baseline failures are fixed without weakening assertions: long/short paths resolve to one identity, tests never write the real user Skill directory, and quoted 8.3 paths work.
- Read-only requests remain lightweight; negation, mixed read/write wording, public behavior, deletion, deployment, migration, permissions, payment, authentication, architecture, and visual-direction requests cannot bypass consequential classification.
- Deep implementation cannot start until discoverable facts, unresolved assumptions, success criteria, counterexamples, and one-at-a-time user decisions are recorded for the exact slice.
- A permit is invalid after authority, worktree, slice, scope paths, phase, capability, Provider, permission set, success checks, task digest, expiry, revocation, lease break, or route status changes.
- A route cannot become satisfied if permit, lease, authority, files, outputs, evidence, or route generation changes while validation is running.
- `doctor --boundary completion` fails for no route, active/broken/abandoned route, stale evidence, self-proving commands, missing outputs, post-evidence byte changes, pending Truth reconciliation, or bypassed success capture.
- Lifecycle rollback never reports success after failed restoration and never overwrites post-migration user changes; uninstall preserves modified launchers, managed blocks, Skills, and shared assets.
- Provider activation verifies expected immutable content, materializes every declared resource, exposes only a minimal environment, and expires with its route.
- Exact final ZIP and TGZ, not only the source directory, pass install, launcher, adaptive/deep, evidence, completion, migration, rollback, upgrade, uninstall, and archive-safety journeys.
- Remote publication is limited to a review branch until real Windows and Ubuntu Node 20/24 jobs and an explicitly scoped review pass.

## Evidence

- Verification commands required for the final clean commit: `npm.cmd ci --ignore-scripts --no-audit --no-fund --offline`; `npm.cmd run check`; `npm.cmd run test:coverage`; `npm.cmd run test:compat:v063-live`; `node scripts/test-package-journey.mjs`; `npm.cmd pack --dry-run`; `npm.cmd audit --audit-level=low`.
- Final local candidate: commit `a71851e98a0b2c00130796a3370c6f5dd86771d2`, tree `327f7d5c4cdae94a0e910d1e11ab5805a9db20fa`.
- Final local results: offline `npm ci` exited 0; `npm run check` exited 0 with 85 syntax-audited JavaScript modules and 213 passed / 0 failed tests across 32 files; `npm run test:coverage` exited 0 with 92.82% line, 72.66% branch, and 89.05% function coverage; `npm run test:compat:v063-live` exited 0 against exact v0.6.3 commit `9097a0d7014740f592132f50bc41d203b0b80ee5` for Codex, Claude, and both, including CRLF and post-migration-edit rollback preservation; `npm pack --dry-run` and `npm audit --audit-level=low` exited 0.
- Exact package journey: `node scripts/test-package-journey.mjs --json` exited 0 from the clean final source worktree. It produced package SHA-256 `533b0b7400ce49e2c57a716e58b7a2d695d7176e519ccae70d2c7d5431d76fc1`, installed only the TGZ into an isolated prefix, guarded 26 Node invocations against source-tree imports, and verified goal blocking/closure, release authorization blocking, Deep revocation, offline launcher reuse, upgrade preview, modified-contract uninstall protection, and archive safety.
- Scope review: `git diff --check $(git merge-base origin/main HEAD)..HEAD` exited 0. Immutable upstream Provider content remains fingerprint-checked and is exempted from Git whitespace normalization through the explicit `.gitattributes` rule; `node scripts/audit-release.mjs` exited 0 after that review finding was corrected.
- Remaining external evidence: the remote review-branch SHA and Ubuntu/Windows × Node 20/24 matrix URLs remain pending until the branch is pushed. They are release evidence, not substituted by the local results above.
- Scope review: Task 7 adds exact package/live migration journeys, CI enforcement, user docs, release audit coverage, and the RC4 completion/re-anchor regressions needed by the approved Goal/Outcome plan. No source changes target remote `main`, tags, a real user project, UI, daemon, database, or registry service.
- Artifact evidence: source-tree and packed-TGZ evidence are fresh for the final local implementation bytes. Remote review-branch and matrix evidence remain intentionally pending.

## Independent Review

- Review inputs: user goal and constraints, authority sources, this packet, exact RC.3 baseline artifact, final diff, focused regression tests, raw package journeys, compatibility inventory, and CI results.
- Verdict: clean-context read-only review is **GO_TO_REVIEW_BRANCH** for commit `a71851e98a0b2c00130796a3370c6f5dd86771d2`; it found no remaining P0/P1. The final review specifically verified that caller-supplied external-adapter `PASS` data now fails closed with `AUTHORITY_ADAPTER_UNAVAILABLE`, cannot retain `EXTERNAL_EVIDENCE_VERIFIED`, and does not satisfy release evidence.
- Independence limitations: the reviewer was a separate read-only Agent and did not generate the implementation, but this is not a third-party security audit, a real external authority adapter review, or a substitute for terminating remote CI. Formal release remains blocked.

## Experience Feedback

- Record the exact ZIP-to-Git import procedure and the npm audit/cache distinction as sanitized operational candidates if final verification proves them reusable.
- Encode every reproduced RC.3 defect as a regression test rather than relying on this narrative.
- Feed lifecycle recovery findings into `docs/migration.md`, Windows behavior into `docs/troubleshooting.md`, evidence boundaries into `docs/verification.md`, and route behavior into the train/held-out corpus.
- Keep experience candidates non-authoritative until the user reviews their scope and confirms indexing.
