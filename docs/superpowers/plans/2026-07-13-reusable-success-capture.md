# Reusable Success Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VibeTether automatically capture the first verified reusable workflow, update recovered or changed paths, avoid duplicate routine records, and block completion when the experience disposition was skipped.

**Architecture:** Keep semantic classification in the portable Skill and project instruction block, while storing only a compact disposition in the existing local checkpoint. Extend the existing `doctor` command to validate completion-like states, and encode routing behavior in the existing capability/scenario catalogs and static evals. Durable knowledge continues to live in tests, scripts, runbooks, ADRs, product truth, or Skill references rather than a new global ledger.

**Tech Stack:** Node.js 20+ ESM, `node:test`, YAML, Markdown Agent Skills, JSON scenario fixtures.

---

## File Map

- `src/adapters.mjs`: compact Codex/Claude managed instruction contract and legacy upgrade allowlist.
- `src/manifest.mjs`: initial checkpoint shape.
- `src/doctor.mjs`: structural validation for trigger/disposition consistency at completion.
- `skills/vibe-tether/SKILL.md`: automatic completion boundary and reference route.
- `skills/vibe-tether/references/success-capture.md`: full first/recovered/changed/repeated/routine protocol and destination rules.
- `skills/vibe-tether/references/checkpoint-and-drift.md`: compact checkpoint example and resume lookup rule.
- `skills/vibe-tether/references/project-manifest.md`: managed block and proven-path source routing.
- `skills/vibe-tether/references/scenario-routing.md`: agent-readable success-capture scenario.
- `registry/capabilities.json`: success-capture capability contract.
- `registry/scenarios.json`: first-proven-path scenario contract.
- `evals/scenarios/first-proven-path.json`: RED/GREEN pressure fixture.
- `evals/run-static-evals.mjs`: deterministic signal-to-gate route.
- `evals/README.md`: evaluation coverage and honesty boundary.
- `docs/operations/github-publishing.md`: sanitized first real Proven Path.
- `README.md`: user-facing behavior, limits, upgrade, and example.
- `test/skill-contract.test.mjs`: Skill/reference contract.
- `test/cli-init.test.mjs`: initialized checkpoint and managed block contract.
- `test/cli-lifecycle.test.mjs`: doctor completion gate and in-progress compatibility.
- `test/routing-scenarios.test.mjs`, `test/registry.test.mjs`, `test/evals.test.mjs`: routing/eval contracts.
- `test/public-release.test.mjs`: public runbook and README contract.
- `package.json`, `package-lock.json`: patch release metadata after all behavior is green.

### Task 1: Finalize the approved design

**Files:**
- Modify: `docs/superpowers/specs/2026-07-13-reusable-success-capture-design.md`

- [ ] **Step 1: Confirm the spec names the five trigger classes**

Require `first-proven-path`, `recovered-path`, `changed-proven-path`, `repeat-proven-path`, and `routine-non-path`.

- [ ] **Step 2: Confirm first success is mandatory capture**

The spec must state that the first verified reusable workflow is `captured` immediately even when its first attempt succeeds.

- [ ] **Step 3: Run the spec self-review**

Run:

```powershell
rg -n "TBD|TODO|FIXME|status: pending|Success Salience" docs/superpowers/specs/2026-07-13-reusable-success-capture-design.md
git diff --check
```

Expected: no placeholders, obsolete status field, or old gate name; `git diff --check` exits 0.

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/specs/2026-07-13-reusable-success-capture-design.md docs/superpowers/plans/2026-07-13-reusable-success-capture.md
git commit -m "docs: finalize reusable success capture design"
```

### Task 2: RED — express the project activation and checkpoint contracts

**Files:**
- Modify: `test/cli-init.test.mjs`
- Modify: `test/cli-lifecycle.test.mjs`

- [ ] **Step 1: Add the failing initialization test**

Add assertions equivalent to:

```js
assert.match(agents, /automatically apply.*vibe-tether/i);
assert.match(agents, /first-proven-path/i);
assert.match(agents, /after every verified.*success/i);
assert.match(agents, /credentials|private keys|one-time codes/i);

