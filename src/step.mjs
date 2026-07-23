import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PHASES, EVIDENCE_REQUIRED_PHASES } from './constants.mjs';
import { conflictError } from './errors.mjs';
import { assertSafeId, boundedText, canonicalJson, containsSecret, exists, normalizeSignal, rejectSymlinkChain, resolveInside, safeRelative, sha256File, sha256Text, transactionalWrites } from './files.mjs';
import { discoverContract, skillsLockDigest } from './contract.mjs';
import { parseIntent } from './intent.mjs';
import { authoritySnapshot, parseTruthMap } from './truth.mjs';
import { validateExperienceIndex, addExperienceCounterevidence, captureSuccessCandidate, successCandidateArtifact } from './experience.mjs';
import { attachWorktree } from './worktree.mjs';
import {
  acquireLease, appendRuntimeEvent, loadProviderStats, readCurrent, readRoute, recordEvidence,
  inspectLease, recordProviderOutcome, releaseLease, renewLease, withWorktreeStateLock, writeCurrentProjection, writeStepState,
} from './runtime.mjs';
import { loadProviderRegistry } from './provider-registry.mjs';
import { validateRoutes } from './routes.mjs';
import { brokerSkills } from './skill-broker.mjs';
import { activateSkill, removeActivation } from './skills.mjs';
import { executionSnapshot, snapshotsMatch } from './git.mjs';
import { writeProjectJson } from './files.mjs';
import { classifyTaskText } from './task-classifier.mjs';
import { assertUiAcceptanceGate, assertUiCapabilityClassification, assertUiOutcomeContract } from './ui-control.mjs';
import { consumeDeepPermit, invalidateDeepPermitState, validateDeepPermit } from './deep.mjs';
import { loadOutcomeRegistry, outcomeRegistryDigest } from './outcomes.mjs';
import {
  applyRouteOutcomeEvidence, bindRouteOutcomes, readOutcomeProgress,
  isProgressProjectionOwner, renderProgressMarkdown, verifyProgressProjection,
} from './outcome-progress.mjs';

