import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  CURRENT_BUDGET_BYTES, JOURNAL_MAX_BYTES, LEASE_TTL_MS, OUTPUT_TEXT_LIMIT, SCHEMA_VERSION,
} from './constants.mjs';
import { conflictError } from './errors.mjs';
import {
  appendBounded, atomicJson, boundedText, breakFileLock, canonicalJson, containsSecret, readJsonFile,
  rejectAbsoluteSymlinkChain, sha256File, sha256Text, transactionalWrites, withFileLock,
} from './files.mjs';
import { executionSnapshot, snapshotsMatch, snapshotsMatchIgnoringPaths } from './git.mjs';
import { stateHome } from './paths.mjs';

const CURRENT_KEYS = new Set([
  'schema_version','project_id','clone_id','worktree_id','goal','phase','slice','authority_digest',
  'control_generation','route_instance_id','next_action','open_risks','evidence_ids','updated_at','status',
  'task_mode','deep_start_card_id','implementation_permit_id',
  'outcome_ids','outcome_registry_digest',
]);
const ROUTE_STATUSES = new Set(['active','satisfied','abandoned','broken']);

function only(value, allowed, label) { for (const key of Object.keys(value)) if (!allowed.has(key)) throw conflictError(`${label} contains unsupported field: ${key}`, 'INVALID_RUNTIME'); }
function hashId(value) { return sha256Text(value).slice(0,24); }

export function runtimePaths(context, identity = null) {
  const cloneId = identity?.common_id ?? hashId(path.resolve(context.executionRoot));
  const worktreeId = identity?.worktree_id ?? hashId(path.resolve(context.executionRoot));
  const repository = path.join(stateHome(), 'projects', context.manifest.project_id, cloneId);
  const worktree = path.join(repository, 'worktrees', worktreeId);
  return {
    project_id: context.manifest.project_id,
    clone_id: cloneId,
    worktree_id: worktreeId,
    repository,
    worktree,
    current: path.join(worktree, 'current.json'),
    route: path.join(worktree, 'route.json'),
    lease: path.join(worktree, 'lease.json'),
    journal: path.join(worktree, 'journal.ndjson'),
    evidence: path.join(worktree, 'evidence'),
    decisions: path.join(worktree, 'decisions'),
    repository_evidence: path.join(repository, 'evidence'),
    activations: path.join(worktree, 'activations'),
    experience_health: path.join(worktree, 'experience-health.json'),
    quarantine: path.join(worktree, 'quarantine'),
    handoffs: path.join(repository, 'handoffs'),
    provider_stats: path.join(repository, 'provider-stats.json'),
    deep: path.join(worktree, 'deep.json'),
    outcome_progress: path.join(worktree, 'outcome-progress.json'),
    registry: path.join(repository, 'repository.json'),
  };
}

export function activationMaterializationPath(paths, id) {
  const key = sha256Text(`${paths.project_id}\0${paths.clone_id}\0${paths.worktree_id}\0${id}`).slice(0, 32);
  return path.join(stateHome(), 'activations', key);
}

export function initialCurrent(context, paths, authorityDigest) {
  return {
    schema_version: SCHEMA_VERSION,
    project_id: context.manifest.project_id,
    clone_id: paths.clone_id,
    worktree_id: paths.worktree_id,
    goal: 'Resolve the approved goal from the Intent Contract.',
    phase: 'DISCOVER',
    slice: 'Confirm goal and success evidence before consequential work.',
    authority_digest: authorityDigest,
    control_generation: context.manifest.control_generation,
    route_instance_id: null,
    task_mode: 'adaptive',
    deep_start_card_id: null,
    implementation_permit_id: null,
    outcome_ids: [],
    outcome_registry_digest: null,
    next_action: 'Run `vibetether context --boundary task-entry --json`.',
    open_risks: [],
    evidence_ids: [],
    updated_at: new Date().toISOString(),
    status: 'ready',
  };
}

