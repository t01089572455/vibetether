# VibeTether Stage 0 RC4 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task; also use `test-driven-development`, `verification-before-completion`, and `using-git-worktrees`. Do not begin implementation until the project user confirms this exact plan.

**Goal:** Produce a clean, self-governed RC4 Stage 0 candidate whose retained public capabilities are proven through the installed-package path, whose UI and lifecycle-entry contracts are restored without claiming host enforcement, and whose package, v0.6.3 migration/rollback, four-platform matrix, and independent-review evidence all bind the same exact commit.

**Architecture:** Keep the existing single-package CLI, tracked Project Contract, per-worktree runtime, Outcome/Evidence plane, cold Provider broker, and generated progress model. Add only a machine-readable Stage 0 baseline, package-path verification, a bounded UI lifecycle gate at the VibeTether-controlled CLI boundary, consistent entry/re-entry contracts, and generated self-status. Do not add a daemon, database, remote control plane, transcript store, host-hook framework, Claim Envelope, Decision registry, cockpit, or any Stage 1+ mechanism.

**Tech Stack:** Node.js ESM (`node:test`), npm package/TGZ journey, JSON registries, Markdown generated status/docs, Git worktrees, GitHub Actions on Ubuntu/Windows with Node 20/24.

---

## 0. Control envelope and authority

### Fixed baseline

- Repository: `D:\python_workspace\gyws\.scratch\vibetether-rc3-hardening-v1`
- Branch: `integration/rc3-hardening-v1`
- Commit: `d5130081a72271f2cb9c32792300d87208ffa452`
- Package identity at baseline: `vibetether@1.0.0-rc.4`
- Existing user work that must be preserved byte-for-byte until reviewed: the four-link addition in `README.md` shown by `git diff -- README.md`.
- External evidence root reserved for later execution: `D:\python_workspace\gyws\.scratch\vibetether-stage0-evidence-v1` (it does not currently exist; create it only after the applicable authorization and never place candidate source bytes there).

### Authority order for Stage 0

1. The project user's current instruction and later confirmation/rejection of this plan.
2. `docs/superpowers/specs/2026-07-22-vibetether-comprehensive-improvement-design.md`, specifically the Stage 0 deliver/exit contract and design exit boundary.
3. The final Decision Memory, Host Enforcement, and Failure Replay documents for cross-stage constraints; their mechanisms remain outside Stage 0.
4. `docs/design/VIBETETHER-BEGINNER-AND-CAPABILITY-CONTRACT.md` and `docs/design/VIBETETHER-COMPATIBILITY-AND-DATA-CONTRACT.md` for retained RC4 public behavior.
5. `docs/design/VIBETETHER-CONTROL-CAPABILITY-STATUS.md` as a status hypothesis to reconcile against source and evidence, not as independent authority.
6. Prior raw local conversations only as provenance if an unresolved ambiguity or decision conflict appears. No such unresolved conflict was found during this review, so no prior transcript was consulted.

The focused Decision Memory, Host Enforcement, Failure Replay, and cockpit-era documents use their own local sequencing. The comprehensive design in `d513008` explicitly consolidates the final delivery order; therefore Stage 0 is followed by correction/failure generalization, Decision Memory, Claim Integrity, Host Enforcement, inspect, cockpit, and optional adapters. This is a resolved document-version issue, not a reason to elevate an older conversation.

### Authorization gates

- **Gate A — plan confirmation:** authorizes an isolated local Stage 0 worktree, local product/test/doc changes, local commits, and local verification. It does not authorize a push, network-dependent live migration, remote CI, merge, tag, release, deployment, publication, or Stage 1 work.
- **Gate B — external evidence authorization:** separately authorizes the read-only network retrieval needed by the live v0.6.3 exercise and pushing one review branch to run the four GitHub Actions jobs and independent review. It still does not authorize `main`, a tag, a release, deployment, or publication.
- **Gate C — main/release authorization:** explicitly outside this plan and must remain a later user decision.

### Non-goals

Do not implement or stub any of the following in Stage 0:

- Correction Event/Card/Permit, rejected-strategy memory, Action Envelope, or Failure Card registry;
- Decision registry, raw-session adapter, transcript scanner, rehydration coverage, or document-sync plane;
- Claim Envelope, Evidence Vector/exact-environment receipt, claim adjudicator, or claim-language interception;
- Codex/Claude host hooks, guarded/external enforcement adapters, `before-action`, `stop`, or capability-status dispatcher;
- `inspect`, local web cockpit, graph/timeline UI, daemon, service, database, remote PM, or multi-package split;
- replay automation for later-stage correction, claim, raw-session, or host-hook scenarios;
- version bump, `main` merge, tag, release, deployment, publication, or live user-project migration.

## 1. Core implementation review at `d513008`

### Repository and evidence state

