import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { VERSION } from './constants.mjs';
import { usageError, conflictError } from './errors.mjs';
import { initialize } from './init.mjs';
import { buildContext, readContextHandle } from './context.mjs';
import { startStep, finishStep, abandonStep, heartbeatStep, reanchorStep } from './step.mjs';
import { discoverContract, skillsLockDigest } from './contract.mjs';
import { parseTruthMap, renderTruthMap, addTruthCandidate, confirmTruthCandidate, declineTruthCandidate, authoritySnapshot } from './truth.mjs';
import { writeProjectJson, writeProjectText, normalizeSignal, readJsonFile } from './files.mjs';
import { breakLease, loadProviderStats, readRoute } from './runtime.mjs';
import { validateExperienceIndex, createExperienceCandidate, confirmExperience, updateExperienceStatus, auditExperience } from './experience.mjs';
import { attachFromDirectory, attachWorktree, listAttachedWorktrees, createWorktree, removeWorktree, pruneWorktrees, createHandoff, acceptHandoff, finishHandoff } from './worktree.mjs';
import { loadProviderRegistry } from './provider-registry.mjs';
import { importProvider } from './provider-cache.mjs';
import { activateSkill, approveProvider, evaluateProvider, execSkillScript, exposeProvider, inspectSkill, optimizeSkills, promoteProvider, providerHotset, readSkillResource, searchSkills } from './skills.mjs';
import { showCapabilities } from './capabilities.mjs';
import { inspectProject } from './doctor.mjs';
import { installGlobalEntry, uninstallGlobalEntry } from './global-entry.mjs';
import { migrate, planMigration, rollbackMigration } from './migrate.mjs';
import { planUpgrade, rollbackUpgrade, upgradeProject } from './upgrade.mjs';
import { bootstrap } from './bootstrap.mjs';
import { validateRoutes } from './routes.mjs';
import { brokerSkills } from './skill-broker.mjs';
import { uninstallProject } from './uninstall.mjs';
import { parseIntent } from './intent.mjs';
import { classifyTaskText } from './task-classifier.mjs';
import { answerDeepQuestion, grantDeepPermit, prepareDeep, readDeepState, revokeDeepPermit } from './deep.mjs';

const HELP=`VibeTether 1.0.0-rc.3 — long-task control kernel and cold Skill broker

Usage:
  vibetether init [--interactive] [--project PATH] [--agent codex|claude|both] [--profile core|standard|extended] [--bundle web|production] [--control-mode team|hybrid|local]
  vibetether bootstrap --goal TEXT --success-evidence TEXT [--confirmed] --yes
  vibetether context [--task TEXT] [--boundary NAME] [--json]
  vibetether context read HANDLE [--offset N] [--limit N]
  vibetether deep prepare|answer|permit|revoke|status
  vibetether step start [--task TEXT | --phase PHASE --capability ID] --slice TEXT --success-evidence TEXT --success-check-json JSON [--signal ID] [--confirmed-by-user --decision-reason TEXT]
  vibetether step finish [--evidence-command-json JSON] --output-proof-json JSON --exit-proof-json JSON
  vibetether step abandon --reason TEXT
  vibetether step heartbeat | reanchor | break-lease
  vibetether truth add|confirm|decline|list
  vibetether experience add|confirm|status|audit
  vibetether worktree attach|list|create|remove|prune
  vibetether worktree handoff create|accept|finish
  vibetether skills search|inspect|import|evaluate|approve|promote|activate|read|exec|expose|disable|prefer|optimize|hotset
  vibetether capabilities [--phase PHASE --capability ID]
  vibetether doctor [--boundary NAME] [--json]
  vibetether global install|uninstall
  vibetether migrate [--dry-run|--yes]
  vibetether migrate rollback --id ID --yes
  vibetether upgrade [--dry-run|--yes]
  vibetether upgrade rollback --id ID --yes
  vibetether uninstall [--remove-contract] --yes

Exit codes: 2 invalid input, 3 conflict or safety refusal, 4 health check failed.
`;

const MULTI=new Set(['bundle','signal','success_evidence','success_check_json','evidence_command_json','evidence_artifact','output_proof_json','exit_proof_json','scope_boundary','constraint','trigger','negative_trigger','capability','phase','host','os','protected_capability','evidence_id','experience_id','artifact','arg','output','exit_evidence','fact','assumption','decision','operation','path']);
const BOOLEAN=new Set(['json','yes','dry_run','confirmed','network','external_write','code_write','force','remove_contract','deep','confirmed_by_user','interactive']);

