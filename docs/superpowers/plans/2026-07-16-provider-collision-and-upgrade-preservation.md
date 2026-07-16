# Provider Collision and Upgrade Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every user-owned project artifact and same-name custom Skill during upgrade while allowing non-conflicting optional providers to finish installing and routing only verified reviewed providers.

**Architecture:** Add a non-mutating optional-provider classifier that distinguishes verified installation, safe name collision, and unsafe state. Persist collisions separately from verified installations in the provider lock, project them into honest capability availability, and teach init, doctor, profile changes, rollback, and uninstall to respect the distinction. Keep core VibeTether identity and internal catalog verification fail-closed.

**Tech Stack:** Node.js 20+ ESM, `node:test`, `yaml`, filesystem fingerprints, transactional project-local CLI.

---

## File Map

- `src/skill-install.mjs`: classify optional host Skill targets without mutating them; retain strict core and catalog behavior.
- `src/provider-plan.mjs`: build collision-aware provider locks and capability-board availability.
- `src/init.mjs`: collect collisions in dry-run and real initialization, continue other optional installs, preserve prior user assets, and print consolidated warnings.
- `src/managed-project-state.mjs`: validate collision records and exclude collided targets from managed ownership.
- `src/doctor.mjs`: report safe collisions as warnings and unsafe collision metadata as issues.
- `src/uninstall.mjs`: accept collision-aware locks and remove only verified VibeTether-owned installations.
- `test/provider-install.test.mjs`: unit contracts for target classification.
- `test/provider-init.test.mjs`: multi-provider, partial-harness, dry-run, board, and output contracts.
- `test/provider-lifecycle.test.mjs`: modified-managed ownership relinquishment, profile downgrade, doctor, and uninstall contracts.
- `test/init-transaction.test.mjs`: rollback leaves collision targets byte-identical.
- `test/cli-init.test.mjs`: upgrade preservation matrix for user-owned control artifacts.
- `docs/superpowers/specs/2026-07-16-provider-collision-and-upgrade-preservation-design.md`: approved behavior authority; no implementation edits expected.

### Task 1: Introduce a Non-Mutating Optional Provider Classifier

**Files:**
- Modify: `src/skill-install.mjs:118-145`
- Modify: `test/provider-install.test.mjs:94-126`

- [ ] **Step 1: Write failing classification tests**

Add tests that request preservation explicitly while keeping the existing strict default:

```js
test('optional provider conflicts can be preserved without claiming ownership', async () => {
  const value = await fixture();
  await mkdir(value.target, { recursive: true });
  await writeFile(path.join(value.target, 'SKILL.md'), 'custom provider\n', 'utf8');

  const plan = await inspectDirectoryInstall(
    value.source,
    value.target,
    '.agents/skills/demo',
    { preserveConflict: true },
  );

  assert.deepEqual(plan, {
    needsInstall: false,
    collision: 'different-preexisting-skill',
  });
  assert.equal(await readFile(path.join(value.target, 'SKILL.md'), 'utf8'), 'custom provider\n');
});

test('optional provider conflict reports a formerly managed target separately', async () => {
  const value = await fixture();
  await mkdir(value.target, { recursive: true });
  await writeFile(path.join(value.target, 'SKILL.md'), 'user modified managed provider\n', 'utf8');

  const plan = await inspectDirectoryInstall(
    value.source,
    value.target,
    '.agents/skills/demo',
    { preserveConflict: true, previouslyManaged: true },
  );

  assert.deepEqual(plan, {
    needsInstall: false,
    collision: 'modified-managed-skill',
  });
});
```

Retain the existing test proving the default call rejects a different provider.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --test test/provider-install.test.mjs
```

Expected: the two new tests fail because `inspectDirectoryInstall` still throws on a different fingerprint.

- [ ] **Step 3: Implement the minimal classifier**

In `inspectDirectoryInstall`, return a collision only when `preserveConflict === true`; otherwise preserve the existing strict error:

```js
if (canonical !== installed) {
  if (options.upgradeFingerprints?.has(installed)) {
    return { needsInstall: true, ownership: 'vibetether', replacesExisting: true };
  }
  if (options.preserveConflict === true) {
    return {
      needsInstall: false,
      collision: options.previouslyManaged
        ? 'modified-managed-skill'
        : 'different-preexisting-skill',
    };
  }
  throw new CliError(
    `Refusing to overwrite different or modified installed Skill at ${relativePath}. Back up or remove it first.`,
    3,
  );
}
```

Do not change `inspectVibeTetherInstall`; unknown core identity remains blocking.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
node --test test/provider-install.test.mjs
```

Expected: all provider-install tests pass with zero failures.

