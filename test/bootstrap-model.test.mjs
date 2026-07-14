import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBootstrapModel,
  parseIntentContract,
  renderIntentContract,
  unresolvedIntent,
} from '../src/bootstrap-model.mjs';

const SAFE_CONSTRAINTS = [
  'Preserve existing project instructions and higher-authority decisions.',
  'Confirm destructive actions and releases before execution.',
];

function discovery({ bundleSignals = [], sources = {} } = {}) {
  return {
    bundle_signals: bundleSignals,
    discovery: {
      'AGENTS.md': { role: 'agent instructions', confidence: 'high', kind: 'file' },
      'CLAUDE.md': { role: 'agent instructions', confidence: 'high', kind: 'file' },
      '.vibetether/intent.md': { role: 'intent contract', confidence: 'high', kind: 'file' },
      ...sources,
    },
  };
}

test('greenfield bootstrap asks only directional questions in canonical order', () => {
  const model = buildBootstrapModel({ discovery: discovery() });

  assert.equal(model.greenfield, true);
  assert.equal(model.ready, false);
  assert.deepEqual(model.questions.map((question) => question.key), [
    'goal',
    'success_evidence',
    'scope_boundaries',
  ]);
  assert.equal(
    model.questions.find((question) => question.key === 'scope_boundaries').recommended,
    'Preserve existing instructions; confirm destructive actions and releases.',
  );
  assert.equal(model.questions.some((question) => question.key === 'architecture'), false);
  assert.equal(model.questions.some((question) => /architecture|framework|database/i.test(question.prompt)), false);
  assert.deepEqual(model.answers.constraints, SAFE_CONSTRAINTS);
});

test('high-confidence Web evidence adds the visual direction question', () => {
  const model = buildBootstrapModel({
    discovery: discovery({
      bundleSignals: [
        {
          bundle: 'web',
          signal: 'react',
          path: 'package.json',
          confidence: 'high',
          reason: 'React dependency detected.',
        },
      ],
    }),
  });

  assert.equal(model.greenfield, false);
  assert.deepEqual(model.questions.map((question) => question.key), [
    'goal',
    'success_evidence',
    'scope_boundaries',
    'visual_direction',
  ]);
});

test('a discovered user-interface specification adds visual direction without architecture questions', () => {
  const model = buildBootstrapModel({
    discovery: discovery({
      sources: {
        'docs/ui-spec.md': {
          role: 'user interface specification',
          confidence: 'medium',
          kind: 'file',
        },
        'docs/adr/': {
          role: 'architecture decisions',
          confidence: 'high',
          kind: 'directory',
        },
      },
    }),
  });

  assert.equal(model.questions.at(-1).key, 'visual_direction');
  assert.equal(model.questions.some((question) => question.key === 'architecture'), false);
  assert.equal(model.questions.some((question) => /architecture|framework|database/i.test(question.prompt)), false);
});

