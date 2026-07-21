# VibeTether RC.3 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the exact RC.3 source artifact into a reviewable, cross-platform candidate whose beginner routing, deep preflight, completion evidence, lifecycle recovery, Provider activation, and package journeys are enforced by reproducible tests.

**Architecture:** Preserve the single-package modular kernel and the adaptive/deep entry model. Harden boundaries in place: classification produces an impact signature; Deep creates scoped decision receipts and permits; Step completion uses generation-aware compare-and-set validation; lifecycle operations use byte inventories and conflict-preserving recovery; Provider cards verify immutable expected content before activation. Every change begins with a focused regression test and keeps the cold-catalog context model.

**Tech Stack:** Node.js 20/24 ESM, built-in `node:test`, Git CLI, npm packaging, PowerShell/Windows and Ubuntu GitHub Actions.

---

## File Responsibility Map

- `src/task-classifier.mjs`: lexical impact detection and adaptive/deep task signature.
- `src/deep.mjs`: Start Card, question progression, decision receipt, Permit grant/validation/invalidation.
- `src/context.mjs`: compact readiness projection and one-next-action response.
- `src/step.mjs`: controlled route start/finish/abandon and pre-commit completion checks.
- `src/runtime.mjs`: route/lease/evidence persistence, generations, and file locks.
- `src/doctor.mjs`: completion-boundary structural and evidence verification.
- `src/experience.mjs`: non-bypassable success classification and candidate generation.
- `src/git.mjs`: canonical Git/worktree identity and final-byte snapshots.
- `src/files.mjs`: transactional writes, locks, path safety, and rollback primitives.
- `src/migrate.mjs`, `src/upgrade.mjs`, `src/uninstall.mjs`: user-data-safe lifecycle state machines.
- `src/provider-registry.mjs`, `src/provider-cache.mjs`, `src/skills.mjs`: immutable Provider verification and complete resource activation.
- `scripts/run-tests.mjs`: deterministic per-file runner and correct TAP aggregation.
- `test/*.test.mjs`: black-box regressions; fixtures must redirect state, cache, config, home, and skill roots.

### Task 1: Make the Windows baseline truthful and green

**Files:**
- Modify: `test/helpers.mjs`
- Modify: `test/init-context.test.mjs`
- Modify: `test/safety-cli.test.mjs`
- Modify: `test/worktree.test.mjs`
- Modify: `src/git.mjs`
- Modify: `src/global-entry.mjs`
- Modify: `scripts/run-tests.mjs`
- Test: `test/init-context.test.mjs`
- Test: `test/safety-cli.test.mjs`
- Test: `test/worktree.test.mjs`

- [x] **Step 1: Add an isolated host-environment helper and a path-equivalence assertion**

```js
export async function withIsolatedUserRoots(base, action) {
  const keys = ['HOME', 'USERPROFILE', 'VIBETETHER_USER_HOME'];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const home = path.join(base, 'home');
  await mkdir(home, { recursive: true });
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.VIBETETHER_USER_HOME = home;
  try { return await action(home); }
  finally {
    for (const key of keys) prior[key] === undefined ? delete process.env[key] : process.env[key] = prior[key];
  }
}

export async function assertSameRealPath(actual, expected) {
  assert.equal(await realpath(actual), await realpath(expected));
}
```

- [x] **Step 2: Run the three exact baseline files and observe their existing failures**

Run: `node --test test/init-context.test.mjs test/safety-cli.test.mjs test/worktree.test.mjs`

Expected: FAIL showing long/8.3 path spelling mismatch, write under the real user `.codex` root, and malformed quoted `git -C` input.

- [x] **Step 3: Canonicalize Git command working directories without shell quoting**

```js
async function canonicalDirectory(value) {
  const source = String(value ?? '').trim().replace(/^"(.*)"$/s, '$1');
  return realpath(path.resolve(source));
}

export async function runGit(cwd, args, options = {}) {
  const canonicalCwd = await canonicalDirectory(cwd);
  return exec('git', ['-C', canonicalCwd, ...args], gitExecOptions(options));
}
```

Keep `execFile`; do not concatenate a shell command. Update assertions to compare canonical paths while continuing to assert stable repository/worktree UUID equality.

- [x] **Step 4: Make global installation resolve an injectable user home**

```js
export function userHome() {
  return path.resolve(process.env.VIBETETHER_USER_HOME || os.homedir());
}

function skillRoot(agent) {
  return path.join(userHome(), ADAPTERS[agent].userSkillRoot);
}
```

