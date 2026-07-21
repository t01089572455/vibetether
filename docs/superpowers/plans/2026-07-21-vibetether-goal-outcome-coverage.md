# VibeTether Goal and Outcome Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-governed Outcome Contract, exact source-ID coverage, self-maintained progress, and slice/goal/release completion gates so a locally green slice can never be reported as whole-goal completion.

**Architecture:** Keep user authority in a compact schema-2 repository Contract, put mutable Outcome progress in the existing per-worktree runtime plane, and generate `.vibetether/PROGRESS.md` deterministically from those two sources. Bind controlled routes, acceptance evidence, integration-worktree identity, and final bytes through stable Outcome IDs; keep all existing Provider, Deep, evidence, migration, and recovery gates intact.

**Tech Stack:** Node.js ESM, built-in `node:test`, JSON Contracts and receipts, Git worktree snapshots, existing VibeTether transactional file helpers and CLI.

---

## File and interface map

- `src/outcomes.mjs`: validate, digest, read, propose, and mutate the versioned Outcome Contract and exact source-ID mapping sidecars.
- `src/outcome-progress.mjs`: validate/rebuild per-worktree progress, apply completed acceptance evidence, and render/verify tracked `PROGRESS.md`.
- `src/contract.mjs`, `src/init.mjs`, `src/constants.mjs`: schema-2 manifest, fresh draft registry, generated progress asset, version and hard limits.
- `src/runtime.mjs`, `src/step.mjs`, `src/context.mjs`: runtime paths, route-to-Outcome binding, atomic progress transition, and bounded coverage capsule.
- `src/doctor.mjs`: explicit `slice`, `goal`, and `release` verdicts plus precise remaining IDs.
- `src/cli.mjs`: beginner-facing `outcomes` commands and `--outcome` route mapping.
- `src/migrate.mjs`, `src/upgrade.mjs`, `src/uninstall.mjs`: schema-1/v0.6.x preservation, three-way rollback, and owned-file cleanup.
- `evals/run-longitudinal-evals.mjs`: long-session false-completion and recovery corpus.
- `scripts/test-package-journey.mjs`, `scripts/test-live-v063-migration.mjs`: exact installed-package and real compatibility journeys.

### Task 1: Schema-2 Outcome Contract and exact source mapping

**Files:**
- Create: `src/outcomes.mjs`
- Modify: `src/constants.mjs`
- Modify: `src/contract.mjs`
- Modify: `src/init.mjs`
- Modify: `package.json`
- Test: `test/rc4-outcome-contract.test.mjs`

- [ ] **Step 1: Write failing Contract tests**

Create tests that initialize a project and assert `project.json` uses schema 2 with `outcome_index`, that `outcomes.json` is an empty draft registry, that `PROGRESS.md` is generated, and that schema validation rejects unknown fields, unsafe IDs, oversize values, duplicate Outcome/acceptance IDs, dangling dependencies, and invalid source mapping fields. Add a valid sidecar fixture whose entries exercise all five dispositions, then add failing cases for missing/unknown IDs, duplicate ownership, cycles, incompatible fields, count drift, ID-set drift, mapping digest drift, and dangling Outcome references.

```js
const f = await initProject('rc4-outcomes');
const manifest = await jsonFile(path.join(f.root,'.vibetether','project.json'));
assert.equal(manifest.schema_version,2);
assert.equal(manifest.outcome_index,'.vibetether/outcomes.json');
const registry = await jsonFile(path.join(f.root,manifest.outcome_index));
assert.equal(registry.coverage_status,'draft');
assert.deepEqual(registry.outcomes,[]);
assert.match(await readFile(path.join(f.root,'.vibetether','PROGRESS.md'),'utf8'),/Coverage status: draft/);
```

- [ ] **Step 2: Run the focused test and observe RED**

Run: `node --test test/rc4-outcome-contract.test.mjs`

