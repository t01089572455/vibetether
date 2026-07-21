import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { conflictError } from './errors.mjs';
import {
  assertSafeId, boundedText, containsSecret, readRegularFileChunk,
  rejectAbsoluteSymlinkChain, resolveInside,
} from './files.mjs';
import { loadProviderRegistry } from './provider-registry.mjs';
import { readProviderCard, updateProviderCard } from './provider-cache.mjs';
import { activationMaterializationPath, loadProviderStats, readReceipt, readRoute, writeReceipt } from './runtime.mjs';
import { ADAPTERS } from './adapters.mjs';
import { materializeProviderClosure, verifyProviderSource } from './provider-integrity.mjs';

function activationPath(paths,id) { return path.join(paths.activations,`${id}.json`); }
function activationRoot(paths,id) { return activationMaterializationPath(paths,id); }
async function providerById(id) {
  const registry=await loadProviderRegistry();
  const provider=registry.providers.find((item)=>item.id===id);
  if (!provider) throw conflictError(`Provider not found: ${id}`,'PROVIDER_NOT_FOUND');
  return provider;
}

export async function searchSkills(query='') {
  const registry=await loadProviderRegistry();
  const terms=String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return registry.providers
    .map((provider)=>{
      const haystack=[provider.id,provider.description,...provider.capabilities,...provider.positive_triggers].join(' ').toLowerCase();
      const score=terms.reduce((sum,term)=>sum+(haystack.includes(term)?1:0),0);
      return {provider,score};
    })
    .filter((item)=>!terms.length||item.score>0)
    .sort((a,b)=>b.score-a.score||a.provider.id.localeCompare(b.provider.id))
    .slice(0,50)
    .map(({provider})=>({id:provider.id,channel:provider.channel,builtin:provider.builtin,packs:provider.packs,description:provider.description,capabilities:provider.capabilities,context_bytes:provider.context_bytes}));
}

export async function inspectSkill(id) {
  const provider=await providerById(assertSafeId(id,'Provider id'));
  const {resolved_path,...safe}=provider;
  return {...safe,cache_path:resolved_path};
}

export async function evaluateProvider(id,{true_positive=0,false_positive=0,false_negative=0,output_gain=0,notes=''}={}) {
  for (const [label,value] of Object.entries({true_positive,false_positive,false_negative})) if (!Number.isInteger(value)||value<0) throw conflictError(`${label} must be a non-negative integer.`,'INVALID_EVALUATION');
  if (typeof output_gain!=='number'||output_gain<-1||output_gain>10) throw conflictError('output_gain is invalid.','INVALID_EVALUATION');
  const precision=true_positive+false_positive===0?0:true_positive/(true_positive+false_positive);
  const recall=true_positive+false_negative===0?0:true_positive/(true_positive+false_negative);
  return updateProviderCard(id,(card)=>({
    ...card,
    quality:{trigger_precision:precision,trigger_recall:recall,output_gain,evaluated_at:new Date().toISOString()},
    evaluation:{true_positive,false_positive,false_negative,notes:boundedText(notes||'No notes.',1000,'Evaluation notes')},
  }));
}

function promotable(card) {
  const q=card.quality;
  return q.trigger_precision>=0.8&&q.trigger_recall>=0.8&&q.output_gain>0&&Date.now()-Date.parse(q.evaluated_at)<180*24*60*60*1000;
}
export async function approveProvider(id) {
  return updateProviderCard(id,(card)=>{
    if (card.builtin) throw conflictError('Built-in Providers are release-managed.','INVALID_PROVIDER_STATE');
    if (!promotable(card)) throw conflictError('Provider must pass current trigger and output evaluations before beta approval.','EVALUATION_REQUIRED');
    if (!['experimental','suspect'].includes(card.channel)) throw conflictError('Provider is not eligible for beta approval.','INVALID_PROVIDER_STATE');
    return {...card,channel:'beta'};
  });
}
export async function promoteProvider(id) {
  return updateProviderCard(id,(card)=>{
    if (!promotable(card)) throw conflictError('Provider must pass current evaluations before stable promotion.','EVALUATION_REQUIRED');
    if (card.channel!=='beta') throw conflictError('Only beta Providers can be promoted to stable.','INVALID_PROVIDER_STATE');
    return {...card,channel:'stable'};
  });
}

