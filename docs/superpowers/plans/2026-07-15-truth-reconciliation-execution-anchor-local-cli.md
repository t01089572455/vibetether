# Truth Reconciliation, Execution Anchor, and Local CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every consequential VibeTether route identify its execution instance and worktree, require an explicit Truth disposition before the next route or completion boundary, and give initialized projects a managed local CLI entry with integrity and version diagnostics.

**Architecture:** Keep the control plane advisory and host-cooperative. Add three focused modules: `execution-snapshot.mjs` owns safe Git/worktree evidence, `truth-reconciliation.mjs` owns explicit disposition validation, and `local-cli.mjs` owns canonical launcher bytes and manifest metadata. Route lifecycle remains the single writer of handshake/checkpoint state; doctor validates boundary-specific completeness without parsing project prose.

**Tech Stack:** Node.js 20+ ESM, built-in `node:crypto`, `node:child_process`, `node:fs/promises`, YAML, Node test runner, Git CLI.

---

## File map

- Create `src/execution-snapshot.mjs`: resolve a project-contained execution root, capture Git worktree/HEAD/status evidence, compare snapshots.
- Create `src/local-cli.mjs`: render and fingerprint the canonical project-local launcher and expose manifest baseline helpers.
- Create `src/truth-reconciliation.mjs`: validate reconciliation decisions and update checkpoint authority state without editing Truth.
- Modify `src/authority-snapshot.mjs`: preserve the full Truth Map fingerprint while adding a confirmed-only authority projection.
- Modify `src/route-handshake.mjs`: create route-instance IDs, capture start/end execution evidence, create pending reconciliation, and block unresolved transitions.
- Modify `src/cli.mjs`: parse `truth reconcile`, `route --execution-root`, and `doctor --boundary`.
- Modify `src/doctor.mjs`: validate reconciliation, execution drift, launcher integrity, and running-version baseline with boundary severity.
- Modify `src/manifest.mjs`, `src/project-scan.mjs`, `src/init.mjs`, `src/adapters.mjs`, `src/managed-project-state.mjs`, and `src/uninstall.mjs`: initialize, migrate, own, document, validate, and safely remove the new control artifacts.
- Modify `skills/vibe-tether/SKILL.md` and direct references: teach the Agent when to use the local launcher, execution root, reconciliation command, and explicit boundary doctor.
- Modify public README and focused docs: document the beginner path, recovery fallback, limitations, and examples.
- Add focused tests under `test/` and update release identity metadata.

### Task 1: Route-instance and reconciliation RED tests

**Files:**
- Modify: `test/route-handshake.test.mjs`
- Create: `test/truth-reconciliation.test.mjs`

- [ ] **Step 1: Add route-instance lifecycle assertions**

Add tests that assert:

```js
const first = await startRoute(root);
const refreshed = await startRoute(root);
assert.match(first.route_instance_id, /^[0-9a-f-]{36}$/);
assert.equal(refreshed.route_instance_id, first.route_instance_id);

await main(['route', 'complete', '--project', root, '--evidence', 'Plan approved']);
let checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
assert.equal(checkpoint.truth_reconciliation.status, 'pending');
assert.equal(checkpoint.truth_reconciliation.route_instance_id, first.route_instance_id);
await assert.rejects(startRoute(root, { phase: 'EXECUTE_ONE', capability: 'tdd' }), /truth reconciliation/i);
```

Also assert the active same-route refresh preserves the original
`authority_snapshot` and `execution_start` bytes.

- [ ] **Step 2: Add reconciliation command contract tests**

Cover `no-material-change`, `candidate-pending`, `applied`, `declined`, missing reason, unsafe or missing candidate, wrong route instance, changed authority under `no-material-change`, candidate/confirmed/declined Truth Map membership, inline `route complete --truth-decision no-material-change --truth-reason ...`, and proof that reconciliation never edits `TRUTH.md`.

- [ ] **Step 3: Run RED tests**

Run:

```powershell
node --test test/route-handshake.test.mjs test/truth-reconciliation.test.mjs
```

Expected: fail because `route_instance_id`, `truth_reconciliation`, and `truth reconcile` do not exist.

### Task 2: Minimal route and reconciliation implementation

**Files:**
- Create: `src/truth-reconciliation.mjs`
- Modify: `src/authority-snapshot.mjs`
- Modify: `src/truth-map.mjs`
- Modify: `src/manifest.mjs`
- Modify: `src/route-handshake.mjs`
- Modify: `src/cli.mjs`

