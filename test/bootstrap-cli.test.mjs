import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { main } from '../src/cli.mjs';
import { parseIntentContract } from '../src/bootstrap-model.mjs';
import { initialize } from '../src/init.mjs';
import { createTerminalPromptAdapter } from '../src/terminal-prompts.mjs';

async function project(name) {
  return mkdtemp(path.join(os.tmpdir(), `vibetether-bootstrap-${name}-`));
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function snapshot(root) {
  const result = {};
  async function visit(current, relative = '') {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(child, childRelative);
      else result[childRelative] = await readFile(child);
    }
  }
  await visit(root);
  return result;
}

function prompts(answers = {}, confirmed = true) {
  const state = {
    interactive: true,
    asked: [],
    confirmations: [],
    closed: 0,
    async ask(question) {
      this.asked.push(question);
      const answer = answers[question.id];
      return typeof answer === 'function' ? answer(question) : (answer ?? question.recommended ?? question.default ?? '');
    },
    async confirm(summary) {
      this.confirmations.push(summary);
      return confirmed;
    },
    close() {
      this.closed += 1;
    },
  };
  return state;
}

function runtime(promptAdapter, stageCounter = { calls: 0 }) {
  return {
    isTTY: false,
    promptAdapter,
    initializeDependencies: {
      stageProviders: async () => {
        stageCounter.calls += 1;
        throw new Error('provider staging was not expected');
      },
    },
  };
}

function legacyUnresolvedIntent(goal, successEvidence) {
  return `# VibeTether Intent Contract

Status: unresolved

## Goal

${goal}

## Success evidence

${successEvidence}

## Scope boundaries

Preserve existing project truth.

## Non-negotiable constraints

- Do not fabricate user-owned direction.

## Visual direction

No visual direction has been recorded yet.

## Open direction decisions

- Confirm the goal and success evidence before consequential product work.
`;
}

test('terminal prompt adapter prints recommendations, trims answers, defaults blanks, and accepts only yes', async () => {
  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => { printed += chunk.toString('utf8'); });
  const input = new PassThrough();
  const adapter = createTerminalPromptAdapter({ input, output });

  const answerPromise = adapter.ask({ id: 'goal', prompt: 'Project goal?', recommended: 'Recommended goal' });
  input.write('  chosen goal  \n');
  assert.equal(await answerPromise, 'chosen goal');
  assert.match(printed, /Project goal\?/);
  assert.match(printed, /Recommended goal/);
  adapter.close();

  const blankInput = new PassThrough();
  const blankAdapter = createTerminalPromptAdapter({ input: blankInput, output: new PassThrough() });
  const blankPromise = blankAdapter.ask({ id: 'profile', prompt: 'Profile?', recommended: 'standard' });
  blankInput.write('   \n');
  assert.equal(await blankPromise, 'standard');
  blankAdapter.close();

  for (const [response, expected] of [['yes', true], ['Y', true], ['true', false], ['', false]]) {
    const confirmInput = new PassThrough();
    const confirmAdapter = createTerminalPromptAdapter({ input: confirmInput, output: new PassThrough() });
    const confirmation = confirmAdapter.confirm('Preview');
    confirmInput.write(`${response}\n`);
    assert.equal(await confirmation, expected);
    confirmAdapter.close();
  }
});

