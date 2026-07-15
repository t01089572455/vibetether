# Guided Bootstrap and Experience Recall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the simplest VibeTether command establish confirmed project direction interactively, and make later agents deterministically discover relevant Proven Paths before repeatable operational work.

**Architecture:** Keep discovery, prompting, document rendering, transactional writes, experience matching, and validation as separate units. Interactive `init` and explicit `bootstrap` share one bootstrap model; the existing initializer remains the only full installation transaction. Proven Path content stays in its natural document or executable artifact, while a metadata-only index feeds both the package CLI and the installed offline resolver.

**Tech Stack:** Node.js 20+ ESM, `node:test`, `node:readline/promises`, `yaml`, the existing VibeTether transaction helpers, Markdown, JSON registries.

---

## File structure and responsibility map

- `src/bootstrap-model.mjs`: pure discovery-to-question model, greenfield detection, CLI answer normalization, and Intent Contract rendering.
- `src/terminal-prompts.mjs`: replaceable one-question-at-a-time TTY adapter and final authorization prompt.
- `src/bootstrap.mjs`: orchestration for guided `init` and explicit `bootstrap`; no provider or file implementation details.
- `src/experience-index.mjs`: canonical schema validation, secret-field rejection, path safety, deterministic matching, and YAML serialization.
- `src/cli.mjs`: command/flag parsing and TTY-mode selection only.
- `src/init.mjs`: complete installation planning and transactional application; accepts confirmed intent and creates/upgrades the experience index.
- `src/project-scan.mjs`: read-only discovery, including real operational documentation.
- `src/capabilities.mjs`: package-side route resolution and `applicable_experience` output.
- `src/doctor.mjs`: project health and checkpoint/index consistency.
- `src/uninstall.mjs`: safe lifecycle behavior for an unchanged empty index versus user-authored experience metadata.
- `src/adapters.mjs`: generated Codex/Claude control rules for deterministic experience recall.
- `skills/vibe-tether/scripts/experience-index.mjs`: zero-dependency installed-Skill parser/matcher with parity tests against the package implementation.
- `skills/vibe-tether/scripts/resolve-route.mjs`: installed offline route output with applicable experience.
- `skills/vibe-tether/scripts/validate-project.mjs`: installed offline project/index validation.
- `skills/vibe-tether/SKILL.md` and references: human-readable control contract, bootstrap flow, capture/index update, and recall obligations.
- `registry/capabilities.json` and `registry/scenarios.json`: explicit `project-bootstrap` and `proven-path-recall` routes.
- `evals/scenarios/*.json`: focused forward scenarios for clarification and experience recall.
- `README.md`: beginner-first product story, exact commands, honest model positioning, evidence limits, then advanced installation details.

The approved design is one cohesive feature rather than three independent projects: bootstrap establishes the truth substrate, success capture populates the experience substrate, and route resolution consumes both. Each task below still produces a separately testable commit.

### Task 1: Build the pure bootstrap readiness and Intent Contract model

**Files:**
- Create: `src/bootstrap-model.mjs`
- Modify: `src/manifest.mjs`
- Create: `test/bootstrap-model.test.mjs`

- [ ] **Step 1: Write the failing model tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBootstrapModel,
  parseIntentContract,
  renderIntentContract,
} from '../src/bootstrap-model.mjs';

const emptyDiscovery = {
  discovery: {
    'AGENTS.md': { role: 'agent instructions', confidence: 'high', kind: 'file' },
    '.vibetether/intent.md': { role: 'intent contract', confidence: 'high', kind: 'file' },
  },
  bundle_signals: [],
  goal_source: '.vibetether/intent.md',
};

test('greenfield bootstrap asks only the two required directional questions first', () => {
  const model = buildBootstrapModel({ discovery: emptyDiscovery, input: {} });
  assert.equal(model.greenfield, true);
  assert.equal(model.ready, false);
  assert.deepEqual(model.questions.map((question) => question.id), [
    'goal',
    'success_evidence',
    'scope_boundaries',
  ]);
  assert.equal(model.questions[0].required, true);
  assert.equal(model.questions[1].required, true);
  assert.equal(model.questions[2].recommended, 'Preserve existing instructions; confirm destructive actions and releases.');
});

test('web evidence adds visual direction without asking local technical questions', () => {
  const model = buildBootstrapModel({
    discovery: {
      ...emptyDiscovery,
      bundle_signals: [{ bundle: 'web', signal: 'react', confidence: 'high' }],
    },
    input: {},
  });
  assert.deepEqual(model.questions.map((question) => question.id), [
    'goal',
    'success_evidence',
    'scope_boundaries',
    'visual_direction',
  ]);
  assert.equal(model.questions.some((question) => question.id === 'architecture'), false);
});

test('explicit directional answers produce a confirmed, durable contract', () => {
  const model = buildBootstrapModel({
    discovery: emptyDiscovery,
    input: {
      goal: 'Help solo developers ship a verified web app.',
      successEvidence: 'A fresh browser acceptance tour passes.',
      scopeBoundaries: ['Do not deploy automatically.'],
      constraints: ['Preserve user-authored project rules.'],
    },
  });
  assert.equal(model.ready, true);
  assert.deepEqual(model.questions, []);
  const document = renderIntentContract(model.answers);
  assert.match(document, /Status: confirmed/);
  assert.match(document, /Help solo developers ship a verified web app\./);
  assert.match(document, /A fresh browser acceptance tour passes\./);
  assert.match(document, /Do not deploy automatically\./);
  assert.doesNotMatch(document, /No project goal has been recorded yet/);
});

test('missing required answers render unresolved intent without guessing from metadata', () => {
  const model = buildBootstrapModel({ discovery: emptyDiscovery, input: {} });
  const document = renderIntentContract(model.answers);
  assert.match(document, /Status: unresolved/);
  assert.match(document, /No project goal has been recorded yet/);
  assert.doesNotMatch(document, /greenfield|package\.json/i);
});

test('an existing confirmed contract supplies known answers instead of repeating questions', () => {
  const prior = renderIntentContract({
    goal: 'Help maintainers publish a verified package.',
    success_evidence: 'The package acceptance tour passes.',
    scope_boundaries: ['Do not publish automatically.'],
    constraints: ['Preserve existing project instructions and higher-authority decisions.'],
    visual_direction: null,
  });
  const model = buildBootstrapModel({
    discovery: emptyDiscovery,
    input: parseIntentContract(prior),
  });
  assert.equal(model.ready, true);
  assert.deepEqual(model.questions, []);
});
```

- [ ] **Step 2: Run the focused test and verify the module is missing**

Run: `node --test test/bootstrap-model.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/bootstrap-model.mjs`.

- [ ] **Step 3: Add the pure bootstrap model**

Create `src/bootstrap-model.mjs` with these public contracts and no filesystem access:

```js
const SAFE_SCOPE_DEFAULT = 'Preserve existing instructions; confirm destructive actions and releases.';
const SAFE_CONSTRAINTS = [
  'Preserve existing project instructions and higher-authority decisions.',
  'Confirm destructive actions and releases before execution.',
];

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function list(value) {
  return [...new Set((Array.isArray(value) ? value : value ? [value] : []).map(clean).filter(Boolean))];
}

function isWebProject(discovery) {
  return (discovery.bundle_signals ?? []).some(
    (signal) => signal.bundle === 'web' && signal.confidence === 'high',
  ) || Object.values(discovery.discovery ?? {}).some((entry) => entry.role === 'user interface specification');
}

function isGreenfield(discovery) {
  const ignored = new Set(['AGENTS.md', 'CLAUDE.md', '.vibetether/intent.md']);
  return (discovery.bundle_signals ?? []).length === 0
    && Object.keys(discovery.discovery ?? {}).every((key) => ignored.has(key));
}

