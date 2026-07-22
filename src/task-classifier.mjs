import { normalizeSignal } from './files.mjs';

const RULES = [
  {
    phase: 'EXECUTE_ONE', capability: 'tdd',
    pattern: /\b(?:test[- ]first|tdd|red green|regression test first)\b|测试先行|先写(?:失败|回归)?测试/u,
    signals: ['test-first', 'new-behavior'],
    reason: 'The request explicitly asks for test-first behavior work.',
  },
  {
    phase: 'DIAGNOSE', capability: 'debugging',
    pattern: /\b(?:debug(?:ging)?|diagnos(?:e|is|ing)?|crash(?:es|ed|ing)?|fail(?:s|ed|ing|ure)?|flaky|intermittent(?:ly)?|root cause|find (?:the )?cause|reproduce|broken|error(?:s)?|timeout(?:s)?|hang(?:s|ing)?|duplicat(?:e|ed|es|ing)|mismatch(?:es|ed|ing)?|clock skew)\b|排查|诊断|崩溃|间歇|偶发|失败|根因|复现|报错|超时|卡死|重复|不匹配|时钟偏差/u,
    signals: ['unexpected-behavior', 'runtime-failure'],
    reason: 'The request describes unexpected or failing behavior that needs diagnosis before a fix.',
  },
  {
    phase: 'REVIEW', capability: 'review',
    pattern: /\b(?:review|audit|inspect the diff|code review)\b|审查|评审|代码审核/u,
    signals: ['code-review'],
    reason: 'The request asks for review rather than implementation.',
  },
  {
    phase: 'SHIP', capability: 'release',
    pattern: /\b(?:deploy|deployment|release|publish|production rollout|ship)\b|部署|发布|上线/u,
    signals: ['release'],
    reason: 'The request crosses a deployment, publication, or release boundary.',
  },
  {
    phase: 'PLAN', capability: 'planning',
    pattern: /\b(?:plan|planning|break down|implementation plan|milestone|slice)\b|规划|计划|拆分|里程碑/u,
    signals: ['multi-step-change', 'planning'],
    reason: 'The request asks to structure approved work into verifiable slices.',
  },
  {
    phase: 'DESIGN', capability: 'frontend-product-design',
    pattern: /(?=.*\b(?:redesign|design|ux|user experience|interface|ui|frontend|visual|reference|screenshot)\b)(?=.*\b(?:ui|interface|screen|page|frontend|visual|reference|screenshot)\b)|(?:重新设计|设计|参考|截图).{0,40}(?:界面|页面|前端)|(?:界面|页面|前端).{0,40}(?:重新设计|设计|参考|截图)/u,
    signals: ['frontend-product-design', 'user-visible-ui'],
    reason: 'The request requires a user-approved product UX and visual direction before frontend implementation.',
  },
  {
    phase: 'DESIGN', capability: 'product-design',
    pattern: /\b(?:redesign|design direction|ux|user experience|interface direction|visual direction)\b|重新设计|设计方向|用户体验|视觉方向|界面方向/u,
    signals: ['product-design', 'user-visible-ui'],
    reason: 'The request requires a product or visual direction before implementation.',
  },
  {
    phase: 'VERIFY', capability: 'verification',
    pattern: /\b(?:verify|verification|validate|acceptance test|prove it works)\b|验证|验收|确认可用/u,
    signals: ['verification'],
    reason: 'The request is primarily a verification claim.',
  },
  {
    phase: 'EXECUTE_ONE', capability: 'implementation',
    pattern: /\b(?:implement|build|add|change|refactor|fix|repair)\b|实现|开发|新增|增加|修改|重构|修复|加一个|添加/u,
    signals: ['new-behavior'],
    reason: 'The request asks for a bounded implementation change.',
  },
];

