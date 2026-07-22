import { fileURLToPath } from 'node:url';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  EVIDENCE_REQUIRED_PHASES, ENTRY_SKILL_BUDGET_BYTES,
  MANAGED_BLOCK_BUDGET_BYTES, TRACKED_CONTRACT_BUDGET_BYTES, VERSION,
} from './constants.mjs';
import { healthError } from './errors.mjs';
import { discoverContract, skillsLockDigest } from './contract.mjs';
import { parseIntent } from './intent.mjs';
import { authoritySnapshot, parseTruthMap } from './truth.mjs';
import { auditExperience, validateExperienceIndex } from './experience.mjs';
import { attachWorktree } from './worktree.mjs';
import {
  finalSnapshotMatches, inspectLease, loadEvidence, readCurrent, readReceipt, readRoute,
} from './runtime.mjs';
import { executionSnapshot, snapshotsMatchIgnoringPaths } from './git.mjs';
import { loadActivation } from './skills.mjs';
import { loadProviderRegistry } from './provider-registry.mjs';
import { validateRoutes } from './routes.mjs';
import { buildContext } from './context.mjs';
import { auditCoverageSources, loadOutcomeRegistry, outcomeStatus } from './outcomes.mjs';
import { outcomeProgressSummary, readOutcomeProgress, verifyProgressProjection } from './outcome-progress.mjs';
import { ADAPTERS, hasCanonicalManagedBlock, managedBlock } from './adapters.mjs';
import {
  canonicalJson, exists, hashTree, portableTextEqual, readProjectText, rejectSymlinkChain,
  resolveInside, sha256File, sha256Text,
} from './files.mjs';

const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const error=(code,message)=>({level:'error',code,message});
const warning=(code,message)=>({level:'warning',code,message});