export function buildBootstrapModel({ discovery, input = {} }) {
  const answers = {
    goal: clean(input.goal),
    success_evidence: clean(input.successEvidence),
    scope_boundaries: list(input.scopeBoundaries),
    constraints: [...new Set([...SAFE_CONSTRAINTS, ...list(input.constraints)])],
    visual_direction: clean(input.visualDirection),
  };
  const definitions = [
    {
      id: 'goal',
      prompt: 'Who should this project help, and what outcome should they achieve?',
      required: true,
      recommended: null,
      answered: Boolean(answers.goal),
    },
    {
      id: 'success_evidence',
      prompt: 'What fresh evidence would make the first milestone successful?',
      required: true,
      recommended: null,
      answered: Boolean(answers.success_evidence),
    },
    {
      id: 'scope_boundaries',
      prompt: 'What is explicitly out of scope or must not be weakened?',
      required: false,
      recommended: SAFE_SCOPE_DEFAULT,
      answered: answers.scope_boundaries.length > 0,
    },
    {
      id: 'visual_direction',
      prompt: 'What existing brand, reference, or visual direction governs the interface?',
      required: false,
      recommended: 'Preserve existing brand assets and request approval before propagating a visual direction.',
      answered: Boolean(answers.visual_direction),
      applicable: isWebProject(discovery),
    },
  ];
  const questions = definitions.filter((question) => question.applicable !== false && !question.answered);
  return {
    greenfield: isGreenfield(discovery),
    ready: Boolean(answers.goal && answers.success_evidence),
    answers,
    questions,
  };
}

function bullets(values, empty) {
  return values.length ? values.map((value) => `- ${value}`).join('\n') : empty;
}

export function renderIntentContract(answers) {
  const ready = Boolean(answers.goal && answers.success_evidence);
  const open = [];
  if (!answers.goal) open.push('Confirm the user and intended outcome.');
  if (!answers.success_evidence) open.push('Confirm fresh success evidence for the first milestone.');
  return `# VibeTether Intent Contract

Status: ${ready ? 'confirmed' : 'unresolved'}

## Goal

${answers.goal ?? 'No project goal has been recorded yet.'}

## Success evidence

${answers.success_evidence ?? 'No acceptance evidence has been recorded yet.'}

## Scope boundaries

${bullets(answers.scope_boundaries, 'No additional boundaries have been recorded yet.')}

## Non-negotiable constraints

${bullets(answers.constraints, 'No additional constraints have been recorded yet.')}

## Visual direction

${answers.visual_direction ?? 'No visual direction has been recorded yet.'}

## Open direction decisions

${bullets(open, 'No unresolved directional decisions.')}
`;
}

