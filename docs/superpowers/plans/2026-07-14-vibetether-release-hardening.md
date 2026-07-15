# VibeTether 0.2.3 Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish VibeTether 0.2.3 with safe upgrades from registered canonical releases, consistent lifecycle identity checks, beginner-guided initialization choices, resilient pinned-provider installation, and fresh proof that all existing control capabilities remain intact.

**Architecture:** Keep raw provider fingerprints unchanged, add a package-shipped canonical VibeTether release registry, and centralize portable core-Skill identity in `src/skill-install.mjs`. Every lifecycle command consumes that one identity result. Interactive prompts gain declarative numbered choices while project-specific goal and success answers remain guided user-owned text. Provider staging reuses only exact lock-and-fingerprint-verified catalog copies and applies bounded retries to transient pinned Git fetches.

**Tech Stack:** Node.js 20+ ESM, `node:test`, Git object commands for release fixtures, YAML, JSON registries, Markdown, GitHub Actions on Windows and Ubuntu.

---

## File Map

### New files

- `registry/vibetether-releases.json`: audited current and historical canonical core-Skill fingerprints.
- `scripts/verify-release-history.mjs`: materializes canonical Skill trees from Git objects and verifies the registry with the production portable fingerprint implementation.
- `test/vibetether-upgrade.test.mjs`: exact 0.2.1 lifecycle, CRLF portability, customization refusal, and dual-harness upgrade matrix.

### Modified runtime files

- `src/skill-install.mjs`: registry loading, raw and portable fingerprints, centralized VibeTether identity, and install inspection.
- `src/bootstrap-authority.mjs`: use centralized identity for enabled harnesses.
- `src/managed-project-state.mjs`: use centralized identity for managed-state recognition while keeping providers raw.
- `src/doctor.mjs`: accept registered canonical legacy copies with an upgrade warning and reject unknown copies.
- `src/uninstall.mjs`: use centralized identity before quarantine.
- `src/terminal-prompts.mjs`: render and validate numbered choices, guided text, custom follow-ups, and explicit confirmation choices.
- `src/bootstrap-model.mjs`: declare examples and optional safe/custom/none choices for direction questions.
- `src/bootstrap.mjs`: declare harness/profile choices without embedding terminal presentation.
- `src/provider-fetch.mjs`: classify transient Git transport failures, switch Schannel to OpenSSL, and retry a bounded number of times.
- `src/provider-cache.mjs`: reconstruct a trusted local staging result from exact catalog, lock, and license evidence and fetch only unresolved pinned sources.
- `src/init.mjs`: consume verified local provider staging before remote staging.

### Modified verification and release files

- `test/bootstrap-cli.test.mjs`: terminal choice, required-text retry, custom option, invalid-choice, and cancellation contracts.
- `test/skill-contract.test.mjs`: compatibility-registry and current-Skill contract assertions.
- `test/provider-lifecycle.test.mjs`: remove mutable synthetic legacy-set behavior in favor of central identity behavior.
- `test/provider-init.test.mjs`: bootstrap authority accepts registered canonical history and rejects a changed legacy copy.
- `test/provider-fetch.test.mjs`: exact TLS EOF recovery, Schannel transition, bounded retry, and non-transient failure contracts.
- `test/public-release.test.mjs`: README, audit command, CI full-history, version, and honest-capability promises.
- `.github/workflows/ci.yml`: full Git history for compatibility verification.
- `package.json` and `package-lock.json`: version 0.2.3 and release-audit command.
- `README.md`: update path, beginner choices, compatibility contract, and capability limits.
- `docs/operations/windows-skill-lifecycle.md`: normal legacy update and line-ending behavior.
- `docs/superpowers/specs/2026-07-14-vibetether-release-hardening-design.md`: retain the approved interaction amendment.

### External control artifacts, never committed to the public package

- `../vibetether-release-hardening/AGENT_DELIVERY.md`: delivery status and raw evidence.
- outer `.vibetether/state/current.yaml`: phase, evidence, selected route, and success-capture disposition.

---

### Task 1: Register the Exact Prior Public Release

**Files:**
- Create: `registry/vibetether-releases.json`
- Modify: `src/skill-install.mjs:1-60`
- Modify: `test/skill-contract.test.mjs:1-105`

- [ ] **Step 1: Write the failing compatibility-registry contract**

Replace the literal 0.1-only assertion with a test that requires the exact 0.2.1 fingerprint and current package contract:

```js
import {
  LEGACY_VIBETETHER_FINGERPRINTS,
  VIBETETHER_RELEASE_COMPATIBILITY,
  portableSkillFingerprint,
  sourceSkill,
} from '../src/skill-install.mjs';

test('the compatibility registry includes the exact public 0.2.1 Skill', async () => {
  assert.equal(
    LEGACY_VIBETETHER_FINGERPRINTS.has('2488d70f4a07bd5df8267c0baa15439f9463868778fd837d2d11134c2209f3df'),
    true,
  );
  assert.equal(VIBETETHER_RELEASE_COMPATIBILITY.current.version, '0.2.3');
  assert.equal(
    VIBETETHER_RELEASE_COMPATIBILITY.current.fingerprint,
    await portableSkillFingerprint(sourceSkill),
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test test/skill-contract.test.mjs
```

