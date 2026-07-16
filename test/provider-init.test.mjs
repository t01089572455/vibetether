import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import YAML from 'yaml';
import { main } from '../src/cli.mjs';
import { initialize } from '../src/init.mjs';
import { stageProviderSources } from '../src/provider-fetch.mjs';
import { validateProviderLock } from '../src/managed-project-state.mjs';
import { inspectProject } from '../src/doctor.mjs';
import { createProviderLock } from '../src/provider-plan.mjs';
import { skillFingerprint } from '../src/skill-install.mjs';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

async function upstream() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-init-upstream-'));
  await mkdir(path.join(root, 'skills', 'demo'), { recursive: true });
  await writeFile(path.join(root, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\ndescription: Demo route.\n---\n', 'utf8');
  await writeFile(path.join(root, 'skills', 'demo', 'guide.md'), '# Full provider content\n', 'utf8');
  await writeFile(path.join(root, 'LICENSE'), 'MIT fixture license\n', 'utf8');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'VibeTether Tests']);
  git(root, ['config', 'user.email', 'tests@example.invalid']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'fixture provider']);
  return {
    root,
    commit: git(root, ['rev-parse', 'HEAD']),
    fingerprint: await skillFingerprint(path.join(root, 'skills', 'demo')),
  };
}

async function completeUpstream() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-init-complete-upstream-'));
  for (const name of ['demo', 'router']) {
    await mkdir(path.join(root, 'skills', name), { recursive: true });
    await writeFile(path.join(root, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}.\n---\n`, 'utf8');
    await writeFile(path.join(root, 'skills', name, 'guide.md'), `# ${name} content\n`, 'utf8');
  }
  await writeFile(path.join(root, 'LICENSE'), 'MIT fixture license\n', 'utf8');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'VibeTether Tests']);
  git(root, ['config', 'user.email', 'tests@example.invalid']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'complete fixture provider']);
  return {
    root,
    commit: git(root, ['rev-parse', 'HEAD']),
    fingerprints: Object.fromEntries(await Promise.all(
      ['demo', 'router'].map(async (name) => [name, await skillFingerprint(path.join(root, 'skills', name))]),
    )),
  };
}