Use `withIsolatedUserRoots()` in the global-entry test and assert that no path returned by the test starts with the real pre-test home.

- [x] **Step 5: Parse both TAP summary spellings and fail if no assertions were counted**

```js
function tapCount(stdout, label) {
  const match = stdout.match(new RegExp(`(?:#|ℹ)\\s*${label}\\s+(\\d+)`, 'u'));
  return match ? Number(match[1]) : null;
}
```

For each successful file require a non-null pass count; aggregate `pass` and `fail`; add a runner self-test that rejects an exit-zero child with no TAP counts.

- [x] **Step 6: Run the focused tests and full check**

Run: `node --test test/init-context.test.mjs test/safety-cli.test.mjs test/worktree.test.mjs`

Expected: PASS with Windows-only cases executed or explicitly skipped only for unavailable OS privileges.

Run: `npm.cmd run check`

Expected: PASS and `Test summary` reports the actual positive assertion count rather than zero.

- [x] **Step 7: Commit the bounded Windows/test-harness slice**

```bash
git add src/git.mjs src/global-entry.mjs scripts/run-tests.mjs test/helpers.mjs test/init-context.test.mjs test/safety-cli.test.mjs test/worktree.test.mjs
git commit -m "fix: make Windows baseline and test counts reliable"
```

### Task 2: Make adaptive and Deep readiness require real decisions

**Files:**
- Create: `test/rc4-entry-readiness.test.mjs`
- Modify: `src/task-classifier.mjs`
- Modify: `src/deep.mjs`
- Modify: `src/context.mjs`
- Modify: `src/cli.mjs`
- Modify: `skills/vibe-tether/SKILL.md`
- Modify: `skills/vibe-tether-deep/SKILL.md`
- Modify: `README.md`
- Test: `test/rc4-entry-readiness.test.mjs`

- [x] **Step 1: Add mixed-intent, negation, filename-bypass, and question-order regressions**

```js
const blocked = [
  'Deploy the service and then show me the logs.',
  'Delete old accounts and explain what changed.',
  'Run the migration, then summarize it.',
  'Do not use deep mode; implement the new public API.',
  'In src/auth.mjs add SSO and decide the architecture yourself.',
];
for (const text of blocked) {
  const result = classifyTaskText(text);
  assert.notEqual(result.mode, 'observation', text);
  assert.equal(result.needs_user_decision, true, text);
}
```

Add a Deep journey that proves only one unresolved decision is returned at a time and code-write stays blocked until the exact final Start Card is confirmed.

- [x] **Step 2: Run the new test and verify the current bypasses fail**

Run: `node --test test/rc4-entry-readiness.test.mjs`

Expected: FAIL because read-only words currently outrank write impact, deep negation matches, and a specific file can suppress clarification.

- [x] **Step 3: Replace rule-order shortcuts with an explicit impact signature**

```js
const impact = {
  read: READ_ONLY.test(source),
  write: WRITE.test(withoutNegatedClauses(source)),
  external: EXTERNAL_ACTION.test(source),
  destructive: DESTRUCTIVE_ACTION.test(source),
  directional: DIRECTIONAL.test(source),
  publicBehavior: PUBLIC_BEHAVIOR.test(source),
};
const observationOnly = impact.read && !Object.values({
  write: impact.write,
  external: impact.external,
  destructive: impact.destructive,
  directional: impact.directional,
  publicBehavior: impact.publicBehavior,
}).some(Boolean);
```

Detect explicit deep requests only in non-negated clauses. A filename, issue number, or test name may bound location but cannot authorize product, architecture, data, permission, UI, external, destructive, or release decisions.

- [x] **Step 4: Add a decision receipt and one-next-question state**

```js
const decisionReceipt = {
  schema_version: 1,
  id: randomUUID(),
  start_card_digest: startCardDigest(card),
  task_digest: sha256Text(card.task),
  question_id: question.id,
  selected_option: answer.selected_option,
  user_message_locator: answer.user_message_locator,
  recorded_at: new Date().toISOString(),
};
```

`deep prepare` returns `next_question` with a recommendation and impact. `deep answer` accepts one answer, records one receipt, recomputes the Start Card, and returns the next unresolved question. A bare `--confirmed-by-user` flag cannot create a Permit.

- [x] **Step 5: Bind the Permit to the full consequential envelope**

```js
const binding = {
  authority_digest,
  worktree_id,
  control_generation,
  task_digest,
  start_card_digest,
  slice_digest,
  scope_paths: normalizedScopePaths,
  phase,
  capability,
  provider_id,
  permissions_digest: sha256Json(permissions),
  success_checks_digest: sha256Json(successChecks),
  decision_receipt_ids,
};
```

Validation compares every field and rejects missing facts, unresolved assumptions, unresolved directional decisions, unverifiable success evidence, or an undispositioned counterexample.

`provider_id` is exact only when the user or project pins a Provider. Otherwise the Permit records an agent-selected policy and binds the capability plus permissions, preserving the user's rule that technical implementation choices remain autonomous unless they change direction or authority.

- [x] **Step 6: Update both Skill entry documents and README commands**

Document the exact adaptive and deep paths, including the one-question loop and the machine-readable resolution/decision receipt. State that host cooperation is required when no hook is available.

- [x] **Step 7: Run readiness, routing, and existing compatibility tests**

Run: `node --test test/rc4-entry-readiness.test.mjs test/rc3-router-generalization.test.mjs test/rc3-deep-semantic.test.mjs test/rc2-sol-blockers.test.mjs`

Expected: PASS; held-out requests do not become read-only or implementation-ready through wording tricks.

- [x] **Step 8: Commit the entry/readiness slice**

```bash
git add src/task-classifier.mjs src/deep.mjs src/context.mjs src/cli.mjs skills/vibe-tether/SKILL.md skills/vibe-tether-deep/SKILL.md README.md test/rc4-entry-readiness.test.mjs
git commit -m "fix: bind deep execution to user decisions"
```

### Task 3: Make completion atomic, evidence-bound, and success-capture-safe

**Files:**
- Create: `test/rc4-completion-races.test.mjs`
- Modify: `src/runtime.mjs`
- Modify: `src/step.mjs`
- Modify: `src/doctor.mjs`
- Modify: `src/experience.mjs`
- Modify: `src/deep.mjs`
- Test: `test/rc4-completion-races.test.mjs`

- [x] **Step 1: Add adversarial completion tests**

Test four deterministic barriers: revoke Permit during a long validator, break lease during it, expire Permit before commit, and change final bytes after evidence but before route satisfaction. Also assert that `node -e "0"` cannot prove a product claim and that explicit `routine-non-path` cannot suppress an automatically detected reusable recovery path.

- [x] **Step 2: Run the adversarial file and observe stale completion acceptance**

Run: `node --test test/rc4-completion-races.test.mjs`

Expected: FAIL because current `finishStep()` validates authority before the command and writes `satisfied` without a generation compare-and-set.

- [x] **Step 3: Add route, lease, Permit, and authority generations**

```js
const precondition = {
  route_id: route.id,
  route_generation: route.generation,
  lease_generation: lease.generation,
  permit_id: permit.id,
  permit_generation: permit.generation,
  authority_digest: authority.authority_digest,
  before_snapshot: await executionSnapshot(context.executionRoot),
};
```

After validators finish, reacquire the worktree writer lock, reload all records, revalidate expiry/status/bindings, recompute final bytes, and write evidence plus `satisfied` in one transaction only when preconditions still match.

- [x] **Step 4: Restrict evidence commands to meaningful predeclared validators**

Reject commands whose observable contract is empty, whose only effect is exit zero, or whose covered product paths are absent. Require a declared check ID, claim, covered paths or external authority adapter, and actual post-command artifact digests.

- [x] **Step 5: Make success capture classification monotonic**

```js
const rank = new Map([
  ['routine-non-path', 0], ['repeat-proven-path', 1],
  ['first-proven-path', 2], ['recovered-path', 3], ['changed-proven-path', 4],
]);
const classification = automatic.classification === 'routine-non-path'
  ? automatic.classification
  : rank.get(requested) > rank.get(automatic.classification)
    ? requested
    : automatic.classification;