test('explicit required answers make the model ready and render a confirmed contract', () => {
  const model = buildBootstrapModel({
    discovery: discovery(),
    input: {
      goal: '  Ship a guided bootstrap  ',
      successEvidence: [' focused tests pass ', 'CLI reuses the contract'],
      scopeBoundaries: ['bootstrap model only'],
      constraints: ['Keep the model filesystem-free'],
      visualDirection: '  Light, accessible prompts  ',
    },
  });

  assert.equal(model.ready, true);
  assert.deepEqual(Object.keys(model.answers), [
    'goal',
    'success_evidence',
    'scope_boundaries',
    'constraints',
    'visual_direction',
  ]);
  assert.equal(model.answers.goal, 'Ship a guided bootstrap');
  assert.deepEqual(model.answers.success_evidence, ['focused tests pass', 'CLI reuses the contract']);
  assert.deepEqual(model.answers.constraints, ['Keep the model filesystem-free', ...SAFE_CONSTRAINTS]);
  assert.equal(model.answers.visual_direction, 'Light, accessible prompts');

  const contract = renderIntentContract(model.answers);
  assert.match(contract, /^# VibeTether Intent Contract\n\nStatus: confirmed\n/m);
  assert.match(contract, /## Goal\n\nShip a guided bootstrap/);
  assert.match(contract, /## Success evidence\n\n- focused tests pass\n- CLI reuses the contract/);
});

test('unresolved contracts retain no-goal and no-evidence messages without guessing', () => {
  const model = buildBootstrapModel({
    discovery: discovery({
      bundleSignals: [
        { bundle: 'web', signal: 'react', path: 'package.json', confidence: 'high' },
      ],
      sources: {
        'package.json': { role: 'package metadata', confidence: 'high', kind: 'file' },
      },
    }),
    input: { goal: '   ', successEvidence: '' },
  });
  const contract = renderIntentContract(model.answers);

  assert.equal(model.answers.goal, null);
  assert.equal(model.answers.success_evidence, null);
  assert.match(contract, /Status: unresolved/);
  assert.match(contract, /No project goal has been recorded yet\./);
  assert.match(contract, /No acceptance evidence has been recorded yet\./);
  assert.match(contract, /- Confirm the goal and success evidence before consequential product work\./);
  assert.doesNotMatch(contract, /Confirm scope boundaries|Confirm visual direction/);
  assert.doesNotMatch(contract, /package\.json|React dependency|vibetether-release/i);
  assert.equal(unresolvedIntent(), contract);
});

test('rendered confirmed contracts parse into reusable input without repeated questions', () => {
  const initial = buildBootstrapModel({
    discovery: discovery({
      bundleSignals: [
        { bundle: 'web', signal: 'react', path: 'package.json', confidence: 'high' },
      ],
    }),
    input: {
      goal: 'Guide project bootstrap',
      successEvidence: ['The focused contract test passes'],
      scopeBoundaries: ['Do not change provider installation'],
      constraints: ['Keep the model pure'],
      visualDirection: 'Use direct, beginner-friendly language',
    },
  });
  const parsed = parseIntentContract(renderIntentContract(initial.answers));
  const reused = buildBootstrapModel({
    discovery: discovery({
      bundleSignals: [
        { bundle: 'web', signal: 'react', path: 'package.json', confidence: 'high' },
      ],
    }),
    input: parsed,
  });

  assert.deepEqual(parsed, {
    goal: 'Guide project bootstrap',
    successEvidence: ['The focused contract test passes'],
    scopeBoundaries: ['Do not change provider installation'],
    constraints: ['Keep the model pure', ...SAFE_CONSTRAINTS],
    visualDirection: 'Use direct, beginner-friendly language',
  });
  assert.equal(reused.ready, true);
  assert.deepEqual(reused.questions, []);
  assert.equal(renderIntentContract(reused.answers), renderIntentContract(initial.answers));
});

test('bundle signals and real package sources each make a project non-greenfield', () => {
  const signaled = buildBootstrapModel({
    discovery: discovery({
      bundleSignals: [{ bundle: 'production', signal: 'ci', confidence: 'high' }],
    }),
  });
  const packaged = buildBootstrapModel({
    discovery: discovery({
      sources: {
        'package.json': { role: 'package metadata', confidence: 'high', kind: 'file' },
      },
    }),
  });

  assert.equal(signaled.greenfield, false);
  assert.equal(packaged.greenfield, false);
});

test('list inputs are trimmed, emptied, and de-duplicated while safe constraints remain unique', () => {
  const model = buildBootstrapModel({
    discovery: discovery(),
    input: {
      goal: 'Goal',
      successEvidence: [' test passes ', '', 'test passes', ' docs match '],
      scopeBoundaries: [' src only ', 'src only', ' ', ' no release '],
      constraints: [
        ' custom rule ',
        '',
        'custom rule',
        'Preserve existing project instructions and higher-authority decisions.',
      ],
      visualDirection: '   ',
    },
  });

  assert.deepEqual(model.answers.success_evidence, ['test passes', 'docs match']);
  assert.deepEqual(model.answers.scope_boundaries, ['src only', 'no release']);
  assert.deepEqual(model.answers.constraints, ['custom rule', ...SAFE_CONSTRAINTS]);
  assert.equal(model.answers.visual_direction, null);
});