Expected: FAIL because `VIBETETHER_RELEASE_COMPATIBILITY` and `portableSkillFingerprint` do not exist and 0.2.1 is absent from the allowlist.

- [ ] **Step 3: Add the structured compatibility registry**

Create `registry/vibetether-releases.json` with this schema and reviewed canonical history:

```json
{
  "schema_version": 1,
  "current": {
    "version": "0.2.3",
    "fingerprint": "047f54c493f2ff17443f0c891f7b2f88e2bae67466a021bf30df321c5a7db5a2"
  },
  "history": [
    {
      "id": "v0.1.0",
      "version": "0.1.0",
      "commit": "cbfe55a935d8b4d593aa14e0f98deaabd17f25b6",
      "fingerprint": "07e14f9aae4f66ed8baed16893f35a5730b9702174f72a04bf61dd5df45ca89d"
    },
    {
      "id": "v0.2.0-routing",
      "version": "0.2.0",
      "commit": "02b71ab295e633908710d9e80153f550c406b96a",
      "fingerprint": "80cfe6c12fc583cc7788e60e5090603a88cdabfd7d1df45cfcbef45f67688bef"
    },
    {
      "id": "v0.2.0-readiness",
      "version": "0.2.0",
      "commit": "b4e6fe96250f22aa4315a30ce11bdbc84df0fe7b",
      "fingerprint": "182c098aeb578bc36601157e8e07cfc96a864cf7046569b80cd178ba0dedcf7a"
    },
    {
      "id": "v0.2.0-scenarios",
      "version": "0.2.0",
      "commit": "baac2854b5b7ec65f2a03df51a08e9ec99e7ca5e",
      "fingerprint": "321086f1ca2e4f2204891d701114727a969b930459d7a3b960711fb7f3497fe4"
    },
    {
      "id": "v0.2.1",
      "version": "0.2.1",
      "commit": "1f6444567873b5d1abd3371c45df19db23054ec9",
      "fingerprint": "2488d70f4a07bd5df8267c0baa15439f9463868778fd837d2d11134c2209f3df"
    }
  ]
}
```

These full hashes were verified with `git rev-parse cbfe55a 02b71ab b4e6fe9 baac285 1f64445` before implementation.

- [ ] **Step 4: Load and validate the registry in the core installer**

In `src/skill-install.mjs`, load JSON synchronously at module initialization so all lifecycle commands use the same immutable package contract:

```js
import { readFileSync } from 'node:fs';

const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

function loadReleaseCompatibility() {
  const target = path.join(packageRoot, 'registry', 'vibetether-releases.json');
  let value;
  try {
    value = JSON.parse(readFileSync(target, 'utf8'));
  } catch {
    throw new Error('The packaged VibeTether release compatibility registry is invalid.');
  }
  const validCurrent = value?.schema_version === 1
    && typeof value.current?.version === 'string'
    && HASH.test(value.current?.fingerprint ?? '');
  const validHistory = Array.isArray(value?.history)
    && value.history.every((entry) => (
      typeof entry?.id === 'string'
      && typeof entry?.version === 'string'
      && COMMIT.test(entry?.commit ?? '')
      && HASH.test(entry?.fingerprint ?? '')
    ));
  if (!validCurrent || !validHistory) {
    throw new Error('The packaged VibeTether release compatibility registry is invalid.');
  }
  const ids = new Set(value.history.map((entry) => entry.id));
  const fingerprints = new Set(value.history.map((entry) => entry.fingerprint));
  if (ids.size !== value.history.length || fingerprints.size !== value.history.length) {
    throw new Error('The packaged VibeTether release compatibility registry contains duplicates.');
  }
  return Object.freeze({
    schema_version: value.schema_version,
    current: Object.freeze({ ...value.current }),
    history: Object.freeze(value.history.map((entry) => Object.freeze({ ...entry }))),
  });
}

export const VIBETETHER_RELEASE_COMPATIBILITY = loadReleaseCompatibility();
export const LEGACY_VIBETETHER_FINGERPRINTS = new Set(
  VIBETETHER_RELEASE_COMPATIBILITY.history.map((entry) => entry.fingerprint),
);
```

- [ ] **Step 5: Run the focused test**

Run:

```powershell
node --test test/skill-contract.test.mjs
```

Expected: still FAIL only because portable fingerprint support is not implemented yet.

---

### Task 2: Add Portable and Centralized VibeTether Identity

**Files:**
- Modify: `src/skill-install.mjs:14-60`
- Modify: `test/provider-install.test.mjs`
- Modify: `test/skill-contract.test.mjs`

- [ ] **Step 1: Add failing portable-identity tests**

Add tests that copy a canonical Skill, convert every valid UTF-8 text file from LF to CRLF, and prove portable equality while raw equality changes:

```js
async function convertTreeToCrlf(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await convertTreeToCrlf(target);
      continue;
    }
    const bytes = await readFile(target);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) continue;
    await writeFile(target, text.replace(/(?<!\r)\n/g, '\r\n'));
  }
}

test('portable core fingerprints ignore CRLF while raw provider fingerprints remain strict', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vibetether-crlf-'));
  await cp(sourceSkill, target, { recursive: true });
  await convertTreeToCrlf(target);
  assert.notEqual(await skillFingerprint(target), await skillFingerprint(sourceSkill));
  assert.equal(await portableSkillFingerprint(target), await portableSkillFingerprint(sourceSkill));
});
```

Add a second test that appends one visible byte after CRLF conversion and expects state `unknown`.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --test test/provider-install.test.mjs test/skill-contract.test.mjs
```

Expected: FAIL because portable identity is missing.

- [ ] **Step 3: Implement portable content normalization without weakening raw fingerprints**

Refactor the fingerprint traversal to accept an option:

```js
function portableFileBytes(bytes) {
  if (bytes.includes(0)) return bytes;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return bytes;
  return Buffer.from(text.replaceAll('\r\n', '\n'), 'utf8');
}

async function fingerprintEntry(root, relativePath, hash, { portable = false } = {}) {
  const target = path.join(root, relativePath);
  const entry = await lstat(target);
  if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported in installed Skills: ${relativePath}`);
  if (entry.isDirectory()) {
    hash.update(`directory:${relativePath.replaceAll('\\', '/')}\n`);
    const children = (await readdir(target)).sort();
    for (const child of children) {
      await fingerprintEntry(root, path.join(relativePath, child), hash, { portable });
    }
    return;
  }
  hash.update(`file:${relativePath.replaceAll('\\', '/')}\n`);
  const bytes = await readFile(target);
  hash.update(portable ? portableFileBytes(bytes) : bytes);
}

async function directoryFingerprint(root, options) {
  const hash = createHash('sha256');
  await fingerprintEntry(root, '', hash, options);
  return hash.digest('hex');
}

export function skillFingerprint(root) {
  return directoryFingerprint(root, { portable: false });
}

export function portableSkillFingerprint(root) {
  return directoryFingerprint(root, { portable: true });
}
```

- [ ] **Step 4: Implement one identity result**

Add:

```js
export async function inspectVibeTetherIdentity(target) {
  const [canonical, installed] = await Promise.all([
    portableSkillFingerprint(sourceSkill),
    portableSkillFingerprint(target),
  ]);
  if (canonical !== VIBETETHER_RELEASE_COMPATIBILITY.current.fingerprint) {
    throw new CliError('The packaged VibeTether Skill does not match its release compatibility registry.', 3);
  }
  const state = installed === canonical
    ? 'current'
    : LEGACY_VIBETETHER_FINGERPRINTS.has(installed) ? 'legacy' : 'unknown';
  return { state, canonical, installed };
}
```

Rewrite `inspectVibeTetherInstall` directly around this result. Missing targets return a new managed install, current targets remain unchanged, legacy targets are replaced, and unknown targets retain the existing refusal:

```js
export async function inspectVibeTetherInstall(target, relativePath) {
  try {
    const identity = await inspectVibeTetherIdentity(target);
    if (identity.state === 'current') return { needsInstall: false, ownership: 'preexisting' };
    if (identity.state === 'legacy') {
      return { needsInstall: true, ownership: 'vibetether', replacesExisting: true };
    }
    throw new CliError(`Refusing to overwrite different or modified installed Skill at ${relativePath}. Back up or remove it first.`, 3);
  } catch (error) {
    if (error.code === 'ENOENT') return { needsInstall: true, ownership: 'vibetether' };
    if (error instanceof CliError) throw error;
    throw new CliError(`Cannot verify installed Skill at ${relativePath}: ${error.message}`, 3);
  }
}
```

Keep `inspectDirectoryInstall` and all provider call sites on `skillFingerprint`.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
node --test test/provider-install.test.mjs test/skill-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the registry and identity slice**

```powershell
git add registry/vibetether-releases.json src/skill-install.mjs test/provider-install.test.mjs test/skill-contract.test.mjs
git commit -m "fix: register portable release identities"
```

---

### Task 3: Make Every Lifecycle Command Use the Same Identity

**Files:**
- Create: `scripts/verify-release-history.mjs`
- Create: `test/vibetether-upgrade.test.mjs`
- Modify: `src/bootstrap-authority.mjs:1-155`
- Modify: `src/managed-project-state.mjs:1-245`
- Modify: `src/doctor.mjs:315-330`
- Modify: `src/uninstall.mjs:17-143`
- Modify: `test/provider-init.test.mjs:659-703`
- Modify: `test/provider-lifecycle.test.mjs:178-190`

- [ ] **Step 1: Add a Git-object fixture helper**

In `scripts/verify-release-history.mjs`, export a safe materializer that never modifies the worktree:

```js
export async function materializeSkillAtCommit(repository, commit, destination) {
  const listing = git(repository, ['ls-tree', '-rz', '--full-tree', commit, '--', 'skills/vibe-tether']);
  const records = listing.toString('utf8').split('\0').filter(Boolean);
  if (records.length === 0) throw new Error(`No VibeTether Skill tree exists at ${commit}.`);
  for (const record of records) {
    const tab = record.indexOf('\t');
    const [mode, type, object] = record.slice(0, tab).split(' ');
    const sourcePath = record.slice(tab + 1);
    if (type !== 'blob' || mode === '120000') throw new Error(`Unsupported historical Skill entry at ${commit}.`);
    const prefix = 'skills/vibe-tether/';
    if (!sourcePath.startsWith(prefix)) throw new Error(`Unexpected historical Skill path at ${commit}.`);
    const relativePath = sourcePath.slice(prefix.length);
    const target = path.join(destination, ...relativePath.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, git(repository, ['cat-file', 'blob', object]));
  }
}
```

The local `git()` wrapper must use `spawnSync`, pass argument arrays, reject nonzero status with a neutral message, and return `stdout` as a `Buffer`.

- [ ] **Step 2: Write the exact 0.2.1 RED lifecycle matrix**

Create a test helper that initializes a current core project, removes only the managed core Skill directory, and materializes commit `1f6444567873b5d1abd3371c45df19db23054ec9` in its place. Tests must cover:

```js
test('an exact public 0.2.1 project previews and upgrades both harnesses', async () => {
  const target = await legacyProject('both');
  const before = await snapshotProject(target);
  const preview = runCli(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--dry-run']);
  assert.equal(preview.status, 0, preview.stderr || preview.stdout);
  assert.deepEqual(await snapshotProject(target), before);

  const applied = runCli(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']);
  assert.equal(applied.status, 0, applied.stderr || applied.stdout);
  for (const relativePath of ['.agents/skills/vibe-tether', '.claude/skills/vibe-tether']) {
    assert.equal((await inspectVibeTetherIdentity(path.join(target, relativePath))).state, 'current');
  }
});

test('doctor and bootstrap accept exact registered history but reject a changed legacy copy', async () => {
  const target = await legacyProject('codex');
  const report = JSON.parse(await inspectProject({ project: target, json: true }));
  assert.equal(report.issues.some((entry) => entry.code === 'changed-skill'), false);
  await initialize({ project: target, agent: 'codex', profile: 'core', bootstrapOnly: true, dryRun: true, yes: false });

  await writeFile(path.join(target, '.agents/skills/vibe-tether', 'changed.txt'), 'user change\n');
  await assert.rejects(
    initialize({ project: target, agent: 'codex', profile: 'core', bootstrapOnly: true, dryRun: true, yes: false }),
    /canonical|legacy|modified|fingerprint/i,
  );
});

test('uninstall previews and removes an exact public 0.2.1 copy', async () => {
  const target = await legacyProject('codex');
  const preview = await uninstall({ project: target, dryRun: true, yes: false });
  assert.match(preview, /DRY RUN/);
  await uninstall({ project: target, dryRun: false, yes: true });
  assert.equal(await exists(path.join(target, '.agents/skills/vibe-tether')), false);
});
```

- [ ] **Step 3: Run and verify RED in all currently divergent commands**

Run:

```powershell
node --test test/vibetether-upgrade.test.mjs test/provider-init.test.mjs test/provider-lifecycle.test.mjs
```

Expected: the exact 0.2.1 init path may pass after Task 2, while doctor still reports `changed-skill`; this proves lifecycle divergence before centralization.

- [ ] **Step 4: Replace raw core checks with `inspectVibeTetherIdentity`**

Apply these rules:

```js
const identity = await inspectVibeTetherIdentity(target);
if (identity.state === 'unknown') rejectAuthority('...not a canonical or registered legacy installation.');
```

- `bootstrap-authority.mjs`: remove the locally built fingerprint set and call the helper for every enabled harness.
- `managed-project-state.mjs`: add a core-specific verifier using the helper; keep provider/catalog verification on raw recorded fingerprints.
- `doctor.mjs`: `current` is healthy; `legacy` adds a warning with code `legacy-skill` and update guidance; `unknown` adds `changed-skill`.
- `uninstall.mjs`: accept only `current` or `legacy`; preserve the existing customization refusal for `unknown`.

Do not expose installed fingerprints or paths derived from untrusted configuration in diagnostics.

- [ ] **Step 5: Remove mutable synthetic legacy-set tests**

Replace the test that mutates `LEGACY_VIBETETHER_FINGERPRINTS` with the exact 0.2.1 fixture. No test may add or delete production compatibility entries at runtime.

- [ ] **Step 6: Run the lifecycle matrix**

Run:

```powershell
node --test test/vibetether-upgrade.test.mjs test/provider-init.test.mjs test/provider-lifecycle.test.mjs test/cli-lifecycle.test.mjs test/project-scan.test.mjs
```

Expected: PASS; exact legacy is recognized consistently, changed legacy remains blocked, providers remain raw-fingerprint strict.

- [ ] **Step 7: Commit lifecycle centralization**

```powershell
git add scripts/verify-release-history.mjs test/vibetether-upgrade.test.mjs src/bootstrap-authority.mjs src/managed-project-state.mjs src/doctor.mjs src/uninstall.mjs test/provider-init.test.mjs test/provider-lifecycle.test.mjs
git commit -m "fix: unify historical skill lifecycle checks"
```

---

### Task 4: Make Interactive Initialization Beginner-Guided

**Files:**
- Modify: `src/terminal-prompts.mjs`
- Modify: `src/bootstrap-model.mjs:21-50`
- Modify: `src/bootstrap.mjs:187-213`
- Modify: `test/bootstrap-cli.test.mjs:108-138,237-336`

- [ ] **Step 1: Write failing numbered-choice adapter tests**

Cover numeric selection, exact value input for backward compatibility, blank recommended choice, invalid choice retry, required text retry, custom follow-up, and safe confirmation:

```js
test('terminal prompts render explained choices and recover from invalid input', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  const output = new PassThrough();
  output.isTTY = true;
  let printed = '';
  output.on('data', (chunk) => { printed += chunk.toString(); });
  const adapter = createTerminalPromptAdapter({ input, output });
  const answer = adapter.ask({
    id: 'agent',
    prompt: 'Which agent harness should VibeTether configure?',
    recommended: 'both',
    required: true,
    choices: [
      { value: 'both', label: 'Codex + Claude', description: 'Configure both harnesses.' },
      { value: 'codex', label: 'Codex only', description: 'Configure AGENTS.md.' },
      { value: 'claude', label: 'Claude only', description: 'Configure CLAUDE.md.' }
    ]
  });
  input.write('9\n2\n');
  assert.equal(await answer, 'codex');
  assert.match(printed, /1\).*Codex \+ Claude.*Recommended/is);
  assert.match(printed, /Please choose 1, 2, or 3/i);
  await adapter.close();
});
```

For required goal text, write blank then a sentence and assert the adapter prints the example and re-prompts. For confirmation, assert `2` and blank cancel, while `1` and `y` apply.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --test test/bootstrap-cli.test.mjs
```

Expected: FAIL because the adapter does not render choices or retry.

- [ ] **Step 3: Implement declarative choice rendering**

In `src/terminal-prompts.mjs`, keep terminal formatting out of bootstrap code:

```js
function choiceText(question) {
  const lines = [question.prompt];
  for (const [index, choice] of question.choices.entries()) {
    const recommended = choice.value === question.recommended ? ' (Recommended)' : '';
    lines.push(`${index + 1}) ${choice.label}${recommended}`);
    if (choice.description) lines.push(`   ${choice.description}`);
  }
  lines.push('> ');
  return lines.join('\n');
}

function selectedChoice(question, answer) {
  if (answer === '' && question.recommended) {
    return question.choices.find((choice) => choice.value === question.recommended) ?? null;
  }
  if (/^\d+$/.test(answer)) return question.choices[Number(answer) - 1] ?? null;
  return question.choices.find((choice) => choice.value === answer) ?? null;
}
```

`ask()` loops until a valid choice or required text is supplied. A choice with `customPrompt` triggers one guided text question; a choice with `value: null` returns an empty optional answer. Text questions render `help` and `example`. Blank optional text may accept a declared recommendation; blank required text never fabricates one.

`confirm()` renders:

```text
1) Apply these changes
2) Cancel (Default)
> 
```

and accepts `1`, `y`, or `yes` as apply; all blank, `2`, `n`, and `no` answers cancel; invalid input re-prompts.

- [ ] **Step 4: Declare finite initialization choices**

In `interactiveInit`, define:

```js
const AGENT_CHOICES = [
  { value: 'both', label: 'Codex + Claude', description: 'Install shared controls for both harnesses.' },
  { value: 'codex', label: 'Codex only', description: 'Configure AGENTS.md and .agents/skills.' },
  { value: 'claude', label: 'Claude only', description: 'Configure CLAUDE.md and .claude/skills.' },
];