Expected: FAIL because schema 2, `outcome_index`, `src/outcomes.mjs`, and generated progress do not exist.

- [ ] **Step 3: Implement the strict Contract kernel**

Export these interfaces from `src/outcomes.mjs`:

```js
export function emptyOutcomeRegistry(goalId, goalRevisionDigest)
export function validateOutcomeRegistry(value)
export function outcomeRegistryDigest(value)
export async function loadOutcomeRegistry(context, { allowLegacy = false } = {})
export function validateCoverageMapping(value, registry)
export async function auditCoverageSources(context, registry)
```

Use stable logical IDs matching `/^[a-z][a-z0-9_-]{2,95}$/`, SHA-256 revision fields, exact-key validation, bounded arrays/text, acyclic dependencies, unique acceptance IDs per registry, and safe project-relative sidecar paths. Compute source ID-set digests from sorted unique IDs using canonical JSON; compute `mapping_revision_digest` from canonical sidecar bytes. Fresh initialization writes schema 2, `1.0.0-rc.4`, `.vibetether/outcomes.json`, and the deterministic initial `.vibetether/PROGRESS.md` without scanning repository documents.

- [ ] **Step 4: Run focused and baseline tests**

Run: `node --test test/rc4-outcome-contract.test.mjs test/init-context.test.mjs test/safety-cli.test.mjs`

Expected: PASS; fresh projects use schema 2 and schema-1 fixtures remain inspectable but cannot perform consequential writes.

- [ ] **Step 5: Commit the Contract slice**

```bash
git add package.json src/constants.mjs src/contract.mjs src/init.mjs src/outcomes.mjs test/rc4-outcome-contract.test.mjs
git commit -m "feat: add versioned outcome coverage contract"
```

### Task 2: User-governed Outcome CLI and exact coverage audit

**Files:**
- Modify: `src/outcomes.mjs`
- Modify: `src/cli.mjs`
- Test: `test/rc4-outcome-governance.test.mjs`

- [ ] **Step 1: Write failing governance tests**

Test `outcomes status`, `list`, `propose`, `confirm`, `defer`, `reject`, `supersede`, and `coverage confirm`. Assert mutations preview by default, a bare `--yes` or `--confirmed-by-user` never creates authority, applying a directional mutation requires `--user-message-locator` plus bounded `--reason`, candidates remain non-authoritative, and coverage confirmation fails until every source mapping passes exact audit and an integration worktree is designated.

```js
const preview = await mainJson(['outcomes','propose','--project',f.root,'--outcome-json',JSON.stringify(candidate)]);
assert.equal(preview.applied,false);
await assert.rejects(
  main(['outcomes','confirm','--project',f.root,'--id',candidate.id,'--yes']),
  (error) => error.code === 'USER_DECISION_REQUIRED',
);
```

- [ ] **Step 2: Run the focused test and observe RED**

Run: `node --test test/rc4-outcome-governance.test.mjs`

Expected: FAIL with `Unknown command: outcomes`.

- [ ] **Step 3: Implement preview/apply governance**

Add pure mutation functions that return `{registry, preview, decision_receipt}` and never write until the CLI receives both decision fields. Store receipts with prior/result registry digests, target IDs, action, user message locator, reason, and timestamp. `coverage confirm` runs `auditCoverageSources`, rejects candidate or unresolved outcomes, records the current worktree ID as `integration_worktree_id`, and sets `coverage_status: confirmed`; direct byte drift later yields `changed`, never silent acceptance.

- [ ] **Step 4: Run governance and safety tests**

Run: `node --test test/rc4-outcome-governance.test.mjs test/safety-cli.test.mjs test/deep-mode.test.mjs`

Expected: PASS; no boolean or Agent-authored summary can grant directional authority.

- [ ] **Step 5: Commit the governance slice**

```bash
git add src/outcomes.mjs src/cli.mjs test/rc4-outcome-governance.test.mjs
git commit -m "feat: govern outcomes with user decisions"
```

