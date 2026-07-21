import { randomUUID } from 'node:crypto';
import { mkdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { conflictError } from './errors.mjs';
import { atomicJson, boundedText, readJsonFile, withFileLock } from './files.mjs';
import { executionSnapshot, gitCheckIgnored, gitIdentity, gitListWorktrees, runGit, sameRepository } from './git.mjs';
import { discoverContract, loadContract, repositoryRegistryPath } from './contract.mjs';
import { ensureRuntime, loadEvidence, readReceipt, readRoute, runtimePaths, writeReceipt } from './runtime.mjs';
import { stateHome } from './paths.mjs';
import { authoritySnapshot, parseTruthMap } from './truth.mjs';

function registryLock(commonId) { return path.join(stateHome(),'repositories',`.${commonId}.lock`); }

async function updateRegistry(context,paths,identity) {
  if (!identity) return;
  const target=repositoryRegistryPath(identity.common_id);
  await mkdir(path.dirname(target),{recursive:true});
  await withFileLock(registryLock(identity.common_id),async()=>{
    const prior=await readJsonFile(target,'Repository registry',{allowMissing:true})??{
      schema_version:1,repository_id:identity.common_id,common_dir:identity.common_dir,common_locators:[identity.common_dir],project_ids:[],contract_roots:[],worktrees:[],
    };
    if (prior.repository_id && prior.repository_id!==identity.common_id) throw conflictError('Repository registry identity mismatch.','RUNTIME_IDENTITY');
    const worktree={id:paths.worktree_id,path:identity.worktree_root,git_dir:identity.git_dir,attached_at:new Date().toISOString()};
    const next={
      ...prior,
      repository_id:identity.common_id,
      common_dir:identity.common_dir,
      common_locators:[...new Set([...(prior.common_locators??[]),prior.common_dir,identity.common_dir].filter(Boolean))],
      project_ids:[...new Set([...(prior.project_ids??[]),context.manifest.project_id])],
      contract_roots:context.tracked?[...new Set([...(prior.contract_roots??[]),context.root])]:prior.contract_roots??[],
      worktrees:[...(prior.worktrees??[]).filter((item)=>item.id!==worktree.id),worktree].sort((a,b)=>a.path.localeCompare(b.path)),
      updated_at:new Date().toISOString(),
    };
    await atomicJson(target,next);
  });
}

export async function attachWorktree(context,authorityDigest) {
  const identity=await gitIdentity(context.executionRoot);
  if (identity && context.tracked) {
    const contractIdentity=await gitIdentity(context.root);
    if (contractIdentity && contractIdentity.common_id!==identity.common_id) throw conflictError('Execution worktree belongs to a different Git repository than the Contract.','WORKTREE_REPOSITORY_MISMATCH');
  }
  const runtime=await ensureRuntime(context,identity,authorityDigest);
  await updateRegistry(context,runtime.paths,identity);
  return {...runtime,identity};
}

export async function attachFromDirectory(project=process.cwd(),contractRoot=null) {
  let context;
  if (contractRoot) {
    const loaded=await loadContract(contractRoot);
    const executionRoot=(await gitIdentity(project))?.worktree_root??await realpath(project);
    if (await gitIdentity(project) && !await sameRepository(project,contractRoot)) throw conflictError('Contract root and worktree are not from the same Git repository.','WORKTREE_REPOSITORY_MISMATCH');
    context={...loaded,executionRoot,tracked:true,shared:true};
  } else context=await discoverContract(project);
  const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  return {project_id:context.manifest.project_id,worktree_id:runtime.paths.worktree_id,clone_id:runtime.paths.clone_id,path:context.executionRoot,runtime:runtime.paths.worktree};
}

export async function listAttachedWorktrees(project=process.cwd()) {
  const context=await discoverContract(project);
  const identity=await gitIdentity(context.executionRoot);
  if (!identity) return [{id:runtimePaths(context,null).worktree_id,path:context.executionRoot,git:false}];
  const registry=await readJsonFile(repositoryRegistryPath(identity.common_id),'Repository registry',{allowMissing:true});
  const live=new Map();
  for (const item of await gitListWorktrees(identity.worktree_root)) {
    try {
      const candidate=await gitIdentity(item.path);
      if (candidate?.common_id===identity.common_id) live.set(candidate.worktree_id,item);
    } catch {
      // A prunable or temporarily unavailable worktree remains reported as not live.
    }
  }
  return (registry?.worktrees??[]).map((item)=>({...item,live:live.has(item.id),git:live.get(item.id)??null}));
}

export async function createWorktree({project=process.cwd(),target,branch,startPoint=null}={}) {
  if (!target||!branch) throw conflictError('Worktree create requires target and branch.','INVALID_WORKTREE');
  const context=await discoverContract(project);
  const identity=await gitIdentity(context.executionRoot);
  if (!identity) throw conflictError('Worktree creation requires a Git repository.','GIT_REQUIRED');
  const targetAbsolute=path.resolve(context.executionRoot,target);
  const relative=path.relative(identity.worktree_root,targetAbsolute).replaceAll('\\','/');
  if (!relative.startsWith('..')&&!path.isAbsolute(relative)) {
    const top=relative.split('/')[0];
    if (!await gitCheckIgnored(identity.worktree_root,relative)) throw conflictError(`Project-local worktree directory must be ignored by Git: ${top}`,'WORKTREE_NOT_IGNORED');
  }
  const args=['worktree','add',targetAbsolute,'-b',branch];
  if (startPoint) args.push(startPoint);
  await runGit(identity.worktree_root,args);
  try { return await attachFromDirectory(targetAbsolute); }
  catch (error) { await runGit(identity.worktree_root,['worktree','remove','--force',targetAbsolute],{allowExit:[128]}).catch(()=>{}); throw error; }
}

async function removeRegistryWorktree(identity,worktreeId) {
  const target=repositoryRegistryPath(identity.common_id);
  await withFileLock(registryLock(identity.common_id),async()=>{
    const prior=await readJsonFile(target,'Repository registry',{allowMissing:true});
    if (!prior) return;
    prior.worktrees=(prior.worktrees??[]).filter((item)=>item.id!==worktreeId);
    prior.updated_at=new Date().toISOString();
    await atomicJson(target,prior);
  });
}

export async function removeWorktree({project=process.cwd(),target,force=false}={}) {
  const context=await discoverContract(project);
  const identity=await gitIdentity(context.executionRoot);
  if (!identity) throw conflictError('Worktree removal requires a Git repository.','GIT_REQUIRED');
  const targetIdentity=await gitIdentity(target);
  if (!targetIdentity||targetIdentity.common_id!==identity.common_id) throw conflictError('Target is not a worktree of this repository.','WORKTREE_REPOSITORY_MISMATCH');
  const targetContext=await discoverContract(target);
  const targetPaths=runtimePaths(targetContext,targetIdentity);
  const route=await readRoute(targetPaths,{allowMissing:true});
  if (route?.status==='active'&&!force) throw conflictError('Cannot remove a worktree with an active VibeTether step.','ACTIVE_STEP');
  await runGit(identity.worktree_root,['worktree','remove',...(force?['--force']:[]),targetIdentity.worktree_root]);
  await rm(targetPaths.worktree,{recursive:true,force:true});
  await removeRegistryWorktree(identity,targetPaths.worktree_id);
  return {status:'removed',path:targetIdentity.worktree_root,worktree_id:targetPaths.worktree_id};
}

export async function pruneWorktrees(project=process.cwd(),runtimeHooks={}) {
  const context=await discoverContract(project);
  const identity=await gitIdentity(context.executionRoot);
  if (!identity) return {pruned:[],quarantined:[]};
  await runGit(identity.worktree_root,['worktree','prune']);
  const registry=await readJsonFile(repositoryRegistryPath(identity.common_id),'Repository registry',{allowMissing:true});
  if (!registry) return {pruned:[],quarantined:[]};
  const listWorktrees=runtimeHooks.gitListWorktrees??gitListWorktrees;
  const identify=runtimeHooks.gitIdentity??gitIdentity;
  const live=new Set();
  const inspectionFailures=[];
  for (const item of await listWorktrees(identity.worktree_root)) {
    try {
      const candidate=await identify(item.path);
      if (candidate?.common_id===identity.common_id) live.add(candidate.worktree_id);
    } catch (cause) {
      inspectionFailures.push({path:item.path,reason:String(cause.message??cause)});
    }
  }
  const stale=(registry.worktrees??[]).filter((item)=>!live.has(item.id));
  if (inspectionFailures.length) {
    const quarantinedAt=new Date().toISOString();
    const staleIds=new Set(stale.map((item)=>item.id));
    registry.worktrees=(registry.worktrees??[]).map((item)=>staleIds.has(item.id)?{
      ...item,quarantined_at:quarantinedAt,quarantine_reason:'Git reported a worktree that could not be inspected; runtime bytes were preserved.',
    }:item);
    registry.updated_at=quarantinedAt;
    await atomicJson(repositoryRegistryPath(identity.common_id),registry);
    return {pruned:[],quarantined:[...staleIds],inspection_failures:inspectionFailures};
  }
  for (const item of stale) {
    const p=path.join(stateHome(),'projects',context.manifest.project_id,identity.common_id,'worktrees',item.id);
    await rm(p,{recursive:true,force:true});
  }
  registry.worktrees=(registry.worktrees??[]).filter((item)=>live.has(item.id));
  registry.updated_at=new Date().toISOString();
  await atomicJson(repositoryRegistryPath(identity.common_id),registry);
  return {pruned:stale.map((item)=>item.id),quarantined:[]};
}

function handoffPath(paths,id) { return path.join(paths.handoffs,`${id}.json`); }
export async function createHandoff(context,paths,options) {
  const route=await readRoute(paths,{allowMissing:true});
  if (!route||route.status!=='active') throw conflictError('Handoff creation requires an active step.','ACTIVE_STEP_REQUIRED');
  const id=`task-${randomUUID()}`;
  const snapshot=await executionSnapshot(context.executionRoot);
  const capsule={
    schema_version:1,id,status:'pending',parent_route_id:route.id,project_id:context.manifest.project_id,
    authority_digest:route.authority_start,control_generation:context.manifest.control_generation,
    base_commit:snapshot.git.head??null,slice:boundedText(options.slice,1000,'Handoff slice'),
    success_evidence:(options.success_evidence??[]).map((item)=>boundedText(item,500,'Handoff success evidence')),
    protected_capabilities:(options.protected_capabilities??[]).map((item)=>boundedText(item,300,'Protected capability')),
    permissions:options.permissions??{code_write:false,truth_write:false},created_at:new Date().toISOString(),
    accepted_by:null,completed_at:null,evidence_ids:[],
  };
  if (!capsule.success_evidence.length) throw conflictError('Handoff requires success evidence.','INVALID_HANDOFF');
  await writeReceipt(handoffPath(paths,id),capsule);
  return capsule;
}

export async function acceptHandoff(context,paths,id) {
  const lock=`${handoffPath(paths,id)}.lock`;
  return withFileLock(lock,async()=>{
    const capsule=await readReceipt(handoffPath(paths,id),'Handoff capsule');
    if (capsule.status!=='pending') throw conflictError('Handoff capsule is no longer pending.','HANDOFF_STATE');
    const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
    if (authority.authority_digest!==capsule.authority_digest||context.manifest.control_generation!==capsule.control_generation) throw conflictError('Handoff authority or control generation is stale.','HANDOFF_STALE');
    const next={...capsule,status:'accepted',accepted_by:paths.worktree_id,accepted_at:new Date().toISOString()};
    await writeReceipt(handoffPath(paths,id),next); return next;
  });
}

export async function finishHandoff(paths,id,evidenceIds) {
  const lock=`${handoffPath(paths,id)}.lock`;
  return withFileLock(lock,async()=>{
    const capsule=await readReceipt(handoffPath(paths,id),'Handoff capsule');
    if (capsule.status!=='accepted'||capsule.accepted_by!==paths.worktree_id) throw conflictError('Handoff is not accepted by this worktree.','HANDOFF_STATE');
    if (!Array.isArray(evidenceIds)||!evidenceIds.length) throw conflictError('Handoff completion requires evidence receipts.','INVALID_EVIDENCE');
    for (const idValue of evidenceIds) { const record=await loadEvidence(paths,idValue); if (!record.successful||record.kind==='assertion') throw conflictError('Handoff requires successful command or artifact evidence.','INVALID_EVIDENCE'); }
    const next={...capsule,status:'completed',completed_at:new Date().toISOString(),evidence_ids:[...new Set(evidenceIds)]};
    await writeReceipt(handoffPath(paths,id),next); return next;
  });
}
