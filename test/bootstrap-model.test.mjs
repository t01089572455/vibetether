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

function discovery({ bundleSignals = [], sources = {}, projectState = 'greenfield' } = {}) {
  return {
    project_state: projectState,
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
  assert.deepEqual(model.questions.map((question) => question.id), [
    'goal',
    'success_evidence',
    'scope_boundaries',
  ]);
  assert.equal(
    model.questions.find((question) => question.id === 'scope_boundaries').recommended,
    'Preserve existing instructions; confirm destructive actions and releases.',
  );
  assert.deepEqual(
    model.questions.map(({ id, prompt, required, answered }) => ({ id, prompt, required, answered })),
    [
      {
        id: 'goal',
        prompt: 'Who should this project help, and what outcome should they achieve?',
        required: true,
        answered: false,
      },
      {
        id: 'success_evidence',
        prompt: 'What fresh evidence would make the first milestone successful?',
        required: true,
        answered: false,
      },
      {
        id: 'scope_boundaries',
        prompt: 'What is explicitly out of scope or must not be weakened?',
        required: false,
        answered: false,
      },
    ],
  );
  assert.equal(model.questions.some((question) => question.id === 'architecture'), false);
  assert.equal(model.questions.some((question) => /architecture|framework|database/i.test(question.prompt)), false);
  assert.match(model.questions.find((question) => question.id === 'goal').help, /does not invent|one sentence/i);
  assert.match(model.questions.find((question) => question.id === 'goal').example, /help/i);
  assert.equal(model.questions.find((question) => question.id === 'scope_boundaries').choices.length, 3);
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
  assert.deepEqual(model.questions.map((question) => question.id), [
    'goal',
    'success_evidence',
    'scope_boundaries',
    'visual_direction',
  ]);
  const visual = model.questions.at(-1);
  assert.equal(visual.choices.length, 3);
  assert.deepEqual(
    {
      id: visual.id,
      prompt: visual.prompt,
      required: visual.required,
      recommended: visual.recommended,
      answered: visual.answered,
    },
    {
      id: 'visual_direction',
      prompt: 'What existing brand, reference, or visual direction governs the interface?',
      required: false,
      recommended: 'Preserve existing brand assets and request approval before propagating a visual direction.',
      answered: false,
    },
  );
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

  assert.equal(model.questions.at(-1).id, 'visual_direction');
  assert.equal(model.questions.some((question) => question.id === 'architecture'), false);
  assert.equal(model.questions.some((question) => /architecture|framework|database/i.test(question.prompt)), false);
});

