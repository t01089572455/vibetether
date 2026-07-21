#!/usr/bin/env node
import { mkdtemp, mkdir, lstat, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { initialize } from '../src/init.mjs';
import { discoverContract } from '../src/contract.mjs';
import { buildContext } from '../src/context.mjs';
import { managedBlock } from '../src/adapters.mjs';
import {
  CONTEXT_BUDGET_BYTES, ENTRY_SKILL_BUDGET_BYTES, MANAGED_BLOCK_BUDGET_BYTES,
  TRACKED_CONTRACT_BUDGET_BYTES,
} from '../src/constants.mjs';
import { fileURLToPath } from 'node:url';

const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=await mkdtemp(path.join(os.tmpdir(),'vibetether-budget-'));
const root=path.join(base,'project'); await mkdir(root);
process.env.VIBETETHER_STATE_HOME=path.join(base,'state');
process.env.VIBETETHER_CACHE_HOME=path.join(base,'cache');
process.env.VIBETETHER_CONFIG_HOME=path.join(base,'config');
for(const args of [['init','-q'],['config','user.email','budget@example.com'],['config','user.name','Budget Audit']]){
  const result=spawnSync('git',args,{cwd:root,encoding:'utf8'}); if(result.status!==0) throw new Error(result.stderr||result.stdout);
}
await initialize({project:root,agent:'codex',control_mode:'team',goal:'Keep a long-running task aligned.',success_evidence:'Fresh checks prove the bounded outcome.',confirmed:true,yes:true});
const context=await discoverContract(root);
const files=['.vibetether/project.json',context.manifest.intent,context.manifest.truth_index,context.manifest.experience_index,context.manifest.skills_lock,context.manifest.routes,context.manifest.launcher];
let contractBytes=0; for(const relative of files) contractBytes+=(await lstat(path.join(root,...relative.split('/')))).size;
const entryBytes=(await lstat(path.join(packageRoot,'skills','vibe-tether','SKILL.md'))).size;
const deepEntryBytes=(await lstat(path.join(packageRoot,'skills','vibe-tether-deep','SKILL.md'))).size;
const managedBytes=Buffer.byteLength(managedBlock(),'utf8');
const capsule=await buildContext({project:root,boundary:'task-entry',agent:'codex'});
const contextBytes=Buffer.byteLength(JSON.stringify(capsule),'utf8');
const skillEntries=await readdir(path.join(root,'.agents','skills'));
const forbidden=[];
for(const relative of ['.vibetether/providers','.vibetether/state','.vibetether/capabilities.yaml','.vibetether/providers.lock.yaml']){
  try{await lstat(path.join(root,...relative.split('/')));forbidden.push(relative);}catch(error){if(error.code!=='ENOENT')throw error;}
}
const checks={
  contract_bytes:{actual:contractBytes,limit:TRACKED_CONTRACT_BUDGET_BYTES,pass:contractBytes<=TRACKED_CONTRACT_BUDGET_BYTES},
  contract_files:{actual:files.length,limit:7,pass:files.length<=7},
  entry_skill_bytes:{actual:entryBytes,limit:ENTRY_SKILL_BUDGET_BYTES,pass:entryBytes<=ENTRY_SKILL_BUDGET_BYTES},
  deep_entry_skill_bytes:{actual:deepEntryBytes,limit:ENTRY_SKILL_BUDGET_BYTES,pass:deepEntryBytes<=ENTRY_SKILL_BUDGET_BYTES},
  managed_block_bytes:{actual:managedBytes,limit:MANAGED_BLOCK_BUDGET_BYTES,pass:managedBytes<=MANAGED_BLOCK_BUDGET_BYTES},
  context_capsule_bytes:{actual:contextBytes,limit:CONTEXT_BUDGET_BYTES,pass:contextBytes<=CONTEXT_BUDGET_BYTES},
  exposed_project_skills:{actual:skillEntries,limit:['vibe-tether','vibe-tether-deep'],pass:JSON.stringify(skillEntries.sort())===JSON.stringify(['vibe-tether','vibe-tether-deep'])},
  forbidden_project_assets:{actual:forbidden,limit:[],pass:forbidden.length===0},
};
console.log(JSON.stringify({schema_version:1,checks},null,2));
if(Object.values(checks).some((item)=>!item.pass)) process.exit(1);