export function validateCurrent(current) {
  if (!current || typeof current !== 'object' || Array.isArray(current)) throw conflictError('Runtime checkpoint must be an object.', 'INVALID_RUNTIME');
  only(current, CURRENT_KEYS, 'Runtime checkpoint');
  if (current.schema_version !== SCHEMA_VERSION) throw conflictError('Runtime checkpoint schema is unsupported.', 'INVALID_RUNTIME');
  for (const field of ['project_id','clone_id','worktree_id','goal','phase','slice','authority_digest','control_generation','next_action','updated_at','status']) if (typeof current[field] !== 'string' || !current[field]) throw conflictError(`Runtime checkpoint ${field} is invalid.`, 'INVALID_RUNTIME');
  if (!['adaptive','deep'].includes(current.task_mode)) throw conflictError('Runtime checkpoint task_mode is invalid.', 'INVALID_RUNTIME');
  for (const field of ['deep_start_card_id','implementation_permit_id']) if (current[field] !== null && typeof current[field] !== 'string') throw conflictError(`Runtime checkpoint ${field} is invalid.`, 'INVALID_RUNTIME');
  if (!Array.isArray(current.outcome_ids) || current.outcome_ids.some((item) => typeof item !== 'string')) throw conflictError('Runtime checkpoint outcome_ids is invalid.', 'INVALID_RUNTIME');
  if (current.outcome_registry_digest !== null && !/^sha256:[a-f0-9]{64}$/.test(current.outcome_registry_digest ?? '')) throw conflictError('Runtime checkpoint outcome_registry_digest is invalid.', 'INVALID_RUNTIME');
  if (!/^[a-f0-9]{64}$/.test(current.authority_digest)) throw conflictError('Runtime checkpoint authority_digest is invalid.', 'INVALID_RUNTIME');
  if (!Array.isArray(current.open_risks) || current.open_risks.length > 3 || current.open_risks.some((item) => typeof item !== 'string' || Buffer.byteLength(item,'utf8') > 500 || containsSecret(item))) throw conflictError('Runtime checkpoint open_risks is invalid.', 'INVALID_RUNTIME');
  if (!Array.isArray(current.evidence_ids) || current.evidence_ids.length > 8 || current.evidence_ids.some((item) => typeof item !== 'string')) throw conflictError('Runtime checkpoint evidence_ids is invalid.', 'INVALID_RUNTIME');
  const bytes = Buffer.byteLength(canonicalJson(current),'utf8');
  if (bytes > CURRENT_BUDGET_BYTES) throw conflictError(`Runtime checkpoint exceeds ${CURRENT_BUDGET_BYTES} bytes.`, 'RUNTIME_TOO_LARGE');
  return current;
}

export async function ensureRuntime(context, identity, authorityDigest) {
  const paths = runtimePaths(context, identity);
  await Promise.all([paths.worktree, paths.evidence, paths.repository_evidence, paths.activations, paths.quarantine, paths.handoffs].map((directory) => mkdir(directory,{recursive:true})));
  let current;
  try { current = validateCurrent(await readJsonFile(paths.current,'Runtime checkpoint')); }
  catch (error) {
    if (error.code === 'MISSING_FILE') {
      current = initialCurrent(context,paths,authorityDigest);
      await atomicJson(paths.current,current);
    } else {
      const source = await readFile(paths.current).catch(() => Buffer.from(''));
      const quarantined = path.join(paths.quarantine,`current-${Date.now()}-${sha256Text(source).slice(0,12)}.json`);
      await rename(paths.current,quarantined).catch(() => {});
      current = { ...initialCurrent(context,paths,authorityDigest), phase:'BLOCKED', status:'blocked', open_risks:['Previous runtime checkpoint was invalid and has been quarantined.'], next_action:'Inspect the quarantine report and re-anchor the task.' };
      await atomicJson(paths.current,current);
    }
  }
  if (current.project_id !== context.manifest.project_id || current.clone_id !== paths.clone_id || current.worktree_id !== paths.worktree_id) throw conflictError('Runtime checkpoint belongs to another project or worktree.', 'RUNTIME_IDENTITY');
  return { paths,current };
}

