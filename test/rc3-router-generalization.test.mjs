import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProviderRegistry } from '../src/provider-registry.mjs';
import { createSkillsLock } from '../src/contract.mjs';
import { brokerSkills } from '../src/skill-broker.mjs';
import { classifyTaskText } from '../src/task-classifier.mjs';

const registry = await loadProviderRegistry();
const lock = createSkillsLock({ packs: ['standard', 'extended', 'web', 'production'] });
const base = {
  agent: 'codex',
  permissions: { network: false, external_write: false, code_write: true },
};

function route(text) {
  const classification = classifyTaskText(text, { intentStatus: 'confirmed', currentPhase: 'DISCOVER' });
  if (!classification.capability) return { classification, routed: null };
  const routed = brokerSkills(registry, {
    ...base,
    phase: classification.phase,
    capability: classification.capability,
    signals: classification.signals,
    permissions: { ...base.permissions, code_write: classification.phase === 'EXECUTE_ONE' },
  }, lock, null, {});
  return { classification, routed };
}

const requirementsPrompts = [
  'Wire up SSO for enterprise users.',
  'Add OAuth login to the customer portal.',
  'Support OIDC for enterprise tenants.',
  'Implement passkey authentication with WebAuthn.',
  'Integrate Stripe subscriptions.',
  'Add soft delete for accounts.',
  'Expose a GraphQL API for reporting.',
  'Encrypt customer data at rest.',
  'Add role-based access control.',
  'Make the product multi-tenant.',
  'Modernize the admin interface.',
  '给企业用户接入单点登录。',
  '加入 OAuth 登录。',
  '支持 Passkey 登录。',
  '接入 Stripe 订阅支付。',
  '给账户增加软删除。',
  '增加 GraphQL 查询接口。',
  '给客户数据增加静态加密。',
  '增加基于角色的权限控制。',
  '把系统改成多租户。',
  '把后台界面改得更现代。',
  '新增企业 SSO 功能。',
];

test('unseen consequential feature and integration language fails closed and routes to the richer clarification provider', () => {
  for (const text of requirementsPrompts) {
    const { classification, routed } = route(text);
    assert.equal(classification.mode, 'controlled', text);
    assert.equal(classification.phase, 'DISCOVER', text);
    assert.equal(classification.capability, 'requirements-clarification', text);
    assert.equal(classification.needs_user_decision, true, text);
    assert.equal(routed.selected.id, 'mattpocock-grilling', text);
    assert.ok(routed.shortlist.some(({ id }) => id === 'mattpocock-grilling'), text);
  }
});

test('explicit redesign language remains direction-gated while selecting product-design rather than implementation', () => {
  for (const text of ['Redesign the checkout flow.', '重新设计结账流程。']) {
    const { classification, routed } = route(text);
    assert.equal(classification.phase, 'DESIGN', text);
    assert.equal(classification.capability, 'product-design', text);
    assert.equal(classification.needs_user_decision, true, text);
    assert.equal(routed.selected.id, 'superpowers-brainstorming', text);
  }
});

test('unseen authentication and payment failure language routes to systematic diagnosis', () => {
  const prompts = [
    'The SSO callback fails intermittently after login.',
    'OAuth token refresh crashes only on CI.',
    'Stripe webhooks are duplicated sometimes; find the root cause.',
    'An OpenID nonce mismatch appears only after server clock skew; reproduce it and find the cause before changing code.',
    'SSO 回调偶发失败，请找根因。',
    'OAuth 刷新令牌在 CI 上崩溃。',
    'Stripe webhook 偶尔重复，请先排查。',
  ];
  for (const text of prompts) {
    const { classification, routed } = route(text);
    assert.equal(classification.phase, 'DIAGNOSE', text);
    assert.equal(classification.capability, 'debugging', text);
    assert.equal(classification.needs_user_decision, false, text);
    assert.equal(routed.selected.id, 'superpowers-systematic-debugging', text);
  }
});

test('read-only near misses stay lightweight even when they mention high-impact domains', () => {
  const prompts = [
    'Explain how the current SSO flow works without changing code.',
    'Find where Stripe is configured; do not modify anything.',
    'List the GraphQL entry points only.',
    '解释当前单点登录流程，不要修改代码。',
    '定位 Stripe 配置文件，只读。',
    '列出 GraphQL 入口，不做修改。',
  ];
  for (const text of prompts) {
    const { classification, routed } = route(text);
    assert.equal(classification.mode, 'observation', text);
    assert.equal(classification.needs_user_decision, false, text);
    assert.equal(routed, null, text);
  }
});

test('approved planning and explicitly bounded implementation retain their specialized routes', () => {
  for (const text of [
    'Plan the already approved SSO rollout as small verifiable slices.',
    '把已经批准的 SSO 改造拆成小步计划。',
  ]) {
    const { classification, routed } = route(text);
    assert.equal(classification.capability, 'planning', text);
    assert.equal(classification.needs_user_decision, false, text);
    assert.equal(routed.selected.id, 'superpowers-writing-plans', text);
  }
  for (const text of [
    'In src/export.ts, add a CSV delimiter option without changing the public API and make export.test.ts pass.',
    '在 src/export.ts 中增加 CSV 分隔符选项，不改变公开 API，并让 export.test.ts 通过。',
  ]) {
    const { classification, routed } = route(text);
    assert.equal(classification.phase, 'EXECUTE_ONE', text);
    assert.equal(classification.capability, 'implementation', text);
    assert.equal(classification.needs_user_decision, false, text);
    assert.equal(routed.selected.id, 'vibetether-built-in-implementation', text);
  }
});