const DEEP = /\b(?:vibe[- ]?tether[- ]?deep|deep mode|use deep|deep analysis|fact[- ]check before (?:work|coding|implementation))\b|深度模式|深度核对|先核对事实|确认后再(?:开工|实现|编码)/u;
const DEEP_NEGATED = /\b(?:do not|don't|never|without)\s+(?:use|using|invoke|invoking|enable|enabling)?\s*(?:vibe[- ]?tether[- ]?deep|deep mode|deep analysis)\b|不要(?:使用|调用|启用)?(?:\s*)(?:vibe[- ]?tether[- ]?deep|deep\s*模式|深度模式)|不使用(?:\s*)(?:deep\s*模式|深度模式)/u;
const VAGUE = /\b(?:make it better|make .* better|modernize|improve(?: it| everything| checkout| login)?|build me|create an app|do this project|add (?:an? )?.* feature)\b|做得更好|现代一点|帮我做|做一个|优化一下|改善一下|做好一点|加一个.*功能|添加.*功能|新增.*功能/u;
const DECISIONAL = /\b(?:architecture|architectural|public api|new api|database schema|security policy|authentication|authorization|permission|migration|visual direction|release policy)\b|架构|公共接口|新增接口|数据库结构|认证|鉴权|安全策略|权限|迁移|视觉方向|发布策略/u;
const GENERIC_FEATURE = /\b(?:add|implement|build|create)\s+(?:an?\s+)?(?:new\s+)?(?:export|authentication|auth|login|checkout|api|feature)\b|(?:实现|新增|添加|加一个).*(?:导出|认证|登录|结账|接口|功能)/u;
const SPECIFIC = /\b(?:in\s+[^ ]+\.(?:js|ts|tsx|py|go|rs)|issue\s*#?\d+|acceptance|such that|when\s+.+then|test\s+.+|preserve\s+.+|without\s+changing)\b|(?:在|修改)\s*[\w./-]+\.(?:js|ts|tsx|py|go|rs)|在\S+文件|验收|当.+时|测试|保持.+不变|不得改变/u;
const BOUNDED_LOCAL = /\b(?:known small|small typo|typo|local helper|bounded(?: implementation)? change|exact file|without changing (?:the )?public api|without changing public behavior|without changing behavior)\b|错别字|局部修改|明确文件|不改变(?:公开|公共)?\s*(?:api|接口|行为)/u;
const READ_ONLY = /(?:\b(?:read|explain|summarize|inspect(?: only)?|review only|locate|show|list|where is|what is|what does|how does|which file|do not (?:change|modify|edit)(?: anything)?|don't (?:change|modify|edit)(?: anything)?|no changes|without changing anything)\b|读取|解释|总结|只读|定位|列出|在哪里|是什么|如何工作|哪个文件|不要修改|不做修改|不要改|无需修改)/u;
const READ_ONLY_FIND = /(?:\bfind\s+(?:(?:the\s+)?(?:file|path|definition|reference|usage|location)|where\b)|查找(?:文件|路径|定义|引用|用法|位置))/u;
const DEPLOY_ACTION = /\b(?:deploy|ship|roll\s*out)\b|\brelease\s+(?:the|this|that|an?\s+approved|approved|version|package|service|build)\b|部署|上线|投产/u;
const PUBLICATION_ACTION = /\bpublish\b|发布(?:包|版本|制品|软件|应用)|公开发布/u;
const MIGRATION_ACTION = /\b(?:run|apply|execute|perform|start)\s+(?:the\s+|an?\s+)?(?:database\s+|data\s+)?migration\b|执行(?:数据库|数据)?迁移|运行(?:数据库|数据)?迁移|应用迁移/u;
const DESTRUCTIVE_ACTION = /\b(?:delete|drop|purge|destroy|truncate|wipe)\b|删除|清空|销毁|永久移除/u;
const EXPLICIT_APPROVAL = /\b(?:approved|user[- ]approved|confirmed by the user|already confirmed)\b|已经批准|已批准|用户已确认|用户确认过/u;

function directionalCandidate(source) {
  return source
    .replace(/\bwithout\s+(?:changing|modifying|altering)\s+(?:the\s+)?(?:public\s+api|public\s+behavior|architecture|database\s+schema)\b/gu, '')
    .replace(/不(?:改变|修改|调整)(?:公开|公共)?\s*(?:api|接口|行为|架构|数据库结构)/gu, '');
}

export function classifyTaskText(text, { intentStatus = 'confirmed', currentPhase = 'DISCOVER' } = {}) {
  const source = String(text ?? '').trim();
  const lowered = source.toLowerCase();
  const deepRequested = DEEP.test(lowered) && !DEEP_NEGATED.test(lowered);
  const explicitObservation = READ_ONLY.test(lowered) || READ_ONLY_FIND.test(lowered);
  const writeCandidate = lowered
    .replace(/\b(?:do not|don't|without)\s+(?:change|modify|edit|write)(?:\s+anything)?\b/gu, '')
    .replace(/(?:不要修改|不做修改|不要改|无需修改)/gu, '');
  const directionCandidate = directionalCandidate(lowered);
  const deployAction = DEPLOY_ACTION.test(lowered);
  const publicationAction = PUBLICATION_ACTION.test(lowered);
  const migrationAction = MIGRATION_ACTION.test(lowered);
  const destructiveAction = DESTRUCTIVE_ACTION.test(lowered);
  const impactSignals = [
    ...(deployAction ? ['release'] : []),
    ...(publicationAction ? ['publication'] : []),
    ...(migrationAction ? ['migration'] : []),
    ...(destructiveAction ? ['destructive-action'] : []),
  ];
  const explicitWrite = /(?:\b(?:implement|build|add|change|modify|edit|refactor|fix|repair|write code)\b|实现|开发|新增|添加|加一个|修改|编辑|重构|修复|写代码)/u.test(writeCandidate)
    || impactSignals.length > 0;

  if (deepRequested) {
    return {
      phase: 'DISCOVER', capability: 'requirements-clarification', signals: ['deep-mode', 'fact-check-before-implementation'],
      mode: 'deep', deep_requested: true, needs_user_decision: true,
      reason: 'Deep mode requires a reviewed Start Card and a user-confirmed Implementation Permit before consequential work.',
    };
  }
  if (explicitObservation && !explicitWrite) {
    return { phase: currentPhase, capability: null, signals: ['read-only'], mode: 'observation', deep_requested: false, needs_user_decision: false, reason: 'The request is explicitly read-only or explanatory.' };
  }
  if (!source) {
    return {
      phase: currentPhase, capability: null, signals: [], mode: 'observation', deep_requested: false,
      needs_user_decision: intentStatus !== 'confirmed',
      reason: 'No task text was supplied; preserve the current lifecycle state.',
    };
  }
  if (destructiveAction || migrationAction) {
    return {
      phase: 'DISCOVER', capability: 'requirements-clarification',
      signals: [...new Set([...impactSignals, 'directional-decision', 'vague-request', 'requirements-unclear'].map(normalizeSignal))],
      mode: 'controlled', deep_requested: false, needs_user_decision: true,
      reason: 'Destructive or migration work requires an exact target, recovery path, evidence, and explicit user decision before execution.',
    };
  }
  if (intentStatus !== 'confirmed' || VAGUE.test(lowered) || (GENERIC_FEATURE.test(lowered) && !SPECIFIC.test(lowered))) {
    return {
      phase: 'DISCOVER', capability: 'requirements-clarification', signals: ['vague-request'],
      mode: 'controlled', deep_requested: false, needs_user_decision: true,
      reason: 'The requested behavior, scope, or acceptance evidence is not specific enough for consequential work.',
    };
  }
  for (const rule of RULES) {
    if (!rule.pattern.test(lowered)) continue;
    const unboundedImplementation = rule.phase === 'EXECUTE_ONE'
      && rule.capability === 'implementation'
      && !SPECIFIC.test(lowered)
      && !BOUNDED_LOCAL.test(lowered);
    const structural = DECISIONAL.test(directionCandidate) || unboundedImplementation || ['DESIGN', 'SHIP'].includes(rule.phase);
    const clarificationSignals = structural && rule.phase === 'EXECUTE_ONE'
      ? ['requirements-unclear']
      : [];
    return {
      phase: structural && rule.phase === 'EXECUTE_ONE' ? 'DISCOVER' : rule.phase,
      capability: structural && rule.phase === 'EXECUTE_ONE' ? 'requirements-clarification' : rule.capability,
      signals: [...new Set([...rule.signals, ...impactSignals, ...clarificationSignals, ...(structural && rule.capability !== 'frontend-product-design' ? ['directional-decision'] : [])].map(normalizeSignal))],
      mode: structural || ['PLAN', 'EXECUTE_ONE', 'DIAGNOSE'].includes(rule.phase) ? 'controlled' : 'observation',
      deep_requested: false,
      needs_user_decision: structural && !(rule.phase === 'SHIP' && EXPLICIT_APPROVAL.test(lowered)),
      reason: structural
        ? 'The request contains or may conceal a direction-sensitive product, architecture, data, security, permission, or public-contract decision.'
        : rule.reason,
    };
  }
  return {
    phase: 'DISCOVER', capability: 'requirements-clarification', signals: ['requirements-unclear', 'clarification-required', 'unclassified-impact'], mode: 'controlled', deep_requested: false,
    needs_user_decision: true,
    reason: 'The task could not be classified as an explicitly read-only request or a bounded known operation; consequential work must fail closed until scope and success evidence are clarified.',
  };
}
