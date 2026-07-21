#!/usr/bin/env node
import { loadProviderRegistry } from '../src/provider-registry.mjs';
import { createSkillsLock } from '../src/contract.mjs';
import { brokerSkills } from '../src/skill-broker.mjs';
import { classifyTaskText } from '../src/task-classifier.mjs';

const registry=await loadProviderRegistry();
const lock=createSkillsLock({packs:['standard','extended','web','production']});
const base={agent:'codex',permissions:{network:false,external_write:false,code_write:true}};

const train=[
  {text:'The service crashes intermittently; diagnose the root cause before changing code.',provider:'superpowers-systematic-debugging'},
  {text:'这个程序间歇崩溃，请先排查根因。',provider:'superpowers-systematic-debugging'},
  {text:'Plan this approved feature as small verifiable slices.',provider:'superpowers-writing-plans'},
  {text:'把这个已批准功能拆成小而可验证的实施计划。',provider:'superpowers-writing-plans'},
  {text:'Use test-first development for this new behavior.',provider:'superpowers-test-driven-development'},
  {text:'先写失败测试，再实现这个新功能。',provider:'superpowers-test-driven-development'},
  {text:'Explore alternatives for the new user experience and visual direction.',provider:'superpowers-brainstorming'},
  {text:'帮我做一个现代一点的后台。',provider:'mattpocock-grilling'},
  {text:'Fix this known small typo in the parser.',provider:'vibetether-built-in-implementation',overlay:'vibetether-built-in-surgical-change-policy'},
  {text:'Review the current code diff for correctness.',provider:'vibetether-built-in-review'},
  {text:'Verify that the implementation actually works.',provider:'vibetether-built-in-verification'},
  {text:'Prepare the approved release for publication.',provider:'vibetether-built-in-release'},
];

const heldOut=[
  {text:'A flaky test only fails on CI; reproduce and find the cause.',provider:'superpowers-systematic-debugging'},
  {text:'Add an export feature.',provider:'mattpocock-grilling',needsUserDecision:true},
  {text:'Implement authentication.',provider:'mattpocock-grilling',needsUserDecision:true},
  {text:'Please improve checkout.',provider:'mattpocock-grilling',needsUserDecision:true},
  {text:'加一个导出功能。',provider:'mattpocock-grilling',needsUserDecision:true},
  {text:'把登录做好一点。',provider:'mattpocock-grilling',needsUserDecision:true},
  {text:'Please use deep mode, verify the facts, and wait for my confirmation before coding.',provider:'vibetether-built-in-alignment',needsUserDecision:true,deep:true},
  {text:'请规划这个多阶段改动，每一步都要有验证方式。',provider:'superpowers-writing-plans'},
  {text:'Implement the regression test first, then make it pass.',provider:'superpowers-test-driven-development'},
  {text:'We need a deliberate UX direction before touching the frontend.',provider:'superpowers-brainstorming'},
  {text:'Build me a customer portal, but I have not decided the user flow yet.',provider:'mattpocock-grilling'},
  {text:'Refactor this local helper without changing public behavior.',provider:'vibetether-built-in-implementation',overlay:'vibetether-built-in-surgical-change-policy'},
  {text:'审查这次改动是否符合需求。',provider:'vibetether-built-in-review'},
  {text:'部署已经批准的版本。',provider:'vibetether-built-in-release'},
];

const adversarialControlled=[
  {text:'Deploy the service and then show me the logs.',provider:'vibetether-built-in-release',needsUserDecision:true},
  {text:'Delete old accounts and explain what changed.',provider:'mattpocock-grilling',needsUserDecision:true},
  {text:'Do not use deep mode; implement the new public API.',provider:'mattpocock-grilling',needsUserDecision:true,deep:false},
  ...[
    'Wire up SSO for enterprise users.','Add OAuth login to the customer portal.','Support OIDC for enterprise tenants.',
    'Implement passkey authentication with WebAuthn.','Integrate Stripe subscriptions.','Add soft delete for accounts.',
    'Expose a GraphQL API for reporting.','Encrypt customer data at rest.','Add role-based access control.',
    'Make the product multi-tenant.','Modernize the admin interface.','给企业用户接入单点登录。','加入 OAuth 登录。',
    '支持 Passkey 登录。','接入 Stripe 订阅支付。','给账户增加软删除。','增加 GraphQL 查询接口。',
    '给客户数据增加静态加密。','增加基于角色的权限控制。','把系统改成多租户。','把后台界面改得更现代。','新增企业 SSO 功能。',
  ].map((text)=>({text,provider:'mattpocock-grilling',needsUserDecision:true})),
  {text:'Redesign the checkout flow.',provider:'superpowers-brainstorming',needsUserDecision:true},
  {text:'重新设计结账流程。',provider:'superpowers-brainstorming',needsUserDecision:true},
  ...[
    'The SSO callback fails intermittently after login.','OAuth token refresh crashes only on CI.',
    'Stripe webhooks are duplicated sometimes; find the root cause.','SSO 回调偶发失败，请找根因。',
    'OAuth 刷新令牌在 CI 上崩溃。','Stripe webhook 偶尔重复，请先排查。',
  ].map((text)=>({text,provider:'superpowers-systematic-debugging'})),
  {text:'Plan the already approved SSO rollout as small verifiable slices.',provider:'superpowers-writing-plans'},
  {text:'把已经批准的 SSO 改造拆成小步计划。',provider:'superpowers-writing-plans'},
  {text:'In src/export.ts, add a CSV delimiter option without changing the public API and make export.test.ts pass.',provider:'vibetether-built-in-implementation'},
  {text:'在 src/export.ts 中增加 CSV 分隔符选项，不改变公开 API，并让 export.test.ts 通过。',provider:'vibetether-built-in-implementation'},
];
const adversarialObservation=[
  'Explain how the current SSO flow works without changing code.','Find where Stripe is configured; do not modify anything.',
  'List the GraphQL entry points only.','解释当前单点登录流程，不要修改代码。','定位 Stripe 配置文件，只读。','列出 GraphQL 入口，不做修改。',
];

