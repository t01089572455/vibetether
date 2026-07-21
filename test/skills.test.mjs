import assert from 'node:assert/strict';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { contractFinishOptions, fixture, initProject, mainJson, testSuccessCheck } from './helpers.mjs';
import { importProvider, providerObjectPath } from '../src/provider-cache.mjs';
import { approveProvider, evaluateProvider, exposeProvider, inspectSkill, loadActivation, promoteProvider, readSkillResource, execSkillScript, searchSkills } from '../src/skills.mjs';
import { loadProviderRegistry } from '../src/provider-registry.mjs';
import { brokerSkills } from '../src/skill-broker.mjs';
import { createSkillsLock, discoverContract } from '../src/contract.mjs';
import { writeProjectJson, readJsonFile } from '../src/files.mjs';
import { startStep, finishStep } from '../src/step.mjs';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';

async function providerFixture(base,id='focused-implementation',{large=false,permissions={code_write:true,network:false,external_write:false},negative=[]}={}) {
  const source=path.join(base,id); await mkdir(path.join(source,'scripts'),{recursive:true}); await mkdir(path.join(source,'references'),{recursive:true});
  const body=large?'x'.repeat(18*1024):'Perform only the selected bounded implementation slice and return evidence.';
  await writeFile(path.join(source,'SKILL.md'),`---\nname: ${id}\ndescription: Focused implementation provider for verified slices.\n---\n\n# ${id}\n\n${body}\n`);
  await writeFile(path.join(source,'references','guide.md'),'# Guide\n\nUse fresh evidence.\n');
  await writeFile(path.join(source,'scripts','echo.mjs'),'process.stdout.write(process.argv.slice(2).join(" "));\n');
  await writeFile(path.join(source,'scripts','env.mjs'),'process.stdout.write(process.env.VIBETETHER_TEST_SECRET ?? "");\n');
  return importProvider({id,source,source_label:`local:${id}`,version:'1.0.0',license:'MIT',capabilities:['implementation'],phases:['EXECUTE_ONE'],positive_triggers:['custom-implementation'],negative_triggers:negative,hosts:['codex','claude'],operating_systems:[process.platform],...permissions});
}

async function stableProvider(base,id='focused-implementation',options={}) {
  const card=await providerFixture(base,id,options);
  await evaluateProvider(id,{true_positive:9,false_positive:1,false_negative:0,output_gain:0.3,notes:'Deterministic fixture evaluation.'});
  await approveProvider(id); return promoteProvider(id);
}

async function pinProvider(root,card,{auto='stable-only',preference=true}={}) {
  const context=await discoverContract(root);
  const lock={...context.skills,auto_activate:auto,pins:[...context.skills.pins,{id:card.id,object_hash:card.object_hash,fingerprint:card.fingerprint,source:card.source,version:card.version,license:card.license}],preferences:preference?[card.id]:[],hotset:[]};
  await writeProjectJson(context.root,context.manifest.skills_lock,lock);
  return lock;
}

test('cold catalog search returns compact metadata instead of Provider instructions',async()=>{
  await fixture('skills-search');
  const results=await searchSkills('debug runtime');
  assert.ok(results.some((item)=>item.id==='vibetether-built-in-debugging'));
  assert.equal(JSON.stringify(results).includes('Root cause'),false);
  assert.ok(results.every((item)=>!Object.hasOwn(item,'path')));
});

test('external Provider requires evaluation before beta and stable promotion',async()=>{
  const {base}=await fixture('skills-promotion');
  const card=await providerFixture(base);
  assert.equal(card.channel,'experimental');
  await assert.rejects(approveProvider(card.id),/evaluation/i);
  const evaluated=await evaluateProvider(card.id,{true_positive:8,false_positive:2,false_negative:0,output_gain:0.2,notes:'Passed fixture eval.'});
  assert.equal(evaluated.quality.trigger_precision,0.8);
  assert.equal((await approveProvider(card.id)).channel,'beta');
  assert.equal((await promoteProvider(card.id)).channel,'stable');
});