test('interactive init asks one question at a time, rescans changed config, and writes confirmed intent after confirmation', async () => {
  const target = await project('interactive-init');
  const promptAdapter = prompts({
    agent: 'codex',
    profile: 'core',
    goal: 'Help maintainers guide long coding tasks',
    success_evidence: 'The guided bootstrap integration tests pass',
    scope_boundaries: 'Do not fetch optional providers',
  });
  const stageCounter = { calls: 0 };

  const result = await main(['init', '--project', target], runtime(promptAdapter, stageCounter));

  assert.match(result, /initialized/i);
  assert.deepEqual(promptAdapter.asked.map((question) => question.id), [
    'agent',
    'profile',
    'goal',
    'success_evidence',
    'scope_boundaries',
  ]);
  assert.equal(promptAdapter.confirmations.length, 1);
  assert.match(promptAdapter.confirmations[0], /DRY RUN/);
  assert.match(promptAdapter.confirmations[0], /provider/i);
  assert.equal(promptAdapter.closed, 1);
  assert.equal(stageCounter.calls, 0);
  const intent = await readFile(path.join(target, '.vibetether', 'intent.md'), 'utf8');
  assert.match(intent, /Status: confirmed/);
  assert.equal(parseIntentContract(intent).goal, 'Help maintainers guide long coding tasks');
});

test('interactive init recommends harnesses from existing instruction files and profile from a valid manifest', async () => {
  for (const [name, files, expected] of [
    ['agents-only', ['AGENTS.md'], 'codex'],
    ['claude-only', ['CLAUDE.md'], 'claude'],
    ['both-files', ['AGENTS.md', 'CLAUDE.md'], 'both'],
    ['neither-file', [], 'both'],
  ]) {
    const target = await project(`recommend-${name}`);
    for (const file of files) await writeFile(path.join(target, file), '# Existing\n', 'utf8');
    const promptAdapter = prompts({ profile: 'core', goal: 'Goal', success_evidence: 'Evidence' }, false);

    await main(['init', '--project', target], runtime(promptAdapter));

    assert.equal(promptAdapter.asked.find((question) => question.id === 'agent').recommended, expected);
  }

  const initialized = await project('recommend-existing-profile');
  await main(['init', '--project', initialized, '--agent', 'codex', '--profile', 'core', '--yes']);
  const promptAdapter = prompts({ goal: 'Goal', success_evidence: 'Evidence' }, false);
  await main(['init', '--project', initialized], runtime(promptAdapter));
  assert.equal(promptAdapter.asked.find((question) => question.id === 'profile').recommended, 'core');
});

test('explicit agent and profile skip interactive configuration questions', async () => {
  const target = await project('explicit-config');
  const promptAdapter = prompts({
    goal: 'Guide an existing project',
    success_evidence: 'Focused tests pass',
    scope_boundaries: 'Provider installation remains unchanged',
  });

  await main(
    ['init', '--project', target, '--agent', 'codex', '--profile', 'core'],
    runtime(promptAdapter),
  );

  assert.deepEqual(promptAdapter.asked.map((question) => question.id), [
    'goal',
    'success_evidence',
    'scope_boundaries',
  ]);
});

test('interactive init validates prompted harness and profile choices before any write', async () => {
  for (const [field, value, pattern] of [
    ['agent', 'cursor', /Invalid agent choice: cursor/i],
    ['profile', 'maximal', /Invalid profile choice: maximal/i],
  ]) {
    const target = await project(`invalid-${field}`);
    const promptAdapter = prompts({
      agent: field === 'agent' ? value : 'codex',
      profile: field === 'profile' ? value : 'core',
    });

    await assert.rejects(main(['init', '--project', target], runtime(promptAdapter)), pattern);
    assert.deepEqual(await readdir(target), []);
    assert.equal(promptAdapter.closed, 1);
  }
});

test('interactive init preserves the core profile bundle restriction after a prompted profile change', async () => {
  const target = await project('prompted-core-bundle');
  const promptAdapter = prompts({ agent: 'codex', profile: 'core' });

  await assert.rejects(
    main(['init', '--project', target, '--bundle', 'web'], runtime(promptAdapter)),
    /core profile.*bundle|bundle.*core profile/i,
  );

  assert.deepEqual(await readdir(target), []);
  assert.equal(promptAdapter.confirmations.length, 0);
});

