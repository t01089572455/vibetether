import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRoutingDocument,
  loadProviderRegistry,
  matchingRoutes,
  resolveExposurePlan,
  resolveProfileProviders,
  resolveRoute,
} from '../src/provider-registry.mjs';
import { createCapabilityBoard } from '../src/provider-plan.mjs';
import { resolveBoardRoute } from '../src/capabilities.mjs';

test('route matching treats omitted and empty when_any as unconditional', () => {
  const common = {
    phase: 'DISCOVER',
    capability: 'requirements-clarification',
  };
  const routing = {
    routes: [
      { ...common, id: 'signal-hit', priority: 5, when_any: ['goal-unclear'] },
      { ...common, id: 'omitted-when-any', priority: 4 },
      { ...common, id: 'empty-when-any', priority: 3, when_any: [] },
      { ...common, id: 'empty-when-all', priority: 2, when_all: [] },
      { ...common, id: 'signal-miss', priority: 1, when_any: ['security-sensitive'] },
    ],
  };

  assert.deepEqual(
    matchingRoutes(routing, {
      phase: 'DISCOVER',
      capability: 'requirements-clarification',
      signals: ['goal-unclear'],
    }).map((route) => route.id),
    ['signal-hit', 'omitted-when-any', 'empty-when-any', 'empty-when-all'],
  );
});