const PROFILE_CHOICES = [
  { value: 'standard', label: 'Standard', description: 'Core controls plus the focused default workflow set.' },
  { value: 'core', label: 'Core', description: 'Provider-free control, routing, checkpoints, and experience recall.' },
  { value: 'extended', label: 'Extended', description: 'Standard plus the curated specialist catalog.' },
];
```

Pass these arrays as `choices` while preserving existing recommendations and CLI validation.

In `bootstrap-model.mjs`, add help and examples to required text:

```js
goal: {
  id: 'goal',
  prompt: 'Who should this project help, and what outcome should they achieve?',
  help: 'Write one sentence naming the user and the result. VibeTether will not invent this direction.',
  example: 'Help a small operations team deploy its reporting service safely.',
  required: true,
  recommended: null,
  answered: false,
},
success_evidence: {
  id: 'success_evidence',
  prompt: 'What fresh evidence would make the first milestone successful?',
  help: 'Name something observable that can fail or pass.',
  example: 'A new user completes setup and the focused acceptance tests pass.',
  required: true,
  recommended: null,
  answered: false,
},
```

Scope and visual direction declare three choices: use the safe recommendation, enter a custom answer through `customPrompt`, or add no extra constraint.

- [ ] **Step 5: Preserve automation and injected-adapter safety**

Keep non-interactive `--yes`, explicit `--agent`, explicit `--profile`, and direct option validation unchanged. An injected test or third-party adapter may still return an invalid raw value; `interactiveInit` must continue rejecting it before writes.

- [ ] **Step 6: Run the bootstrap contract**

Run:

```powershell
node --test test/bootstrap-model.test.mjs test/bootstrap-cli.test.mjs test/cli-init.test.mjs
```

Expected: PASS; interactive paths are guided, non-interactive behavior remains stable, cancellation writes nothing.

- [ ] **Step 7: Commit the guided interaction**

```powershell
git add src/terminal-prompts.mjs src/bootstrap-model.mjs src/bootstrap.mjs test/bootstrap-cli.test.mjs test/bootstrap-model.test.mjs test/cli-init.test.mjs docs/superpowers/specs/2026-07-14-vibetether-release-hardening-design.md
git commit -m "feat: guide initialization with safe choices"
```

---

### Task 5: Make Pinned Provider Installation Resilient and Cache-Aware

**Files:**
- Create: `src/provider-cache.mjs`
- Modify: `src/provider-fetch.mjs`
- Modify: `src/init.mjs:665-785`
- Modify: `test/provider-fetch.test.mjs:193-235`
- Modify: `test/provider-init.test.mjs:326-409`

- [ ] **Step 1: Write failing transport retry tests**

Add synchronous executor tests for these exact contracts:

1. OpenSSL `TLS connect error: ... unexpected eof while reading`, then success: two fetch attempts and success.
2. Schannel handshake failure, OpenSSL EOF, then success: three attempts; attempts two and three carry `http.sslBackend=openssl`.
3. Three transient EOF failures: exactly three attempts, then an error containing `after 3 attempts` and safe retry guidance.
4. `Repository not found`, authentication failure, unknown commit, and a non-fetch Git command: exactly one attempt.

Inject a no-op `sleep` in tests so the production backoff is tested structurally without delaying the suite.

- [ ] **Step 2: Run and verify transport RED**

Run:

```powershell
node --test test/provider-fetch.test.mjs
```

Expected: FAIL because the current implementation performs only one Schannel-specific retry and fails the exact OpenSSL EOF report immediately.

- [ ] **Step 3: Implement classified bounded fetch retries**

In `src/provider-fetch.mjs`:

- keep the existing disabled-hooks and `core.autocrlf=false` controls;
- retry only `fetch` and only recognized transient transport output;
- allow three total attempts with 200 ms and 600 ms bounded delays;
- switch to `http.sslBackend=openssl` after a Schannel-specific failure and keep it for later attempts;
- retry an OpenSSL EOF with the current backend;
- throw immediately for process launch errors and non-transient Git failures;
- after exhaustion, throw `Provider git fetch failed after 3 attempts because the pinned upstream transport was interrupted. Retry the same command; no project files were changed. Last error: ...`.

Do not change repository URLs, refs, commits, fingerprint validation, or license validation.

- [ ] **Step 4: Write failing verified-cache tests**

Extend provider initialization tests to count `stageProviders` calls:

- first standard or extended apply stages the source once;
- an unchanged second apply stages zero sources and remains byte-for-byte idempotent;
- a core VibeTether reinstall over an unchanged valid provider plan stages zero sources;
- adding a selected source with no verified local catalog stages only that source;
- a missing catalog path, wrong raw catalog fingerprint, mismatched source commit, invalid lock, or mismatched license hash is never accepted as local authority;
- exact cached catalog content can repair a missing exposure copy without network access;
- all cache decisions preserve Codex/Claude ownership and lock schema.

- [ ] **Step 5: Run and verify cache RED**

Run:

```powershell
node --test test/provider-init.test.mjs
```

Expected: FAIL because normal apply currently calls `stageProviders(providerSources)` unconditionally.

- [ ] **Step 6: Implement exact local provider staging**

Create `src/provider-cache.mjs` with a helper that returns `{ resolved, unresolved }` for the requested source plan.

A source is locally resolved only when:

- the existing provider lock is valid;
- its locked repository, ref, commit, and license mode match the registry source;
- every requested source Skill has the expected id, source id, install name, raw fingerprint, and canonical `.vibetether/providers/catalog/<source-id>/<install-name>` path;
- `skillFingerprint` of each local catalog directory matches the registry fingerprint;
- a full-text license exists at the canonical locked path and hashes to `license_sha256`, or README-declaration evidence exactly matches the pinned registry declaration and hash.

Return local staged Skill records whose `source_path` is the verified catalog path. Return staged repository records with the exact verified license evidence/content required by the existing apply path. Treat any incomplete source atomically as unresolved.

In `src/init.mjs`, call this helper before remote staging. Invoke `stageProviders` only for unresolved sources, merge local and remote staged records by source/Skill id, and retain the remote cleanup callback. A remote record wins only for its explicitly unresolved source; duplicate or missing records are controlled errors.

- [ ] **Step 7: Run focused provider contracts**

Run:

```powershell
node --test test/provider-fetch.test.mjs test/provider-init.test.mjs test/provider-lifecycle.test.mjs test/provider-catalog.test.mjs
```

Expected: PASS; exact unchanged plans are network-free, changed plans remain pinned and verified, and the user's TLS EOF class receives bounded retries.

- [ ] **Step 8: Commit provider reliability**

```powershell
git add src/provider-cache.mjs src/provider-fetch.mjs src/init.mjs test/provider-fetch.test.mjs test/provider-init.test.mjs
git commit -m "fix: harden provider fetch and cache reuse"
```

---

### Task 6: Enforce Release History in CI

**Files:**
- Modify: `scripts/verify-release-history.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `test/public-release.test.mjs`

