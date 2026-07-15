# VibeTether Project Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn VibeTether's approved user-owned truth map into a tested project control plane that coordinates truth, intent, state, routing, evidence, and reusable experience without overriding Agent technical judgment.

**Architecture:** Add a focused `truth-map.mjs` boundary for the human-readable registry, keep `project.yaml` as a pointer manifest, and preserve legacy `sources` only as rollback evidence. Initialization creates a blank map for new projects and migrates already-active sources for existing projects; Agent instructions perform semantic candidate/confirmation work, while the CLI validates paths, state, and cross-file consistency. Route handshakes update only checkpoint routing metadata through a rollback-safe two-file write.

**Tech Stack:** Node.js 20+ ESM, `node:test`, `yaml`, Markdown, existing VibeTether transactional file helpers.

---

## File map

- Create `src/truth-map.mjs`: canonical scaffold, parser, safe path validation, legacy migration.
- Create `skills/vibe-tether/references/project-truth.md`: Agent workflow for candidate discovery, confirmation, lifecycle, rereading, and conflict handling.
- Create `test/truth-map.test.mjs`: focused truth-map unit contracts.
- Modify `src/init.mjs`: blank new-project map, legacy migration, byte preservation, manifest pointer.
- Modify `src/manifest.mjs`: canonical truth route constants and compatibility helpers.
- Modify `src/project-scan.mjs`: separate repository/bundle observation from truth activation.
- Modify `src/doctor.mjs`: validate the seven control areas and confirmed truth paths.
- Modify `src/route-handshake.mjs`: reject phase mismatch and synchronize checkpoint routing metadata.
- Modify `skills/vibe-tether/SKILL.md`, `src/adapters.mjs`, and installed scripts: integrated entry protocol and user-confirmed truth/experience activation.
- Modify `README.md` and focused guides: capability-first explanation, natural-language workflows, and honest limits.
- Create `docs/assets/vibetether-control-loop.svg`: small deterministic visual rather than an opaque marketing image.

### Task 1: Lock the authority transition in tests

**Files:**
- Create: `test/truth-map.test.mjs`
- Modify: `test/cli-init.test.mjs`
- Modify: `test/cli-lifecycle.test.mjs`

- [ ] **Step 1: Write failing canonical truth-map tests**

```js
test('new truth map has no confirmed project documents', () => {
  const source = createTruthMap({ harnesses: ['codex', 'claude'] });
  const parsed = parseTruthMap(source);
  assert.deepEqual(parsed.confirmed, []);
  assert.deepEqual(parsed.hosts.map((entry) => entry.path), ['AGENTS.md', 'CLAUDE.md']);
});

test('parser preserves project-owned prose and rejects duplicate active paths', () => {
  const source = `${createTruthMap({ harnesses: ['codex'] })}\n<!-- user note -->\n`;
  assert.equal(parseTruthMap(source).source, source);
  assert.throws(() => parseTruthMap(source.replace('## Candidates', '- [x] `docs/spec.md`\n- [x] `docs/spec.md`\n\n## Candidates')), /duplicate/i);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/truth-map.test.mjs`

Expected: FAIL because `src/truth-map.mjs` does not exist.

- [ ] **Step 3: Write failing initialization contracts**

Add tests proving a new project containing `PRD.md` and `docs/specs/` receives a blank `TRUTH.md`, while a legacy initialized project migrates its existing active sources into confirmed entries without deleting `manifest.sources`.

- [ ] **Step 4: Run the initialization tests and verify RED**

Run: `node --test test/cli-init.test.mjs --test-name-pattern="truth map|legacy truth"`

Expected: FAIL because current initialization auto-activates discovered documents and writes no truth index.

### Task 2: Implement the human-owned truth-map boundary

**Files:**
- Create: `src/truth-map.mjs`
- Modify: `src/manifest.mjs`
- Test: `test/truth-map.test.mjs`

- [ ] **Step 1: Implement the minimal canonical API**

```js
export const TRUTH_INDEX_PATH = '.vibetether/TRUTH.md';

export function createTruthMap({ harnesses = [], confirmed = [] } = {}) { /* deterministic Markdown */ }
export function parseTruthMap(source) { /* exact section and entry validation */ }
export function legacyManifestEntries(manifest) { /* stable, deduplicated source entries */ }
export async function validateConfirmedTruth(root, parsed) { /* contained, non-linked, existing paths */ }
```

The parser accepts only backtick-delimited project-relative paths in the three lifecycle sections, preserves the original source for byte-stable re-init, rejects duplicate active paths, traversal, absolute paths, and malformed active entries, and does not interpret candidates as authority.

