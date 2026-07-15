import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import {
  mergeProjectRoutes,
  parseProjectRoutes,
  PROJECT_ROUTES_PATH,
  validateProjectRoutes,
} from '../src/project-routes.mjs';
import { resolveBoardRoute } from '../src/capabilities.mjs';

const baseBoard = {
  schema_version: 1,
  mode: 'advisory-router',
  high_risk_gates: ['release'],
  readiness_gate: { implementation_requires: 'READY_FOR_IMPLEMENT_ONE' },
  capabilities: [
    {
      id: 'planning',
      phases: ['PLAN'],
      expected_outputs: ['bounded-plan'],
      exit_evidence: ['The approved design is mapped to verifiable slices.'],
      fallback: 'vibe-tether',
    },
    {
      id: 'implementation',
      phases: ['EXECUTE_ONE'],
      expected_outputs: ['bounded-change'],
      exit_evidence: ['The approved slice is implemented.'],
      fallback: 'vibe-tether',
    },
  ],
};

function route(overrides = {}) {
  return {
    id: 'project-prd-to-issues',
    phases: ['PLAN'],
    capability: 'planning',
    when_any: ['prd-approved'],
    skill: 'to-issues',
    role: 'primary',
    use_when: ['A reviewed PRD needs actionable issues.'],
    expected_outputs: ['scoped-issues'],
    exit_evidence: ['Every approved requirement is mapped to an issue.'],
    ...overrides,
  };
}

test('project routes use one conventional user-owned path', () => {
  assert.equal(PROJECT_ROUTES_PATH, '.vibetether/routes.local.yaml');
});

test('parseProjectRoutes accepts a YAML mapping and rejects non-mappings', () => {
  assert.deepEqual(
    parseProjectRoutes(YAML.stringify({ schema_version: 1, routes: [] })),
    { schema_version: 1, routes: [] },
  );
  for (const source of ['- route\n', 'null\n', 'plain-text\n', 'routes: [\n']) {
    assert.throws(() => parseProjectRoutes(source), /project routes.*yaml mapping|cannot parse/i);
  }
});

test('validateProjectRoutes accepts and normalizes primary, alternative, and overlay roles', () => {
  const document = {
    schema_version: 1,
    routes: [
      route({
        phases: [' PLAN ', 'PLAN'],
        when_any: [' prd-approved ', 'prd-approved'],
        expected_outputs: [' scoped-issues ', 'scoped-issues'],
      }),
      route({ id: 'alternate-planner', skill: 'request-refactor-plan', role: 'alternative', when_any: [] }),
      route({ id: 'policy-overlay', skill: 'karpathy-guidelines', role: 'overlay', when_any: ['large-change'] }),
    ],
  };

  const validated = validateProjectRoutes(document, baseBoard);

  assert.deepEqual(validated.routes[0].phases, ['PLAN']);
  assert.deepEqual(validated.routes[0].when_any, ['prd-approved']);
  assert.deepEqual(validated.routes[0].expected_outputs, ['scoped-issues']);
  assert.deepEqual(validated.routes.map(({ role }) => role), ['primary', 'alternative', 'overlay']);
  assert.notEqual(validated, document);
});

test('a project-local primary requires at least one observable signal', () => {
  assert.throws(
    () => validateProjectRoutes({ schema_version: 1, routes: [route({ when_any: [] })] }, baseBoard),
    /primary.*signal/i,
  );
  assert.throws(
    () => validateProjectRoutes({ schema_version: 1, routes: [route({ when_any: undefined })] }, baseBoard),
    /primary.*signal/i,
  );
});

test('route identity, Skill names, phases, capabilities, roles, and use_when fail closed', () => {
  const cases = [
    [route({ id: '../route' }), /route id/i],
    [route({ skill: '../to-issues' }), /skill name/i],
    [route({ skill: 'folder/to-issues' }), /skill name/i],
    [route({ skill: 'C:\\skills\\to-issues' }), /skill name/i],
    [route({ phases: ['SHIP'] }), /unknown phase/i],
    [route({ capability: 'missing-capability' }), /unknown capability/i],
    [route({ role: 'router' }), /role/i],
    [route({ use_when: [] }), /use_when/i],
    [route({ use_when: ['  '] }), /use_when/i],
  ];
  for (const [invalid, expected] of cases) {
    assert.throws(
      () => validateProjectRoutes({ schema_version: 1, routes: [invalid] }, baseBoard),
      expected,
    );
  }
});

