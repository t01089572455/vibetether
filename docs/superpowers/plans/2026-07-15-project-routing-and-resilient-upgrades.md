# VibeTether Project Routing and Resilient Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship VibeTether 0.3.0 with project-owned Skill routes, mechanically checked phase re-entry, non-destructive Windows self-upgrades, and a concise beginner-first README that accurately explains the product.

**Architecture:** Keep `.vibetether/capabilities.yaml` as the generated base contract, merge a live user-owned `.vibetether/routes.local.yaml` overlay through one validation module, and record each consequential phase decision in a separate machine-owned route handshake. Move active-Skill replacement into a manifest-backed recovery transaction that stages the new canonical tree before touching the last known-good installation and resumes on the next `init` after Windows releases the directory handle. Preserve the existing provider registry, readiness, authority, experience, and evidence contracts.

**Tech Stack:** Node.js 20+ ESM, `node:test`, YAML, JSON capability boards, atomic filesystem transactions, Markdown, GitHub Actions on Windows and Ubuntu.

---

## File Map

### New runtime modules

- `src/project-routes.mjs`: parse, validate, discover, and merge the project-owned route overlay.
- `src/customize.mjs`: guided project-route wizard, preview, confirmation, and atomic user-owned YAML write.
- `src/route-handshake.mjs`: resolve, start, complete, and abandon stateful phase handshakes.
- `src/skill-upgrade-recovery.mjs`: canonical upgrade transaction manifests, pending replacement staging, legacy orphan recovery, and doctor inspection.

### New tests

- `test/project-routes.test.mjs`: schema, safety, inheritance, availability, conflict, and live reload contracts.
- `test/customize.test.mjs`: numbered choices, preview, cancellation, direct persistence, and user-file preservation.
- `test/route-handshake.test.mjs`: CLI parsing, active/satisfied/abandoned lifecycle, evidence safety, route freshness, and experience output.
- `test/windows-upgrade-recovery.test.mjs`: injected `EPERM`, pending state, peer-identity recovery, ambiguity, and retry-after-release.

### Modified runtime and control files

- `src/capabilities.mjs`: load the live route overlay and return the effective board and source metadata.
- `src/cli.mjs`: add `customize` and stateful `route`, `route complete`, and `route abandon` commands.
- `src/terminal-prompts.mjs`: support multi-select signals and route previews without weakening existing prompts.
- `src/init.mjs`: validate and declare the overlay, recover pending Skill upgrades before planning or provider fetch, and use the new safe replacement transaction.
- `src/skill-install.mjs`: expose canonical identity helpers and delegate VibeTether replacement to the recovery module.
- `src/doctor.mjs`: validate live routes, handshakes, pending upgrades, missing Skills, and legacy recovery states.
- `src/manifest.mjs`: declare the conventional optional route path without claiming ownership.
- `src/adapters.mjs`: require stateful phase re-entry in managed Codex and Claude instructions.
- `src/uninstall.mjs`: preserve `.vibetether/routes.local.yaml` and remove only VibeTether-owned route state.
- `skills/vibe-tether/SKILL.md`: teach the installed control Skill to run the route handshake at lifecycle boundaries.
- `skills/vibe-tether/references/capability-routing.md`: document local roles, matching, and fallback behavior.
- `skills/vibe-tether/references/checkpoint-and-drift.md`: document the bounded route-handshake state and doctor gate.
- `skills/vibe-tether/scripts/resolve-route.mjs`: merge the live project overlay for offline installed-Skill resolution.
- `skills/vibe-tether/scripts/capability-routing.mjs`: support additive local route contracts without weakening base fields.
- `skills/vibe-tether/scripts/validate-project.mjs`: validate the optional overlay and route-handshake shape.

### Modified documentation, release, and verification files

- `README.md`: beginner-first product story, reliable installation, 30-second route example, feature grid, loop diagram, customization, and honest limits.
- `docs/routing.md`: full automatic-routing, local-overlay, wizard, and handshake reference.
- `docs/installation.md`: profiles, bundles, provider networking, updates, and platform guidance.
- `docs/proven-paths.md`: Success Capture Gate and recall reference moved out of the landing page.
- `docs/providers.md`: curated inventories, exposure rules, provenance, and licensing details.
- `docs/troubleshooting.md`: TLS/provider errors, Windows pending upgrades, recovery codes, and retry commands.
- `docs/operations/windows-skill-lifecycle.md`: first-proven deferred-upgrade and legacy-orphan recovery runbook.
- `registry/vibetether-releases.json`: register 0.2.3 as historical and set the 0.3.0 canonical fingerprint.
- `package.json` and `package-lock.json`: release version and packaged documentation.
- `test/public-release.test.mjs`: README claims, links, version, package contents, and release-history contract.
- `test/evals.test.mjs`, `test/routing-scenarios.test.mjs`, and `evals/`: phase re-entry, local route, missing handshake, and fallback scenarios.
- `scripts/manual-acceptance-tour.mjs`: local overlay, phase handshake, deferred-upgrade, and recovery acceptance.
- `.github/workflows/ci.yml`: retain Windows/Ubuntu and Node 20/24 matrix and run the complete gate.

### External delivery artifacts, never committed to the public repository

- `D:/python_workspace/gyws/.scratch/vibetether-routing-extensibility/AGENT_DELIVERY.md`: authority, status, evidence, and release gate.
- `D:/python_workspace/gyws/.vibetether/state/current.yaml`: outer task checkpoint and Success Capture Gate disposition.

---

### Task 1: Parse and Validate the User-Owned Route Overlay

**Files:**
- Create: `src/project-routes.mjs`
- Create: `test/project-routes.test.mjs`

- [ ] **Step 1: Write the minimal valid-route and rejection tests**

Create fixtures for all three roles and exact invalid cases:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import YAML from 'yaml';
import { parseProjectRoutes, validateProjectRoutes } from '../src/project-routes.mjs';

const baseBoard = {
  schema_version: 1,
  phases: ['DISCOVER', 'ALIGN', 'DESIGN', 'PLAN', 'EXECUTE_ONE', 'VERIFY', 'REVIEW', 'SHIP'],
  capabilities: [{
    id: 'planning',
    phases: ['PLAN'],
    expected_outputs: ['bounded-plan'],
    exit_evidence: ['The approved design is mapped to verifiable slices.'],
  }],
  high_risk_gates: ['release'],
};

