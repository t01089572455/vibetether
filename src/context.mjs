import { CONTEXT_BUDGET_BYTES, PHASES } from './constants.mjs';
import { conflictError } from './errors.mjs';
import { canonicalJson, normalizeSignal, safeRelative } from './files.mjs';
import { discoverContract, skillsLockDigest } from './contract.mjs';
import { parseIntent } from './intent.mjs';
import { authoritySnapshot, parseTruthMap, readTruthArtifact } from './truth.mjs';
import { validateExperienceIndex, readExperienceArtifact, recallExperience } from './experience.mjs';
import { attachWorktree } from './worktree.mjs';
import { loadProviderRegistry } from './provider-registry.mjs';
import { validateRoutes } from './routes.mjs';
import { brokerSkills } from './skill-broker.mjs';
import { loadProviderStats, readRoute } from './runtime.mjs';
import { readSkillResource } from './skills.mjs';
import { classifyTaskText } from './task-classifier.mjs';
import { uiCapabilityContext } from './ui-control.mjs';
import { readDeepState, validateDeepPermit } from './deep.mjs';
import { loadOutcomeRegistry, outcomeStatus } from './outcomes.mjs';
import { outcomeProgressSummary, readOutcomeProgress } from './outcome-progress.mjs';

const DEFAULT_CAPABILITY={
  DISCOVER:'requirements-clarification',ALIGN:'document-alignment',DESIGN:'product-design',PLAN:'planning',
  EXECUTE_ONE:'implementation',VERIFY:'verification',REVIEW:'review',SHIP:'release',DIAGNOSE:'debugging',BLOCKED:'document-alignment',
};
const TRUTH_PAGE_SIZE=4;

function taskSignals(options,current) {
  const values=[...(options.signals??[]),process.platform,`node-${process.versions.node.split('.')[0]}`];
  const text=`${options.task_text??''} ${current.slice} ${current.next_action}`.toLowerCase();
  for (const [pattern,signal] of [
    [/bug|defect|fix|故障|错误|修复/,'bug-fix'],[/test|tdd|测试/,'test-first'],[/debug|failure|crash|排查|崩溃/,'unexpected-behavior'],
    [/review|审查|评审/,'code-review'],[/deploy|release|publish|部署|发布/,'release'],[/plan|slice|规划|计划/,'planning'],[/ui|frontend|界面|前端/,'user-visible-ui'],
  ]) if (pattern.test(text)) values.push(signal);
  return [...new Set(values.map(normalizeSignal).filter(Boolean))];
}

function compactCapsule(value) {
  let candidate=structuredClone(value);
  const bytes=()=>Buffer.byteLength(canonicalJson(candidate),'utf8');
  const shrinkTruth=(limit)=>{
    const prior=candidate.truth.length;
    candidate.truth=candidate.truth.slice(0,limit);
    candidate.truth_summary.returned=candidate.truth.length;
    candidate.truth_summary.omitted=Math.max(0,candidate.truth_summary.total-candidate.truth.length);
    return prior!==candidate.truth.length;
  };
  if (bytes()<=CONTEXT_BUDGET_BYTES) return candidate;
  candidate.skill.shortlist=candidate.skill.shortlist.slice(0,2).map((item)=>({id:item.id,channel:item.channel,reasons:item.reasons}));
  shrinkTruth(3);
  candidate.experience=candidate.experience.slice(0,2);
  if (candidate.outcomes) candidate.outcomes.handles=candidate.outcomes.handles.slice(0,2);
  if (bytes()<=CONTEXT_BUDGET_BYTES) return candidate;
  candidate.skill.shortlist=candidate.skill.shortlist.slice(0,1);
  shrinkTruth(2);
  candidate.experience=candidate.experience.slice(0,1);
  if (candidate.outcomes) candidate.outcomes.handles=candidate.outcomes.handles.slice(0,1);
  if (bytes()>CONTEXT_BUDGET_BYTES) throw conflictError(`Context Capsule exceeds ${CONTEXT_BUDGET_BYTES} bytes even after bounded projection.`,'CONTEXT_TOO_LARGE');
  return candidate;
}