function key(flag) { return flag.replace(/^--/,'').replaceAll('-','_'); }
function parse(tokens) {
  const options={_:[]};
  for (let index=0;index<tokens.length;index+=1) {
    const token=tokens[index];
    if (!token.startsWith('--')) { options._.push(token); continue; }
    const name=key(token);
    if (BOOLEAN.has(name)) { options[name]=true; continue; }
    if (index+1>=tokens.length||tokens[index+1].startsWith('--')) throw usageError(`Missing value for ${token}.`);
    const value=tokens[++index];
    if (MULTI.has(name)) { (options[name]??=[]).push(value); } else options[name]=value;
  }
  return options;
}
function number(value,label,defaultValue=null) { if (value===undefined||value===null) return defaultValue; const parsed=Number(value); if (!Number.isInteger(parsed)) throw usageError(`${label} must be an integer.`); return parsed; }
function json(value,label) { try { return JSON.parse(value); } catch { throw usageError(`${label} must be valid JSON.`); } }
function response(value,asJson=false) { return `${asJson?JSON.stringify(value,null,2):typeof value==='string'?value:JSON.stringify(value,null,2)}\n`; }
async function interactiveInit(options,runtime={}) {
  if (options.yes||options.dry_run) return options;
  let prompt=null;
  let close=false;
  if (runtime.promptAdapter?.question) prompt=runtime.promptAdapter;
  else if (input.isTTY&&output.isTTY) { prompt=createInterface({input,output}); close=true; }
  else if (options.interactive===true) {
    let supplied=''; for await (const chunk of input) supplied+=chunk;
    const answers=supplied.split(/\r?\n/);
    prompt={async question(text){ output.write(text); return answers.shift()??''; }};
  }
  if (!prompt) return options;
  try {
    if (!options.goal) options.goal=(await prompt.question('Project goal: ')).trim();
    if (!options.success_evidence?.length) options.success_evidence=[(await prompt.question('Required success evidence: ')).trim()];
    const answer=(await prompt.question('Create the reviewed VibeTether Contract? [Y/n] ')).trim().toLowerCase();
    if (answer&&answer!=='y'&&answer!=='yes') throw conflictError('Initialization cancelled.','CANCELLED');
    options.confirmed=Boolean(options.goal&&options.success_evidence?.[0]); options.yes=true; return options;
  } finally { if (close) prompt.close(); }
}

async function contextRuntime(project) {
  const context=await discoverContract(project??process.cwd());
  const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  return {context,authority,runtime};
}
async function writeSkills(context,mutator) {
  const next=await mutator(structuredClone(context.skills));
  await writeProjectJson(context.root,context.manifest.skills_lock,next); return next;
}