- [ ] **Step 1: Add failing release-audit tests**

Add a test that invokes the script and a public-release test that requires full history:

```js
test('release history reproduces every registered canonical fingerprint', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-release-history.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /release compatibility: valid/i);
});

test('CI fetches full history before auditing compatibility', async () => {
  const workflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(workflow, /actions\/checkout@v4[\s\S]*fetch-depth:\s*0/);
  assert.match(workflow, /npm run check/);
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --test test/public-release.test.mjs test/skill-contract.test.mjs
```

Expected: FAIL because the audit and full-history checkout are not complete.

- [ ] **Step 3: Complete the release verifier**

For each registry history entry:

1. verify `git cat-file -e <commit>^{commit}`;
2. materialize the exact `skills/vibe-tether` blobs into a temporary directory;
3. call `portableSkillFingerprint` from production code;
4. compare to the registry fingerprint;
5. read `package.json` from the commit and compare its version;
6. remove the temporary directory in `finally`.

Then compare root `package.json` version and current source fingerprint with `registry.current`. Print exactly:

```text
VibeTether release compatibility: valid (<history-count> historical identities).
```

Never print file contents, Git credentials, or raw Git error output.

- [ ] **Step 4: Wire package and CI**

Set both package files to `0.2.3`. Add:

```json
"audit:release": "node scripts/verify-release-history.mjs",
"check": "npm test && npm run eval && npm run audit:release && node skills/vibe-tether/scripts/validate-project.mjs --self"
```