- [ ] **Step 5: Commit**

```powershell
git add src/skill-install.mjs test/provider-install.test.mjs
git commit -m "feat: classify optional Skill collisions"
```

### Task 2: Add Collision-Aware Lock Construction and Validation

**Files:**
- Modify: `src/provider-plan.mjs:37-121`
- Modify: `src/managed-project-state.mjs:88-165`
- Modify: `test/provider-init.test.mjs`
- Modify: `test/project-scan.test.mjs`

- [ ] **Step 1: Write failing lock-model tests**

Add a provider-plan or provider-init assertion using:

```js
const lock = createProviderLock({
  profile: 'standard',
  sources: [sourceRecord],
  providers: [providerRecord],
  installations: [],
  collisions: [{
    provider_id: providerRecord.id,
    harness: 'codex',
    path: '.agents/skills/demo',
    reason: 'different-preexisting-skill',
  }],
});

assert.deepEqual(lock.exposures[0].installations, {});
assert.deepEqual(lock.exposures[0].collisions, {
  codex: {
    path: '.agents/skills/demo',
    reason: 'different-preexisting-skill',
    preserved: true,
  },
});
assert.deepEqual(validateProviderLock(lock).exposures[0].collisions, lock.exposures[0].collisions);
```

Add a stale-inheritance regression: an existing lock has a Codex `ownership: vibetether` installation, the new input has a Codex collision, and the resulting exposure must contain the collision but no Codex installation.

Add invalid-lock cases for:

- unsupported collision reason;
- path not matching the harness and install name;
- the same harness present in both `installations` and `collisions`;
- unknown harness.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test test/provider-init.test.mjs test/project-scan.test.mjs
```

Expected: collision fields are absent or ignored, stale installation inheritance remains, and malformed collision records are not rejected.

- [ ] **Step 3: Extend `createProviderLock`**

Add `collisions = []` to the input. Build a per-provider collision map:

```js
const skillCollisions = {};
for (const value of collisions.filter((entry) => entry.provider_id === provider.id)) {
  skillCollisions[value.harness] = {
    path: value.path,
    reason: value.reason,
    preserved: true,
  };
}
```

When merging previous installations:

```js
for (const [harness, installation] of Object.entries(previous?.installations ?? {})) {
  if (!skillInstallations[harness] && !skillCollisions[harness]) {
    skillInstallations[harness] = { ...installation };
  }
}
```

Return `collisions: skillCollisions` only when non-empty. Preserve previous inactive exposure records, but do not preserve a stale managed installation that was explicitly reconciled into a collision.

- [ ] **Step 4: Validate collision records**

Add:

```js
const COLLISION_REASONS = new Set([
  'different-preexisting-skill',
  'modified-managed-skill',
]);

function validateCollision(collision, expectedPath) {
  return record(collision)
    && collision.preserved === true
    && COLLISION_REASONS.has(collision.reason)
    && samePath(collision.path, expectedPath);
}
```

In `validateSkillRecord`, validate optional `skill.collisions`, require known harnesses and expected paths, and reject any harness appearing in both maps.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node --test test/provider-init.test.mjs test/project-scan.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/provider-plan.mjs src/managed-project-state.mjs test/provider-init.test.mjs test/project-scan.test.mjs
git commit -m "feat: record provider name collisions"
```

### Task 3: Continue Initialization Around Safe Optional Collisions

**Files:**
- Modify: `src/init.mjs:109-165`
- Modify: `src/init.mjs:697-832`
- Modify: `src/init.mjs:900-1007`
- Modify: `test/provider-init.test.mjs`

- [ ] **Step 1: Write failing multi-provider and dry-run tests**

Use the existing two-Skill fixture. Pre-create a custom Codex `demo` Skill, then initialize a profile that also exposes `router` or add a two-exposure registry fixture.

Assert:

```js
const customBytes = '---\nname: demo\ndescription: user copy\n---\n';
await mkdir(path.join(target, '.agents', 'skills', 'demo'), { recursive: true });
await writeFile(path.join(target, '.agents', 'skills', 'demo', 'SKILL.md'), customBytes, 'utf8');

const output = await initialize(options(target, { agent: 'codex' }), dependencies);

assert.equal(
  await readFile(path.join(target, '.agents', 'skills', 'demo', 'SKILL.md'), 'utf8'),
  customBytes,
);
assert.equal(await exists(path.join(target, '.agents', 'skills', 'router', 'SKILL.md')), true);
assert.match(output, /Preserved Skill name collisions/i);
assert.match(output, /\.agents\/skills\/demo/);
```

For dry-run, assert status success, no writes, a collision preview, and the other planned install.

