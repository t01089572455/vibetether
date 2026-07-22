import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { conflictError } from './errors.mjs';
import { ADAPTERS, hasCanonicalManagedBlock, removeManagedBlock, selectedAdapters } from './adapters.mjs';
import { discoverContract } from './contract.mjs';
import { canonicalJson, portableTextEqual, readJsonFile, readTextIfPresent, transactionalWrites } from './files.mjs';
import { renderProjectLauncher } from './launcher.mjs';
import { renderInitialProgress, validateOutcomeRegistry } from './outcomes.mjs';

const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function uninstallProject({project=process.cwd(),agent='both',dry_run=false,yes=false,remove_contract=false}={}) {
  if (!yes&&!dry_run) throw conflictError('Uninstall requires --yes or --dry-run.','CONFIRMATION_REQUIRED');
  const context=await discoverContract(project);
  if (!context.tracked) return {status:'preserved',reason:'Local Contract is external; use global uninstall or remove the local registry deliberately.'};
  const plans=[]; const entry=await readFile(path.join(packageRoot,'skills','vibe-tether','SKILL.md'),'utf8'); const deepEntry=await readFile(path.join(packageRoot,'skills','vibe-tether-deep','SKILL.md'),'utf8');
  for (const adapter of selectedAdapters(agent)) {
    const config=ADAPTERS[adapter]; const instruction=path.join(context.root,config.instruction); const source=await readTextIfPresent(instruction);
    if (source?.includes('<!-- vibetether:start -->')||source?.includes('<!-- vibetether:end -->')) {
      if (!hasCanonicalManagedBlock(source)) throw conflictError(`Refusing to remove modified managed instruction block: ${config.instruction}`,'MANAGED_BLOCK_CONFLICT');
      plans.push({target:instruction,content:removeManagedBlock(source),mode:0o644});
    }
    const skillTarget=path.join(context.root,...config.skill.split('/')); const installed=await readTextIfPresent(skillTarget);
    if (installed!==null) { if (!portableTextEqual(installed,entry)) throw conflictError(`Refusing to remove modified entry Skill: ${config.skill}`,'FILE_COLLISION'); plans.push({target:skillTarget,remove:true}); }
    const deepTarget=path.join(context.root,...config.deepSkill.split('/')); const deepInstalled=await readTextIfPresent(deepTarget);
    if (deepInstalled!==null) { if (!portableTextEqual(deepInstalled,deepEntry)) throw conflictError(`Refusing to remove modified deep entry Skill: ${config.deepSkill}`,'FILE_COLLISION'); plans.push({target:deepTarget,remove:true}); }
  }
  const launcher=path.join(context.root,...context.manifest.launcher.split('/')); const launcherSource=await readTextIfPresent(launcher);
  if (launcherSource!==null) {
    const expected=renderProjectLauncher(context.manifest.vibetether_version);
    if (!portableTextEqual(launcherSource,expected)) throw conflictError(`Refusing to remove modified project launcher: ${context.manifest.launcher}`,'FILE_COLLISION');
    plans.push({target:launcher,remove:true});
  }
  if (remove_contract) {
    if (context.manifest.schema_version === 2) {
      const outcomesPath=path.join(context.root,...context.manifest.outcome_index.split('/'));
      const outcomesSource=await readTextIfPresent(outcomesPath);
      if (outcomesSource===null) throw conflictError(`Refusing to remove missing Outcome registry: ${context.manifest.outcome_index}`,'FILE_COLLISION');
      const outcomes=validateOutcomeRegistry(await readJsonFile(outcomesPath,'Outcome registry'));
      const userGoverned=outcomes.coverage_status!=='draft'||outcomes.coverage_decision!==null||outcomes.integration_worktree_id!==null||outcomes.coverage_sources.length||outcomes.validator_migrations.length||outcomes.outcomes.length;
      if (userGoverned||!portableTextEqual(outcomesSource,canonicalJson(outcomes))) throw conflictError(`Refusing to remove modified Outcome registry: ${context.manifest.outcome_index}`,'FILE_COLLISION');
      const progressPath=path.join(context.root,...context.manifest.progress_projection.split('/'));
      const progressSource=await readTextIfPresent(progressPath);
      if (progressSource===null||!portableTextEqual(progressSource,renderInitialProgress(outcomes))) throw conflictError(`Refusing to remove modified generated Progress projection: ${context.manifest.progress_projection}`,'FILE_COLLISION');
      plans.push({target:outcomesPath,remove:true},{target:progressPath,remove:true});
    }
    for (const relative of ['.vibetether/project.json',context.manifest.intent,context.manifest.truth_index,context.manifest.experience_index,context.manifest.skills_lock,context.manifest.routes]) plans.push({target:path.join(context.root,...relative.split('/')),remove:true});
  }
  if (dry_run) return {status:'preview',preserves_user_contract:!remove_contract,files:plans.map((item)=>path.relative(context.root,item.target).replaceAll('\\','/'))};
  await transactionalWrites(plans); return {status:'removed',preserved_contract:!remove_contract,files:plans.map((item)=>item.target)};
}