test('interactive init reuses an existing confirmed intent without asking or overwriting answered direction', async () => {
  const target = await project('reuse-intent');
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Keep the confirmed goal',
    '--success-evidence', 'Keep the confirmed evidence',
    '--scope-boundary', 'Keep the confirmed boundary',
  ]);
  const intentPath = path.join(target, '.vibetether', 'intent.md');
  const before = await readFile(intentPath);
  const promptAdapter = prompts();

  await main(
    ['init', '--project', target, '--agent', 'codex', '--profile', 'core'],
    runtime(promptAdapter),
  );

  assert.deepEqual(promptAdapter.asked, []);
  assert.deepEqual(await readFile(intentPath), before);
  assert.equal(promptAdapter.confirmations.length, 1);
});

test('interactive cancellation leaves the project byte-for-byte unchanged and never stages providers', async () => {
  const target = await project('cancel');
  await writeFile(path.join(target, 'AGENTS.md'), '# Existing instructions\r\n', 'utf8');
  const before = await snapshot(target);
  const promptAdapter = prompts({
    profile: 'core',
    goal: 'Cancelled goal',
    success_evidence: 'Cancelled evidence',
  }, false);
  const stageCounter = { calls: 0 };

  const result = await main(['init', '--project', target], runtime(promptAdapter, stageCounter));

  assert.match(result, /cancelled/i);
  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCounter.calls, 0);
  assert.equal(promptAdapter.closed, 1);
});

test('init without yes or dry-run rejects a non-interactive terminal before writes or provider staging', async () => {
  const target = await project('no-tty');
  const stageCounter = { calls: 0 };

  await assert.rejects(
    main(['init', '--project', target], runtime(null, stageCounter)),
    /--dry-run.*--yes|--yes.*--dry-run/i,
  );

  assert.deepEqual(await readdir(target), []);
  assert.equal(stageCounter.calls, 0);
});

test('init yes keeps unresolved intent by default and renders explicit confirmed direction without guessing', async () => {
  const unresolvedTarget = await project('yes-unresolved');
  await main(['init', '--project', unresolvedTarget, '--agent', 'codex', '--profile', 'core', '--yes']);
  const unresolved = await readFile(path.join(unresolvedTarget, '.vibetether', 'intent.md'), 'utf8');
  assert.match(unresolved, /Status: unresolved/);
  assert.doesNotMatch(unresolved, new RegExp(path.basename(unresolvedTarget), 'i'));

  const confirmedTarget = await project('yes-confirmed');
  await main([
    'init', '--project', confirmedTarget, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Provide deterministic guided bootstrap',
    '--success-evidence', 'Integration tests pass',
    '--scope-boundary', 'No provider fetch in bootstrap',
    '--scope-boundary', 'Preserve user intent',
    '--constraint', 'Keep automation non-interactive',
    '--visual-direction', 'Use concise terminal prompts',
  ]);
  const confirmed = parseIntentContract(
    await readFile(path.join(confirmedTarget, '.vibetether', 'intent.md'), 'utf8'),
  );
  assert.equal(confirmed.goal, 'Provide deterministic guided bootstrap');
  assert.equal(confirmed.successEvidence, 'Integration tests pass');
  assert.deepEqual(confirmed.scopeBoundaries, ['No provider fetch in bootstrap', 'Preserve user intent']);
  assert.equal(confirmed.constraints.includes('Keep automation non-interactive'), true);
  assert.equal(confirmed.visualDirection, 'Use concise terminal prompts');
});

test('explicit direction updates prior scalars without letting empty list flags erase prior scope or constraints', async () => {
  const target = await project('merge-prior-direction');
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Original goal', '--success-evidence', 'Original evidence',
    '--scope-boundary', 'Keep this scope', '--constraint', 'Keep this constraint',
  ]);

  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Updated goal', '--scope-boundary', '   ', '--constraint', '   ',
  ]);

  const merged = parseIntentContract(await readFile(path.join(target, '.vibetether', 'intent.md'), 'utf8'));
  assert.equal(merged.goal, 'Updated goal');
  assert.equal(merged.successEvidence, 'Original evidence');
  assert.deepEqual(merged.scopeBoundaries, ['Keep this scope']);
  assert.equal(merged.constraints.includes('Keep this constraint'), true);
});

