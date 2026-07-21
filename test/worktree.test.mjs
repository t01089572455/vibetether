import assert from 'node:assert/strict';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fixture, git, initProject, testSuccessCheck } from './helpers.mjs';
import { discoverContract } from '../src/contract.mjs';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import {
  acceptHandoff, attachFromDirectory, attachWorktree, createHandoff, createWorktree,
  finishHandoff, listAttachedWorktrees, pruneWorktrees, removeWorktree,
} from '../src/worktree.mjs';
import { executionSnapshot, gitIdentity } from '../src/git.mjs';
import { recordEvidence, readRoute } from '../src/runtime.mjs';
import { startStep } from '../src/step.mjs';

async function committedProject(name) {
  const result=await initProject(name);
  git(result.root,['add','.']);
  git(result.root,['commit','-qm','install VibeTether 1.0']);
  return result;
}

async function runtimeFor(root) {
  const context=await discoverContract(root);
  const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  return {context,authority,runtime};
}

test('project-local worktree creation refuses an unignored container',async()=>{
  const {root}=await committedProject('worktree-unignored');
  await assert.rejects(
    createWorktree({project:root,target:'.worktrees/feature',branch:'feature-unignored'}),
    /must be ignored/i,
  );
});

test('ignored project-local worktree is attached without copying runtime state into the checkout',async()=>{
  const {root}=await committedProject('worktree-local');
  await writeFile(path.join(root,'.gitignore'),'.worktrees/\n');
  git(root,['add','.gitignore']); git(root,['commit','-qm','ignore worktrees']);
  const created=await createWorktree({project:root,target:'.worktrees/feature',branch:'feature-local'});
  assert.equal(created.project_id,(await discoverContract(root)).manifest.project_id);
  assert.notEqual(created.worktree_id,(await gitIdentity(root)).worktree_id);
  await assert.rejects(readFile(path.join(root,'.worktrees','feature','.vibetether','state','current.json')),/ENOENT/);
  const listed=await listAttachedWorktrees(root);
  assert.ok(listed.some((item)=>item.id===created.worktree_id&&item.live));
});