For both harnesses, pre-create only Codex conflict and assert Claude receives the reviewed provider.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test test/provider-init.test.mjs
```

Expected: initialization throws at the first host provider collision and does not install the other provider.

- [ ] **Step 3: Classify dry-run provider targets**

For the real-install path, call `inspectDirectoryInstall` using:

```js
const priorManaged = priorInstallationOwnership(
  existingLock,
  provider,
  adapter,
  relativePath,
) === 'vibetether';
const inspection = await inspectDirectoryInstall(
  stagedProvider.source_path,
  target,
  relativePath,
  { preserveConflict: true, previouslyManaged: priorManaged },
);
```

Dry-run has no staged source. Keep its current direct comparison of `skillFingerprint(target)` against `provider.fingerprint`, but translate a different safe directory into the same collision record instead of throwing. Continue to call `rejectSymlinkPath` so unsafe targets remain fatal.

Record collision plans separately from install plans so `formatDryRun` can render:

```text
= .agents/skills/demo
<preserve existing Skill; reviewed provider blocked by name collision>
```

- [ ] **Step 4: Classify real host provider targets**

Before `inspectDirectoryInstall`, compute prior ownership. Call with `preserveConflict: true`. When `inspection.collision` exists:

- do not add a Skill installation plan;
- do not add a verified installation record;
- add `{ provider_id, harness, path, reason }` to `collisions`;
- append a bounded warning record;
- continue to the next provider or harness.

Keep catalog calls strict by not passing `preserveConflict`.

- [ ] **Step 5: Pass collisions into the lock and format the final result**

Pass `collisions` into `createProviderLock` in dry-run and real paths.

Compute verified availability:

```js
const availableCount = lock.exposures.filter((skill) =>
  skill.active && Object.keys(skill.installations ?? {}).length > 0
).length;
```

Keep the historical selected-provider count available where useful, but make the user-facing summary distinguish reviewed availability from selected providers. Print one `Preserved Skill name collisions:` section with provider name, relative path, and fallback/customize guidance.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
node --test test/provider-init.test.mjs
```

Expected: collision, partial-harness, multi-provider, and dry-run tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/init.mjs test/provider-init.test.mjs
git commit -m "feat: preserve optional Skill collisions during init"
```

### Task 4: Project Honest Availability Into the Capability Board

**Files:**
- Modify: `src/provider-plan.mjs:123-266`
- Modify: `src/capabilities.mjs:60-105`
- Modify: `test/provider-init.test.mjs`
- Modify: `test/capabilities.test.mjs`

- [ ] **Step 1: Write failing board and resolver tests**

For a Codex collision and verified Claude installation, assert:

```js
assert.equal(provider.selection_status, 'partially-available');
assert.deepEqual(provider.available_in, ['claude']);
assert.deepEqual(provider.blocked_in, {
  codex: 'different-preexisting-skill',
});
assert.deepEqual(route.recommendation.available_in, ['claude']);
```

For collisions in all enabled harnesses:

```js
assert.equal(provider.selection_status, 'blocked-by-name-collision');
assert.deepEqual(provider.available_in, []);
```

Resolve the route for Codex and assert the recommendation is unavailable and the declared fallback remains present. Resolve for Claude and assert the reviewed provider is available.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test test/provider-init.test.mjs test/capabilities.test.mjs
```

Expected: providers always report `eligible` when active and expose no collision details.

- [ ] **Step 3: Implement board status projection**

In `createCapabilityBoard`, derive:

```js
const availableIn = harnesses.filter((harness) => skill.installations?.[harness]);
const blockedIn = Object.fromEntries(
  harnesses
    .filter((harness) => skill.collisions?.[harness])
    .map((harness) => [harness, skill.collisions[harness].reason]),
);
const selectionStatus = skill.active === false
  ? 'inactive-not-recommended'
  : availableIn.length === harnesses.length
    ? 'eligible'
    : availableIn.length > 0
      ? 'partially-available'
      : Object.keys(blockedIn).length > 0
        ? 'blocked-by-name-collision'
        : 'eligible';
```

Expose `blocked_in` only when non-empty. Do not add collision paths to route `installations`.

Keep live capability refresh based on actual recorded reviewed installation paths. A raw same-name directory must not become live availability.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
node --test test/provider-init.test.mjs test/capabilities.test.mjs
```

Expected: all board and resolver tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/provider-plan.mjs src/capabilities.mjs test/provider-init.test.mjs test/capabilities.test.mjs
git commit -m "feat: expose honest collision availability"
```

### Task 5: Diagnose Collisions Without Treating User Skills as Corrupt Providers