### Task 3: Runtime Outcome progress and deterministic `PROGRESS.md`

**Files:**
- Create: `src/outcome-progress.mjs`
- Modify: `src/runtime.mjs`
- Modify: `src/step.mjs`
- Modify: `src/context.mjs`
- Modify: `src/cli.mjs`
- Modify: `test/helpers.mjs`
- Test: `test/rc4-outcome-progress.test.mjs`

- [ ] **Step 1: Write failing route/progress tests**

Create a confirmed registry with two required Outcomes and three acceptance IDs. Assert a consequential step cannot start without `--outcome`, cannot reference candidate/deferred/rejected/superseded Outcomes, and cannot map a success check to an undeclared acceptance ID. Finish one valid step and assert only its mapped acceptance advances, the parent Outcome remains open until all acceptance IDs pass, runtime receipts bind registry/outcome revisions and worktree, and tracked `PROGRESS.md` shows exact remaining IDs.

```js
const route = await mainJson([
  'step','start','--project',f.root,'--outcome','outcome_export_contract',
  '--success-check-json',JSON.stringify({...check,acceptance_ids:['export_browser_path']}),
  '--phase','EXECUTE_ONE','--capability','implementation','--slice','Implement export','--code-write',
]);
assert.deepEqual(route.outcome_ids,['outcome_export_contract']);
```

Also assert finish fails atomically when `PROGRESS.md` is modified, missing, or unwritable: route, checkpoint, Outcome progress, Success Capture, and projection must all remain at their pre-finish generation.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `node --test test/rc4-outcome-progress.test.mjs`

Expected: FAIL because routes do not accept Outcome or acceptance mappings and runtime has no Outcome progress path.

- [ ] **Step 3: Implement progress projection and route binding**

Add `outcome_progress` to `runtimePaths()` and export:

```js
export async function readOutcomeProgress(paths, registry)
export async function rebuildOutcomeProgress(paths, registry, evidenceLoader)
export function applyRouteOutcomeEvidence(progress, registry, route, evidence)
export function renderProgressMarkdown(registry, progress, metadata)
export async function verifyProgressProjection(context, registry, progress)
```

Extend route/start/check schemas with `outcome_ids`, `outcome_revision_digests`, `registry_digest`, and `acceptance_ids`. Extend the final compare-and-set transaction so the satisfied route, current checkpoint, Outcome progress, Success Capture, and `PROGRESS.md` are prepared and verified before any target is replaced. Generated projection content includes generation digest and exact regeneration command; ownership checks reject hand-edited bytes instead of treating them as authority.

- [ ] **Step 4: Add the bounded Context capsule**

Return goal ID/revision, coverage status, counts by state, at most three current Outcome handles, exact omitted count, continuation handle, and next blocking acceptance. Do not inline the full registry or sidecars.

- [ ] **Step 5: Run focused and completion-race tests**

Run: `node --test test/rc4-outcome-progress.test.mjs test/rc4-completion-races.test.mjs test/step-doctor.test.mjs test/init-context.test.mjs`

Expected: PASS; every finish failure leaves all control artifacts on one consistent generation.

- [ ] **Step 6: Commit the progress slice**

```bash
git add src/outcome-progress.mjs src/runtime.mjs src/step.mjs src/context.mjs src/cli.mjs test/helpers.mjs test/rc4-outcome-progress.test.mjs
git commit -m "feat: bind route evidence to outcome progress"
```

### Task 4: Slice, goal, and release Doctor boundaries

**Files:**
- Modify: `src/doctor.mjs`
- Modify: `src/outcomes.mjs`
- Modify: `src/outcome-progress.mjs`
- Modify: `src/cli.mjs`
- Test: `test/rc4-goal-doctor.test.mjs`

- [ ] **Step 1: Write failing layered-verdict tests**