async function motionUpstream() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-init-motion-upstream-'));
  const names = [
    'motion-design',
    'gsap-core',
    'gsap-frameworks',
    'gsap-performance',
    'gsap-plugins',
    'gsap-react',
    'gsap-scrolltrigger',
    'gsap-timeline',
    'gsap-utils',
  ];
  for (const name of names) {
    await mkdir(path.join(root, 'skills', name), { recursive: true });
    await writeFile(path.join(root, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}.\n---\n`, 'utf8');
  }
  await writeFile(path.join(root, 'LICENSE'), 'MIT fixture license\n', 'utf8');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'VibeTether Tests']);
  git(root, ['config', 'user.email', 'tests@example.invalid']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'motion fixture provider']);
  return {
    root,
    names,
    commit: git(root, ['rev-parse', 'HEAD']),
    fingerprints: Object.fromEntries(await Promise.all(
      names.map(async (name) => [name, await skillFingerprint(path.join(root, 'skills', name))]),
    )),
  };
}

function registry(source) {
  return {
    schema_version: 1,
    runtime_auto_install: false,
    sources: [
      {
        id: 'fixture-source',
        repository: source.root,
        ref: source.commit,
        commit: source.commit,
        license: 'MIT',
        license_path: 'LICENSE',
        skills: [
          {
            id: 'fixture-demo',
            install_name: 'demo',
            path: 'skills/demo',
            fingerprint: source.fingerprint,
            capabilities: ['requirements-clarification'],
          },
        ],
      },
    ],
    profiles: {
      core: { skills: [] },
      standard: { skills: ['fixture-demo'] },
      extended: { extends: 'standard', skills: [] },
    },
    readiness_gate: {
      mode: 'automatic',
      dimensions: ['user-and-outcome'],
      implementation_requires: 'READY_FOR_IMPLEMENT_ONE',
    },
    capability_catalog: [
      {
        id: 'requirements-clarification',
        phases: ['DISCOVER', 'ALIGN'],
        purpose: 'Turn an ambiguous request into an approved Intent Contract.',
        invoke_when: ['goal-unclear', 'scope-unclear'],
        required_inputs: ['user_request', 'applicable_truth_sources'],
        required_outputs: ['goal', 'success_evidence'],
        exit_evidence: ['The user has approved the goal and success evidence.'],
        fallback: 'vibetether-built-in-alignment',
      },
    ],
    routes: [
      {
        id: 'fixture-requirements',
        profiles: ['standard', 'extended'],
        phase: 'DISCOVER',
        capability: 'requirements-clarification',
        provider: 'demo',
        workflow_role: 'primary',
        selection: 'recommend',
        required: false,
        fallback: 'vibetether-built-in-alignment',
        priority: 100,
        reason: 'The request is unclear.',
      },
    ],
  };
}

function completeRegistry(source) {
  const value = registry({ ...source, fingerprint: source.fingerprints.demo });
  value.schema_version = 2;
  value.sources[0] = {
    ...value.sources[0],
    catalog_mode: 'complete',
    skill_root: 'skills',
    catalog_group: 'foundation',
    license_evidence: { mode: 'full-text', path: 'LICENSE' },
    skills: [
      {
        id: 'fixture-demo', install_name: 'demo', path: 'skills/demo', fingerprint: source.fingerprints.demo,
        catalog_status: 'audited', workflow_role: 'primary', invocation_policy: 'advisory-auto-eligible',
        exposure: 'standard', capabilities: ['requirements-clarification'], conflicts: [],
        fallback: 'vibetether-built-in-alignment', required_outputs: [], exit_evidence: [],
      },
      {
        id: 'fixture-router', install_name: 'router', path: 'skills/router', fingerprint: source.fingerprints.router,
        catalog_status: 'audited', workflow_role: 'competing-router', invocation_policy: 'catalog-only',
        exposure: 'catalog-only', capabilities: ['requirements-clarification'], conflicts: ['vibe-tether'],
        fallback: 'vibe-tether', required_outputs: [], exit_evidence: [],
      },
    ],
  };
  value.profiles.standard.catalog_sources = ['fixture-source'];
  value.profiles.extended.catalog_sources = [];
  return value;
}

function twoExposureRegistry(source) {
  const value = completeRegistry(source);
  value.profiles.standard.skills = ['fixture-demo', 'fixture-router'];
  value.sources[0].skills[1] = {
    ...value.sources[0].skills[1],
    workflow_role: 'domain',
    invocation_policy: 'advisory-auto-eligible',
    exposure: 'standard',
    conflicts: [],
  };
  return value;
}

function motionRegistry(source) {
  const skill = (name, exposure, policy, role) => ({
    id: `fixture-${name}`,
    install_name: name,
    path: `skills/${name}`,
    fingerprint: source.fingerprints[name],
    catalog_status: 'audited',
    workflow_role: role,
    invocation_policy: policy,
    exposure,
    capabilities: [name === 'motion-design' ? 'frontend-product-design' : 'frontend-engineering'],
    conflicts: [],
    fallback: name === 'motion-design' ? 'vibetether-built-in-ui-contract' : 'vibetether-built-in-frontend-engineering',
    required_outputs: [],
    exit_evidence: [],
    ...(name === 'motion-design' ? {
      when_any: ['animation'],
      route_priority: 105,
      use_when: ['Set motion direction before implementation.'],
    } : name === 'gsap-core' ? {
      when_any: ['motion'],
      route_priority: 115,
      use_when: ['Implement approved motion.'],
    } : {
      auto_covered_by: ['gsap-core'],
    }),
  });
  return {
    schema_version: 2,
    runtime_auto_install: false,
    sources: [{
      id: 'fixture-motion-source',
      repository: source.root,
      ref: `commit:${source.commit.slice(0, 7)}`,
      commit: source.commit,
      license: 'MIT',
      license_path: 'LICENSE',
      catalog_mode: 'complete',
      skill_root: 'skills',
      catalog_group: 'web',
      license_evidence: { mode: 'full-text', path: 'LICENSE' },
      skills: source.names.map((name) => skill(
        name,
        name === 'motion-design' ? 'extended' : 'bundle',
        name === 'motion-design' || name === 'gsap-core'
          ? 'advisory-auto-eligible'
          : 'upstream-explicit-alias',
        name === 'motion-design' || name === 'gsap-core' ? 'policy' : 'domain',
      )),
    }],
    profiles: {
      core: { skills: [] },
      standard: { skills: [] },
      extended: {
        extends: 'standard',
        skills: ['fixture-motion-design'],
        catalog_sources: ['fixture-motion-source'],
      },
    },
    bundles: {
      web: { catalog_sources: ['fixture-motion-source'] },
    },
    readiness_gate: {
      mode: 'automatic',
      dimensions: ['user-and-outcome'],
      implementation_requires: 'READY_FOR_IMPLEMENT_ONE',
    },
    capability_catalog: [
      {
        id: 'frontend-product-design', phases: ['DESIGN'], purpose: 'Set intentional UI direction.',
        invoke_when: ['user-visible-ui'], required_inputs: [], required_outputs: ['visual_direction'],
        exit_evidence: ['The visual direction is confirmed.'], fallback: 'vibetether-built-in-ui-contract',
      },
      {
        id: 'frontend-engineering', phases: ['EXECUTE_ONE'], purpose: 'Implement approved UI behaviour.',
        invoke_when: ['user-visible-ui'], required_inputs: [], required_outputs: ['implemented_states'],
        exit_evidence: ['The intended states are implemented.'], fallback: 'vibetether-built-in-frontend-engineering',
      },
    ],
    routes: [],
  };
}

async function project(name) {
  return mkdtemp(path.join(os.tmpdir(), `vibetether-provider-init-${name}-`));
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
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

function options(root, overrides = {}) {
  return { project: root, agent: 'both', profile: 'standard', dryRun: false, yes: true, ...overrides };
}

function collisionLockFixture() {
  const provider = {
    id: 'fixture-demo',
    install_name: 'demo',
    source_id: 'fixture-source',
    fingerprint: 'a'.repeat(64),
    capabilities: ['requirements-clarification'],
  };
  const source = {
    id: 'fixture-source',
    repository: 'https://example.invalid/fixture.git',
    ref: 'commit:bbbbbbb',
    commit: 'b'.repeat(40),
    license: 'MIT',
    license_evidence: {
      mode: 'readme-declaration',
      path: 'README.md',
      sha256: 'c'.repeat(64),
    },
    skills: [{
      id: provider.id,
      install_name: provider.install_name,
      fingerprint: provider.fingerprint,
      capabilities: provider.capabilities,
    }],
  };
  const catalogInstallations = [{
    provider_id: provider.id,
    path: '.vibetether/providers/catalog/fixture-source/demo',
    ownership: 'vibetether',
  }];
  return { provider, source, catalogInstallations };
}

test('provider locks record preserved collisions without verified installation ownership', () => {
  const { provider, source, catalogInstallations } = collisionLockFixture();
  const lock = createProviderLock({
    profile: 'standard',
    sources: [source],
    providers: [provider],
    installations: [],
    collisions: [{
      provider_id: provider.id,
      harness: 'codex',
      path: '.agents/skills/demo',
      reason: 'different-preexisting-skill',
    }],
    catalogInstallations,
  });

  assert.deepEqual(lock.exposures[0].installations, {});
  assert.deepEqual(lock.exposures[0].collisions, {
    codex: {
      path: '.agents/skills/demo',
      reason: 'different-preexisting-skill',
      preserved: true,
    },
  });
  assert.deepEqual(validateProviderLock(lock).exposures[0].collisions, lock.exposures[0].collisions);
});

test('current collisions suppress stale managed installation inheritance', () => {
  const { provider, source, catalogInstallations } = collisionLockFixture();
  const previousExposure = {
    ...provider,
    active: true,
    installations: {
      codex: {
        path: '.agents/skills/demo',
        ownership: 'vibetether',
      },
    },
  };
  const lock = createProviderLock({
    profile: 'standard',
    sources: [source],
    providers: [provider],
    installations: [],
    collisions: [{
      provider_id: provider.id,
      harness: 'codex',
      path: '.agents/skills/demo',
      reason: 'modified-managed-skill',
    }],
    catalogInstallations,
    existingLock: {
      schema_version: 2,
      sources: [source],
      catalog: [],
      exposures: [previousExposure],
      skills: [previousExposure],
    },
  });

  assert.equal(lock.exposures[0].installations.codex, undefined);
  assert.equal(lock.exposures[0].collisions.codex.reason, 'modified-managed-skill');
});

test('provider lock validation rejects unsafe or contradictory collision records', () => {
  const { provider, source, catalogInstallations } = collisionLockFixture();
  const valid = createProviderLock({
    profile: 'standard',
    sources: [source],
    providers: [provider],
    installations: [],
    collisions: [{
      provider_id: provider.id,
      harness: 'codex',
      path: '.agents/skills/demo',
      reason: 'different-preexisting-skill',
    }],
    catalogInstallations,
  });
  for (const exposure of [valid.exposures[0], valid.skills[0]]) {
    exposure.collisions = {
      codex: {
        path: '.agents/skills/demo',
        reason: 'different-preexisting-skill',
        preserved: true,
      },
    };
  }
  const cases = [
    {
      name: 'unsupported reason',
      mutate(lock) {
        lock.exposures[0].collisions.codex.reason = 'unknown';
        lock.skills[0].collisions.codex.reason = 'unknown';
      },
    },
    {
      name: 'path mismatch',
      mutate(lock) {
        lock.exposures[0].collisions.codex.path = '.agents/skills/other';
        lock.skills[0].collisions.codex.path = '.agents/skills/other';
      },
    },
    {
      name: 'unknown harness',
      mutate(lock) {
        lock.exposures[0].collisions.unknown = lock.exposures[0].collisions.codex;
        lock.skills[0].collisions.unknown = lock.skills[0].collisions.codex;
        delete lock.exposures[0].collisions.codex;
        delete lock.skills[0].collisions.codex;
      },
    },
    {
      name: 'installation and collision',
      mutate(lock) {
        lock.exposures[0].installations.codex = {
          path: '.agents/skills/demo',
          ownership: 'vibetether',
        };
        lock.skills[0].installations.codex = {
          path: '.agents/skills/demo',
          ownership: 'vibetether',
        };
      },
    },
  ];

  for (const value of cases) {
    const lock = structuredClone(valid);
    value.mutate(lock);
    assert.equal(validateProviderLock(lock), null, value.name);
  }
});

test('standard init installs complete providers and writes an advisory capability board and lock', async () => {
  const source = await upstream();
  const target = await project('standard');
  const dependencies = { loadRegistry: async () => registry(source) };

  const result = await initialize(options(target), dependencies);
  assert.match(result, /standard profile/i);
  for (const provider of [
    path.join(target, '.agents', 'skills', 'demo'),
    path.join(target, '.claude', 'skills', 'demo'),
  ]) {
    assert.equal(await readFile(path.join(provider, 'guide.md'), 'utf8'), '# Full provider content\n');
    assert.equal(await skillFingerprint(provider), source.fingerprint);
  }

  const manifest = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  const board = YAML.parse(await readFile(path.join(target, '.vibetether', 'capabilities.yaml'), 'utf8'));
  const lock = YAML.parse(await readFile(path.join(target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  const checkpoint = YAML.parse(await readFile(path.join(target, '.vibetether', 'state', 'current.yaml'), 'utf8'));
  assert.equal(manifest.capability_board, '.vibetether/capabilities.yaml');
  assert.equal(manifest.provider_lock, '.vibetether/providers.lock.yaml');
  assert.equal(board.selection_policy.provider_selection, 'advisory');
  assert.equal(board.selection_policy.live_availability, 'check-recorded-installation-paths-before-selection');
  assert.equal(board.capabilities[0].id, 'requirements-clarification');
  assert.deepEqual(board.capabilities[0].invoke_when, ['goal-unclear', 'scope-unclear']);
  assert.equal(board.routes[0].recommendation.skill, 'demo');
  assert.deepEqual(board.routes[0].recommendation.available_in, ['codex', 'claude']);
  assert.equal(board.routes[0].fallback, 'vibetether-built-in-alignment');
  assert.deepEqual(board.routes[0].expected_outputs, ['goal', 'success_evidence']);
  assert.deepEqual(board.routes[0].exit_evidence, ['The user has approved the goal and success evidence.']);
  assert.equal(board.providers.length, 1);
  assert.equal(board.providers[0].skill, 'demo');
  assert.equal(board.providers[0].invocation_policy, 'advisory-auto-eligible');
  assert.deepEqual(board.providers[0].routed_by, ['fixture-requirements']);
  assert.equal(lock.skills[0].fingerprint, source.fingerprint);
  assert.equal(lock.skills[0].installations.codex.ownership, 'vibetether');
  assert.equal(lock.skills[0].installations.claude.ownership, 'vibetether');
  assert.match(lock.sources[0].license_sha256, /^[a-f0-9]{64}$/);
  assert.equal(lock.sources[0].license_installation.ownership, 'vibetether');
  assert.equal(
    await readFile(path.join(target, lock.sources[0].license_installation.path), 'utf8'),
    'MIT fixture license\n',
  );
  assert.equal(checkpoint.provider_selection.recommended, 'demo');
  assert.equal(checkpoint.provider_selection.selected, null);

  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  assert.match(agents, /consult.*\.vibetether\/capabilities\.yaml/i);
  assert.match(agents, /recommend/i);
  assert.doesNotMatch(agents, /must invoke every recommended provider/i);
});

test('complete catalogs are cached while competing routers remain outside host discovery', async () => {
  const source = await completeUpstream();
  const target = await project('complete-catalog');

  await initialize(options(target, { agent: 'codex' }), {
    loadRegistry: async () => completeRegistry(source),
  });

  assert.equal(
    await readFile(path.join(target, '.vibetether', 'providers', 'catalog', 'fixture-source', 'demo', 'guide.md'), 'utf8'),
    '# demo content\n',
  );
  assert.equal(
    await readFile(path.join(target, '.vibetether', 'providers', 'catalog', 'fixture-source', 'router', 'guide.md'), 'utf8'),
    '# router content\n',
  );
  assert.equal(await exists(path.join(target, '.agents', 'skills', 'demo', 'SKILL.md')), true);
  assert.equal(await exists(path.join(target, '.agents', 'skills', 'router')), false);
  const lock = YAML.parse(await readFile(path.join(target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  assert.equal(lock.schema_version, 2);
  assert.equal(lock.catalog.length, 2);
  assert.equal(lock.exposures.length, 1);
  assert.equal(lock.catalog.find((skill) => skill.install_name === 'router').workflow_role, 'competing-router');
  assert.equal(lock.catalog.every((skill) => skill.installation.ownership === 'vibetether'), true);
  assert.equal(lock.exposures[0].installations.codex.path, '.agents/skills/demo');
});

test('safe same-name collision preserves the user Skill and installs other reviewed providers', async () => {
  const source = await completeUpstream();
  const target = await project('preserved-collision');
  const customSkill = path.join(target, '.agents', 'skills', 'demo');
  const customBytes = '---\nname: demo\ndescription: User-owned demo.\n---\n';
  await mkdir(customSkill, { recursive: true });
  await writeFile(path.join(customSkill, 'SKILL.md'), customBytes, 'utf8');

  const output = await initialize(options(target, { agent: 'codex' }), {
    loadRegistry: async () => twoExposureRegistry(source),
  });

  assert.equal(await readFile(path.join(customSkill, 'SKILL.md'), 'utf8'), customBytes);
  assert.equal(await exists(path.join(target, '.agents', 'skills', 'router', 'SKILL.md')), true);
  const lock = YAML.parse(await readFile(path.join(target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  const demo = lock.exposures.find((skill) => skill.id === 'fixture-demo');
  const router = lock.exposures.find((skill) => skill.id === 'fixture-router');
  assert.equal(demo.installations.codex, undefined);
  assert.equal(demo.collisions.codex.reason, 'different-preexisting-skill');
  assert.equal(router.installations.codex.ownership, 'vibetether');
  assert.match(output, /Preserved Skill name collisions/i);
  assert.match(output, /\.agents\/skills\/demo/);
});

test('collision dry-run previews preservation and remaining installs without writing', async () => {
  const source = await completeUpstream();
  const target = await project('preserved-collision-dry-run');
  const customSkill = path.join(target, '.agents', 'skills', 'demo');
  const customBytes = '---\nname: demo\ndescription: User-owned demo.\n---\n';
  await mkdir(customSkill, { recursive: true });
  await writeFile(path.join(customSkill, 'SKILL.md'), customBytes, 'utf8');

  const output = await initialize(options(target, {
    agent: 'codex',
    dryRun: true,
    yes: false,
  }), {
    loadRegistry: async () => twoExposureRegistry(source),
    stageProviders: async () => {
      throw new Error('dry-run must not fetch');
    },
  });

  assert.match(output, /preserve existing Skill/i);
  assert.match(output, /\.agents\/skills\/demo/);
  assert.match(output, /\.agents\/skills\/router/);
  assert.equal(await readFile(path.join(customSkill, 'SKILL.md'), 'utf8'), customBytes);
  assert.equal(await exists(path.join(target, '.vibetether')), false);
});

test('collision in one harness still installs the reviewed provider in the other harness', async () => {
  const source = await completeUpstream();
  const target = await project('partial-harness-collision');
  const customSkill = path.join(target, '.agents', 'skills', 'demo');
  const customBytes = '---\nname: demo\ndescription: User-owned Codex demo.\n---\n';
  await mkdir(customSkill, { recursive: true });
  await writeFile(path.join(customSkill, 'SKILL.md'), customBytes, 'utf8');

  await initialize(options(target, { agent: 'both' }), {
    loadRegistry: async () => twoExposureRegistry(source),
  });

  assert.equal(await readFile(path.join(customSkill, 'SKILL.md'), 'utf8'), customBytes);
  assert.equal(
    await skillFingerprint(path.join(target, '.claude', 'skills', 'demo')),
    source.fingerprints.demo,
  );
  const lock = YAML.parse(await readFile(path.join(target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  const demo = lock.exposures.find((skill) => skill.id === 'fixture-demo');
  assert.equal(demo.installations.codex, undefined);
  assert.equal(demo.collisions.codex.reason, 'different-preexisting-skill');
  assert.equal(demo.installations.claude.ownership, 'vibetether');
});

test('extended Web initialization exposes all reviewed motion Skills and writes their advisory routes', async () => {
  const source = await motionUpstream();
  const target = await project('motion-web');
  await initialize(options(target, {
    agent: 'codex',
    profile: 'extended',
    bundles: ['web'],
  }), { loadRegistry: async () => motionRegistry(source) });

  for (const name of source.names) {
    assert.equal(await exists(path.join(target, '.agents', 'skills', name, 'SKILL.md')), true, `${name} is exposed`);
  }

  const board = YAML.parse(await readFile(path.join(target, '.vibetether', 'capabilities.yaml'), 'utf8'));
  const providers = new Map(board.providers.map((provider) => [provider.skill, provider]));
  assert.equal(providers.get('motion-design').installations.codex, '.agents/skills/motion-design');
  assert.equal(providers.get('gsap-core').installations.codex, '.agents/skills/gsap-core');
  assert.equal(board.routes.some((route) => (
    route.recommendation.skill === 'motion-design' && route.workflow_role === 'policy'
  )), true);
  assert.equal(board.routes.some((route) => (
    route.recommendation.skill === 'gsap-core' && route.workflow_role === 'policy'
  )), true);
});

test('complete-catalog dry-run lists catalog and exposure decisions without fetching', async () => {
  const source = await completeUpstream();
  const target = await project('complete-catalog-dry-run');

  const output = await initialize(options(target, { agent: 'codex', dryRun: true, yes: false }), {
    loadRegistry: async () => completeRegistry(source),
    stageProviders: async () => {
      throw new Error('dry-run must not fetch');
    },
  });

  assert.match(output, /\.vibetether\/providers\/catalog\/fixture-source\/demo/);
  assert.match(output, /\.vibetether\/providers\/catalog\/fixture-source\/router/);
  assert.match(output, /\.agents\/skills\/demo/);
  assert.doesNotMatch(output, /\.agents\/skills\/router/);
  assert.equal(await exists(path.join(target, '.vibetether')), false);
});

test('README-declaration sources record provenance without creating a fake license file', async () => {
  const source = await completeUpstream();
  await rm(path.join(source.root, 'LICENSE'));
  await writeFile(path.join(source.root, 'README.md'), '# Fixture\n\n## License\n\nMIT\n', 'utf8');
  git(source.root, ['add', '-A']);
  git(source.root, ['commit', '-qm', 'declare fixture license']);
  source.commit = git(source.root, ['rev-parse', 'HEAD']);
  const value = completeRegistry(source);
  value.sources[0].commit = source.commit;
  value.sources[0].ref = source.commit;
  value.sources[0].license_path = 'README.md';
  value.sources[0].license_evidence = {
    mode: 'readme-declaration',
    path: 'README.md',
    declaration: '## License\n\nMIT',
    sha256: createHash('sha256').update('# Fixture\n\n## License\n\nMIT\n').digest('hex'),
  };
  const target = await project('declared-license');

  const output = await initialize(options(target, { agent: 'codex' }), { loadRegistry: async () => value });
  const lock = YAML.parse(await readFile(path.join(target, '.vibetether', 'providers.lock.yaml'), 'utf8'));

  assert.equal(await exists(path.join(target, '.vibetether', 'licenses', 'fixture-source.LICENSE.txt')), false);
  assert.equal(lock.sources[0].license_evidence.mode, 'readme-declaration');
  assert.match(lock.sources[0].license_evidence.sha256, /^[a-f0-9]{64}$/);
  assert.equal(lock.sources[0].license_installation, undefined);
  assert.match(output, /complete license text is not present upstream/i);

  const repeated = await initialize(options(target, { agent: 'codex' }), {
    loadRegistry: async () => value,
    stageProviders: async () => {
      throw new Error('verified README-declaration cache must remain network-free');
    },
  });
  assert.match(repeated, /complete license text is not present upstream/i);
});

test('doctor rejects an invalid catalog ownership record', async () => {
  const source = await completeUpstream();
  const target = await project('catalog-ownership');
  await initialize(options(target, { agent: 'codex' }), { loadRegistry: async () => completeRegistry(source) });
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  lock.catalog[0].installation.ownership = 'planned';
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');

  await assert.rejects(
    inspectProject({ project: target, json: true }),
    (error) => JSON.parse(error.output).issues.some((entry) => entry.code === 'invalid-catalog-installation'),
  );
});

test('provider-aware init is byte-for-byte idempotent and retains managed ownership', async () => {
  const source = await upstream();
  const target = await project('idempotent');
  const dependencies = { loadRegistry: async () => registry(source) };
  await initialize(options(target, { agent: 'codex' }), dependencies);
  const paths = [
    path.join(target, 'AGENTS.md'),
    path.join(target, '.vibetether', 'project.yaml'),
    path.join(target, '.vibetether', 'capabilities.yaml'),
    path.join(target, '.vibetether', 'providers.lock.yaml'),
  ];
  const before = await Promise.all(paths.map((value) => readFile(value, 'utf8')));

  await initialize(options(target, { agent: 'codex' }), dependencies);
  const after = await Promise.all(paths.map((value) => readFile(value, 'utf8')));
  assert.deepEqual(after, before);
  const lock = YAML.parse(after[3]);
  assert.equal(lock.skills[0].installations.codex.ownership, 'vibetether');
});

test('unchanged repeated init reuses the exact verified provider catalog without staging', async () => {
  const source = await completeUpstream();
  const target = await project('verified-cache-idempotent');
  let stageCalls = 0;
  const dependencies = {
    loadRegistry: async () => completeRegistry(source),
    stageProviders: async (sources) => {
      stageCalls += 1;
      return stageProviderSources(sources);
    },
  };

  await initialize(options(target, { agent: 'codex' }), dependencies);
  assert.equal(stageCalls, 1);
  const before = await snapshot(target);

  await initialize(options(target, { agent: 'codex' }), dependencies);

  assert.equal(stageCalls, 1);
  assert.deepEqual(await snapshot(target), before);
});

test('verified catalog repairs a missing exposure without provider staging', async () => {
  const source = await completeUpstream();
  const target = await project('verified-cache-repair-exposure');
  const value = completeRegistry(source);
  await initialize(options(target, { agent: 'codex' }), { loadRegistry: async () => value });
  await rm(path.join(target, '.agents', 'skills', 'demo'), { recursive: true, force: true });
  let stageCalls = 0;

  await initialize(options(target, { agent: 'codex' }), {
    loadRegistry: async () => value,
    stageProviders: async () => {
      stageCalls += 1;
      throw new Error('verified catalog repair must remain network-free');
    },
  });

  assert.equal(stageCalls, 0);
  assert.equal(
    await skillFingerprint(path.join(target, '.agents', 'skills', 'demo')),
    source.fingerprints.demo,
  );
});

test('missing catalog content falls back to the pinned provider source', async () => {
  const source = await completeUpstream();
  const target = await project('verified-cache-missing-catalog');
  const value = completeRegistry(source);
  let stageCalls = 0;
  const dependencies = {
    loadRegistry: async () => value,
    stageProviders: async (sources) => {
      stageCalls += 1;
      return stageProviderSources(sources);
    },
  };
  await initialize(options(target, { agent: 'codex' }), dependencies);
  await rm(
    path.join(target, '.vibetether', 'providers', 'catalog', 'fixture-source', 'router'),
    { recursive: true, force: true },
  );

  await initialize(options(target, { agent: 'codex' }), dependencies);

  assert.equal(stageCalls, 2);
  assert.equal(
    await skillFingerprint(path.join(target, '.vibetether', 'providers', 'catalog', 'fixture-source', 'router')),
    source.fingerprints.router,
  );
});

test('changed catalog content fetches the pinned source and refuses to overwrite the customization', async () => {
  const source = await completeUpstream();
  const target = await project('verified-cache-changed-catalog');
  const value = completeRegistry(source);
  let stageCalls = 0;
  const dependencies = {
    loadRegistry: async () => value,
    stageProviders: async (sources) => {
      stageCalls += 1;
      return stageProviderSources(sources);
    },
  };
  await initialize(options(target, { agent: 'codex' }), dependencies);
  const changedPath = path.join(
    target,
    '.vibetether',
    'providers',
    'catalog',
    'fixture-source',
    'router',
    'guide.md',
  );
  await writeFile(changedPath, '# Local customization\n', 'utf8');

  await assert.rejects(
    initialize(options(target, { agent: 'codex' }), dependencies),
    /modified|different|fingerprint/i,
  );

  assert.equal(stageCalls, 2);
  assert.equal(await readFile(changedPath, 'utf8'), '# Local customization\n');
});

test('changed lock license evidence fetches the pinned source and repairs from exact content', async () => {
  const source = await completeUpstream();
  const target = await project('verified-cache-changed-license-lock');
  const value = completeRegistry(source);
  let stageCalls = 0;
  const dependencies = {
    loadRegistry: async () => value,
    stageProviders: async (sources) => {
      stageCalls += 1;
      return stageProviderSources(sources);
    },
  };
  await initialize(options(target, { agent: 'codex' }), dependencies);
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  lock.sources[0].license_sha256 = '0'.repeat(64);
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');

  await initialize(options(target, { agent: 'codex' }), dependencies);

  const repaired = YAML.parse(await readFile(lockPath, 'utf8'));
  assert.equal(stageCalls, 2);
  assert.notEqual(repaired.sources[0].license_sha256, '0'.repeat(64));
  assert.equal(
    repaired.sources[0].license_sha256,
    createHash('sha256').update('MIT fixture license\n').digest('hex'),
  );
});

test('changed installed license evidence fetches the pinned source and refuses to overwrite it', async () => {
  const source = await completeUpstream();
  const target = await project('verified-cache-changed-license-file');
  const value = completeRegistry(source);
  let stageCalls = 0;
  const dependencies = {
    loadRegistry: async () => value,
    stageProviders: async (sources) => {
      stageCalls += 1;
      return stageProviderSources(sources);
    },
  };
  await initialize(options(target, { agent: 'codex' }), dependencies);
  const licensePath = path.join(target, '.vibetether', 'licenses', 'fixture-source.LICENSE.txt');
  await writeFile(licensePath, 'Locally changed license evidence\n', 'utf8');

  await assert.rejects(
    initialize(options(target, { agent: 'codex' }), dependencies),
    /license conflict|refusing to overwrite/i,
  );

  assert.equal(stageCalls, 2);
  assert.equal(await readFile(licensePath, 'utf8'), 'Locally changed license evidence\n');
});

test('a newly selected source fetches without refetching an already verified source', async () => {
  const first = await completeUpstream();
  const second = await completeUpstream();
  const initialRegistry = completeRegistry(first);
  const expandedRegistry = structuredClone(initialRegistry);
  const secondDefinition = completeRegistry(second).sources[0];
  secondDefinition.id = 'fixture-source-two';
  secondDefinition.skills = secondDefinition.skills.map((skill) => ({
    ...skill,
    id: `${skill.id}-two`,
    install_name: `${skill.install_name}-two`,
  }));
  expandedRegistry.sources.push(secondDefinition);
  expandedRegistry.profiles.standard.catalog_sources = ['fixture-source', 'fixture-source-two'];
  const target = await project('verified-cache-partial');
  const stagedSourceIds = [];
  let activeRegistry = initialRegistry;
  const dependencies = {
    loadRegistry: async () => activeRegistry,
    stageProviders: async (sources) => {
      stagedSourceIds.push(sources.map((source) => source.id));
      return stageProviderSources(sources);
    },
  };

  await initialize(options(target, { agent: 'codex' }), dependencies);
  activeRegistry = expandedRegistry;
  await initialize(options(target, { agent: 'codex' }), dependencies);

  assert.deepEqual(stagedSourceIds, [['fixture-source'], ['fixture-source-two']]);
  assert.equal(
    await skillFingerprint(path.join(target, '.vibetether', 'providers', 'catalog', 'fixture-source-two', 'demo-two')),
    second.fingerprints.demo,
  );
});

test('normal init dry-run and apply safely reconstruct invalid provider locks from exact installed copies', async (t) => {
  const source = await completeUpstream();
  const value = completeRegistry(source);
  const providerPaths = [
    '.agents/skills/demo',
    '.vibetether/providers/catalog/fixture-source/demo',
    '.vibetether/providers/catalog/fixture-source/router',
  ];

  for (const variant of ['missing-catalog-with-untrusted-path', 'malformed-yaml']) {
    await t.test(variant, async () => {
      const target = await project(`repair-${variant}`);
      const dependencies = { loadRegistry: async () => value };
      await initialize(options(target, { agent: 'codex' }), dependencies);
      const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
      const beforeFingerprints = await Promise.all(
        providerPaths.map((relativePath) => skillFingerprint(path.join(target, relativePath))),
      );
      const beforeBytes = await Promise.all(
        providerPaths.map((relativePath) => readFile(path.join(target, relativePath, 'guide.md'))),
      );

      if (variant === 'malformed-yaml') {
        await writeFile(lockPath, 'schema_version: [\n', 'utf8');
      } else {
        const lock = YAML.parse(await readFile(lockPath, 'utf8'));
        delete lock.catalog;
        lock.exposures[0].installations.codex.path = '../untrusted-provider-path';
        lock.skills = lock.exposures;
        await writeFile(lockPath, YAML.stringify(lock), 'utf8');
      }
      const corrupted = await snapshot(target);

      const preview = await initialize(
        options(target, { agent: 'codex', dryRun: true, yes: false }),
        {
          ...dependencies,
          stageProviders: async () => {
            throw new Error('repair dry-run must remain network-free');
          },
        },
      );

      assert.match(preview, /providers\.lock\.yaml/);
      assert.deepEqual(await snapshot(target), corrupted);

      await initialize(options(target, { agent: 'codex' }), dependencies);

      const repaired = YAML.parse(await readFile(lockPath, 'utf8'));
      assert.ok(validateProviderLock(repaired));
      assert.equal(repaired.exposures[0].installations.codex.path, '.agents/skills/demo');
      assert.equal(repaired.exposures[0].installations.codex.ownership, 'preexisting');
      assert.equal(repaired.catalog.every((entry) => entry.installation.ownership === 'preexisting'), true);
      assert.deepEqual(
        await Promise.all(providerPaths.map((relativePath) => skillFingerprint(path.join(target, relativePath)))),
        beforeFingerprints,
      );
      assert.deepEqual(
        await Promise.all(providerPaths.map((relativePath) => readFile(path.join(target, relativePath, 'guide.md')))),
        beforeBytes,
      );
    });
  }
});

test('bootstrapOnly rejects incomplete active harness installations without writes or staging', async () => {
  const source = await completeUpstream();
  const target = await project('bootstrap-authority-incomplete-harness');
  const dependencies = { loadRegistry: async () => completeRegistry(source) };
  await initialize(options(target), dependencies);
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  delete lock.exposures.find((entry) => entry.id === 'fixture-demo').installations.claude;
  lock.skills = structuredClone(lock.exposures);
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');
  const before = await snapshot(target);
  let stageCalls = 0;

  await assert.rejects(
    initialize(options(target, {
      bootstrapOnly: true,
      autoBundles: false,
    }), {
      loadRegistry: async () => completeRegistry(source),
      stageProviders: async () => {
        stageCalls += 1;
        throw new Error('must not stage');
      },
    }),
    /bootstrap authority|active exposure.*claude|complete installation/i,
  );

  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCalls, 0);
});

test('direct bootstrapOnly ignores new automatic bundle signals and preserves proposed bundle authority', async () => {
  const source = await completeUpstream();
  const registryValue = completeRegistry(source);
  registryValue.bundles = { web: { catalog_sources: [] } };
  const target = await project('bootstrap-authority-bundle-signal');
  const dependencies = { loadRegistry: async () => registryValue };
  await initialize(options(target, {
    agent: 'codex',
    bundles: [],
    autoBundles: false,
  }), dependencies);
  await writeFile(path.join(target, 'package.json'), JSON.stringify({
    dependencies: { react: '^19.0.0' },
  }, null, 2), 'utf8');
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lockBefore = await readFile(lockPath);
  const beforeDryRun = await snapshot(target);
  let stageCalls = 0;
  const bootstrapOptions = {
    agent: 'codex',
    bundles: [],
    bootstrapOnly: true,
  };

  const preview = await initialize(options(target, {
    ...bootstrapOptions,
    dryRun: true,
    yes: false,
  }), {
    ...dependencies,
    stageProviders: async () => {
      stageCalls += 1;
      throw new Error('bootstrapOnly must not stage');
    },
  });

  assert.match(preview, /DRY RUN/);
  assert.doesNotMatch(preview, /^\+\s+- web\s*$/m);
  assert.deepEqual(await snapshot(target), beforeDryRun);

  await initialize(options(target, bootstrapOptions), {
    ...dependencies,
    stageProviders: async () => {
      stageCalls += 1;
      throw new Error('bootstrapOnly must not stage');
    },
  });

  const manifest = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  assert.deepEqual(manifest.bundles, []);
  assert.deepEqual(lock.bundles, []);
  assert.deepEqual(await readFile(lockPath), lockBefore);
  assert.equal(stageCalls, 0);
});

test('bootstrapOnly allows missing optional providers but rejects required missing or modified providers', async (t) => {
  const source = await completeUpstream();

  await t.test('optional provider missing', async () => {
    const registryValue = completeRegistry(source);
    const target = await project('bootstrap-authority-optional-missing');
    await initialize(options(target, { agent: 'codex' }), {
      loadRegistry: async () => registryValue,
    });
    const providerPath = path.join(target, '.agents', 'skills', 'demo');
    await rm(providerPath, { recursive: true });
    const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
    const lockBefore = await readFile(lockPath);
    const beforeDryRun = await snapshot(target);
    let stageCalls = 0;
    const dependencies = {
      loadRegistry: async () => registryValue,
      stageProviders: async () => {
        stageCalls += 1;
        throw new Error('bootstrapOnly must not stage');
      },
    };

    await initialize(options(target, {
      agent: 'codex',
      autoBundles: false,
      bootstrapOnly: true,
      dryRun: true,
      yes: false,
    }), dependencies);
    assert.deepEqual(await snapshot(target), beforeDryRun);

    const result = await initialize(options(target, {
      agent: 'codex',
      autoBundles: false,
      bootstrapOnly: true,
    }), dependencies);

    assert.match(result, /bootstrap/i);
    assert.deepEqual(await readFile(lockPath), lockBefore);
    const lock = YAML.parse(lockBefore.toString('utf8'));
    assert.equal(lock.exposures[0].installations.codex.path, '.agents/skills/demo');
    assert.equal(await exists(providerPath), false);
    assert.equal(stageCalls, 0);
  });

  for (const variant of [
    {
      name: 'nonmatching phase',
      configure(route) { route.phase = 'VERIFY'; },
    },
    {
      name: 'unsatisfied when_any',
      configure(route) { route.when_any = ['security-sensitive']; },
    },
    {
      name: 'unsatisfied when_all',
      configure(route) { route.when_all = ['goal-unclear', 'security-sensitive']; },
    },
  ]) {
    await t.test(`conditionally required provider with ${variant.name}`, async () => {
      const registryValue = completeRegistry(source);
      registryValue.routes[0].required = true;
      variant.configure(registryValue.routes[0]);
      const target = await project(`bootstrap-authority-required-${variant.name.replaceAll(' ', '-')}`);
      await initialize(options(target, { agent: 'codex' }), {
        loadRegistry: async () => registryValue,
      });
      const providerPath = path.join(target, '.agents', 'skills', 'demo');
      await rm(providerPath, { recursive: true });
      const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
      const lockBefore = await readFile(lockPath);
      let stageCalls = 0;

      const result = await initialize(options(target, {
        agent: 'codex',
        autoBundles: false,
        bootstrapOnly: true,
      }), {
        loadRegistry: async () => registryValue,
        stageProviders: async () => {
          stageCalls += 1;
          throw new Error('bootstrapOnly must not stage');
        },
      });

      assert.match(result, /bootstrap/i);
      assert.deepEqual(await readFile(lockPath), lockBefore);
      assert.equal(await exists(providerPath), false);
      assert.equal(stageCalls, 0);
    });
  }

  for (const state of ['missing', 'modified']) {
    await t.test(`required provider ${state}`, async () => {
      const registryValue = completeRegistry(source);
      registryValue.routes[0].required = true;
      registryValue.routes[0].when_any = [];
      const target = await project(`bootstrap-authority-required-${state}`);
      await initialize(options(target, { agent: 'codex' }), {
        loadRegistry: async () => registryValue,
      });
      const providerPath = path.join(target, '.agents', 'skills', 'demo');
      if (state === 'missing') {
        await rm(providerPath, { recursive: true });
      } else {
        await writeFile(path.join(providerPath, 'guide.md'), '# modified required provider\n', 'utf8');
      }
      const before = await snapshot(target);
      let stageCalls = 0;

      await assert.rejects(
        initialize(options(target, {
          agent: 'codex',
          autoBundles: false,
          bootstrapOnly: true,
        }), {
          loadRegistry: async () => registryValue,
          stageProviders: async () => {
            stageCalls += 1;
            throw new Error('bootstrapOnly must not stage');
          },
        }),
        /bootstrap authority.*required active exposure.*(cannot be verified|fingerprint)/i,
      );

      assert.deepEqual(await snapshot(target), before);
      assert.equal(stageCalls, 0);
    });
  }
});

test('bootstrap CLI uses the same transition context for conditional required providers', async () => {
  const source = await completeUpstream();
  const registryValue = completeRegistry(source);
  registryValue.routes[0].required = true;
  registryValue.routes[0].when_any = ['security-sensitive'];
  const target = await project('bootstrap-authority-cli-conditional-required');
  await initialize(options(target, { agent: 'codex' }), {
    loadRegistry: async () => registryValue,
  });
  const providerPath = path.join(target, '.agents', 'skills', 'demo');
  await rm(providerPath, { recursive: true });
  const before = await snapshot(target);
  let stageCalls = 0;

  const result = await main(['bootstrap', '--project', target, '--dry-run'], {
    initializeDependencies: {
      loadRegistry: async () => registryValue,
      stageProviders: async () => {
        stageCalls += 1;
        throw new Error('must not stage');
      },
    },
  });

  assert.match(result, /DRY RUN/);
  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCalls, 0);
});

test('bootstrapOnly verifies managed provider, catalog, and VibeTether Skill copies before writes', async (t) => {
  const source = await completeUpstream();
  for (const variant of [
    { name: 'provider', relativePath: '.agents/skills/demo/guide.md' },
    { name: 'preexisting-provider', relativePath: '.agents/skills/demo/guide.md', preexisting: true },
    { name: 'catalog', relativePath: '.vibetether/providers/catalog/fixture-source/demo/guide.md' },
    { name: 'vibetether-skill', relativePath: '.agents/skills/vibe-tether/SKILL.md' },
    { name: 'license', relativePath: '.vibetether/licenses/fixture-source.LICENSE.txt' },
  ]) {
    await t.test(variant.name, async () => {
      const target = await project(`bootstrap-authority-modified-${variant.name}`);
      await initialize(options(target, { agent: 'codex' }), {
        loadRegistry: async () => completeRegistry(source),
      });
      if (variant.preexisting) {
        const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
        const lock = YAML.parse(await readFile(lockPath, 'utf8'));
        lock.exposures.find((entry) => entry.id === 'fixture-demo').installations.codex.ownership = 'preexisting';
        lock.skills = structuredClone(lock.exposures);
        await writeFile(lockPath, YAML.stringify(lock), 'utf8');
      }
      const changedPath = path.join(target, ...variant.relativePath.split('/'));
      await writeFile(changedPath, `${await readFile(changedPath, 'utf8')}\nmodified after init\n`, 'utf8');
      const before = await snapshot(target);
      let stageCalls = 0;

      await assert.rejects(
        initialize(options(target, {
          agent: 'codex',
          bootstrapOnly: true,
          autoBundles: false,
        }), {
          loadRegistry: async () => completeRegistry(source),
          stageProviders: async () => {
            stageCalls += 1;
            throw new Error('must not stage');
          },
        }),
        /bootstrap authority|modified installed Skill|fingerprint/i,
      );

      assert.deepEqual(await snapshot(target), before);
      assert.equal(stageCalls, 0);
    });
  }
});

test('bootstrap CLI orchestration applies the shared authority validator before preview or staging', async () => {
  const source = await completeUpstream();
  const target = await project('bootstrap-authority-cli');
  const registryValue = completeRegistry(source);
  await initialize(options(target, { agent: 'codex' }), {
    loadRegistry: async () => registryValue,
  });
  const catalogPath = path.join(
    target,
    '.vibetether',
    'providers',
    'catalog',
    'fixture-source',
    'demo',
    'guide.md',
  );
  await writeFile(catalogPath, '# modified before bootstrap preview\n', 'utf8');
  const before = await snapshot(target);
  let stageCalls = 0;

  await assert.rejects(
    main(['bootstrap', '--project', target, '--dry-run'], {
      initializeDependencies: {
        loadRegistry: async () => registryValue,
        stageProviders: async () => {
          stageCalls += 1;
          throw new Error('must not stage');
        },
      },
    }),
    /bootstrap authority.*catalog.*fingerprint/i,
  );

  assert.deepEqual(await snapshot(target), before);
  assert.equal(stageCalls, 0);
});

test('provider-aware dry-run is network-free and reports no changes after an identical init', async () => {
  const source = await upstream();
  const target = await project('idempotent-dry-run');
  const dependencies = { loadRegistry: async () => registry(source) };
  await initialize(options(target, { agent: 'codex' }), dependencies);

  const output = await initialize(options(target, { agent: 'codex', dryRun: true, yes: false }), {
    ...dependencies,
    stageProviders: async () => {
      throw new Error('idempotent dry-run must not fetch');
    },
  });

  assert.match(output, /No changes required\./);
  assert.doesNotMatch(output, /complete provider Skill/);
});

test('dry-run lists exact provider source and targets without fetching or writing', async () => {
  const source = await upstream();
  const target = await project('dry-run');
  const output = await initialize(options(target, { dryRun: true, yes: false }), {
    loadRegistry: async () => registry(source),
    stageProviders: async () => {
      throw new Error('dry-run must not fetch');
    },
  });

  assert.match(output, /fixture-source/);
  assert.match(output, new RegExp(source.commit));
  assert.match(output, /\.agents\/skills\/demo/);
  assert.match(output, /\.claude\/skills\/demo/);
  assert.equal(await exists(path.join(target, '.vibetether')), false);
});

test('core init remains provider-network-free and still writes a built-in capability board', async () => {
  const source = await upstream();
  const target = await project('core');
  await initialize(options(target, { agent: 'codex', profile: 'core' }), {
    loadRegistry: async () => registry(source),
    stageProviders: async () => {
      throw new Error('core must not fetch');
    },
  });

  assert.equal(await exists(path.join(target, '.agents', 'skills', 'demo')), false);
  const board = YAML.parse(await readFile(path.join(target, '.vibetether', 'capabilities.yaml'), 'utf8'));
  const lock = YAML.parse(await readFile(path.join(target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  assert.equal(board.profile, 'core');
  assert.equal(board.selection_policy.provider_selection, 'advisory');
  assert.equal(board.capabilities.length, 1);
  assert.equal(board.capabilities[0].fallback, 'vibetether-built-in-alignment');
  assert.deepEqual(lock.skills, []);
});

test('init upgrades a legacy managed block and checkpoint without losing recovery state', async () => {
  const source = await upstream();
  const target = await project('legacy-upgrade');
  const dependencies = { loadRegistry: async () => registry(source) };
  await initialize(options(target, { agent: 'codex', profile: 'core' }), dependencies);

  const agentsPath = path.join(target, 'AGENTS.md');
  const agents = await readFile(agentsPath, 'utf8');
  const legacyBody = [
    '## VibeTether drift control',
    '',
    'Invoke the `vibe-tether` Skill before each consequential action in a long-running task.',
    'Re-read `.vibetether/project.yaml` and its applicable truth sources before choosing direction.',
    'Ask the user when product direction, architecture, visual direction, destructive data changes, or release scope is ambiguous.',
    'Make low-risk, reversible, goal-aligned technical choices autonomously and record material decisions.',
    'After compaction, resume, handoff, repeated failure, or a phase change, perform a full VibeTether re-anchor before continuing.',
  ].join('\n');
  await writeFile(
    agentsPath,
    agents.replace(/<!-- vibetether:start -->[\s\S]*?<!-- vibetether:end -->/, `<!-- vibetether:start -->\n${legacyBody}\n<!-- vibetether:end -->`),
    'utf8',
  );

  const checkpointPath = path.join(target, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  delete checkpoint.provider_selection;
  delete checkpoint.experience_feedback;
  checkpoint.approved_decisions = ['Preserve this decision'];
  await writeFile(checkpointPath, YAML.stringify(checkpoint), 'utf8');

  await initialize(options(target, { agent: 'codex', profile: 'standard' }), dependencies);

  const upgradedAgents = await readFile(agentsPath, 'utf8');
  const upgradedCheckpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  assert.match(upgradedAgents, /consult.*\.vibetether\/capabilities\.yaml/i);
  assert.deepEqual(upgradedCheckpoint.approved_decisions, ['Preserve this decision']);
  assert.equal(upgradedCheckpoint.provider_selection.recommended, 'demo');
  assert.equal(upgradedCheckpoint.provider_selection.invocation_status, 'not-started');
  assert.deepEqual(upgradedCheckpoint.experience_feedback, {
    trigger: null,
    disposition: 'pending',
    reason: '',
    artifacts: [],
  });
});

test('identical user-installed providers are reused without claiming ownership', async () => {
  const source = await upstream();
  const target = await project('preexisting');
  const provider = path.join(target, '.agents', 'skills', 'demo');
  await mkdir(path.dirname(provider), { recursive: true });
  await cp(path.join(source.root, 'skills', 'demo'), provider, { recursive: true });

  await initialize(options(target, { agent: 'codex' }), { loadRegistry: async () => registry(source) });
  const lock = YAML.parse(await readFile(path.join(target, '.vibetether', 'providers.lock.yaml'), 'utf8'));
  assert.equal(lock.skills[0].installations.codex.ownership, 'preexisting');
});