Update checkout:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
```

- [ ] **Step 5: Run focused audit and package tests**

Run:

```powershell
npm run audit:release
node --test test/public-release.test.mjs test/skill-contract.test.mjs test/vibetether-upgrade.test.mjs
```

Expected: PASS with five registered historical identities and exact current fingerprint.

- [ ] **Step 6: Commit release enforcement**

```powershell
git add scripts/verify-release-history.mjs package.json package-lock.json .github/workflows/ci.yml test/public-release.test.mjs
git commit -m "test: enforce release compatibility history"
```

---

### Task 7: Document the Real Capability and Update Experience

**Files:**
- Modify: `README.md`
- Modify: `docs/operations/windows-skill-lifecycle.md`
- Modify: `test/public-release.test.mjs`

- [ ] **Step 1: Add failing documentation contracts**

Require the README to state:

```js
assert.match(readme, /numbered choices|guided choices/i);
assert.match(readme, /goal.*success.*user-owned|does not invent/i);
assert.match(readme, /registered canonical.*upgrade/i);
assert.match(readme, /line ending|CRLF/i);
assert.match(readme, /cannot guarantee.*host|host.*must honor/i);
assert.doesNotMatch(readme, /guaranteed automatic invocation|saves? tokens/i);
assert.match(readme, /transient.*retry|TLS.*retry/i);
assert.match(readme, /verified.*catalog.*without.*network|unchanged.*provider.*without.*fetch/i);
```

Require the Windows runbook to explain that unchanged 0.2.1 is automatically upgradeable and material changes remain protected.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --test test/public-release.test.mjs
```