export function parseIntentContract(source) {
  const section = (heading) => source.match(new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`))?.[1].trim() ?? '';
  const scalar = (heading, unresolved) => {
    const value = section(heading);
    return !value || value === unresolved ? null : value;
  };
  const bulletList = (heading, unresolvedPrefix) => {
    const value = section(heading);
    if (!value || value.startsWith(unresolvedPrefix)) return [];
    return value.split(/\\r?\\n/).filter((line) => line.startsWith('- ')).map((line) => line.slice(2).trim()).filter(Boolean);
  };
  return {
    goal: scalar('Goal', 'No project goal has been recorded yet.'),
    successEvidence: scalar('Success evidence', 'No acceptance evidence has been recorded yet.'),
    scopeBoundaries: bulletList('Scope boundaries', 'No additional boundaries'),
    constraints: bulletList('Non-negotiable constraints', 'No additional constraints'),
    visualDirection: scalar('Visual direction', 'No visual direction has been recorded yet.'),
  };
}

export function unresolvedIntent() {
  return renderIntentContract({
    goal: null,
    success_evidence: null,
    scope_boundaries: [],
    constraints: SAFE_CONSTRAINTS,
    visual_direction: null,
  });
}
```

- [ ] **Step 4: Make the existing default intent use the same renderer**

Replace the string literal in `src/manifest.mjs` with:

```js
import { unresolvedIntent } from './bootstrap-model.mjs';

export const DEFAULT_INTENT = unresolvedIntent();
```

- [ ] **Step 5: Run model and existing initialization tests**

Run: `node --test test/bootstrap-model.test.mjs test/cli-init.test.mjs`

Expected: PASS with no changed assertions outside the intentional `Status: unresolved` addition.

- [ ] **Step 6: Commit the bootstrap model**

```bash
git add src/bootstrap-model.mjs src/manifest.mjs test/bootstrap-model.test.mjs
git commit -m "feat: model guided project bootstrap"
```

### Task 2: Add a replaceable terminal prompt adapter and guided CLI modes

**Files:**
- Create: `src/terminal-prompts.mjs`
- Create: `src/bootstrap.mjs`
- Modify: `src/cli.mjs`
- Modify: `src/init.mjs`
- Create: `test/bootstrap-cli.test.mjs`

- [ ] **Step 1: Write failing CLI contract tests**

```js
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';

async function project(name) {
  return mkdtemp(path.join(os.tmpdir(), `vibetether-${name}-`));
}

function promptAdapter(answers, confirm = true) {
  const asked = [];
  return {
    asked,
    interactive: true,
    async ask(question) {
      asked.push(question.id);
      return answers[question.id] ?? question.recommended ?? '';
    },
    async confirm() {
      return confirm;
    },
  };
}

test('interactive init asks one question at a time and previews before applying', async () => {
  const root = await project('interactive');
  const prompts = promptAdapter({
    goal: 'Help a beginner build a verified project.',
    success_evidence: 'A fresh acceptance command passes.',
    scope_boundaries: 'Do not publish automatically.',
  });
  const output = await main(['init', '--project', root, '--profile', 'core'], {
    promptAdapter: prompts,
    isTTY: true,
  });
  assert.deepEqual(prompts.asked, ['goal', 'success_evidence', 'scope_boundaries']);
  assert.match(output, /Planned changes/);
  assert.match(output, /VibeTether initialized/);
  assert.match(await readFile(path.join(root, '.vibetether', 'intent.md'), 'utf8'), /Status: confirmed/);
});

test('cancellation performs no writes', async () => {
  const root = await project('cancel');
  const prompts = promptAdapter({
    goal: 'Help one user finish a project.',
    success_evidence: 'A deterministic check passes.',
  }, false);
  const before = await readdir(root);
  const output = await main(['init', '--project', root, '--profile', 'core'], {
    promptAdapter: prompts,
    isTTY: true,
  });
  assert.match(output, /cancelled/i);
  assert.deepEqual(await readdir(root), before);
});

test('non-TTY init without --yes exits before writes', async () => {
  const root = await project('no-tty');
  await assert.rejects(
    main(['init', '--project', root, '--profile', 'core'], { isTTY: false }),
    /No interactive terminal.*--dry-run.*--yes/i,
  );
  assert.deepEqual(await readdir(root), []);
});

test('non-interactive init accepts explicit direction flags', async () => {
  const root = await project('flags');
  await main([
    'init', '--project', root, '--profile', 'core', '--yes',
    '--goal', 'Help maintainers preserve long-task direction.',
    '--success-evidence', 'Doctor and route checks pass.',
    '--scope-boundary', 'Do not release automatically.',
  ], { isTTY: false });
  const intent = await readFile(path.join(root, '.vibetether', 'intent.md'), 'utf8');
  assert.match(intent, /Status: confirmed/);
});

test('bootstrap --yes refuses to fabricate missing user-owned direction', async () => {
  const root = await project('bootstrap-yes');
  await main(['init', '--project', root, '--profile', 'core', '--yes'], { isTTY: false });
  await assert.rejects(
    main(['bootstrap', '--project', root, '--yes'], { isTTY: false }),
    /requires .*--goal and --success-evidence/i,
  );
});

test('bootstrap --dry-run reports unresolved questions without a TTY or writes', async () => {
  const root = await project('bootstrap-dry-run');
  await main(['init', '--project', root, '--profile', 'core', '--yes'], { isTTY: false });
  const before = await readFile(path.join(root, '.vibetether', 'intent.md'), 'utf8');
  const output = await main(['bootstrap', '--project', root, '--profile', 'core', '--dry-run'], { isTTY: false });
  assert.match(output, /Unresolved directional questions/);
  assert.match(output, /Who should this project help/);
  assert.equal(await readFile(path.join(root, '.vibetether', 'intent.md'), 'utf8'), before);
});

test('bootstrap --yes reuses an existing confirmed contract without provider installation', async () => {
  const root = await project('bootstrap-existing');
  await main([
    'init', '--project', root, '--profile', 'core', '--yes',
    '--goal', 'Help maintainers preserve project direction.',
    '--success-evidence', 'Doctor and route checks pass.',
  ], { isTTY: false });
  const output = await main(['bootstrap', '--project', root, '--profile', 'core', '--yes'], { isTTY: false });
  assert.match(output, /bootstrap/i);
  assert.match(await readFile(path.join(root, '.vibetether', 'intent.md'), 'utf8'), /Status: confirmed/);
});
```

- [ ] **Step 2: Run the focused test and verify the new CLI contract fails**

Run: `node --test test/bootstrap-cli.test.mjs`

Expected: FAIL because `main` does not accept runtime dependencies, `bootstrap` is unknown, and directional flags are unknown.

- [ ] **Step 3: Create the terminal prompt adapter**

Create `src/terminal-prompts.mjs`:

```js
import { createInterface } from 'node:readline/promises';

export function createTerminalPromptAdapter({ input = process.stdin, output = process.stdout } = {}) {
  const readline = createInterface({ input, output });
  return {
    interactive: Boolean(input.isTTY && output.isTTY),
    async ask(question) {
      const suffix = question.recommended ? ` [Recommended: ${question.recommended}]` : '';
      const answer = (await readline.question(`${question.prompt}${suffix}\n> `)).trim();
      return answer || question.recommended || '';
    },
    async confirm(summary) {
      const answer = (await readline.question(`${summary}\nApply these changes? [y/N] `)).trim().toLowerCase();
      return answer === 'y' || answer === 'yes';
    },
    close() {
      readline.close();
    },
  };
}
```

- [ ] **Step 4: Create bootstrap orchestration without duplicating init planning**

Create `src/bootstrap.mjs` around these exact interfaces:

```js
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { selectedAdapters } from './adapters.mjs';
import { buildBootstrapModel, parseIntentContract, renderIntentContract } from './bootstrap-model.mjs';
import { CliError } from './errors.mjs';
import { initialize } from './init.mjs';
import { scanProject } from './project-scan.mjs';
import { createTerminalPromptAdapter } from './terminal-prompts.mjs';

function applyAnswer(input, id, value) {
  if (id === 'goal') input.goal = value;
  else if (id === 'success_evidence') input.successEvidence = value;
  else if (id === 'scope_boundaries') input.scopeBoundaries = value ? [value] : [];
  else if (id === 'visual_direction') input.visualDirection = value;
}

function mergeBootstrapInput(prior, options) {
  return {
    ...options,
    goal: options.goal ?? prior.goal ?? null,
    successEvidence: options.successEvidence ?? prior.successEvidence ?? null,
    scopeBoundaries: options.scopeBoundaries?.length ? options.scopeBoundaries : (prior.scopeBoundaries ?? []),
    constraints: options.constraints?.length ? options.constraints : (prior.constraints ?? []),
    visualDirection: options.visualDirection ?? prior.visualDirection ?? null,
  };
}

export async function runGuidedInit(options, runtime = {}) {
  const root = await realpath(path.resolve(options.project));
  const discovery = await scanProject(root, selectedAdapters(options.agent), options.profile);
  const adapter = runtime.promptAdapter ?? createTerminalPromptAdapter();
  if (!runtime.isTTY && !adapter.interactive) {
    throw new CliError('No interactive terminal is available. Use --dry-run to inspect or --yes for non-interactive initialization.');
  }
  let priorIntent = null;
  try {
    priorIntent = await readFile(path.join(root, '.vibetether', 'intent.md'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const input = mergeBootstrapInput(priorIntent ? parseIntentContract(priorIntent) : {}, options);
  let model = buildBootstrapModel({ discovery, input });
  try {
    for (const question of model.questions) {
      applyAnswer(input, question.id, await adapter.ask(question));
    }
    model = buildBootstrapModel({ discovery, input });
    if (!model.ready) throw new CliError('Goal and success evidence are required before guided initialization.');
    const intentContent = renderIntentContract(model.answers);
    const preview = await initialize({ ...options, project: root, intentContent, dryRun: true, yes: false });
    const priorSummary = priorIntent ? `Prior Intent Contract:\n${priorIntent}\n\n` : '';
    if (!(await adapter.confirm(`${priorSummary}Planned changes:\n${preview}`))) return 'VibeTether initialization cancelled; no files were changed.\n';
    const applied = await initialize({ ...options, project: root, intentContent, dryRun: false, yes: true });
    return `Planned changes were confirmed.\n${applied}`;
  } finally {
    adapter.close?.();
  }
}

export async function runBootstrap(options, runtime = {}) {
  const root = await realpath(path.resolve(options.project));
  let prior = {};
  try {
    prior = parseIntentContract(await readFile(path.join(root, '.vibetether', 'intent.md'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const discovery = await scanProject(root, selectedAdapters(options.agent), options.profile);
  const model = buildBootstrapModel({ discovery, input: mergeBootstrapInput(prior, options) });
  if (options.dryRun) {
    const questions = model.questions.length
      ? model.questions.map((question) => `  - ${question.prompt}`).join('\n')
      : '  - none';
    const preview = await initialize({
      ...options,
      project: root,
      bootstrapOnly: true,
      intentContent: renderIntentContract(model.answers),
      dryRun: true,
      yes: false,
    });
    return `Unresolved directional questions:\n${questions}\n\n${preview}`;
  }
  if (options.yes) {
    if (!model.ready) throw new CliError('bootstrap --yes requires a confirmed existing Intent Contract or explicit --goal and --success-evidence; user-owned direction cannot be fabricated.');
    return initialize({
      ...options,
      bootstrapOnly: true,
      intentContent: renderIntentContract(model.answers),
      yes: true,
    });
  }
  return runGuidedInit({ ...options, bootstrapOnly: true }, runtime);
}
```

During implementation, keep `bootstrapOnly` inside the existing initialization plan: skip provider staging and unchanged provider/Skill plans, but still update the Intent Contract, manifest truth routes, capability board, experience index, checkpoint, and managed instruction block transactionally.

- [ ] **Step 5: Extend CLI parsing and runtime injection**

Change `main` to `export async function main(args = process.argv.slice(2), runtime = {})`, add `bootstrap` to `HELP`, and parse these repeatable shared flags for both `init` and `bootstrap`:

```js
else if (flag === '--goal') options.goal = valueAfter(args, index++, flag);
else if (flag === '--success-evidence') options.successEvidence = valueAfter(args, index++, flag);
else if (flag === '--scope-boundary') options.scopeBoundaries.push(valueAfter(args, index++, flag));
else if (flag === '--constraint') options.constraints.push(valueAfter(args, index++, flag));
else if (flag === '--visual-direction') options.visualDirection = valueAfter(args, index++, flag);
```

Initialize `scopeBoundaries: []` and `constraints: []`. Route modes exactly as follows:

```js
if (args[0] === 'init') {
  const options = parseInit(args.slice(1));
  if (options.help) return HELP;
  if (options.dryRun || options.yes) return initialize(options);
  return runGuidedInit(options, {
    ...runtime,
    isTTY: runtime.isTTY ?? Boolean(process.stdin.isTTY && process.stdout.isTTY),
  });
}
if (args[0] === 'bootstrap') {
  const options = parseBootstrap(args.slice(1));
  if (options.help) return HELP;
  return runBootstrap(options, {
    ...runtime,
    isTTY: runtime.isTTY ?? Boolean(process.stdin.isTTY && process.stdout.isTTY),
  });
}
```

- [ ] **Step 6: Feed confirmed intent into initialization and preserve non-interactive unresolved behavior**

In `src/init.mjs`, replace the fixed Intent Contract content selection with:

```js
const intentContent = options.intentContent ?? DEFAULT_INTENT;
textPlans.push({
  relativePath: '.vibetether/intent.md',
  target: intentTarget,
  original: intentOriginal,
  content: intentOriginal === null || options.intentContent ? intentContent : intentOriginal,
});
```

For `bootstrapOnly`, require a prior initialization and take a text-only branch immediately after reading the existing provider lock, before the generic dry-run/staging branches:

```js
if (options.bootstrapOnly) {
  if (!manifestOriginal || !existingLock) {
    throw new CliError('VibeTether bootstrap requires an initialized project. Run vibetether init first.', 3);
  }
  const boardTarget = resolveInside(root, '.vibetether/capabilities.yaml');
  const board = createCapabilityBoard(registry, options.profile, existingLock, adapters);
  textPlans.push({
    relativePath: '.vibetether/capabilities.yaml',
    target: boardTarget,
    original: await readTextIfPresent(boardTarget),
    content: `${JSON.stringify(board, null, 2)}\n`,
  });
  if (options.dryRun) return formatDryRun(root, textPlans, []);
  if (!options.yes) throw new CliError('Refusing to change the project without final confirmation.');
  await applyInitialization(root, textPlans, []);
  return `VibeTether bootstrap updated project truth in ${root} without reinstalling providers.\n`;
}
```

This branch updates the Intent Contract, manifest truth routes, capability board, experience index, checkpoint, and managed instruction block. It does not alter the provider lock, call `stageProviders`, or apply any Skill/provider/catalog/license plan.

- [ ] **Step 7: Run bootstrap, init, and transaction regressions**

Run: `node --test test/bootstrap-cli.test.mjs test/cli-init.test.mjs test/init-transaction.test.mjs`

Expected: PASS. The cancellation test must show no filesystem changes and the provider-staging dependency test must show zero calls before final confirmation.

- [ ] **Step 8: Commit the guided CLI**

```bash
git add src/terminal-prompts.mjs src/bootstrap.mjs src/cli.mjs src/init.mjs test/bootstrap-cli.test.mjs test/cli-init.test.mjs test/init-transaction.test.mjs
git commit -m "feat: guide project bootstrap interactively"
```

### Task 3: Create and maintain the metadata-only experience index

**Files:**
- Create: `src/experience-index.mjs`
- Modify: `src/init.mjs`
- Modify: `src/project-scan.mjs`
- Modify: `src/manifest.mjs`
- Create: `test/experience-index.test.mjs`
- Modify: `test/project-scan.test.mjs`
- Modify: `test/cli-init.test.mjs`

- [ ] **Step 1: Write failing schema, safety, and matching tests**

```js
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  EMPTY_EXPERIENCE_INDEX,
  matchExperience,
  parseExperienceIndex,
  serializeExperienceIndex,
  validateExperienceIndex,
} from '../src/experience-index.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-experience-'));
  await mkdir(path.join(root, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'operations', 'github-publishing.md'), '# GitHub publishing\n');
  return root;
}

const index = {
  schema_version: 1,
  entries: [{
    id: 'github-publication',
    use_when: ['github', 'publish', 'release'],
    systems: ['git', 'windows'],
    artifacts: ['docs/operations/github-publishing.md'],
    verified_at: '2026-07-13',
    revalidate_when: ['authentication-method-changes', 'remote-changes'],
    status: 'proven',
  }],
};

test('empty experience index has a stable canonical serialization', () => {
  assert.deepEqual(parseExperienceIndex(serializeExperienceIndex(EMPTY_EXPERIENCE_INDEX)), EMPTY_EXPERIENCE_INDEX);
});

test('exact normalized matches are deterministic and metadata-only', async () => {
  const root = await fixture();
  const result = await matchExperience(index, { root, signals: ['publish', 'windows'] });
  assert.deepEqual(result, [{
    id: 'github-publication',
    status: 'proven',
    match_count: 2,
    artifacts: ['docs/operations/github-publishing.md'],
    verified_at: '2026-07-13',
    requires_revalidation: false,
    revalidation_reasons: [],
  }]);
  assert.equal(JSON.stringify(result).includes('# GitHub publishing'), false);
});

test('unrelated and obsolete experience is omitted', async () => {
  const root = await fixture();
  assert.deepEqual(await matchExperience(index, { root, signals: ['database'] }), []);
  assert.deepEqual(await matchExperience({ ...index, entries: [{ ...index.entries[0], status: 'obsolete' }] }, { root, signals: ['publish'] }), []);
});

test('provisional and changed-environment paths require revalidation', async () => {
  const root = await fixture();
  const [result] = await matchExperience({
    ...index,
    entries: [{ ...index.entries[0], status: 'provisional' }],
  }, { root, signals: ['publish', 'remote-changes'] });
  assert.equal(result.requires_revalidation, true);
  assert.deepEqual(result.revalidation_reasons, ['provisional', 'remote-changes']);
});

test('schema rejects escaping artifacts and secret-bearing metadata', async () => {
  const root = await fixture();
  await assert.rejects(
    validateExperienceIndex({ ...index, entries: [{ ...index.entries[0], artifacts: ['../secret.md'] }] }, root),
    /escapes the project/i,
  );
  await assert.rejects(
    validateExperienceIndex({ ...index, entries: [{ ...index.entries[0], token: 'redacted-test-value' }] }, root),
    /unexpected field.*token|secret-bearing/i,
  );
});
```

- [ ] **Step 2: Run the focused test and verify the module is missing**

Run: `node --test test/experience-index.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/experience-index.mjs`.

- [ ] **Step 3: Implement the canonical experience-index module**

Create `src/experience-index.mjs` with these exports and rules:

```js
import { access } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

export const EMPTY_EXPERIENCE_INDEX = Object.freeze({ schema_version: 1, entries: [] });
const ALLOWED_STATUS = new Set(['proven', 'provisional', 'obsolete']);
const ALLOWED_FIELDS = new Set(['id', 'use_when', 'systems', 'artifacts', 'verified_at', 'revalidate_when', 'status']);
const SECRET_VALUE = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/;
const SIGNAL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalize(value) {
  return String(value).trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function assertArray(entry, field, allowEmpty = false) {
  if (!Array.isArray(entry[field]) || (!allowEmpty && entry[field].length === 0)) {
    throw new Error(`${entry.id ?? 'entry'} ${field} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  }
}

