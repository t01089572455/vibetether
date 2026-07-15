# Smallest Verifiable Slice Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish VibeTether 0.5.0 with a beginner-first README and one tested Smallest Verifiable Slice invariant that applies equally to direct and delegated work without restricting Subagent orchestration.

**Architecture:** Strengthen the existing readiness and `EXECUTE_ONE` contracts instead of adding a new engine, route, signal, schema, or configuration file. The portable Skill and managed Codex/Claude instruction block carry the invariant; deterministic tests and one static scenario make it inspectable; the README presents it as a scope-control benefit while preserving accurate host limitations.

**Tech Stack:** Node.js 20+, ECMAScript modules, `node:test`, JSON static evaluation fixtures, Markdown, npm package metadata, portable SHA-256 Skill fingerprints.

---

## File Structure

- `skills/vibe-tether/SKILL.md`: canonical Agent workflow and execution-scope invariant.
- `src/adapters.mjs`: managed `AGENTS.md` and `CLAUDE.md` project instruction block.
- `test/skill-contract.test.mjs`: portable Skill and managed-block contract tests.
- `test/managed-block.test.mjs`: installed host-instruction boundary tests.
- `evals/scenarios/long-task-route-controls.json`: inspectable long-task scope fixture.
- `evals/run-static-evals.mjs`: exact deterministic contract for the fixture.
- `test/evals.test.mjs`: scenario coverage and honesty assertions.
- `README.md`: beginner-first product story, installation, Subagent scope-control benefit, management tutorial, and honest limits.
- `test/public-release.test.mjs`: README, package, and public-release contract.
- `package.json` and `package-lock.json`: 0.5.0 package identity.
- `registry/vibetether-releases.json`: current 0.5.0 fingerprint plus reproducible 0.4.0 history.

### Task 1: Make the Smallest Verifiable Slice invariant executable

**Files:**
- Modify: `test/skill-contract.test.mjs`
- Modify: `test/managed-block.test.mjs`
- Modify: `skills/vibe-tether/SKILL.md`
- Modify: `src/adapters.mjs`

- [ ] **Step 1: Write failing Skill and managed-instruction tests**

Add to the first Skill contract test:

```js
assert.match(skill, /smallest verifiable outcome/i);
assert.match(skill, /including delegated work/i);
assert.match(skill, /meaningfully advances the approved user goal/i);
assert.doesNotMatch(skill, /maximum subagents|subagent cap|delegation budget/i);
```

Add to `test/managed-block.test.mjs`:

```js
test('managed instructions keep direct and delegated work inside one smallest verifiable slice', () => {
  for (const adapter of Object.values(ADAPTERS)) {
    assert.match(adapter.managedBody, /smallest verifiable outcome/i);
    assert.match(adapter.managedBody, /including delegated work/i);
    assert.doesNotMatch(adapter.managedBody, /maximum subagents|subagent cap|delegation budget/i);
  }
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```sh
node --test test/skill-contract.test.mjs test/managed-block.test.mjs
```

Expected: failure identifies missing `smallest verifiable outcome` text.

- [ ] **Step 3: Add the invariant to the portable Skill**

In `Automatic Work-Readiness Gate`, add one readiness dimension:

```markdown
- the smallest verifiable outcome that meaningfully advances the approved user goal, including the boundary inherited by delegated work;
```

Immediately after the readiness verdicts, add:

```markdown
Before implementation or the next slice, define the smallest verifiable outcome that meaningfully advances the approved user goal. Keep the current slice, including delegated work, inside that boundary. A clear low-risk request may satisfy this in one compact line. A larger plan may retain future slices, but only the current smallest verifiable slice enters `EXECUTE_ONE`.
```

Change the `EXECUTE_ONE` lifecycle row to:

```markdown
| `EXECUTE_ONE` | The smallest verifiable slice is ready | Only that slice changed; its stated fresh evidence exists |
```

Do not add Subagent counts, approval rules, nesting rules, or delegation settings.

- [ ] **Step 4: Add the same invariant to installed host instructions**

In the current `sharedRules` array in `src/adapters.mjs`, insert after the consequential-boundary rule:

```js
'Before implementation or the next slice, define the smallest verifiable outcome that meaningfully advances the approved user goal. Keep the current slice, including delegated work, inside that boundary; do not turn this scope rule into a Subagent count or orchestration policy.',
```

Do not change legacy managed bodies; they remain exact upgrade identities.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```sh
node --test test/skill-contract.test.mjs test/managed-block.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit the executable contract**