test('bootstrap requires initialization and tells the user to run init', async () => {
  const target = await project('bootstrap-uninitialized');

  await assert.rejects(
    main(['bootstrap', '--project', target, '--dry-run'], { isTTY: false }),
    /run.*vibetether init|vibetether init.*first/i,
  );
});

test('bootstrap rejects a provider lock that conflicts with the initialized profile', async () => {
  const target = await project('bootstrap-lock-profile-conflict');
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Keep lock coherent', '--success-evidence', 'Bootstrap fails closed',
  ]);
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  lock.profile = 'standard';
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');
  const before = await snapshot(target);

  await assert.rejects(
    main(['bootstrap', '--project', target, '--yes'], runtime(null)),
    /provider lock.*profile|profile.*provider lock/i,
  );

  assert.deepEqual(await snapshot(target), before);
});

test('bootstrap rejects provider lock bundles that conflict with the manifest', async () => {
  const target = await project('bootstrap-lock-bundle-conflict');
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Keep bundle lock coherent', '--success-evidence', 'Bootstrap fails closed',
  ]);
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  lock.bundles = ['web'];
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');
  const before = await snapshot(target);

  await assert.rejects(
    main(['bootstrap', '--project', target, '--yes'], runtime(null)),
    /provider lock.*bundles|bundles.*provider lock/i,
  );

  assert.deepEqual(await snapshot(target), before);
});

test('bootstrap rejects incomplete v2 provider lock arrays before writes or provider fetches', async () => {
  for (const field of ['sources', 'catalog', 'exposures', 'skills']) {
    const target = await project(`bootstrap-lock-missing-${field}`);
    await main([
      'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
      '--goal', 'Validate the complete provider lock', '--success-evidence', 'Bootstrap fails closed',
    ]);
    const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
    const lock = YAML.parse(await readFile(lockPath, 'utf8'));
    delete lock[field];
    await writeFile(lockPath, YAML.stringify(lock), 'utf8');
    const before = await snapshot(target);
    const stageCounter = { calls: 0 };

    await assert.rejects(
      main(['bootstrap', '--project', target, '--yes'], runtime(null, stageCounter)),
      /valid provider lock.*vibetether init|vibetether init.*valid provider lock/i,
    );

    assert.deepEqual(await snapshot(target), before);
    assert.equal(stageCounter.calls, 0);
  }
});

test('bootstrap rejects forged incomplete provider records before writes or provider fetches', async () => {
  const target = await project('bootstrap-lock-forged-record');
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Reject forged provider ownership', '--success-evidence', 'Bootstrap fails closed',
  ]);
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  const forged = {
    install_name: 'forged-provider',
    installations: {
      codex: { path: '.agents/skills/forged-provider', ownership: 'vibetether' },
    },
  };
  lock.exposures = [forged];
  lock.skills = [forged];
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');
  const before = await snapshot(target);
  const stageCounter = { calls: 0 };

  await assert.rejects(
    main(['bootstrap', '--project', target, '--yes'], runtime(null, stageCounter)),
    /valid provider lock.*vibetether init|vibetether init.*valid provider lock/i,
  );

  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCounter.calls, 0);
});

test('interactive bootstrap checks initialization before terminal availability', async () => {
  const target = await project('bootstrap-uninitialized-interactive');

  await assert.rejects(
    main(['bootstrap', '--project', target], { isTTY: false }),
    /run.*vibetether init|vibetether init.*first/i,
  );
});

test('bootstrap dry-run is non-interactive, lists unresolved direction, and writes or fetches nothing', async () => {
  const target = await project('bootstrap-dry-run');
  await main(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);
  const before = await snapshot(target);
  const stageCounter = { calls: 0 };

  const result = await main(
    ['bootstrap', '--project', target, '--dry-run'],
    runtime(null, stageCounter),
  );

  assert.match(result, /Unresolved directional questions/i);
  assert.match(result, /Who should this project help/i);
  assert.match(result, /DRY RUN/);
  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCounter.calls, 0);
});