export async function readCurrent(paths) { return validateCurrent(await readJsonFile(paths.current,'Runtime checkpoint')); }
export async function readRoute(paths,{allowMissing=false}={}) {
  const route = await readJsonFile(paths.route,'Route state',{allowMissing});
  if (route === null) return null;
  if (!route || typeof route !== 'object' || route.schema_version !== 1 || typeof route.id !== 'string' || !ROUTE_STATUSES.has(route.status)) throw conflictError('Route state is invalid.', 'INVALID_RUNTIME');
  return route;
}
export async function writeCurrentProjection(paths,current) { validateCurrent(current); await atomicJson(paths.current,current); return current; }

export async function writeStepState(paths,route,current) {
  validateCurrent(current);
  await transactionalWrites([
    { target: paths.route, content: canonicalJson(route), mode:0o600 },
    { target: paths.current, content: canonicalJson(current), mode:0o600 },
  ]);
}

export async function withWorktreeStateLock(paths, operation) {
  return withFileLock(path.join(paths.worktree, '.state-lock'), operation, { staleMs: 120_000, retries: 250, delayMs: 20 });
}

export async function appendRuntimeEvent(paths,event) {
  if (containsSecret(event)) throw conflictError('Runtime event appears to contain a secret.', 'SECRET_VALUE');
  await appendBounded(paths.journal,JSON.stringify({schema_version:1,at:new Date().toISOString(),...event}),JOURNAL_MAX_BYTES);
}
export async function readJournal(paths) {
  try { return (await readFile(paths.journal,'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw conflictError('Runtime journal is invalid.', 'INVALID_RUNTIME'); }
}

async function leaseRecord(paths) {
  return readJsonFile(paths.lease,'Worktree lease',{allowMissing:true});
}
export async function acquireLease(paths,owner,{ttlMs=LEASE_TTL_MS}={}) {
  const record = { schema_version:1, id:`lease-${randomUUID()}`, generation:1, owner, pid:process.pid, acquired_at:new Date().toISOString(), expires_at:new Date(Date.now()+ttlMs).toISOString() };
  await mkdir(path.dirname(paths.lease),{recursive:true});
  for (let attempt=0;attempt<2;attempt+=1) {
    try {
      const handle=await open(paths.lease,'wx',0o600);
      try { await handle.writeFile(canonicalJson(record),'utf8'); await handle.sync(); } finally { await handle.close(); }
      return record;
    } catch (error) {
      if (error.code!=='EEXIST') throw error;
      const prior=await leaseRecord(paths);
      if (prior && Date.parse(prior.expires_at)>Date.now()) throw conflictError(`Worktree already has an active writer lease owned by ${prior.owner}.`,'WORKTREE_LEASED');
      await rm(paths.lease,{force:true});
    }
  }
  throw conflictError('Unable to acquire worktree lease.','WORKTREE_LEASED');
}
export async function renewLease(paths,owner,{ttlMs=LEASE_TTL_MS}={}) {
  const prior=await leaseRecord(paths);
  if (!prior || prior.owner!==owner) throw conflictError('Writer lease does not belong to this route.','LEASE_MISMATCH');
  const next={...prior,id:prior.id??`lease-${randomUUID()}`,generation:Number.isInteger(prior.generation)?prior.generation+1:1,pid:process.pid,expires_at:new Date(Date.now()+ttlMs).toISOString()};
  await atomicJson(paths.lease,next); return next;
}
export async function releaseLease(paths,owner) {
  const prior=await leaseRecord(paths);
  if (prior && prior.owner!==owner) throw conflictError('Writer lease belongs to another route.','LEASE_MISMATCH');
  await rm(paths.lease,{force:true});
}
async function breakLeaseUnlocked(paths, reason='Writer lease was explicitly broken for recovery.') {
  const route=await readRoute(paths,{allowMissing:true});
  if (route?.status==='active') {
    const current=await readCurrent(paths);
    const boundedReason=boundedText(reason,500,'Lease-break reason');
    const activationId=route.activation_id;
    route.status='broken';
    route.generation=(route.generation??1)+1;
    route.abandonment_reason=boundedReason;
    route.updated_at=new Date().toISOString();
    route.execution_end=null;
    route.invalidated_activation_id=activationId??null;
    route.activation_id=null;
    if (route.implementation_permit_id) {
      try {
        const deep=await readReceipt(paths.deep,'Deep-mode state');
        if (deep.permit?.id===route.implementation_permit_id&&deep.permit.status==='active') {
          const permit={...deep.permit,generation:(deep.permit.generation??1)+1,status:'invalidated',invalidated_at:new Date().toISOString(),invalidate_reason:boundedReason};
          await writeReceipt(paths.deep,{...deep,status:'permit-invalidated',permit,updated_at:new Date().toISOString()});
        }
      } catch (error) {
        if (error.code!=='MISSING_FILE') throw error;
      }
    }
    current.status='blocked';
    current.route_instance_id=route.id;
    current.implementation_permit_id=null;
    current.open_risks=[boundedReason];
    current.next_action='Review the interrupted step, then prepare and confirm a fresh bounded path.';
    current.updated_at=new Date().toISOString();
    await writeStepState(paths,route,current);
    if (activationId) await Promise.all([
      rm(path.join(paths.activations,`${activationId}.json`),{force:true}),
      rm(activationMaterializationPath(paths,activationId),{recursive:true,force:true}),
    ]);
    await appendRuntimeEvent(paths,{type:'lease-broken',route_id:route.id,permit_id:route.implementation_permit_id??null,reason:boundedReason});
  }
  await rm(paths.lease,{force:true});
  return route;
}
export async function breakLease(paths, reason='Writer lease was explicitly broken for recovery.') {
  return withWorktreeStateLock(paths,()=>breakLeaseUnlocked(paths,reason));
}
export async function breakWorktreeStateLock(paths, reason, { confirmed = false } = {}) {
  const boundedReason = boundedText(reason, 500, 'State-lock break reason');
  const broken = await breakFileLock(path.join(paths.worktree, '.state-lock'), {
    reason: boundedReason,
    confirmed,
    quarantineRoot: path.join(paths.quarantine, 'state-locks'),
  });
  if (broken.status === 'not-locked') return { ...broken, route_status: null, route_id: null };
  const route = await breakLease(paths, `State lock was explicitly broken for recovery: ${boundedReason}`);
  await appendRuntimeEvent(paths, {
    type: 'state-lock-broken',
    route_id: route?.id ?? null,
    lock_break_id: broken.id,
    quarantine: broken.quarantine,
    reason: boundedReason,
  });
  return { ...broken, route_status: route?.status ?? null, route_id: route?.id ?? null };
}
export async function inspectLease(paths) { return leaseRecord(paths); }

function receiptDigest(record) {
  const copy={...record}; delete copy.digest; return sha256Text(canonicalJson(copy));
}
export function sealReceipt(record) { return {...record,digest:receiptDigest(record)}; }
export async function writeReceipt(target,record) {
  if (containsSecret(record)) throw conflictError('Receipt appears to contain a secret.','SECRET_VALUE');
  const value=sealReceipt(record);
  await atomicJson(target,value); return value;
}
export async function readReceipt(target,label) {
  const value=await readJsonFile(target,label);
  if (!/^[a-f0-9]{64}$/.test(value.digest??'') || receiptDigest(value)!==value.digest) throw conflictError(`${label} was modified after creation.`,'RECEIPT_TAMPERED');
  return value;
}

function evidenceEnvironment(extra = {}) {
  const names = process.platform === 'win32'
    ? ['PATH','PATHEXT','SystemRoot','COMSPEC','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA']
    : ['PATH','HOME','TMPDIR','TEMP','TMP','LANG','LC_ALL','LC_CTYPE'];
  const env = {};
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value && !containsSecret(value)) env[name] = value;
  }
  for (const [name, value] of Object.entries(extra ?? {})) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name) || typeof value !== 'string' || containsSecret(value)) {
      throw conflictError(`Evidence environment variable is unsafe: ${name}`, 'INVALID_EVIDENCE_ENV');
    }
    env[name] = value;
  }
  env.VIBETETHER_EVIDENCE = '1';
  return env;
}

