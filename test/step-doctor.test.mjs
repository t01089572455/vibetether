import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';
import { inspectProject } from '../src/doctor.mjs';
import { startStep, finishStep } from '../src/step.mjs';
import { discoverContract } from '../src/contract.mjs';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { contractFinishArgs, contractFinishOptions, initProject, jsonFile, mainJson, successCheckCliArgs, testSuccessCheck, writeJson } from './helpers.mjs';

async function start(root,extra=[]){return mainJson(['step','start','--project',root,'--phase','EXECUTE_ONE','--capability','implementation','--slice','Implement one bounded change','--success-evidence','Focused command passes',...successCheckCliArgs('Focused command passes'),'--signal','bug-fix','--code-write','--confirmed-by-user','--decision-reason','The test author approved this exact bounded implementation fixture.',...extra]);}
async function finish(root,extra=[]){return mainJson(['step','finish','--project',root,...await contractFinishArgs(root),...extra]);}

test('step start and finish bind one Provider, fresh evidence, authority, and runtime state',async()=>{
  const {root}=await initProject('step-success'); const started=await start(root); assert.equal(started.route.status,'active'); assert.ok(started.activation.activation_id);
  const finished=await finish(root); assert.equal(finished.route.status,'satisfied'); assert.equal(finished.evidence.successful,true);
  const report=await inspectProject({project:root,boundary:'completion',throw_on_error:false}); assert.equal(report.ok,true);
});

test('failed evidence keeps the step active and records an honest failure',async()=>{
  const {root}=await initProject('step-fail');
  const claim='Focused command passes';
  const failing={id:'failing-focused-check',claim,kind:'command',command:[process.execPath,'-e','process.exit(7)'],covers_paths:['vibetether-test-output.txt'],consumer_paths:['vibetether-test-output.txt']};
  await main(['step','start','--project',root,'--phase','EXECUTE_ONE','--capability','implementation','--slice','Implement one bounded change','--success-evidence',claim,'--success-check-json',JSON.stringify(failing),'--signal','bug-fix','--code-write','--confirmed-by-user','--decision-reason','The test author approved this exact failing-evidence fixture.']);
  await assert.rejects(main(['step','finish','--project',root]),/remains active/i);
  const c=await discoverContract(root); const a=await authoritySnapshot(c.executionRoot,parseTruthMap(c.truthSource),c.intentSource); const rt=await attachWorktree(c,a.authority_digest); const route=await jsonFile(rt.paths.route);
  assert.equal(route.status,'active'); assert.equal(route.evidence_ids.length,1);
  await main(['step','abandon','--project',root,'--reason','The verification command failed.']);
});

test('assertion-only evidence cannot satisfy implementation or verification phases',async()=>{
  const {root}=await initProject('proxy-evidence'); await start(root);
  await assert.rejects(main(['step','finish','--project',root,'--evidence','I think it works']),/predeclared success check|command or artifact/i);
  await main(['step','abandon','--project',root,'--reason','Proxy evidence was insufficient.']);
});

test('doctor detects worktree changes after completion evidence',async()=>{
  const {root}=await initProject('doctor-drift'); await start(root); await finish(root);
  await writeFile(path.join(root,'app.txt'),'changed after evidence\n');
  const ordinary=await inspectProject({project:root,boundary:'ordinary',throw_on_error:false}); assert.ok(ordinary.warnings.some((item)=>item.code==='STALE_EXECUTION_SNAPSHOT'));
  const completion=await inspectProject({project:root,boundary:'completion',throw_on_error:false}); assert.ok(completion.issues.some((item)=>item.code==='STALE_EXECUTION_SNAPSHOT'));
});

test('completion doctor fails while a step remains active',async()=>{
  const {root}=await initProject('doctor-active'); await start(root);
  const report=await inspectProject({project:root,boundary:'completion',throw_on_error:false}); assert.ok(report.issues.some((item)=>item.code==='ACTIVE_ROUTE'));
  await main(['step','abandon','--project',root,'--reason','Test cleanup.']);
});

test('no-material-change cannot hide edits to a confirmed authority source',async()=>{
  const {root}=await initProject('truth-drift-step'); await writeFile(path.join(root,'rule.md'),'# Rule\nOriginal governing rule.\n');
  await main(['truth','add','--project',root,'--path','rule.md','--role','requirement','--scope','.','--yes']); await main(['truth','confirm','--project',root,'--path','rule.md','--yes']); await main(['step','reanchor','--project',root]);
  await start(root); await writeFile(path.join(root,'rule.md'),'# Rule\nChanged governing rule.\n');
  await assert.rejects(finish(root),/Confirmed authority changed/i);
  await main(['step','abandon','--project',root,'--reason','Authority changed and requires a user decision.','--truth-decision','applied','--truth-path','rule.md']);
});