test('bootstrap yes rejects unresolved direction because user-owned answers cannot be fabricated', async () => {
  const target = await project('bootstrap-unresolved-yes');
  await main(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);
  const before = await snapshot(target);
  const stageCounter = { calls: 0 };

  await assert.rejects(
    main(['bootstrap', '--project', target, '--yes'], runtime(null, stageCounter)),
    /user-owned direction.*cannot be fabricated|cannot fabricate.*direction/i,
  );

  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCounter.calls, 0);
});

test('bootstrap yes rejects unresolved legacy direction even when goal and success are populated', async () => {
  const target = await project('bootstrap-unresolved-populated-yes');
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Legacy unresolved goal', '--success-evidence', 'Legacy unresolved evidence',
  ]);
  const intentPath = path.join(target, '.vibetether', 'intent.md');
  const unresolved = legacyUnresolvedIntent('Legacy unresolved goal', 'Legacy unresolved evidence');
  await writeFile(intentPath, unresolved, 'utf8');
  const before = await snapshot(target);
  const stageCounter = { calls: 0 };

  await assert.rejects(
    main(['bootstrap', '--project', target, '--yes'], runtime(null, stageCounter)),
    /cannot be fabricated|explicit.*--goal.*--success-evidence|unattended.*requires/i,
  );

  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCounter.calls, 0);
});

test('bootstrap yes rejects partial or optional-only changes to confirmed direction', async () => {
  for (const [name, extra] of [
    ['partial-goal', ['--goal', 'Changed goal without success evidence']],
    ['optional-constraint', ['--constraint', 'Changed constraint without required direction']],
  ]) {
    const target = await project(`bootstrap-confirmed-${name}`);
    await main([
      'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
      '--goal', 'Confirmed goal', '--success-evidence', 'Confirmed evidence',
    ]);
    const before = await snapshot(target);
    const stageCounter = { calls: 0 };

    await assert.rejects(
      main(['bootstrap', '--project', target, '--yes', ...extra], runtime(null, stageCounter)),
      /explicit.*--goal.*--success-evidence|cannot be fabricated|unattended.*requires/i,
    );

    assert.deepEqual(await snapshot(target), before);
    assert.equal(stageCounter.calls, 0);
  }
});

test('bootstrap yes accepts explicit required direction for an unresolved initialized project', async () => {
  const target = await project('bootstrap-explicit-yes');
  await main(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);

  await main([
    'bootstrap', '--project', target, '--yes',
    '--goal', 'Complete project truth unattended',
    '--success-evidence', 'The explicit contract is confirmed',
  ], runtime(null));

  const intent = await readFile(path.join(target, '.vibetether', 'intent.md'), 'utf8');
  assert.match(intent, /Status: confirmed/);
  assert.match(intent, /Complete project truth unattended/);
});

test('bootstrap yes explicit goal and success canonically confirm matching unresolved answers', async () => {
  const target = await project('bootstrap-explicit-matching-unresolved');
  const goal = 'Resolve matching unresolved direction';
  const evidence = 'The canonical Intent is confirmed';
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', goal, '--success-evidence', evidence,
  ]);
  const intentPath = path.join(target, '.vibetether', 'intent.md');
  const unresolved = legacyUnresolvedIntent(goal, evidence);
  await writeFile(intentPath, unresolved, 'utf8');
  const stageCounter = { calls: 0 };

  await main([
    'bootstrap', '--project', target, '--yes', '--goal', goal, '--success-evidence', evidence,
  ], runtime(null, stageCounter));

  const intent = await readFile(intentPath, 'utf8');
  assert.match(intent, /^Status: confirmed$/m);
  assert.notEqual(intent, unresolved);
  assert.equal(stageCounter.calls, 0);
});