| Check | Fresh local result | Interpretation |
|---|---|---|
| Git identity | `integration/rc3-hardening-v1` at exact `d5130081...` | Correct requested baseline |
| Working tree | only `README.md` modified | User work; preserve and review, never stash/reset/drop silently |
| `npm test` | 214 passed, 1 failed, 32 files | The only failure is the exact-package journey refusing a dirty source with `PACKAGE_SOURCE_DIRTY`; this is an intentional safety refusal, not a product regression |
| `npm run check:syntax` | 85 JS modules passed | Current source parses on Windows Node 24 |
| `npm run audit:budgets` | passed | Contract, entry Skills, managed block, capsule, and exposed-Skill budgets are within limits |
| `npm run audit:release` | 49 Providers, 44 capabilities, 6 pinned sources verified | Registry provenance/integrity audit is locally green |
| `npm run eval` | routing train 12/12, held-out 14/14, adversarial 37/37; seven longitudinal fixtures green | Fixed local corpus only; not a substitute for package, platform, real-host, or independent evidence |
| Node/npm used | Node `v24.11.1`, npm `11.6.2`, Windows | No current Node 20 or Ubuntu execution evidence |

### Capability assessment

| Area | Current status | Source-backed finding | Stage 0 obligation |
|---|---|---|---|
| Adaptive/deep entry | Implemented | classifier, Start Card, Permit, and direction-sensitive refusal exist | freeze public package journey and re-entry parity |
| Fresh Truth | Implemented locally | `init` writes an empty Truth map and does not scan docs | prove from installed TGZ with tempting repository docs present |
| Outcome/progress/evidence | Implemented | schema-2 Contract, acceptance mapping, final-byte evidence, completion ladder, and validator migration exist | preserve all gates and bind Stage 0 completion to current exact bytes |
| Provider catalog/packs | Implemented locally | catalog is cold; standard/extended/web/production locks and integrity audits exist | prove all profiles/bundles and no runtime download from installed TGZ |
| Custom routes | Partial | routes union-add outputs/evidence and retain universal kernel gates | add installed-package overlay, upgrade-retention, ambiguity, and non-weakening coverage |
| Proven Path/Experience | Implemented locally | candidate capture, confirmation, targeted recall, and invalidation exist | add installed-package recall/invalidation journey |
| UI control loop | Partial | design, frontend, and browser capabilities exist, but the full reference/design/golden/one-state/render/dual-acceptance/propagation contract does not | restore the complete capability contract and VibeTether-controlled propagation refusal |
| Phase re-entry | Partial | normal Skill covers phase/slice, compaction, resume, handoff, repeated failure, merge, completion; deep and managed blocks are narrower | make packaged normal/deep/managed contracts consistent within their roles |
| Worktrees/recovery | Implemented locally | leases, handoff, stale locks, reconciliation, migration/upgrade/uninstall protection exist | freeze package-path journeys and current-platform behavior |
| Decision/Claim/Host/inspect/cockpit | Designed only | no source/CLI/schema implementation exists | keep status honest; do not implement in Stage 0 |
| Self-governance | Missing/partial | this repository has no attached Project Contract; old plans/delivery records point at older commits and incomplete checklists | attach a current Contract and generate/audit status from one baseline manifest |

### Release-evidence gaps

- The historical independent review and exact package evidence bind `a71851e`, not `d513008` or a future Stage 0 candidate.
- The historical live migration result and coverage report are stale after later Windows-lock and documentation commits.
- `.github/workflows/ci.yml` declares Ubuntu/Windows × Node 20/24, but a workflow declaration is not executed matrix evidence.
- The current branch has no clean TGZ result because the user-owned `README.md` edit correctly triggers the dirty-source refusal.
- The repository cannot currently self-discover a Project Contract. The global `vibetether` executable was not available, and the local CLI correctly failed discovery instead of inventing control state.

## 2. Stage 0 outcomes

Stage 0 is complete only when all eight outcomes are satisfied on one exact commit:

1. **S0-O1 — Custody:** every pre-existing uncommitted byte is reviewed and preserved or explicitly rejected by the user; work occurs in an isolated branch/worktree.
2. **S0-O2 — Self-control:** this repository has a current tracked VibeTether Project Contract, confirmed Stage 0 Intent/Outcome coverage, generated progress, and no stale self-status.
3. **S0-O3 — Baseline freeze:** one machine-readable inventory maps every retained public capability and lifecycle journey to public-path tests, docs, and current maturity.
4. **S0-O4 — UI and re-entry:** the complete UI lifecycle is exposed through capability/entry contracts; VibeTether-controlled propagation refuses to start without golden-screen, functional, and visual acceptance receipts; host bypass remains honestly labeled advisory.
5. **S0-O5 — Public non-regression:** fresh Truth, custom route overlays, all Provider profiles/bundles, provenance/security, Proven Path recall/invalidation, budgets, Outcome/Evidence, worktrees, recovery, upgrade, rollback, and uninstall pass from the packed artifact.
6. **S0-O6 — Beginner surface:** the README leads with the shortest verified install and situation-based normal/deep/customization examples, and clearly separates implemented, partial/advisory, and future behavior.
7. **S0-O7 — Exact delivery evidence:** clean TGZ/ZIP identity, live v0.6.3 migrate/rollback, and Ubuntu/Windows Node 20/24 results all bind the same final commit and package digest.
8. **S0-O8 — Independent disposition:** an independent reviewer evaluates the exact candidate on a separate review branch; no finding is hidden and no review is relabeled as release authorization.