test('candidate-pending keeps candidate bytes non-authoritative at step exit',async()=>{
  const {root}=await initProject('candidate-pending'); await start(root); await writeFile(path.join(root,'proposal.md'),'# Proposal\nProposed future direction.\n');
  await main(['truth','add','--project',root,'--path','proposal.md','--role','proposal','--scope','.','--yes']);
  const result=await finish(root,['--truth-decision','candidate-pending','--truth-path','proposal.md']); assert.equal(result.route.truth_reconciliation.status,'candidate_pending');
});

test('applied reconciliation permits only the declared confirmed Truth change',async()=>{
  const {root}=await initProject('truth-applied'); await start(root); await writeFile(path.join(root,'approved.md'),'# Approved\nUser-approved governing direction.\n');
  await main(['truth','add','--project',root,'--path','approved.md','--role','direction','--scope','.','--yes']); await main(['truth','confirm','--project',root,'--path','approved.md','--yes']);
  const result=await finish(root,['--truth-decision','applied','--truth-path','approved.md']); assert.equal(result.route.truth_reconciliation.status,'applied');
});

test('a second writer cannot start in the same worktree',async()=>{
  const {root}=await initProject('lease'); await start(root);
  await assert.rejects(start(root),/active step|writer lease/i);
  await main(['step','abandon','--project',root,'--reason','Lease test cleanup.']);
});

test('reanchor updates stale authority only when no step is active',async()=>{
  const {root}=await initProject('reanchor'); await writeFile(path.join(root,'new-rule.md'),'# New rule\nA new approved source.\n');
  await main(['truth','add','--project',root,'--path','new-rule.md','--role','requirement','--scope','.','--yes']); await main(['truth','confirm','--project',root,'--path','new-rule.md','--yes']);
  const current=await mainJson(['step','reanchor','--project',root,'--reason','Reviewed and accepted new rule.']); assert.equal(current.open_risks.length,0);
  await start(root); await assert.rejects(main(['step','reanchor','--project',root]),/active/i); await main(['step','abandon','--project',root,'--reason','Cleanup.']);
});

test('doctor detects a tampered evidence receipt even if stored fields still claim success',async()=>{
  const {root}=await initProject('doctor-tamper'); await start(root); const finished=await finish(root); const id=finished.evidence.id;
  const c=await discoverContract(root); const a=await authoritySnapshot(c.executionRoot,parseTruthMap(c.truthSource),c.intentSource); const rt=await attachWorktree(c,a.authority_digest);
  const p=path.join(rt.paths.evidence,`${id}.json`); const record=await jsonFile(p); record.stdout_summary='tampered'; await writeJson(p,record);
  const report=await inspectProject({project:root,boundary:'completion',throw_on_error:false}); assert.ok(report.issues.some((item)=>/EVIDENCE|RECEIPT/.test(item.code)));
});

test('verified reusable success creates a pending Experience candidate without interrupting completion',async()=>{
  const {root}=await initProject('success-capture');
  await startStep({project:root,phase:'EXECUTE_ONE',capability:'implementation',slice:'Recover the non-obvious local workflow.',success_evidence:['Focused recovery command passes.'],success_checks:[testSuccessCheck('Focused recovery command passes.')],signals:['bug-fix','recovered-path'],agent:'codex',provider:'vibetether-built-in-implementation',code_write:true,confirmed_by_user:true,decision_reason:'The test author approved this exact reusable local workflow slice.'});
  const finished=await finishStep({project:root,...await contractFinishOptions(root)});
  assert.equal(finished.experience_capture.disposition,'recovered-path');
  assert.match(finished.experience_capture.candidate_id,/^capture-/);
  const context=await discoverContract(root);
  const candidate=context.experience.entries.find((entry)=>entry.id===finished.experience_capture.candidate_id);
  assert.equal(candidate.status,'candidate');
  assert.ok(candidate.artifacts.length>=2);
  const candidateDoc=candidate.artifacts.find((item)=>/^docs\/operations\/vibetether-candidates\/capture-/.test(item.path));
  assert.ok(candidateDoc);
  assert.match(candidateDoc.sha256,/^[a-f0-9]{64}$/);
  assert.ok(candidate.artifacts.some((item)=>item.path==='vibetether-test-output.txt'&&/^[a-f0-9]{64}$/.test(item.sha256)));
  assert.deepEqual(candidate.evidence_ids,[finished.evidence.id]);
  assert.ok(candidate.observed_sequence.length>=3);
  assert.ok(candidate.reusability_reasons.length>=1);
});

test('routine verified success is classified without creating Experience noise',async()=>{
  const {root}=await initProject('success-routine');
  await startStep({project:root,phase:'EXECUTE_ONE',capability:'implementation',slice:'Apply a routine local change.',success_evidence:['Focused command passes.'],success_checks:[testSuccessCheck('Focused command passes.')],signals:['bug-fix'],agent:'codex',provider:'vibetether-built-in-implementation',code_write:true,confirmed_by_user:true,decision_reason:'The test author approved this exact routine local change.'});
  const finished=await finishStep({project:root,...await contractFinishOptions(root)});
  assert.equal(finished.experience_capture.disposition,'routine-non-path');
  const context=await discoverContract(root);
  assert.equal(context.experience.entries.length,0);
});