test('a local primary is additive and requires an observable signal', () => {
  const document = parseProjectRoutes(YAML.stringify({
    schema_version: 1,
    routes: [{
      id: 'project-prd-to-issues',
      phases: ['PLAN'],
      capability: 'planning',
      when_any: ['prd-approved'],
      skill: 'to-issues',
      role: 'primary',
      use_when: ['A reviewed PRD needs actionable issues.'],
      expected_outputs: ['scoped-issues'],
      exit_evidence: ['Every approved requirement is mapped to an issue.'],
    }],
  }));
  const [route] = validateProjectRoutes(document, baseBoard).routes;
  assert.deepEqual(route.expected_outputs, ['scoped-issues']);
  assert.throws(() => validateProjectRoutes({
    ...document,
    routes: [{ ...document.routes[0], when_any: [] }],
  }, baseBoard), /primary.*signal/i);
});
```

Add individual tests for duplicate IDs, unknown phase, unknown capability, `../skill`, absolute paths, slash-containing Skill names, missing `use_when`, invalid roles, duplicated equal primaries, and attempted `expected_outputs_remove`, `exit_evidence_remove`, `fallback`, `readiness_gate`, or `high_risk_gates` keys.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
node --test test/project-routes.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/project-routes.mjs`.

- [ ] **Step 3: Implement strict schema parsing and safe normalization**

Create these public contracts:

```js
import YAML from 'yaml';
import { CliError } from './errors.mjs';

export const PROJECT_ROUTES_PATH = '.vibetether/routes.local.yaml';
export const PROJECT_ROUTE_ROLES = new Set(['primary', 'alternative', 'overlay']);
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const ALLOWED_ROUTE_KEYS = new Set([
  'id', 'phases', 'capability', 'when_any', 'skill', 'role', 'use_when',
  'expected_outputs', 'exit_evidence',
]);

export function parseProjectRoutes(source) {
  const value = YAML.parse(source);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CliError('Project routes must be a YAML mapping.', 3);
  }
  return value;
}

export function validateProjectRoutes(document, board) {
  if (document.schema_version !== 1 || !Array.isArray(document.routes)) {
    throw new CliError('Project routes require schema_version 1 and a routes array.', 3);
  }
  // Validate exact keys, safe names, existing phases/capabilities, role rules,
  // non-empty use_when, primary signals, duplicate IDs, and equal-match ties.
  return structuredClone(document);
}
```

The implementation must reject unknown keys rather than silently dropping a possible weakening instruction. Normalize all arrays by trimming strings, removing exact duplicates, and preserving declared order.

- [ ] **Step 4: Run the schema tests**

Run:

```powershell
node --test test/project-routes.test.mjs
```

Expected: PASS for valid primary, alternative, and overlay routes and every explicit rejection.

- [ ] **Step 5: Commit the schema slice**

```powershell
git add src/project-routes.mjs test/project-routes.test.mjs
git commit -m "feat: validate project-local routes"
```

---

### Task 2: Discover Local Skills and Merge Live Routes

**Files:**
- Modify: `src/project-routes.mjs`
- Modify: `src/capabilities.mjs`
- Modify: `test/project-routes.test.mjs`
- Modify: `test/capabilities.test.mjs`

- [ ] **Step 1: Add failing discovery, inheritance, and live-reload tests**

Use initialized core projects with real regular directories:

```js
test('matching available local primary replaces only the curated recommendation', async () => {
  const root = await initializedCoreProject('local-primary');
  await installFixtureSkill(root, '.agents/skills/to-issues');
  await writeProjectRoutes(root, localPrimaryRoute());
  const result = JSON.parse(await showCapabilities({
    project: root,
    phase: 'PLAN',
    capability: 'planning',
    signals: ['prd-approved'],
    agent: 'codex',
    json: true,
  }));
  assert.equal(result.selection.skill, 'to-issues');
  assert.equal(result.selection.source, 'project-local');
  assert.ok(result.required_outputs.includes('bounded-plan'));
  assert.ok(result.required_outputs.includes('scoped-issues'));
  assert.deepEqual(result.confirmation_gates, result.base_contract.confirmation_gates);
});

test('a manual route edit is reloaded without init', async () => {
  const root = await initializedCoreProject('live-edit');
  await installFixtureSkill(root, '.agents/skills/first-planner');
  await installFixtureSkill(root, '.agents/skills/second-planner');
  await writeProjectRoutes(root, localPrimaryRoute({ skill: 'first-planner' }));
  assert.equal((await resolvePlanning(root)).selection.skill, 'first-planner');
  await writeProjectRoutes(root, localPrimaryRoute({ skill: 'second-planner' }));
  assert.equal((await resolvePlanning(root)).selection.skill, 'second-planner');
});
```

Add tests for Claude-only discovery, both-harness availability, symlink rejection, missing local Skill fallback, alternatives, overlays, non-matching signals, and catalog-only paths never counting as local installations.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
node --test test/project-routes.test.mjs test/capabilities.test.mjs
```

Expected: FAIL because capability loading ignores `.vibetether/routes.local.yaml`.

- [ ] **Step 3: Implement safe project-local Skill discovery**

Add:

```js
export async function discoverProjectSkill(root, skill, harnesses) {
  if (!SAFE_NAME.test(skill)) throw new CliError(`Unsafe project Skill name: ${skill}`, 3);
  const installations = {};
  for (const harness of harnesses) {
    const relativePath = harness === 'codex'
      ? `.agents/skills/${skill}`
      : `.claude/skills/${skill}`;
    const directory = await inspectRegularDirectoryInside(root, relativePath);
    const entry = await inspectRegularFileInside(root, `${relativePath}/SKILL.md`);
    if (directory && entry) installations[harness] = relativePath;
  }
  return installations;
}
```

Every ancestor and the directory itself must be non-linked and project-contained. Do not read from `.vibetether/providers/catalog/` and do not download a missing Skill.

- [ ] **Step 4: Implement additive board merging**

Add:

```js
export async function mergeProjectRoutes({ root, board, document, harnesses }) {
  const effective = structuredClone(board);
  const localRoutes = [];
  for (const route of validateProjectRoutes(document, board).routes) {
    const installations = await discoverProjectSkill(root, route.skill, harnesses);
    localRoutes.push({
      ...route,
      source: 'project-local',
      installations,
      available_in: Object.keys(installations),
    });
  }
  effective.project_routes = localRoutes;
  return effective;
}
```

Update route resolution so an available matching local `primary` wins, an unavailable local primary records a fallback reason, local alternatives remain selectable, local overlays are appended, and base outputs/evidence/gates are unioned rather than replaced.

- [ ] **Step 5: Load the conventional overlay at every query**

In `loadCapabilitySnapshot`, after validating the base board, load `manifest.project_routes ?? PROJECT_ROUTES_PATH` only when it exists. A missing optional conventional file returns an empty overlay. A declared route file that is missing, linked, or malformed is a controlled error. Return:

```js
return {
  root,
  manifest,
  board: await mergeProjectRoutes({ root, board, document, harnesses }),
  routeOverlay: { path: routePath, present: true },
  experience,
};
```

- [ ] **Step 6: Run focused routing tests**

```powershell
node --test test/project-routes.test.mjs test/capabilities.test.mjs test/routing-scenarios.test.mjs
```

Expected: PASS; projects without an overlay retain byte-equivalent curated resolutions.

- [ ] **Step 7: Commit live route merging**

```powershell
git add src/project-routes.mjs src/capabilities.mjs test/project-routes.test.mjs test/capabilities.test.mjs test/routing-scenarios.test.mjs
git commit -m "feat: merge live project Skill routes"
```

---

### Task 3: Add Guided Route Customization Without Owning the File

**Files:**
- Create: `src/customize.mjs`
- Create: `test/customize.test.mjs`
- Modify: `src/cli.mjs`
- Modify: `src/terminal-prompts.mjs`
- Modify: `src/manifest.mjs`
- Modify: `src/init.mjs`
- Modify: `src/uninstall.mjs`

- [ ] **Step 1: Write failing CLI and wizard tests**

Cover the safe default and every write boundary:

```js
test('customize recommends alternative and writes only after confirmation', async () => {
  const root = await initializedCoreProject('customize');
  await installFixtureSkill(root, '.agents/skills/to-issues');
  const prompt = scriptedPrompt([
    'to-issues', 'PLAN / planning', 'alternative', 'prd-approved', '', '', true,
  ]);
  const output = await customize({ project: root, dryRun: false, yes: false }, { prompt });
  assert.match(output, /project route.*to-issues/i);
  const routes = YAML.parse(await readFile(path.join(root, '.vibetether/routes.local.yaml'), 'utf8'));
  assert.equal(routes.routes[0].role, 'alternative');
});