Build a two-Outcome goal, satisfy one slice, and assert `doctor --boundary slice` returns `SLICE_GREEN` while `doctor --boundary goal` fails with the remaining Outcome and acceptance IDs. Assert goal closure fails on draft/changed coverage, source audit errors, stale evidence, unsatisfied dependencies, wrong integration worktree, modified final bytes, or a missing projection. Assert release additionally fails until release-marked acceptance, current package/deployment evidence, review/owner disposition when declared, and explicit release authorization exist.

```js
const report = await inspectProject({project:f.root,boundary:'goal',throw_on_error:false});
assert.equal(report.ok,false);
assert.deepEqual(report.completion.remaining_outcome_ids,['outcome_release_integrity']);
assert.equal(report.completion.label,'SLICE_GREEN');
```

- [ ] **Step 2: Run the focused test and observe RED**

Run: `node --test test/rc4-goal-doctor.test.mjs`

Expected: FAIL because every current completion-like boundary shares one route-only check.

- [ ] **Step 3: Implement explicit boundary evaluation**

Normalize legacy `completion`, `handoff`, and `merge` to their documented level and report `requested_boundary` plus `effective_boundary`. Keep existing route/evidence/Permit checks as the slice gate. Add goal checks over confirmed coverage, exact source audit, progress, dependencies, integration worktree, projection digest, and final snapshot. Add release checks only after goal succeeds. Return `completion.label`, `remaining_outcome_ids`, `remaining_acceptance_ids`, and `unproven_maturity` without promoting a lower label.

- [ ] **Step 4: Add acceptance/test replacement protection**

Validate a migration mapping containing `old_node`, `positive_replacement`, `negative_replacement`, `authority_reason`, and `outcome_revision_digest`. If a validator/test is removed or weakened without that mapping, mark the acceptance and Outcome stale and block goal/release Doctor.

- [ ] **Step 5: Run Doctor and evidence suites**

Run: `node --test test/rc4-goal-doctor.test.mjs test/step-doctor.test.mjs test/rc4-evidence-contract.test.mjs test/rc4-completion-races.test.mjs`

Expected: PASS; route satisfaction proves only the bounded slice unless the complete higher-level Contract is closed.

- [ ] **Step 6: Commit the layered Doctor slice**

```bash
git add src/doctor.mjs src/outcomes.mjs src/outcome-progress.mjs src/cli.mjs test/rc4-goal-doctor.test.mjs
git commit -m "feat: separate slice goal and release verdicts"
```

### Task 5: Schema migration, upgrade, rollback, and uninstall safety

**Files:**
- Modify: `src/migrate.mjs`
- Modify: `src/upgrade.mjs`
- Modify: `src/uninstall.mjs`
- Modify: `src/launcher.mjs`
- Modify: `src/contract.mjs`
- Test: `test/rc4-outcome-lifecycle.test.mjs`

- [ ] **Step 1: Write failing lifecycle tests**

Cover fresh schema 1, canonical v0.6.3 Codex-only/Claude-only/both assets, CRLF, custom routes, modified Skills, legacy Experience, unknown trackers, and post-upgrade edits. Assert normal consequential commands on schema 1 fail with `UPGRADE_REQUIRED` and an exact command; migration/upgrade preview lists every byte operation; apply creates a draft registry without inferring requirements; rollback restores only unchanged migration outputs and preserves three-way conflicts; uninstall protects modified Outcome/Progress assets.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `node --test test/rc4-outcome-lifecycle.test.mjs`

Expected: FAIL because lifecycle inventories do not know schema 2, outcomes, mappings, or progress.

- [ ] **Step 3: Extend the three-way lifecycle transaction**

Include `before_digest`, `migration_output_digest`, and `current_digest` for manifest, Outcome registry, mapping sidecars, generated projection, launchers, managed blocks, routes, Truth, Intent, Experience, and Skills. Preserve original legacy bytes, create only a draft Outcome registry, and classify unknown trackers as candidates. If current bytes match neither before nor migration output, stop overwrite and emit conflict copies plus an exact recovery report.