test('provider registry pins complete auditable upstream skill sources', async () => {
  const registry = await loadProviderRegistry();
  assert.equal(registry.schema_version, 2);
  assert.equal(registry.runtime_auto_install, false);

  const providerIds = [];
  const exposedInstallNames = [];
  for (const source of registry.sources) {
    assert.match(source.repository, /^https:\/\/github\.com\//);
    assert.match(source.commit, /^[a-f0-9]{40}$/);
    assert.notEqual(source.ref, 'main');
    assert.notEqual(source.ref, 'latest');
    assert.match(source.license, /^(MIT|Apache-2\.0)$/);
    assert.equal(typeof source.license_path, 'string');
    assert.equal(['complete', 'selected'].includes(source.catalog_mode), true);
    assert.equal(['full-text', 'readme-declaration'].includes(source.license_evidence.mode), true);
    assert.equal(typeof source.license_evidence.path, 'string');
    if (source.license_evidence.mode === 'readme-declaration') {
      assert.match(source.license_evidence.declaration, /MIT/);
      assert.doesNotMatch(source.license_evidence.declaration, /\\n/, 'license declarations must contain real newlines');
      assert.match(source.license_evidence.sha256, /^[a-f0-9]{64}$/);
    }
    assert.ok(source.skills.length > 0);
    for (const skill of source.skills) {
      providerIds.push(skill.id);
      if (skill.exposure !== 'catalog-only') exposedInstallNames.push(skill.install_name);
      assert.match(skill.path, /SKILL|skills/i);
      assert.match(skill.fingerprint, /^[a-f0-9]{64}$/);
      assert.ok(skill.capabilities.length > 0);
      assert.equal(typeof skill.workflow_role, 'string');
      assert.equal(typeof skill.invocation_policy, 'string');
      assert.equal(typeof skill.exposure, 'string');
      assert.equal(Array.isArray(skill.conflicts), true);
    }
  }
  assert.equal(new Set(providerIds).size, providerIds.length);
  assert.equal(new Set(exposedInstallNames).size, exposedInstallNames.length);
});

test('foundation and specialist catalogs contain every Skill at the reviewed commits', async () => {
  const registry = await loadProviderRegistry();
  const counts = Object.fromEntries(registry.sources.map((source) => [source.repository, source.skills.length]));

  assert.equal(counts['https://github.com/obra/superpowers.git'], 14);
  assert.equal(counts['https://github.com/mattpocock/skills.git'], 38);
  assert.equal(counts['https://github.com/multica-ai/andrej-karpathy-skills.git'], 1);
  assert.equal(counts['https://github.com/vercel-labs/agent-skills.git'], 9);
  assert.equal(counts['https://github.com/addyosmani/agent-skills.git'], 24);
});

test('catalog selection and exposure planning keep supply separate from automatic eligibility', async () => {
  const module = await import('../src/provider-registry.mjs');
  const registry = await loadProviderRegistry();
  const catalogSources = module.resolveCatalogSources?.(registry, 'standard', ['web']) ?? [];
  const standard = module.resolveExposurePlan?.(registry, 'standard', {
    bundles: [],
    explicit_bundles: [],
    signals: [],
  }) ?? [];
  const web = module.resolveExposurePlan?.(registry, 'standard', {
    bundles: ['web'],
    explicit_bundles: [],
    signals: ['react'],
  }) ?? [];
  const production = module.resolveExposurePlan?.(registry, 'standard', {
    bundles: ['production'],
    explicit_bundles: ['production'],
    signals: [],
  }) ?? [];

  assert.deepEqual(catalogSources.map((source) => source.id), [
    'mattpocock-skills-v1.1.0',
    'obra-superpowers-v5.1.0',
    'multica-karpathy-2c60614',
    'vercel-agent-skills-f8a72b9',
  ]);
  assert.equal(standard.some((provider) => provider.install_name === 'karpathy-guidelines'), true);
  assert.equal(standard.some((provider) => provider.install_name === 'using-superpowers'), false);
  assert.equal(web.some((provider) => provider.install_name === 'vercel-react-best-practices'), true);
  assert.equal(web.some((provider) => provider.install_name === 'deploy-to-vercel'), false);
  assert.equal(production.some((provider) => provider.install_name === 'security-and-hardening'), true);
  assert.equal(production.some((provider) => provider.install_name === 'using-agent-skills'), false);
});

test('the capability board routes signal-matched Web specialists without exposing a competing router', async () => {
  const registry = await loadProviderRegistry();
  const providers = resolveExposurePlan(registry, 'standard', {
    bundles: ['web'],
    explicit_bundles: [],
    signals: ['react'],
  });
  const exposures = providers.map((provider) => ({
    ...provider,
    active: true,
    installations: { codex: { path: `.agents/skills/${provider.install_name}`, ownership: 'vibetether' } },
  }));
  const board = createCapabilityBoard(registry, 'standard', { exposures, skills: exposures, bundles: ['web'] }, ['codex']);
  const route = resolveBoardRoute(board, {
    phase: 'EXECUTE_ONE',
    capability: 'frontend-engineering',
    signals: ['react'],
    harness: 'codex',
  });

  assert.equal(route.selection.skill, 'vercel-react-best-practices');
  assert.equal(route.should_invoke_provider, true);
  assert.equal(route.alternatives.some((candidate) => candidate.skill === 'vercel-composition-patterns'), true);
  assert.equal(route.required_outputs.includes('implemented_states'), true);
  assert.ok(route.exit_evidence.length > 0);
  assert.equal(board.providers.some((provider) => provider.skill === 'using-agent-skills'), false);
});

test('standard exposes complementary automatic specialists and advertises catalog-only scenario alternatives', async () => {
  const registry = await loadProviderRegistry();
  const providers = resolveExposurePlan(registry, 'standard', { bundles: [], signals: [] });
  const names = providers.map((provider) => provider.install_name);
  for (const name of ['codebase-design', 'prototype', 'research']) assert.equal(names.includes(name), true);

  const exposures = providers.map((provider) => ({
    ...provider,
    active: true,
    installations: { codex: { path: `.agents/skills/${provider.install_name}`, ownership: 'vibetether' } },
  }));
  const board = createCapabilityBoard(registry, 'standard', { exposures, skills: exposures, bundles: [] }, ['codex']);
  const orientation = resolveBoardRoute(board, {
    phase: 'ALIGN',
    capability: 'codebase-orientation',
    signals: ['codebase-unfamiliar'],
    harness: 'codex',
  });
  assert.equal(orientation.selection.skill, 'codebase-design');

  const byCapability = new Map(board.capabilities.map((capability) => [capability.id, capability]));
  assert.equal(byCapability.get('huge-effort-wayfinding').catalog_alternatives.includes('wayfinder'), true);
  assert.equal(byCapability.get('handoff-recovery').catalog_alternatives.includes('handoff'), true);
  assert.equal(byCapability.get('triage-qa').catalog_alternatives.includes('triage'), true);
});

test('Production specialists route by scenario while migration, security, and release retain confirmation gates', async () => {
  const registry = await loadProviderRegistry();
  const providers = resolveExposurePlan(registry, 'standard', {
    bundles: ['production'],
    explicit_bundles: ['production'],
    signals: [],
  });
  const exposures = providers.map((provider) => ({
    ...provider,
    active: true,
    installations: { claude: { path: `.claude/skills/${provider.install_name}`, ownership: 'vibetether' } },
  }));
  const board = createCapabilityBoard(
    registry,
    'standard',
    { exposures, skills: exposures, bundles: ['production'] },
    ['claude'],
  );
  const migration = resolveBoardRoute(board, {
    phase: 'PLAN',
    capability: 'migration',
    signals: ['migration', 'destructive-data-change'],
    harness: 'claude',
  });
  const security = resolveBoardRoute(board, {
    phase: 'REVIEW',
    capability: 'security-review',
    signals: ['security', 'permission-security-or-privacy'],
    harness: 'claude',
  });
  const release = resolveBoardRoute(board, {
    phase: 'SHIP',
    capability: 'release-verification',
    signals: ['release', 'merge-deploy-release-or-publish'],
    harness: 'claude',
  });

  assert.equal(migration.selection.skill, 'deprecation-and-migration');
  assert.equal(security.selection.skill, 'security-and-hardening');
  assert.equal(release.selection.skill, 'shipping-and-launch');
  assert.equal(migration.confirmation_required, true);
  assert.equal(security.confirmation_required, true);
  assert.equal(release.confirmation_required, true);
  assert.equal(migration.required_outputs.includes('migration_plan'), true);
  assert.ok(security.exit_evidence.length > 0);
});

test('standard installs the full grill entry and specialist workflow bundle without a competing router', async () => {
  const registry = await loadProviderRegistry();
  const providers = resolveProfileProviders(registry, 'standard');
  const names = providers.map((provider) => provider.install_name);

  for (const required of [
    'grill-me',
    'grilling',
    'grill-with-docs',
    'domain-modeling',
    'brainstorming',
    'writing-plans',
    'executing-plans',
    'subagent-driven-development',
    'test-driven-development',
    'systematic-debugging',
    'verification-before-completion',
    'requesting-code-review',
    'finishing-a-development-branch',
  ]) {
    assert.equal(names.includes(required), true, `standard is missing ${required}`);
  }
  assert.equal(names.includes('using-superpowers'), false);
  assert.equal(resolveProfileProviders(registry, 'core').length, 0);
});

test('vague requirements automatically route to model-invokable grilling', async () => {
  const registry = await loadProviderRegistry();
  const routing = buildRoutingDocument(registry, 'standard');
  const route = resolveRoute(routing, {
    phase: 'DISCOVER',
    capability: 'requirements-clarification',
    signals: ['goal-unclear', 'scope-unclear'],
  });

  assert.equal(route.provider, 'grilling');
  assert.equal(route.selection, 'recommend');
  assert.equal(route.required, false);
  assert.equal(route.fallback, 'vibetether-built-in-alignment');
  assert.match(route.reason, /vague|unclear/i);
});

test('extended adds one UI domain provider without replacing the design workflow primary', async () => {
  const registry = await loadProviderRegistry();
  const standard = buildRoutingDocument(registry, 'standard');
  const extended = buildRoutingDocument(registry, 'extended');
  const standardProviders = resolveProfileProviders(registry, 'standard').map((provider) => provider.install_name);
  const extendedProviders = resolveProfileProviders(registry, 'extended').map((provider) => provider.install_name);

  assert.equal(standardProviders.includes('frontend-design'), false);
  assert.equal(extendedProviders.includes('frontend-design'), true);

  const designPrimary = resolveRoute(extended, { phase: 'DESIGN', capability: 'product-design', signals: [] });
  const uiDomain = resolveRoute(extended, {
    phase: 'DESIGN',
    capability: 'frontend-product-design',
    signals: ['user-visible-ui'],
  });
  assert.equal(designPrimary.provider, 'brainstorming');
  assert.equal(designPrimary.workflow_role, 'primary');
  assert.equal(uiDomain.provider, 'frontend-design');
  assert.equal(uiDomain.workflow_role, 'domain');

  const inlineExecution = resolveRoute(extended, {
    phase: 'EXECUTE_ONE',
    capability: 'plan-execution',
    signals: [],
  });
  const delegatedExecution = resolveRoute(extended, {
    phase: 'EXECUTE_ONE',
    capability: 'plan-execution',
    signals: ['subagents-available', 'delegation-authorized'],
  });
  assert.equal(inlineExecution.provider, 'executing-plans');
  assert.equal(delegatedExecution.provider, 'subagent-driven-development');
});

test('unknown profiles and unmatched required routes fail closed', async () => {
  const registry = await loadProviderRegistry();
  assert.throws(() => resolveProfileProviders(registry, 'everything'), /unknown profile/i);
  const routing = buildRoutingDocument(registry, 'standard');
  assert.equal(resolveRoute(routing, { phase: 'SHIP', capability: 'database-migration', signals: [] }), null);
});

test('a route cannot recommend a Skill outside the selected profile', async () => {
  const registry = structuredClone(await loadProviderRegistry());
  registry.routes.push({
    id: 'ghost-route',
    profiles: ['standard'],
    phase: 'PLAN',
    capability: 'planning',
    provider: 'not-installed',
    selection: 'recommend',
  });
  assert.throws(() => buildRoutingDocument(registry, 'standard'), /route.*not-installed.*not.*profile/i);
});

test('a competing router can be cataloged but cannot be automatically exposed', async () => {
  const registry = structuredClone(await loadProviderRegistry());
  const brainstorming = registry.sources
    .flatMap((source) => source.skills)
    .find((provider) => provider.install_name === 'brainstorming');
  brainstorming.workflow_role = 'competing-router';
  brainstorming.exposure = 'auto';

  assert.throws(() => buildRoutingDocument(registry, 'standard'), /competing router.*exposed/i);
});

test('every provider capability must resolve to a declared board contract', async () => {
  const registry = structuredClone(await loadProviderRegistry());
  registry.sources[0].skills[0].capabilities = ['missing-capability-contract'];

  assert.throws(() => buildRoutingDocument(registry, 'standard'), /unknown capability.*missing-capability-contract/i);
});

test('equal-priority automatic primary routes fail closed', async () => {
  const registry = structuredClone(await loadProviderRegistry());
  const primary = registry.routes.find(
    (route) => route.profiles.includes('standard') && route.workflow_role === 'primary',
  );
  registry.routes.push({ ...primary, id: 'ambiguous-primary', provider: 'writing-plans' });

  assert.throws(() => buildRoutingDocument(registry, 'standard'), /ambiguous primary routes/i);
});

test('upstream explicit aliases declare the automatic routes that cover their behavior', async () => {
  const registry = await loadProviderRegistry();
  const providers = resolveProfileProviders(registry, 'standard');
  const exposures = providers.map((provider) => ({
    ...provider,
    active: true,
    installations: { codex: { path: `.agents/skills/${provider.install_name}`, ownership: 'vibetether' } },
  }));
  const routes = createCapabilityBoard(
    registry,
    'standard',
    { exposures, skills: exposures, bundles: [] },
    ['codex'],
  ).routes.map((route) => ({ ...route, provider: route.recommendation.skill }));
  for (const provider of providers) {
    const routed = routes.some((route) => route.provider === provider.install_name);
    assert.equal(
      routed || provider.invocation_policy === 'upstream-explicit-alias',
      true,
      `${provider.install_name} is installed but invisible to routing`,
    );
  }
  const grillMe = providers.find((provider) => provider.install_name === 'grill-me');
  const grillWithDocs = providers.find((provider) => provider.install_name === 'grill-with-docs');
  assert.equal(grillMe.invocation_policy, 'upstream-explicit-alias');
  assert.deepEqual(grillMe.auto_covered_by, ['grilling']);
  assert.equal(grillWithDocs.invocation_policy, 'upstream-explicit-alias');
  assert.deepEqual(grillWithDocs.auto_covered_by, ['grilling', 'domain-modeling']);
  for (const alias of [grillMe, grillWithDocs]) {
    for (const provider of alias.auto_covered_by) {
      assert.equal(routes.some((route) => route.provider === provider), true, `${alias.install_name} is not auto-covered by ${provider}`);
    }
  }
});

test('the entry router automatically assesses work readiness before consequential work', async () => {
  const registry = await loadProviderRegistry();
  assert.equal(registry.readiness_gate.mode, 'automatic');
  assert.deepEqual(registry.readiness_gate.run_before, [
    'task-entry',
    'phase-transition',
    'consequential-action',
    'resume-or-compaction-recovery',
  ]);
  for (const dimension of [
    'user-and-outcome',
    'scope-and-non-goals',
    'success-evidence',
    'applicable-project-truth',
    'unresolved-conflicts',
    'directional-decisions',
    'current-slice',
    'verification-path',
    'authorization-and-risk',
  ]) {
    assert.equal(registry.readiness_gate.dimensions.includes(dimension), true, `missing readiness dimension ${dimension}`);
  }
  assert.equal(registry.readiness_gate.fact_gap, 'investigate-autonomously-before-asking');
  assert.equal(registry.readiness_gate.direction_gap, 'route-to-clarification-and-ask-one-recommended-question');
  assert.equal(registry.readiness_gate.implementation_requires, 'READY_FOR_IMPLEMENT_ONE');

  const routing = buildRoutingDocument(registry, 'standard');
  assert.equal(routing.selection_policy.readiness_assessment, 'automatic-before-consequential-work');
});

test('registry validation fails closed when readiness or alias coverage is incomplete', async () => {
  const missingReadiness = structuredClone(await loadProviderRegistry());
  delete missingReadiness.readiness_gate;
  assert.throws(() => buildRoutingDocument(missingReadiness, 'standard'), /readiness gate/i);

  const missingCoverage = structuredClone(await loadProviderRegistry());
  const grillMe = missingCoverage.sources
    .flatMap((source) => source.skills)
    .find((provider) => provider.install_name === 'grill-me');
  delete grillMe.auto_covered_by;
  assert.throws(() => buildRoutingDocument(missingCoverage, 'standard'), /explicit alias.*automatic coverage/i);

  const unknownCoverage = structuredClone(await loadProviderRegistry());
  const grillWithDocs = unknownCoverage.sources
    .flatMap((source) => source.skills)
    .find((provider) => provider.install_name === 'grill-with-docs');
  grillWithDocs.auto_covered_by.push('not-installed');
  assert.throws(() => buildRoutingDocument(unknownCoverage, 'standard'), /automatic coverage.*not-installed/i);

  const missingClassification = structuredClone(await loadProviderRegistry());
  delete missingClassification.sources.find((source) => source.catalog_mode === 'complete').skills[0].fallback;
  assert.throws(() => buildRoutingDocument(missingClassification, 'standard'), /classification.*fallback/i);
});

test('auxiliary standard Skills have signal-driven advisory routes', async () => {
  const registry = await loadProviderRegistry();
  const routing = buildRoutingDocument(registry, 'standard');
  assert.equal(resolveRoute(routing, {
    phase: 'EXECUTE_ONE',
    capability: 'parallel-execution',
    signals: ['multiple-independent-tasks', 'subagents-available', 'delegation-authorized'],
  }).provider, 'dispatching-parallel-agents');
  assert.equal(resolveRoute(routing, {
    phase: 'REVIEW',
    capability: 'review-feedback',
    signals: ['review-feedback-received'],
  }).provider, 'receiving-code-review');
  assert.equal(resolveRoute(routing, {
    phase: 'PLAN',
    capability: 'git-isolation',
    signals: ['isolation-needed'],
  }).provider, 'using-git-worktrees');
  assert.equal(resolveRoute(routing, {
    phase: 'PLAN',
    capability: 'skill-authoring',
    signals: ['skill-creation-or-update'],
  }).provider, 'writing-skills');
  assert.equal(resolveRoute(routing, {
    phase: 'EXECUTE_ONE',
    capability: 'skill-authoring',
    signals: ['skill-creation-or-update'],
  }).provider, 'writing-skills');
  assert.equal(resolveRoute(routing, {
    phase: 'VERIFY',
    capability: 'skill-authoring',
    signals: ['skill-creation-or-update'],
  }).provider, 'writing-skills');
});