## 3. RED acceptance contract

### RED rules

1. Add one failing public-observable assertion before each product fix.
2. Run the focused test on unchanged product bytes and record the expected error/assertion; a syntax error, missing fixture, or unrelated failure does not count.
3. If a proposed test is already green, classify it as characterization and strengthen the test until it exposes the documented gap; never manufacture a product failure.
4. Preserve every existing refusal, budget, integrity, outcome, evidence, migration, and recovery gate. Tests may be extended, not weakened or deleted to obtain green.
5. Demonstrate RED on a test-only commit/worktree and GREEN on the implementation commit. Keep both command outputs in the external evidence record.
6. Package-path GREEN means the CLI installed from the exact TGZ, not a direct import from `src/` and not the source-tree launcher.

### Known/current and planned RED matrix

| ID | Baseline condition / expected RED | Focused command after the test exists | Required GREEN boundary |
|---|---|---|---|
| `S0-R00` | **Observed now:** dirty baseline refuses exact packaging with `PACKAGE_SOURCE_DIRTY` | `node --test test/rc4-package-journey.test.mjs` | clean isolated candidate packages; the same test still refuses a deliberately dirty fixture/source clone |
| `S0-R01` | repository has no Project Contract and stale historical status is not machine-detectable | `node --test test/stage0-self-control.test.mjs` | tracked Contract exists; canonical inventory and generated status agree; stale commit/checklist fixtures fail closed |
| `S0-R02` | UI redesign classification routes to generic `product-design`; the UI contract omits product UX, reference intake, design tokens, one-state render/compare, and lock/propagate | `node --test --test-name-pattern="complete UI lifecycle" test/stage0-ui-control.test.mjs` | package exposes the ordered UI lifecycle and selects `frontend-product-design` for UI direction work |
| `S0-R03` | a controlled UI propagation route can start without recorded golden, functional, and visual acceptances | `node --test --test-name-pattern="propagation gate" test/stage0-ui-control.test.mjs` | first-state implementation rejects missing golden approval; propagation rejects each missing axis; all three current receipts permit only the bounded route |
| `S0-R04` | deep Skill and generated managed host block omit parts of the normal phase/slice/repeated-failure/handoff completion re-entry contract | `node --test test/stage0-entry-reentry.test.mjs` | installed normal/deep Skills and Codex/Claude managed blocks contain the role-appropriate canonical boundary set and stay within budgets |
| `S0-R05` | there is no exhaustive installed-package assertion tying all retained capabilities to a public journey | `node --test test/stage0-package-capabilities.test.mjs` | every ID in `registry/capabilities.json` is present in the Stage 0 inventory and exercised through the installed TGZ or explicitly marked designed/non-public with a checked reason |
| `S0-R06` | fresh Truth, overlay retention, provider coldness/security, and Proven Path are covered mainly by source tests or only a narrow package journey | `node --test test/stage0-package-contract.test.mjs` | one installed-TGZ suite proves all listed cases, including upgrade preview/apply/rollback where applicable |
| `S0-R07` | README lacks a complete custom-route path and does not sharply separate later Decision/Claim/Host/inspect/cockpit behavior from current advisory RC4 | `node --test test/stage0-readme.test.mjs` | every documented command is parsed/executed in a safe fixture; the implementation/status wording audit is green |
| `S0-R08` | no evidence record can prove current commit + package digest + live migration + four matrix jobs + independent review | `node scripts/verify-stage0-evidence.mjs --manifest <external-evidence-manifest>` | missing, stale, self-reviewed, wrong-OS/Node, wrong-commit, or wrong-package evidence is rejected; exact complete record passes |

`S0-R01` through `S0-R08` are planned REDs. They have not been created or run in this planning session and must not be reported as observed failures yet.

### Characterization gates that must remain green before product edits

Run and record these before the first implementation change:

```powershell
node --test test/init-context.test.mjs
node --test test/rc3-router-generalization.test.mjs
node --test test/provider-packs.test.mjs
node --test test/rc4-provider-integrity.test.mjs
node --test test/rc4-entry-skill-contract.test.mjs
node --test test/truth-experience.test.mjs
node --test test/rc4-goal-doctor.test.mjs
node --test test/rc3-evidence-semantic.test.mjs
node --test test/rc4-lifecycle-recovery.test.mjs
node --test test/worktree.test.mjs
npm run audit:budgets
npm run audit:release
```

If a characterization gate fails on a clean `d513008` worktree, stop and classify that failure before implementing the planned REDs.

## 4. Bounded implementation sequence

### Task 0: Establish custody and an isolated execution worktree

**Files:**

- Preserve without editing: `README.md` in the current worktree
- Carry into the execution branch after confirmation: `docs/superpowers/plans/2026-07-22-vibetether-stage-0-stabilization.md`
- Create branch/worktree: `codex/vibetether-stage0` at a sibling directory, based on exact `d513008`

**Step 1: Capture read-only custody evidence**

```powershell
git status --short
git diff --check -- README.md
git diff --binary -- README.md
git rev-parse HEAD:README.md
git hash-object README.md
git rev-parse HEAD
```

