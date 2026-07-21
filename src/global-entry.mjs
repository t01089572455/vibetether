import { fileURLToPath } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ADAPTERS, selectedAdapters } from './adapters.mjs';
import { VERSION } from './constants.mjs';
import { conflictError } from './errors.mjs';
import { portableTextEqual, readTextIfPresent, transactionalWrites } from './files.mjs';
import { configHome } from './paths.mjs';
import { renderGlobalDispatcher } from './launcher.mjs';
import { cacheRuntimePackage } from './release-cache.mjs';

const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function skillRoot(agent) { return path.join(os.homedir(),ADAPTERS[agent].userSkillRoot); }
export function globalBinPath(binDir=null) {
  const directory=binDir?path.resolve(binDir):process.platform==='win32'?path.join(configHome(),'bin'):path.join(os.homedir(),'.local','bin');
  return path.join(directory,process.platform==='win32'?'vibetether.mjs':'vibetether');
}

export async function installGlobalEntry({agent='both',bin_dir=null,dry_run=false,yes=false}={}) {
  if (!yes&&!dry_run) throw conflictError('Global install requires --yes or --dry-run.','CONFIRMATION_REQUIRED');
  const skill=await readFile(path.join(packageRoot,'skills','vibe-tether','SKILL.md'),'utf8');
  const deepSkill=await readFile(path.join(packageRoot,'skills','vibe-tether-deep','SKILL.md'),'utf8');
  const dispatcher=renderGlobalDispatcher(VERSION);
  const plans=[];
  for (const name of selectedAdapters(agent)) {
    const target=path.join(skillRoot(name),'vibe-tether','SKILL.md');
    const prior=await readTextIfPresent(target); if (prior!==null&&!portableTextEqual(prior,skill)) throw conflictError(`Refusing to overwrite modified global entry Skill: ${target}`,'FILE_COLLISION');
    plans.push({target,content:skill,mode:0o644});
    const deepTarget=path.join(skillRoot(name),'vibe-tether-deep','SKILL.md');
    const priorDeep=await readTextIfPresent(deepTarget); if (priorDeep!==null&&!portableTextEqual(priorDeep,deepSkill)) throw conflictError(`Refusing to overwrite modified global deep Skill: ${deepTarget}`,'FILE_COLLISION');
    plans.push({target:deepTarget,content:deepSkill,mode:0o644});
  }
  const bin=globalBinPath(bin_dir); const prior=await readTextIfPresent(bin); if (prior!==null&&!portableTextEqual(prior,dispatcher)) throw conflictError(`Refusing to overwrite modified global dispatcher: ${bin}`,'FILE_COLLISION');
  plans.push({target:bin,content:dispatcher,mode:0o755});
  if (dry_run) return {status:'preview',files:plans.map((item)=>item.target)};
  await cacheRuntimePackage();
  await transactionalWrites(plans);
  return {status:'installed',files:plans.map((item)=>item.target),path_notice:path.dirname(bin)};
}

export async function uninstallGlobalEntry({agent='both',bin_dir=null,dry_run=false,yes=false}={}) {
  if (!yes&&!dry_run) throw conflictError('Global uninstall requires --yes or --dry-run.','CONFIRMATION_REQUIRED');
  const skill=await readFile(path.join(packageRoot,'skills','vibe-tether','SKILL.md'),'utf8');
  const deepSkill=await readFile(path.join(packageRoot,'skills','vibe-tether-deep','SKILL.md'),'utf8');
  const dispatcher=renderGlobalDispatcher(VERSION); const plans=[];
  for (const name of selectedAdapters(agent)) {
    const target=path.join(skillRoot(name),'vibe-tether','SKILL.md'); const prior=await readTextIfPresent(target);
    if (prior===null) continue; if (!portableTextEqual(prior,skill)) throw conflictError(`Refusing to remove modified global entry Skill: ${target}`,'FILE_COLLISION');
    plans.push({target,remove:true});
    const deepTarget=path.join(skillRoot(name),'vibe-tether-deep','SKILL.md'); const priorDeep=await readTextIfPresent(deepTarget);
    if (priorDeep!==null) { if (!portableTextEqual(priorDeep,deepSkill)) throw conflictError(`Refusing to remove modified global deep Skill: ${deepTarget}`,'FILE_COLLISION'); plans.push({target:deepTarget,remove:true}); }
  }
  const bin=globalBinPath(bin_dir); const prior=await readTextIfPresent(bin);
  if (prior!==null) { if (!portableTextEqual(prior,dispatcher)) throw conflictError(`Refusing to remove modified global dispatcher: ${bin}`,'FILE_COLLISION'); plans.push({target:bin,remove:true}); }
  if (dry_run) return {status:'preview',files:plans.map((item)=>item.target)};
  await transactionalWrites(plans); return {status:'removed',files:plans.map((item)=>item.target)};
}