function compactDeepCard(state) {
  const card = state?.start_card;
  if (!card) return null;
  return {
    id: card.id,
    slice: card.slice,
    success_evidence: (card.success_evidence ?? []).slice(0, 3),
    fact_count: (card.facts ?? []).length,
    assumption_count: (card.assumptions ?? []).length,
    decision_count: (card.decisions_needed ?? []).length,
    answered_question_count: (state.decision_receipts ?? []).length,
    remaining_question_count: Math.max(0, (state.questions ?? []).length - (state.decision_receipts ?? []).length),
    next_question: state.next_question ? {
      id: state.next_question.id,
      prompt: state.next_question.prompt,
      recommendation: state.next_question.recommendation,
      impact: state.next_question.impact,
    } : null,
    created_at: card.created_at,
  };
}

function scopeApplies(entry, requestedPaths = []) {
  if (!requestedPaths.length || entry.scope === '.' || entry.scope === '*') return true;
  const scope = String(entry.scope).replace(/^\.\//, '').replace(/\/$/, '');
  return requestedPaths.some((value) => {
    const portable = safeRelative(value, 'Context path');
    return portable === scope || portable.startsWith(`${scope}/`);
  });
}
function roleApplies(entry, { phase, capability, signals }) {
  if (entry.phases?.length && !entry.phases.includes(phase)) return false;
  if (entry.operations?.length) {
    const active = new Set([capability, ...(signals ?? [])].map(normalizeSignal));
    if (!entry.operations.some((item) => active.has(normalizeSignal(item)))) return false;
  }
  const role = String(entry.role ?? '').toLowerCase();
  const roleHas = (...tokens) => tokens.some((token) => new RegExp(`(^|[-_.])${token}([-_.]|$)`).test(role));
  if (roleHas('release', 'publication', 'deployment', 'shipping') && !['SHIP', 'REVIEW', 'VERIFY'].includes(phase)) return false;
  if (roleHas('ui', 'visual', 'brand', 'frontend')) {
    const uiSignal = (signals ?? []).some((item) => ['user-visible-ui', 'product-design', 'frontend'].includes(normalizeSignal(item)));
    if (!uiSignal || !['DESIGN', 'PLAN', 'EXECUTE_ONE', 'VERIFY', 'REVIEW'].includes(phase)) return false;
  }
  if (roleHas('architecture', 'adr') && !['ALIGN', 'DESIGN', 'PLAN', 'EXECUTE_ONE', 'REVIEW'].includes(phase)) return false;
  return true;
}

export async function buildContext(options={}) {
  const context=await discoverContract(options.project??process.cwd());
  const intent=parseIntent(context.intentSource);
  const truth=parseTruthMap(context.truthSource);
  validateExperienceIndex(context.experience);
  const authority=await authoritySnapshot(context.executionRoot,truth,context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  const route=await readRoute(runtime.paths,{allowMissing:true});
  const current=runtime.current;
  const blockers=[];
  const outcomeRegistry=await loadOutcomeRegistry(context,{allowLegacy:true});
  let outcomes=null;
  if (!outcomeRegistry) blockers.push({code:'UPGRADE_REQUIRED',message:'Contract schema 1 is inspectable, but consequential work requires an explicit schema-2 upgrade.'});
  else {
    const outcomeProgress=await readOutcomeProgress(runtime.paths,outcomeRegistry);
    const summary=outcomeProgressSummary(outcomeRegistry,outcomeProgress);
    const status=outcomeStatus(outcomeRegistry);
    const handles=summary.remaining_outcome_ids.slice(0,3).map((id)=>`outcome:${id}`);
    outcomes={
      goal_id:outcomeRegistry.goal_id,goal_revision_digest:outcomeRegistry.goal_revision_digest,
      coverage_status:status.coverage_status,registry_digest:status.registry_digest,
      counts:{required:summary.required,...summary.counts},handles,
      omitted:Math.max(0,summary.remaining_outcome_ids.length-handles.length),
      continuation:summary.remaining_outcome_ids.length>handles.length?'Use a stable outcome:<id> handle or `vibetether outcomes list`.':null,
      next_missing_acceptance:summary.missing_acceptance_ids[0]??null,
      precise_completion_label:summary.precise_completion_label,
    };
  }
  if (intent.status!=='confirmed') blockers.push({code:'INTENT_UNCONFIRMED',message:'Goal and success evidence require user confirmation.'});
  if (current.control_generation!==context.manifest.control_generation) blockers.push({code:'CONTROL_GENERATION_CHANGED',message:'Project control generation changed; re-anchor the worktree.'});
  if (current.authority_digest!==authority.authority_digest) blockers.push({code:'AUTHORITY_CHANGED',message:'Confirmed project authority changed after the current checkpoint.'});
  if (context.shared&&context.tracked&&context.manifest.control_mode==='team') blockers.push({code:'CONTRACT_MISSING_ON_BRANCH',message:'This worktree is using a Contract discovered from another worktree; merge or deliberately attach the Contract before consequential writes.'});
  if (route?.status==='active'&&route.authority_start!==authority.authority_digest) blockers.push({code:'ACTIVE_ROUTE_AUTHORITY_DRIFT',message:'Authority changed during the active step.'});
  const classification=classifyTaskText(options.task_text,{intentStatus:intent.status,currentPhase:current.phase});
  const phase=String(options.phase??classification.phase??current.phase).toUpperCase();
  if (!PHASES.has(phase)) throw conflictError(`Unknown phase: ${phase}`,'UNKNOWN_PHASE');
  const capability=options.capability??classification.capability??route?.capability??DEFAULT_CAPABILITY[phase];
  const signals=[...new Set([...taskSignals(options,current),...(classification.signals??[])])];
  const deepState=await readDeepState(runtime.paths,{allowMissing:true});
  let deepPermit=null;
  try { deepPermit=await validateDeepPermit(context,runtime,authority,{required:false}); }
  catch (error) { blockers.push({code:error.code??'IMPLEMENTATION_PERMIT_INVALID',message:error.message}); }
  const registry=await loadProviderRegistry();
  const routes=context.routes?validateRoutes(context.routes,registry.capabilities,registry.providers):null;
  const stats=await loadProviderStats(runtime.paths);
  const skill=brokerSkills(registry,{phase,capability,signals,agent:options.agent??'codex',provider:options.provider??null,permissions:options.permissions??route?.permissions??{}},context.skills,routes,stats);
  const skillsDigest=skillsLockDigest(context.skills);
  const experience=await recallExperience(context,runtime.paths,context.experience,{authorityDigest:authority.authority_digest,skillsDigest,signals});
  const applicable=authority.confirmed_sources.filter((entry)=>scopeApplies(entry,options.paths??[])&&roleApplies(entry,{phase,capability,signals}));
  const truthHandles=applicable.slice(0,TRUTH_PAGE_SIZE).map((entry)=>({handle:`truth:${entry.id}`,id:entry.id,path:entry.path,role:entry.role,scope:entry.scope,sha256:entry.sha256,kind:entry.kind}));
  const deepNeedsPermit=(classification.deep_requested===true||current.task_mode==='deep'||Boolean(deepState))&&!deepPermit;
  const verdict=blockers.length?'BLOCKED_BY_CONFLICT_OR_AUTHORIZATION':(intent.status!=='confirmed'||classification.needs_user_decision===true||deepNeedsPermit)?'ASK_USER_DECISION':'READY_FOR_IMPLEMENT_ONE';
  return compactCapsule({
    schema_version:1,
    boundary:options.boundary??'task-entry',
    project:{id:context.manifest.project_id,control_mode:context.manifest.control_mode,control_generation:context.manifest.control_generation,authority_digest:authority.authority_digest,tracked:context.tracked,shared:context.shared},
    worktree:{id:runtime.paths.worktree_id,clone_id:runtime.paths.clone_id,root:context.executionRoot},
    task:{goal:intent.goal||current.goal,phase,slice:current.slice,next_action:current.next_action,status:current.status,classification:{mode:classification.mode,deep_requested:classification.deep_requested===true,needs_user_decision:classification.needs_user_decision,reason:classification.reason}},
    readiness:{verdict,blockers,reasons:[...(classification.needs_user_decision?['USER_DECISION_REQUIRED']:[]),...(deepNeedsPermit?['IMPLEMENTATION_PERMIT_REQUIRED']:[])]},
    deep:{requested:classification.deep_requested===true,state:deepState?.status??'not-prepared',start_card:compactDeepCard(deepState),permit:deepPermit?.permit?{id:deepPermit.permit.id,status:deepPermit.permit.status,expires_at:deepPermit.permit.expires_at}:null},
    truth:truthHandles,
    truth_summary:{total:applicable.length,returned:truthHandles.length,omitted:Math.max(0,applicable.length-truthHandles.length),continuation:applicable.length>truthHandles.length?'Use stable Truth handles or pass narrower --path filters.':null},
    skill:{selected:skill.selected.id,confidence:skill.confidence,shortlist:skill.shortlist,overlays:skill.overlays,required_outputs:skill.required_outputs,exit_evidence:skill.exit_evidence},
    ui:uiCapabilityContext(capability),
    experience:experience.map((item)=>({...item,handles:item.artifacts.map((_,position)=>`experience:${item.id}:${position}`)})),
    outcomes,
    raw_state_policy:'Do not read raw runtime, provider catalogs, unselected Skills, or unselected experience.',
  });
}

export async function readContextHandle(options={}) {
  const handle=String(options.handle??'');
  const context=await discoverContract(options.project??process.cwd());
  if (handle.startsWith('truth:')) {
    const parts=handle.split(':');
    const id=parts[1];
    let subpath=null;
    if (parts[2]==='file'&&parts[3]) {
      try { subpath=Buffer.from(parts[3],'base64url').toString('utf8'); }
      catch { throw conflictError('Directory Truth file handle is invalid.','UNKNOWN_HANDLE'); }
    }
    return readTruthArtifact(context.executionRoot,parseTruthMap(context.truthSource),id,{offset:options.offset??0,limit:options.limit??8192,subpath});
  }
  if (handle.startsWith('experience:')) {
    const [,id,position='0']=handle.split(':');
    validateExperienceIndex(context.experience);
    return readExperienceArtifact(context,context.experience,id,Number(position),{offset:options.offset??0,limit:options.limit??8192});
  }
  if (handle.startsWith('outcome:')) {
    const id=handle.slice('outcome:'.length);
    const registry=await loadOutcomeRegistry(context);
    const outcome=registry.outcomes.find((item)=>item.id===id);
    if (!outcome) throw conflictError(`Unknown Outcome handle: ${handle}`,'UNKNOWN_HANDLE');
    const source=canonicalJson(outcome);
    const offset=Number(options.offset??0);
    const limit=Number(options.limit??8192);
    if (!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>8192) throw conflictError('Outcome handle offset or limit is invalid.','INVALID_READ');
    const bytes=Buffer.from(source,'utf8');
    const chunk=bytes.subarray(offset,Math.min(bytes.length,offset+limit));
    return {handle,id,offset,bytes:chunk.length,total_bytes:bytes.length,content:chunk.toString('utf8'),next_offset:offset+chunk.length<bytes.length?offset+chunk.length:null};
  }
  if (handle.startsWith('skill:')) {
    const [,activationId,kind,...rest]=handle.split(':');
    const truth=parseTruthMap(context.truthSource); const authority=await authoritySnapshot(context.executionRoot,truth,context.intentSource);
    const runtime=await attachWorktree(context,authority.authority_digest);
    const resource=kind==='entry'?'entry':rest.join(':');
    return readSkillResource(runtime.paths,activationId,resource,{offset:options.offset??0,limit:options.limit??8192});
  }
  throw conflictError('Unknown context handle.','UNKNOWN_HANDLE');
}