**Files:**
- Modify: `src/doctor.mjs:922-1032`
- Modify: `test/provider-lifecycle.test.mjs`
- Modify: `test/provider-init.test.mjs`

- [ ] **Step 1: Write failing doctor tests**

For a safe collision, run doctor and assert:

```js
const report = JSON.parse(await inspectProject({ project: target, json: true }));
assert.equal(report.issues.some(({ code }) => code.includes('collision')), false);
assert.equal(
  report.warnings.some(({ code }) => code === 'optional-provider-name-collision'),
  true,
);
assert.equal(report.providers.available, 0);
```

For `modified-managed-skill`, assert warning code `modified-managed-provider-preserved`.

Add malformed-lock tests proving these are issues:

- collision path mismatch;
- unsupported reason;
- installation and collision for the same harness;
- collision target changed into a symlink or non-directory entry.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test test/provider-lifecycle.test.mjs test/provider-init.test.mjs
```

Expected: safe collisions are not understood, or malformed collisions are not rejected.

- [ ] **Step 3: Add doctor collision validation**

After installation checks, iterate collision records:

```js
for (const [harness, collision] of Object.entries(skill.collisions ?? {})) {
  const code = collision.reason === 'modified-managed-skill'
    ? 'modified-managed-provider-preserved'
    : 'optional-provider-name-collision';
  warnings.push(warning(
    code,
    `Preserved ${collision.path}; the reviewed ${skill.install_name} provider is unavailable in ${harness}.`,
  ));
}
```

Use existing safe project-entry checks to reject escape, symlink, missing, or non-directory targets when the lock claims a live collision. Never fingerprint the target against the reviewed provider as a doctor requirement.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
node --test test/provider-lifecycle.test.mjs test/provider-init.test.mjs
```

Expected: safe collision warnings and malformed collision issues pass.

- [ ] **Step 5: Commit**

```powershell
git add src/doctor.mjs test/provider-lifecycle.test.mjs test/provider-init.test.mjs
git commit -m "feat: diagnose preserved provider collisions"
```

### Task 6: Relinquish Ownership Across Reinit, Profile Changes, and Uninstall

**Files:**
- Modify: `src/init.mjs`
- Modify: `src/provider-plan.mjs`
- Modify: `src/uninstall.mjs:150-250`
- Modify: `test/provider-lifecycle.test.mjs`

- [ ] **Step 1: Write failing lifecycle tests**

Add:

```js
test('reinit preserves a modified managed provider and relinquishes uninstall ownership', async () => {
  const { source, target, provider } = await initialized('modified-managed');
  const customized = `${await readFile(path.join(provider, 'SKILL.md'), 'utf8')}\nUser customization.\n`;
  await writeFile(path.join(provider, 'SKILL.md'), customized, 'utf8');

  await initialize(
    { project: target, agent: 'codex', profile: 'standard', dryRun: false, yes: true },
    { loadRegistry: async () => registry(source) },
  );

  const lock = YAML.parse(await readFile(path.join(target, '.vibetether/providers.lock.yaml'), 'utf8'));
  assert.equal(lock.exposures[0].installations.codex, undefined);
  assert.equal(lock.exposures[0].collisions.codex.reason, 'modified-managed-skill');

  await uninstall({ project: target, dryRun: false, yes: true });
  assert.equal(await readFile(path.join(provider, 'SKILL.md'), 'utf8'), customized);
});
```

Add a profile-downgrade variant: modify a managed provider, initialize `core`, verify inactive exposure no longer carries VibeTether ownership, then uninstall and preserve bytes.

Add a recovery test: remove the conflicting directory, reinitialize standard, assert reviewed installation returns and collision disappears.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test test/provider-lifecycle.test.mjs
```

Expected: same-profile init throws; profile downgrade retains stale managed ownership; uninstall rejects or attempts the modified provider.

- [ ] **Step 3: Reconcile inactive prior installations**

Before final lock construction, inspect prior VibeTether-owned installations that are not part of the active exposure plan:

- if target is missing, retain inactive ownership only when existing lifecycle behavior requires later cleanup;
- if its fingerprint still equals the locked reviewed fingerprint, retain inactive ownership;
- if it safely differs, move it from `installations` to `collisions` with `modified-managed-skill`;
- if it is unsafe or unverifiable, fail closed.

Pass these reconciled inactive exposure records into the lock builder rather than blindly copying the previous exposure.

- [ ] **Step 4: Make uninstall collision-aware**

Validate collision maps structurally but never add collision paths to removal plans. Existing removal remains restricted to:

```js
installation.ownership === 'vibetether'
&& installedFingerprint === skill.fingerprint
```

Do not remove an exposure merely because its install name matches a directory.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node --test test/provider-lifecycle.test.mjs
```