```sh
git add skills/vibe-tether/SKILL.md src/adapters.mjs test/skill-contract.test.mjs test/managed-block.test.mjs
git commit -m "feat: keep execution inside the smallest verifiable slice"
```

### Task 2: Add a deterministic non-restrictive scope scenario

**Files:**
- Modify: `evals/scenarios/long-task-route-controls.json`
- Modify: `evals/run-static-evals.mjs`
- Modify: `test/evals.test.mjs`

- [ ] **Step 1: Extend the test's exact control-ID contract**

Insert `large-request-enters-smallest-slice` after `local-primary-absent-falls-back` in `test/evals.test.mjs`:

```js
'large-request-enters-smallest-slice',
```

After the control-ID assertion, add:

```js
const smallest = controls.cases.find((entry) => entry.id === 'large-request-enters-smallest-slice');
assert.deepEqual(smallest.observed, {
  phase: 'EXECUTE_ONE',
  capability: 'plan-execution',
  selected_skill: 'subagent-driven-development',
  selection_source: 'recommended',
  handshake_state: 'active',
  required_outputs: ['smallest-verifiable-outcome', 'slice-evidence'],
  must_not: ['expand-active-slice', 'limit-subagent-count'],
});
```

- [ ] **Step 2: Run the eval test and verify RED**

Run:

```sh
node --test test/evals.test.mjs
```

Expected: the exact control-ID list is missing `large-request-enters-smallest-slice`.

- [ ] **Step 3: Add the fixture and deterministic evaluator contract**

Insert this case into `evals/scenarios/long-task-route-controls.json` in sorted ID order:

```json
{
  "id": "large-request-enters-smallest-slice",
  "observed": {
    "phase": "EXECUTE_ONE",
    "capability": "plan-execution",
    "selected_skill": "subagent-driven-development",
    "selection_source": "recommended",
    "handshake_state": "active",
    "required_outputs": ["smallest-verifiable-outcome", "slice-evidence"],
    "must_not": ["expand-active-slice", "limit-subagent-count"]
  }
}
```

Add the same object to `LONG_TASK_CONTRACTS` in `evals/run-static-evals.mjs`:

```js
'large-request-enters-smallest-slice': {
  phase: 'EXECUTE_ONE', capability: 'plan-execution',
  selected_skill: 'subagent-driven-development', selection_source: 'recommended',
  handshake_state: 'active',
  required_outputs: ['smallest-verifiable-outcome', 'slice-evidence'],
  must_not: ['expand-active-slice', 'limit-subagent-count'],
},
```

No new inspectable field is needed because every field already belongs to `INSPECTABLE_CONTROL_FIELDS`.

- [ ] **Step 4: Run static evaluation tests and verify GREEN**

Run:

```sh
node --test test/evals.test.mjs
npm run eval
```

Expected: test passes and output remains `17/17 static scenario contracts passed.` because this adds a case inside the existing scenario, not a new scenario file.

- [ ] **Step 5: Commit the scenario**

```sh
git add evals/scenarios/long-task-route-controls.json evals/run-static-evals.mjs test/evals.test.mjs
git commit -m "test: cover smallest-slice Subagent routing"
```

### Task 3: Rewrite the README around the beginner promise and new selling point

**Files:**
- Modify: `test/public-release.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Replace the opening contract and add README feature assertions**

Change the opening assertion in `test/public-release.test.mjs` to require:

```js
assert.ok(readme.startsWith(`# VibeTether\n\n> Strong agents can build fast. Long tasks still drift.\n\nVibeTether is a beginner-friendly entry Skill for long-running Codex and\nClaude projects.\n`));
```

Add a new test:

```js
test('README presents smallest verifiable scope as a non-restrictive Subagent benefit', async () => {
  const readme = await text('README.md');
  assert.match(readme, /Smallest Verifiable Slice/);
  assert.match(readme, /smallest verifiable (outcome|result)/i);
  assert.match(readme, /including delegated work|direct or delegated work/i);
  assert.match(readme, /does not limit.*Subagent|without limiting.*Subagent/is);
  assert.match(readme, /host.*orchestrat|Codex.*Claude.*decide.*Subagent/is);
  assert.doesNotMatch(readme, /makes Ultra cheap|guaranteed Token|guarantees? usage savings/i);
});
```

Extend the beginner-control-loop test with ownership guidance:

```js
assert.match(readme, /Manage VibeTether your way/i);
assert.match(readme, /safe to edit|edit directly/i);
assert.match(readme, /CLI-maintained|generated/i);
assert.match(readme, /vibetether doctor --project \. --json/);
```

- [ ] **Step 2: Run the README contract and verify RED**

Run:

```sh
node --test test/public-release.test.mjs
```

Expected: failures identify the old opening, missing Subagent benefit, and missing management tutorial heading.

- [ ] **Step 3: Replace the README opening with the approved text**

Use exactly:

```markdown
# VibeTether