test('cancel and dry-run never write routes.local.yaml', async () => {
  const root = await initializedCoreProject('customize-cancel');
  await installFixtureSkill(root, '.agents/skills/to-issues');
  await customize({ project: root, dryRun: true, yes: false }, { prompt: scriptedPrompt([]) });
  assert.equal(await exists(path.join(root, '.vibetether/routes.local.yaml')), false);
  await assert.rejects(
    customize({ project: root, dryRun: false, yes: false }, { prompt: cancellingPrompt() }),
    /cancelled/i,
  );
  assert.equal(await exists(path.join(root, '.vibetether/routes.local.yaml')), false);
});
```

Also test invalid selections, repeated signals, primary-without-signal, existing-file append, duplicate-ID refusal, `--yes` without complete explicit inputs refusal, and no installed project Skills.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test test/customize.test.mjs test/cli-lifecycle.test.mjs
```

Expected: FAIL because the command and module do not exist.

- [ ] **Step 3: Add multi-select prompt support**

Extend the prompt adapter with a bounded comma-separated choice mode:

```js
if (question.multiple === true) {
  const values = answer.split(',').map((value) => value.trim()).filter(Boolean);
  const selected = values.map((value) => selectedChoice(question, value));
  if (selected.length === 0 || selected.some((choice) => choice === null)) {
    output.write(`Choose one or more numbers separated by commas.\n`);
    continue;
  }
  return [...new Set(selected.map((choice) => choice.value))];
}
```

Existing single-choice and text behavior must remain unchanged.

- [ ] **Step 4: Implement the guided customization plan**

Export:

```js
export async function planCustomization(options, dependencies = {}) {
  const root = await resolveProject(options.project);
  const board = await loadCapabilityBoard(root);
  const skills = await listInstalledProjectSkills(root, enabledHarnesses(board.manifest));
  const answer = await collectRouteAnswers({ skills, capabilities: board.board.capabilities }, dependencies.prompt);
  const next = appendValidatedRoute(await readOptionalRoutes(root), answer.route, board.board);
  return { root, target: path.join(root, PROJECT_ROUTES_PATH), original: answer.original, next };
}

export async function customize(options, dependencies = {}) {
  const plan = await planCustomization(options, dependencies);
  if (options.dryRun) return formatCustomizationPreview(plan);
  if (!await dependencies.prompt.confirm(formatCustomizationPreview(plan))) {
    throw new CliError('VibeTether customization cancelled; no files were changed.');
  }
  await writeAtomic(plan.target, YAML.stringify(plan.next, { lineWidth: 0 }));
  await declareProjectRoutes(plan.root, PROJECT_ROUTES_PATH);
  return `VibeTether added the project route to ${PROJECT_ROUTES_PATH}.\n`;
}
```

The preview must show Skill, phase, capability, role, signals, additive outputs, and additive evidence. It must never print hidden file content or a provider catalog path.

- [ ] **Step 5: Wire CLI parsing and help**

Add:

```text
vibetether customize [options]

Customize options:
  --project PATH    Project directory (default: current directory)
  --dry-run         Preview the route without writing
```

Do not support `--yes` until every required route field has a safe explicit CLI equivalent; interactive confirmation remains mandatory in 0.3.0.

- [ ] **Step 6: Preserve the user-owned file across lifecycle commands**

In `init`, validate an existing conventional overlay and set only:

```js
if (routesOriginal !== null) manifest.project_routes = PROJECT_ROUTES_PATH;
else delete manifest.project_routes;
```

Never add the overlay to `textPlans`. In `uninstall`, do not remove or rewrite it; if the manifest is retained, preserve `project_routes`. Add assertions that init, bootstrap, upgrade, and uninstall leave the file bytes unchanged.

- [ ] **Step 7: Run customization and lifecycle tests**

```powershell
node --test test/customize.test.mjs test/cli-lifecycle.test.mjs test/uninstall-transaction.test.mjs test/project-routes.test.mjs
```

Expected: PASS with byte-for-byte overlay preservation.

- [ ] **Step 8: Commit guided customization**

```powershell
git add src/customize.mjs src/cli.mjs src/terminal-prompts.mjs src/manifest.mjs src/init.mjs src/uninstall.mjs test/customize.test.mjs test/cli-lifecycle.test.mjs test/uninstall-transaction.test.mjs
git commit -m "feat: guide project route customization"
```

---

### Task 4: Record Stateful Phase Route Handshakes

**Files:**
- Create: `src/route-handshake.mjs`
- Create: `test/route-handshake.test.mjs`
- Modify: `src/cli.mjs`
- Modify: `src/capabilities.mjs`

- [ ] **Step 1: Write failing route lifecycle tests**

Use the public CLI entry and direct functions:

```js
test('route starts a bounded active handshake with live experience metadata', async () => {
  const root = await initializedProjectWithExperience('route-start');
  const output = JSON.parse(await runRoute({
    project: root,
    phase: 'PLAN',
    capability: 'planning',
    signals: ['prd-approved'],
    agent: 'codex',
    json: true,
  }));
  assert.equal(output.status, 'active');
  assert.equal(output.phase, 'PLAN');
  assert.ok(Array.isArray(output.applicable_experience));
  const state = YAML.parse(await readFile(handshakePath(root), 'utf8'));
  assert.equal(state.status, 'active');
  assert.equal(Object.hasOwn(state, 'reasoning'), false);
});

test('a new phase requires disposition of the active route', async () => {
  const root = await routedProject('PLAN');
  await assert.rejects(
    runRoute({ project: root, phase: 'EXECUTE_ONE', capability: 'plan-execution', signals: [], agent: 'codex' }),
    /complete.*abandon/i,
  );
});
```

Add tests for idempotent same phase/capability refresh, explicit available alternative with required reason, unavailable selection, matching local primary, curated fallback, empty evidence, unsafe artifact, sensitive artifact, `complete`, `abandon`, and absence of credentials/private reasoning fields.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test test/route-handshake.test.mjs test/cli-lifecycle.test.mjs
```

Expected: FAIL because `route` is not a command.

- [ ] **Step 3: Implement route-state parsing and safe persistence**

Create:

```js
export const ROUTE_HANDSHAKE_PATH = '.vibetether/state/route-handshake.yaml';
const FINAL_STATUSES = new Set(['satisfied', 'abandoned']);

export async function startRoute(options) {
  const context = await resolveEffectiveRoute(options);
  const prior = await readOptionalHandshake(context.root);
  if (prior?.status === 'active'
      && (prior.phase !== context.phase || prior.capability !== context.capability)) {
    throw new CliError('Complete or abandon the active route before entering a new phase.', 3);
  }
  const selection = selectRequestedOrRecommended(context, options.select, options.reason);
  const handshake = {
    schema_version: 1,
    phase: context.phase,
    capability: context.capability,
    signals: context.signals,
    recommended_skill: context.recommendation?.skill ?? null,
    selected_skill: selection.skill,
    selection_source: selection.source,
    alternative_reason: selection.reason ?? null,
    route_id: selection.route_id ?? null,
    expected_outputs: context.required_outputs,
    exit_evidence: context.exit_evidence,
    status: 'active',
    updated_at: new Date().toISOString(),
  };
  await writeAtomic(handshakePath(context.root), YAML.stringify(handshake, { lineWidth: 0 }));
  return { ...context, ...handshake };
}
```

Use `isSafeProjectRelativeArtifactPath` and `isSensitiveArtifactPath` for artifact references. Human evidence is trimmed, bounded to 500 characters per item, and stored without raw command output.

- [ ] **Step 4: Implement complete and abandon transitions**

```js
export async function completeRoute({ project, evidence, artifacts }) {
  const state = await requireActiveHandshake(project);
  if (!evidence.length) throw new CliError('Route completion requires at least one evidence description.');
  return writeHandshake(project, {
    ...state,
    status: 'satisfied',
    completion_evidence: evidence,
    artifacts: await validateArtifactPaths(project, artifacts),
    updated_at: new Date().toISOString(),
  });
}

export async function abandonRoute({ project, reason }) {
  const state = await requireActiveHandshake(project);
  if (!reason?.trim()) throw new CliError('Route abandonment requires a material reason.');
  return writeHandshake(project, {
    ...state,
    status: 'abandoned',
    abandonment_reason: reason.trim(),
    updated_at: new Date().toISOString(),
  });
}
```

- [ ] **Step 5: Wire exact CLI syntax**

Support:

```text
vibetether route --project . --phase PLAN --capability planning --signal prd-approved --agent codex [--select SKILL --reason TEXT] [--json]
vibetether route complete --project . --evidence TEXT [--evidence TEXT] [--artifact PATH] [--json]
vibetether route abandon --project . --reason TEXT [--json]
```

Reject `--select` without `--reason`, `--reason` without `--select` on start, an invalid agent, and unknown flags before any state write.

- [ ] **Step 6: Run route lifecycle tests**

```powershell
node --test test/route-handshake.test.mjs test/capabilities.test.mjs test/cli-lifecycle.test.mjs
```

Expected: PASS; `capabilities` remains read-only and only `route` mutates handshake state.

- [ ] **Step 7: Commit phase handshakes**

```powershell
git add src/route-handshake.mjs src/cli.mjs src/capabilities.mjs test/route-handshake.test.mjs test/cli-lifecycle.test.mjs
git commit -m "feat: record phase route handshakes"
```

---

### Task 5: Make Doctor Enforce Route Freshness at Consequential States

**Files:**
- Modify: `src/doctor.mjs`
- Modify: `test/route-handshake.test.mjs`
- Modify: `test/project-routes.test.mjs`
- Modify: `test/cli-lifecycle.test.mjs`

- [ ] **Step 1: Add failing doctor-code tests**

Assert the exact public codes:

```js
const expectedCodes = [
  'missing-route-handshake',
  'stale-route-handshake',
  'selected-skill-unavailable',
  'route-source-missing',
  'ambiguous-local-route',
  'pending-route-exit',
  'route-selection-mismatch',
];

test('completion-like checkpoint requires a satisfied matching route', async () => {
  const root = await initializedCoreProject('doctor-route');
  await setCheckpointPhase(root, 'REVIEW');
  const report = await doctorReport(root);
  assert.ok(report.issues.some((entry) => entry.code === 'missing-route-handshake'));
  await startVerificationRoute(root);
  assert.ok((await doctorReport(root)).issues.some((entry) => entry.code === 'pending-route-exit'));
});
```

Build separate fixtures for removed local route, removed installed Skill, changed recommendation without alternative reason, invalid YAML, and an active older checkpoint phase.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test test/route-handshake.test.mjs test/project-routes.test.mjs test/cli-lifecycle.test.mjs
```

Expected: FAIL because doctor does not inspect the overlay or handshake.

- [ ] **Step 3: Implement route and handshake inspection**

Add a pure collector used by `inspectProject`:

```js
export async function validateRouteControlState({ root, manifest, board, checkpoint, issues, warnings }) {
  const effective = await loadEffectiveBoardForDoctor(root, manifest, board);
  const handshake = await readDoctorHandshake(root);
  const completionLike = COMPLETION_PHASES.has(checkpoint?.phase);
  if (!handshake && completionLike) {
    issues.push(issue('missing-route-handshake', 'Completion-like checkpoint requires a current phase route handshake.'));
    return;
  }
  // Validate state shape, phase/capability freshness, selected availability,
  // route source presence, recommendation equivalence, and required disposition.
}
```