Expected: only `README.md` is pre-existing user work; record its patch hash in the external evidence directory.

**Step 2: Create the worktree only after Gate A**

Use the `using-git-worktrees` skill. Resolve and verify the exact sibling target before creation:

```powershell
git worktree add -b codex/vibetether-stage0 D:\python_workspace\gyws\.scratch\vibetether-stage0 d5130081a72271f2cb9c32792300d87208ffa452
```

**Step 3: Reapply reviewed planning and README bytes**

Use `apply_patch`, not stash/reset/checkout and not an unreviewed bulk patch. Reapply this plan and the four existing README links exactly. Verify the original worktree still has the original diff.

**Step 4: Record baseline checks**

Run the characterization gates from Section 3 in the new worktree. Do not run the exact package journey until the worktree has a clean committed identity.

**Commit:** `docs: adopt bounded Stage 0 plan and preserved README work`

### Task 1: Freeze a canonical Stage 0 inventory and create the RED suite

**Files:**

- Create: `registry/stage0-baseline.json`
- Create: `scripts/audit-stage0-baseline.mjs`
- Create: `scripts/render-capability-status.mjs`
- Create: `test/stage0-self-control.test.mjs`
- Create: `test/stage0-ui-control.test.mjs`
- Create: `test/stage0-entry-reentry.test.mjs`
- Create: `test/stage0-package-capabilities.test.mjs`
- Create: `test/stage0-package-contract.test.mjs`
- Create: `test/stage0-readme.test.mjs`
- Create: `test/fixtures/stage0/stale-status.json`
- Modify: `package.json`
- Modify: `test/all.test.mjs`

**Step 1: Add the inventory schema as test data first**

The manifest must enumerate:

- all 44 baseline capability IDs and whether they are retained public, internal, or later-designed, plus the one planned Stage 0 `frontend-propagation` capability in the candidate inventory;
- adaptive/deep entry, Truth, routes, UI, provider packs, budgets, Outcome, Evidence, Experience, worktrees, migration/upgrade/rollback/uninstall, and recovery journey IDs;
- public CLI/package-path test IDs for every retained capability;
- maturity (`implemented`, `partial-advisory`, `designed`) and the stage allowed to promote it;
- source, test, and documentation locators;
- non-weakening invariants and exact completion evidence axes.

Do not encode a final Git commit in tracked bytes; the external evidence manifest binds the immutable commit and package digest.

**Step 2: Add status audit RED**

```powershell
node --test test/stage0-self-control.test.mjs
```

Expected RED: missing canonical inventory/generated status or `SELF_STATUS_STALE`, not a parse error.

**Step 3: Add each focused RED independently**

Run `S0-R02` through `S0-R07` one at a time using the commands in Section 3. Record the exact failing assertion for each. The package tests may initially fail because their report fields/journeys do not exist; they must not fail merely because the source worktree is dirty.

**Step 4: Wire audit commands without making tests green by omission**

Add:

```json
"audit:stage0": "node scripts/audit-stage0-baseline.mjs",
"render:capability-status": "node scripts/render-capability-status.mjs"
```

Include `audit:stage0` in `npm run check` only after its intended implementation exists.

**Commit:** `test: codify Stage 0 known failures and baseline inventory`

### Task 2: Attach VibeTether's own Project Contract

**Files generated by the public CLI:**

- Create: `.vibetether/project.json`
- Create: `.vibetether/intent.md`
- Create: `.vibetether/TRUTH.md`
- Create: `.vibetether/outcomes.json`
- Create: `.vibetether/PROGRESS.md`
- Create: `.vibetether/experience.json`
- Create: `.vibetether/skills.lock.json`
- Create: `.vibetether/routes.json`
- Create: `.vibetether/vt.mjs`
- Create: `AGENTS.md`
- Create: `.agents/skills/vibe-tether/SKILL.md`
- Create: `.agents/skills/vibe-tether-deep/SKILL.md`

**Step 1: Preview exact writes**

```powershell
node .\bin\vibetether.mjs init --project . --agent codex --profile standard --control-mode team --goal "Stabilize VibeTether RC4 through the bounded Stage 0 contract only." --success-evidence "All Stage 0 Outcomes and exact evidence gates in the confirmed plan are satisfied on one commit." --scope-boundary "Stage 0 only; no main merge, release, publication, live user-project migration, or Stage 1+ mechanism." --constraint "Preserve and review pre-existing uncommitted README work." --confirmed --dry-run --json
```

Expected: only the 13 files listed above.

**Step 2: Initialize only after the plan-confirmation locator exists**

Repeat with `--yes` instead of `--dry-run`. Confirm that fresh `.vibetether/TRUTH.md` is empty; initialization must not activate repository docs.

**Step 3: Add authority candidates, then confirm only applicable Stage 0 sources**

Add the comprehensive design and this plan as candidates with bounded roles/scope/phases. The user's Gate A reply is the authority for confirming them. Keep Decision Memory, Host Enforcement, Failure Replay, and Capability Status out of confirmed Stage 0 Truth unless the user explicitly assigns them a role; they remain referenced design/evidence, not silently elevated authority.