- [ ] **Step 2: Run the focused tests and verify GREEN**

Run: `node --test test/truth-map.test.mjs`

Expected: PASS.

- [ ] **Step 3: Refactor only after green**

Extract path normalization and entry rendering helpers inside `truth-map.mjs`; rerun the focused test unchanged.

### Task 3: Change init from automatic truth activation to blank-map or migration behavior

**Files:**
- Modify: `src/project-scan.mjs`
- Modify: `src/init.mjs`
- Modify: `src/managed-project-state.mjs`
- Modify: `src/uninstall.mjs`
- Test: `test/cli-init.test.mjs`
- Test: `test/init-transaction.test.mjs`
- Test: `test/uninstall-transaction.test.mjs`

- [ ] **Step 1: Keep observation but stop new-project promotion**

Add an option such as `scanProject(root, adapters, profile, { activateTruth: false })`. Bundle and project-state evidence remains available, but returned `sources` contains only compatibility infrastructure and never discovered `PRD.md`, `docs/specs/`, ADR, UI, testing, release, or operations documents.

- [ ] **Step 2: Plan the truth artifact transactionally**

For a fresh project, add `TRUTH.md` with an empty confirmed section and `truth_index` to the manifest. For a legacy manifest without `truth_index`, migrate every current source into confirmed entries and retain the old `sources` object unchanged for rollback. For a project with a valid existing `TRUTH.md`, preserve bytes exactly.

- [ ] **Step 3: Protect project ownership**

Repeated init repairs a missing canonical empty map only when ownership evidence proves VibeTether created it. It refuses to overwrite malformed or customized maps and reports a recovery action. Uninstall removes only an unchanged VibeTether-created empty scaffold; non-empty or customized maps remain.

- [ ] **Step 4: Run focused lifecycle tests**

Run: `node --test test/cli-init.test.mjs test/init-transaction.test.mjs test/uninstall-transaction.test.mjs`

Expected: PASS with no provider or Windows lifecycle regressions.

### Task 4: Make doctor validate the whole control plane

**Files:**
- Modify: `src/doctor.mjs`
- Modify: `skills/vibe-tether/scripts/manifest.mjs`
- Modify: `skills/vibe-tether/scripts/validate-project.mjs`
- Test: `test/cli-lifecycle.test.mjs`
- Test: `test/skill-contract.test.mjs`

- [ ] **Step 1: Add failing doctor tests**

```js
test('doctor validates confirmed truth but ignores candidates', async () => {
  // confirmed missing path => error; candidate missing path => no authority error
});

test('doctor reports truth, intent, state, routing, experience and provider health', async () => {
  // healthy initialized fixture exposes all responsibility areas
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/cli-lifecycle.test.mjs --test-name-pattern="confirmed truth|responsibility areas"`

Expected: FAIL because doctor has no truth-map reader.

- [ ] **Step 3: Implement read-only validation**

Doctor validates `truth_index`, canonical structure, confirmed contained paths, duplicates, and current fingerprints. It never rewrites semantic files and never claims semantic understanding. Markdown experience artifacts count as routed when they are referenced by the experience index; they no longer require duplication under legacy manifest sources.

- [ ] **Step 4: Verify GREEN**

Run: `node --test test/cli-lifecycle.test.mjs test/skill-contract.test.mjs`

Expected: PASS.

### Task 5: Synchronize phase routing with the semantic checkpoint

**Files:**
- Modify: `src/files.mjs`
- Modify: `src/route-handshake.mjs`
- Test: `test/route-handshake.test.mjs`

- [ ] **Step 1: Write failing route synchronization tests**

Test that a route phase different from `state/current.yaml.phase` writes neither file; a successful start updates only `provider_selection`; complete and abandon update its disposition; an injected second-file failure restores both original files.

- [ ] **Step 2: Verify RED**

Run: `node --test test/route-handshake.test.mjs --test-name-pattern="checkpoint|rollback"`

Expected: FAIL because current route writes only the handshake and does not reject phase mismatch.

- [ ] **Step 3: Add rollback-safe paired writes**

```js
export async function writeAtomicPair([{ target, content, original }, ...]) {
  // stage temporary files, commit in order, restore committed originals on failure
}
```

Use it to write the handshake and checkpoint together. Preserve every checkpoint field except `provider_selection` and `last_reanchor` when the Agent has not supplied a semantic update.

- [ ] **Step 4: Verify GREEN**

Run: `node --test test/route-handshake.test.mjs`