test('bootstrap yes reuses a confirmed intent and never stages or rewrites providers', async () => {
  const target = await project('bootstrap-confirmed-yes');
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Reuse confirmed intent', '--success-evidence', 'Bootstrap completes without providers',
  ]);
  const intentPath = path.join(target, '.vibetether', 'intent.md');
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const intentBefore = await readFile(intentPath);
  const lockBefore = await readFile(lockPath);
  const stageCounter = { calls: 0 };

  const result = await main(['bootstrap', '--project', target, '--yes'], runtime(null, stageCounter));

  assert.match(result, /bootstrap/i);
  assert.deepEqual(await readFile(intentPath), intentBefore);
  assert.deepEqual(await readFile(lockPath), lockBefore);
  assert.equal(stageCounter.calls, 0);
});

test('bootstrap bypasses staging even when the initialized profile has provider sources', async () => {
  const target = await project('bootstrap-standard-no-stage');
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Keep bootstrap text-only', '--success-evidence', 'Provider staging stays at zero',
  ]);
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  manifest.profile = 'standard';
  lock.profile = 'standard';
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');
  const stageCounter = { calls: 0 };

  await main(['bootstrap', '--project', target, '--yes'], runtime(null, stageCounter));

  assert.equal(stageCounter.calls, 0);
});

test('bootstrap refuses provider configuration changes that require init to update installations and the lock', async () => {
  for (const extra of [
    ['--profile', 'standard'],
    ['--agent', 'both'],
  ]) {
    const target = await project(`bootstrap-provider-config-${extra[0].slice(2)}`);
    await main([
      'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
      '--goal', 'Protect provider configuration', '--success-evidence', 'Bootstrap stays text-only',
    ]);
    const before = await snapshot(target);

    await assert.rejects(
      main(['bootstrap', '--project', target, '--yes', ...extra], runtime(null)),
      /run.*vibetether init|provider.*vibetether init/i,
    );

    assert.deepEqual(await snapshot(target), before);
  }
});

test('initialize bootstrapOnly independently rejects a profile that would desynchronize the provider lock', async () => {
  const target = await project('bootstrap-only-profile-guard');
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Guard the internal branch', '--success-evidence', 'The provider lock stays coherent',
  ]);
  const before = await snapshot(target);
  let stageCalls = 0;

  await assert.rejects(
    initialize({
      project: target,
      agent: 'codex',
      profile: 'standard',
      bundles: [],
      autoBundles: false,
      bootstrapOnly: true,
      dryRun: false,
      yes: true,
    }, {
      stageProviders: async () => {
        stageCalls += 1;
        throw new Error('must not stage');
      },
    }),
    /provider lock.*profile|profile.*provider lock/i,
  );

  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCalls, 0);
});

test('initialize bootstrapOnly independently rejects an incomplete provider lock before writes or staging', async () => {
  const target = await project('bootstrap-only-lock-structure-guard');
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Guard the internal lock contract', '--success-evidence', 'Bootstrap fails closed',
  ]);
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  delete lock.catalog;
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');
  const before = await snapshot(target);
  let stageCalls = 0;

  await assert.rejects(
    initialize({
      project: target,
      agent: 'codex',
      profile: 'core',
      bundles: [],
      autoBundles: false,
      bootstrapOnly: true,
      dryRun: false,
      yes: true,
    }, {
      stageProviders: async () => {
        stageCalls += 1;
        throw new Error('must not stage');
      },
    }),
    /valid provider lock.*vibetether init|vibetether init.*valid provider lock/i,
  );

  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCalls, 0);
});