export async function recordEvidence(paths,options) {
  const id=`ev-${randomUUID()}`;
  const base={
    schema_version:1,id,route_id:options.route_id,kind:options.kind,
    check_id:options.check_id??null,claim:options.claim??null,covers_paths:[...(options.covers_paths??[])],
    authority_digest:options.authority_digest,skills_digest:options.skills_digest,
    created_at:new Date().toISOString(),execution_before:options.execution_snapshot,
  };
  let details;
  if (options.kind==='command') {
    if (!Array.isArray(options.command) || !options.command.length || options.command.some((item)=>typeof item!=='string'||!item||containsSecret(item))) throw conflictError('Evidence command must be a non-secret argument array.','INVALID_EVIDENCE');
    const result=spawnSync(options.command[0],options.command.slice(1),{
      cwd:options.cwd,encoding:'utf8',shell:false,windowsHide:true,maxBuffer:8*1024*1024,env:evidenceEnvironment(options.environment),
    });
    const stdout=String(result.stdout??''); const stderr=String(result.stderr??'');
    details={ command:options.command, exit_code:typeof result.status==='number'?result.status:null, signal:result.signal??null,
      stdout_sha256:sha256Text(stdout),stderr_sha256:sha256Text(stderr),
      stdout_summary:stdout.slice(0,OUTPUT_TEXT_LIMIT),stderr_summary:stderr.slice(0,OUTPUT_TEXT_LIMIT),
      spawn_error:result.error?String(result.error.message).slice(0,500):null };
  } else if (options.kind==='artifact') {
    const digest=await sha256File(options.artifact_target);
    details={artifact_path:options.artifact_path,artifact_sha256:digest};
  } else if (options.kind==='assertion') {
    details={summary:boundedText(options.summary,1000,'Evidence summary')};
  } else throw conflictError('Evidence kind is unsupported.','INVALID_EVIDENCE');
  const coverageArtifacts = [];
  for (const item of options.coverage_targets ?? []) {
    try {
      coverageArtifacts.push({ path:item.path, sha256:await sha256File(item.target), present:true });
    } catch (error) {
      if (error.code === 'ENOENT') coverageArtifacts.push({ path:item.path, sha256:null, present:false });
      else throw error;
    }
  }
  const executionAfter = await executionSnapshot(options.cwd);
  const successful=(options.kind==='command'?details.exit_code===0&&!details.spawn_error:true)
    && coverageArtifacts.every((item)=>item.present===true);
  const record=await writeReceipt(path.join(paths.evidence,`${id}.json`),{...base,...details,coverage_artifacts:coverageArtifacts,successful,execution_after:executionAfter,execution_snapshot:executionAfter});
  await writeReceipt(path.join(paths.repository_evidence,`${id}.json`),{...base,...details,coverage_artifacts:coverageArtifacts,successful,execution_after:executionAfter,execution_snapshot:executionAfter});
  await appendRuntimeEvent(paths,{type:'evidence-recorded',evidence_id:id,route_id:options.route_id,successful});
  return record;
}
export async function loadEvidence(paths,id) {
  if (typeof id!=='string'||!/^ev-[0-9a-f-]+$/.test(id)) throw conflictError('Evidence id is invalid.','INVALID_EVIDENCE');
  for (const directory of [paths.evidence,paths.repository_evidence]) {
    try { return await readReceipt(path.join(directory,`${id}.json`),'Evidence receipt'); }
    catch (error) { if (error.code!=='MISSING_FILE') throw error; }
  }
  throw conflictError(`Evidence receipt is missing: ${id}`,'MISSING_FILE');
}

export async function loadProviderStats(paths) {
  const value=await readJsonFile(paths.provider_stats,'Provider statistics',{allowMissing:true});
  return value?.providers??{};
}
export async function recordProviderOutcome(paths,providerId,successful) {
  const lock=`${paths.provider_stats}.lock`;
  return withFileLock(lock,async()=>{
    const prior=await readJsonFile(paths.provider_stats,'Provider statistics',{allowMissing:true})??{schema_version:1,providers:{}};
    const item=prior.providers[providerId]??{successes:0,failures:0,last_used_at:null};
    if (successful) item.successes+=1; else item.failures+=1;
    item.last_used_at=new Date().toISOString();
    prior.providers[providerId]=item;
    await atomicJson(paths.provider_stats,prior);
    return item;
  });
}

export function finalSnapshotMatches(route,currentSnapshot,ignoredPaths=[]) {
  return route?.execution_end ? snapshotsMatchIgnoringPaths(route.execution_end,currentSnapshot,ignoredPaths) : false;
}