Example previewed sequence, with exact roles validated against `src/truth.mjs` before mutation:

```powershell
node .\bin\vibetether.mjs truth add --project . --path docs/superpowers/specs/2026-07-22-vibetether-comprehensive-improvement-design.md --role product-direction --scope . --phase PLAN --phase EXECUTE_ONE --phase VERIFY --phase REVIEW --source "user-confirmed-stage0-design" --reason "The user confirmed the final Stage 0 design boundary." --yes --json
node .\bin\vibetether.mjs truth add --project . --path docs/superpowers/plans/2026-07-22-vibetether-stage-0-stabilization.md --role implementation-plan --scope . --phase PLAN --phase EXECUTE_ONE --phase VERIFY --phase REVIEW --source "user-confirmed-stage0-plan" --reason "The user confirmed this exact bounded implementation plan." --yes --json
node .\bin\vibetether.mjs truth confirm --project . --path docs/superpowers/specs/2026-07-22-vibetether-comprehensive-improvement-design.md --yes --json
node .\bin\vibetether.mjs truth confirm --project . --path docs/superpowers/plans/2026-07-22-vibetether-stage-0-stabilization.md --yes --json
```

If either proposed role is unsupported, stop and use an existing semantically correct role; do not broaden the Truth schema in Stage 0 merely to fit self-hosting labels.

**Step 4: Propose and confirm the eight Stage 0 Outcomes**

Use the existing Outcome CLI and current user-message locator. Every consequential route must bind at least one required Outcome and its exact acceptance IDs. Mark network/matrix/review acceptances open until Gate B evidence exists. Do not create a release authorization Outcome.

**Step 5: Re-run self-control test**

```powershell
node --test test/stage0-self-control.test.mjs
node .\.vibetether\vt.mjs context --boundary task-entry --task "Continue confirmed Stage 0 implementation." --json
```

Expected: current Contract is discoverable, fresh, and bounded to Stage 0; `S0-R01` may remain red only for generated historical-status reconciliation, not missing Contract.

**Commit:** `chore: attach the Stage 0 Project Contract`

### Task 3: Restore phase re-entry and the complete UI capability contract

**Files:**

- Create: `src/ui-control.mjs`
- Modify: `src/task-classifier.mjs`
- Modify: `src/step.mjs`
- Modify: `src/context.mjs`
- Modify: `src/adapters.mjs`
- Modify: `registry/capabilities.json`
- Modify: the minimal fallback/provider entries in `registry/providers.json` required for a propagation capability
- Modify: `registry/builtins/vibetether-built-in-design/SKILL.md`
- Modify: `registry/builtins/vibetether-built-in-implementation/SKILL.md`
- Modify: `registry/builtins/vibetether-built-in-verification/SKILL.md`
- Modify: `skills/vibe-tether/SKILL.md`
- Modify: `skills/vibe-tether-deep/SKILL.md`
- Modify: `evals/fixtures/routing-train.json`
- Modify: `evals/fixtures/routing-heldout.json`
- Modify: `evals/fixtures/routing-adversarial.json`
- Test: `test/stage0-ui-control.test.mjs`
- Test: `test/stage0-entry-reentry.test.mjs`

**Step 1: Make UI routing RED, then minimally route UI direction**

Add English and Chinese UI redesign/reference/screenshot prompts. Prove the baseline selects generic `product-design`, then update classification to select `DESIGN/frontend-product-design` with a user-decision requirement. Preserve non-UI design routing.

**Step 2: Expand the declarative UI lifecycle**

The package-visible ordered contract must represent:

```text
UI_DISCOVER
PRODUCT_UX_CONTRACT
REFERENCE_INTAKE
DESIGN_CONTRACT
GOLDEN_SCREEN_APPROVAL
IMPLEMENT_ONE_STATE
RENDER_AND_COMPARE
FUNCTIONAL_ACCEPTANCE + VISUAL_ACCEPTANCE
LOCK_AND_PROPAGATE
```

Extend existing capabilities rather than creating a parallel UI subsystem. Add the narrowly named `frontend-propagation` capability to distinguish one-state implementation from later propagation. Provider overlays may add outputs/evidence but cannot remove these lifecycle gates.

**Step 3: Add the VibeTether-controlled propagation gate**

Use the existing Outcome progress plane; do not add a new UI database/state file. Reserve and document these acceptance IDs for controlled UI work:

- `acceptance_ui_golden_screen` — current owner/user decision for the representative direction;
- `acceptance_ui_functional` — current command/artifact evidence for the representative state;
- `acceptance_ui_visual` — separate current render/compare evidence or required review decision.

At `step start`:

- `frontend-engineering` rejects when the selected required UI Outcomes do not contain a satisfied current golden-screen acceptance;
- `frontend-propagation` rejects until all three acceptances are satisfied and fresh;
- missing coverage rejects with `UI_OUTCOME_CONTRACT_REQUIRED`;
- a stale Outcome revision, authority change, final-byte change, or validator migration keeps using existing invalidation/refusal behavior;
- non-UI capabilities are unchanged.

This is a hard gate only for a VibeTether-controlled route. The README/status must continue to say that an advisory host can bypass the CLI until Stage 4 host adapters exist.