test('interactive bootstrap previews prior truth and applies intent only after confirmation', async () => {
  const target = await project('bootstrap-interactive');
  await main(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);
  const promptAdapter = prompts({
    goal: 'Bootstrap project truth interactively',
    success_evidence: 'The confirmed Intent Contract is written',
    scope_boundaries: 'Do not reinstall providers',
  });
  const stageCounter = { calls: 0 };

  const result = await main(['bootstrap', '--project', target], runtime(promptAdapter, stageCounter));

  assert.match(result, /bootstrap/i);
  assert.deepEqual(promptAdapter.asked.map((question) => question.id), [
    'goal',
    'success_evidence',
    'scope_boundaries',
  ]);
  assert.match(promptAdapter.confirmations[0], /Proposed Intent Contract/i);
  assert.match(promptAdapter.confirmations[0], /DRY RUN/);
  const intent = await readFile(path.join(target, '.vibetether', 'intent.md'), 'utf8');
  assert.match(intent, /Status: confirmed/);
  assert.match(intent, /Bootstrap project truth interactively/);
  assert.equal(stageCounter.calls, 0);
  assert.equal(promptAdapter.closed, 1);
});

test('interactive bootstrap shows the prior confirmed contract when explicit direction changes it', async () => {
  const target = await project('bootstrap-prior-preview');
  await main([
    'init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Original confirmed goal', '--success-evidence', 'Original confirmed evidence',
    '--scope-boundary', 'Existing scope',
  ]);
  const promptAdapter = prompts();

  await main([
    'bootstrap', '--project', target, '--goal', 'Changed confirmed goal',
  ], runtime(promptAdapter));

  assert.deepEqual(promptAdapter.asked, []);
  assert.match(promptAdapter.confirmations[0], /Prior Intent Contract/i);
  assert.match(promptAdapter.confirmations[0], /Original confirmed goal/);
  assert.match(promptAdapter.confirmations[0], /Proposed Intent Contract/i);
  assert.match(promptAdapter.confirmations[0], /Changed confirmed goal/);
});

test('interactive bootstrap reviews a differing unresolved prior before confirmation and writes nothing first', async () => {
  const target = await project('bootstrap-unresolved-prior-preview');
  await main(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);
  const before = await snapshot(target);
  const promptAdapter = prompts({
    goal: 'Replace unresolved direction interactively',
    success_evidence: 'The prior and proposal are reviewed',
  });
  promptAdapter.confirm = async function confirm(summary) {
    this.confirmations.push(summary);
    assert.deepEqual(await snapshot(target), before);
    return false;
  };
  const stageCounter = { calls: 0 };

  const result = await main(['bootstrap', '--project', target], runtime(promptAdapter, stageCounter));

  assert.match(result, /cancelled/i);
  assert.match(promptAdapter.confirmations[0], /Prior Intent Contract/i);
  assert.match(promptAdapter.confirmations[0], /^Status: unresolved$/m);
  assert.match(promptAdapter.confirmations[0], /Proposed Intent Contract/i);
  assert.match(promptAdapter.confirmations[0], /Replace unresolved direction interactively/);
  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCounter.calls, 0);
});

test('bootstrap cancellation preserves every project byte and closes the adapter', async () => {
  const target = await project('bootstrap-cancel');
  await main(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']);
  const before = await snapshot(target);
  const promptAdapter = prompts({
    goal: 'Cancelled bootstrap',
    success_evidence: 'Must never be written',
  }, false);
  const stageCounter = { calls: 0 };

  const result = await main(['bootstrap', '--project', target], runtime(promptAdapter, stageCounter));

  assert.match(result, /cancelled/i);
  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCounter.calls, 0);
  assert.equal(promptAdapter.closed, 1);
});

test('help documents bootstrap and shared direction flags while unknown flags fail closed', async () => {
  const help = await main(['--help']);
  assert.match(help, /vibetether bootstrap \[options\]/);
  for (const flag of [
    '--goal', '--success-evidence', '--scope-boundary', '--constraint', '--visual-direction',
  ]) {
    assert.match(help, new RegExp(flag));
  }
  await assert.rejects(
    main(['bootstrap', '--definitely-unknown']),
    /Unknown option.*--definitely-unknown/i,
  );
});