test('route documents reject missing fields and unknown keys instead of ignoring them', () => {
  for (const field of ['id', 'phases', 'capability', 'skill', 'role', 'use_when']) {
    const invalid = route();
    delete invalid[field];
    assert.throws(
      () => validateProjectRoutes({ schema_version: 1, routes: [invalid] }, baseBoard),
      new RegExp(field),
    );
  }
  for (const key of [
    'expected_outputs_remove',
    'exit_evidence_remove',
    'fallback',
    'readiness_gate',
    'high_risk_gates',
  ]) {
    assert.throws(
      () => validateProjectRoutes({ schema_version: 1, routes: [route({ [key]: [] })] }, baseBoard),
      /unknown field/i,
    );
  }
  assert.throws(
    () => validateProjectRoutes({ schema_version: 1, routes: [], weakening: true }, baseBoard),
    /unknown field/i,
  );
});

test('route strings must be non-empty and arrays cannot contain non-strings', () => {
  const cases = [
    route({ phases: ['PLAN', 3] }),
    route({ when_any: ['prd-approved', null] }),
    route({ use_when: ['valid', {}] }),
    route({ expected_outputs: [false] }),
    route({ exit_evidence: [''] }),
  ];
  for (const invalid of cases) {
    assert.throws(
      () => validateProjectRoutes({ schema_version: 1, routes: [invalid] }, baseBoard),
      /non-empty string/i,
    );
  }
});

test('duplicate route IDs and equally matching local primaries are rejected', () => {
  assert.throws(
    () => validateProjectRoutes({
      schema_version: 1,
      routes: [route(), route({ skill: 'second-planner' })],
    }, baseBoard),
    /duplicate.*route id/i,
  );

  assert.throws(
    () => validateProjectRoutes({
      schema_version: 1,
      routes: [
        route(),
        route({ id: 'second-primary', skill: 'second-planner', when_any: ['prd-approved'] }),
      ],
    }, baseBoard),
    /equally matching.*primary/i,
  );

  assert.doesNotThrow(() => validateProjectRoutes({
    schema_version: 1,
    routes: [
      route(),
      route({ id: 'different-primary', skill: 'second-planner', when_any: ['design-approved'] }),
    ],
  }, baseBoard));
});

test('document and board structures fail closed', () => {
  for (const document of [null, [], {}, { schema_version: 2, routes: [] }, { schema_version: 1 }, { schema_version: 1, routes: {} }]) {
    assert.throws(() => validateProjectRoutes(document, baseBoard), /schema_version 1.*routes array/i);
  }
  assert.throws(
    () => validateProjectRoutes({ schema_version: 1, routes: [] }, { capabilities: null }),
    /capability board/i,
  );
});

test('local alternatives remain selectable metadata and overlays remain additive', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-project-route-roles-'));
  for (const skill of ['request-refactor-plan', 'karpathy-guidelines']) {
    const directory = path.join(root, '.agents', 'skills', skill);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'SKILL.md'), `# ${skill}\n`, 'utf8');
  }
  const board = {
    ...structuredClone(baseBoard),
    providers: [],
    routes: [{
      id: 'curated-planning',
      phase: 'PLAN',
      capability: 'planning',
      priority: 100,
      signals: { all: [], any: [] },
      recommendation: {
        skill: 'writing-plans',
        available_in: ['codex'],
        installations: { codex: '.agents/skills/writing-plans' },
        reason: 'Write the approved plan.',
      },
      fallback: 'vibe-tether',
      selection: 'recommend',
      expected_outputs: ['bounded-plan'],
      exit_evidence: ['The approved design is mapped to verifiable slices.'],
    }],
  };
  const document = {
    schema_version: 1,
    routes: [
      route({
        id: 'local-alternative',
        skill: 'request-refactor-plan',
        role: 'alternative',
        when_any: ['refactor'],
      }),
      route({
        id: 'local-overlay',
        skill: 'karpathy-guidelines',
        role: 'overlay',
        when_any: ['large-change'],
      }),
    ],
  };
  const effective = await mergeProjectRoutes({ root, board, document, harnesses: ['codex'] });
  const result = resolveBoardRoute(effective, {
    phase: 'PLAN',
    capability: 'planning',
    signals: ['refactor', 'large-change'],
    harness: 'codex',
  });

  assert.equal(result.selection.skill, 'writing-plans');
  assert.deepEqual(
    result.alternatives.find(({ skill }) => skill === 'request-refactor-plan'),
    {
      id: 'project-local:local-alternative:PLAN',
      route_id: 'local-alternative',
      skill: 'request-refactor-plan',
      available: true,
      reason: 'A reviewed PRD needs actionable issues.',
      source: 'project-local',
      role: 'alternative',
    },
  );
  assert.deepEqual(
    result.overlays.find(({ skill }) => skill === 'karpathy-guidelines'),
    {
      id: 'project-local:local-overlay:PLAN',
      skill: 'karpathy-guidelines',
      available: true,
      available_in: ['codex'],
      reason: 'A reviewed PRD needs actionable issues.',
      expected_outputs: ['bounded-plan', 'scoped-issues'],
      exit_evidence: [
        'The approved design is mapped to verifiable slices.',
        'Every approved requirement is mapped to an issue.',
      ],
      source: 'project-local',
      role: 'overlay',
    },
  );
});