For non-completion legacy checkpoints without handshake state, add one actionable warning rather than inventing historical evidence. For REVIEW/SHIP and any checkpoint that claims a later phase while the handshake is active, emit an issue.

- [ ] **Step 4: Run doctor contracts**

```powershell
node --test test/route-handshake.test.mjs test/project-routes.test.mjs test/cli-lifecycle.test.mjs test/skill-contract.test.mjs
```

Expected: PASS with stable issue codes and one recommended remediation per failure.

- [ ] **Step 5: Commit doctor enforcement**

```powershell
git add src/doctor.mjs test/route-handshake.test.mjs test/project-routes.test.mjs test/cli-lifecycle.test.mjs
git commit -m "feat: diagnose missing phase routes"
```

---

### Task 6: Teach Codex and Claude to Re-enter the Router at Every Phase

**Files:**
- Modify: `src/adapters.mjs`
- Modify: `skills/vibe-tether/SKILL.md`
- Modify: `skills/vibe-tether/references/capability-routing.md`
- Modify: `skills/vibe-tether/references/checkpoint-and-drift.md`
- Modify: `skills/vibe-tether/scripts/resolve-route.mjs`
- Modify: `skills/vibe-tether/scripts/capability-routing.mjs`
- Modify: `skills/vibe-tether/scripts/validate-project.mjs`
- Modify: `test/managed-block.test.mjs`
- Modify: `test/installed-experience-resolver.test.mjs`
- Modify: `test/skill-contract.test.mjs`

- [ ] **Step 1: Add failing managed-instruction and installed-Skill contracts**

Require the canonical managed body and Skill to contain all re-entry triggers and the stateful command:

```js
for (const phrase of [
  'task entry', 'phase transition', 'compaction', 'resume', 'handoff',
  'repeated failure', 'next slice', 'completion', 'merge', 'release', 'publication',
]) {
  assert.match(ADAPTERS.codex.managedBody.toLowerCase(), new RegExp(phrase.replace(' ', '.*')));
}
assert.match(skillSource, /vibetether route --project \. --phase/i);
assert.match(skillSource, /route complete|route abandon/i);
assert.match(skillSource, /routes\.local\.yaml/i);
```

Add installed resolver tests proving a matching project local route and fallback behavior are identical to the package CLI.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test test/managed-block.test.mjs test/installed-experience-resolver.test.mjs test/skill-contract.test.mjs
```

Expected: FAIL on stateful route and local overlay requirements.

- [ ] **Step 3: Replace the managed body with the phase handshake contract**

The new canonical body must say, in bounded prose:

```text
At task entry and every declared re-entry trigger, reload project.yaml, the live
route overlay, applicable truth, checkpoint, and applicable experience. Before a
phase transition, run `vibetether route` for one observable phase/capability,
invoke the selected installed Skill or declared fallback, then record `route
complete` with bounded evidence or `route abandon` with a material reason before
advancing. Project routes are advisory and additive; they cannot weaken authority,
readiness, evidence, high-risk, destructive-data, permission, or release gates.
```

Register the previous canonical body in `LEGACY_MANAGED_BODIES` so `init` upgrades unchanged earlier projects but still rejects user-modified blocks.

- [ ] **Step 4: Update the installed Skill and references**

Make `Start Here` explicitly use the live route command rather than only reading the generated board. Document roles, matching signals, user-owned overlay, selection reasons, handshake disposition, and honest host-dependence. Keep the existing readiness, authority, UI, evidence, and Success Capture Gate text intact.

- [ ] **Step 5: Merge the overlay in the installed offline resolver**

Use the same schema rules as package runtime. To prevent drift, export pure validation and merge functions from `skills/vibe-tether/scripts/capability-routing.mjs` and import them from `src/project-routes.mjs`; the installed script must not import package-only CLI modules. Both surfaces must return the same `selection.source`, outputs, evidence, gates, and availability for the same fixture.

- [ ] **Step 6: Run canonical control tests**

```powershell
node --test test/managed-block.test.mjs test/installed-experience-resolver.test.mjs test/skill-contract.test.mjs test/routing-scenarios.test.mjs
node skills/vibe-tether/scripts/validate-project.mjs --self
```

Expected: PASS with no public Skill leakage or route divergence.

- [ ] **Step 7: Commit phase re-entry controls**

```powershell
git add src/adapters.mjs skills/vibe-tether test/managed-block.test.mjs test/installed-experience-resolver.test.mjs test/skill-contract.test.mjs test/routing-scenarios.test.mjs
git commit -m "feat: re-enter routing at phase boundaries"
```

---

### Task 7: Preserve the Last Known-Good Skill on Windows Locks

**Files:**
- Create: `src/skill-upgrade-recovery.mjs`
- Create: `test/windows-upgrade-recovery.test.mjs`
- Modify: `src/skill-install.mjs`
- Modify: `src/init.mjs`
- Modify: `test/init-transaction.test.mjs`

- [ ] **Step 1: Add injected target-rename and commit-rename `EPERM` tests**

Use a filesystem operations adapter rather than depending on a real host lock:

```js
test('target rename EPERM leaves the old canonical Skill addressable', async () => {
  const fixture = await legacySkillFixture();
  const operations = failingRenameOperations(({ from, to }) => (
    from === fixture.target && to.includes('.previous') ? windowsLockError('EPERM') : null
  ));
  await assert.rejects(
    replaceCanonicalSkill(fixture.request, operations),
    /close.*Codex.*Claude.*rerun/i,
  );
  assert.equal((await inspectVibeTetherIdentity(fixture.target)).state, 'legacy');
  assert.equal((await readPendingManifest(fixture.root)).state, 'waiting-for-host-release');
});

test('replacement commit EPERM preserves verified old and pending new copies', async () => {
  const fixture = await legacySkillFixture();
  const operations = failingSecondCommitRenameOperations(fixture.target);
  await assert.rejects(replaceCanonicalSkill(fixture.request, operations), /rerun/i);
  assert.equal(await canonicalCopyExists(fixture.previous), true);
  assert.equal(await canonicalCopyExists(fixture.pending), true);
});
```

Add assertions that no cleanup deletes `target`, `previous`, or `pending` after these errors and that raw temporary names are absent from the primary user instruction.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test test/windows-upgrade-recovery.test.mjs test/init-transaction.test.mjs
```

Expected: FAIL because the current inner and outer recovery can remove the target and has no pending manifest.

- [ ] **Step 3: Implement verified transaction records and staged copies**

Create this schema under `.vibetether/transaction/skill-upgrade-<harness>.yaml`:

```js
const transaction = {
  schema_version: 1,
  harness: request.harness,
  target: request.relativePath,
  previous: {
    identity: request.previousIdentity,
    path: request.previousPath,
  },
  replacement: {
    identity: request.replacementIdentity,
    path: request.pendingPath,
  },
  state: 'prepared',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
```