- [ ] **Step 4: Run lifecycle and fault-recovery tests**

Run: `node --test test/rc4-outcome-lifecycle.test.mjs test/rc4-lifecycle-recovery.test.mjs test/migrate.test.mjs test/upgrade.test.mjs test/uninstall.test.mjs`

Expected: PASS; no lifecycle command damages user-authored post-migration work.

- [ ] **Step 5: Commit the lifecycle slice**

```bash
git add src/migrate.mjs src/upgrade.mjs src/uninstall.mjs src/launcher.mjs src/contract.mjs test/rc4-outcome-lifecycle.test.mjs
git commit -m "feat: migrate outcome contracts without data loss"
```

### Task 6: Longitudinal false-completion and recovery evaluation

**Files:**
- Create: `evals/run-longitudinal-evals.mjs`
- Modify: `package.json`
- Modify: `skills/vibe-tether/SKILL.md`
- Modify: `skills/vibe-tether-deep/SKILL.md`
- Test: `test/rc4-longitudinal-eval.test.mjs`

- [ ] **Step 1: Write the failing longitudinal harness test**

Require deterministic scenarios for: local tests green while parent coverage remains open; GPT Pro/subagent report not integrated; weakened test without positive/negative replacement mapping; Truth revision drift; Provider/external/review/owner axes open at release; compaction restoring exact remaining IDs; and a legacy satisfied route whose pending Truth reconciliation names another route instance. Assert each produces the prescribed blocked/recoverable verdict and exact next action.

- [ ] **Step 2: Run the harness and observe RED**

Run: `node --test test/rc4-longitudinal-eval.test.mjs`

Expected: FAIL because the longitudinal evaluator and recoverable legacy-state normalization do not exist.

- [ ] **Step 3: Implement deterministic journeys and recovery**

The evaluator creates isolated repositories, executes only public CLI commands, and records requested claim, final label, remaining IDs, issue codes, and next action. Legacy mismatched reconciliation becomes `BLOCKED_REANCHOR_REQUIRED`; a dedicated repair/abandon path preserves the old receipt, closes the orphaned route, and permits a fresh plan without manual JSON edits.

- [ ] **Step 4: Update entry Skills honestly**

Document that VibeTether re-enters at task/phase/compaction/completion boundaries, routes to one primary Skill, distinguishes adaptive and Deep preflight, and can enforce only after the host invokes it. State that `SLICE_GREEN` is not goal/release completion and that Outcome/Truth authority still belongs to the user.

- [ ] **Step 5: Run longitudinal and routing evals**

Run: `node --test test/rc4-longitudinal-eval.test.mjs`

Run: `npm.cmd run eval`

Expected: PASS with no universal-accuracy or token-saving claim.

- [ ] **Step 6: Commit the longitudinal slice**

```bash
git add package.json evals/run-longitudinal-evals.mjs skills/vibe-tether/SKILL.md skills/vibe-tether-deep/SKILL.md test/rc4-longitudinal-eval.test.mjs
git commit -m "test: prevent longitudinal false completion"
```

### Task 7: Exact package, real v0.6.x compatibility, CI, and review branch

**Files:**
- Create: `scripts/test-package-journey.mjs`
- Create: `test/rc4-package-journey.test.mjs`
- Modify: `scripts/test-live-v063-migration.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/installation.md`
- Modify: `docs/migration.md`
- Modify: `docs/troubleshooting.md`
- Modify: `docs/verification.md`
- Modify: `.scratch/rc3-hardening/AGENT_DELIVERY.md`

- [ ] **Step 1: Write and run a failing exact-TGZ journey**

Pack the current commit, install the TGZ into an isolated prefix with redirected home/state/cache/config, initialize a repository, govern two Outcomes, prove only one slice, observe goal blocking, close the second Outcome, observe goal closure, observe release blocking, exercise Deep permit revocation, offline project launcher reuse, upgrade preview, uninstall conflict, and archive safety. Record command, exit code, output digests, and final inventory.