function inside(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Experience artifact escapes the project: ${relativePath}`);
  return target;
}

export function parseExperienceIndex(source) {
  const value = YAML.parse(source);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('experience index must be a mapping');
  return value;
}

export function serializeExperienceIndex(value) {
  return YAML.stringify(value, { lineWidth: 0 });
}

export async function validateExperienceIndex(value, root) {
  if (value?.schema_version !== 1 || !Array.isArray(value.entries)) throw new Error('experience index requires schema_version 1 and entries');
  const ids = new Set();
  for (const entry of value.entries) {
    for (const field of Object.keys(entry)) {
      if (!ALLOWED_FIELDS.has(field)) throw new Error(`Experience entry ${entry.id ?? 'unknown'} has unexpected field ${field}`);
    }
    if (!SIGNAL.test(entry.id ?? '') || ids.has(entry.id)) throw new Error(`Experience entry id is invalid or duplicated: ${entry.id ?? 'missing'}`);
    ids.add(entry.id);
    assertArray(entry, 'use_when');
    assertArray(entry, 'artifacts');
    assertArray(entry, 'revalidate_when', true);
    if (entry.systems !== undefined) assertArray(entry, 'systems', true);
    for (const signal of [...entry.use_when, ...(entry.systems ?? []), ...entry.revalidate_when]) {
      if (normalize(signal) !== signal || !SIGNAL.test(signal)) throw new Error(`Experience entry ${entry.id} has invalid normalized signal: ${signal}`);
    }
    if (!ALLOWED_STATUS.has(entry.status)) throw new Error(`Experience entry ${entry.id} has invalid status: ${entry.status}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.verified_at) || Number.isNaN(Date.parse(`${entry.verified_at}T00:00:00Z`))) {
      throw new Error(`Experience entry ${entry.id} has invalid verified_at`);
    }
    if (SECRET_VALUE.test(JSON.stringify(entry))) throw new Error(`Experience entry ${entry.id} contains secret-bearing metadata`);
    for (const artifact of entry.artifacts) {
      if (typeof artifact !== 'string' || !artifact.trim()) throw new Error(`Experience entry ${entry.id} has an invalid artifact path`);
      await access(inside(root, artifact));
    }
  }
  return value;
}