test('sibling and detached worktrees share Contract authority but keep stable independent identities',async()=>{
  const {root,base}=await committedProject('worktree-sibling');
  const sibling=path.join(base,'sibling');
  git(root,['worktree','add','-q','--detach',sibling]);
  const first=await attachFromDirectory(sibling);
  const identity=await gitIdentity(sibling);
  assert.match(identity.common_id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(identity.worktree_id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal((await executionSnapshot(sibling)).git.branch,null);
  const moved=path.join(base,'moved-sibling');
  git(root,['worktree','move',sibling,moved]);
  const second=await attachFromDirectory(moved);
  assert.equal(second.worktree_id,first.worktree_id);
  assert.equal((await gitIdentity(moved)).worktree_id,identity.worktree_id);
});



test('repository and worktree UUIDs survive alternate filesystem locators', async (context) => {
  const {root,base}=await committedProject('worktree-locator-alias');
  const sibling=path.join(base,'sibling');
  git(root,['worktree','add','-q','-b','locator-alias',sibling]);
  const first=await gitIdentity(sibling);
  const alias=path.join(base,'sibling-alias');
  try { await symlink(sibling,alias,'dir'); }
  catch(error){
    if(process.platform==='win32'&&['EPERM','EACCES'].includes(error.code)){ context.skip('Windows denied directory alias creation; the real short/long-path case runs in Windows CI.'); return; }
    throw error;
  }
  const second=await gitIdentity(alias);
  assert.equal(second.common_id,first.common_id);
  assert.equal(second.worktree_id,first.worktree_id);
});



test('Windows long and 8.3 short locators resolve to the same stable worktree UUID', {
  skip: process.platform !== 'win32',
}, async () => {
  const {root}=await committedProject('worktree-windows-short-path');
  const longIdentity=await gitIdentity(root);
  const {spawnSync}=await import('node:child_process');
  const query=spawnSync(`for %I in ("${root}") do @echo %~sI`,{encoding:'utf8',shell:true,windowsHide:true});
  assert.equal(query.status,0,query.stderr||query.stdout);
  const shortPath=query.stdout.trim();
  assert.ok(shortPath);
  const shortIdentity=await gitIdentity(shortPath);
  assert.equal(shortIdentity.common_id,longIdentity.common_id);
  assert.equal(shortIdentity.worktree_id,longIdentity.worktree_id);
});

test('a worktree from an unrelated repository cannot attach to another Contract root',async()=>{
  const {root}=await committedProject('worktree-contract');
  const other=await fixture('worktree-unrelated');
  await assert.rejects(attachFromDirectory(other.root,root),/same Git repository|different Git repository/i);
});

test('ten linked worktrees attach concurrently without registry lost updates or shared runtime paths',async()=>{
  const {root,base,state}=await committedProject('worktree-concurrent');
  const paths=[];
  for(let index=0;index<10;index+=1){
    const target=path.join(base,`wt-${index}`);
    git(root,['worktree','add','-q','-b',`parallel-${index}`,target]);
    paths.push(target);
  }
  const attached=await Promise.all(paths.map((target)=>attachFromDirectory(target)));
  assert.equal(new Set(attached.map((item)=>item.worktree_id)).size,10);
  assert.equal(new Set(attached.map((item)=>item.runtime)).size,10);
  const listed=await listAttachedWorktrees(root);
  for(const item of attached) assert.ok(listed.some((entry)=>entry.id===item.worktree_id&&entry.live));
  assert.ok(listed.length>=11);
  assert.ok(attached.every((item)=>item.runtime.startsWith(state)));
});

test('different worktrees may hold active writer leases at the same time',async()=>{
  const {root,base}=await committedProject('worktree-leases');
  const sibling=path.join(base,'sibling'); git(root,['worktree','add','-q','-b','lease-sibling',sibling]);
  const first=await startStep({project:root,phase:'EXECUTE_ONE',capability:'implementation',slice:'Change root fixture.',success_evidence:['Root check passes.'],success_checks:[testSuccessCheck('Root check passes.')],signals:['implementation'],agent:'codex',code_write:true,confirmed_by_user:true,decision_reason:'The test author approved this exact worktree fixture.'});
  const second=await startStep({project:sibling,phase:'EXECUTE_ONE',capability:'implementation',slice:'Change sibling fixture.',success_evidence:['Sibling check passes.'],success_checks:[testSuccessCheck('Sibling check passes.')],signals:['implementation'],agent:'codex',code_write:true,confirmed_by_user:true,decision_reason:'The test author approved this exact worktree fixture.'});
  assert.notEqual(first.route.id,second.route.id);
  assert.notEqual(first.route.execution_start.git.worktree_id,second.route.execution_start.git.worktree_id);
});

test('removal refuses an active step unless forced and cleans its runtime registration',async()=>{
  const {root,base}=await committedProject('worktree-remove');
  const sibling=path.join(base,'sibling'); git(root,['worktree','add','-q','-b','remove-sibling',sibling]);
  const attached=await attachFromDirectory(sibling);
  await startStep({project:sibling,phase:'EXECUTE_ONE',capability:'implementation',slice:'Temporary work.',success_evidence:['Check passes.'],success_checks:[testSuccessCheck('Check passes.')],signals:['implementation'],agent:'codex',code_write:true,confirmed_by_user:true,decision_reason:'The test author approved this exact worktree fixture.'});
  await assert.rejects(removeWorktree({project:root,target:sibling}),/active/i);
  const removed=await removeWorktree({project:root,target:sibling,force:true});
  assert.equal(removed.worktree_id,attached.worktree_id);
  assert.equal((await listAttachedWorktrees(root)).some((item)=>item.id===attached.worktree_id),false);
});

test('prune removes stale registry and runtime records after external Git worktree deletion',async()=>{
  const {root,base}=await committedProject('worktree-prune');
  const sibling=path.join(base,'sibling'); git(root,['worktree','add','-q','-b','prune-sibling',sibling]);
  const attached=await attachFromDirectory(sibling);
  git(root,['worktree','remove','--force',sibling]);
  const result=await pruneWorktrees(root);
  assert.ok(result.pruned.includes(attached.worktree_id));
});

test('handoff capsule is tamper-evident, single-accept, authority-bound, and evidence-bound',async()=>{
  const {root,base}=await committedProject('worktree-handoff');
  const parent=await runtimeFor(root);
  await startStep({project:root,phase:'EXECUTE_ONE',capability:'implementation',slice:'Parent slice.',success_evidence:['Child result is verified.'],success_checks:[testSuccessCheck('Child result is verified.')],signals:['implementation'],agent:'codex',code_write:true,confirmed_by_user:true,decision_reason:'The test author approved this exact worktree fixture.'});
  const handoff=await createHandoff(parent.context,parent.runtime.paths,{slice:'Implement child fixture.',success_evidence:['Child command passes.'],protected_capabilities:['Existing behavior'],permissions:{code_write:true,truth_write:false}});
  const sibling=path.join(base,'sibling'); git(root,['worktree','add','-q','-b','handoff-sibling',sibling]);
  const child=await runtimeFor(sibling);
  const accepted=await acceptHandoff(child.context,child.runtime.paths,handoff.id);
  assert.equal(accepted.accepted_by,child.runtime.paths.worktree_id);
  await assert.rejects(acceptHandoff(child.context,child.runtime.paths,handoff.id),/no longer pending/i);
  const snapshot=await executionSnapshot(sibling);
  const evidence=await recordEvidence(child.runtime.paths,{route_id:'handoff-child',kind:'command',command:[process.execPath,'-e','process.exit(0)'],cwd:sibling,authority_digest:handoff.authority_digest,skills_digest:'0'.repeat(64),execution_snapshot:snapshot});
  const finished=await finishHandoff(child.runtime.paths,handoff.id,[evidence.id]);
  assert.equal(finished.status,'completed');
});