Run: `node --test test/rc4-package-journey.test.mjs`

Expected before the script exists: FAIL with a missing module error.

- [ ] **Step 2: Implement the exact package journey**

Use only the installed binary and generated project launcher after installation. A source-tree import is forbidden in the smoke child. Treat a platform-specific skip or network-unavailable live migration as `not-run`, never `pass`.

- [ ] **Step 3: Expand live v0.6.3 migration**

Resolve immutable tag `v0.6.3`; initialize Codex-only, Claude-only, and both fixtures; add CRLF and post-migration user changes; migrate with the packed candidate; run context and one Outcome-controlled slice; rollback; compare path, kind, size, and SHA-256 byte inventories. Preserve raw failures.

- [ ] **Step 4: Configure the four real CI jobs**

Use `ubuntu-latest` and `windows-latest` with Node 20 and 24. Each job runs `npm ci --ignore-scripts --no-audit`, `npm run check`, `npm run test:coverage`, `npm run test:compat:v063-live`, and `node scripts/test-package-journey.mjs`.

- [ ] **Step 5: Update beginner and evidence documentation**

Lead README installation with one command, show adaptive and `vibe-tether-deep` prompts, explain automatic Skill routing, explain Truth/Outcome/Experience ownership, and show the six exact completion labels. Document host-cooperation limits, rollback conflicts, Windows recovery, exact source-ID mapping, and how to regenerate `PROGRESS.md`.

- [ ] **Step 6: Run final-byte local gates**

Run: `npm.cmd ci --ignore-scripts --no-audit --no-fund --offline`

Run: `npm.cmd run check`

Run: `npm.cmd run test:coverage`

Run: `npm.cmd run test:compat:v063-live`

Run: `node scripts/test-package-journey.mjs`

Run: `npm.cmd pack --dry-run`

Expected: all locally applicable commands exit zero; external or Windows-only evidence is labeled pending until the real job terminates.

- [ ] **Step 7: Validate scope and commit delivery evidence**

Run: `python D:/python_workspace/gyws/.agents/skills/gyws-controlled-delivery/scripts/validate_delivery_packet.py .scratch/rc3-hardening/AGENT_DELIVERY.md`

Run: `git diff --check main...HEAD`

Run: `git diff --stat main...HEAD`

Expected: packet valid, no whitespace failures, and every changed path maps to an approved slice.

```bash
git add scripts/test-package-journey.mjs test/rc4-package-journey.test.mjs scripts/test-live-v063-migration.mjs .github/workflows/ci.yml README.md docs/installation.md docs/migration.md docs/troubleshooting.md docs/verification.md .scratch/rc3-hardening/AGENT_DELIVERY.md
git commit -m "test: prove rc4 exact package journeys"
```

- [ ] **Step 8: Push only the review branch**

Run: `git -c http.sslBackend=openssl push -u origin integration/rc3-hardening-v1`

Expected: the review branch is updated; remote `main` and tags remain unchanged. A release recommendation remains blocked until all four CI jobs and clean-context review finish.

## Self-review result

- Spec coverage: Tasks 1-7 cover schema, source sidecars, decision authority, route binding, generated progress, layered completion, test migration, lifecycle safety, longitudinal recovery, exact packages, real compatibility, docs, and review evidence.
- Placeholder scan: the plan contains no deferred implementation marker or reference to an unspecified “similar” implementation; every code-changing task names interfaces, tests, commands, and expected RED/GREEN behavior.
- Type consistency: `outcome_index`, `mapping_path`, `mapping_revision_digest`, `outcome_ids`, `acceptance_ids`, `registry_digest`, `outcome_revision_digests`, and the six completion labels use the same names from Contract through route, progress, Context, and Doctor.
- Scope boundary: no step authorizes remote `main`, a tag, a formal release, migration of a real user project, UI, daemon, database, or remote project-management functionality.