- [ ] **Step 1: Add checkpoint constructors**

Add canonical helpers:

```js
export function createInitialTruthReconciliation({ legacy = false } = {}) {
  return {
    status: legacy ? 'unknown' : 'no_material_change',
    trigger: legacy ? 'legacy-upgrade' : 'initialization',
    route_instance_id: null,
    reason: legacy
      ? 'No historical Truth disposition was invented during upgrade.'
      : 'Initialization did not activate or change confirmed project truth.',
    candidate_path: null,
    updated_at: new Date().toISOString(),
  };
}
```

Fresh checkpoints receive the initialized state. Existing checkpoints missing the field receive `unknown`.

Add a canonical SHA-256 projection over ordered confirmed entry
`path`, `role`, and `scope` values. Keep the full Truth Map file hash for
structural diagnostics, and keep confirmed source-content hashes unchanged.

- [ ] **Step 2: Give route executions unique identities**

Use `randomUUID()` for a new route and preserve the prior ID, initial authority
snapshot, and initial execution snapshot only for an idempotent refresh of the
same active phase/capability.

- [ ] **Step 3: Write pending reconciliation atomically**

On route completion or abandonment without a valid inline
`no-material-change` disposition, set:

```js
checkpoint.truth_reconciliation = {
  status: 'pending',
  trigger: completed ? 'route-complete' : 'route-abandon',
  route_instance_id: state.route_instance_id,
  reason: null,
  candidate_path: null,
  updated_at: now,
};
```

Reject a new route while the checkpoint status is `pending` or `candidate_pending`.

- [ ] **Step 4: Implement `truth reconcile`**

Parse:

```text
vibetether truth reconcile --project . --decision <decision> --reason <reason> [--candidate <path>] [--json]
```

Require an exited handshake, match `route_instance_id`, reuse safe artifact validation, keep reasons at 500 characters or fewer, never write `TRUTH.md`, verify unchanged authority for `no-material-change`, and refresh authority after declared candidate/applied/declined work.

Require candidate paths to appear in the corresponding Truth Map section:
`candidate_pending` in candidates, `applied` in confirmed, and `declined` in
declined.

- [ ] **Step 5: Run GREEN tests**

Run:

```powershell
node --test test/route-handshake.test.mjs test/truth-reconciliation.test.mjs
```

Expected: all focused tests pass.

### Task 3: Execution-root snapshot RED and GREEN

**Files:**
- Create: `test/execution-snapshot.test.mjs`
- Create: `src/execution-snapshot.mjs`
- Modify: `src/route-handshake.mjs`
- Modify: `src/cli.mjs`

- [ ] **Step 1: Add failing containment and Git evidence tests**

Create a disposable Git repository and nested worktree directory. Assert route state contains:

```js
assert.equal(route.execution_start.root, 'worktree');
assert.equal(route.execution_start.git.available, true);
assert.equal(route.execution_start.git.worktree_root, 'worktree');
assert.match(route.execution_start.git.head, /^[a-f0-9]{40}$/);
assert.match(route.execution_start.git.status_sha256, /^[a-f0-9]{64}$/);
assert.match(route.execution_start.git.worktree_sha256, /^[a-f0-9]{64}$/);
```

Also assert external, symlinked, missing, and file execution roots fail before either control file changes, while a non-Git directory records `git.available: false`.

- [ ] **Step 2: Run the RED test**

Run:

```powershell
node --test test/execution-snapshot.test.mjs
```

Expected: fail because `--execution-root` and execution snapshots are absent.

- [ ] **Step 3: Implement safe snapshot capture**

Resolve the execution root with `realpath`, require it to remain inside the project and be a real directory, then run bounded local Git commands:

```text
git -C <root> rev-parse --show-toplevel
git -C <root> rev-parse --verify HEAD
git -C <root> status --porcelain=v1 -z --untracked-files=all
```

Hash status bytes with SHA-256, then hash the bytes of every changed and
untracked path into a separate working-tree digest so repeated `M` status does
not hide later content changes. Treat Git-not-found and not-a-repository as
`available: false`; propagate other safety errors.

- [ ] **Step 4: Capture start and exit snapshots**

Store `execution_start` on route start and `execution_end` on complete or abandon. Complete/abandon reuse the saved root rather than accepting a new root flag.