```

An explicit value cannot manufacture reusable evidence from a routine result, and it cannot lower an evidence-supported reusable classification. It may refine an already reusable lifecycle class upward. Experience confirmation updates must be part of the governance-aware final seal or explicitly trigger resealing.

- [x] **Step 6: Run focused and full evidence gates**

Run: `node --test test/rc4-completion-races.test.mjs test/rc3-evidence-integrity.test.mjs test/rc3-evidence-semantic.test.mjs test/step-doctor.test.mjs test/rc3-success-capture-semantic.test.mjs`

Expected: PASS; every injected concurrent change leaves the route blocked/broken and Doctor returns a nonzero health verdict.

- [x] **Step 7: Commit the atomic-completion slice**

```bash
git add src/runtime.mjs src/step.mjs src/doctor.mjs src/experience.mjs src/deep.mjs test/rc4-completion-races.test.mjs
git commit -m "fix: make completion evidence atomic and monotonic"
```

### Task 4: Protect user data across migration, upgrade, uninstall, locks, and prune

**Files:**
- Create: `test/rc4-lifecycle-recovery.test.mjs`
- Modify: `src/files.mjs`
- Modify: `src/migrate.mjs`
- Modify: `src/upgrade.mjs`
- Modify: `src/uninstall.mjs`
- Modify: `src/global-entry.mjs`
- Modify: `src/worktree.mjs`
- Modify: `src/init.mjs`
- Test: `test/rc4-lifecycle-recovery.test.mjs`

- [x] **Step 1: Add fault-injected lifecycle regressions**

Use injectable filesystem operations to fail backup, replace, restore, and rollback independently. Cover modified launcher, modified managed block, legacy Provider directory, unsafe legacy Truth path, migration-output/user-current conflict, stale-looking lock held by a live owner, transient Git inspection failure during prune, and init attach failure.

- [x] **Step 2: Verify the current implementation misreports or removes data**

Run: `node --test test/rc4-lifecycle-recovery.test.mjs`

Expected: FAIL with at least one swallowed restore failure, modified-file removal, or destructive prune/rollback result.

- [x] **Step 3: Represent lifecycle records as explicit recoverable states**

```js
const transaction = {
  status: 'applying',
  before_inventory,
  output_inventory: null,
  conflicts: [],
  recovery: { attempted: false, completed: false, errors: [] },
};
```

Allowed terminal states are `applied`, `rolled-back`, `conflict-preserved`, and `recovery-required`. Never write `rolled-back` when any restore failed. Preserve before, migration output, and current bytes for every conflict.

- [x] **Step 4: Make removal ownership-based**

Uninstall only removes bytes that equal the recorded installed digest. Modified launchers, Skills, managed blocks, shared dispatchers, and legacy Provider directories produce a conflict report and remain untouched.

- [x] **Step 5: Replace mtime-only lock stealing and destructive prune assumptions**

Locks contain owner UUID, PID, process-start token, acquired time, heartbeat, and generation. A lock can be reclaimed only after the owner is proven dead or an explicit recovery command records the break. `prune` quarantines unverifiable records and deletes only identities Git positively reports absent.

- [x] **Step 6: Run lifecycle, migration, upgrade, safety, and worktree suites**

Run: `node --test test/rc4-lifecycle-recovery.test.mjs test/migration.test.mjs test/upgrade.test.mjs test/safety-cli.test.mjs test/worktree.test.mjs`

Expected: PASS; injected restore failure yields `recovery-required`, and post-migration user bytes remain available and unchanged.

- [x] **Step 7: Commit the lifecycle slice**

```bash
git add src/files.mjs src/migrate.mjs src/upgrade.mjs src/uninstall.mjs src/global-entry.mjs src/worktree.mjs src/init.mjs test/rc4-lifecycle-recovery.test.mjs
git commit -m "fix: preserve user data through lifecycle failures"
```

### Task 5: Verify and activate complete cold Providers

**Files:**
- Create: `test/rc4-provider-integrity.test.mjs`
- Modify: `src/provider-registry.mjs`
- Modify: `src/provider-cache.mjs`
- Modify: `src/skills.mjs`
- Modify: `scripts/audit-release.mjs`
- Modify: `registry/providers.json`
- Modify: `THIRD_PARTY_NOTICES.md`
- Test: `test/rc4-provider-integrity.test.mjs`

- [ ] **Step 1: Add tamper, missing-resource, archive, and environment tests**

Create a fixture Provider whose `SKILL.md` references `references/rules.md` and `scripts/check.mjs`. Assert activation materializes both, a one-byte source change fails the expected immutable digest, symlink/hardlink/device/traversal/ADS/reserved-name entries are rejected, and an undeclared secret environment variable is absent during execution.

- [ ] **Step 2: Run the Provider regression and observe current partial activation**

Run: `node --test test/rc4-provider-integrity.test.mjs`

Expected: FAIL because exposure currently copies only `SKILL.md` and packaged cards can validate a digest recomputed from their already changed bytes.

- [ ] **Step 3: Separate expected identity from observed identity**

```js
const identity = {
  resolved_commit: card.source.resolved_commit,
  resolved_tree: card.source.resolved_tree,
  expected_content_sha256: card.integrity.normalized_content_sha256,
  observed_content_sha256: await normalizedProviderDigest(sourceRoot),
};
if (identity.observed_content_sha256 !== identity.expected_content_sha256) {
  throw conflictError(`Provider ${card.id} content changed.`, 'PROVIDER_INTEGRITY');
}
```

Do not populate the expected field from observed bytes at load time. Metadata-only sources remain selectable only through a licensed fallback whose full redistributed bytes are present.

- [ ] **Step 4: Materialize a declared resource closure**

Provider cards list relative resources. Validate each path, enforce file/count/size/depth limits, copy the closed set transactionally, and verify each output digest. Execution receives only the documented environment allowlist plus variables explicitly approved for that route.

- [ ] **Step 5: Run Provider and release audits**

Run: `node --test test/rc4-provider-integrity.test.mjs test/provider-packs.test.mjs test/skills.test.mjs`

Run: `npm.cmd run audit:release`

Expected: PASS; every redistributed Provider has immutable expected content, license evidence, and a complete declared resource set.

- [ ] **Step 6: Commit the Provider slice**

```bash
git add src/provider-registry.mjs src/provider-cache.mjs src/skills.mjs scripts/audit-release.mjs registry/providers.json THIRD_PARTY_NOTICES.md test/rc4-provider-integrity.test.mjs
git commit -m "fix: verify and activate complete provider resources"
```

### Task 6: Prove the final package and prepare only a review branch

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

- [ ] **Step 1: Add an exact-TGZ black-box journey**

The script packs the current commit, installs the TGZ into an isolated prefix, redirects state/cache/config/home, initializes an isolated repository, exercises adaptive clarification, Deep question/decision/Permit, controlled step, real artifact evidence, success capture, Doctor, revocation failure, upgrade preview, uninstall conflict, and launcher offline reuse. It records command, exit code, stdout digest, stderr digest, and final file inventory.

- [ ] **Step 2: Add live v0.6.3 migration and rollback inventory**

Resolve immutable `v0.6.3`, initialize Codex-only, Claude-only, and both fixtures, add CRLF and user modifications, migrate with the packed candidate, inspect context, run one controlled task, roll back, and compare file existence/kind/size/SHA-256. A network-unavailable run is `not-run`, never pass.

- [ ] **Step 3: Configure the real matrix**

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, windows-latest]
    node: [20, 24]
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node }}
      cache: npm
  - run: npm ci --ignore-scripts --no-audit
  - run: npm run check
  - run: npm run test:coverage
  - run: npm run test:compat:v063-live
  - run: node scripts/test-package-journey.mjs
```