export async function matchExperience(value, { root, signals = [] }) {
  const active = new Set(signals.map(normalize));
  const matches = [];
  for (const entry of value.entries ?? []) {
    if (!['proven', 'provisional'].includes(entry.status)) continue;
    const matchCount = [...new Set([...entry.use_when, ...(entry.systems ?? [])])].filter((signal) => active.has(signal)).length;
    if (matchCount === 0) continue;
    try {
      for (const artifact of entry.artifacts) await access(inside(root, artifact));
    } catch {
      continue;
    }
    const revalidation = entry.revalidate_when.filter((signal) => active.has(signal));
    matches.push({
      id: entry.id,
      status: entry.status,
      match_count: matchCount,
      artifacts: [...entry.artifacts],
      verified_at: entry.verified_at,
      requires_revalidation: entry.status === 'provisional' || revalidation.length > 0,
      revalidation_reasons: [...(entry.status === 'provisional' ? ['provisional'] : []), ...revalidation],
    });
  }
  return matches.sort((a, b) => b.match_count - a.match_count || b.verified_at.localeCompare(a.verified_at) || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Generate and route the empty index during initialization**

In `src/init.mjs`, reject symlinks for `.vibetether/experience-index.yaml`, add `experience_index` to the manifest, and add this text plan:

```js
manifest = {
  ...manifest,
  experience_index: '.vibetether/experience-index.yaml',
};

const experienceTarget = resolveInside(root, manifest.experience_index);
const experienceOriginal = await readTextIfPresent(experienceTarget);
textPlans.push({
  relativePath: manifest.experience_index,
  target: experienceTarget,
  original: experienceOriginal,
  content: experienceOriginal ?? serializeExperienceIndex(EMPTY_EXPERIENCE_INDEX),
});
```

Do not overwrite a non-empty or modified existing index.

- [ ] **Step 5: Discover real operational documentation without inventing it**

In `src/project-scan.mjs`, add:

```js
const operations = await record('docs/operations', 'operational proven paths');
```

and include it in conditional sources:

```js
operations: operations ? [operations] : [],
```

Update `test/project-scan.test.mjs` to create `docs/operations/github-publishing.md` and assert that `manifest.sources.conditional.operations` equals `['docs/operations/']`. Also assert that an empty project does not gain `CONTEXT.md`, `docs/adr/`, or `docs/operations/`.

- [ ] **Step 6: Run index, scan, and initialization tests**

Run: `node --test test/experience-index.test.mjs test/project-scan.test.mjs test/cli-init.test.mjs`

Expected: PASS, with `.vibetether/experience-index.yaml` present and `project.yaml` pointing to it.

- [ ] **Step 7: Commit the experience substrate**

```bash
git add src/experience-index.mjs src/init.mjs src/project-scan.mjs src/manifest.mjs test/experience-index.test.mjs test/project-scan.test.mjs test/cli-init.test.mjs
git commit -m "feat: add project experience index"
```

### Task 4: Return applicable experience from package and installed route resolvers

**Files:**
- Modify: `src/capabilities.mjs`
- Create: `skills/vibe-tether/scripts/experience-index.mjs`
- Modify: `skills/vibe-tether/scripts/resolve-route.mjs`
- Modify: `test/capabilities.test.mjs`
- Modify: `test/skill-contract.test.mjs`
- Create: `test/installed-experience-resolver.test.mjs`

- [ ] **Step 1: Write failing package resolver assertions**

Extend `test/capabilities.test.mjs` with a fixture containing the GitHub entry from Task 3 and assert:

```js
const result = await showCapabilities({
  project: root,
  phase: 'SHIP',
  capability: 'release-verification',
  signals: ['publish', 'windows'],
  agent: 'codex',
  json: true,
});
const parsed = JSON.parse(result);
assert.equal(parsed.applicable_experience.length, 1);
assert.equal(parsed.applicable_experience[0].id, 'github-publication');
assert.deepEqual(parsed.applicable_experience[0].artifacts, ['docs/operations/github-publishing.md']);
assert.equal(JSON.stringify(parsed).includes('# GitHub publishing'), false);
```

Add an unrelated query with `signals: ['database']` and assert `applicable_experience` is `[]`.

- [ ] **Step 2: Write a failing installed-resolver parity test**

Create `test/installed-experience-resolver.test.mjs` that initializes a core Codex project, writes the same index/artifact, runs both resolvers, and compares only `applicable_experience`:

```js
const packageOutput = JSON.parse(await showCapabilities({
  project: root,
  phase: 'SHIP',
  capability: 'release-verification',
  signals: ['publish', 'windows'],
  agent: 'codex',
  json: true,
}));
const installed = spawnSync(process.execPath, [
  path.join(root, '.agents', 'skills', 'vibe-tether', 'scripts', 'resolve-route.mjs'),
  '--project', root,
  '--phase', 'SHIP',
  '--capability', 'release-verification',
  '--signal', 'publish',
  '--signal', 'windows',
  '--agent', 'codex',
], { encoding: 'utf8' });
assert.equal(installed.status, 0, installed.stderr);
assert.deepEqual(JSON.parse(installed.stdout).applicable_experience, packageOutput.applicable_experience);
```

- [ ] **Step 3: Load and match the index in package route resolution**

Add a context loader while preserving the existing `loadCapabilityBoard` public wrapper:

```js
export async function loadCapabilityContext(project) {
  const root = await realpath(path.resolve(project));
  const manifest = parseManifest(await readFile(inside(root, '.vibetether/project.yaml', 'Manifest'), 'utf8'));
  const board = await parseYaml(inside(root, manifest.capability_board, 'Capability board'), 'capability board');
  const experiencePath = manifest.experience_index ?? '.vibetether/experience-index.yaml';
  const experience = parseExperienceIndex(await readFile(inside(root, experiencePath, 'Experience index'), 'utf8'));
  return { root, manifest, board: await refreshBoardAvailability(board, root), experience };
}

export async function loadCapabilityBoard(project) {
  return (await loadCapabilityContext(project)).board;
}
```

In `showCapabilities`, keep the no-query dashboard behavior and attach matches only for a route query:

```js
const context = await loadCapabilityContext(options.project);
const result = resolveBoardRoute(context.board, options);
result.applicable_experience = await matchExperience(context.experience, {
  root: context.root,
  signals: options.signals,
});
```

Human output must list only matched entry IDs, status/revalidation label, and artifact paths.

- [ ] **Step 4: Add a zero-dependency installed parser/matcher**

Create `skills/vibe-tether/scripts/experience-index.mjs` with this zero-dependency parser and matcher. It accepts only the published `YAML.stringify` subset and rejects unknown shapes instead of guessing:

```js
import { access } from 'node:fs/promises';
import path from 'node:path';

function scalar(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalized(value) {
  return String(value).trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function projectPath(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Experience artifact escapes the project: ${relativePath}`);
  return target;
}

export function parseExperienceIndex(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim() && !line.trim().startsWith('#'));
  const index = { schema_version: null, entries: [] };
  let current = null;
  let listKey = null;
  for (const line of lines) {
    let match;
    if ((match = line.match(/^schema_version:\s*(\d+)\s*$/))) {
      index.schema_version = Number(match[1]);
      continue;
    }
    if (/^entries:\s*$/.test(line)) continue;
    if ((match = line.match(/^  - id:\s*(.+?)\s*$/))) {
      current = { id: scalar(match[1]) };
      index.entries.push(current);
      listKey = null;
      continue;
    }
    if (!current) throw new Error(`Invalid experience index line: ${line}`);
    if ((match = line.match(/^    (id|verified_at|status):\s*(.+?)\s*$/))) {
      current[match[1]] = scalar(match[2]);
      listKey = null;
      continue;
    }
    if ((match = line.match(/^    (use_when|systems|artifacts|revalidate_when):\s*\[\]\s*$/))) {
      current[match[1]] = [];
      listKey = null;
      continue;
    }
    if ((match = line.match(/^    (use_when|systems|artifacts|revalidate_when):\s*$/))) {
      listKey = match[1];
      current[listKey] = [];
      continue;
    }
    if ((match = line.match(/^      -\s+(.+?)\s*$/)) && listKey) {
      current[listKey].push(scalar(match[1]));
      continue;
    }
    throw new Error(`Unsupported experience index shape: ${line}`);
  }
  if (index.schema_version !== 1 || !Array.isArray(index.entries)) throw new Error('Experience index requires schema_version 1 and entries');
  return index;
}