**Step 4: Prove every negative branch before the positive path**

```powershell
node --test --test-name-pattern="propagation gate" test/stage0-ui-control.test.mjs
```

Cases: no UI Outcomes, no golden approval, golden only, functional only, visual only, stale golden receipt, provider/custom-route attempted weakening, and all-current receipts. Only the final case starts the bounded propagation route.

**Step 5: Unify re-entry contracts**

Create one canonical boundary vocabulary in code and render role-appropriate wording into:

- normal entry Skill: task entry, phase/slice change, consequential decision, compaction, resume, handoff, repeated failure, merge, completion-like boundary;
- deep entry Skill: the same re-entry triggers while retaining the pre-code Start Card/Permit workflow;
- Codex/Claude managed block: concise triggers within the 1024-byte budget, with explicit re-entry rather than a claim of automatic host enforcement.

**Step 6: Re-run budgets, routing, and full UI tests**

```powershell
node --test test/stage0-ui-control.test.mjs
node --test test/stage0-entry-reentry.test.mjs
npm run eval
npm run audit:budgets
npm run audit:release
```

**Commit:** `feat: restore bounded UI and lifecycle re-entry contracts`

### Task 4: Prove every retained capability through the installed package

**Files:**

- Modify: `scripts/test-package-journey.mjs`
- Create: `scripts/test-stage0-package-contract.mjs`
- Modify: `test/rc4-package-journey.test.mjs`
- Test: `test/stage0-package-capabilities.test.mjs`
- Test: `test/stage0-package-contract.test.mjs`
- Modify: `registry/stage0-baseline.json`

**Step 1: Keep exact-package hygiene fail-closed**

Test a deliberately dirty disposable source clone and retain `PACKAGE_SOURCE_DIRTY`. Never relax the clean-worktree requirement to accommodate the original README edit.

**Step 2: Build one TGZ and install it offline into isolated prefixes**

The test driver must report source commit, source tree status, TGZ SHA-256, archive file list, installed package version, Node/OS identity, journey IDs, and cleanup result. It must reject symlinks, path traversal, missing files, extra runtime Provider downloads, and digest mismatch.

**Step 3: Add the fresh Truth journey**

Before `init`, seed the consumer repository with plausible `README`, `docs/requirements.md`, ADR, UI reference, and old plan files. After installed-TGZ `init`, assert:

- Intent is only what the CLI was explicitly given;
- Truth confirmed/candidate/declined lists are empty;
- no repository document is activated;
- only the requested entry Skills and profile locks are installed.

**Step 4: Add Provider profile/provenance journeys**

Exercise `core`, `standard`, `extended`, `--bundle web`, and `--bundle production`. Assert no `.vibetether/providers` download/cache appears in the project, exactly one primary is activated per controlled step, shortlist size is at most three, pinned provenance/integrity survives installed-package audit, and tampering fails closed.

**Step 5: Add custom-route overlay/upgrade journeys**

From the installed package:

- add primary/alternative/overlay routes with unambiguous priorities;
- prove an overlay union-adds outputs/exit evidence but cannot remove baseline outputs, universal gates, UI prerequisites, or permission/environment restrictions;
- prove ambiguous primaries fail;
- run `upgrade --dry-run`, apply/rollback in a disposable consumer, and prove user routes remain byte-preserved;
- prove a disabled/preferred provider choice remains valid or fails with an explicit migration message, never silent replacement.

**Step 6: Add Proven Path journey**

Complete one installed-package route, capture and explicitly confirm its candidate, prove targeted recall on matching signals, then change authority/skills/artifact bytes and prove recall invalidates or downgrades instead of silently reusing stale experience.

**Step 7: Exhaust capability inventory**

For every retained public ID in `registry/stage0-baseline.json`, call installed `vibetether capabilities` in a valid phase/profile and run its declared journey. The test fails on an unrepresented registry capability, an inventory entry with no public journey, or a package journey report that omitted an ID.

**Step 8: Run focused package tests from a clean commit**

```powershell
node --test test/rc4-package-journey.test.mjs
node --test test/stage0-package-capabilities.test.mjs
node --test test/stage0-package-contract.test.mjs
```

**Commit:** `test: prove Stage 0 contracts through the exact package`

### Task 5: Reconcile generated status and historical delivery records

**Files:**

- Modify/generated: `docs/design/VIBETETHER-CONTROL-CAPABILITY-STATUS.md`
- Modify: `docs/superpowers/plans/2026-07-21-vibetether-rc3-hardening.md`
- Modify: `docs/superpowers/plans/2026-07-21-vibetether-goal-outcome-coverage.md`
- Modify: `.scratch/rc3-hardening/AGENT_DELIVERY.md`
- Modify: `.scratch/trustworthy-cockpit/AGENT_DELIVERY.md`
- Modify: `registry/stage0-baseline.json`
- Test: `test/stage0-self-control.test.mjs`

**Step 1: Generate, do not hand-maintain, the capability table**

