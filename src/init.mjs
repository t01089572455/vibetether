import { fileURLToPath } from 'node:url';
import { lstat, mkdir, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ADAPTERS, applyManagedBlock, selectedAdapters } from './adapters.mjs';
import { TRACKED_CONTRACT_BUDGET_BYTES } from './constants.mjs';
import { conflictError } from './errors.mjs';
import {
  canonicalJson, exists, portableTextEqual, readTextIfPresent, rejectAbsoluteSymlinkChain, transactionalWrites,
} from './files.mjs';
import { gitIdentity } from './git.mjs';
import { createManifest, createSkillsLock, loadContract, localContractRoot } from './contract.mjs';
import { emptyExperienceIndex } from './experience.mjs';
import { renderIntent } from './intent.mjs';
import { renderProjectLauncher } from './launcher.mjs';
import { cacheRuntimePackage } from './release-cache.mjs';
import { emptyTruthMap, renderTruthMap, authoritySnapshot, parseTruthMap } from './truth.mjs';
import { attachWorktree } from './worktree.mjs';
import { emptyOutcomeRegistry, renderInitialProgress } from './outcomes.mjs';
import { sha256Text } from './files.mjs';

const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function selectedPacks(options = {}) {
  const profile = options.profile ?? 'standard';
  if (!['core', 'standard', 'extended'].includes(profile)) throw conflictError('profile must be core, standard, or extended.', 'INVALID_PROFILE');
  const requested = options.bundles ?? [];
  for (const bundle of requested) if (!['web', 'production'].includes(bundle)) throw conflictError(`Unknown Provider bundle: ${bundle}`, 'INVALID_BUNDLE');
  const packs = profile === 'core' ? [] : profile === 'standard' ? ['standard'] : ['standard', 'extended'];
  return [...new Set([...packs, ...requested])];
}

function initialAssets(manifest,options) {
  const confirmed=options.confirmed===true&&Boolean(options.goal)&&Boolean(options.success_evidence);
  const goalRevision=`sha256:${sha256Text(canonicalJson({goal:options.goal??'',success_evidence:options.success_evidence??''}))}`;
  const outcomes=emptyOutcomeRegistry('goal_project_delivery',goalRevision);
  return {
    [manifest.intent]:renderIntent({status:confirmed?'confirmed':'draft',goal:options.goal??'',success_evidence:options.success_evidence??'',scope_boundaries:options.scope_boundaries??[],constraints:options.constraints??[]}),
    [manifest.truth_index]:renderTruthMap(emptyTruthMap()),
    [manifest.experience_index]:canonicalJson(emptyExperienceIndex()),
    [manifest.skills_lock]:canonicalJson(createSkillsLock({ packs: selectedPacks(options) })),
    [manifest.routes]:canonicalJson({schema_version:1,routes:[]}),
    [manifest.launcher]:renderProjectLauncher(manifest.vibetether_version),
    [manifest.outcome_index]:canonicalJson(outcomes),
    [manifest.progress_projection]:renderInitialProgress(outcomes),
    '.vibetether/project.json':canonicalJson(manifest),
  };
}

async function projectRoot(project) {
  const root=await realpath(path.resolve(project)).catch(()=>null);
  if (!root) throw conflictError(`Project directory does not exist: ${project}`,'MISSING_PROJECT');
  const metadata=await lstat(root);
  if (!metadata.isDirectory()||metadata.isSymbolicLink()) throw conflictError('Project must be a regular non-linked directory.','UNSAFE_PROJECT');
  return root;
}

async function plannedTrackedWrites(root,manifest,options,{existing=false}={}) {
  const plans=[];
  const entrySkill=await readFile(path.join(packageRoot,'skills','vibe-tether','SKILL.md'),'utf8');
  const deepSkill=await readFile(path.join(packageRoot,'skills','vibe-tether-deep','SKILL.md'),'utf8');
  if (!existing) {
    for (const [relative,content] of Object.entries(initialAssets(manifest,options))) plans.push({target:path.join(root,...relative.split('/')),content,mode:relative.endsWith('.mjs')?0o755:0o644});
  } else {
    const launcher=path.join(root,...manifest.launcher.split('/'));
    const prior=await readTextIfPresent(launcher);
    const expected=renderProjectLauncher(manifest.vibetether_version);
    if (prior!==null&&!portableTextEqual(prior,expected)) throw conflictError(`Refusing to overwrite modified project launcher: ${manifest.launcher}`,'FILE_COLLISION');
    plans.push({target:launcher,content:expected,mode:0o755});
  }
  for (const adapter of selectedAdapters(options.agent??'both')) {
    const config=ADAPTERS[adapter];
    const instruction=path.join(root,config.instruction);
    const source=await readTextIfPresent(instruction);
    plans.push({target:instruction,content:applyManagedBlock(source),mode:0o644});
    const skillTarget=path.join(root,...config.skill.split('/'));
    const installed=await readTextIfPresent(skillTarget);
    if (installed!==null&&!portableTextEqual(installed,entrySkill)) throw conflictError(`Refusing to overwrite a different or modified entry Skill: ${config.skill}`,'FILE_COLLISION');
    plans.push({target:skillTarget,content:entrySkill,mode:0o644});
    const deepTarget=path.join(root,...config.deepSkill.split('/'));
    const installedDeep=await readTextIfPresent(deepTarget);
    if (installedDeep!==null&&!portableTextEqual(installedDeep,deepSkill)) throw conflictError(`Refusing to overwrite a different or modified deep entry Skill: ${config.deepSkill}`,'FILE_COLLISION');
    plans.push({target:deepTarget,content:deepSkill,mode:0o644});
  }
  return plans;
}