- [ ] **Step 5: Run GREEN tests**

Run:

```powershell
node --test test/execution-snapshot.test.mjs test/route-handshake.test.mjs
```

Expected: all tests pass.

### Task 4: Boundary-aware doctor RED and GREEN

**Files:**
- Modify: `test/cli-lifecycle.test.mjs`
- Modify: `test/route-handshake.test.mjs`
- Modify: `src/doctor.mjs`
- Modify: `src/cli.mjs`

- [ ] **Step 1: Add failing boundary tests**

Assert:

```js
const ordinary = doctorFailureOrSuccess(root, 'ordinary');
assert.equal(ordinary.warnings.some(({ code }) => code === 'pending-truth-reconciliation'), true);

const completion = doctorFailure(root, 'completion');
assert.equal(completion.issues.some(({ code }) => code === 'pending-truth-reconciliation'), true);
```

Cover every accepted boundary, invalid boundary input, malformed/legacy reconciliation, route-instance mismatch, missing exit snapshot, and Git HEAD/status drift after route exit.

- [ ] **Step 2: Run RED tests**

Run:

```powershell
node --test test/cli-lifecycle.test.mjs test/route-handshake.test.mjs
```

Expected: fail because doctor has no boundary or new validators.

- [ ] **Step 3: Implement boundary severity**

Accept:

```text
ordinary, completion, handoff, merge, deployment, release, publication
```

Treat non-ordinary boundaries and checkpoint phases `REVIEW` or `SHIP` as completion-like. Add dedicated codes for reconciliation, route-instance mismatch, missing or stale execution snapshots, and unavailable Git evidence.

- [ ] **Step 4: Run GREEN tests**

Run the same focused command and expect all tests to pass.

### Task 5: Local launcher and version baseline RED tests

**Files:**
- Create: `test/local-cli-launcher.test.mjs`
- Modify: `test/cli-init.test.mjs`
- Modify: `test/uninstall-transaction.test.mjs`
- Modify: `test/public-release.test.mjs`

- [ ] **Step 1: Add launcher creation and behavior tests**

Assert init creates `.vibetether/bin/vibetether.mjs`, the manifest records its path/hash/package/version, the launcher selects `npx.cmd` on Windows through an injectable unit boundary, and a fake missing `npx` produces actionable stderr and nonzero exit.

- [ ] **Step 2: Add ownership and migration tests**

Assert repeated init is byte-idempotent, legacy projects add the launcher, a modified pre-existing launcher is preserved and blocks init before partial writes, doctor detects hash and running-version mismatch, and uninstall removes only an unchanged VibeTether-owned launcher.

- [ ] **Step 3: Add managed-command contract tests**

Require AGENTS/CLAUDE and public docs to use:

```text
node .vibetether/bin/vibetether.mjs
```

for route, Truth reconciliation, and doctor, while retaining the full Codeload command for first install and recovery.

- [ ] **Step 4: Run RED tests**

Run:

```powershell
node --test test/local-cli-launcher.test.mjs test/cli-init.test.mjs test/uninstall-transaction.test.mjs test/public-release.test.mjs
```

Expected: fail because the launcher lifecycle is absent.

### Task 6: Local launcher and baseline implementation

**Files:**
- Create: `src/local-cli.mjs`
- Modify: `src/project-scan.mjs`
- Modify: `src/init.mjs`
- Modify: `src/doctor.mjs`
- Modify: `src/adapters.mjs`
- Modify: `src/managed-project-state.mjs`
- Modify: `src/uninstall.mjs`

- [ ] **Step 1: Render canonical launcher bytes**

Use a fixed zero-dependency ESM script that invokes:

```js
const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['--yes', `--package=${packageSpec}`, 'vibetether', ...process.argv.slice(2)];
```

Preserve child exit status and print a concise missing-Node/npm acquisition diagnostic.

- [ ] **Step 2: Add manifest baseline**

Write:

```yaml
cli:
  launcher: .vibetether/bin/vibetether.mjs
  launcher_sha256: <canonical sha256>
  package: https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.0
  expected_version: 0.6.0
```

Use the release compatibility registry as the package-version authority.

- [ ] **Step 3: Integrate safe init and uninstall**

Add the launcher to the atomic text plan, control-file allowlist, project-state recognition, doctor checks, and ownership-aware uninstall. Refuse a different existing file rather than overwriting it.