export async function matchExperience(index, { root, signals = [] }) {
  const active = new Set(signals.map(normalized));
  const matches = [];
  for (const entry of index.entries) {
    if (!['proven', 'provisional'].includes(entry.status)) continue;
    const candidates = [...new Set([...(entry.use_when ?? []), ...(entry.systems ?? [])])];
    const matchCount = candidates.filter((signal) => active.has(normalized(signal))).length;
    if (matchCount === 0) continue;
    try {
      for (const artifact of entry.artifacts ?? []) await access(projectPath(root, artifact));
    } catch {
      continue;
    }
    const revalidation = (entry.revalidate_when ?? []).filter((signal) => active.has(normalized(signal)));
    matches.push({
      id: entry.id,
      status: entry.status,
      match_count: matchCount,
      artifacts: [...entry.artifacts],
      verified_at: entry.verified_at,
      requires_revalidation: entry.status === 'provisional' || revalidation.length > 0,
      revalidation_reasons: [...(entry.status === 'provisional' ? ['provisional'] : []), ...revalidation],
    });
  }
  return matches.sort((a, b) => b.match_count - a.match_count || b.verified_at.localeCompare(a.verified_at) || a.id.localeCompare(b.id));
}
```

The implementation is complete when the parity test passes for proven, provisional, revalidation, obsolete, missing-artifact, multi-match, and no-match cases.

- [ ] **Step 5: Enhance the installed resolver**

In `skills/vibe-tether/scripts/resolve-route.mjs`, read `.vibetether/project.yaml` to find `experience_index`, load it after route resolution, and emit:

```js
const applicableExperience = await matchExperience(experienceIndex, {
  root,
  signals: options.signals,
});
process.stdout.write(`${JSON.stringify({ ...resolution, applicable_experience: applicableExperience }, null, 2)}\n`);
```

If the index is missing or invalid, fail with an actionable message telling the user to run `vibetether doctor`; do not silently treat corruption as an empty match.

- [ ] **Step 6: Run resolver and Skill contract tests**

Run: `node --test test/capabilities.test.mjs test/installed-experience-resolver.test.mjs test/skill-contract.test.mjs`

Expected: PASS, and the installed resolver output must contain no artifact body.

- [ ] **Step 7: Commit deterministic experience recall**

```bash
git add src/capabilities.mjs skills/vibe-tether/scripts/experience-index.mjs skills/vibe-tether/scripts/resolve-route.mjs test/capabilities.test.mjs test/skill-contract.test.mjs test/installed-experience-resolver.test.mjs
git commit -m "feat: recall applicable proven paths"
```

### Task 5: Enforce index health, capture consistency, and safe uninstall behavior

**Files:**
- Modify: `src/doctor.mjs`
- Modify: `src/uninstall.mjs`
- Modify: `skills/vibe-tether/scripts/validate-project.mjs`
- Modify: `test/cli-lifecycle.test.mjs`
- Modify: `test/uninstall-transaction.test.mjs`

- [ ] **Step 1: Write failing doctor tests for malformed and inconsistent experience**

Add these cases to `test/cli-lifecycle.test.mjs`:

```js
test('doctor rejects captured reusable operations missing from the experience index', async () => {
  const root = await initializedProject('captured-missing-index');
  await mkdir(path.join(root, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'operations', 'release.md'), '# Release\n');
  await setExperienceFeedback(root, {
    trigger: 'first-proven-path',
    disposition: 'captured',
    reason: 'The release workflow succeeded with fresh remote evidence.',
    artifacts: ['docs/operations/release.md'],
  });
  const report = await doctorFailure(root);
  assert.equal(report.issues.some((issue) => issue.code === 'unindexed-experience-artifact'), true);
});

test('doctor accepts already-encoded operations only when an index entry remains valid', async () => {
  const root = await initializedProject('already-encoded');
  await writeOperationalExperience(root, 'release-path', 'docs/operations/release.md');
  await setExperienceFeedback(root, {
    trigger: 'repeat-path',
    disposition: 'already-encoded',
    reason: 'The unchanged path is already documented and indexed.',
    artifacts: ['docs/operations/release.md'],
  });
  assert.match(await inspectProject({ project: root, json: false }), /healthy/);
});

test('doctor rejects secret-bearing and escaping index entries', async () => {
  const root = await initializedProject('unsafe-index');
  await writeFile(path.join(root, '.vibetether', 'experience-index.yaml'), `schema_version: 1\nentries:\n  - id: unsafe\n    use_when: [release]\n    artifacts: [../secret.md]\n    verified_at: 2026-07-14\n    revalidate_when: []\n    status: proven\n    token: redacted-test-value\n`);
  const report = await doctorFailure(root);
  assert.equal(report.issues.some((issue) => ['invalid-experience-index', 'experience-artifact-escape'].includes(issue.code)), true);
});
```

- [ ] **Step 2: Write failing uninstall lifecycle tests**

```js
test('uninstall removes an unchanged empty VibeTether experience index', async () => {
  const root = await initializedProject('uninstall-empty-index');
  await uninstall({ project: root, yes: true, dryRun: false });
  assert.equal(await exists(path.join(root, '.vibetether', 'experience-index.yaml')), false);
});

