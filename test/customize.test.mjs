import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import YAML from 'yaml';
import { main } from '../src/cli.mjs';
import { createTerminalPromptAdapter } from '../src/terminal-prompts.mjs';

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function initializedProject(name, agent = 'codex') {
  const root = await mkdtemp(path.join(os.tmpdir(), `vibetether-customize-${name}-`));
  const output = await main([
    'init', '--project', root, '--agent', agent, '--profile', 'core', '--yes',
    '--goal', 'Help a maintainer keep long agent work aligned.',
    '--success-evidence', 'Focused route tests pass.',
  ]);
  assert.match(output, /initialized/i);
  return root;
}

async function installSkill(root, harness, skill) {
  const parent = harness === 'codex' ? '.agents' : '.claude';
  const directory = path.join(root, parent, 'skills', skill);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'SKILL.md'), `# ${skill}\n`, 'utf8');
}

function scriptedPrompt(answers = {}, confirmed = true) {
  return {
    interactive: true,
    asked: [],
    confirmations: [],
    closed: 0,
    async ask(question) {
      this.asked.push(question);
      const answer = answers[question.id];
      return typeof answer === 'function'
        ? answer(question)
        : answer ?? question.recommended ?? question.default ?? '';
    },
    async confirm(summary) {
      this.confirmations.push(summary);
      return confirmed;
    },
    close() {
      this.closed += 1;
    },
  };
}

function routeAnswers(overrides = {}) {
  return {
    skill: 'to-issues',
    phase_capability: 'PLAN::planning',
    role: 'alternative',
    signals: ['prd-approved'],
    expected_outputs: 'scoped-issues, acceptance-criteria',
    exit_evidence: 'Every approved requirement is mapped to an issue.',
    ...overrides,
  };
}