test('Provider import is content-addressed, immutable by id, and rejects symlinks',async(t)=>{
  const {base}=await fixture('skills-cache');
  const first=await providerFixture(base,'immutable-provider');
  assert.equal(first.object_hash,first.fingerprint);
  assert.equal(first.path,providerObjectPath(first.object_hash));
  const other=path.join(base,'other'); await mkdir(other); await writeFile(path.join(other,'SKILL.md'),'---\nname: immutable-provider\ndescription: Changed bytes.\n---\nchanged\n');
  await assert.rejects(importProvider({id:'immutable-provider',source:other,version:'2.0.0',license:'MIT',capabilities:['implementation'],phases:['EXECUTE_ONE']}),/different bytes/i);
  const linked=path.join(base,'linked-provider'); await mkdir(linked); await writeFile(path.join(linked,'SKILL.md'),'---\nname: linked-provider\ndescription: Linked provider.\n---\n');
  try { await symlink(path.join(other,'SKILL.md'),path.join(linked,'guide.md'),'file'); } catch(error){ if(process.platform==='win32'&&['EPERM','EACCES'].includes(error.code)){t.skip('Windows denied symlink creation');return;} throw error; }
  await assert.rejects(importProvider({id:'linked-provider',source:linked,version:'1.0.0',license:'MIT',capabilities:['implementation'],phases:['EXECUTE_ONE']}),/symbolic link/i);
});

test('corrupt Provider cache bytes fail closed before routing or activation',async()=>{
  const {base}=await fixture('skills-corrupt');
  const card=await providerFixture(base,'corrupt-provider');
  await writeFile(path.join(card.path,'SKILL.md'),'corrupted\n');
  await assert.rejects(loadProviderRegistry(),/corrupt|fingerprint/i);
});

test('pinned stable Provider can be selected and activated with a tamper-evident receipt',async()=>{
  const {root,base}=await initProject('skills-activation');
  const card=await stableProvider(base);
  await pinProvider(root,card);
  const started=await startStep({project:root,phase:'EXECUTE_ONE',capability:'implementation',slice:'Use the focused Provider.',success_evidence:['Focused check passes.'],success_checks:[testSuccessCheck('Focused check passes.')],signals:['custom-implementation'],agent:'codex',provider:card.id,code_write:true,confirmed_by_user:true,decision_reason:'The test author approved this exact Provider activation fixture.'});
  assert.equal(started.route.provider.id,card.id);
  assert.equal(started.activation.mode,'inline');
  assert.match(started.activation.instructions,/selected bounded implementation/i);
  const context=await discoverContract(root); const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource); const runtime=await attachWorktree(context,authority.authority_digest);
  const guide=await readSkillResource(runtime.paths,started.activation.activation_id,'references/guide.md');
  assert.match(guide.content,/fresh evidence/i);
  const script=await execSkillScript(runtime.paths,started.activation.activation_id,'scripts/echo.mjs',['hello','world']);
  assert.equal(script.exit_code,0); assert.equal(script.stdout,'hello world');
  await assert.rejects(readSkillResource(runtime.paths,started.activation.activation_id,'../../secret'),/not declared|unsafe/i);
  const receiptPath=path.join(runtime.paths.activations,`${started.activation.activation_id}.json`);
  const receipt=await readJsonFile(receiptPath,'activation'); receipt.provider_id='vibetether-built-in-implementation'; await writeFile(receiptPath,`${JSON.stringify(receipt)}\n`);
  await assert.rejects(loadActivation(runtime.paths,started.activation.activation_id),/modified/i);
});

test('large Provider activates in worker mode and keeps instructions out of the main response',async()=>{
  const {root,base}=await initProject('skills-worker');
  const card=await stableProvider(base,'large-provider',{large:true}); await pinProvider(root,card);
  const started=await startStep({project:root,phase:'EXECUTE_ONE',capability:'implementation',slice:'Run large Provider in isolation.',success_evidence:['Worker result is verified.'],success_checks:[testSuccessCheck('Worker result is verified.')],signals:['custom-implementation'],agent:'codex',provider:card.id,code_write:true,confirmed_by_user:true,decision_reason:'The test author approved this exact Provider activation fixture.'});
  assert.equal(started.activation.mode,'worker'); assert.equal(started.activation.instructions,null); assert.match(started.activation.skill_handle,/^skill:act-/);
});