Expected: FAIL on the new beginner-choice and compatibility statements.

- [ ] **Step 3: Update the quick start and interaction guide**

Keep the simplest extended installation command first. Immediately below it, explain that an interactive run uses numbered harness/profile choices, marks a recommendation, and guides unavoidable goal/success text with examples. Preserve the complete advanced customization section later.

- [ ] **Step 4: Update lifecycle and capability limits**

Explain that:

- rerunning `init` is update/repair;
- exact registered canonical releases and CRLF-only copies upgrade safely;
- unknown content still stops before writes;
- dry-run is write-free and provider-content-network-free;
- unchanged verified provider plans are reused without GitHub access, while missing or changed pinned sources use bounded transient retries;
- VibeTether improves reliable routing through instructions, a board, resolver, checkpoints, and doctor, but cannot force a host model to comply.

- [ ] **Step 5: Run documentation and leakage checks**

Run:

```powershell
node --test test/public-release.test.mjs test/skill-contract.test.mjs
node skills/vibe-tether/scripts/validate-project.mjs --self
```

Expected: PASS with no local paths, project-private terms, secrets, or non-English public-Skill leakage.

- [ ] **Step 6: Commit documentation**

```powershell
git add README.md docs/operations/windows-skill-lifecycle.md test/public-release.test.mjs
git commit -m "docs: explain guided upgrades and capability limits"
```