Write it atomically only after both copied trees pass canonical identity verification. Reject linked paths, unknown fingerprints, target mismatch, peer mismatch, and sensitive path components.

- [ ] **Step 4: Implement non-destructive replacement ordering**

Use:

```js
export async function replaceCanonicalSkill(request, operations = defaultOperations) {
  const transaction = await prepareSkillUpgrade(request, operations);
  try {
    await operations.rename(request.target, transaction.previous.path);
  } catch (error) {
    if (isWindowsLock(error)) return deferUpgrade(transaction, request, operations);
    throw error;
  }
  try {
    await operations.rename(transaction.replacement.path, request.target);
  } catch (error) {
    const restored = await restorePreviousWithoutDeletion(transaction, request, operations);
    if (isWindowsLock(error) || !restored) return deferUpgrade(transaction, request, operations);
    throw error;
  }
  await markAppliedAndCleanup(transaction, operations);
}
```

`restorePreviousWithoutDeletion` may rename the old copy back only when the target is absent; it must never `rm(target)` after an inner failure. `deferUpgrade` preserves every verified copy, sets `waiting-for-host-release`, and throws one controlled close-and-rerun instruction.

- [ ] **Step 5: Remove blind outer rollback**

Change `applyInitialization` so core Skill replacement is one transaction-owned operation. The outer layer may roll back text files and previously completed independent plans, but it must not remove or rename a target managed by a pending Skill transaction. Return a structured result:

```js
{ status: 'installed' | 'unchanged' | 'deferred', transactionPath, cleanupWarnings }
```

Stop the initialization loop immediately on `deferred` before provider exposures or later text commits advance.

- [ ] **Step 6: Run focused Windows transaction tests**

```powershell
node --test test/windows-upgrade-recovery.test.mjs test/init-transaction.test.mjs test/vibetether-upgrade.test.mjs
```

Expected: PASS; every injected lock retains at least one verified old copy and one verified replacement copy.

- [ ] **Step 7: Commit non-destructive upgrades**

```powershell
git add src/skill-upgrade-recovery.mjs src/skill-install.mjs src/init.mjs test/windows-upgrade-recovery.test.mjs test/init-transaction.test.mjs
git commit -m "fix: defer locked Windows Skill upgrades"
```

---

### Task 8: Recover Pending and Legacy Missing-Skill States Before Network Work

**Files:**
- Modify: `src/skill-upgrade-recovery.mjs`
- Modify: `src/init.mjs`
- Modify: `src/doctor.mjs`
- Modify: `test/windows-upgrade-recovery.test.mjs`
- Modify: `test/provider-init.test.mjs`

- [ ] **Step 1: Add failing next-run and legacy-orphan tests**

Cover exact authority order:

```js
test('released lock resumes a verified pending replacement before provider fetch', async () => {
  const fixture = await deferredUpgradeFixture();
  let fetches = 0;
  const result = await initialize(fixture.options, {
    stageProviders: async () => { fetches += 1; return emptyProviderStage(); },
  });
  assert.equal((await inspectVibeTetherIdentity(fixture.target)).state, 'current');
  assert.equal(fetches, 0);
  assert.equal(await pendingManifestExists(fixture.root), false);
  assert.match(result, /recovered.*initialized/i);
});

test('legacy orphan chooses only an exact enabled peer-harness identity', async () => {
  const fixture = await missingCodexWithTwoLegacyCopies();
  await installPeerClaudeIdentity(fixture.root, fixture.authoritativeFingerprint);
  const plan = await inspectSkillRecovery(fixture.root, 'codex');
  assert.equal(plan.kind, 'recoverable-missing-skill');
  assert.equal(plan.sourceIdentity, fixture.authoritativeFingerprint);
});
```

Add tests for one verified candidate, multiple candidates with no peer match, modified candidates, symlinked candidates, timestamp inversion, still-locked retry, and exact cache reuse.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test test/windows-upgrade-recovery.test.mjs test/provider-init.test.mjs
```

Expected: FAIL because initialization inspects providers before recovery and missing targets have no canonical recovery authority.

- [ ] **Step 3: Implement recovery inspection before initialization planning**

Export:

```js
export async function recoverSkillUpgrades({ root, adapters, compatibility, operations }) {
  const reports = [];
  for (const adapter of adapters) {
    reports.push(await recoverPendingManifest(root, adapter, compatibility, operations));
    reports.push(await recoverLegacyOrphan(root, adapter, compatibility, operations));
  }
  return reports.filter(Boolean);
}
```

Call it immediately after resolving `root` and adapter selection, before registry loading, provider planning, provider staging, or text writes.

- [ ] **Step 4: Implement safe legacy candidate authority**

Search only direct `.previous` transaction directories registered by the VibeTether transaction namespace. Fingerprint them with `inspectVibeTetherIdentity`. Selection order is:

1. exact candidate named by a valid transaction manifest;
2. one registered canonical candidate when there is only one;
3. exact identity match to the enabled peer harness when multiple candidates exist;
4. stop with `ambiguous-recovery` and display numbered safe choices.

Never select by timestamp. Never restore `unknown`. Never traverse a link.

- [ ] **Step 5: Add doctor recovery codes**

Doctor must classify:

```text
pending-skill-upgrade
recoverable-missing-skill
ambiguous-recovery
unrecoverable-skill-state
```

Pending and recoverable states include one recommended close/rerun or rerun action. Ambiguous and unrecoverable states are issues. A known-good active target plus pending replacement is a warning unless a completion-like release claim is made.

- [ ] **Step 6: Run recovery and provider-order tests**

```powershell
node --test test/windows-upgrade-recovery.test.mjs test/provider-init.test.mjs test/vibetether-upgrade.test.mjs test/cli-lifecycle.test.mjs
```

Expected: PASS; recovery completes or stops before any provider fetch.

- [ ] **Step 7: Commit resumable recovery**

```powershell
git add src/skill-upgrade-recovery.mjs src/init.mjs src/doctor.mjs test/windows-upgrade-recovery.test.mjs test/provider-init.test.mjs test/cli-lifecycle.test.mjs
git commit -m "fix: recover interrupted Skill upgrades"
```

---

### Task 9: Add Routing and Recovery Evaluation Scenarios

**Files:**
- Modify: `evals/scenarios.json`
- Modify: `evals/run-static-evals.mjs`
- Modify: `test/evals.test.mjs`
- Modify: `test/routing-scenarios.test.mjs`

- [ ] **Step 1: Add failing scenario contracts**

Add scenarios with observable expected actions:

```json
{
  "id": "phase-plan-after-approved-design",
  "phase": "PLAN",
  "capability": "planning",
  "signals": ["design-approved"],
  "must": ["route-handshake", "writing-plans", "project-truth"],
  "must_not": ["start-implementation", "invent-requirements"]
}
```

Include: vague greenfield request routes to clarification; approved PRD with local `to-issues`; local primary absent falls back; compaction forces re-entry; active PLAN route blocks EXECUTE_ONE; satisfied VERIFY permits REVIEW; first-proven deployment triggers capture; unchanged proven path avoids duplication; Windows lock defers; missing Skill with peer identity recovers; release ambiguity asks the user.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test test/evals.test.mjs test/routing-scenarios.test.mjs
npm run eval
```