async function loaded(project) {
  const context=await discoverContract(project??process.cwd());
  const intent=parseIntent(context.intentSource); const truth=parseTruthMap(context.truthSource); validateExperienceIndex(context.experience);
  const authority=await authoritySnapshot(context.executionRoot,truth,context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  const outcomes=await loadOutcomeRegistry(context);
  return {context,intent,truth,authority,runtime,outcomes};
}
function phase(value) { const normalized=String(value??'').toUpperCase(); if (!PHASES.has(normalized)) throw conflictError(`Unknown phase: ${value}`,'UNKNOWN_PHASE'); return normalized; }
function sourceDifference(start,current) {
  const a=new Map(start.confirmed_sources.map((item)=>[item.path,JSON.stringify(item)]));
  const b=new Map(current.confirmed_sources.map((item)=>[item.path,JSON.stringify(item)]));
  return [...new Set([...a.keys(),...b.keys()])].filter((key)=>a.get(key)!==b.get(key));
}
function reconcile(route,currentAuthority,truth,decision='no-material-change',truthPath=null) {
  if (decision==='no-material-change') {
    if (currentAuthority.authority_digest!==route.authority_start) throw conflictError('Confirmed authority changed; no-material-change cannot hide the drift.','AUTHORITY_CHANGED');
    return {status:'no_material_change',candidate_path:null,reason:'Confirmed authority matches the step anchor.'};
  }
  const portable=truthPath?safeRelative(truthPath,'Truth decision path',{allowDirectory:String(truthPath).endsWith('/')}):null;
  if (!portable) throw conflictError('Truth decision requires --truth-path.','TRUTH_NOT_FOUND');
  if (decision==='candidate-pending') {
    if (currentAuthority.authority_digest!==route.authority_start||!truth.candidates.some((item)=>item.path===portable)) throw conflictError('Candidate-pending requires unchanged confirmed authority and a registered candidate.','TRUTH_RECONCILIATION');
    return {status:'candidate_pending',candidate_path:portable,reason:'Candidate awaits user confirmation.'};
  }
  if (decision==='declined') {
    if (currentAuthority.authority_digest!==route.authority_start||!truth.declined.some((item)=>item.path===portable)) throw conflictError('Declined requires unchanged confirmed authority and a declined entry.','TRUTH_RECONCILIATION');
    return {status:'declined',candidate_path:portable,reason:'Candidate was explicitly declined.'};
  }
  if (decision==='applied') {
    const entry=truth.confirmed.find((item)=>item.path===portable); if (!entry) throw conflictError('Applied Truth path is not confirmed.','TRUTH_RECONCILIATION');
    if (route.authority_snapshot.intent_sha256!==currentAuthority.intent_sha256) throw conflictError('Applied Truth cannot absorb an Intent change.','TRUTH_RECONCILIATION');
    const changed=sourceDifference(route.authority_snapshot,currentAuthority);
    const allowed=new Set([portable,...(entry.supersedes?[entry.supersedes]:[])]);
    if (!changed.length||changed.some((item)=>!allowed.has(item))) throw conflictError('Confirmed authority changed outside the declared applied Truth path.','TRUTH_RECONCILIATION');
    return {status:'applied',candidate_path:portable,reason:'User-confirmed Truth change is limited to the declared path.'};
  }
  throw conflictError(`Unsupported Truth decision: ${decision}`,'TRUTH_RECONCILIATION');
}

function pendingReconciliationRouteId(route) {
  const reconciliation=route?.truth_reconciliation;
  if (!reconciliation || reconciliation.status!=='pending') return null;
  for (const key of ['route_instance_id','route_id','pending_route_id']) {
    if (typeof reconciliation[key]==='string'&&reconciliation[key]) return reconciliation[key];
  }
  return null;
}

function hasLegacyReconciliationMismatch(route) {
  const referenced=pendingReconciliationRouteId(route);
  return Boolean(route&&route.status!=='active'&&referenced&&referenced!==route.id);
}

export async function reanchorStep({project=process.cwd(),reason='Re-anchored after inspecting current project authority.'}={}) {
  const value=await loaded(project); const route=await readRoute(value.runtime.paths,{allowMissing:true});
  if (route?.status==='active') throw conflictError('Cannot re-anchor while a step is active.','ACTIVE_STEP');
  const current=await readCurrent(value.runtime.paths);
  current.authority_digest=value.authority.authority_digest; current.control_generation=value.context.manifest.control_generation;
  current.updated_at=new Date().toISOString(); current.status='ready'; current.open_risks=[]; current.task_mode='adaptive';
  current.deep_start_card_id=null; current.implementation_permit_id=null; current.next_action=boundedText(reason,500,'Re-anchor reason');
  if (route?.truth_reconciliation?.status==='blocked_reanchor_required') {
    route.truth_reconciliation={...route.truth_reconciliation,status:'reanchored',reanchored_at:current.updated_at,reanchor_reason:current.next_action};
    route.updated_at=current.updated_at;
    await writeStepState(value.runtime.paths,route,current);
  } else await writeCurrentProjection(value.runtime.paths,current);
  await appendRuntimeEvent(value.runtime.paths,{type:'reanchored',route_id:route?.id??null,authority_digest:value.authority.authority_digest,reason:current.next_action});
  return current;
}

export async function recoverTruthReconciliation({project=process.cwd(),reason,yes=false}={}) {
  if (!yes) throw conflictError('Truth-reconciliation recovery requires --yes after reviewing the affected route.','CONFIRMATION_REQUIRED');
  const initial=await loaded(project);
  return withWorktreeStateLock(initial.runtime.paths,async()=>{
    const value=await loaded(project);
    const route=await readRoute(value.runtime.paths,{allowMissing:true});
    if (!hasLegacyReconciliationMismatch(route)) {
      throw conflictError('Recovery applies only to an exited legacy route whose pending Truth reconciliation names a different route instance.','RECONCILIATION_RECOVERY_NOT_APPLICABLE');
    }
    const boundedReason=boundedText(reason,500,'Truth-reconciliation recovery reason');
    const referencedRouteId=pendingReconciliationRouteId(route);
    const recoveredAt=new Date().toISOString();
    const preservedReceipt=path.join(value.runtime.paths.quarantine,`truth-reconciliation-${route.id}-${randomUUID()}.json`);
    const preservedRelative=path.relative(value.runtime.paths.worktree,preservedReceipt).replaceAll('\\','/');
    const current=await readCurrent(value.runtime.paths);
    const nextRoute={
      ...route,
      status:'abandoned',
      generation:(route.generation??1)+1,
      abandonment_reason:boundedReason,
      activation_id:null,
      truth_reconciliation:{
        ...route.truth_reconciliation,
        status:'blocked_reanchor_required',
        legacy_route_instance_id:referencedRouteId,
        recovery_reason:boundedReason,
        preserved_receipt:preservedRelative,
        recovered_at:recoveredAt,
      },
      updated_at:recoveredAt,
    };
    const nextCurrent={
      ...current,
      status:'blocked',
      route_instance_id:route.id,
      implementation_permit_id:null,
      open_risks:[`Legacy Truth reconciliation references ${referencedRouteId}, not ${route.id}.`],
      next_action:'Run `vibetether step reanchor --reason "Reviewed legacy Truth reconciliation recovery."`, then start a fresh bounded route.',
      updated_at:recoveredAt,
    };
    await transactionalWrites([
      {target:preservedReceipt,content:canonicalJson(route),mode:0o600},
      {target:value.runtime.paths.route,content:canonicalJson(nextRoute),mode:0o600},
      {target:value.runtime.paths.current,content:canonicalJson(nextCurrent),mode:0o600},
    ]);
    await appendRuntimeEvent(value.runtime.paths,{type:'truth-reconciliation-recovered',route_id:route.id,legacy_route_instance_id:referencedRouteId,preserved_receipt:preservedRelative,reason:boundedReason});
    return {
      status:'blocked-reanchor-required',route_id:route.id,legacy_route_instance_id:referencedRouteId,
      preserved_receipt:preservedRelative,
      next_action:nextCurrent.next_action,
    };
  });
}



const CONTROL_PLANE_FILES = new Set(['AGENTS.md','CLAUDE.md','.gitignore']);
function portablePath(value) { return String(value ?? '').replaceAll('\\','/').replace(/^\.\//,''); }
function isControlPlanePath(value) {
  const relative=portablePath(value); const lower=relative.toLowerCase();
  return CONTROL_PLANE_FILES.has(relative)
    || lower==='.vibetether' || lower.startsWith('.vibetether/')
    || lower.startsWith('.agents/skills/vibe-tether')
    || lower.startsWith('.claude/skills/vibe-tether');
}
function outputLooksLikePath(value) { return String(value).includes('/') || /\.[a-z0-9]{1,12}$/i.test(String(value)); }
function productPath(value,label='Product path',{allowMissing=true}={}) {
  const relative=safeRelative(value,label);
  if (isControlPlanePath(relative)) throw conflictError(`${label} must reference product or verification output, not VibeTether control-plane state.`, 'CONTROL_PLANE_EVIDENCE');
  return relative;
}
function normalizeScopePaths(values,label='Approved product scope') {
  return [...new Set((values??[]).map((value)=>productPath(value,label)))];
}
function pathWithinScope(relative,scopePaths) {
  const pathValue=portablePath(relative);
  return scopePaths.some((scope)=>{
    const normalized=portablePath(scope).replace(/\/+$/,'');
    return pathValue===normalized || pathValue.startsWith(`${normalized}/`);
  });
}
function commandLooksLikeNoop(command) {
  const executable=path.basename(String(command[0]??'')).toLowerCase().replace(/\.exe$/,'');
  const args=command.slice(1); const joined=args.join(' ').trim().replace(/\s+/g,' ');
  if (['true','echo','printf'].includes(executable)) return true;
  if (['sh','bash','zsh','cmd','powershell','pwsh'].includes(executable) && /^(?:-c |\/c )?(?:exit\s+0|true|echo\b|write-output\b)/i.test(joined)) return true;
  if (['node','nodejs'].includes(executable)) {
    const scriptIndex=args.findIndex((item)=>item==='-e'||item==='--eval');
    if (scriptIndex>=0) {
      const script=String(args[scriptIndex+1]??'').replace(/[;\s]+/g,'').toLowerCase();
      if (/^(?:0|1|true|false|null|undefined|nan|process\.exit\(0\)|process\.exitcode=0|console\.log\([^)]*\)|void0)$/.test(script)) return true;
    }
  }
  if (executable.startsWith('python') && args[0]==='-c' && /^(?:pass|exit\(0\)|sys\.exit\(0\))$/i.test(String(args[1]??'').trim())) return true;
  return false;
}
function commandArray(value,label='Verification command') {
  if (!Array.isArray(value)||!value.length||value.some((item)=>typeof item!=='string'||!item.trim()||containsSecret(item))) {
    throw conflictError(`${label} must be a non-secret argument array.`, 'INVALID_SUCCESS_CHECK');
  }
  const command=value.map((item)=>boundedText(item,4096,label));
  if (commandLooksLikeNoop(command)) throw conflictError(`${label} is an obvious no-op and cannot prove a product claim.`, 'NON_MEANINGFUL_CHECK');
  return command;
}
function normalizeSuccessChecks(value,claims,{phase:routePhase,codeWrite=false,approvedPaths=[]}={}) {
  const checks=Array.isArray(value)?value:[];
  if (EVIDENCE_REQUIRED_PHASES.has(routePhase)&&checks.length===0) {
    throw conflictError(`${routePhase} requires at least one predeclared executable or inspectable success check.`, 'SUCCESS_CHECK_REQUIRED');
  }
  const claimSet=new Set(claims); const ids=new Set(); const normalized=[];
  for (const [index,raw] of checks.entries()) {
    if (!raw||typeof raw!=='object'||Array.isArray(raw)) throw conflictError(`Success check ${index+1} must be an object.`, 'INVALID_SUCCESS_CHECK');
    const id=assertSafeId(raw.id,`Success check ${index+1} id`);
    if (ids.has(id)) throw conflictError(`Duplicate success check id: ${id}`, 'INVALID_SUCCESS_CHECK');
    ids.add(id);
    const claim=boundedText(raw.claim,500,`Success check ${id} claim`);
    if (!claimSet.has(claim)) throw conflictError(`Success check ${id} does not match a declared success-evidence claim.`, 'INVALID_SUCCESS_CHECK');
    const kind=String(raw.kind??'');
    const acceptanceIds=[...new Set((raw.acceptance_ids??[]).map((item)=>assertSafeId(item,`Success check ${id} acceptance id`)))];
    if (kind==='command') {
      const covers=[...new Set((raw.covers_paths??[]).map((item)=>productPath(item,`Success check ${id} covered path`)))];
      if (codeWrite&&covers.length===0) throw conflictError(`Code-writing success check ${id} must declare product paths it covers.`, 'INVALID_SUCCESS_CHECK');
      if (approvedPaths.length && covers.some((item)=>!pathWithinScope(item,approvedPaths))) {
        throw conflictError(`Success check ${id} covers a path outside the approved product scope.`, 'INVALID_SUCCESS_CHECK');
      }
      const consumers=[...new Set((raw.consumer_paths??[]).map((item)=>productPath(item,`Success check ${id} consumer path`)))];
      if (codeWrite&&consumers.length===0) throw conflictError(`Code-writing success check ${id} must identify at least one real consumer path.`, 'INVALID_SUCCESS_CHECK');
      if (approvedPaths.length && consumers.some((item)=>!pathWithinScope(item,approvedPaths))) {
        throw conflictError(`Success check ${id} consumer is outside the approved product scope.`, 'INVALID_SUCCESS_CHECK');
      }
      normalized.push({id,claim,kind,command:commandArray(raw.command,`Success check ${id} command`),covers_paths:covers,consumer_paths:consumers,acceptance_ids:acceptanceIds});
    } else if (kind==='artifact') {
      const artifact=productPath(raw.path,`Success check ${id} artifact`);
      if (approvedPaths.length&&!pathWithinScope(artifact,approvedPaths)) throw conflictError(`Success check ${id} artifact is outside the approved product scope.`, 'INVALID_SUCCESS_CHECK');
      normalized.push({id,claim,kind,path:artifact,covers_paths:[artifact],consumer_paths:[artifact],acceptance_ids:acceptanceIds});
    } else throw conflictError(`Success check ${id} kind must be command or artifact.`, 'INVALID_SUCCESS_CHECK');
  }
  const uncovered=claims.filter((claim)=>!normalized.some((check)=>check.claim===claim));
  if (uncovered.length) throw conflictError(`Every success-evidence claim requires a predeclared check: ${uncovered.join(' | ')}`, 'SUCCESS_CHECK_REQUIRED');
  return normalized;
}
function inventory(snapshot) {
  const files=snapshot?.git?.available?snapshot.git.changed_files??[]:[];
  return new Map(files.filter((item)=>!isControlPlanePath(item.path)).map((item)=>[portablePath(item.path),canonicalJson(item)]));
}
function materialProductChanges(before,after) {
  if (!before||!after) return [];
  if (before.git?.available!==after.git?.available) return ['@execution-mode'];
  if (!before.git?.available) return before.git?.content_sha256===after.git?.content_sha256?[]:['@tree'];
  const changed=[];
  if (before.git.head!==after.git.head) changed.push('@git-head');
  const left=inventory(before); const right=inventory(after);
  for (const name of new Set([...left.keys(),...right.keys()])) if (left.get(name)!==right.get(name)) changed.push(name);
  return [...new Set(changed)];
}
async function evidenceForCheck(check,value,route) {
  const coverageTargets=check.covers_paths.map((relative)=>({path:relative,target:resolveInside(value.context.executionRoot,relative,'Success-check covered path')}));
  const common={route_id:route.id,check_id:check.id,claim:check.claim,covers_paths:check.covers_paths,coverage_targets:coverageTargets,authority_digest:route.authority_start,skills_digest:route.skills_digest,execution_snapshot:await executionSnapshot(value.context.executionRoot),cwd:value.context.executionRoot};
  if (check.kind==='command') return recordEvidence(value.runtime.paths,{...common,kind:'command',command:check.command});
  const target=resolveInside(value.context.executionRoot,check.path,'Success-check artifact');
  await rejectSymlinkChain(value.context.executionRoot,check.path,{allowMissing:false});
  return recordEvidence(value.runtime.paths,{...common,kind:'artifact',artifact_path:check.path,artifact_target:target});
}
function requestedChecks(route,options) {
  const explicit=[];
  if (options.evidence_command) explicit.push({kind:'command',value:options.evidence_command});
  for (const command of options.evidence_commands??[]) explicit.push({kind:'command',value:command});
  if (options.evidence_artifact) explicit.push({kind:'artifact',value:options.evidence_artifact});
  for (const artifact of options.evidence_artifacts??[]) explicit.push({kind:'artifact',value:artifact});
  if (options.evidence) throw conflictError('Assertion text may be recorded as a note, but cannot replace a predeclared success check.', 'PROXY_EVIDENCE');
  if (explicit.length===0) return route.success_checks??[];
  const selected=[];
  for (const request of explicit) {
    const match=(route.success_checks??[]).find((check)=>request.kind===check.kind&&(check.kind==='command'?canonicalJson(check.command)===canonicalJson(request.value):check.path===safeRelative(request.value,'Evidence artifact')));
    if (!match) throw conflictError('Step finish received evidence that was not predeclared in the route success contract.', 'UNPLANNED_EVIDENCE');
    if (!selected.some((item)=>item.id===match.id)) selected.push(match);
  }
  const missing=(route.success_checks??[]).filter((check)=>!selected.some((item)=>item.id===check.id));
  if (missing.length) throw conflictError(`All predeclared success checks must run before completion: ${missing.map((item)=>item.id).join(', ')}`, 'SUCCESS_CHECK_INCOMPLETE');
  return selected;
}
function proofArray(value,label) {
  if (!Array.isArray(value)) throw conflictError(`${label} must be an array of structured proof bindings.`, 'PROOF_BINDING_REQUIRED');
  return value;
}
async function validateProofArtifacts(root,paths,label) {
  const artifacts=[];
  for (const raw of paths??[]) {
    const relative=productPath(raw,`${label} artifact`);
    await rejectSymlinkChain(root,relative,{allowMissing:false});
    artifacts.push({path:relative,sha256:await sha256File(resolveInside(root,relative,`${label} artifact`))});
  }
  return artifacts;
}
async function validateRouteContract(root,route,options,receipts,materialChanges) {
  if ((options.outputs??[]).length||(options.exit_evidence??[]).length) throw conflictError('Copied output or exit-evidence strings are not proof bindings; use structured output_proofs and exit_proofs.', 'PROOF_BINDING_REQUIRED');
  const receiptByCheck=new Map(receipts.map((item)=>[item.check_id,item]));
  const changedPaths=new Set(materialChanges.filter((item)=>!item.startsWith('@')));
  const approvedPaths=route.approved_paths??[];
  const outputRaw=proofArray(options.output_proofs??[],'Output proofs');
  const exitRaw=proofArray(options.exit_proofs??[],'Exit proofs');
  const outputs=[]; const outputIds=new Set();
  for (const raw of outputRaw) {
    if (!raw||typeof raw!=='object'||Array.isArray(raw)) throw conflictError('Output proof must be an object.', 'INVALID_PROOF_BINDING');
    const output=boundedText(raw.output,500,'Output proof id');
    if (!(route.required_outputs??[]).includes(output)||outputIds.has(output)) throw conflictError(`Output proof is unknown or duplicated: ${output}`, 'INVALID_PROOF_BINDING');
    outputIds.add(output);
    const checkIds=[...new Set((raw.check_ids??[]).map((item)=>assertSafeId(item,'Output proof check id')))];
    if (!checkIds.length||checkIds.some((id)=>!receiptByCheck.get(id)?.successful)) throw conflictError(`Output proof ${output} is not bound to successful predeclared checks.`, 'INVALID_PROOF_BINDING');
    const summary=boundedText(raw.summary,1000,`Output proof ${output} summary`);
    const artifacts=await validateProofArtifacts(root,raw.artifact_paths??[],`Output proof ${output}`);
    const covered=checkIds.flatMap((id)=>receiptByCheck.get(id)?.coverage_artifacts??[]).filter((item)=>item.present);
    if (!artifacts.length) throw conflictError(`Output proof ${output} must name at least one validated product artifact.`, 'INVALID_PROOF_BINDING');
    if (artifacts.some((item)=>approvedPaths.length&&!pathWithinScope(item.path,approvedPaths))) throw conflictError(`Output proof ${output} references an artifact outside the approved product scope.`, 'INVALID_PROOF_BINDING');
    if (changedPaths.size&&artifacts.every((item)=>!changedPaths.has(item.path))) throw conflictError(`Output proof ${output} is not bound to an artifact changed in this slice.`, 'INVALID_PROOF_BINDING');
    if (outputLooksLikePath(output)) {
      const requiredPath=productPath(output,`Required output ${output}`);
      if (!artifacts.some((item)=>item.path===requiredPath)) throw conflictError(`Path output proof must include the required artifact itself: ${requiredPath}`, 'ROUTE_CONTRACT_UNSATISFIED');
    }
    if (!artifacts.length&&!covered.length) throw conflictError(`Output proof ${output} lacks a validated product artifact.`, 'INVALID_PROOF_BINDING');
    outputs.push({output,check_ids:checkIds,evidence_ids:checkIds.map((id)=>receiptByCheck.get(id).id),summary,artifacts,covered_artifacts:covered});
  }
  const missingOutputs=(route.required_outputs??[]).filter((output)=>!outputIds.has(output));
  const exits=[]; const exitIds=new Set();
  for (const raw of exitRaw) {
    if (!raw||typeof raw!=='object'||Array.isArray(raw)) throw conflictError('Exit proof must be an object.', 'INVALID_PROOF_BINDING');
    const criterion=boundedText(raw.criterion,1000,'Exit-proof criterion');
    if (!(route.exit_evidence??[]).includes(criterion)||exitIds.has(criterion)) throw conflictError(`Exit proof is unknown or duplicated: ${criterion}`, 'INVALID_PROOF_BINDING');
    exitIds.add(criterion);
    const checkIds=[...new Set((raw.check_ids??[]).map((item)=>assertSafeId(item,'Exit proof check id')))];
    if (!checkIds.length||checkIds.some((id)=>!receiptByCheck.get(id)?.successful)) throw conflictError(`Exit proof is not bound to successful predeclared checks: ${criterion}`, 'INVALID_PROOF_BINDING');
    const artifacts=await validateProofArtifacts(root,raw.artifact_paths??[],`Exit proof ${criterion}`);
    if (!artifacts.length) throw conflictError(`Exit proof must name at least one validated product artifact: ${criterion}`, 'INVALID_PROOF_BINDING');
    if (artifacts.some((item)=>approvedPaths.length&&!pathWithinScope(item.path,approvedPaths))) throw conflictError(`Exit proof references an artifact outside the approved product scope: ${criterion}`, 'INVALID_PROOF_BINDING');
    if (changedPaths.size&&artifacts.every((item)=>!changedPaths.has(item.path))) throw conflictError(`Exit proof is not bound to an artifact changed in this slice: ${criterion}`, 'INVALID_PROOF_BINDING');
    exits.push({criterion,check_ids:checkIds,evidence_ids:checkIds.map((id)=>receiptByCheck.get(id).id),summary:boundedText(raw.summary,1000,'Exit-proof summary'),artifacts});
  }
  const missingExitEvidence=(route.exit_evidence??[]).filter((criterion)=>!exitIds.has(criterion));
  if (missingOutputs.length||missingExitEvidence.length) throw conflictError(`Step output contract is incomplete. Missing output proofs: ${missingOutputs.join(', ')||'none'}; missing exit proofs: ${missingExitEvidence.join(' | ')||'none'}.`, 'ROUTE_CONTRACT_UNSATISFIED');
  return {
    required_outputs:[...(route.required_outputs??[])],missing_outputs:missingOutputs,output_proofs:outputs,
    exit_evidence:[...(route.exit_evidence??[])],missing_exit_evidence:missingExitEvidence,exit_proofs:exits,
    success_checks:(route.success_checks??[]).map((check)=>({id:check.id,claim:check.claim,evidence_id:receiptByCheck.get(check.id)?.id??null,successful:receiptByCheck.get(check.id)?.successful===true,coverage_artifacts:receiptByCheck.get(check.id)?.coverage_artifacts??[]})),
    evidence_ids:receipts.map((item)=>item.id),material_product_changes:materialChanges,validated_at:new Date().toISOString(),
  };
}

export async function startStep(options={}) {
  const value=await loaded(options.project);
  if (value.intent.status!=='confirmed') throw conflictError('Step cannot start until the Intent Contract is confirmed.','INTENT_UNCONFIRMED');
  if (value.context.shared&&value.context.tracked&&value.context.manifest.control_mode==='team') throw conflictError('This branch does not contain the tracked Project Contract.','CONTRACT_MISSING_ON_BRANCH');
  const prior=await readRoute(value.runtime.paths,{allowMissing:true}); if (prior?.status==='active') throw conflictError('Finish or abandon the active step first.','ACTIVE_STEP');
  const current=await readCurrent(value.runtime.paths);
  if (current.status==='blocked'&&prior?.truth_reconciliation?.status==='blocked_reanchor_required') {
    throw conflictError('Legacy Truth reconciliation recovery is pending; run `vibetether step reanchor` before starting a fresh route.','BLOCKED_REANCHOR_REQUIRED');
  }
  if (current.authority_digest!==value.authority.authority_digest||current.control_generation!==value.context.manifest.control_generation) throw conflictError('Current checkpoint is stale; run `vibetether step reanchor` after reviewing the authority change.','AUTHORITY_CHANGED');
  const routePhase=phase(options.phase);
  const permissions={network:options.network===true,external_write:options.external_write===true,code_write:options.code_write===true};
  const capability=boundedText(options.capability,128,'Capability');
  const slice=boundedText(options.slice,1000,'Step slice');
  const taskText=options.task_text===undefined||options.task_text===null ? slice : boundedText(options.task_text,2000,'Task text');
  const successEvidence=(options.success_evidence??[]).map((item)=>boundedText(item,500,'Step success evidence'));
  if (!successEvidence.length) throw conflictError('Step requires at least one success-evidence statement.','INVALID_STEP');
  const explicitScope=normalizeScopePaths(options.scope_paths??[]);
  const inferredScope=normalizeScopePaths((options.success_checks??[]).flatMap((check)=>check?.covers_paths??[]));
  const approvedPaths=explicitScope.length?explicitScope:inferredScope;
  const signals=[...new Set((options.signals??[]).map((item)=>normalizeSignal(boundedText(item,256,'Step signal'))).filter(Boolean))];
  const observedIntent=taskText===slice?taskText:`${taskText} ${slice}`;
  const observedClassification=classifyTaskText(observedIntent,{
    intentStatus:value.intent.status,currentPhase:current.phase,scopePaths:approvedPaths,
    requestedPhase:routePhase,codeWrite:permissions.code_write,
  });
  const classification=observedClassification;
  assertUiCapabilityClassification(capability, observedClassification);
  const deepRequired=options.deep===true||classification.deep_requested===true||current.task_mode==='deep';
  if (routePhase==='EXECUTE_ONE'&&permissions.code_write!==true) throw conflictError('EXECUTE_ONE requires explicit code-write permission.','PERMISSION_REQUIRED');
  let deepState=await validateDeepPermit(value.context,value.runtime,value.authority,{required:deepRequired,slice:deepRequired?slice:null});
  let userDecisionReason = deepState?.permit?.reason ?? null;
  if (classification.needs_user_decision===true&&!deepState) {
    if (!options.confirmed_by_user) throw conflictError('This task requires an explicit user decision before implementation. Prepare/confirm direction or use Deep mode with an Implementation Permit.','USER_DECISION_REQUIRED');
    userDecisionReason = boundedText(options.decision_reason, 1000, 'User decision reason');
  }
  const successChecks=normalizeSuccessChecks(options.success_checks,successEvidence,{phase:routePhase,codeWrite:permissions.code_write,approvedPaths});
  const consequential=permissions.code_write||permissions.external_write||permissions.network||EVIDENCE_REQUIRED_PHASES.has(routePhase);
  const uiContract=assertUiOutcomeContract(value.outcomes,options.outcome_ids??[],capability);
  const outcomeBinding=bindRouteOutcomes(value.outcomes,options.outcome_ids??[],successChecks,{consequential});
  const outcomeProgress=await readOutcomeProgress(value.runtime.paths,value.outcomes);
  const blockedOutcomes=outcomeBinding.outcome_ids.filter((id)=>outcomeProgress.outcomes[id]?.state==='blocked');
  if (blockedOutcomes.length) throw conflictError(`Outcome validators changed without an approved positive/negative migration mapping: ${blockedOutcomes.join(', ')}`,'VALIDATOR_MIGRATION_REQUIRED');
  await verifyProgressProjection(value.context,value.outcomes,outcomeProgress);
  const skillsDigest=skillsLockDigest(value.context.skills);
  await assertUiAcceptanceGate({
    contract:uiContract,context:value.context,runtime:value.runtime,progress:outcomeProgress,
    authorityDigest:value.authority.authority_digest,skillsDigest,
  });
  const permitEnvelope={task_text:taskText,phase:routePhase,capability,provider_id:options.provider??null,scope_paths:approvedPaths,permissions,success_evidence:successEvidence,success_checks:successChecks};
  if (deepRequired) deepState=await validateDeepPermit(value.context,value.runtime,value.authority,{required:true,slice,envelope:permitEnvelope});
  const routeId=`route-${randomUUID()}`;
  return withWorktreeStateLock(value.runtime.paths,async()=>{
    await acquireLease(value.runtime.paths,routeId);
    let activation=null;
    try {
    const registry=await loadProviderRegistry(); const routes=value.context.routes?validateRoutes(value.context.routes,registry.capabilities,registry.providers):null;
    const stats=await loadProviderStats(value.runtime.paths);
    const broker=brokerSkills(registry,{phase:routePhase,capability,signals,agent:options.agent??'codex',provider:options.provider??null,permissions},value.context.skills,routes,stats);
    if (deepRequired) {
      deepState=await validateDeepPermit(value.context,value.runtime,value.authority,{required:true,slice,envelope:{...permitEnvelope,provider_id:broker.selected.id}});
    }
    const executionStart=await executionSnapshot(value.context.executionRoot);
    const route={schema_version:1,id:routeId,generation:1,status:'active',phase:routePhase,capability,task_text:taskText,slice,approved_paths:approvedPaths,success_evidence:successEvidence,success_checks:successChecks,signals,permissions,classification,task_mode:deepRequired?'deep':'adaptive',start_card_id:deepState?.start_card?.id??null,implementation_permit_id:deepState?.permit?.id??null,user_decision_confirmed:options.confirmed_by_user===true||Boolean(deepState),user_decision_reason:userDecisionReason,required_outputs:broker.required_outputs,exit_evidence:broker.exit_evidence,output_contract:null,governance_writes:[],authority_start:value.authority.authority_digest,authority_snapshot:value.authority,skills_digest:skillsDigest,provider:broker.selected,shortlist:broker.shortlist,activation_id:null,execution_start:executionStart,execution_end:null,evidence_ids:[],truth_reconciliation:{status:'pending',candidate_path:null,reason:null},...outcomeBinding,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),abandonment_reason:null};
    activation=await activateSkill(value.context,value.runtime.paths,{...route,selected:broker.selected}); route.activation_id=activation.activation_id;
    const next={...current,goal:value.intent.goal,phase:routePhase,slice,authority_digest:value.authority.authority_digest,control_generation:value.context.manifest.control_generation,route_instance_id:routeId,task_mode:route.task_mode,deep_start_card_id:route.start_card_id,implementation_permit_id:route.implementation_permit_id,outcome_ids:route.outcome_ids,outcome_registry_digest:route.registry_digest,next_action:`Execute only this slice: ${slice}`,open_risks:[],evidence_ids:[],updated_at:new Date().toISOString(),status:'active'};
    await writeStepState(value.runtime.paths,route,next); await appendRuntimeEvent(value.runtime.paths,{type:'step-started',route_id:routeId,phase:routePhase,capability,provider:broker.selected.id});
      return {route,activation,readiness:'READY_FOR_IMPLEMENT_ONE'};
    } catch (error) { if (activation) await removeActivation(value.runtime.paths,activation.activation_id).catch(()=>{}); await releaseLease(value.runtime.paths,routeId).catch(()=>{}); throw error; }
  });
}


async function invalidateCompletionAttempt(project, routeId, cause) {
  const value=await loaded(project);
  return withWorktreeStateLock(value.runtime.paths,async()=>{
    const route=await readRoute(value.runtime.paths,{allowMissing:true});
    if (!route||route.id!==routeId) return route;
    if (route.status!=='active') {
      await releaseLease(value.runtime.paths,route.id).catch(()=>{});
      return route;
    }
    const reason=boundedText(`Completion precondition failed: ${cause.message}`,500,'Completion invalidation reason');
    const activationId=route.activation_id;
    route.status='broken';
    route.generation=(route.generation??1)+1;
    route.abandonment_reason=reason;
    route.invalidated_activation_id=activationId??null;
    route.activation_id=null;
    route.execution_end=null;
    route.updated_at=new Date().toISOString();
    const current=await readCurrent(value.runtime.paths);
    current.status='blocked';
    current.route_instance_id=route.id;
    current.implementation_permit_id=null;
    current.open_risks=[reason];
    current.next_action='Re-anchor, inspect the failed completion precondition, and start a fresh bounded route.';
    current.updated_at=new Date().toISOString();
    await writeStepState(value.runtime.paths,route,current);
    if (route.implementation_permit_id) await invalidateDeepPermitState(value.runtime.paths,route.implementation_permit_id,reason);
    if (activationId) await removeActivation(value.runtime.paths,activationId).catch(()=>{});
    await releaseLease(value.runtime.paths,route.id).catch(()=>{});
    await appendRuntimeEvent(value.runtime.paths,{type:'completion-invalidated',route_id:route.id,reason,code:cause.code??'COMPLETION_PRECONDITION_FAILED'});
    return route;
  });
}

function completionFailureInvalidatesRoute(error) {
  return error?.code==='COMPLETION_PRECONDITION_CHANGED'
    || error?.code==='CODE_CHANGED_AFTER_EVIDENCE'
    || String(error?.code??'').startsWith('IMPLEMENTATION_PERMIT_');
}

export async function finishStep(options={},runtimeHooks={}) {
  const value=await loaded(options.project); const route=await readRoute(value.runtime.paths,{allowMissing:true});
  if (!route||route.status!=='active') throw conflictError('An active step is required.','ACTIVE_STEP_REQUIRED');
  if (route.registry_digest!==outcomeRegistryDigest(value.outcomes)) throw conflictError('Outcome Contract changed during the active step.','OUTCOME_REGISTRY_CHANGED');
  const progressAtStart=await readOutcomeProgress(value.runtime.paths,value.outcomes);
  await verifyProgressProjection(value.context,value.outcomes,progressAtStart);
  if (route.task_mode === 'deep') {
    try {
      const deepState = await validateDeepPermit(value.context, value.runtime, value.authority, {
        required: true,
        slice: route.slice,
        envelope: {
          task_text: route.task_text,
          phase: route.phase,
          capability: route.capability,
          provider_id: route.provider?.id,
          scope_paths: route.approved_paths,
          permissions: route.permissions,
          success_evidence: route.success_evidence,
          success_checks: route.success_checks,
        },
      });
      if (deepState.permit.id !== route.implementation_permit_id) {
        throw conflictError('The active route is not bound to the current Implementation Permit.', 'IMPLEMENTATION_PERMIT_STALE');
      }
    } catch (error) {
      await invalidateCompletionAttempt(options.project,route.id,error);
      throw error;
    }
  }
  const routePreconditionDigest=sha256Text(canonicalJson(route));
  const leasePrecondition=await withWorktreeStateLock(value.runtime.paths,async()=>{
    const latestRoute=await readRoute(value.runtime.paths,{allowMissing:true});
    if (!latestRoute||latestRoute.id!==route.id||latestRoute.status!=='active'
        || sha256Text(canonicalJson(latestRoute))!==routePreconditionDigest) {
      throw conflictError('Route changed before completion evidence could start.','COMPLETION_PRECONDITION_CHANGED');
    }
    return renewLease(value.runtime.paths,route.id);
  });
  const planned=requestedChecks(route,options); const receipts=[];
  for (const check of planned) receipts.push(await evidenceForCheck(check,value,route));
  const failed=receipts.find((item)=>!item.successful);
  if (failed) {
    await withWorktreeStateLock(value.runtime.paths,async()=>{
      const latestRoute=await readRoute(value.runtime.paths,{allowMissing:true});
      if (!latestRoute||latestRoute.id!==route.id||latestRoute.status!=='active'
          || sha256Text(canonicalJson(latestRoute))!==routePreconditionDigest) return;
      route.generation=(route.generation??1)+1;
      route.evidence_ids=[...new Set([...route.evidence_ids,...receipts.map((item)=>item.id)])]; route.updated_at=new Date().toISOString();
      const current=await readCurrent(value.runtime.paths); current.evidence_ids=[...new Set([...current.evidence_ids,...receipts.map((item)=>item.id)])].slice(-8); current.open_risks=['The latest predeclared success check failed; diagnose before retrying completion.']; current.updated_at=new Date().toISOString();
      if (options.experience_ids?.length) { const next=addExperienceCounterevidence(value.context.experience,options.experience_ids,`Evidence ${failed.id} failed while applying the path.`); await writeProjectJson(value.context.root,value.context.manifest.experience_index,next); }
      await writeStepState(value.runtime.paths,route,current);
    });
    await recordProviderOutcome(value.runtime.paths,route.provider.id,false);
    throw conflictError(`Predeclared success check ${failed.check_id} failed with exit code ${failed.exit_code??'unknown'}; the step remains active.`,'EVIDENCE_FAILED');
  }
  const finalReceipt=receipts.at(-1);
  if (typeof runtimeHooks.beforeFinalize==='function') await runtimeHooks.beforeFinalize({route,finalReceipt,receipts});
  try {
    return await withWorktreeStateLock(value.runtime.paths,async()=>{
      const finalValue=await loaded(options.project);
      const latestRoute=await readRoute(finalValue.runtime.paths,{allowMissing:true});
      if (!latestRoute||latestRoute.id!==route.id||latestRoute.status!=='active'
          || sha256Text(canonicalJson(latestRoute))!==routePreconditionDigest) {
        throw conflictError('Route changed or exited while completion evidence was running.','COMPLETION_PRECONDITION_CHANGED');
      }
      if (latestRoute.registry_digest!==outcomeRegistryDigest(finalValue.outcomes)) throw conflictError('Outcome Contract changed while completion evidence was running.','OUTCOME_REGISTRY_CHANGED');
      const latestProgress=await readOutcomeProgress(finalValue.runtime.paths,finalValue.outcomes);
      await verifyProgressProjection(finalValue.context,finalValue.outcomes,latestProgress);
      const latestLease=await inspectLease(finalValue.runtime.paths);
      if (!latestLease||latestLease.owner!==route.id||latestLease.id!==leasePrecondition.id
          || latestLease.generation<leasePrecondition.generation||Date.parse(latestLease.expires_at)<=Date.now()) {
        throw conflictError('Writer lease changed, expired, or was broken while completion evidence was running.','COMPLETION_PRECONDITION_CHANGED');
      }
      let finalPermit=null;
      if (route.task_mode==='deep') {
        const deepState=await validateDeepPermit(finalValue.context,finalValue.runtime,finalValue.authority,{
          required:true,slice:route.slice,envelope:{
            task_text:route.task_text,phase:route.phase,capability:route.capability,provider_id:route.provider?.id,
            scope_paths:route.approved_paths,permissions:route.permissions,success_evidence:route.success_evidence,success_checks:route.success_checks,
          },
        });
        if (deepState.permit.id!==route.implementation_permit_id) throw conflictError('The active route no longer owns the reviewed Implementation Permit.','IMPLEMENTATION_PERMIT_STALE');
        finalPermit=deepState.permit;
      }
      const bytesAtCommit=await executionSnapshot(finalValue.context.executionRoot);
      if (!snapshotsMatch(finalReceipt.execution_after,bytesAtCommit)) {
        throw conflictError('Product worktree bytes changed after evidence and before completion commit.','CODE_CHANGED_AFTER_EVIDENCE');
      }
      const currentTruth=parseTruthMap(finalValue.context.truthSource);
  const authorityPaths=[
    ...(route.authority_snapshot?.confirmed_sources??[]).map((item)=>item.path),
    ...[...currentTruth.confirmed,...currentTruth.candidates,...currentTruth.declined].map((item)=>item.path),
  ].map((item)=>portablePath(item).replace(/\/+$/,''));
  const isAuthorityPath=(item)=>authorityPaths.some((authorityPath)=>item===authorityPath||item.startsWith(`${authorityPath}/`));
  const materialChanges=materialProductChanges(route.execution_start,finalReceipt.execution_after)
    .filter((item)=>item.startsWith('@')||!isAuthorityPath(item));
  if (route.permissions?.code_write===true&&materialChanges.length===0) throw conflictError('A code-writing step cannot finish because no material product change exists after the route started.','NO_PRODUCT_CHANGE');
  const coveredPaths=new Set(receipts.flatMap((item)=>(item.coverage_artifacts??[]).filter((artifact)=>artifact.present).map((artifact)=>artifact.path)));
  const uncoveredMaterial=materialChanges.filter((item)=>!item.startsWith('@')&&!coveredPaths.has(item));
  if (route.permissions?.code_write===true&&uncoveredMaterial.length) throw conflictError(`All material product changes must be covered by predeclared success checks. Uncovered: ${uncoveredMaterial.join(', ')}`,'UNCOVERED_PRODUCT_CHANGE');
  if (route.permissions?.code_write===true&&!materialChanges.includes('@git-head')&&!materialChanges.includes('@tree')&&!materialChanges.some((item)=>coveredPaths.has(item))) throw conflictError('The final product changes are not covered by the predeclared success checks.','UNCOVERED_PRODUCT_CHANGE');
  const outputContract=await validateRouteContract(finalValue.context.executionRoot,route,options,receipts,materialChanges);
  const currentAuthority=await authoritySnapshot(finalValue.context.executionRoot,currentTruth,finalValue.context.intentSource);
  const reconciliation=reconcile(route,currentAuthority,currentTruth,options.truth_decision??'no-material-change',options.truth_path??null);
  route.output_contract=outputContract;
  let capture=captureSuccessCandidate(finalValue.context.experience,route,finalReceipt,options.capture_class??null);
  const controlPlans=[];
  if (capture.index!==finalValue.context.experience) {
    if (capture.candidate_id) {
      const entry=capture.index.entries.find((item)=>item.id===capture.candidate_id);
      const artifact=successCandidateArtifact(entry);
      const digest=sha256Text(artifact.content);
      const nextEntry={...entry,artifacts:[{path:artifact.path,sha256:digest},...(entry.artifacts??[]).filter((item)=>item.path!==artifact.path)]};
      capture={...capture,index:{...capture.index,entries:capture.index.entries.map((item)=>item.id===entry.id?nextEntry:item)}};
      validateExperienceIndex(capture.index);
      controlPlans.push({target:resolveInside(finalValue.context.root,artifact.path,'Success candidate artifact'),content:artifact.content});
      route.governance_writes.push(artifact.path);
    }
    controlPlans.push({target:resolveInside(finalValue.context.root,finalValue.context.manifest.experience_index,'Experience index'),content:canonicalJson(capture.index)});
    route.governance_writes.push(finalValue.context.manifest.experience_index);
  }
  if (isProgressProjectionOwner(finalValue.outcomes,latestProgress)) route.governance_writes.push(finalValue.context.manifest.progress_projection);
  route.success_capture={disposition:capture.disposition,candidate_id:capture.candidate_id};
  const activationId=route.activation_id;
  const routeGenerationBefore=route.generation??1;
  route.status='satisfied'; route.generation=routeGenerationBefore+1; route.activation_id=null; route.evidence_ids=[...new Set([...route.evidence_ids,...receipts.map((item)=>item.id)])]; route.truth_reconciliation=reconciliation; route.execution_end=finalReceipt.execution_after; route.updated_at=new Date().toISOString();
  route.completion_seal={schema_version:1,route_generation_before:routeGenerationBefore,route_generation_after:route.generation,lease_id:latestLease.id,lease_generation:latestLease.generation,permit_id:finalPermit?.id??null,permit_generation:finalPermit?.generation??null,authority_digest:currentAuthority.authority_digest,final_evidence_id:finalReceipt.id,evidence_snapshot_digest:sha256Text(canonicalJson(finalReceipt.execution_after)),final_snapshot_digest:sha256Text(canonicalJson(route.execution_end)),committed_at:route.updated_at};
  const nextProgress=applyRouteOutcomeEvidence(latestProgress,finalValue.outcomes,route,receipts,finalReceipt.execution_after);
  const progressProjection=renderProgressMarkdown(finalValue.outcomes,nextProgress);
  const current=await readCurrent(finalValue.runtime.paths); current.status='ready'; current.route_instance_id=route.id; current.authority_digest=currentAuthority.authority_digest; current.control_generation=finalValue.context.manifest.control_generation; current.evidence_ids=route.evidence_ids.slice(-8); current.open_risks=[]; current.next_action='Review the evidence and choose the next bounded slice or stop.'; current.task_mode='adaptive'; current.deep_start_card_id=null; current.implementation_permit_id=null; current.outcome_ids=route.outcome_ids; current.outcome_registry_digest=route.registry_digest; current.updated_at=new Date().toISOString();
  controlPlans.push(
    {target:finalValue.runtime.paths.outcome_progress,content:canonicalJson(nextProgress),mode:0o600},
    {target:finalValue.runtime.paths.route,content:canonicalJson(route),mode:0o600},
    {target:finalValue.runtime.paths.current,content:canonicalJson(current),mode:0o600},
  );
  if (isProgressProjectionOwner(finalValue.outcomes,nextProgress)) controlPlans.push({target:resolveInside(finalValue.context.root,finalValue.context.manifest.progress_projection,'Progress projection path'),content:progressProjection,mode:0o644});
  if (typeof runtimeHooks.beforeControlCommit==='function') await runtimeHooks.beforeControlCommit({route,current,progress:nextProgress,plans:controlPlans});
  await transactionalWrites(controlPlans);
  if (activationId) await removeActivation(finalValue.runtime.paths,activationId).catch(()=>{}); if (route.implementation_permit_id) await consumeDeepPermit(finalValue.runtime.paths,route.implementation_permit_id,'Deep controlled step completed.'); await appendRuntimeEvent(finalValue.runtime.paths,{type:'step-finished',route_id:route.id,evidence_ids:route.evidence_ids,truth_status:reconciliation.status,outcome_ids:route.outcome_ids}); await recordProviderOutcome(finalValue.runtime.paths,route.provider.id,true); await releaseLease(finalValue.runtime.paths,route.id);
  return {route,evidence:finalReceipt,evidence_receipts:receipts,experience_capture:route.success_capture,outcome_progress:nextProgress};
    });
  } catch (error) {
    if (completionFailureInvalidatesRoute(error)) await invalidateCompletionAttempt(options.project,route.id,error);
    throw error;
  }
}

export async function abandonStep(options={}) {
  const initial=await loaded(options.project);
  return withWorktreeStateLock(initial.runtime.paths,async()=>{
    const value=await loaded(options.project); const route=await readRoute(value.runtime.paths,{allowMissing:true});
    if (!route||route.status!=='active') throw conflictError('An active step is required.','ACTIVE_STEP_REQUIRED');
    await renewLease(value.runtime.paths,route.id); const reason=boundedText(options.reason,500,'Abandonment reason');
    const currentTruth=parseTruthMap(value.context.truthSource); const currentAuthority=await authoritySnapshot(value.context.executionRoot,currentTruth,value.context.intentSource);
    const reconciliation=reconcile(route,currentAuthority,currentTruth,options.truth_decision??'no-material-change',options.truth_path??null);
    const activationId=route.activation_id; route.status='abandoned'; route.generation=(route.generation??1)+1; route.activation_id=null; route.abandonment_reason=reason; route.truth_reconciliation=reconciliation; route.execution_end=await executionSnapshot(value.context.executionRoot); route.updated_at=new Date().toISOString();
    const current=await readCurrent(value.runtime.paths); current.status='ready'; current.route_instance_id=route.id; current.authority_digest=currentAuthority.authority_digest; current.open_risks=[reason]; current.next_action='Re-anchor and choose a better bounded path.'; current.task_mode='adaptive'; current.deep_start_card_id=null; current.implementation_permit_id=null; current.updated_at=new Date().toISOString();
    await writeStepState(value.runtime.paths,route,current); if (activationId) await removeActivation(value.runtime.paths,activationId).catch(()=>{}); if (route.implementation_permit_id) await consumeDeepPermit(value.runtime.paths,route.implementation_permit_id,'Deep controlled step abandoned.'); await appendRuntimeEvent(value.runtime.paths,{type:'step-abandoned',route_id:route.id,reason}); await recordProviderOutcome(value.runtime.paths,route.provider.id,false); await releaseLease(value.runtime.paths,route.id); return route;
  });
}

export async function heartbeatStep({project=process.cwd()}={}) {
  const initial=await loaded(project);
  return withWorktreeStateLock(initial.runtime.paths,async()=>{
    const value=await loaded(project); const route=await readRoute(value.runtime.paths,{allowMissing:true}); if (!route||route.status!=='active') throw conflictError('An active step is required.','ACTIVE_STEP_REQUIRED'); return renewLease(value.runtime.paths,route.id);
  });
}