test('permission and negative-trigger filters refuse an otherwise matching explicit Provider',async()=>{
  const {root,base}=await initProject('skills-permissions');
  const card=await stableProvider(base,'privileged-provider',{permissions:{code_write:true,network:true,external_write:true},negative:['do-not-use-provider']}); await pinProvider(root,card);
  await assert.rejects(startStep({project:root,phase:'EXECUTE_ONE',capability:'implementation',slice:'Attempt provider.',success_evidence:['Check.'],success_checks:[testSuccessCheck('Check.')],signals:['custom-implementation'],agent:'codex',provider:card.id,code_write:true,confirmed_by_user:true,decision_reason:'The test author approved this exact Provider filter fixture.'}),/unavailable|inapplicable/i);
  await assert.rejects(startStep({project:root,phase:'EXECUTE_ONE',capability:'implementation',slice:'Attempt provider.',success_evidence:['Check.'],success_checks:[testSuccessCheck('Check.')],signals:['custom-implementation','do-not-use-provider'],agent:'codex',provider:card.id,code_write:true,network:true,external_write:true,confirmed_by_user:true,decision_reason:'The test author approved this exact Provider filter fixture.'}),/unavailable|inapplicable/i);
});

test('two recorded failures remove a Provider from automatic routing without deleting it',async()=>{
  const {base}=await fixture('skills-demotion');
  const card=await stableProvider(base,'affinity-provider');
  const registry=await loadProviderRegistry();
  const lock={...createSkillsLock(),pins:[{id:card.id,object_hash:card.object_hash,fingerprint:card.fingerprint,source:card.source,version:card.version,license:card.license}],preferences:[card.id]};
  const result=brokerSkills(registry,{phase:'EXECUTE_ONE',capability:'implementation',signals:['custom-implementation'],agent:'codex',permissions:{code_write:true,network:false,external_write:false}},lock,null,{[card.id]:{successes:0,failures:2}});
  assert.notEqual(result.selected.id,card.id);
  assert.ok((await inspectSkill(card.id)).id===card.id);
});

test('exposure is explicit and refuses to overwrite modified user-visible Skill bytes',async()=>{
  const {root,base}=await initProject('skills-expose');
  const card=await stableProvider(base,'exposed-provider');
  const context=await discoverContract(root);
  const exposed=await exposeProvider(context,card.id,{agent:'codex',scope:'project'});
  await writeFile(exposed.path,'user customization\n');
  await assert.rejects(exposeProvider(context,card.id,{agent:'codex',scope:'project'}),/overwrite modified/i);
});

test('hotset is capped at four entries by the project lock',async()=>{
  const {root}=await initProject('skills-hotset');
  for(const id of ['vibetether-built-in-alignment','vibetether-built-in-planning','vibetether-built-in-implementation','vibetether-built-in-debugging']) await mainJson(['skills','hotset','--project',root,'--id',id]);
  await assert.rejects(mainJson(['skills','hotset','--project',root,'--id','vibetether-built-in-review']),/hotset/i);
});


test('Provider scripts use a minimal environment and activation expires when the step exits',async()=>{
  const {root,base}=await initProject('skills-stale-activation');
  const card=await stableProvider(base,'stale-provider'); await pinProvider(root,card);
  const started=await startStep({project:root,phase:'EXECUTE_ONE',capability:'implementation',slice:'Use a bounded provider.',success_evidence:['Focused command succeeds.'],success_checks:[testSuccessCheck('Focused command succeeds.')],signals:['custom-implementation'],agent:'codex',provider:card.id,code_write:true,confirmed_by_user:true,decision_reason:'The test author approved this exact Provider activation fixture.'});
  const context=await discoverContract(root); const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource); const runtime=await attachWorktree(context,authority.authority_digest);
  process.env.VIBETETHER_TEST_SECRET='must-not-leak';
  try {
    const envResult=await execSkillScript(runtime.paths,started.activation.activation_id,'scripts/env.mjs',[]);
    assert.equal(envResult.stdout,'');
  } finally { delete process.env.VIBETETHER_TEST_SECRET; }
  await finishStep({project:root,...await contractFinishOptions(root)});
  await assert.rejects(execSkillScript(runtime.paths,started.activation.activation_id,'scripts/echo.mjs',['late']),/no longer attached|invalid activation/i);
});