Expected: FAIL until the evaluator recognizes route-handshake and project-local selection evidence.

- [ ] **Step 3: Extend deterministic evaluation output**

Score only inspectable behavior: selected route, source, readiness verdict, confirmation gate, handshake state, required outputs/evidence, experience disposition, and recovery class. Do not score hidden reasoning or claim an empirical host invocation probability.

- [ ] **Step 4: Run evaluation tests**

```powershell
node --test test/evals.test.mjs test/routing-scenarios.test.mjs
npm run eval
```

Expected: PASS with all new scenarios and unchanged earlier scenario results.

- [ ] **Step 5: Commit scenario coverage**

```powershell
git add evals test/evals.test.mjs test/routing-scenarios.test.mjs
git commit -m "test: cover long-task route re-entry"
```

---

### Task 10: Rewrite the README and Move Reference Detail into Focused Docs

**Files:**
- Modify: `README.md`
- Create: `docs/installation.md`
- Create: `docs/routing.md`
- Create: `docs/proven-paths.md`
- Create: `docs/providers.md`
- Create: `docs/troubleshooting.md`
- Modify: `docs/operations/windows-skill-lifecycle.md`
- Modify: `test/public-release.test.mjs`

- [ ] **Step 1: Add failing landing-page and documentation contracts**

Require the approved hook, reliable command, story, real route example, custom route, limits, and links:

```js
assert.match(readme, /Long tasks drift\. Skills get forgotten\. Proven fixes disappear\./);
assert.match(readme, /keeps coding agents anchored to project truth/i);
assert.match(readme, /codeload\.github\.com\/t01089572455\/vibetether\/tar\.gz\/refs\/heads\/main/);
assert.match(readme, /why i built this/i);
assert.match(readme, /grilling[\s\S]*brainstorming[\s\S]*writing-plans[\s\S]*test-driven-development[\s\S]*verification-before-completion/i);
assert.match(readme, /vibetether customize --project \./i);
assert.match(readme, /routes\.local\.yaml/i);
assert.match(readme, /cannot force|host.*must honor/i);
assert.doesNotMatch(readme, /guarantee.*zero drift|proven.*token savings|saves? tokens/i);
for (const file of ['installation.md', 'routing.md', 'proven-paths.md', 'providers.md', 'troubleshooting.md']) {
  assert.match(readme, new RegExp(`docs/${file.replace('.', '\\.').replace('-', '\\-')}`));
}
```

Add a length/structure test that keeps the landing page below 420 non-empty lines and requires provider inventory tables to live in `docs/providers.md` rather than the main README.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test test/public-release.test.mjs
```

Expected: FAIL on the new hook, custom routing, stateful route, and concise-structure contracts.

- [ ] **Step 3: Rewrite the top-level README in the approved order**

Use this opening verbatim:

```markdown
# VibeTether

> Long tasks drift. Skills get forgotten. Proven fixes disappear.