const checkpoint = YAML.parse(await readFile(path.join(target, '.vibetether', 'state', 'current.yaml'), 'utf8'));
assert.deepEqual(checkpoint.experience_feedback, {
  trigger: null,
  disposition: 'pending',
  reason: '',
  artifacts: [],
});
```

- [ ] **Step 2: Add failing doctor tests**

Create one in-progress case where `DISCOVER` plus `pending` remains healthy, one `REVIEW` case where `pending` produces `pending-experience-feedback`, one `REVIEW` first-proven case where `captured` without artifacts produces `invalid-experience-feedback`, and one valid captured case.

- [ ] **Step 3: Watch RED fail for missing behavior**

Run:

```powershell
node --test test/cli-init.test.mjs test/cli-lifecycle.test.mjs
```

Expected: failures mention missing managed-block phrases, absent `experience_feedback`, or missing doctor issue codes.

### Task 3: GREEN — implement managed activation, checkpoint state, and doctor audit

**Files:**
- Modify: `src/adapters.mjs`
- Modify: `src/manifest.mjs`
- Modify: `src/doctor.mjs`

- [ ] **Step 1: Preserve the previous managed body as upgradeable legacy content**

Rename the current `sharedRules` value to a legacy constant, add it to `LEGACY_MANAGED_BODIES`, then create a new compact `sharedRules` that requires automatic VibeTether application and first-success capture without duplicating the heavy reference.

- [ ] **Step 2: Add the initial compact checkpoint value**

Add exactly:

```js
experience_feedback: {
  trigger: null,
  disposition: 'pending',
  reason: '',
  artifacts: [],
},
```

to `createInitialCheckpoint`.

- [ ] **Step 3: Validate experience feedback in `doctor`**

Use these constants and rules:

```js
const COMPLETION_PHASES = new Set(['REVIEW', 'SHIP']);
const CAPTURE_TRIGGERS = new Set(['first-proven-path', 'recovered-path', 'changed-proven-path']);
const VALID_TRIGGERS = new Set([...CAPTURE_TRIGGERS, 'repeat-proven-path', 'routine-non-path']);
const VALID_DISPOSITIONS = new Set(['captured', 'already-encoded', 'not-reusable']);
```

At `REVIEW` or `SHIP`, reject missing or pending feedback. Require `captured` for capture triggers and at least one artifact; require `already-encoded` plus at least one artifact for `repeat-proven-path`; require `not-reusable`, a reason, and zero artifacts for `routine-non-path`. Do not block `DISCOVER`, `ALIGN`, `DESIGN`, `PLAN`, `EXECUTE_ONE`, `VERIFY`, `DIAGNOSE`, or `BLOCKED` merely because feedback is pending.

- [ ] **Step 4: Watch GREEN pass**

Run:

```powershell
node --test test/cli-init.test.mjs test/cli-lifecycle.test.mjs
```

Expected: all targeted tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/adapters.mjs src/manifest.mjs src/doctor.mjs test/cli-init.test.mjs test/cli-lifecycle.test.mjs
git commit -m "feat: gate completion on reusable success disposition"
```

### Task 4: RED — express Skill, routing, evaluation, and public-document contracts

**Files:**
- Modify: `test/skill-contract.test.mjs`
- Modify: `test/registry.test.mjs`
- Modify: `test/routing-scenarios.test.mjs`
- Modify: `test/evals.test.mjs`
- Modify: `test/public-release.test.mjs`

- [ ] **Step 1: Require a direct success-capture reference**

Extend the expected direct references with `references/success-capture.md`. Require the Skill to mention `first-proven-path`, automatic capture on the first verified reusable success, the three dispositions, and the completion doctor audit.

- [ ] **Step 2: Require one success-capture capability and scenario**

Assert that `registry/capabilities.json` contains `success-capture`; assert that `registry/scenarios.json` and the generated board contain `first-proven-path`, with the built-in VibeTether route and no optional provider requirement.

- [ ] **Step 3: Require the new static pressure fixture**

Extend the sorted eval IDs with `first-proven-path` and expect `14/14 static scenario contracts passed`. Require evidence keys `verified-success`, `first-path-classification`, `durable-artifact`, and `redaction-check`.

- [ ] **Step 4: Require the public runbook and README explanation**

Assert that `docs/operations/github-publishing.md` contains `ssh.github.com`, port `443`, explicit identity selection, remote and CI verification, credential cleanup, and `core.autocrlf=false`; assert that it contains no private key block or one-time code. Require the README to explain first-proven-path capture and the three dispositions.

- [ ] **Step 5: Watch RED fail**

Run:

```powershell
node --test test/skill-contract.test.mjs test/registry.test.mjs test/routing-scenarios.test.mjs test/evals.test.mjs test/public-release.test.mjs
```

Expected: failures identify the missing reference, capability, scenario, eval fixture, runbook, and README contract.

### Task 5: GREEN — implement the portable Success Capture Loop

**Files:**
- Create: `skills/vibe-tether/references/success-capture.md`
- Create: `evals/scenarios/first-proven-path.json`
- Create: `docs/operations/github-publishing.md`
- Modify: `skills/vibe-tether/SKILL.md`
- Modify: `skills/vibe-tether/references/checkpoint-and-drift.md`
- Modify: `skills/vibe-tether/references/project-manifest.md`
- Modify: `skills/vibe-tether/references/scenario-routing.md`
- Modify: `registry/capabilities.json`
- Modify: `registry/scenarios.json`
- Modify: `evals/run-static-evals.mjs`
- Modify: `evals/README.md`
- Modify: `README.md`

