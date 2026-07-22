# Agent Delivery Packet

Status: in_progress
Task Type: product
Risk: high

## Authority Sources

- `D:/python_workspace/gyws/CONTEXT.md`: defines the parent workspace's governed Agent, checkpoint, evidence, and Skill vocabulary; it does not redefine the standalone VibeTether product.
- `D:/python_workspace/gyws/docs/superpowers/specs/2026-06-20-gyws-product-direction.md`: requires product capability and truthful evidence to outrank decorative UI; applied here as a delivery-quality constraint rather than VibeTether product authority.
- `D:/python_workspace/gyws/docs/superpowers/specs/2026-06-20-history-user-requirements-extraction.md`: records the user's repeated requirement that UI must preserve complete product capability and must not be a pretty shell.
- `D:/python_workspace/gyws/docs/superpowers/specs/2026-06-16-wenshu-agent-product-design-v2.md`: provides accepted parent-workspace patterns for explicit stop reasons, checkpoints, evidence, recovery, and governed experience.
- `D:/python_workspace/gyws/docs/superpowers/specs/2026-06-16-wenshu-ui-product-design.md`: provides delivery constraints for visible state, recoverable errors, accessibility, and evidence drill-down; VibeTether retains its own lighter visual identity.
- Current user decision: VibeTether's primary purpose is to help users control Codex, Claude Code, and similar coding Agents during Vibe Coding, prevent long-task drift and unsupported completion claims, and expose the real state of the whole project.
- `docs/superpowers/specs/2026-07-21-vibetether-goal-outcome-coverage-design.md`: approved Outcome coverage, generated progress, layered completion, Worktree integration, and source-ID gates.
- `docs/superpowers/specs/2026-07-22-vibetether-decision-memory-design.md`: proposed Decision Memory, document/Outcome synchronization, compaction rehydration, Permit binding, and honest host boundary.
- `docs/design/VIBETETHER-BEGINNER-AND-CAPABILITY-CONTRACT.md`: beginner-first capability and adaptive/deep entry promises.
- `docs/design/VIBETETHER-COMPATIBILITY-AND-DATA-CONTRACT.md`: preservation, migration, rollback, and host-cooperation boundaries.
- Current branch implementation and black-box tests under `src/` and `test/`: observed RC4 behavior, not normative product authority.

## Scope

Define and review a lightweight single-project VibeTether cockpit that observes the current repository and all attached worktrees, projects the four Authority/Execution/Proof/Experience planes from deterministic sources, invalidates stale downstream claims, and makes the strongest evidence-backed verdict visible through a local Web UI. Preserve the existing adaptive/deep Agent-control product rather than replacing it with a dashboard.

This packet currently authorizes the written design only. Product-code implementation requires a separately reviewed stage plan.

## Non-Scope

- No product code, Project Contract migration, real user-project mutation, merge, release, or remote publication in this design slice.
- No multi-project portfolio UI, Electron/Tauri application, daemon, database, cloud service, accounts, RBAC, or remote collaboration.
- No semantic LLM inside the deterministic Snapshot or Impact Engine.
- No direct first-release editing of confirmed Truth, Decisions, Outcomes, Evidence, merge, deployment, or release state.
- No claim that VibeTether can force a host without hooks to invoke it or can prevent every unsupported sentence from being generated.

## Must Preserve

- Adaptive and Deep entry, one-question clarification, fact investigation, and user-owned directional decisions.
- Intent, Truth, Decision, Outcome, Provider routing, smallest-slice, Worktree, Evidence, Doctor, Success Capture, and Experience lifecycle contracts.
- Candidate isolation and automatic trust reduction without automatic authority promotion.
- Slice, goal, external, review, owner, and release maturity separation.
- Current user data, provider integrity, migration rollback, uninstall protection, and Windows recovery behavior.
- One repository, one CLI, one installation path, and only two default host-visible VibeTether entry Skills.

## Reference Intake

- Source: `https://github.com/Priivacy-ai/spec-kitty`, `https://github.com/BloopAI/vibe-kanban`, `https://github.com/Fission-AI/OpenSpec`, `https://github.com/langfuse/langfuse`, and `https://github.com/bojieli/ai-agent-book`.
- Classification: structural and interaction reference only.
- Rationale: existing projects demonstrate useful worktree, timeline, specification, observability, and state-projection patterns, but none is accepted as authority or copied as a complete product architecture.
- Target difference: VibeTether joins confirmed project direction, Agent execution, evidence freshness, and reusable experience while remaining local and lightweight.
- Acceptance: every cockpit state must be reproducible from VibeTether and Git data; popularity or screenshots do not prove correctness.

## Conflicts