function preview(plans,root,mode) {
  return {status:'preview',control_mode:mode,root,files:plans.map((plan)=>path.relative(root,plan.target).replaceAll('\\','/'))};
}

export async function initialize(options={},runtimeHooks={}) {
  const root=await projectRoot(options.project??process.cwd());
  const legacyManifest=path.join(root,'.vibetether','project.yaml');
  const currentManifest=path.join(root,'.vibetether','project.json');
  if (!await exists(currentManifest) && await exists(legacyManifest)) {
    throw conflictError('A VibeTether 0.x control plane already exists. Run `vibetether migrate --dry-run` before changing any project files.','MIGRATION_REQUIRED');
  }
  const mode=options.control_mode??'team';
  if (!['team','hybrid','local'].includes(mode)) throw conflictError('control-mode must be team, hybrid, or local.','INVALID_CONTRACT');
  let contractRoot=root;
  if (mode==='local') {
    const identity=await gitIdentity(root);
    if (!identity) throw conflictError('Local control mode requires a Git repository so sibling worktrees share identity.','GIT_REQUIRED');
    contractRoot=localContractRoot(identity.common_id);
    await rejectAbsoluteSymlinkChain(contractRoot,{allowMissing:true});
  }
  const manifestPath=path.join(contractRoot,'.vibetether','project.json');
  let existing=false; let manifest;
  if (await exists(manifestPath)) {
    const loaded=await loadContract(contractRoot); manifest=loaded.manifest; existing=true;
    if (manifest.control_mode!==mode) throw conflictError('Changing control_mode requires explicit migration.','INVALID_CONTRACT');
  } else manifest=createManifest({control_mode:mode});
  if (!existing && mode!=='local') {
    const protectedAssets=['.vibetether/intent.md','.vibetether/TRUTH.md','.vibetether/TRUTH-MAP.md','.vibetether/experience.json','.vibetether/experience-index.yaml','.vibetether/skills.lock.json','.vibetether/routes.json','.vibetether/vt.mjs','.vibetether/outcomes.json','.vibetether/PROGRESS.md'];
    const collisions=[];
    for (const relative of protectedAssets) if (await exists(path.join(root,...relative.split('/')))) collisions.push(relative);
    if (collisions.length) throw conflictError(`Pre-existing VibeTether assets require migration or manual review: ${collisions.join(', ')}`,'FILE_COLLISION');
  }
  let plans;
  if (mode==='local') {
    if (existing) plans=[{target:path.join(contractRoot,...manifest.launcher.split('/')),content:renderProjectLauncher(manifest.vibetether_version),mode:0o755}];
    else plans=Object.entries(initialAssets(manifest,options)).map(([relative,content])=>({target:path.join(contractRoot,...relative.split('/')),content,mode:relative.endsWith('.mjs')?0o755:0o600}));
  } else plans=await plannedTrackedWrites(root,manifest,options,{existing});
  if (mode!=='local'&&!existing) {
    const contractTargets=new Set(Object.keys(initialAssets(manifest,options)).map((relative)=>path.join(root,...relative.split('/'))));
    const bytes=plans.filter((plan)=>contractTargets.has(plan.target)).reduce((sum,plan)=>sum+Buffer.byteLength(plan.content,'utf8'),0);
    if (bytes>TRACKED_CONTRACT_BUDGET_BYTES) throw conflictError(`Tracked Contract would exceed ${TRACKED_CONTRACT_BUDGET_BYTES} bytes.`,'CONTRACT_TOO_LARGE');
  }
  if (options.dry_run) return preview(plans,mode==='local'?contractRoot:root,mode);
  if (!options.yes) throw conflictError('Initialization requires --yes or --dry-run.','CONFIRMATION_REQUIRED');
  await cacheRuntimePackage();
  return transactionalWrites(plans,async()=>{
    const context={...(await loadContract(contractRoot)),executionRoot:root,tracked:mode!=='local',shared:false};
    if (mode!=='local') {
      const contractFiles=[manifest.intent,manifest.truth_index,manifest.experience_index,manifest.skills_lock,manifest.routes,manifest.launcher,manifest.outcome_index,manifest.progress_projection,'.vibetether/project.json'];
      let bytes=0; for (const relative of contractFiles) bytes+=Buffer.byteLength(await readFile(path.join(root,...relative.split('/'))));
      if (bytes>TRACKED_CONTRACT_BUDGET_BYTES) throw conflictError(`Tracked Contract exceeds ${TRACKED_CONTRACT_BUDGET_BYTES} bytes.`,'CONTRACT_TOO_LARGE');
    }
    const truth=parseTruthMap(context.truthSource);
    const authority=await authoritySnapshot(root,truth,context.intentSource);
    const attach=runtimeHooks.attachWorktree??attachWorktree;
    const runtime=await attach(context,authority.authority_digest);
    return {status:existing?'updated':'initialized',control_mode:mode,project_id:manifest.project_id,contract_root:contractRoot,execution_root:root,worktree_id:runtime.paths.worktree_id,warning:mode==='local'?'Local mode requires the global VibeTether entry Skill or an explicit CLI invocation; it is not team-portable.':null};
  });
}