`scripts/render-capability-status.mjs` must deterministically render the status Markdown from the canonical JSON. Include `implemented`, `partial-advisory`, and `designed` rows, source/tests, remaining boundary, and owning stage. Do not promote Decision/Claim/Host/inspect/cockpit.

**Step 2: Reconcile historical plans without rewriting history**

Append a dated reconciliation block that maps completed implementation commits and remaining evidence gates. Do not tick a historical RED checkbox retroactively when its original RED run was not recorded; label it `implemented later / original RED provenance unavailable` and link the current public-path proof.

**Step 3: Mark old delivery evidence as historical**

Preserve the `a71851e` evidence and identify it as non-current. State that exact Stage 0 evidence lives outside candidate bytes and must bind the final commit. Do not insert a future hash or passing claim before the evidence exists.

**Step 4: Run deterministic status audits**

```powershell
npm run render:capability-status
git diff --exit-code -- docs/design/VIBETETHER-CONTROL-CAPABILITY-STATUS.md
npm run audit:stage0
node --test test/stage0-self-control.test.mjs
```

**Commit:** `docs: reconcile generated Stage 0 capability status`

### Task 6: Rewrite the beginner README and verify every command

**Files:**

- Modify: `README.md` while preserving the four pre-existing links unless the user explicitly rejects them
- Modify as needed: `docs/installation.md`
- Modify as needed: `docs/skills.md`
- Modify as needed: `docs/truth.md`
- Modify as needed: `docs/verification.md`
- Modify as needed: `docs/troubleshooting.md`
- Test: `test/stage0-readme.test.mjs`

**Step 1: Lead with the shortest verified path**

Show the exact TGZ/immutable-source install path that the package journey proves. Keep source checkout instructions secondary and distinguish local source execution from an installed package.

**Step 2: Use user situations**

Include concise paths for:

- a vague project needing Deep clarification;
- a clear local fix using Adaptive control;
- a UI redesign using golden screen and dual acceptance;
- compaction/resume and explicit re-entry;
- a correction, clearly labeled as manual re-anchor today and Stage 1 automatic correction handling later;
- first Proven Path capture/confirmation/recall;
- goal completion versus release authorization;
- custom Provider profile/bundle and route overlay.

**Step 3: State limitations without euphemism**

Explicitly say current enforcement is advisory outside VibeTether-controlled CLI routes; no raw-session Decision Memory, Correction Lock, Claim Envelope/exact-environment proof, host hooks, inspect/cockpit, daemon, database, runtime Provider download, or release automation exists in Stage 0.

**Step 4: Execute docs as tests**

Extract every command block used as a current example and run it in disposable safe fixtures or parse it through the actual CLI. Future examples must be visually labeled and excluded from runnable-current sections.

```powershell
node --test test/stage0-readme.test.mjs
npm run audit:budgets
```

**Commit:** `docs: make the Stage 0 beginner path explicit and honest`

### Task 7: Local candidate hardening and exact artifact evidence

**Files:**

- Create: `scripts/verify-stage0-evidence.mjs`
- Create: `test/stage0-evidence-manifest.test.mjs`
- Modify: `package.json`
- Modify only if the RED proves a real gap: `.github/workflows/ci.yml`
- External, untracked evidence directory: `D:\python_workspace\gyws\.scratch\vibetether-stage0-evidence-v1`

**Step 1: Define evidence schema with negative fixtures**

The manifest must bind:

- exact 40-character commit and clean tree;
- TGZ and ZIP SHA-256 plus archive listings;
- Node/npm/OS/architecture for each run;
- local `check`, coverage, budget, release, Stage 0 audit, and package journey outputs;
- live v0.6.3 source/version, migration ID, rollback result, and post-rollback bytes;
- four distinct matrix job URLs/IDs for Ubuntu/Windows × Node 20/24 at the same commit;
- independent reviewer identity/level, review-branch ref, exact commit/package digest, findings, and disposition;
- explicit `main_merged=false`, `released=false`, and `release_authorized=false`.

Add fixtures for missing axes, wrong digest, stale commit, duplicated matrix job, self-review, configured-but-not-run CI, and release authorization impersonation. Run RED, then implement the validator.

**Step 2: Commit all candidate bytes before exact verification**

```powershell
git status --short
git diff --check
git commit -m "chore: complete the bounded Stage 0 candidate"
git status --porcelain=v1
git rev-parse HEAD
```

Expected: clean tree after the commit. Do not amend after evidence begins; any byte change restarts this task.

**Step 3: Run the full local gate on final bytes**

```powershell
npm run check
npm run test:coverage
npm run audit:stage0
node --test test/stage0-evidence-manifest.test.mjs
node --test test/rc4-package-journey.test.mjs
node --test test/stage0-package-capabilities.test.mjs
node --test test/stage0-package-contract.test.mjs
npm pack --dry-run
git status --porcelain=v1
```

Store raw stdout/stderr, exit codes, timestamps, runtime identity, package listings, and hashes outside the candidate worktree. A local green checkpoint is `LOCAL_STAGE0_READY`, not `STAGE0_COMPLETE`.

**Step 4: Create clean TGZ and ZIP from the same commit**

Use the existing exact-package tooling and a clean Git archive/package directory. Hash both artifacts and verify their contents before recording. The artifact directory must be outside the repository so evidence collection does not dirty the candidate.