Expected: modified-managed, downgrade, uninstall, and collision-recovery tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/init.mjs src/provider-plan.mjs src/uninstall.mjs test/provider-lifecycle.test.mjs
git commit -m "fix: relinquish ownership of modified providers"
```

### Task 7: Prove Transaction and Project-Data Preservation

**Files:**
- Modify: `test/init-transaction.test.mjs`
- Modify: `test/cli-init.test.mjs`
- Modify: `src/init.mjs` only if a failing preservation test reveals a defect

- [ ] **Step 1: Write a failing rollback preservation test**

Create a collision target and a later injected provider installation failure. Snapshot the custom directory recursively before initialization. After failure, assert:

- the custom directory snapshot is byte-identical;
- generated text files roll back;
- any earlier newly installed provider rolls back;
- no collision target appears in transaction or quarantine directories.

- [ ] **Step 2: Run the transaction test and verify RED or existing behavior**

Run:

```powershell
node --test test/init-transaction.test.mjs
```

Expected: the new integration test initially fails until collision plans are completely excluded from installation rollback tracking. If it passes immediately, verify it exercises the new collision path by temporarily asserting the opposite collision result, observe failure, then restore the correct assertion.

- [ ] **Step 3: Write the upgrade preservation matrix**

Initialize a disposable project, then customize:

- bytes outside managed blocks in `AGENTS.md` and `CLAUDE.md`;
- `.vibetether/intent.md`;
- `.vibetether/TRUTH.md`;
- custom keys and source routes in `.vibetether/project.yaml`;
- decisions and evidence in `.vibetether/state/current.yaml`;
- `.vibetether/state/route-handshake.yaml`;
- `.vibetether/experience-index.yaml`;
- `.vibetether/routes.local.yaml`;
- one same-name user Skill.

Run the same-version provider-aware upgrade and compare exact bytes for user-owned artifacts. For structured managed artifacts, parse and compare every custom semantic field while allowing only registered managed fields to update.

- [ ] **Step 4: Run preservation tests and verify RED**

Run:

```powershell
node --test test/cli-init.test.mjs test/init-transaction.test.mjs
```

Expected: any remaining overwrite, stale ownership, or rollback defect fails with the exact affected artifact.

- [ ] **Step 5: Apply only the minimal preservation fixes**

If the tests expose a defect, change only the relevant plan-building or rollback branch. Do not add a second configuration store, copy user files into generated files, or normalize user Markdown/YAML unnecessarily.

- [ ] **Step 6: Run preservation tests and verify GREEN**

Run:

```powershell
node --test test/cli-init.test.mjs test/init-transaction.test.mjs
```

Expected: all preservation and transaction tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/init.mjs test/cli-init.test.mjs test/init-transaction.test.mjs
git commit -m "test: prove upgrade data preservation"
```

### Task 8: Full Regression and Release-Readiness Verification

**Files:**
- Modify only files required by fresh failures

- [ ] **Step 1: Run provider and lifecycle regression**

Run:

```powershell
node --test test/provider-install.test.mjs test/provider-init.test.mjs test/provider-lifecycle.test.mjs test/capabilities.test.mjs test/project-scan.test.mjs test/init-transaction.test.mjs test/cli-init.test.mjs
```

Expected: zero failures.

- [ ] **Step 2: Run the complete check**

Run:

```powershell
npm run check
```

Expected: all unit tests, static evaluations, release-history audit, and Skill self-validation pass.

- [ ] **Step 3: Run package and disposable-project acceptance**

Run:

```powershell
npm pack --dry-run
node scripts/manual-acceptance-tour.mjs
```

Then install the packed local package or checkout CLI into disposable Codex-only, Claude-only, and both-harness projects containing same-name custom Skills. Verify:

- custom bytes remain unchanged;
- non-conflicting reviewed Skills install;
- capability status is honest;
- doctor reports collision warnings without provider-integrity errors;
- uninstall preserves custom Skills.

- [ ] **Step 4: Review final diff against the approved specification**

Run:

```powershell
git diff c14993a --check
git diff --stat c14993a
git status --short
```

Check every acceptance criterion in the approved design against fresh evidence. Do not include `.scratch/` or `.superpowers/` untracked workspace material.

- [ ] **Step 5: Commit any final test-only corrections**

```powershell
git add src test docs/superpowers/plans/2026-07-16-provider-collision-and-upgrade-preservation.md
git commit -m "test: verify collision-safe upgrades"
```

Do not publish, tag, merge, or push without a separate explicit user authorization after local verification.