test('customize recommends alternative and writes a validated project-owned route after confirmation', async () => {
  const root = await initializedProject('write');
  await installSkill(root, 'codex', 'to-issues');
  const promptAdapter = scriptedPrompt(routeAnswers());

  const output = await main(['customize', '--project', root], { promptAdapter });

  assert.match(output, /added.*project route/i);
  assert.equal(promptAdapter.closed, 1);
  assert.equal(promptAdapter.confirmations.length, 1);
  assert.match(promptAdapter.confirmations[0], /to-issues[\s\S]*PLAN[\s\S]*planning[\s\S]*alternative/i);
  const source = await readFile(path.join(root, '.vibetether', 'routes.local.yaml'), 'utf8');
  const document = YAML.parse(source);
  assert.equal(document.schema_version, 1);
  assert.equal(document.routes.length, 1);
  assert.deepEqual(document.routes[0], {
    id: 'project-to-issues-planning',
    phases: ['PLAN'],
    capability: 'planning',
    when_any: ['prd-approved'],
    skill: 'to-issues',
    role: 'alternative',
    use_when: ['Use to-issues for planning when prd-approved is observed.'],
    expected_outputs: ['scoped-issues', 'acceptance-criteria'],
    exit_evidence: ['Every approved requirement is mapped to an issue.'],
  });
  const manifest = YAML.parse(await readFile(path.join(root, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(manifest.project_routes, '.vibetether/routes.local.yaml');
  const generated = JSON.parse(await readFile(path.join(root, '.vibetether', 'capabilities.yaml'), 'utf8'));
  assert.equal(Object.hasOwn(generated, 'project_routes'), false);
});

test('customize dry-run and cancellation write nothing', async () => {
  const root = await initializedProject('no-write');
  await installSkill(root, 'codex', 'to-issues');
  const target = path.join(root, '.vibetether', 'routes.local.yaml');

  const dryPrompt = scriptedPrompt(routeAnswers());
  const preview = await main(['customize', '--project', root, '--dry-run'], { promptAdapter: dryPrompt });
  assert.match(preview, /DRY RUN[\s\S]*to-issues/i);
  assert.equal(dryPrompt.confirmations.length, 0);
  assert.equal(await exists(target), false);

  const cancelPrompt = scriptedPrompt(routeAnswers(), false);
  const cancelled = await main(['customize', '--project', root], { promptAdapter: cancelPrompt });
  assert.match(cancelled, /cancelled.*no files were changed/i);
  assert.equal(await exists(target), false);
});

test('customize defaults to alternative and refuses unsafe or incomplete answers', async () => {
  const root = await initializedProject('answers');
  await installSkill(root, 'codex', 'to-issues');
  const recommended = scriptedPrompt(routeAnswers({ role: undefined }));
  await main(['customize', '--project', root], { promptAdapter: recommended });
  const document = YAML.parse(await readFile(path.join(root, '.vibetether', 'routes.local.yaml'), 'utf8'));
  assert.equal(document.routes[0].role, 'alternative');

  const invalidRoot = await initializedProject('invalid');
  await installSkill(invalidRoot, 'codex', 'to-issues');
  for (const [overrides, expected] of [
    [{ skill: '../escape' }, /installed project skill/i],
    [{ phase_capability: 'SHIP::missing' }, /phase.*capability/i],
    [{ role: 'router' }, /role/i],
    [{ role: 'primary', signals: [] }, /primary.*signal/i],
  ]) {
    const invalidPrompt = scriptedPrompt(routeAnswers(overrides));
    await assert.rejects(
      main(['customize', '--project', invalidRoot], { promptAdapter: invalidPrompt }),
      expected,
    );
    assert.equal(invalidPrompt.closed, 1);
    assert.equal(await exists(path.join(invalidRoot, '.vibetether', 'routes.local.yaml')), false);
  }
});

test('customize appends to a valid overlay and rejects a duplicate generated route id', async () => {
  const root = await initializedProject('append');
  await installSkill(root, 'codex', 'to-issues');
  await installSkill(root, 'codex', 'request-refactor-plan');
  await main(['customize', '--project', root], { promptAdapter: scriptedPrompt(routeAnswers()) });

  await main(['customize', '--project', root], {
    promptAdapter: scriptedPrompt(routeAnswers({
      skill: 'request-refactor-plan',
      role: 'overlay',
      signals: ['large-change'],
    })),
  });
  const target = path.join(root, '.vibetether', 'routes.local.yaml');
  const document = YAML.parse(await readFile(target, 'utf8'));
  assert.equal(document.routes.length, 2);

  const before = await readFile(target, 'utf8');
  await assert.rejects(
    main(['customize', '--project', root], { promptAdapter: scriptedPrompt(routeAnswers()) }),
    /duplicate.*route id/i,
  );
  assert.equal(await readFile(target, 'utf8'), before);
});

test('init bootstrap and uninstall preserve user route bytes', async () => {
  const root = await initializedProject('lifecycle');
  await installSkill(root, 'codex', 'to-issues');
  const routePath = path.join(root, '.vibetether', 'routes.local.yaml');
  const bytes = 'schema_version: 1\nroutes:\n  - id: project-to-issues-planning\n    phases: [PLAN]\n    capability: planning\n    when_any: [prd-approved]\n    skill: to-issues\n    role: alternative\n    use_when: [Use local issue planning.]\n    expected_outputs: [scoped-issues]\n    exit_evidence: [Every requirement is mapped.]\n';
  await writeFile(routePath, bytes, 'utf8');

  await main([
    'init', '--project', root, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Help a maintainer keep long agent work aligned.',
    '--success-evidence', 'Focused route tests pass.',
  ]);
  assert.equal(await readFile(routePath, 'utf8'), bytes);
  let manifest = YAML.parse(await readFile(path.join(root, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(manifest.project_routes, '.vibetether/routes.local.yaml');

  await main(['bootstrap', '--project', root, '--dry-run']);
  assert.equal(await readFile(routePath, 'utf8'), bytes);
  await main(['bootstrap', '--project', root, '--yes']);
  assert.equal(await readFile(routePath, 'utf8'), bytes);

  await main(['uninstall', '--project', root, '--yes']);
  assert.equal(await readFile(routePath, 'utf8'), bytes);
  manifest = YAML.parse(await readFile(path.join(root, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(manifest.project_routes, '.vibetether/routes.local.yaml');
});

test('customize help is discoverable and unsupported automation fails before writes', async () => {
  const help = await main(['customize', '--help']);
  assert.match(help, /vibetether customize/);
  assert.match(help, /--dry-run/);
  await assert.rejects(main(['customize', '--yes']), /unknown option.*customize/i);
});

test('terminal prompts accept numbered multi-select answers for observable signals', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  input.write('1, 3\n1\n');
  const prompt = createTerminalPromptAdapter({ input, output });

  const answer = await prompt.ask({
    id: 'signals',
    prompt: 'Which observable signals should activate this route?',
    choices: [
      { value: 'prd-approved', label: 'PRD approved' },
      { value: 'design-approved', label: 'Design approved' },
      { value: 'large-change', label: 'Large change' },
    ],
    multiple: true,
    required: true,
  });
  prompt.close();

  assert.deepEqual(answer, ['prd-approved', 'large-change']);
});

test('terminal multi-select can open one guided custom signal answer', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  const prompt = createTerminalPromptAdapter({ input, output });

  const answerPromise = prompt.ask({
    id: 'signals',
    prompt: 'Which observable signals should activate this route?',
    choices: [
      { value: 'design-approved', label: 'Design approved' },
      {
        value: 'custom-signal',
        label: 'Enter custom signals',
        customPrompt: {
          id: 'custom_signals',
          prompt: 'Enter comma-separated observable signals.',
          required: true,
        },
      },
    ],
    multiple: true,
    required: true,
  });
  input.write('2\n');
  setTimeout(() => input.write('prd-approved\n'), 5);
  const answer = await answerPromise;
  prompt.close();

  assert.equal(answer, 'prd-approved');
});