- [ ] **Step 4: Run local final gates against final bytes**

Run: `npm.cmd ci --ignore-scripts --no-audit --no-fund --offline`

Run: `npm.cmd run check && npm.cmd run test:coverage && npm.cmd pack --dry-run`

Run: `node scripts/test-package-journey.mjs`

Expected: every command exits zero; any skipped platform behavior is listed as unproven rather than passed.

- [ ] **Step 5: Perform the controlled-delivery scope and evidence review**

Run: `python D:/python_workspace/gyws/.agents/skills/gyws-controlled-delivery/scripts/validate_delivery_packet.py .scratch/rc3-hardening/AGENT_DELIVERY.md`

Run: `git diff --check main...HEAD`

Run: `git diff --stat main...HEAD`

Expected: packet valid, no whitespace errors, and every changed path maps to a declared slice.

- [ ] **Step 6: Push only the review branch after local gates**

```bash
git -c http.sslBackend=openssl push -u origin integration/rc3-hardening-v1
```

Expected: remote review branch created; remote `main` and tags remain unchanged. Wait for all four matrix jobs and review before proposing a merge or release.

## Self-Review Result

- Spec coverage: the plan maps beginner UX, adaptive/deep entry, Truth/Permit authority, atomic evidence, Success Capture, lifecycle compatibility, worktree/Windows safety, Provider integrity, package verification, and release boundaries to explicit tasks.
- Placeholder scan: no deferred implementation marker is used; every task has exact files, commands, expected results, and a concrete implementation shape.
- Type consistency: `task_digest`, `start_card_digest`, decision receipts, route/lease/permit generations, success-check digests, and final snapshots use the same names from grant through validation and Doctor.
- Scope boundary: no task authorizes a formal release, remote `main` update, or real user-project migration.