export async function main(args=[],runtime={}) {
  if (!args.length||args[0]==='--help'||args[0]==='-h') return HELP;
  if (args[0]==='--version'||args[0]==='-v') return `${VERSION}\n`;
  const [command,...rest]=args; const options=parse(rest); const action=options._[0];
  if (command==='init') {
    const prepared=await interactiveInit(options,runtime);
    return response(await initialize({project:prepared.project,agent:prepared.agent??'both',profile:prepared.profile??'standard',bundles:prepared.bundle??[],control_mode:prepared.control_mode??'team',goal:prepared.goal,success_evidence:prepared.success_evidence?.[0]??prepared.success_evidence,scope_boundaries:prepared.scope_boundary??[],constraints:prepared.constraint??[],confirmed:prepared.confirmed,dry_run:prepared.dry_run,yes:prepared.yes}),prepared.json);
  }
  if (command==='bootstrap') return response(await bootstrap({project:options.project,goal:options.goal,success_evidence:options.success_evidence?.[0],scope_boundaries:options.scope_boundary,constraints:options.constraint,confirmed:options.confirmed,dry_run:options.dry_run,yes:options.yes}),options.json);
  if (command==='context') {
    if (action==='read') return response(await readContextHandle({project:options.project,handle:options._[1],offset:number(options.offset,'offset',0),limit:number(options.limit,'limit',8192)}),true);
    return response(await buildContext({project:options.project,boundary:options.boundary,phase:options.phase?.[0],capability:options.capability?.[0],signals:options.signal,agent:options.agent,provider:options.provider,permissions:{network:options.network===true,external_write:options.external_write===true,code_write:options.code_write===true},task_text:options.task,paths:options.path??[]}),options.json);
  }
  if (command==='deep') {
    if (action==='prepare') return response(await prepareDeep({project:options.project,task:options.task,slice:options.slice,phase:options.phase?.[0],capability:options.capability?.[0],provider:options.provider,scope_paths:options.path??[],permissions:{network:options.network===true,external_write:options.external_write===true,code_write:options.code_write===true},success_evidence:options.success_evidence,success_checks:(options.success_check_json??[]).map((item)=>json(item,'success-check-json')),facts:options.fact,assumptions:options.assumption,decisions:options.decision}),options.json);
    if (action==='answer') return response(await answerDeepQuestion({project:options.project,question_id:options.question_id,selected_option:options.selected_option,user_message_locator:options.user_message_locator}),options.json);
    if (action==='permit') return response(await grantDeepPermit({project:options.project,confirmed_by_user:options.confirmed_by_user===true,reason:options.reason,resolution:options.resolution_json?json(options.resolution_json,'resolution-json'):null}),options.json);
    if (action==='revoke') return response(await revokeDeepPermit({project:options.project,reason:options.reason}),options.json);
    if (action==='status') { const {runtime:rt}=await contextRuntime(options.project); return response(await readDeepState(rt.paths,{allowMissing:true})??{status:'not-prepared'},options.json); }
    throw usageError('Unknown deep action.');
  }
  if (command==='step') {
    if (action==='start') {
      let classified=null;
      if (options.task&&(!options.phase?.[0]||!options.capability?.[0])) {
        const context=await discoverContract(options.project??process.cwd());
        classified=classifyTaskText(options.task,{intentStatus:parseIntent(context.intentSource).status,currentPhase:'DISCOVER'});
      }
      return response(await startStep({project:options.project,phase:options.phase?.[0]??classified?.phase,capability:options.capability?.[0]??classified?.capability,slice:options.slice??options.task,task_text:options.task,classification:classified,deep:options.deep===true,confirmed_by_user:options.confirmed_by_user===true,decision_reason:options.decision_reason,scope_paths:options.path??[],success_evidence:options.success_evidence,success_checks:(options.success_check_json??[]).map((item)=>json(item,'success-check-json')),signals:[...new Set([...(options.signal??[]),...(classified?.signals??[])])],agent:options.agent,provider:options.provider,network:options.network,external_write:options.external_write,code_write:options.code_write}),options.json);
    }
    if (action==='finish') return response(await finishStep({project:options.project,evidence_commands:(options.evidence_command_json??[]).map((item)=>json(item,'evidence-command-json')),evidence_artifacts:options.evidence_artifact??[],evidence:options.evidence,truth_decision:options.truth_decision,truth_path:options.truth_path,experience_ids:options.experience_id,capture_class:options.capture,outputs:options.output??[],exit_evidence:options.exit_evidence??[],output_proofs:(options.output_proof_json??[]).map((item)=>json(item,'output-proof-json')),exit_proofs:(options.exit_proof_json??[]).map((item)=>json(item,'exit-proof-json'))}),options.json);
    if (action==='abandon') return response(await abandonStep({project:options.project,reason:options.reason,truth_decision:options.truth_decision,truth_path:options.truth_path}),options.json);
    if (action==='heartbeat') return response(await heartbeatStep({project:options.project}),options.json);
    if (action==='reanchor') return response(await reanchorStep({project:options.project,reason:options.reason}),options.json);
    if (action==='break-lease') { const {runtime}=await contextRuntime(options.project); const route=await breakLease(runtime.paths,options.reason); return response({status:'lease-broken',route_status:route?.status??null,route_id:route?.id??null},options.json); }
    throw usageError('Unknown step action.');
  }
  if (command==='truth') {
    const context=await discoverContract(options.project??process.cwd()); const map=parseTruthMap(context.truthSource);
    if (!action||action==='list') return response(map,options.json);
    let next;
    if (action==='add') next=addTruthCandidate(map,{path:options.path?.[0]??options.path,role:options.role,scope:options.scope??'.',phases:options.phase??[],operations:options.operation??[],directionality:options.directionality,source:options.source,reason:options.reason,supersedes:options.supersedes});
    else if (action==='confirm') next=confirmTruthCandidate(map,options.path?.[0]??options.path);
    else if (action==='decline') next=declineTruthCandidate(map,options.path?.[0]??options.path,options.reason);
    else throw usageError('Unknown truth action.');
    if (!options.yes) throw conflictError('Truth changes require --yes.','CONFIRMATION_REQUIRED');
    await writeProjectText(context.root,context.manifest.truth_index,renderTruthMap(next)); return response({status:action,path:options.path?.[0]??options.path},options.json);
  }
  if (command==='experience') {
    const {context,authority,runtime}=await contextRuntime(options.project); validateExperienceIndex(context.experience); const skillsDigest=skillsLockDigest(context.skills);
    if (action==='add') {
      const next=createExperienceCandidate(context.experience,{id:options.id,use_when:options.trigger,systems:options.systems?options.systems.split(','):[],artifacts:options.artifact??[],revalidate_when:options.revalidate_when?options.revalidate_when.split(','):[]});
      if (!options.yes) throw conflictError('Experience changes require --yes.','CONFIRMATION_REQUIRED'); await writeProjectJson(context.root,context.manifest.experience_index,next); return response({status:'candidate',id:options.id},options.json);
    }
    if (action==='confirm') { const next=await confirmExperience(context,runtime.paths,context.experience,options.id,{authorityDigest:authority.authority_digest,skillsDigest,evidenceIds:options.evidence_id??[],artifactPaths:options.artifact??[],reviewDays:number(options.review_days,'review-days',90)}); if (!options.yes) throw conflictError('Experience confirmation requires --yes.','CONFIRMATION_REQUIRED'); await writeProjectJson(context.root,context.manifest.experience_index,next); return response({status:'proven',id:options.id},options.json); }
    if (action==='status') { const next=updateExperienceStatus(context.experience,options.id,options.status,options.reason); if (!options.yes) throw conflictError('Experience status changes require --yes.','CONFIRMATION_REQUIRED'); await writeProjectJson(context.root,context.manifest.experience_index,next); return response({status:options.status,id:options.id},options.json); }
    if (action==='audit') return response(await auditExperience(context,runtime.paths,context.experience,{authorityDigest:authority.authority_digest,skillsDigest,signals:options.signal??[]}),options.json);
    throw usageError('Unknown experience action.');
  }
  if (command==='worktree') {
    if (action==='attach') return response(await attachFromDirectory(options.project??process.cwd(),options.contract_root),options.json);
    if (action==='list') return response(await listAttachedWorktrees(options.project),options.json);
    if (action==='create') return response(await createWorktree({project:options.project,target:options.path?.[0]??options.path,branch:options.branch,startPoint:options.start_point}),options.json);
    if (action==='remove') return response(await removeWorktree({project:options.project,target:options.path?.[0]??options.path,force:options.force}),options.json);
    if (action==='prune') return response(await pruneWorktrees(options.project),options.json);
    if (action==='handoff') {
      const sub=options._[1]; const {context,runtime}=await contextRuntime(options.project);
      if (sub==='create') return response(await createHandoff(context,runtime.paths,{slice:options.slice,success_evidence:options.success_evidence,protected_capabilities:options.protected_capability,permissions:options.permissions_json?json(options.permissions_json,'permissions-json'):{code_write:false,truth_write:false}}),options.json);
      if (sub==='accept') return response(await acceptHandoff(context,runtime.paths,options.id),options.json);
      if (sub==='finish') return response(await finishHandoff(runtime.paths,options.id,options.evidence_id??[]),options.json);
    }
    throw usageError('Unknown worktree action.');
  }
  if (command==='skills') {
    if (action==='search') return response(await searchSkills(options.query??options._[1]??''),options.json);
    if (action==='inspect') return response(await inspectSkill(options.id??options._[1]),options.json);
    if (action==='import') {
      const card=await importProvider({id:options.id,source:options.source,source_label:options.source_label,version:options.version,license:options.license,capabilities:options.capability,phases:options.phase,positive_triggers:options.trigger,negative_triggers:options.negative_trigger,hosts:options.host,operating_systems:options.os,network:options.network,external_write:options.external_write,code_write:options.code_write});
      if (options.project) { const context=await discoverContract(options.project); await writeSkills(context,(lock)=>({...lock,pins:[...lock.pins.filter((pin)=>pin.id!==card.id),{id:card.id,object_hash:card.object_hash,fingerprint:card.fingerprint,source:card.source,version:card.version,license:card.license}]})); }
      return response(card,options.json);
    }
    if (action==='evaluate') return response(await evaluateProvider(options.id,{true_positive:number(options.true_positive,'true-positive',0),false_positive:number(options.false_positive,'false-positive',0),false_negative:number(options.false_negative,'false-negative',0),output_gain:Number(options.output_gain??0),notes:options.notes}),options.json);
    if (action==='approve') return response(await approveProvider(options.id),options.json);
    if (action==='promote') return response(await promoteProvider(options.id),options.json);
    if (action==='activate') { const {context,runtime}=await contextRuntime(options.project); const route=await readRoute(runtime.paths,{allowMissing:true}); if (!route||route.status!=='active') throw conflictError('Activation requires an active step.','ACTIVE_STEP_REQUIRED'); const registry=await loadProviderRegistry(); const routes=context.routes?validateRoutes(context.routes,registry.capabilities,registry.providers):null; const stats=await loadProviderStats(runtime.paths); const broker=brokerSkills(registry,{phase:route.phase,capability:route.capability,signals:route.signals,agent:options.agent??'codex',provider:options.id,permissions:route.permissions},context.skills,routes,stats); return response(await activateSkill(context,runtime.paths,{...route,selected:broker.selected}),options.json); }
    if (action==='read') { const {runtime}=await contextRuntime(options.project); return response(await readSkillResource(runtime.paths,options.activation_id,options.resource??'entry',{offset:number(options.offset,'offset',0),limit:number(options.limit,'limit',8192)}),true); }
    if (action==='exec') { const {runtime}=await contextRuntime(options.project); return response(await execSkillScript(runtime.paths,options.activation_id,options.script,options.arg??[]),options.json); }
    if (action==='expose') { const context=await discoverContract(options.project??process.cwd()); return response(await exposeProvider(context,options.id,{agent:options.agent??'codex',scope:options.scope??'user'}),options.json); }
    if (['disable','prefer','hotset'].includes(action)) {
      const context=await discoverContract(options.project??process.cwd()); const id=options.id;
      const next=await writeSkills(context,(lock)=>{
        if (action==='disable') return {...lock,disabled:[...new Set([...lock.disabled,id])],hotset:lock.hotset.filter((item)=>item!==id)};
        if (action==='prefer') return {...lock,preferences:[id,...lock.preferences.filter((item)=>item!==id)]};
        if (!id) return lock;
        const hotset=[...new Set([...lock.hotset,id])]; if (hotset.length>lock.hotset_max) throw conflictError('Hotset exceeds hotset_max.','HOTSET_LIMIT'); return {...lock,hotset};
      });
      return response(action==='hotset'?await providerHotset(next):next,options.json);
    }
    if (action==='optimize') { const {context,runtime}=await contextRuntime(options.project); return response(await optimizeSkills(runtime.paths,context.skills),options.json); }
    throw usageError('Unknown skills action.');
  }
  if (command==='capabilities') return response(await showCapabilities({project:options.project,phase:options.phase?.[0],capability:options.capability?.[0],signals:options.signal,agent:options.agent,provider:options.provider,permissions:{network:options.network===true,external_write:options.external_write===true,code_write:options.code_write===true},task_text:options.task,paths:options.path??[]}),options.json);
  if (command==='doctor') { const report=await inspectProject({project:options.project,boundary:options.boundary,json:options.json,agent:options.agent}); return response(report,options.json); }
  if (command==='global') {
    if (action==='install') return response(await installGlobalEntry({agent:options.agent??'both',bin_dir:options.bin_dir,dry_run:options.dry_run,yes:options.yes}),options.json);
    if (action==='uninstall') return response(await uninstallGlobalEntry({agent:options.agent??'both',bin_dir:options.bin_dir,dry_run:options.dry_run,yes:options.yes}),options.json);
    throw usageError('Unknown global action.');
  }
  if (command==='migrate') {
    if (action==='rollback') return response(await rollbackMigration({id:options.id,yes:options.yes}),options.json);
    return response(options.dry_run?await planMigration({project:options.project,control_mode:options.control_mode}):await migrate({project:options.project,control_mode:options.control_mode,agent:options.agent,dry_run:options.dry_run,yes:options.yes}),options.json);
  }
  if (command==='upgrade') {
    if (action==='rollback') return response(await rollbackUpgrade({id:options.id,yes:options.yes}),options.json);
    return response(options.dry_run?await planUpgrade({project:options.project,agent:options.agent}):await upgradeProject({project:options.project,agent:options.agent,yes:options.yes}),options.json);
  }
  if (command==='uninstall') return response(await uninstallProject({project:options.project,agent:options.agent,dry_run:options.dry_run,yes:options.yes,remove_contract:options.remove_contract}),options.json);
  throw usageError(`Unknown command: ${command}`);
}