- [ ] **Step 4: Report post-init doctor baseline**

Run `inspectProject` in process after successful initialization, summarize healthy/attention counts, and preserve completed writes if an existing project has actionable state issues.

- [ ] **Step 5: Run GREEN tests**

Run the Task 5 command and expect all tests to pass.

### Task 7: Public Skill and documentation

**Files:**
- Modify: `skills/vibe-tether/SKILL.md`
- Modify: `skills/vibe-tether/references/capability-routing.md`
- Modify: `skills/vibe-tether/references/checkpoint-and-drift.md`
- Modify: `skills/vibe-tether/references/project-truth.md`
- Modify: `skills/vibe-tether/references/project-manifest.md`
- Modify: `skills/vibe-tether/scripts/validate-project.mjs`
- Modify: `README.md`
- Modify: `docs/installation.md`
- Modify: `docs/project-truth.md`
- Modify: `docs/routing.md`
- Modify: `docs/troubleshooting.md`

- [ ] **Step 1: Update the Agent contract**

Teach the Agent to use the project-local launcher, pass the real execution root when it differs from project root, reconcile Truth after route exit, block on candidate-pending, and pass the actual doctor boundary.

- [ ] **Step 2: Update beginner examples**

Show a complete copyable lifecycle:

```powershell
node .vibetether/bin/vibetether.mjs route --project . --execution-root . --phase PLAN --capability planning --agent codex
node .vibetether/bin/vibetether.mjs route complete --project . --evidence "Plan approved"
node .vibetether/bin/vibetether.mjs truth reconcile --project . --decision no-material-change --reason "Only the implementation plan changed; confirmed product direction did not."
node .vibetether/bin/vibetether.mjs doctor --project . --boundary handoff --json
```

State clearly that the launcher uses the immutable matching release tag, still
depends on npm, GitHub, TLS, and network availability, and still requires host
cooperation.

- [ ] **Step 3: Run documentation and Skill contracts**

Run:

```powershell
node --test test/public-release.test.mjs test/skill-contract.test.mjs test/registry.test.mjs
node skills/vibe-tether/scripts/validate-project.mjs --self
```

Expected: all tests and self-validation pass.

### Task 8: Version, release identity, and full verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `registry/vibetether-releases.json`

- [ ] **Step 1: Advance the release version**

Move package metadata to `0.6.0`, append the exact public `0.5.0` commit and fingerprint to history, update the current Skill fingerprint after all Skill edits, and create the immutable `v0.6.0` Git tag only after the release commit is final.

- [ ] **Step 2: Run focused regression**

Run:

```powershell
node --test test/route-handshake.test.mjs test/truth-reconciliation.test.mjs test/execution-snapshot.test.mjs test/cli-lifecycle.test.mjs test/local-cli-launcher.test.mjs test/cli-init.test.mjs test/uninstall-transaction.test.mjs test/public-release.test.mjs test/skill-contract.test.mjs
```

Expected: zero failures.

- [ ] **Step 3: Run full package verification**

Run:

```powershell
npm run check
npm pack --dry-run
git diff --check
```

Expected: all tests/evals/audits pass, the package contains the intended launcher-support sources/docs, and no whitespace errors exist.

- [ ] **Step 4: Run disposable acceptance**

Initialize a clean Git project with the packaged CLI, run the local launcher doctor, start and complete a route, prove completion doctor fails while reconciliation is pending, resolve it, prove completion doctor passes, then migrate a legacy fixture and confirm `unknown` rather than invented history.

- [ ] **Step 5: Complete independent review and packet**

Record exact commands and raw summaries in `.scratch/truth-reconciliation-local-cli/AGENT_DELIVERY.md`, change packet status to `complete`, validate it, and resolve every Critical or Important review finding.

- [ ] **Step 6: Commit and push**

Stage only intended repository files, leave `.superpowers/` untouched, commit
the verified release, push the branch to GitHub `main`, push the immutable
`v0.6.0` tag, and verify both remote refs.

## Self-review

- Spec coverage: route-instance identity, reconciliation decisions, boundary doctor, execution worktree evidence, launcher/version baseline, migration, ownership, docs, and release verification each have a task.
- Placeholder scan: the plan contains no deferred implementation placeholders.
- Type consistency: the plan consistently uses `route_instance_id`, `truth_reconciliation`, `execution_start`, `execution_end`, `cli.launcher_sha256`, and `doctor --boundary`.