const BOUNDARY_LEVELS = { ordinary: 0, slice: 1, goal: 2, release: 3 };
const BOUNDARY_ALIASES = new Map([
  ['ordinary', 'ordinary'], ['slice', 'slice'], ['completion', 'slice'], ['handoff', 'slice'],
  ['goal', 'goal'], ['merge', 'goal'], ['release', 'release'], ['deployment', 'release'], ['publication', 'release'],
]);
function normalizedBoundary(value) { return BOUNDARY_ALIASES.get(String(value ?? 'ordinary').toLowerCase()) ?? null; }
function atLeast(boundary,level) { return BOUNDARY_LEVELS[boundary] >= BOUNDARY_LEVELS[level]; }
function portablePath(value) { return String(value??'').replaceAll('\\','/').replace(/^\.\//,'').replace(/\/+$/,''); }
function pathWithinScope(relative,scopePaths=[]) {
  const value=portablePath(relative);
  return scopePaths.some((scope)=>{
    const normalized=portablePath(scope);
    return value===normalized||value.startsWith(`${normalized}/`);
  });
}

async function currentAcceptanceProof(context,runtime,entry,acceptance,authorityDigest,skillsDigest) {
  const validator=acceptance.validator;
  const proof=entry.acceptance_proofs?.[acceptance.id];
  if (['user-decision','review-decision'].includes(validator.kind)) {
    const receipt=proof?.decision_receipt;
    if (proof?.kind!==validator.kind||receipt?.decision_type!==validator.decision_type||receipt.authority_digest!==authorityDigest) return {ok:false,reason:`${validator.kind}-receipt-missing-or-stale`};
    try {
      const sealed=await readReceipt(path.join(runtime.paths.decisions,`${receipt.id}.json`),'Acceptance decision receipt');
      if (canonicalJson(sealed)!==canonicalJson(receipt)) return {ok:false,reason:`${validator.kind}-receipt-mismatch`};
    } catch { return {ok:false,reason:`${validator.kind}-receipt-missing-or-tampered`}; }
    const now=await executionSnapshot(context.executionRoot).catch(()=>null);
    if (!now||!snapshotsMatchIgnoringPaths(receipt.execution_snapshot,now,[context.manifest.progress_projection])) return {ok:false,reason:`${validator.kind}-final-bytes-changed`};
    return {ok:true,decision_receipt_id:proof.decision_receipt.id};
  }
  if (validator.kind==='authority-adapter') {
    const receipt=proof?.authority_receipt;
    if (proof?.kind!=='authority-adapter'||receipt?.adapter!==validator.adapter||receipt?.verdict!=='PASS'||receipt.authority_digest!==authorityDigest) return {ok:false,reason:'authority-adapter-receipt-missing-or-stale'};
    try {
      const sealed=await readReceipt(path.join(runtime.paths.authority_receipts,`${receipt.id}.json`),'Authority adapter receipt');
      if (canonicalJson(sealed)!==canonicalJson(receipt)) return {ok:false,reason:'authority-adapter-receipt-mismatch'};
    } catch { return {ok:false,reason:'authority-adapter-receipt-missing-or-tampered'}; }
    const now=await executionSnapshot(context.executionRoot).catch(()=>null);
    if (!now||!snapshotsMatchIgnoringPaths(receipt.execution_snapshot,now,[context.manifest.progress_projection])) return {ok:false,reason:'authority-adapter-final-bytes-changed'};
    return {ok:true,authority_receipt_id:receipt.id};
  }
  if (!['command','artifact'].includes(validator.kind)) return {ok:false,reason:`${validator.kind}-receipt-missing`};
  if (proof?.kind!=='route-evidence') return {ok:false,reason:'acceptance-route-proof-missing'};
  for (const evidenceId of proof.evidence_ids) {
    try {
      const receipt=await loadEvidence(runtime.paths,evidenceId);
      if (!receipt.successful||receipt.authority_digest!==authorityDigest||receipt.skills_digest!==skillsDigest) continue;
      if (validator.kind==='command'&&(receipt.kind!=='command'||canonicalJson(receipt.command)!==canonicalJson(validator.command))) continue;
      if (validator.kind==='artifact'&&(receipt.kind!=='artifact'||receipt.artifact_path!==validator.path)) continue;
      const expectedPaths=validator.kind==='artifact'?[validator.path]:validator.covers_paths??[];
      let current=true;
      for (const relative of expectedPaths) {
        const recorded=(receipt.coverage_artifacts??[]).find((item)=>item.path===relative&&item.present===true)
          ??(receipt.artifact_path===relative?{sha256:receipt.artifact_sha256,present:true}:null);
        if (!recorded?.sha256) { current=false; break; }
        await rejectSymlinkChain(context.executionRoot,relative,{allowMissing:false});
        if (await sha256File(resolveInside(context.executionRoot,relative,'Acceptance evidence artifact'))!==recorded.sha256) { current=false; break; }
      }
      if (current) return {ok:true,evidence_id:evidenceId};
    } catch { /* A different valid receipt may still prove this acceptance. */ }
  }
  return {ok:false,reason:'fresh-matching-evidence-missing'};
}
function areaSummary(issues,warnings) {
  const areas={contract:['CONTRACT','MANIFEST','INTENT'],truth:['TRUTH','AUTHORITY'],outcomes:['OUTCOME','PROGRESS','COVERAGE'],runtime:['RUNTIME','ROUTE','LEASE','EVIDENCE','ACTIVATION'],experience:['EXPERIENCE'],skills:['PROVIDER','SKILL','ROUTES'],worktree:['WORKTREE','GIT'],budget:['BUDGET','LARGE']};
  return Object.fromEntries(Object.entries(areas).map(([name,tokens])=>{
    const has=(items)=>items.some((item)=>tokens.some((token)=>item.code.includes(token)));
    return [name,has(issues)?'error':has(warnings)?'attention':'healthy'];
  }));
}

async function trackedBudget(context,issues) {
  if (!context.tracked) return;
  const files=['.vibetether/project.json',context.manifest.intent,context.manifest.truth_index,context.manifest.outcome_index,context.manifest.progress_projection,context.manifest.experience_index,context.manifest.skills_lock,context.manifest.routes,context.manifest.launcher];
  let bytes=0;
  for (const relative of files) {
    try { bytes+=(await lstat(path.join(context.root,...relative.split('/')))).size; }
    catch { /* Structural reads already report this. */ }
  }
  if (bytes>TRACKED_CONTRACT_BUDGET_BYTES) issues.push(error('CONTRACT_BUDGET_EXCEEDED',`Tracked Contract is ${bytes} bytes; budget is ${TRACKED_CONTRACT_BUDGET_BYTES}.`));
  if (await exists(path.join(context.root,'.vibetether','providers'))) issues.push(error('PROJECT_PROVIDER_CATALOG_PRESENT','Provider catalogs must live in the external content-addressed cache.'));
  if (await exists(path.join(context.root,'.vibetether','state'))) issues.push(error('PROJECT_RUNTIME_PRESENT','Runtime state must not live in the project Contract.'));
}

async function hostAssets(context,issues,warnings) {
  if (!context.tracked) return;
  const entry=await readFile(path.join(packageRoot,'skills','vibe-tether','SKILL.md'),'utf8');
  const deepEntry=await readFile(path.join(packageRoot,'skills','vibe-tether-deep','SKILL.md'),'utf8');
  if (Buffer.byteLength(entry,'utf8')>ENTRY_SKILL_BUDGET_BYTES) issues.push(error('ENTRY_SKILL_BUDGET_EXCEEDED','VibeTether entry Skill exceeds its context budget.'));
  if (Buffer.byteLength(managedBlock(),'utf8')>MANAGED_BLOCK_BUDGET_BYTES) issues.push(error('MANAGED_BLOCK_BUDGET_EXCEEDED','Managed host instruction block exceeds its context budget.'));
  for (const [agent,config] of Object.entries(ADAPTERS)) {
    const instruction=await readProjectText(context.root,config.instruction,`${agent} instructions`,{allowMissing:true});
    const installed=await readProjectText(context.root,config.skill,`${agent} entry Skill`,{allowMissing:true});
    if (instruction===null&&installed===null) continue;
    if (instruction===null||!hasCanonicalManagedBlock(instruction)) issues.push(error('MANAGED_BLOCK_MISSING',`${agent} instruction file lacks the canonical VibeTether block.`));
    if (installed===null) issues.push(error('ENTRY_SKILL_MISSING',`${agent} entry Skill is missing.`));
    else if (!portableTextEqual(installed,entry)) issues.push(error('ENTRY_SKILL_CHANGED',`${agent} entry Skill differs from the release copy.`));
    const deepInstalled=await readProjectText(context.root,config.deepSkill,`${agent} deep entry Skill`,{allowMissing:true});
    if (deepInstalled===null) issues.push(error('DEEP_ENTRY_SKILL_MISSING',`${agent} deep entry Skill is missing.`));
    else if (!portableTextEqual(deepInstalled,deepEntry)) issues.push(error('DEEP_ENTRY_SKILL_CHANGED',`${agent} deep entry Skill differs from the release copy.`));
  }
}

function governanceIgnoredPaths(context, route, issues) {
  const allowed = new Set([context.manifest.experience_index,context.manifest.progress_projection].filter(Boolean));
  if (route?.success_capture?.candidate_id) allowed.add(`docs/operations/vibetether-candidates/${route.success_capture.candidate_id}.md`);
  const declared = Array.isArray(route?.governance_writes) ? route.governance_writes : [];
  const unsupported = declared.filter((item) => !allowed.has(item));
  if (unsupported.length) issues.push(error('UNSAFE_GOVERNANCE_WRITE', `Step declared unsupported evidence-ignore paths: ${unsupported.join(', ')}`));
  return [...new Set(declared.filter((item) => allowed.has(item)))];
}

export async function inspectProject(options={}) {
  const requestedBoundary=String(options.boundary??'ordinary').toLowerCase();
  let effectiveBoundary=normalizedBoundary(requestedBoundary);
  const issues=[]; const warnings=[];
  let context;
  try { context=await discoverContract(options.project??process.cwd()); }
  catch (cause) {
    const report={ok:false,schema_version:1,boundary:requestedBoundary,requested_boundary:requestedBoundary,effective_boundary:effectiveBoundary,project:null,issues:[error(cause.code??'CONTRACT_NOT_FOUND',cause.message)],warnings:[],completion:{label:'NOT_STARTED',remaining_outcome_ids:[],remaining_acceptance_ids:[],unproven_maturity:[]},control_plane:{contract:'error'}};
    if (options.throw_on_error!==false) throw healthError(report,options.json===true); return report;
  }
  if (!effectiveBoundary) { issues.push(error('INVALID_BOUNDARY',`Doctor boundary is unsupported: ${requestedBoundary}`)); effectiveBoundary='ordinary'; }
  let intent,truth,authority,runtime,current,route,outcomeRegistry,outcomeProgress;
  try { intent=parseIntent(context.intentSource); } catch (cause) { issues.push(error(cause.code??'INVALID_INTENT',cause.message)); }
  try { truth=parseTruthMap(context.truthSource); } catch (cause) { issues.push(error(cause.code??'INVALID_TRUTH',cause.message)); }
  try { validateExperienceIndex(context.experience); } catch (cause) { issues.push(error(cause.code??'INVALID_EXPERIENCE',cause.message)); }
  try { if (truth) authority=await authoritySnapshot(context.executionRoot,truth,context.intentSource); } catch (cause) { issues.push(error(cause.code??'INVALID_AUTHORITY',cause.message)); }
  if (authority) {
    try { runtime=await attachWorktree(context,authority.authority_digest); current=await readCurrent(runtime.paths); route=await readRoute(runtime.paths,{allowMissing:true}); }
    catch (cause) { issues.push(error(cause.code??'INVALID_RUNTIME',cause.message)); }
  }
  if (effectiveBoundary==='ordinary'&&['REVIEW','SHIP'].includes(current?.phase)) effectiveBoundary='slice';
  const atCompletion=atLeast(effectiveBoundary,'slice');
  if (context.manifest.schema_version>=2) {
    try { outcomeRegistry=await loadOutcomeRegistry(context); }
    catch (cause) { issues.push(error(cause.code??'INVALID_OUTCOMES',cause.message)); }
    if (outcomeRegistry&&runtime) {
      try {
        outcomeProgress=await readOutcomeProgress(runtime.paths,outcomeRegistry,{create:false,persist:false});
        if (atCompletion&&!outcomeProgress) issues.push(error('OUTCOME_PROGRESS_MISSING','Completion-like boundary requires the per-worktree Outcome progress ledger.'));
        if (atCompletion&&outcomeProgress) await verifyProgressProjection(context,outcomeRegistry,outcomeProgress);
      } catch (cause) { issues.push(error(cause.code??'INVALID_OUTCOME_PROGRESS',cause.message)); }
    }
  }
  if (context.manifest.vibetether_version!==VERSION) (atCompletion?issues:warnings).push((atCompletion?error:warning)('VERSION_MISMATCH',`Project expects ${context.manifest.vibetether_version}; running CLI is ${VERSION}.`));
  if (intent?.status!=='confirmed') (atCompletion?issues:warnings).push((atCompletion?error:warning)('INTENT_UNCONFIRMED','Intent Contract is not confirmed.'));
  if (current&&authority&&current.authority_digest!==authority.authority_digest) (atCompletion?issues:warnings).push((atCompletion?error:warning)('AUTHORITY_CHANGED','Runtime checkpoint is anchored to older confirmed authority.'));
  if (current&&current.control_generation!==context.manifest.control_generation) issues.push(error('CONTROL_GENERATION_CHANGED','Runtime checkpoint uses a different control generation.'));
  if (atCompletion&&!route) issues.push(error('MISSING_CONTROLLED_SESSION','Completion-like boundary requires a completed controlled step with current evidence.'));
  if (atCompletion&&route&&route.status!=='satisfied') issues.push(error('ROUTE_NOT_SATISFIED',`Completion-like boundary requires a satisfied step; current route status is ${route.status}.`));
  if (route?.status==='active'&&atCompletion) issues.push(error('ACTIVE_ROUTE','Completion-like boundary cannot retain an active step.'));
  if (route?.status==='broken'&&atCompletion) issues.push(error('BROKEN_ROUTE','Completion-like boundary cannot accept a step whose lease was broken.'));
  if (route?.status==='active'&&authority&&route.authority_start!==authority.authority_digest) issues.push(error('ACTIVE_ROUTE_AUTHORITY_DRIFT','Confirmed authority changed during the active step.'));
  if (route&&route.status!=='active'&&route.truth_reconciliation?.status==='pending') {
    const referencedRouteId=['route_instance_id','route_id','pending_route_id']
      .map((key)=>route.truth_reconciliation?.[key]).find((value)=>typeof value==='string'&&value);
    if (referencedRouteId&&referencedRouteId!==route.id) {
      (atCompletion?issues:warnings).push((atCompletion?error:warning)('BLOCKED_REANCHOR_REQUIRED',`Legacy Truth reconciliation names route ${referencedRouteId}, not ${route.id}. Preserve it with \`vibetether step recover-truth-reconciliation --project . --reason "Reviewed legacy mismatch." --yes\`, then re-anchor before a fresh route.`));
    } else (atCompletion?issues:warnings).push((atCompletion?error:warning)('PENDING_TRUTH_RECONCILIATION','Exited step still has pending Truth reconciliation.'));
  }
  if (route&&route.status!=='active'&&route.truth_reconciliation?.status==='blocked_reanchor_required') (atCompletion?issues:warnings).push((atCompletion?error:warning)('BLOCKED_REANCHOR_REQUIRED','Legacy Truth reconciliation recovery is preserved but still requires `vibetether step reanchor` before a fresh route.'));
  if (runtime) {
    const lease=await inspectLease(runtime.paths).catch(()=>null);
    if (route?.status==='active'&&!lease) issues.push(error('MISSING_LEASE','Active step has no writer lease.'));
    if (route?.status!=='active'&&lease) warnings.push(warning('STALE_LEASE','Inactive worktree retains a writer lease.'));
    if (route?.status==='active'&&!route.activation_id) issues.push(error('ACTIVATION_MISSING','Active step has no Provider activation receipt.'));
    if (route?.status==='active'&&route.activation_id) {
      try { const activation=await loadActivation(runtime.paths,route.activation_id); if (activation.route_id!==route.id) throw new Error('route mismatch'); }
      catch (cause) { issues.push(error(cause.code??'INVALID_ACTIVATION','Activation receipt is missing, modified, or belongs to another step.')); }
    }
    if (route?.status!=='active'&&route?.activation_id) issues.push(error('STALE_ACTIVATION','Exited step still references a live Provider activation.'));
    const validatedEvidence = [];
    for (const evidenceId of route?.evidence_ids??[]) {
      try {
        const evidence=await loadEvidence(runtime.paths,evidenceId);
        if (!evidence.successful) issues.push(error('EVIDENCE_FAILED',`Evidence receipt failed: ${evidenceId}`));
        if (EVIDENCE_REQUIRED_PHASES.has(route.phase)&&evidence.kind==='assertion') issues.push(error('PROXY_EVIDENCE',`Phase ${route.phase} cannot be completed by assertion-only evidence.`));
        if (evidence.route_id!==route.id||evidence.authority_digest!==route.authority_start||evidence.skills_digest!==route.skills_digest) issues.push(error('EVIDENCE_SCOPE_MISMATCH',`Evidence receipt does not match the step: ${evidenceId}`));
        if (!evidence.execution_before || !evidence.execution_after) issues.push(error('EVIDENCE_SNAPSHOT_MISSING',`Evidence receipt lacks before/after execution snapshots: ${evidenceId}`));
        const declaredCheck=(route.success_checks??[]).find((item)=>item.id===evidence.check_id);
        if (!declaredCheck||declaredCheck.claim!==evidence.claim) issues.push(error('EVIDENCE_CHECK_MISMATCH',`Evidence is not bound to a predeclared success check: ${evidenceId}`));
        if (!Array.isArray(evidence.coverage_artifacts)||evidence.coverage_artifacts.some((item)=>item.present!==true||typeof item.path!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256??''))) issues.push(error('EVIDENCE_COVERAGE_INVALID',`Evidence lacks validated product coverage: ${evidenceId}`));
        validatedEvidence.push(evidence);
      } catch (cause) { issues.push(error(cause.code??'MISSING_EVIDENCE',`Evidence receipt cannot be validated: ${evidenceId}`)); }
    }
    if (route?.status==='satisfied') {
      const contract=route.output_contract;
      if (!contract || !Array.isArray(contract.required_outputs) || !Array.isArray(contract.exit_evidence) || !Array.isArray(contract.output_proofs) || !Array.isArray(contract.exit_proofs) || !Array.isArray(contract.success_checks)) {
        issues.push(error('ROUTE_CONTRACT_MISSING','Satisfied step has no validated route output contract.'));
      } else {
        if ((contract.missing_outputs??[]).length) issues.push(error('REQUIRED_OUTPUT_MISSING',`Satisfied step is missing required outputs: ${contract.missing_outputs.join(', ')}`));
        if ((contract.missing_exit_evidence??[]).length) issues.push(error('EXIT_EVIDENCE_MISSING',`Satisfied step is missing exit evidence: ${contract.missing_exit_evidence.join(' | ')}`));
        if (JSON.stringify(contract.required_outputs)!==JSON.stringify(route.required_outputs??[]) || JSON.stringify(contract.exit_evidence)!==JSON.stringify(route.exit_evidence??[])) issues.push(error('ROUTE_CONTRACT_MISMATCH','Validated output contract does not match the routed requirements.'));
        const validatedIds=new Set(validatedEvidence.map((item)=>item.id));
        const approvedPaths=Array.isArray(route.approved_paths)?route.approved_paths:[];
        if (route.permissions?.code_write===true&&!approvedPaths.length) issues.push(error('APPROVED_SCOPE_MISSING','Satisfied code-writing step has no approved product scope.'));
        for (const check of route.success_checks??[]) {
          if (route.permissions?.code_write===true&&(!Array.isArray(check.consumer_paths)||!check.consumer_paths.length)) issues.push(error('REAL_CONSUMER_MISSING',`Success check has no declared real consumer path: ${check.id??'unknown'}`));
          for (const relative of [...(check.covers_paths??[]),...(check.consumer_paths??[])]) if (approvedPaths.length&&!pathWithinScope(relative,approvedPaths)) issues.push(error('CHECK_OUTSIDE_APPROVED_SCOPE',`Success check path is outside the approved scope: ${relative}`));
        }
        const coveredPaths=new Set(validatedEvidence.flatMap((item)=>(item.coverage_artifacts??[]).filter((artifact)=>artifact.present).map((artifact)=>artifact.path)));
        for (const changed of contract.material_product_changes??[]) {
          if (String(changed).startsWith('@')) continue;
          if (approvedPaths.length&&!pathWithinScope(changed,approvedPaths)) issues.push(error('PRODUCT_CHANGE_OUTSIDE_SCOPE',`Material product change is outside the approved scope: ${changed}`));
          if (!coveredPaths.has(changed)) issues.push(error('UNCOVERED_PRODUCT_CHANGE',`Material product change lacks current evidence coverage: ${changed}`));
        }
        for (const proof of contract.output_proofs) {
          if (!(route.required_outputs??[]).includes(proof.output)||!Array.isArray(proof.evidence_ids)||proof.evidence_ids.some((id)=>!validatedIds.has(id))) issues.push(error('OUTPUT_PROOF_INVALID',`Required output proof is not bound to current evidence: ${proof.output??'unknown'}`));
          for (const artifact of proof.artifacts??[]) {
            try {
              await rejectSymlinkChain(context.executionRoot,artifact.path,{allowMissing:false});
              const actual=await sha256File(resolveInside(context.executionRoot,artifact.path,'Output proof artifact'));
              if (actual!==artifact.sha256) issues.push(error('REQUIRED_OUTPUT_CHANGED',`Output proof artifact changed after validation: ${artifact.path}`));
              if (approvedPaths.length&&!pathWithinScope(artifact.path,approvedPaths)) issues.push(error('OUTPUT_PROOF_OUTSIDE_SCOPE',`Output proof artifact is outside the approved scope: ${artifact.path}`));
              if ((contract.material_product_changes??[]).some((item)=>!String(item).startsWith('@'))&&!(contract.material_product_changes??[]).includes(artifact.path)) issues.push(error('OUTPUT_PROOF_NOT_CHANGED',`Output proof artifact was not changed in the satisfied slice: ${artifact.path}`));
            } catch (cause) { issues.push(error(cause.code??'REQUIRED_OUTPUT_MISSING',`Output proof artifact cannot be validated: ${artifact.path}`)); }
          }
        }
        for (const proof of contract.exit_proofs) {
          if (!(route.exit_evidence??[]).includes(proof.criterion)||!Array.isArray(proof.evidence_ids)||proof.evidence_ids.some((id)=>!validatedIds.has(id))) issues.push(error('EXIT_PROOF_INVALID',`Exit proof is not bound to current evidence: ${proof.criterion??'unknown'}`));
          if (!Array.isArray(proof.artifacts)||!proof.artifacts.length) issues.push(error('EXIT_PROOF_ARTIFACT_MISSING',`Exit proof has no validated product artifact: ${proof.criterion??'unknown'}`));
          for (const artifact of proof.artifacts??[]) {
            try {
              await rejectSymlinkChain(context.executionRoot,artifact.path,{allowMissing:false});
              const actual=await sha256File(resolveInside(context.executionRoot,artifact.path,'Exit proof artifact'));
              if (actual!==artifact.sha256) issues.push(error('EXIT_PROOF_ARTIFACT_CHANGED',`Exit proof artifact changed after validation: ${artifact.path}`));
              if (approvedPaths.length&&!pathWithinScope(artifact.path,approvedPaths)) issues.push(error('EXIT_PROOF_OUTSIDE_SCOPE',`Exit proof artifact is outside the approved scope: ${artifact.path}`));
              if ((contract.material_product_changes??[]).some((item)=>!String(item).startsWith('@'))&&!(contract.material_product_changes??[]).includes(artifact.path)) issues.push(error('EXIT_PROOF_NOT_CHANGED',`Exit proof artifact was not changed in the satisfied slice: ${artifact.path}`));
            } catch (cause) { issues.push(error(cause.code??'EXIT_PROOF_ARTIFACT_MISSING',`Exit proof artifact cannot be validated: ${artifact.path}`)); }
          }
        }
        for (const check of contract.success_checks) if (check.successful!==true||!validatedIds.has(check.evidence_id)) issues.push(error('SUCCESS_CHECK_INVALID',`Predeclared success check is incomplete: ${check.id??'unknown'}`));
        if (route.permissions?.code_write===true&&!(contract.material_product_changes??[]).length) issues.push(error('NO_PRODUCT_CHANGE','Satisfied code-writing step has no material product change.'));
      }
      const finalEvidence = [...validatedEvidence].reverse().find((item) => item.successful && item.kind !== 'assertion');
      const seal=route.completion_seal;
      if (!seal) {
        issues.push(error('COMPLETION_SEAL_MISSING','Satisfied step has no atomic completion seal.'));
      } else {
        const validDigest=(value)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
        const generationValid=Number.isInteger(route.generation)&&route.generation>=2
          && Number.isInteger(seal.route_generation_before)&&Number.isInteger(seal.route_generation_after)
          && seal.route_generation_before+1===seal.route_generation_after
          && seal.route_generation_after===route.generation;
        const identityValid=seal.schema_version===1
          && typeof seal.lease_id==='string'&&seal.lease_id.length>0
          && Number.isInteger(seal.lease_generation)&&seal.lease_generation>=1
          && typeof seal.committed_at==='string'&&!Number.isNaN(Date.parse(seal.committed_at))
          && seal.committed_at===route.updated_at
          && validDigest(seal.authority_digest)
          && seal.authority_digest===current?.authority_digest;
        const evidenceValid=Boolean(finalEvidence)
          && seal.final_evidence_id===finalEvidence.id
          && (route.evidence_ids??[]).includes(seal.final_evidence_id)
          && validDigest(seal.evidence_snapshot_digest)
          && seal.evidence_snapshot_digest===sha256Text(canonicalJson(finalEvidence.execution_after));
        const snapshotValid=Boolean(route.execution_end)
          && validDigest(seal.final_snapshot_digest)
          && seal.final_snapshot_digest===sha256Text(canonicalJson(route.execution_end));
        const permitValid=route.task_mode!=='deep'
          ? seal.permit_id===null&&seal.permit_generation===null
          : seal.permit_id===route.implementation_permit_id
            && Number.isInteger(seal.permit_generation)&&seal.permit_generation>=1;
        if (!generationValid||!identityValid||!evidenceValid||!snapshotValid||!permitValid) {
          issues.push(error('COMPLETION_SEAL_INVALID','Satisfied step completion seal does not match its route generation, authority, Permit, final evidence, or final byte snapshot.'));
        }
      }
      if (EVIDENCE_REQUIRED_PHASES.has(route.phase) && !finalEvidence) {
        issues.push(error('MISSING_FINAL_EVIDENCE','Satisfied step has no successful command or artifact evidence bound to final code bytes.'));
      } else if (finalEvidence?.execution_after && route.execution_end) {
        const ignored = governanceIgnoredPaths(context, route, issues);
        if (!snapshotsMatchIgnoringPaths(finalEvidence.execution_after, route.execution_end, ignored)) {
          issues.push(error('CODE_CHANGED_AFTER_EVIDENCE','Product worktree bytes changed after the final successful evidence was captured.'));
        }
      }
      if (route.classification?.needs_user_decision===true && (route.user_decision_confirmed!==true || typeof route.user_decision_reason!=='string' || !route.user_decision_reason.trim())) {
        issues.push(error('USER_DECISION_RECORD_MISSING','Direction-sensitive satisfied step lacks a durable user decision reason.'));
      }
      if (!route.success_capture?.disposition) issues.push(error('SUCCESS_CAPTURE_MISSING','Satisfied step has no Success Capture disposition.'));
      if (route.task_mode==='deep'&&(!route.start_card_id||!route.implementation_permit_id||route.user_decision_confirmed!==true)) issues.push(error('IMPLEMENTATION_PERMIT_MISSING','Deep step lacks a user-confirmed Start Card and Implementation Permit.'));
      const now=await executionSnapshot(context.executionRoot).catch(()=>null);
      if (finalEvidence?.execution_after && now) {
        const ignored = governanceIgnoredPaths(context, route, issues);
        if (!snapshotsMatchIgnoringPaths(finalEvidence.execution_after, now, ignored)
            && !issues.some((item)=>item.code==='CODE_CHANGED_AFTER_EVIDENCE')) {
          issues.push(error('CODE_CHANGED_AFTER_EVIDENCE','Product worktree bytes changed after the final successful evidence was captured.'));
        }
      }
      const finalIgnored=governanceIgnoredPaths(context,route,issues);
      if (!now||!finalSnapshotMatches(route,now,finalIgnored)) (atCompletion?issues:warnings).push((atCompletion?error:warning)('STALE_EXECUTION_SNAPSHOT','Worktree bytes, branch, or HEAD changed after step evidence.'));
      if (!(route.evidence_ids??[]).length&&EVIDENCE_REQUIRED_PHASES.has(route.phase)) issues.push(error('MISSING_EVIDENCE','Satisfied step has no evidence receipts.'));
    }
    if (authority) {
      try {
        const skillsDigest=skillsLockDigest(context.skills);
        const health=await auditExperience(context,runtime.paths,context.experience,{authorityDigest:authority.authority_digest,skillsDigest,signals:[]});
        for (const item of health) if (item.declared_status==='proven'&&item.effective_status!=='proven') warnings.push(warning('STALE_EXPERIENCE',`Proven Experience ${item.id} is now suspect: ${item.reasons.join(', ')}`));
      } catch (cause) { issues.push(error(cause.code??'INVALID_EXPERIENCE',cause.message)); }
    }
  }
  try {
    const registry=await loadProviderRegistry();
    if (context.routes) validateRoutes(context.routes,registry.capabilities,registry.providers);
    for (const pin of context.skills.pins) {
      const provider=registry.providers.find((item)=>item.id===pin.id);
      if (!provider||provider.object_hash!==pin.object_hash||provider.fingerprint!==pin.fingerprint) issues.push(error('PROVIDER_PIN_INVALID',`Pinned Provider is unavailable or changed: ${pin.id}`));
    }
  } catch (cause) { issues.push(error(cause.code??'INVALID_PROVIDER',cause.message)); }
  try { await trackedBudget(context,issues); await hostAssets(context,issues,warnings); } catch (cause) { issues.push(error(cause.code??'BUDGET_CHECK_FAILED',cause.message)); }
  try { const capsule=await buildContext({project:context.executionRoot,boundary:requestedBoundary,agent:options.agent??'codex'}); if (Buffer.byteLength(JSON.stringify(capsule),'utf8')>4096) issues.push(error('CONTEXT_BUDGET_EXCEEDED','Context Capsule exceeds 4096 bytes.')); }
  catch (cause) { if (!issues.some((item)=>item.code===cause.code)) issues.push(error(cause.code??'CONTEXT_INVALID',cause.message)); }

  const sliceOk=issues.length===0;
  let label=sliceOk&&atLeast(effectiveBoundary,'slice')?'SLICE_GREEN':'NOT_STARTED';
  let remainingOutcomeIds=[];
  let remainingAcceptanceIds=[];
  const unprovenMaturity=[];
  const addUnproven=(item)=>{ if (!unprovenMaturity.some((existing)=>existing.outcome_id===item.outcome_id&&existing.acceptance_id===item.acceptance_id&&existing.reason===item.reason)) unprovenMaturity.push(item); };
  let goalOk=false;
  const skillsDigest=skillsLockDigest(context.skills);

  const evaluateOutcomes=async(requiredBoundary)=>{
    const required=(outcomeRegistry?.outcomes??[]).filter((item)=>item.disposition==='required'&&item.required_at.includes(requiredBoundary));
    const remainingOutcomes=new Set();
    const remainingAcceptance=new Set();
    if (!required.length) issues.push(error(requiredBoundary==='release'?'RELEASE_OUTCOMES_MISSING':'GOAL_OUTCOMES_MISSING',`No required Outcomes are declared for the ${requiredBoundary} boundary.`));
    for (const outcome of required) {
      const entry=outcomeProgress?.outcomes?.[outcome.id];
      if (!entry||entry.state!=='satisfied') {
        remainingOutcomes.add(outcome.id);
        for (const id of entry?.missing_acceptance_ids??outcome.acceptance.map((item)=>item.id)) {
          remainingAcceptance.add(id);
          const acceptance=outcome.acceptance.find((item)=>item.id===id);
          if (acceptance) addUnproven({outcome_id:outcome.id,acceptance_id:id,required_maturity:acceptance.required_maturity,reason:entry?.state==='blocked'?'validator-migration-required':'acceptance-not-satisfied'});
        }
      }
      for (const dependencyId of outcome.dependencies) {
        const dependency=outcomeRegistry.outcomes.find((item)=>item.id===dependencyId);
        if (!dependency||dependency.disposition!=='required'||outcomeProgress?.outcomes?.[dependencyId]?.state!=='satisfied') {
          remainingOutcomes.add(outcome.id);
          issues.push(error('OUTCOME_DEPENDENCY_UNSATISFIED',`Outcome ${outcome.id} depends on unsatisfied Outcome ${dependencyId}.`));
        }
      }
      for (const acceptance of outcome.acceptance.filter((item)=>entry?.satisfied_acceptance_ids?.includes(item.id))) {
        const proof=await currentAcceptanceProof(context,runtime,entry,acceptance,authority?.authority_digest,skillsDigest);
        if (!proof.ok) {
          remainingOutcomes.add(outcome.id); remainingAcceptance.add(acceptance.id);
          addUnproven({outcome_id:outcome.id,acceptance_id:acceptance.id,required_maturity:acceptance.required_maturity,reason:proof.reason});
          issues.push(error('ACCEPTANCE_EVIDENCE_STALE',`Acceptance ${acceptance.id} lacks current ${acceptance.required_maturity} evidence on the final project bytes.`));
        }
      }
    }
    return {required,remainingOutcomes,remainingAcceptance};
  };

  if (atLeast(effectiveBoundary,'goal')) {
    const goalIssueStart=issues.length;
    if (!outcomeRegistry) issues.push(error('GOAL_OUTCOME_CONTRACT_REQUIRED','Goal completion requires a schema-2 Outcome Contract. Run the explicit project upgrade or initialize Outcomes first.'));
    else {
      const coverage=outcomeStatus(outcomeRegistry);
      if (coverage.coverage_status!=='confirmed') issues.push(error('GOAL_COVERAGE_NOT_CONFIRMED',`Goal coverage is ${coverage.coverage_status}; the user must confirm the complete current Outcome set.`));
      if (runtime?.paths.worktree_id!==outcomeRegistry.integration_worktree_id) issues.push(error('INTEGRATION_WORKTREE_REQUIRED',`Goal closure is restricted to integration worktree ${outcomeRegistry.integration_worktree_id??'not-designated'}.`));
      try {
        const audit=await auditCoverageSources(context,outcomeRegistry);
        for (const item of audit.issues) issues.push(error(item.code,`Coverage source ${item.source_id} failed exact source-ID audit.`));
      } catch (cause) { issues.push(error(cause.code??'COVERAGE_AUDIT_FAILED',cause.message)); }
      if (!outcomeProgress) issues.push(error('OUTCOME_PROGRESS_MISSING','Goal completion requires the verified per-worktree Outcome progress ledger.'));
      else {
        const evaluated=await evaluateOutcomes('goal');
        remainingOutcomeIds=[...evaluated.remainingOutcomes].sort();
        remainingAcceptanceIds=[...evaluated.remainingAcceptance].sort();
        if (remainingOutcomeIds.length) issues.push(error('GOAL_OUTCOMES_INCOMPLETE',`Goal still has required Outcomes: ${remainingOutcomeIds.join(', ')}`));
      }
    }
    goalOk=sliceOk&&issues.length===goalIssueStart;
    if (goalOk) label='GOAL_ENGINEERING_CLOSED';
  } else if (outcomeRegistry&&outcomeProgress) {
    const summary=outcomeProgressSummary(outcomeRegistry,outcomeProgress);
    remainingOutcomeIds=summary.remaining_outcome_ids;
    remainingAcceptanceIds=[...new Set(summary.missing_acceptance_ids)].sort();
  }

  if (atLeast(effectiveBoundary,'release')) {
    const releaseIssueStart=issues.length;
    if (outcomeRegistry&&outcomeProgress) {
      const evaluated=await evaluateOutcomes('release');
      remainingOutcomeIds=[...evaluated.remainingOutcomes].sort();
      remainingAcceptanceIds=[...evaluated.remainingAcceptance].sort();
      const releaseAcceptances=evaluated.required.flatMap((outcome)=>outcome.acceptance.map((acceptance)=>({outcome,acceptance,entry:outcomeProgress.outcomes[outcome.id]})));
      const unprovenIds=new Set(unprovenMaturity.map((item)=>item.acceptance_id));
      const milestone=(requiredMaturity)=>{
        const declared=releaseAcceptances.filter(({acceptance})=>acceptance.required_maturity===requiredMaturity);
        return {
          declared:declared.length>0,
          current:declared.length>0&&declared.every(({acceptance,entry})=>entry?.satisfied_acceptance_ids?.includes(acceptance.id)&&!unprovenIds.has(acceptance.id)),
        };
      };
      const external=milestone('external');
      const reviewed=milestone('reviewed');
      const ownerAccepted=milestone('owner-accepted');
      if (goalOk&&external.declared&&external.current) label='EXTERNAL_EVIDENCE_VERIFIED';
      if (goalOk&&reviewed.declared&&(!external.declared||external.current)&&reviewed.current) label='REVIEW_DISPOSITION_RECORDED';
      if (goalOk&&ownerAccepted.declared&&(!external.declared||external.current)&&(!reviewed.declared||reviewed.current)&&ownerAccepted.current) label='OWNER_ACCEPTED';
      const authorization=releaseAcceptances.find(({acceptance,entry})=>acceptance.validator.kind==='user-decision'&&acceptance.validator.decision_type==='release-authorization'&&entry?.satisfied_acceptance_ids?.includes(acceptance.id)&&!unprovenIds.has(acceptance.id));
      if (!authorization) issues.push(error('RELEASE_AUTHORIZATION_REQUIRED','Release completion requires an explicit user-grounded release-authorization acceptance receipt.'));
      const packageEvidence=releaseAcceptances.find(({acceptance,entry})=>acceptance.required_maturity==='release'&&['command','artifact','authority-adapter'].includes(acceptance.validator.kind)&&entry?.satisfied_acceptance_ids?.includes(acceptance.id)&&!unprovenIds.has(acceptance.id));
      if (!packageEvidence) issues.push(error('RELEASE_EVIDENCE_REQUIRED','Release completion requires current package, deployment, or equivalent release evidence.'));
      if (remainingOutcomeIds.length) issues.push(error('RELEASE_OUTCOMES_INCOMPLETE',`Release still has required Outcomes: ${remainingOutcomeIds.join(', ')}`));
    }
    if (!goalOk) issues.push(error('RELEASE_GOAL_NOT_CLOSED','Release completion requires the goal boundary to pass first.'));
    if (goalOk&&issues.length===releaseIssueStart) label='RELEASE_READY';
  }

  const report={ok:issues.length===0,schema_version:1,boundary:requestedBoundary,requested_boundary:requestedBoundary,effective_boundary:effectiveBoundary,project:context.root,execution_root:context.executionRoot,project_id:context.manifest.project_id,worktree_id:runtime?.paths.worktree_id??null,issues,warnings,completion:{label,remaining_outcome_ids:remainingOutcomeIds,remaining_acceptance_ids:remainingAcceptanceIds,unproven_maturity:unprovenMaturity},control_plane:areaSummary(issues,warnings)};
  if (!report.ok&&options.throw_on_error!==false) throw healthError(report,options.json===true);
  return report;
}