function evaluate(cases){
  let top1=0,top3=0,classification=0,overlay=0;
  const results=[];
  for(const item of cases){
    const classified=classifyTaskText(item.text,{intentStatus:'confirmed',currentPhase:'DISCOVER'});
    if(!classified.capability){results.push({...item,error:'unclassified',classified});continue;}
    const permissions={...base.permissions,code_write:classified.phase==='EXECUTE_ONE'};
    const routed=brokerSkills(registry,{...base,phase:classified.phase,capability:classified.capability,signals:classified.signals,permissions},lock,null,{});
    const ids=routed.shortlist.map((candidate)=>candidate.id);
    const selected=routed.selected.id;
    if(selected===item.provider) top1+=1;
    if(ids.includes(item.provider)) top3+=1;
    if(classified.phase&&classified.capability) classification+=1;
    if(!item.overlay||routed.overlays.some((candidate)=>candidate.id===item.overlay)) overlay+=1;
    const decisionGate = item.needsUserDecision === undefined || classified.needs_user_decision === item.needsUserDecision;
    const deepGate = item.deep === undefined || classified.deep_requested === item.deep;
    if (!decisionGate || !deepGate) classification-=1;
    results.push({text:item.text,phase:classified.phase,capability:classified.capability,needs_user_decision:classified.needs_user_decision,deep_requested:classified.deep_requested,expected:item.provider,selected,top3:ids,overlays:routed.overlays.map((value)=>value.id)});
  }
  return {cases:cases.length,classification_rate:classification/cases.length,top1_accuracy:top1/cases.length,top3_recall:top3/cases.length,overlay_accuracy:overlay/cases.length,results};
}

const observationCases=[
  'Read this file and explain it.',
  '请读取 README 并总结，不要修改。',
  'What does this configuration mean?',
];
const observationAccuracy=observationCases.filter((text)=>classifyTaskText(text,{intentStatus:'confirmed'}).mode==='observation').length/observationCases.length;

const synthetic={...registry.providers.find((item)=>item.id==='vibetether-built-in-implementation'),id:'synthetic-negative',positive_triggers:['bug-fix'],negative_triggers:['known-small-fix'],quality:{trigger_precision:1,trigger_recall:1,output_gain:10,evaluated_at:new Date().toISOString()}};
const negativeRegistry={...registry,providers:[...registry.providers,synthetic]};
const negative=brokerSkills(negativeRegistry,{...base,phase:'EXECUTE_ONE',capability:'implementation',signals:['bug-fix','known-small-fix']},createSkillsLock({packs:[]}),null,{});
const negativeTriggerAccuracy=negative.selected.id!=='synthetic-negative'?1:0;

const adversarialObservationAccuracy=adversarialObservation.filter((text)=>classifyTaskText(text,{intentStatus:'confirmed'}).mode==='observation').length/adversarialObservation.length;
const summary={schema_version:1,train:evaluate(train),held_out:evaluate(heldOut),adversarial:evaluate(adversarialControlled),observation_accuracy:observationAccuracy,adversarial_observation_accuracy:adversarialObservationAccuracy,negative_trigger_accuracy:negativeTriggerAccuracy,limitations:['Fixed deterministic regression corpora; results do not establish general natural-language routing accuracy.','The adversarial corpus was created from prior external findings and is a regression set, not an unrevealed independent forward test.',`This run covers only ${process.platform}; cross-platform host behavior still requires the configured CI matrix and platform-specific review.`]};
console.log(JSON.stringify(summary,null,2));
if(summary.train.top1_accuracy<0.9||summary.train.top3_recall<0.95||summary.held_out.top1_accuracy<0.85||summary.held_out.top3_recall<0.95||summary.adversarial.top1_accuracy<0.95||summary.adversarial.top3_recall<0.95||observationAccuracy<1||adversarialObservationAccuracy<1||negativeTriggerAccuracy<1) process.exit(1);