export async function activateSkill(context,paths,route) {
  const provider=await providerById(route.selected.id);
  if (provider.fingerprint!==route.selected.fingerprint||provider.object_hash!==route.selected.object_hash) throw conflictError('Selected Provider identity changed before activation.','PROVIDER_FINGERPRINT');
  const id=`act-${randomUUID()}`;
  const materializedRoot=activationRoot(paths,id);
  await materializeProviderClosure(provider,materializedRoot);
  const skillPath=path.join(materializedRoot,'SKILL.md');
  await rejectAbsoluteSymlinkChain(skillPath,{allowMissing:false});
  const instructions=await readFile(skillPath,'utf8');
  const envelope={
    provider:provider.id,capability:route.capability,phase:route.phase,slice:route.slice,
    authority_digest:route.authority_start,allowed_permissions:route.permissions,
    prohibited:['change project direction','activate project truth','broaden the approved slice','merge, deploy, release, or publish without authorization'],
    required_outputs:route.required_outputs,exit_evidence:route.exit_evidence,
  };
  let receipt;
  try {
    receipt=await writeReceipt(activationPath(paths,id),{
      schema_version:1,id,provider_id:provider.id,provider_fingerprint:provider.fingerprint,
      provider_object_hash:provider.object_hash,provider_content_sha256:provider.fingerprint,
      materialized_key:path.basename(materializedRoot),route_id:route.id,authority_digest:route.authority_start,
      created_at:new Date().toISOString(),expires_at:new Date(Date.now()+30*60*1000).toISOString(),scope_envelope:envelope,
    });
  } catch (error) {
    await rm(materializedRoot,{recursive:true,force:true}).catch(()=>{});
    throw error;
  }
  return {
    activation_id:id,
    receipt_digest:receipt.digest,
    provider:{id:provider.id,version:provider.version,channel:provider.channel,fingerprint:provider.fingerprint},
    scope_envelope:envelope,
    mode:provider.worker_recommended||Buffer.byteLength(instructions,'utf8')>16*1024?'worker':'inline',
    instructions:provider.worker_recommended||Buffer.byteLength(instructions,'utf8')>16*1024?null:instructions,
    materialized_root:materializedRoot,
    skill_handle:`skill:${id}:entry`,
    resources:provider.resources.map((item)=>`skill:${id}:resource:${item}`),
  };
}

export async function loadActivation(paths,id) {
  if (typeof id!=='string'||!/^act-[0-9a-f-]+$/.test(id)) throw conflictError('Activation id is invalid.','INVALID_ACTIVATION');
  try { return await readReceipt(activationPath(paths,id),'Activation receipt'); }
  catch (error) {
    if (error.code==='MISSING_FILE') throw conflictError('Provider activation is no longer attached to an active step.','INVALID_ACTIVATION');
    throw error;
  }
}

async function requireActiveActivation(paths,receipt) {
  if (!receipt.expires_at || Date.parse(receipt.expires_at)<=Date.now()) throw conflictError('Provider activation expired.','INVALID_ACTIVATION');
  const route=await readRoute(paths,{allowMissing:true});
  if (!route||route.status!=='active'||route.id!==receipt.route_id||route.activation_id!==receipt.id) {
    throw conflictError('Provider activation is no longer attached to the active step.','INVALID_ACTIVATION');
  }
  if (route.authority_start!==receipt.authority_digest) throw conflictError('Provider activation authority no longer matches the active step.','INVALID_ACTIVATION');
  return route;
}
export async function removeActivation(paths,id) {
  await Promise.all([
    rm(activationPath(paths,id),{force:true}),
    rm(activationRoot(paths,id),{recursive:true,force:true}),
  ]);
}

async function materializedProvider(paths,receipt,provider) {
  if (provider.fingerprint!==receipt.provider_fingerprint||provider.object_hash!==receipt.provider_object_hash) throw conflictError('Activated Provider no longer matches its receipt.','PROVIDER_FINGERPRINT');
  if (receipt.materialized_key!==path.basename(activationRoot(paths,receipt.id))||receipt.provider_content_sha256!==provider.fingerprint) throw conflictError('Activated Provider materialization receipt is invalid.','PROVIDER_FINGERPRINT');
  const root=activationRoot(paths,receipt.id);
  await verifyProviderSource({...provider,resolved_path:root});
  return root;
}

