import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { conflictError } from './errors.mjs';
import { ADAPTERS, removeManagedBlock, selectedAdapters } from './adapters.mjs';
import { discoverContract } from './contract.mjs';
import { portableTextEqual, readTextIfPresent, transactionalWrites } from './files.mjs';

const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function uninstallProject({project=process.cwd(),agent='both',dry_run=false,yes=false,remove_contract=false}={}) {
  if (!yes&&!dry_run) throw conflictError('Uninstall requires --yes or --dry-run.','CONFIRMATION_REQUIRED');
  const context=await discoverContract(project);
  if (!context.tracked) return {status:'preserved',reason:'Local Contract is external; use global uninstall or remove the local registry deliberately.'};
  const plans=[]; const entry=await readFile(path.join(packageRoot,'skills','vibe-tether','SKILL.md'),'utf8'); const deepEntry=await readFile(path.join(packageRoot,'skills','vibe-tether-deep','SKILL.md'),'utf8');
  for (const adapter of selectedAdapters(agent)) {
    const config=ADAPTERS[adapter]; const instruction=path.join(context.root,config.instruction); const source=await readTextIfPresent(instruction);
    if (source?.includes('<!-- vibetether:start -->')) plans.push({target:instruction,content:removeManagedBlock(source),mode:0o644});
    const skillTarget=path.join(context.root,...config.skill.split('/')); const installed=await readTextIfPresent(skillTarget);
    if (installed!==null) { if (!portableTextEqual(installed,entry)) throw conflictError(`Refusing to remove modified entry Skill: ${config.skill}`,'FILE_COLLISION'); plans.push({target:skillTarget,remove:true}); }
    const deepTarget=path.join(context.root,...config.deepSkill.split('/')); const deepInstalled=await readTextIfPresent(deepTarget);
    if (deepInstalled!==null) { if (!portableTextEqual(deepInstalled,deepEntry)) throw conflictError(`Refusing to remove modified deep entry Skill: ${config.deepSkill}`,'FILE_COLLISION'); plans.push({target:deepTarget,remove:true}); }
  }
  const launcher=path.join(context.root,...context.manifest.launcher.split('/')); const launcherSource=await readTextIfPresent(launcher); if (launcherSource!==null) plans.push({target:launcher,remove:true});
  if (remove_contract) {
    for (const relative of ['.vibetether/project.json',context.manifest.intent,context.manifest.truth_index,context.manifest.experience_index,context.manifest.skills_lock,context.manifest.routes]) plans.push({target:path.join(context.root,...relative.split('/')),remove:true});
  }
  if (dry_run) return {status:'preview',preserves_user_contract:!remove_contract,files:plans.map((item)=>path.relative(context.root,item.target).replaceAll('\\','/'))};
  await transactionalWrites(plans); return {status:'removed',preserved_contract:!remove_contract,files:plans.map((item)=>item.target)};
}