- [ ] **Step 1: Write the focused heavy reference**

Define trigger classes, five diagnostic questions, first-success mandatory capture, destination routing, minimum Proven Path content, redaction, provisional workarounds, deduplication, checkpoint examples, and rationalization counters. Keep project-specific GitHub details out of the generic Skill reference.

- [ ] **Step 2: Route the Skill to the reference**

Add one concise Success Capture Gate section before Completion. Completion must run the gate after verified user-level or engineering-level success and before completion, handoff, next slice, merge, release, or publication.

- [ ] **Step 3: Update checkpoint and manifest references**

Show the four-field `experience_feedback` object and instruct resume/re-anchor to consult applicable Proven Paths. Explain that newly created runbooks must become manifest-routed truth without creating a universal VibeTether ledger.

- [ ] **Step 4: Add built-in routing and evaluation contracts**

Add a `success-capture` capability in `VERIFY`, `REVIEW`, and `SHIP`; add a `first-proven-path` scenario with signal `first-proven-path`; map the static eval signal to `full-reanchor` and `success-capture-required`.

The fixture must contain:

```json
{
  "id": "first-proven-path",
  "signals": ["first-proven-path"],
  "expected_preflight_class": "full-reanchor",
  "expected_gate": "success-capture-required",
  "prohibited_action": "claim-completion-without-capturing-the-first-verified-publication-path",
  "required_evidence": ["verified-success", "first-path-classification", "durable-artifact", "redaction-check"]
}
```

- [ ] **Step 5: Write the sanitized GitHub publication runbook**

Document first-run capture, prerequisites, ephemeral deploy-key lifecycle, explicit `IdentityFile`/`-i`, `ssh.github.com:443`, atomic push, remote ref verification, CI verification, Windows line-ending fingerprint stability, rollback/cleanup, and revalidation triggers. Use placeholders only.

- [ ] **Step 6: Explain the feature and limits in README**

State that project instructions trigger the gate automatically, semantic classification remains model judgment, doctor checks structural completion only, first verified paths are captured immediately, repeated unchanged paths are deduplicated, and no credentials or private reasoning are persisted.

- [ ] **Step 7: Watch GREEN pass**

Run:

```powershell
node --test test/skill-contract.test.mjs test/registry.test.mjs test/routing-scenarios.test.mjs test/evals.test.mjs test/public-release.test.mjs
```

Expected: all targeted tests pass and the static suite reports 14/14.

- [ ] **Step 8: Commit**

```powershell
git add skills registry evals docs/operations README.md test
git commit -m "feat: capture first proven success paths"
```

### Task 6: Refactor, release metadata, and full verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.scratch/vibetether-success-capture/AGENT_DELIVERY.md` in the parent workspace

- [ ] **Step 1: Refactor only while targeted tests remain green**

Remove duplicated wording from the main Skill and managed block, keeping the decision detail in `success-capture.md`.

- [ ] **Step 2: Set the patch release version**

Run:

```powershell
npm version 0.2.1 --no-git-tag-version
```

Expected: `package.json` and `package-lock.json` both report `0.2.1`.

- [ ] **Step 3: Run full verification**

Run:

```powershell
npm test
npm run eval
node skills/vibe-tether/scripts/validate-project.mjs --self
npm run acceptance:tour
npm pack --dry-run
git diff --check
```

Expected: all tests pass, 14/14 scenarios pass, the Skill validates, the acceptance tour passes, the package contains the new reference and runbook where applicable, and diff check exits 0.

- [ ] **Step 4: Run the release secret and scope review**

Run repository searches for private-key headers, credential-like assignments, one-time-code wording with numeric values, local absolute paths, and non-English leakage in public release surfaces. Inspect `git diff --stat`, `git diff`, and `git status --short`.

- [ ] **Step 5: Complete and validate the delivery packet**

Record exact commands, exit codes, pass counts, scope review, review inputs, verdict, independence limitation, and experience feedback. Change packet status to `complete`, then run:

```powershell
python .agents/skills/gyws-controlled-delivery/scripts/validate_delivery_packet.py .scratch/vibetether-success-capture/AGENT_DELIVERY.md
```

Expected: `VALID`.

- [ ] **Step 6: Commit and publish under the existing release authorization**

```powershell
git add package.json package-lock.json
git commit -m "chore: release vibetether 0.2.1"
git push origin codex/provider-bundles-routing
git push origin HEAD:main
```

Expected: remote refs match local `HEAD`; GitHub CI passes on Windows and Ubuntu with Node 20 and 24. If authentication material is unavailable, stop after local verification and report the exact publication blocker without recreating credentials silently.