export async function readSkillResource(paths,id,resource,{offset=0,limit=8192}={}) {
  const receipt=await loadActivation(paths,id);
  await requireActiveActivation(paths,receipt);
  const provider=await providerById(receipt.provider_id);
  const root=await materializedProvider(paths,receipt,provider);
  const requested=resource==='entry'?'SKILL.md':resource;
  if (requested!=='SKILL.md'&&!provider.resources.includes(requested)) throw conflictError('Resource was not declared by the activated Provider.','UNSAFE_RESOURCE');
  const target=resolveInside(root,requested,'Provider resource');
  return {provider_id:provider.id,resource:requested,...await readRegularFileChunk(target,{offset,limit})};
}

export async function execSkillScript(paths,id,script,args=[]) {
  const receipt=await loadActivation(paths,id);
  await requireActiveActivation(paths,receipt);
  const provider=await providerById(receipt.provider_id);
  const root=await materializedProvider(paths,receipt,provider);
  if (!provider.scripts.includes(script)) throw conflictError('Script was not declared by the activated Provider.','UNSAFE_RESOURCE');
  if (!Array.isArray(args)||args.some((item)=>typeof item!=='string'||containsSecret(item))) throw conflictError('Script arguments must be non-secret strings.','INVALID_VALUE');
  const target=resolveInside(root,script,'Provider script');
  await rejectAbsoluteSymlinkChain(target,{allowMissing:false});
  const ext=path.extname(target).toLowerCase();
  let command;
  if (['.mjs','.js','.cjs'].includes(ext)) command=[process.execPath,target,...args];
  else if (ext==='.py') command=[process.platform==='win32'?'python':'python3',target,...args];
  else if (ext==='.sh'&&process.platform!=='win32') command=['sh',target,...args];
  else command=[target,...args];
  const allowedEnv={};
  for (const key of ['PATH','HOME','USERPROFILE','TMPDIR','TEMP','TMP','SystemRoot','ComSpec','PATHEXT']) {
    if (typeof process.env[key]==='string') allowedEnv[key]=process.env[key];
  }
  const result=spawnSync(command[0],command.slice(1),{cwd:root,encoding:'utf8',shell:false,windowsHide:true,maxBuffer:8*1024*1024,env:allowedEnv});
  return {provider_id:provider.id,script,exit_code:typeof result.status==='number'?result.status:null,stdout:String(result.stdout??'').slice(0,16384),stderr:String(result.stderr??'').slice(0,16384),error:result.error?String(result.error.message):null};
}

function userSkillRoot(agent) {
  const relative=ADAPTERS[agent]?.userSkillRoot;
  if (!relative) throw conflictError('Agent must be codex or claude.','INVALID_AGENT');
  return path.join(os.homedir(),relative);
}
export async function exposeProvider(context,providerId,{agent='codex',scope='user'}={}) {
  const provider=await providerById(providerId);
  const root=scope==='project'?path.join(context.executionRoot,path.dirname(ADAPTERS[agent].skill)):userSkillRoot(agent);
  const exposedRoot=path.join(root,provider.id);
  await materializeProviderClosure(provider,exposedRoot);
  const target=path.join(exposedRoot,'SKILL.md');
  return {provider_id:provider.id,agent,scope,path:target};
}

export async function providerHotset(lock) { return lock.hotset.map((id)=>({id})); }
export async function optimizeSkills(paths,lock) {
  const stats=await loadProviderStats(paths);
  const suggestions=[];
  for (const [id,item] of Object.entries(stats)) {
    if ((item.failures??0)>=2) suggestions.push({provider:id,action:'disable-or-reevaluate',reason:`${item.failures} recorded failures`});
    else if ((item.successes??0)>=3&&!lock.preferences.includes(id)) suggestions.push({provider:id,action:'prefer',reason:`${item.successes} recorded successes`});
  }
  return {schema_version:1,suggestions};
}