test('uninstall preserves a non-empty experience index and its manifest route', async () => {
  const root = await initializedProject('uninstall-user-index');
  await writeOperationalExperience(root, 'release-path', 'docs/operations/release.md');
  await uninstall({ project: root, yes: true, dryRun: false });
  assert.equal(await exists(path.join(root, '.vibetether', 'experience-index.yaml')), true);
  const manifest = YAML.parse(await readFile(path.join(root, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(manifest.experience_index, '.vibetether/experience-index.yaml');
});
```

- [ ] **Step 3: Integrate canonical validation into doctor**

After manifest parsing in `src/doctor.mjs`, load `manifest.experience_index` with the same project-containment helper, parse it, and call `validateExperienceIndex`. On failure add:

```js
issues.push(issue('invalid-experience-index', `Cannot validate experience index: ${error.message}`));
```

Pass the parsed index into `validateExperienceFeedback`. For `captured` or `already-encoded`, require each reusable artifact outside `skills/vibe-tether/` and `evals/` to appear in at least one non-obsolete entry:

```js
const indexedArtifacts = new Set(
  (experienceIndex?.entries ?? [])
    .filter((entry) => entry.status !== 'obsolete')
    .flatMap((entry) => entry.artifacts),
);
if (reusable && !indexedArtifacts.has(artifact)) {
  issues.push(issue('unindexed-experience-artifact', `Reusable experience artifact is not indexed: ${artifact}`));
}
```

Keep the existing manifest-route and file-existence checks.

- [ ] **Step 4: Mirror basic index checks in the installed validator**

Extend `skills/vibe-tether/scripts/validate-project.mjs` so `parseManifest` reads `experience_index`, requires the path, verifies containment/existence, parses the supported index subset, and reports malformed/escaping/missing artifacts. The installed validator may perform structural and path validation; it must not claim semantic correctness.

- [ ] **Step 5: Implement uninstall ownership behavior**

Load the index before building removal plans:

```js
const canonicalEmptyIndex = serializeExperienceIndex(EMPTY_EXPERIENCE_INDEX);
const experienceOriginal = await readTextIfPresent(experiencePath);
const removeExperience = experienceOriginal === canonicalEmptyIndex;
if (removeExperience) {
  textPlans.push({
    relativePath: manifest.experience_index,
    target: experiencePath,
    original: experienceOriginal,
    content: '',
    removeFile: true,
  });
  delete manifest.experience_index;
}
```

If the file is non-empty, modified, malformed, or absent, preserve it and preserve the manifest route. Never delete operational artifacts.

- [ ] **Step 6: Run lifecycle, installed validation, and transaction tests**

Run: `node --test test/cli-lifecycle.test.mjs test/uninstall-transaction.test.mjs test/skill-contract.test.mjs`

Expected: PASS. The modified/non-empty index case must survive uninstall; the canonical empty index must not.

- [ ] **Step 7: Commit health and lifecycle enforcement**

```bash
git add src/doctor.mjs src/uninstall.mjs skills/vibe-tether/scripts/validate-project.mjs test/cli-lifecycle.test.mjs test/uninstall-transaction.test.mjs test/skill-contract.test.mjs
git commit -m "feat: validate proven path lifecycle"
```

### Task 6: Teach generated agents and capability routing when to bootstrap and recall

**Files:**
- Modify: `src/adapters.mjs`
- Modify: `skills/vibe-tether/SKILL.md`
- Modify: `skills/vibe-tether/references/project-manifest.md`
- Modify: `skills/vibe-tether/references/capability-routing.md`
- Modify: `skills/vibe-tether/references/scenario-routing.md`
- Modify: `skills/vibe-tether/references/success-capture.md`
- Modify: `registry/capabilities.json`
- Modify: `registry/scenarios.json`
- Modify: `registry/providers/core.json`
- Modify: `registry/bundles.json`
- Modify: `registry/catalogs/mattpocock.json`
- Modify: `test/registry.test.mjs`
- Modify: `test/routing-scenarios.test.mjs`
- Modify: `test/skill-contract.test.mjs`

- [ ] **Step 1: Write failing control-contract assertions**

Add assertions that the managed block and public Skill contain these obligations:

```js
assert.match(managedBody, /experience-index\.yaml/);
assert.match(managedBody, /query applicable experience at task entry/i);
assert.match(managedBody, /read the returned artifacts before inventing a new operational path/i);
assert.match(managedBody, /record.*selected experience paths.*material reason/i);
assert.match(skill, /project-bootstrap/);
assert.match(skill, /proven-path-recall/);
assert.match(skill, /requires_revalidation/);
```

In `test/routing-scenarios.test.mjs`, add:

```js
['greenfield project', 'DISCOVER', 'project-bootstrap', ['greenfield-directory', 'intent-unresolved'], 'grilling'],
['known publication path', 'SHIP', 'proven-path-recall', ['publish', 'windows'], 'vibetether-built-in-recall'],
```

- [ ] **Step 2: Add explicit capability definitions**

Append these objects to `registry/capabilities.json`:

```json
{
  "id": "project-bootstrap",
  "phases": ["DISCOVER", "ALIGN"],
  "purpose": "Establish confirmed user-owned direction and route real project truth before implementation.",
  "invoke_when": ["greenfield-directory", "truth-sources-missing", "intent-unresolved"],
  "required_inputs": ["project_discovery", "known_direction", "unresolved_user_decisions"],
  "required_outputs": ["intent_contract", "routed_project_truth", "readiness_verdict"],
  "exit_evidence": ["Goal and success evidence are confirmed, or the checkpoint remains at DISCOVER without guessed direction."],
  "fallback": "Use the built-in bootstrap readiness model and ask one recommended directional question at a time."
},
{
  "id": "proven-path-recall",
  "phases": ["ALIGN", "PLAN", "EXECUTE_ONE", "VERIFY", "SHIP"],
  "purpose": "Recall applicable verified operational paths before rediscovering repeatable work.",
  "invoke_when": ["build", "local-environment", "ci", "deployment", "publish", "migration", "authentication", "external-service", "recovery", "release"],
  "required_inputs": ["task_signals", "experience_index", "environment_change_signals"],
  "required_outputs": ["applicable_experience", "artifacts_read", "revalidation_needs", "selection_reason"],
  "exit_evidence": ["A matching path was read, or a material no-match or stale reason was recorded before consequential action."],
  "fallback": "Use the built-in metadata resolver; no community provider is required."
}
```

Add corresponding scenarios `greenfield-bootstrap` and `known-proven-path` to `registry/scenarios.json`. Route `project-bootstrap` to `grilling`; route `proven-path-recall` to the built-in VibeTether provider rather than a community Skill.

Update the other routing registries consistently:

- add `project-bootstrap` to `mattpocock-grilling.capabilities` in `registry/catalogs/mattpocock.json`;
- add a standard-profile route in `registry/bundles.json` with provider `grilling`, signals `greenfield-directory`, `truth-sources-missing`, and `intent-unresolved`;
- add `project-bootstrap` to `vibetether-built-in-alignment.capabilities` in `registry/providers/core.json` as the provider-free fallback;
- add this built-in provider to `registry/providers/core.json`:

```json
{
  "id": "vibetether-built-in-recall",
  "kind": "built-in",
  "workflow_role": "primary",
  "phases": ["align", "plan", "execute", "verify", "ship"],
  "capabilities": ["proven-path-recall"],
  "enabled_by_default": true
}
```

- [ ] **Step 3: Update generated instruction rules**

Add these lines to `sharedRules` in `src/adapters.mjs` and preserve the previous body in `LEGACY_MANAGED_BODIES` so upgrades remain safe:

```js
'Query applicable experience from `.vibetether/experience-index.yaml` at task entry, phase changes, resume, and before repeatable build, environment, CI, deployment, publication, migration, authentication, external-service, recovery, or release actions.',
'Read the returned artifacts before inventing a new operational path; record selected experience paths or the material reason a candidate was stale or inapplicable in the checkpoint.',
'Treat provisional or changed-environment paths as requiring fresh revalidation, then update the natural artifact and metadata index after verified success.',
```

- [ ] **Step 4: Update the public Skill and focused references**

Add a `Project Bootstrap and Proven Path Recall` section to `skills/vibe-tether/SKILL.md` that says:

```markdown
When project direction is unresolved, route to `project-bootstrap`; do not start product implementation from a directory name, package metadata, or agent preference. In an interactive terminal, use guided `vibetether init` or `vibetether bootstrap`. In automation, require explicit goal and success evidence or leave the lifecycle at `DISCOVER`.

Before repeatable operational work, resolve `proven-path-recall` with current task and environment signals. Read only returned artifacts, not the entire index corpus. A `provisional` result or `requires_revalidation: true` guides investigation but is not known-good until fresh evidence passes. If a matching proven path is not used, record the material applicability reason.
```

Update the four references so they define the index field, capture/update sequence, deduplication by entry ID plus artifact path, and the exact resolver command. Do not duplicate the full schema in every reference; `success-capture.md` owns write semantics and `capability-routing.md` owns read semantics.

- [ ] **Step 5: Run registry, scenario, and Skill contract tests**

Run: `node --test test/registry.test.mjs test/routing-scenarios.test.mjs test/skill-contract.test.mjs`

Expected: PASS. Each scenario must resolve one primary recommendation and retain a safe built-in fallback.

- [ ] **Step 6: Commit automatic control rules**

```bash
git add src/adapters.mjs skills/vibe-tether/SKILL.md skills/vibe-tether/references/project-manifest.md skills/vibe-tether/references/capability-routing.md skills/vibe-tether/references/scenario-routing.md skills/vibe-tether/references/success-capture.md registry/capabilities.json registry/scenarios.json registry/providers/core.json registry/bundles.json registry/catalogs/mattpocock.json test/registry.test.mjs test/routing-scenarios.test.mjs test/skill-contract.test.mjs
git commit -m "feat: route bootstrap and proven path recall"
```

### Task 7: Add focused behavioral evaluations and an offline acceptance tour

**Files:**
- Create: `evals/scenarios/greenfield-bootstrap.json`
- Create: `evals/scenarios/proven-path-recall.json`
- Modify: `evals/run-static-evals.mjs`
- Modify: `scripts/manual-acceptance-tour.mjs`
- Modify: `test/evals.test.mjs`
- Modify: `test/public-release.test.mjs`

- [ ] **Step 1: Add failing evaluation expectations**

Extend `test/evals.test.mjs` to assert the report includes:

```js
assert.match(report, /greenfield-bootstrap/);
assert.match(report, /proven-path-recall/);
```

Extend the acceptance-tour public test to require output containing `guided bootstrap`, `applicable experience`, and `doctor healthy`.

- [ ] **Step 2: Add deterministic scenario fixtures**

Create `evals/scenarios/greenfield-bootstrap.json`:

```json
{
  "id": "greenfield-bootstrap",
  "request": "Build me a project",
  "project_state": "empty-directory",
  "expected": {
    "phase": "DISCOVER",
    "capability": "project-bootstrap",
    "provider": "grilling",
    "must_not": ["write-product-code", "guess-goal", "guess-success-evidence"]
  }
}
```

Create `evals/scenarios/proven-path-recall.json`:

```json
{
  "id": "proven-path-recall",
  "request": "Publish the current branch to GitHub from Windows",
  "signals": ["publish", "github", "windows"],
  "expected": {
    "phase": "SHIP",
    "capability": "proven-path-recall",
    "artifact": "docs/operations/github-publishing.md",
    "must_precede": "invent-new-publication-command"
  }
}
```

- [ ] **Step 3: Extend the static evaluator without inventing model metrics**

Teach `evals/run-static-evals.mjs` to verify both scenarios against registry capability/scenario data and print:

```text
greenfield-bootstrap: PASS
proven-path-recall: PASS
```

Do not add a Token A/B benchmark, Token-cost estimate, or net-savings conclusion; these evaluations cover only deterministic core control contracts.

- [ ] **Step 4: Extend the manual offline tour**

Add a temporary core-profile project sequence to `scripts/manual-acceptance-tour.mjs`:

```js
await main([
  'init', '--project', project, '--profile', 'core', '--yes',
  '--goal', 'Help a beginner complete a controlled long-running task.',
  '--success-evidence', 'Doctor and applicable-experience checks pass.',
]);
await writeFile(path.join(project, 'docs', 'operations', 'github-publishing.md'), '# GitHub publishing\n');
await writeFile(path.join(project, '.vibetether', 'experience-index.yaml'), serializeExperienceIndex(exampleIndex));
const route = JSON.parse(await main([
  'capabilities', '--project', project, '--phase', 'SHIP',
  '--capability', 'proven-path-recall', '--signal', 'publish', '--signal', 'windows', '--json',
]));
assert.equal(route.applicable_experience[0].id, 'github-publication');
await main(['doctor', '--project', project]);
```

- [ ] **Step 5: Run focused evaluations and acceptance tour**

Run: `node --test test/evals.test.mjs test/public-release.test.mjs && npm run eval && npm run acceptance:tour`

Expected: PASS; static report shows both core control scenarios.

- [ ] **Step 6: Commit functional evaluations**

```bash
git add evals/scenarios/greenfield-bootstrap.json evals/scenarios/proven-path-recall.json evals/run-static-evals.mjs scripts/manual-acceptance-tour.mjs test/evals.test.mjs test/public-release.test.mjs
git commit -m "test: cover bootstrap and experience recall"
```

### Task 8: Rewrite README around beginner control and honest frontier-model positioning

**Files:**
- Modify: `README.md`
- Modify: `test/public-release.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing README product-message assertions**

Add these assertions before editing the README:

```js
assert.match(readme, /stronger agents such as Claude Fable 5 and GPT-5\.6/i);
assert.match(readme, /aims to reduce long-task drift and expensive rework/i);
assert.doesNotMatch(readme, /net Token savings|saves? Tokens|reduce(?:s|d)? Token usage|lower Token cost/i);
assert.match(readme, /npx --yes github:t01089572455\/vibetether init/);
assert.match(readme, /outer `npx --yes`[\s\S]*VibeTether's own `--yes`/i);
assert.match(readme, /vibetether bootstrap/);
assert.match(readme, /experience-index\.yaml/);
assert.match(readme, /applicable_experience/);
assert.match(readme, /first-proven-path/);
```

Keep all existing assertions for provider counts, bundles, provenance, Windows recovery, uninstall, and preview evidence.

- [ ] **Step 2: Reorder README without dropping advanced content**

Use this exact top-level order:

```markdown
# VibeTether

Direction control for long-running AI coding work.

Designed for stronger agents such as Claude Fable 5 and GPT-5.6, VibeTether aims to reduce long-task drift and expensive rework. It keeps project truth, readiness, Skill routing, checkpoints, verification, and reusable success visible across long tasks, Goal mode, compaction, resume, and handoff.

## Why VibeTether exists
## The control loop
## Quick start
## Guided project bootstrap
## How automatic routing works
## Proven Path capture and recall
## Long tasks and Goal mode
## Evidence and current limits
## Fastest setup: install everything
## Customize the installation
## Profiles and bundles
## When should I use what?
## Walkthroughs
## Catalog vs exposure
## Codex and Claude
## Upgrade and repair
## Troubleshooting
## Provider provenance and licensing
## Personal acceptance tour
```

Move existing advanced tables and recovery instructions under the later headings rather than deleting them.

- [ ] **Step 3: Add the simplest guided transcript and generated tree**

Document:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether init
```

Then show a short transcript with three prompts, preview, and final confirmation. Explain that outer `npx --yes` authorizes npm acquisition, while VibeTether's own trailing `--yes` disables its interactive project questions. Show the generated project tree including `.vibetether/experience-index.yaml` and state that no fake PRD, ADR, or runbook is created.

- [ ] **Step 4: Explain the full novice-facing autonomous loop**

The README must state all of the following in plain English:

- the user can describe a project without knowing Skill names;
- VibeTether checks whether goal and success evidence are sufficient before product work;
- it recommends an installed specialist such as `grilling`, but the recommendation remains advisory;
- it re-reads project truth after compaction/resume and before consequential phase changes;
- it records the first verified reusable path even when the first attempt succeeded;
- it returns only relevant Proven Path metadata, then the agent reads the selected artifact;
- it asks for confirmation on directional/high-risk decisions and lets local reversible technical choices proceed;
- project instructions improve control and auditability but are not a security sandbox and cannot guarantee every host invocation.

- [ ] **Step 5: Keep evidence language precise and remove Token-savings plans**

Retain the existing preview evidence (`30/30` versus `24/30`, `35.0%` overhead) as routing-discipline evidence. Add:

```markdown
These preview checks support rule reading, route selection, safety gates, and success capture. They do not prove zero drift, automatic compliance by every host, or measured Token savings. VibeTether does not make a Token-savings claim; the product goal is fewer direction errors and fewer expensive rebuilds.
```

Do not add an A/B Token benchmark to the roadmap.

- [ ] **Step 6: Update package description to match the public promise**

Set:

```json
"description": "Direction control, guided readiness, Skill routing, and Proven Path recall for long-running coding agents."
```

- [ ] **Step 7: Run README and package contract tests**

Run: `node --test test/public-release.test.mjs`

Expected: PASS with all old installation, provider, recovery, and provenance assertions plus the new guided-bootstrap and experience-recall assertions.

- [ ] **Step 8: Commit the public product story**

```bash
git add README.md package.json test/public-release.test.mjs
git commit -m "docs: explain long-task control for stronger agents"
```

### Task 9: Run full verification and close the controlled-delivery packet

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-guided-bootstrap-and-experience-recall-design.md`
- Modify outside the public repository: `<workspace-root>/.scratch/vibetether-guided-bootstrap-experience-recall/AGENT_DELIVERY.md`

- [ ] **Step 1: Run the complete package check**

Run: `npm run check`

Expected: exit code 0; all Node tests, static evaluations, and public Skill self-validation pass.

- [ ] **Step 2: Run the offline personal acceptance tour**

Run: `npm run acceptance:tour`

Expected: exit code 0 and output names guided bootstrap, applicable experience, doctor health, and successful uninstall behavior.

- [ ] **Step 3: Verify the package contents**

Run: `npm pack --dry-run`

Expected: exit code 0; output includes `src/bootstrap-model.mjs`, `src/bootstrap.mjs`, `src/terminal-prompts.mjs`, `src/experience-index.mjs`, installed resolver scripts, README, registries, evaluations, and operational docs. It must contain no `.scratch/`, local paths, credentials, or private test fixtures.

- [ ] **Step 4: Review the final diff for scope and public leakage**

Run:

```bash
git diff --check
git status --short
git diff --stat e759b7f..HEAD
git grep -n -E 'BEGIN (OPENSSH|RSA|EC) PRIVATE KEY|ghp_[A-Za-z0-9_]{20,}|[A-Za-z]:[\\/]' -- README.md src skills registry evals docs package.json
```

Expected: `git diff --check` passes; the secret/local-path grep produces no matches; changes remain limited to guided bootstrap, experience recall, control rules, evaluations, and README/package copy.

- [ ] **Step 5: Mark the spec implemented only after raw evidence passes**

Change the spec status to:

```text
Status: Implemented and locally verified
```

Do not change it if any applicable check fails.

- [ ] **Step 6: Complete and validate the outer controlled-delivery packet**

Record exact commands, exit codes, raw evidence paths, scope review, known limitations, and the Success Capture disposition in `<workspace-root>/.scratch/vibetether-guided-bootstrap-experience-recall/AGENT_DELIVERY.md`. Set `Status: complete`, then run:

```powershell
python <workspace-root>/.agents/skills/gyws-controlled-delivery/scripts/validate_delivery_packet.py <workspace-root>/.scratch/vibetether-guided-bootstrap-experience-recall/AGENT_DELIVERY.md
```

Expected: `VALID`.

- [ ] **Step 7: Run VibeTether doctor for the containing workspace**

Run:

```powershell
node <workspace-root>/.agents/skills/vibe-tether/scripts/validate-project.mjs --project <workspace-root>
```

Expected: valid. Also inspect `.vibetether/state/current.yaml` and record a non-pending Success Capture disposition before completion. Upgrading the containing workspace to the unreleased code is outside this implementation plan.

- [ ] **Step 8: Commit verification records without publishing**

```bash
git add docs/superpowers/specs/2026-07-14-guided-bootstrap-and-experience-recall-design.md
git commit -m "docs: record guided control verification"
```

Do not push, publish, deploy, or create a release. Those remain separate user-confirmed actions.