- RC4 deliberately excluded a visual dashboard. Resolution: keep RC4 frozen; cockpit work begins only in a post-RC4 stage.
- RC5-A Decision Memory is still a proposed written specification. Resolution: do not claim Decision coverage in a cockpit until RC5-A is reviewed and implemented.
- The parent `gyws/.vibetether` control state is old and its Intent/checkpoint do not describe the current RC4 repository. Resolution: treat its failed Doctor result as a self-management defect and do not use it as RC4 progress evidence.
- “Observe all project content” conflicts with lightweight operation and secret safety if interpreted as reading every ignored file. Resolution: observe all tracked and non-ignored changes, govern four VibeTether planes deeply, and display explicit exclusions.
- “Do not let the Agent lie” conflicts with no-hook host limitations if stated absolutely. Resolution: treat Agent statements as claims and prevent unsupported claims from becoming accepted VibeTether verdicts while disclosing the cooperation boundary.

## Skill Routing

- Phase: design; Capability: product and cockpit architecture; Primary Skill: `brainstorming`; Control Skills: `vibe-tether`, `gyws-controlled-delivery`; Exit: user approves the design sections and reviews the committed written specification.
- Next phase after written-spec approval: planning; Primary Skill: `writing-plans`; Exit: Stage 0 has exact files, tests, boundaries, and recovery evidence.
- UI implementation is not yet authorized; a later plan will route one golden-screen slice to the applicable frontend and browser-verification Skills.

## Change Budget and Slices

- Current design slice: one specification and this delivery packet only.
- Stage 0: finish RC4 and attach truthful self-control to the VibeTether repository.
- Stage 1: implement Decision Memory independently.
- Stage 2: implement deterministic Snapshot, Impact, and Worktree aggregation independently.
- Stage 3: implement the local Web cockpit one state family at a time.
- No stage may use a local green result to claim a later stage or the whole product is complete.

## Acceptance Criteria

- The written design maps every main-screen element to a deterministic source.
- Full observation and four-plane governance are distinct and explicit.
- Unsupported Agent prose cannot become an accepted completion or release verdict.
- Unknown semantic impact fails closed only within the applicable directional scope.
- The selected delivery is local Web using Node built-ins and packaged static assets, with no daemon or database.
- Security, privacy, consistency, performance, failure recovery, compatibility, UI, and black-box acceptance boundaries are specified.
- The design preserves every existing VibeTether Agent-control capability and states the no-hook limitation honestly.

## Evidence

- User approved: lightweight positioning, single current project plus all worktrees, full Git change observation, four governance planes, local Web delivery, read-mostly interaction, deterministic data-source mapping, atomic snapshot generations, and staged implementation.
- Current repository branch: `integration/rc3-hardening-v1`; current package metadata: `1.0.0-rc.4`.
- Parent project Doctor returned nonzero with legacy route/authority/reconciliation warnings and invalid experience feedback; this is negative evidence that self-control is not yet closed.
- Design self-review and delivery-packet validation are required before this slice is complete.

## Independent Review

- Review inputs: user requests, approved RC4 design, proposed RC5-A design, this delivery packet, the cockpit specification, current code structure, and the parent Doctor result.
- Verdict: pending after the final written diff.
- Independence limitations: the current author also drafted the specification; self-review cannot be labeled independent product or security review.

## Experience Feedback

- Encode the stale-parent-control discovery as a Stage 0 regression: VibeTether's own repository must not inherit or display an unrelated parent checkpoint as its project status.
- Do not activate a new Proven Path from design work alone; no verified reusable operational workflow has been established yet.

<!-- stage0-reconciliation-2026-07-22 -->
## Stage 0 reconciliation (2026-07-22)

This append-only reconciliation does not rewrite the original design record, reconstruct an unobserved RED, or promote historical evidence into current evidence.

- Commit `a71851e98a0b2c00130796a3370c6f5dd86771d2` and any result inherited from the earlier RC4 packet are historical/non-current evidence only.
- Later bounded Stage 0 work added the tracked self Project Contract, generated capability status, controlled UI/re-entry paths, and exact installed-package journeys. Where the earlier record described a missing control that was later implemented without preserved original failing evidence, the honest label is `implemented later / original RED provenance unavailable`; this does not implement the cockpit.
- `registry/stage0-baseline.json` is the canonical status manifest; the generated capability-status document is its review projection. Decision Memory, Correction, Claim governance, Host Enforcement, Failure Replay, inspect, and the cockpit remain designed future-stage work.
- Exact current Stage 0 candidate commit: pending final candidate bytes.
- Gate B live v0.6.3, remote matrix, and independent-review evidence remain pending.

STAGE0_COMPLETE remains pending owner acceptance.