Expected: PASS.

### Task 6: Pressure-test and update the entry Skill

**Files:**
- Modify: `skills/vibe-tether/SKILL.md`
- Create: `skills/vibe-tether/references/project-truth.md`
- Modify: `skills/vibe-tether/references/project-manifest.md`
- Modify: `skills/vibe-tether/references/checkpoint-and-drift.md`
- Modify: `skills/vibe-tether/references/success-capture.md`
- Modify: `src/adapters.mjs`
- Modify: `evals/forward-scenarios/*.md`
- Modify: `evals/results/*`
- Test: `test/skill-contract.test.mjs`
- Test: `test/evals.test.mjs`

- [ ] **Step 1: Run three RED pressure scenarios without the new truth reference**

Scenarios combine deadline, long-context fatigue, and sunk cost:

1. a new generated design document looks authoritative but is not registered;
2. an Agent is mid-implementation when a confirmed source changes;
3. a known Proven Path conflicts with confirmed project direction.

Record whether the baseline silently promotes the document, keeps coding without rereading, or lets successful history override truth.

- [ ] **Step 2: Write the minimal integrated protocol**

The main Skill remains a concise entry point and directly links one new heavy reference. The reference defines candidate discovery, one-at-a-time confirmation, moves/deletion/supersession, nested governance, adaptive reread triggers, truth-versus-experience conflict, and the ownership boundary: CLI deterministic, Agent semantic proposal, user activation.

- [ ] **Step 3: Change success capture semantics explicitly**

First reusable success immediately creates a sanitized candidate; `captured` is valid only after user confirmation and indexing. Deferred decisions remain pending. Update the managed host block so old immediate-active wording cannot survive.

- [ ] **Step 4: Run GREEN pressure scenarios and contracts**

Run: `node --test test/skill-contract.test.mjs test/evals.test.mjs`

Expected: the same scenarios now cite confirmed truth, ask only at activation/high-risk boundaries, and preserve low-risk technical autonomy.

### Task 7: Rewrite the public explanation around project control

**Files:**
- Modify: `README.md`
- Modify: `docs/installation.md`
- Modify: `docs/routing.md`
- Modify: `docs/proven-paths.md`
- Create: `docs/project-truth.md`
- Create: `docs/assets/vibetether-control-loop.svg`
- Modify: `test/public-release.test.mjs`

- [ ] **Step 1: Write failing documentation contracts**

Require the easiest Codeload command first, the seven-part control surface including `TRUTH.md`, ordinary-language examples for search/add/move/remove/conflict, custom route guidance, the no-background-daemon boundary, and no guaranteed drift or Token-savings claim.

- [ ] **Step 2: Verify RED**

Run: `node --test test/public-release.test.mjs --test-name-pattern="truth map|control plane|README"`

Expected: FAIL because the current README has no user-owned truth-map workflow or asset.

- [ ] **Step 3: Update the README and focused guides**

Keep the README concise and capability-first. Use the SVG to show `request -> re-anchor -> readiness -> route -> evidence -> capture -> re-anchor`; include accessible text and no external runtime dependency.

- [ ] **Step 4: Verify GREEN**

Run: `node --test test/public-release.test.mjs`

Expected: PASS.

### Task 8: Full compatibility and clean-project acceptance

**Files:**
- Modify only if a regression test exposes a defect.

- [ ] **Step 1: Run the complete deterministic suite**

Run: `npm test`

Expected: zero failures; platform-specific skips must be explained.

- [ ] **Step 2: Run static and independent evaluation checks**

Run: `npm run eval`

Expected: every scenario contract passes; output retains the independent-forward-test limitation.

- [ ] **Step 3: Run release and Skill validation**

Run: `npm run audit:release`

Run: `node skills/vibe-tether/scripts/validate-project.mjs --self`

Expected: both exit 0.

- [ ] **Step 4: Run a clean new-project tour**

Create a disposable project containing `PRD.md`, initialize `core` for both hosts, and verify: blank confirmed truth, `PRD.md` only as a possible Agent candidate, healthy doctor, capabilities available, and no provider network requirement.

- [ ] **Step 5: Run a legacy migration tour**

Create a disposable pre-truth installation with custom sources and experience, upgrade it, and verify: all old active sources are confirmed, legacy data remains, custom bytes survive, doctor passes, rollback evidence is retained, and re-init is idempotent.

- [ ] **Step 6: Review and commit**

Run: `git diff --check`

Run: `git status --short`

Commit only the reviewed VibeTether files; never include `.superpowers/` or unrelated user changes.