---

### Task 8: Full Verification, Real Upgrade Acceptance, Review, and Publication

**Files:**
- Modify: outer `.scratch/vibetether-release-hardening/AGENT_DELIVERY.md`
- Modify: outer `.vibetether/state/current.yaml`
- Modify when evidence requires it: `docs/operations/windows-skill-lifecycle.md`

- [ ] **Step 1: Run the complete local gate from a clean public checkout**

Run:

```powershell
npm run check
npm run acceptance:tour
npm pack --dry-run
git diff --check main...HEAD
git status --short
```

Expected: zero test/eval/audit/self-validation failures; acceptance tour succeeds; package contains every runtime registry file; diff contains only approved release-hardening work.

- [ ] **Step 2: Prove the exact prior-version command locally**

Create `$acceptanceProject = Join-Path $env:TEMP 'vibetether-023-upgrade-acceptance'`, remove only that exact directory if it already exists, recreate it, and materialize both installed VibeTether directories from commit `1f6444567873b5d1abd3371c45df19db23054ec9`. Run the local CLI:

```powershell
node bin\vibetether.mjs init --project $acceptanceProject --agent both --profile extended --bundle web --bundle production --dry-run
node bin\vibetether.mjs init --project $acceptanceProject --agent both --profile extended --bundle web --bundle production --yes
node bin\vibetether.mjs init --project $acceptanceProject --agent both --profile extended --bundle web --bundle production --yes
node bin\vibetether.mjs doctor --project $acceptanceProject
node bin\vibetether.mjs capabilities --project $acceptanceProject --phase DISCOVER --capability requirements-clarification --signal goal-unclear --agent codex --json
node bin\vibetether.mjs uninstall --project $acceptanceProject --dry-run
```

Expected: preview writes nothing; first apply succeeds; unchanged second apply succeeds without provider-network access; doctor has no changed-Skill issue; route recommends the installed model-invokable clarification provider or declared fallback; uninstall preview succeeds.

- [ ] **Step 3: Prove beginner interaction in a pseudo-terminal acceptance path**

Exercise invalid then valid numbered choices, blank then valid goal text, custom optional direction, preview, and cancellation. Verify no write occurs before confirmation and cancellation leaves the project unchanged.

- [ ] **Step 4: Run a separated final review pass**

Review only these inputs: user request, approved design, implementation plan, final diff, raw command outputs, package listing, and acceptance artifacts. Record:

- missing requirements;
- lifecycle divergence;
- customization-safety regression;
- capability or routing regression;
- documentation overclaim;
- release blockers;
- independence limitation that the review is separated but not independently authored.

- [ ] **Step 5: Capture the recovered Proven Path**

Update the existing Windows lifecycle runbook only if the verified sequence adds durable facts. Record `recovered-path` and `captured` in the outer checkpoint with executable registry, audit, regression tests, CI, and runbook artifact paths. Do not record credentials, tokens, one-time codes, private reasoning, or full logs.

- [ ] **Step 6: Validate the delivery packet and root doctor**

Run:

```powershell
python .agents\skills\gyws-controlled-delivery\scripts\validate_delivery_packet.py .scratch\vibetether-release-hardening\AGENT_DELIVERY.md
node .agents\skills\vibe-tether\scripts\validate-project.mjs --project .
```

Expected: both validators pass with no pending experience disposition.

- [ ] **Step 7: Commit final evidence updates**

Commit only public-repository files inside the standalone release checkout. Do not accidentally add outer project state or unrelated dirty files.

```powershell
git status --short
git add registry/vibetether-releases.json scripts/verify-release-history.mjs src test README.md docs/operations/windows-skill-lifecycle.md docs/superpowers/specs/2026-07-14-vibetether-release-hardening-design.md docs/superpowers/plans/2026-07-14-vibetether-release-hardening.md package.json package-lock.json .github/workflows/ci.yml
git commit -m "chore: release vibetether 0.2.3"
```

- [ ] **Step 8: Integrate and publish**

After local `RELEASE_READY`, merge the release branch into local `main` without rewriting history, push `main`, and verify the remote commit and GitHub CI. Use the already proven authenticated user-terminal HTTPS route if the managed shell still cannot authenticate; do not claim a push before Git reports success.

- [ ] **Step 9: Run the real GitHub one-command acceptance**

Against a clean temporary directory and then the repaired project when safe, run:

```powershell
npx --yes github:t01089572455/vibetether init --project . --agent both --profile extended --bundle web --bundle production --dry-run
npx --yes github:t01089572455/vibetether init --project . --agent both --profile extended --bundle web --bundle production --yes
npx --yes github:t01089572455/vibetether doctor --project .
```

Expected: the published commit is fetched; the old canonical installation is not reported as modified; the first provider fetch tolerates bounded transient TLS EOF; the unchanged second apply reuses verified local provider content without fetching.

- [ ] **Step 10: Mark verified delivery only from remote evidence**

Record the exact remote commit, push output, CI run result, real `npx` result, remaining host-dependent limitations, and final experience disposition. Only then claim `VERIFIED_DELIVERY`.