**Step 5: Stop at Gate B if not authorized**

If Gate B is absent, report the precise open axes: live v0.6.3, four remote matrix executions, and independent review. Do not call Stage 0 complete.

### Task 8: Gate B live migration, matrix, and independent review

This task is conditional on explicit Gate B authorization.

**Files:**

- No candidate-byte changes allowed
- Update only the external evidence manifest/artifacts
- Remote branch: `codex/vibetether-stage0-review` pointing at the exact candidate commit

**Step 1: Run the live v0.6.3 migrate/rollback journey**

```powershell
npm run test:compat:v063-live
```

The script must verify the fetched version/source, preserve protected user data, record migration/rollback IDs and byte comparisons, and leave no live user project modified. A cache or fixture may supplement but cannot be mislabeled as live.

**Step 2: Push only the review branch**

Create `codex/vibetether-stage0-review` at the exact candidate commit and push that branch only. Do not update `main`, tags, releases, or deployment targets.

**Step 3: Execute and verify the four-job matrix**

Require completed successful jobs for:

- Ubuntu / Node 20
- Ubuntu / Node 24
- Windows / Node 20
- Windows / Node 24

Each job must run `npm run check`, Stage 0 audit/tests, and the exact package journey or upload an exact-package result that the evidence validator can bind. Merely reading `.github/workflows/ci.yml` does not count.

**Step 4: Obtain independent review on exact bytes**

The reviewer must receive the Stage 0 plan, baseline inventory, exact commit, package digest, RED/GREEN record, matrix links, known limitations, and explicit no-release boundary. The review must classify findings; any product-byte fix creates a new commit and invalidates every prior exact artifact/matrix/review receipt.

**Step 5: Validate the final external evidence record**

```powershell
node scripts/verify-stage0-evidence.mjs --manifest <external-evidence-manifest>
git status --porcelain=v1
git rev-parse HEAD
```

Expected: validator passes, worktree is clean, and HEAD/package/migration/matrix/review identities all match.

**Step 6: Present evidence to the user**

Report `STAGE0_EVIDENCE_READY_FOR_OWNER_REVIEW`, not release readiness. Stage 0 becomes complete only after the user reviews this evidence. Stage 1 planning starts in a later, separately authorized session.

## 5. Completion boundary

### `LOCAL_STAGE0_READY` — not complete

All local product/doc/test work is committed and clean; full local check, coverage, audits, public TGZ journeys, fresh Truth/custom routes/providers/Proven Path/UI/re-entry/self-status checks pass; exact TGZ/ZIP hashes exist. Live v0.6.3, remote matrix, or independent review may still be open.

### `STAGE0_EVIDENCE_READY_FOR_OWNER_REVIEW` — complete evidence, awaiting owner review

All of the following are true on the same exact commit/package digest:

- clean candidate identity and no stale self-status;
- every retained public capability has a passing installed-package journey;
- fresh init activates no repository docs and downloads no runtime Provider;
- VibeTether-controlled UI implementation/propagation enforces golden-screen and separate functional/visual gates, while advisory host limitations remain explicit;
- custom overlays cannot weaken core/UI/permission/evidence gates;
- package, live v0.6.3 migration/rollback, Ubuntu/Windows Node 20/24, and independent-review evidence is current;
- self Project Contract and eight Stage 0 Outcomes are current;
- no open P0/P1 finding and every lower finding is shown, not hidden;
- `main_merged=false`, `released=false`, `release_authorized=false`.

### `STAGE0_COMPLETE`

The user explicitly accepts the exact Stage 0 evidence record. This label authorizes neither Stage 1 implementation nor any merge/release action.

### Automatic invalidation

Any candidate-byte, dependency-lock, workflow, Outcome/Truth, Provider registry, test validator, package, or review-scope change after evidence begins returns the state to `LOCAL_STAGE0_READY` or earlier and requires the affected evidence to rerun. A prose claim, old CI link, configured matrix, subagent report, or historical package hash never preserves completion.

## 6. Plan self-review

- **Stage coverage:** every Stage 0 deliver/exit bullet maps to `S0-O1` through `S0-O8` and Tasks 0–8.
- **Scope exclusion:** every Stage 1+ mechanism is explicitly excluded; only UI lifecycle gating uses the existing Outcome/step plane.
- **Public-path rule:** product maturity is earned only through installed-TGZ journeys; source tests remain characterization/unit evidence.
- **RED integrity:** `S0-R00` is the only currently observed RED; all future REDs are labeled planned and require baseline failure evidence before implementation.
- **User-work custody:** the existing README patch is preserved, reviewed, and reapplied explicitly; no stash/reset/checkout/drop is allowed.
- **Authority consistency:** raw prior conversations remain provenance only and were not needed to resolve the final document order.
- **Type consistency:** capability IDs, Outcome/acceptance IDs, evidence manifest fields, completion labels, commit/package digests, and advisory/controlled enforcement wording stay identical from registry to tests, docs, and final evidence.
- **No false finish:** local green, remote matrix, independent review, owner review, `main`, and release are separate gates.