test('explicit required answers make the model ready and render a confirmed contract', () => {
  const model = buildBootstrapModel({
    discovery: discovery(),
    input: {
      goal: '  Ship a guided bootstrap  ',
      successEvidence: '  Focused tests pass and the CLI reuses the contract  ',
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
  assert.equal(model.answers.success_evidence, 'Focused tests pass and the CLI reuses the contract');
  assert.deepEqual(model.answers.constraints, ['Keep the model filesystem-free', ...SAFE_CONSTRAINTS]);
  assert.equal(model.answers.visual_direction, 'Light, accessible prompts');

  const contract = renderIntentContract(model.answers);
  assert.match(contract, /^# VibeTether Intent Contract\n\nStatus: confirmed\n/m);
  assert.match(contract, /## Goal\n\nShip a guided bootstrap/);
  assert.match(contract, /## Success evidence\n\nFocused tests pass and the CLI reuses the contract/);
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
      successEvidence: 'The focused contract test passes',
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
    successEvidence: 'The focused contract test passes',
    scopeBoundaries: ['Do not change provider installation'],
    constraints: ['Keep the model pure', ...SAFE_CONSTRAINTS],
    visualDirection: 'Use direct, beginner-friendly language',
  });
  assert.equal(reused.ready, true);
  assert.deepEqual(reused.questions, []);
  assert.equal(renderIntentContract(reused.answers), renderIntentContract(initial.answers));
});

test('intent metadata round-trips canonical answers despite hostile Markdown and CRLF conversion', () => {
  const input = {
    goal: 'Keep the true goal\n\n## Goal\n\nDecoy heading\n\n## Goal\n\nSecond decoy',
    successEvidence: 'No acceptance evidence has been recorded yet.',
    scopeBoundaries: [
      'No additional boundaries have been recorded yet.',
      'Preserve this multiline boundary\nacross both lines',
    ],
    constraints: ['Keep duplicate headings as user content'],
    visualDirection: 'No visual direction has been recorded yet.',
  };
  const answers = buildBootstrapModel({ discovery: discovery(), input }).answers;
  const rendered = renderIntentContract(answers);

  assert.match(rendered, /Status: confirmed\n<!-- vibetether:intent:v1 [A-Za-z0-9_-]+ -->\n/);

  const parsed = parseIntentContract(rendered.replaceAll('\n', '\r\n'));
  assert.deepEqual(parsed, {
    goal: input.goal,
    successEvidence: input.successEvidence,
    scopeBoundaries: input.scopeBoundaries,
    constraints: [input.constraints[0], ...SAFE_CONSTRAINTS],
    visualDirection: input.visualDirection,
  });
  assert.equal(renderIntentContract(parsed), rendered);
  assert.match(parsed.goal, /^Keep the true goal/);
});

test('canonical intent metadata rejects a visible goal that disagrees with its payload', () => {
  const rendered = renderIntentContract({
    goal: 'Original visible goal',
    success_evidence: 'Fresh tests pass',
  });
  const changed = rendered.replace('\nOriginal visible goal\n', '\nChanged visible goal\n');

  assert.throws(
    () => parseIntentContract(changed),
    /Intent Contract integrity check failed: visible content does not match canonical metadata/,
  );
});

test('canonical intent metadata rejects an appended second contract', () => {
  const rendered = renderIntentContract({
    goal: 'One canonical contract',
    success_evidence: 'Fresh tests pass',
  });

  assert.throws(
    () => parseIntentContract(`${rendered}${rendered}`),
    /Intent Contract integrity check failed: visible content does not match canonical metadata/,
  );
});

test('canonical intent metadata rejects arbitrary trailing content', () => {
  const rendered = renderIntentContract({
    goal: 'No trailing content',
    success_evidence: 'Fresh tests pass',
  });

  assert.throws(
    () => parseIntentContract(`${rendered}Unexpected trailing content.\n`),
    /Intent Contract integrity check failed: visible content does not match canonical metadata/,
  );
});

test('canonical intent metadata rejects base64url payloads containing invalid UTF-8', () => {
  const rendered = renderIntentContract({
    goal: 'Original goal',
    success_evidence: 'Fresh tests pass',
  });
  const payload = rendered.match(/<!-- vibetether:intent:v1 ([A-Za-z0-9_-]+) -->/)[1];
  const bytes = Buffer.from(payload, 'base64url');
  const goalOffset = bytes.indexOf(Buffer.from('Original goal', 'utf8'));
  assert.notEqual(goalOffset, -1);
  bytes[goalOffset] = 0xff;
  const invalidUtf8 = rendered.replace(payload, bytes.toString('base64url'));

  assert.throws(
    () => parseIntentContract(invalidUtf8),
    /Invalid VibeTether intent metadata: the v1 payload is not valid UTF-8/,
  );
});

test('canonical intent metadata accepts whole-document CRLF conversion', () => {
  const rendered = renderIntentContract({
    goal: 'CRLF-compatible goal',
    success_evidence: 'Fresh tests pass',
  });

  assert.deepEqual(parseIntentContract(rendered.replaceAll('\n', '\r\n')), {
    goal: 'CRLF-compatible goal',
    successEvidence: 'Fresh tests pass',
    scopeBoundaries: null,
    constraints: SAFE_CONSTRAINTS,
    visualDirection: null,
  });
});

test('marker-like intent text in answers remains ordinary content with or without metadata', () => {
  const input = {
    goal: 'Show the literal prefix <!-- vibetether:intent: in project guidance.',
    successEvidence: 'Fresh regression tests pass.',
    scopeBoundaries: ['Do not reinterpret answer content as control metadata.'],
    constraints: ['Keep metadata recognition isolated to the canonical header.'],
    visualDirection: 'Preserve <!-- vibetether:intent:v1 ZGVjb3k --> as ordinary user text.',
  };
  const answers = buildBootstrapModel({ discovery: discovery(), input }).answers;
  const expected = {
    goal: input.goal,
    successEvidence: input.successEvidence,
    scopeBoundaries: input.scopeBoundaries,
    constraints: [input.constraints[0], ...SAFE_CONSTRAINTS],
    visualDirection: input.visualDirection,
  };
  const rendered = renderIntentContract(answers);

  assert.deepEqual(parseIntentContract(rendered), expected);
  assert.equal(renderIntentContract(parseIntentContract(rendered)), rendered);

  const legacy = rendered.replace(
    /Status: confirmed\n<!-- vibetether:intent:v1 [A-Za-z0-9_-]+ -->\n\n/,
    'Status: confirmed\n\n',
  );
  assert.deepEqual(parseIntentContract(legacy), expected);
});

test('malformed VibeTether intent metadata fails closed instead of parsing headings', () => {
  const rendered = renderIntentContract({
    goal: 'True goal',
    success_evidence: 'Fresh tests pass',
  });
  const malformed = rendered.replace(
    /<!-- vibetether:intent:v1 [A-Za-z0-9_-]+ -->/,
    '<!-- vibetether:intent:v1 !!! -->',
  );

  assert.throws(
    () => parseIntentContract(malformed),
    /Invalid VibeTether intent metadata: expected exactly one well-formed v1 marker/,
  );
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

test('greenfield requires explicit scan state even with only synthetic sources', () => {
  const omittedState = discovery();
  delete omittedState.project_state;

  assert.equal(buildBootstrapModel({ discovery: omittedState }).greenfield, false);
  assert.equal(
    buildBootstrapModel({ discovery: discovery({ projectState: 'existing' }) }).greenfield,
    false,
  );
});

test('invalid scalar types cannot satisfy readiness or leak into rendered contracts', () => {
  const invalid = buildBootstrapModel({
    discovery: discovery(),
    input: {
      goal: {},
      successEvidence: 0,
      visualDirection: false,
    },
  });
  const invalidList = buildBootstrapModel({
    discovery: discovery(),
    input: {
      goal: 'Valid goal',
      successEvidence: ['arrays are not valid scalar evidence'],
    },
  });
  const contract = renderIntentContract(invalid.answers);

  assert.equal(invalid.ready, false);
  assert.equal(invalid.answers.goal, null);
  assert.equal(invalid.answers.success_evidence, null);
  assert.equal(invalid.answers.visual_direction, null);
  assert.equal(invalidList.ready, false);
  assert.equal(invalidList.answers.success_evidence, null);
  assert.doesNotMatch(contract, /\[object Object\]|\b0\b|false/);
});

test('list-capable inputs discard invalid members, trim, and de-duplicate valid strings', () => {
  const model = buildBootstrapModel({
    discovery: discovery(),
    input: {
      goal: 'Goal',
      successEvidence: 'test passes',
      scopeBoundaries: [
        ' src only ',
        'src only',
        ' ',
        ' no release ',
        7,
        false,
        { value: 'ignored' },
        ['nested is ignored'],
      ],
      constraints: [
        ' custom rule ',
        '',
        'custom rule',
        'Preserve existing project instructions and higher-authority decisions.',
        9,
        true,
        { value: 'ignored' },
        ['nested is ignored'],
      ],
      visualDirection: '   ',
    },
  });

  assert.equal(model.answers.success_evidence, 'test passes');
  assert.deepEqual(model.answers.scope_boundaries, ['src only', 'no release']);
  assert.deepEqual(model.answers.constraints, ['custom rule', ...SAFE_CONSTRAINTS]);
  assert.equal(model.answers.visual_direction, null);
});
