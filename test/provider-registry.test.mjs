import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRoutingDocument,
  loadProviderRegistry,
  resolveProfileProviders,
  resolveRoute,
} from '../src/provider-registry.mjs';

test('provider registry pins complete auditable upstream skill sources', async () => {
  const registry = await loadProviderRegistry();
  assert.equal(registry.schema_version, 1);
  assert.equal(registry.runtime_auto_install, false);

  const installNames = [];
  for (const source of registry.sources) {
    assert.match(source.repository, /^https:\/\/github\.com\//);
    assert.match(source.commit, /^[a-f0-9]{40}$/);
    assert.notEqual(source.ref, 'main');
    assert.notEqual(source.ref, 'latest');
    assert.match(source.license, /^(MIT|Apache-2\.0)$/);
    assert.equal(typeof source.license_path, 'string');
    assert.ok(source.skills.length > 0);
    for (const skill of source.skills) {
      installNames.push(skill.install_name);
      assert.match(skill.path, /SKILL|skills/i);
      assert.match(skill.fingerprint, /^[a-f0-9]{64}$/);
      assert.ok(skill.capabilities.length > 0);
    }
  }
  assert.equal(new Set(installNames).size, installNames.length);
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

test('vague requirements recommend model-invokable grilling instead of forcing the explicit grill-me alias', async () => {
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

test('every standard Skill is visible to routing or explicitly marked user-invoked', async () => {
  const registry = await loadProviderRegistry();
  const providers = resolveProfileProviders(registry, 'standard');
  const routes = buildRoutingDocument(registry, 'standard').routes;
  for (const provider of providers) {
    const routed = routes.some((route) => route.provider === provider.install_name);
    assert.equal(
      routed || provider.invocation_policy === 'explicit-only',
      true,
      `${provider.install_name} is installed but invisible to routing`,
    );
  }
  const grillMe = providers.find((provider) => provider.install_name === 'grill-me');
  const grillWithDocs = providers.find((provider) => provider.install_name === 'grill-with-docs');
  assert.equal(grillMe.invocation_policy, 'explicit-only');
  assert.equal(grillWithDocs.invocation_policy, 'explicit-only');
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