> Strong agents can build fast. Long tasks still drift.

VibeTether is a beginner-friendly entry Skill for long-running Codex and
Claude projects. At the moments that matter, it helps the Agent re-check the
goal, reread project rules, decide whether the work is ready, choose the right
installed Skill, and recall workflows that already worked.

You do not need to memorize Skill names or manage a rigid workflow.
VibeTether turns recurring lessons from experienced developers into a
project-local guidance layer, so capable Agents stay autonomous without
quietly drifting into expensive rework.
```

Keep the CI and license badges, control-loop image, and one-command setup immediately after the opening.

- [ ] **Step 4: Add the Subagent selling point without overstating control**

Add this feature row:

```markdown
| Smallest Verifiable Slice | Keeps direct and delegated work aimed at the smallest result that meaningfully advances the approved goal, without limiting Subagent use |
```

In the 30-second example, replace the planning/execution steps with:

```markdown
3. After direction is approved, `writing-plans` maps the larger goal, but only
   the current Smallest Verifiable Slice enters execution.
4. Codex or Claude may use Subagents when useful. VibeTether does not limit
   their number or orchestration; it keeps their delegated work inside the
   same approved slice.
5. `test-driven-development` owns behavior changes, and
   `verification-before-completion` requires fresh slice evidence before the
   Agent advances or proposes another slice.
```

Add a short section headed `## Powerful Agents, smaller finish lines`:

```markdown
## Powerful Agents, smaller finish lines

VibeTether does not disable or ration Subagents. Codex and Claude still decide
how to parallelize, delegate, wait, and combine results. Before implementation
or the next slice, VibeTether asks for the smallest verifiable outcome that
meaningfully advances the approved goal. Direct and delegated work stay inside
that boundary, so more Agent capability does not silently become more project
scope.

This is behavioral guidance, not a hard resource limiter, and it cannot control
hidden platform-internal orchestration. It aims to reduce avoidable expansion
and rework; it does not guarantee Token or usage savings.
```

- [ ] **Step 5: Add `Manage VibeTether your way` with safe ownership guidance**

Use the ownership table from the approved design and include these copyable workflows:

```markdown
## Manage VibeTether your way

You can ask the Agent to propose changes in ordinary language, or edit the
user-owned files directly. Active truth changes still require your explicit
confirmation.

| Artifact | How to manage it |
| --- | --- |
| `.vibetether/TRUTH.md` | Edit directly or ask the Agent to propose candidates and confirm them one at a time |
| `.vibetether/intent.md` | Use `vibetether bootstrap --project .` or ask the Agent to propose a directional update |
| `.vibetether/routes.local.yaml` | Use `vibetether customize --project .` or edit validated YAML directly |
| Proven Path documents | Edit the referenced sanitized runbook; confirm before active indexing |
| `.vibetether/project.yaml` | CLI-maintained topology; inspect it and normally repair it with `vibetether init` |
| `.vibetether/capabilities.yaml` | Generated board; inspect it with `vibetether capabilities` |
| `.vibetether/state/current.yaml` | Runtime checkpoint; inspect for diagnosis and normally let VibeTether maintain it |
```

After the existing truth examples, add:

```sh
vibetether bootstrap --project .
vibetether customize --project .
vibetether doctor --project . --json
```

- [ ] **Step 6: Preserve the honest public boundary and repair text encoding**

Ensure the README says automatic behavior requires host cooperation, cannot control hidden internal Ultra orchestration, and makes no measured Token-savings claim. Replace corrupted mojibake punctuation such as `鈥` sequences with ASCII punctuation.

- [ ] **Step 7: Run the README and public-release tests**

Run:

```sh
node --test test/public-release.test.mjs
```

Expected: all public-release tests pass and the README remains below 420 non-empty lines.

- [ ] **Step 8: Commit the README release story**

```sh
git add README.md test/public-release.test.mjs
git commit -m "docs: explain smaller finish lines for powerful agents"
```

### Task 4: Publish a reproducible 0.5.0 identity

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `registry/vibetether-releases.json`
- Modify: `test/skill-contract.test.mjs`
- Modify: `test/public-release.test.mjs`