VibeTether keeps coding agents anchored to project truth, routes each phase to
the right Skill, and recalls workflows that already worked.
```

Place the Codeload install command before conceptual detail. Follow with a short authentic `Why I built this` paragraph, a 30-second phase example, a compact feature grid, one control-loop diagram, customization command/YAML, honest limits, and reference links.

Retain the approved positioning that VibeTether is designed for stronger agents such as Claude Fable 5 and GPT-5.6, specifically to reduce long-task drift and expensive rework. Keep this as a design goal, not a compatibility guarantee or measured Token-savings claim. Explain that `init` gives a new directory its first durable intent, project-truth index, managed agent instructions, capability board, checkpoint, and experience index instead of asking a beginner to author those control files manually.

- [ ] **Step 4: Write focused reference documents**

Move and update, without losing contract detail:

- installation profiles/bundles/network/update guidance into `docs/installation.md`;
- effective board, local roles/signals, handshake commands, and examples into `docs/routing.md`;
- first-proven/recovered/changed/repeat classification into `docs/proven-paths.md`;
- complete curated inventory, pinning, licenses, and exposure rules into `docs/providers.md`;
- TLS, provider cache, lock release, pending state, recovery codes, and commands into `docs/troubleshooting.md`.

Every command must use either `vibetether` after installation or the exact public Codeload package command. Avoid the unreliable `github:` shorthand as the primary path.

- [ ] **Step 5: Update the Windows Proven Path**

Record the reproduced failure signature, non-destructive deferred state, required host close, same-command rerun, doctor codes, peer-harness legacy recovery, and the limitation that the currently running host cannot replace its own open Skill directory.

- [ ] **Step 6: Run documentation contracts and link checks**

```powershell
node --test test/public-release.test.mjs test/skill-contract.test.mjs
node skills/vibe-tether/scripts/validate-project.mjs --self
```

Expected: PASS; the README is concise, no local absolute paths or secrets appear, and every linked document exists.

- [ ] **Step 7: Commit the product documentation**

```powershell
git add README.md docs test/public-release.test.mjs
git commit -m "docs: explain beginner-first drift control"
```

---

### Task 11: Register and Package VibeTether 0.3.0

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `registry/vibetether-releases.json`
- Modify: `scripts/verify-release-history.mjs`
- Modify: `test/public-release.test.mjs`
- Modify: `test/skill-contract.test.mjs`

- [ ] **Step 1: Add failing version, package, and history tests**

Require version `0.3.0`, every new runtime module, and the exact prior 0.2.3 public identity:

```js
assert.equal(pkg.version, '0.3.0');
assert.ok(registry.history.some((entry) => (
  entry.version === '0.2.3'
  && entry.commit === '56ea83e8e0feb7a086eff8e792225b418b41137b'
  && entry.fingerprint === '047f54c493f2ff17443f0c891f7b2f88e2bae67466a021bf30df321c5a7db5a2'
)));
for (const file of ['src/project-routes.mjs', 'src/customize.mjs', 'src/route-handshake.mjs', 'src/skill-upgrade-recovery.mjs']) {
  assert.ok(packFiles.includes(file));
}
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --test test/public-release.test.mjs test/skill-contract.test.mjs
```

Expected: FAIL because the package and release registry still declare 0.2.3.

- [ ] **Step 3: Update version and compatibility history**

Set both package files to `0.3.0`. Add the exact 0.2.3 release record above to history. Extend `package.json.files` from `docs/operations` to the focused public documentation paths so `docs/installation.md`, `docs/routing.md`, `docs/proven-paths.md`, `docs/providers.md`, and `docs/troubleshooting.md` are present in the npm tarball. After all canonical Skill edits are final, compute `portableSkillFingerprint(sourceSkill)` and write that exact hash into `registry.current.fingerprint`. Do not guess or copy a raw directory hash.

- [ ] **Step 4: Verify package and release history**

```powershell
npm run audit:release
npm pack --dry-run
node --test test/public-release.test.mjs test/skill-contract.test.mjs test/vibetether-upgrade.test.mjs
```

Expected: PASS; the tarball contains all runtime, Skill, registry, and focused documentation files and no scratch state.

- [ ] **Step 5: Commit release metadata**

```powershell
git add package.json package-lock.json registry/vibetether-releases.json scripts/verify-release-history.mjs test/public-release.test.mjs test/skill-contract.test.mjs
git commit -m "chore: prepare vibetether 0.3.0"
```

---

### Task 12: Full Verification, Disposable Windows Acceptance, Review, and Publication

**Files:**
- Modify when fresh evidence adds durable facts: `docs/operations/windows-skill-lifecycle.md`
- Modify when acceptance changes the tour: `scripts/manual-acceptance-tour.mjs`
- Update outside repository: `D:/python_workspace/gyws/.scratch/vibetether-routing-extensibility/AGENT_DELIVERY.md`
- Update outside repository: `D:/python_workspace/gyws/.vibetether/state/current.yaml`

- [ ] **Step 1: Run the complete local gate**

```powershell
npm run check
npm run acceptance:tour
npm pack --dry-run
git diff --check main...HEAD
git status --short
```

Expected: zero unit, contract, eval, release-audit, self-validation, acceptance, packaging, or whitespace failures.

- [ ] **Step 2: Run a clean local core acceptance**

In a disposable directory, run the local CLI:

```powershell
node bin/vibetether.mjs init --project $coreProject --agent both --profile core --no-auto-bundles --yes
node bin/vibetether.mjs doctor --project $coreProject --json
node bin/vibetether.mjs capabilities --project $coreProject
```

Expected: both harnesses initialize, doctor is healthy before a completion-like checkpoint, and the dashboard exposes readiness, routes, Skills, fallbacks, outputs, and evidence.

- [ ] **Step 3: Run custom-route and phase-handshake acceptance**

Install a fixture project Skill, use the guided customizer, then run:

```powershell
node bin/vibetether.mjs route --project $routeProject --phase PLAN --capability planning --signal prd-approved --agent codex --json
node bin/vibetether.mjs route complete --project $routeProject --evidence "Focused planning contract exited 0" --artifact test/planning.test.mjs --json
node bin/vibetether.mjs doctor --project $routeProject --json
```

Expected: selected source is `project-local`, base and additive evidence remain present, route becomes `satisfied`, and doctor reports no route issue.

- [ ] **Step 4: Run disposable locked-upgrade acceptance on Windows**

Use a child process that opens a directory handle in a disposable legacy Skill fixture. Run `init` and verify: controlled deferred exit, old identity remains verifiable, pending new identity remains verifiable, and no provider fetch occurs. End only that disposable child process, rerun the same `init`, and verify current identity plus removal of pending state. Do not stop Codex, Claude, editors, antivirus, or unrelated user processes.

- [ ] **Step 5: Reproduce the gyws legacy-orphan shape in a disposable fixture**

Create two registered canonical transaction copies, remove the Codex target, and install one exact peer identity under Claude. Verify the resolver selects the peer-matching copy even when it has the older timestamp. Remove the peer and verify `ambiguous-recovery` instead of timestamp selection.

- [ ] **Step 6: Run a separated final review**

Review the approved spec, this plan, final diff, raw test output, package listing, route artifacts, and recovery manifests. Check for missing requirements, base-contract weakening, overlay ownership violations, router divergence, unsafe artifact persistence, destructive recovery, provider regression, README overclaim, and release blockers. Record the limitation that this is a separated self-review unless an authorized independent reviewer is available.

- [ ] **Step 7: Run Success Capture Gate and validate delivery controls**

Classify the verified Windows recovery as a `recovered-path` and update the runbook only when the new sequence is proven. Record `captured`, `already-encoded`, or `not-reusable` plus public artifact paths in the outer checkpoint. Then run:

```powershell
python D:/python_workspace/gyws/.agents/skills/gyws-controlled-delivery/scripts/validate_delivery_packet.py D:/python_workspace/gyws/.scratch/vibetether-routing-extensibility/AGENT_DELIVERY.md
node D:/python_workspace/gyws/.claude/skills/vibe-tether/scripts/validate-project.mjs --project D:/python_workspace/gyws
```

Expected: both validators pass with no pending experience disposition. The Claude-installed validator is used only because the active gyws Codex Skill directory is the known recoverable missing target.

- [ ] **Step 8: Integrate into local main and push**

After `RELEASE_READY`, merge `codex/readme-routing-extensibility` into local `main` without rewriting history, rerun the focused release gate on `main`, and push `main` to `origin`. Verify Git reports the new remote commit before claiming publication.

- [ ] **Step 9: Run the final public GitHub tarball acceptance**

With a fresh project and project-local npm cache:

```powershell
$env:npm_config_cache = Join-Path $publishedProject '.npm-cache'
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether init --project $publishedProject --agent both --profile extended --bundle web --bundle production --yes
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether route --project $publishedProject --phase DISCOVER --capability requirements-clarification --signal goal-unclear --agent codex --json
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether doctor --project $publishedProject --json
```

Expected: package acquisition bypasses local Git/SSH, provider installation succeeds or uses exact verified cache according to documented networking behavior, route output is current, and doctor has no unresolved health issue.

- [ ] **Step 10: Recover the real gyws installation only after host release**

Do not attempt live self-replacement from the Codex session holding the project. After publication, tell the user to close Codex and Claude sessions using `D:/python_workspace/gyws`, rerun the same public `init` command once, and then run `doctor`. Treat the remote disposable recovery evidence as release proof and the real workspace rerun as host-release confirmation.

- [ ] **Step 11: Mark verified delivery from remote evidence only**

Record the exact pushed commit, CI matrix result, public tarball output, custom-route/handshake evidence, Windows deferred/recovery evidence, remaining host-dependent limitations, and final experience disposition. Only then claim `VERIFIED_DELIVERY`.