- [ ] **Step 1: Write the 0.5.0 release expectations**

Change test expectations from `0.4.0` to `0.5.0`. Change the release-history count assertion from seven to eight historical identities.

Add an exact history assertion for 0.4.0:

```js
assert.equal(
  skillInstall.VIBETETHER_RELEASE_COMPATIBILITY.history.some((entry) => (
    entry.version === '0.4.0'
    && entry.commit === '7fe763f8af4dc9c45a118293dbc292961f6df9ef'
    && entry.fingerprint === '7378a1a9b9847495dd40767734208325a0bdc2fd293162b2e718df8ee40237c0'
  )),
  true,
);
```

- [ ] **Step 2: Run release tests and verify RED**

Run:

```sh
node --test test/skill-contract.test.mjs test/public-release.test.mjs
```

Expected: failures identify the still-current 0.4.0 package and seven-entry history.

- [ ] **Step 3: Update package metadata mechanically**

Run:

```sh
npm version 0.5.0 --no-git-tag-version
```

Expected: `package.json` and the root `package-lock.json` package identity both become 0.5.0 without a Git tag.

- [ ] **Step 4: Register 0.4.0 history and compute the new portable fingerprint**

Append this history entry in `registry/vibetether-releases.json`:

```json
{
  "id": "v0.4.0",
  "version": "0.4.0",
  "commit": "7fe763f8af4dc9c45a118293dbc292961f6df9ef",
  "fingerprint": "7378a1a9b9847495dd40767734208325a0bdc2fd293162b2e718df8ee40237c0"
}
```

Compute the current Skill fingerprint:

```sh
node --input-type=module -e "import { portableSkillFingerprint, sourceSkill } from './src/skill-install.mjs'; console.log(await portableSkillFingerprint(sourceSkill));"
```

Set `current.version` to `0.5.0` and `current.fingerprint` to the exact printed SHA-256 value.

- [ ] **Step 5: Run release identity verification**

Run:

```sh
node --test test/skill-contract.test.mjs test/public-release.test.mjs
npm run audit:release
```

Expected: focused tests pass and output reports eight valid historical identities.

- [ ] **Step 6: Commit the release identity**

```sh
git add package.json package-lock.json registry/vibetether-releases.json test/skill-contract.test.mjs test/public-release.test.mjs
git commit -m "chore: prepare VibeTether 0.5.0"
```

### Task 5: Verify, review, and publish

**Files:**
- Verify all changed files
- Do not stage or modify the pre-existing untracked `.superpowers/` directory

- [ ] **Step 1: Run formatting and source-hygiene checks**

Run:

```sh
git diff --check
git grep -n -E 'BEGIN (OPENSSH|RSA|EC) PRIVATE KEY|ghp_[A-Za-z0-9_]{20,}|[A-Za-z]:[\\/]' -- README.md src skills registry evals docs package.json
```

Expected: both commands produce no problem output.

- [ ] **Step 2: Run the full release check**

Run:

```sh
npm run check
```

Expected: every Node test passes, `17/17` static scenario contracts pass, eight historical release identities validate, and Skill self-validation passes.

- [ ] **Step 3: Run package and acceptance verification**

Run:

```sh
npm run acceptance:tour
npm pack --dry-run --json
```

Expected: acceptance tour passes; package preview includes the portable Skill, runtime, registries, focused docs, and assets, but excludes `docs/superpowers/` and `.superpowers/`.

- [ ] **Step 4: Review the final diff against the approved scope**

Run:

```sh
git status --short
git diff 7fe763f8af4dc9c45a118293dbc292961f6df9ef..HEAD --stat
git diff 7fe763f8af4dc9c45a118293dbc292961f6df9ef..HEAD -- README.md skills/vibe-tether/SKILL.md src/adapters.mjs evals/scenarios/long-task-route-controls.json registry/vibetether-releases.json package.json
```

Expected: only the approved README, scope invariant, tests/evals, design/plan, and 0.5.0 release identity changed; `.superpowers/` remains untracked and unstaged.

- [ ] **Step 5: Commit any verification-only corrections**

If verification required a bounded correction, stage only the named project files and commit:

```sh
git commit -m "fix: finalize VibeTether 0.5.0 verification"
```

If no correction was needed, do not create an empty commit.

- [ ] **Step 6: Push the completed branch to remote main**

Run:

```sh
git push origin HEAD:main
```

Expected: remote `main` advances to the final verified local commit. If authentication or transport fails, preserve all local commits and report the exact external blocker without weakening verification.
