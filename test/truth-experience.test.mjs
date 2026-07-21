import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';
import { discoverContract, skillsLockDigest } from '../src/contract.mjs';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import { auditExperience, validateExperienceIndex } from '../src/experience.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { contractFinishArgs, initProject, jsonFile, mainJson, successCheckCliArgs, writeJson } from './helpers.mjs';

async function authority(root){const c=await discoverContract(root);return authoritySnapshot(c.executionRoot,parseTruthMap(c.truthSource),c.intentSource);}
async function successfulEvidence(root){
  await main(['step','start','--project',root,'--phase','EXECUTE_ONE','--capability','implementation','--slice','Produce reusable evidence','--success-evidence','Command succeeds',...successCheckCliArgs('Command succeeds'),'--signal','bug-fix','--code-write','--confirmed-by-user','--decision-reason','The test author approved this exact reusable-evidence fixture.']);
  const finished=await mainJson(['step','finish','--project',root,...await contractFinishArgs(root)]);
  return finished.evidence.id;
}

test('candidate Truth does not change active authority, but confirmation does',async()=>{
  const {root}=await initProject('truth-authority'); const before=await authority(root);
  await writeFile(path.join(root,'direction.md'),'# Direction\nApproved direction bytes.\n');
  await main(['truth','add','--project',root,'--path','direction.md','--role','product-direction','--scope','.','--yes']);
  const candidate=await authority(root); assert.equal(candidate.authority_digest,before.authority_digest);
  await main(['truth','confirm','--project',root,'--path','direction.md','--yes']);
  const confirmed=await authority(root); assert.notEqual(confirmed.authority_digest,before.authority_digest);
});

test('superseding Truth retires the old confirmed source',async()=>{
  const {root}=await initProject('truth-supersede');
  await writeFile(path.join(root,'old.md'),'# Old\nOld governing direction.\n');
  await writeFile(path.join(root,'new.md'),'# New\nReplacement governing direction.\n');
  await main(['truth','add','--project',root,'--path','old.md','--role','direction','--scope','.','--yes']);
  await main(['truth','confirm','--project',root,'--path','old.md','--yes']);
  await main(['truth','add','--project',root,'--path','new.md','--role','direction','--scope','.','--supersedes','old.md','--yes']);
  await main(['truth','confirm','--project',root,'--path','new.md','--yes']);
  const map=parseTruthMap((await discoverContract(root)).truthSource);
  assert.deepEqual(map.confirmed.map((item)=>item.path),['new.md']);
  assert.ok(map.declined.some((item)=>item.path==='old.md'&&/Superseded/.test(item.reason)));
});

test('Truth registry rejects duplicate paths across states',async()=>{
  const {root}=await initProject('truth-duplicate'); await writeFile(path.join(root,'x.md'),'# X\nEnough content here.\n');
  await main(['truth','add','--project',root,'--path','x.md','--role','reference','--scope','.','--yes']);
  await assert.rejects(main(['truth','add','--project',root,'--path','x.md','--role','reference','--scope','.','--yes']),/already registered/i);
});

test('confirmed Truth must exist and remain a safe regular source',async()=>{
  const {root}=await initProject('truth-missing'); await writeFile(path.join(root,'gone.md'),'# Gone\nIt exists for confirmation.\n');
  await main(['truth','add','--project',root,'--path','gone.md','--role','reference','--scope','.','--yes']);
  await main(['truth','confirm','--project',root,'--path','gone.md','--yes']);
  await import('node:fs/promises').then(({rm})=>rm(path.join(root,'gone.md')));
  await assert.rejects(authority(root),/ENOENT|missing/i);
});

test('proven Experience is recalled only while artifact, evidence, authority, skills, and environment remain fresh',async()=>{
  const {root}=await initProject('experience-proven');
  const runbook=path.join(root,'runbook.md'); await writeFile(runbook,'# Runbook\nUse this verified sequence for publication.\n');
  const evidenceId=await successfulEvidence(root);
  await main(['experience','add','--project',root,'--id','publish-path','--trigger','publish','--artifact','runbook.md','--yes']);
  await main(['experience','confirm','--project',root,'--id','publish-path','--evidence-id',evidenceId,'--yes']);
  const capsule=await mainJson(['context','--project',root,'--phase','SHIP','--capability','proven-path-recall','--signal','publish']);
  assert.deepEqual(capsule.experience.map((item)=>item.id),['publish-path']);
  await writeFile(runbook,'# Runbook\nThe bytes changed and require revalidation.\n');
  const stale=await mainJson(['experience','audit','--project',root]);
  assert.equal(stale[0].effective_status,'suspect'); assert.ok(stale[0].reasons.includes('artifact-changed'));
});

test('authority and skills changes independently make a proven path suspect',async()=>{
  const {root}=await initProject('experience-digests'); await writeFile(path.join(root,'runbook.md'),'# Runbook\nA non-trivial verified procedure.\n');
  const evidenceId=await successfulEvidence(root);
  await main(['experience','add','--project',root,'--id','path-one','--trigger','build','--artifact','runbook.md','--yes']);
  await main(['experience','confirm','--project',root,'--id','path-one','--evidence-id',evidenceId,'--yes']);
  await writeFile(path.join(root,'truth.md'),'# Truth\nNew confirmed requirement.\n');
  await main(['truth','add','--project',root,'--path','truth.md','--role','requirement','--scope','.','--yes']); await main(['truth','confirm','--project',root,'--path','truth.md','--yes']);
  const authorityStale=await mainJson(['experience','audit','--project',root]); assert.ok(authorityStale[0].reasons.includes('authority-changed'));
  const c=await discoverContract(root); const lock={...c.skills,preferences:['vibetether-built-in-tdd']}; await writeJson(path.join(root,'.vibetether','skills.lock.json'),lock);
  const both=await mainJson(['experience','audit','--project',root]); assert.ok(both[0].reasons.includes('skills-changed'));
});

test('trivial artifacts cannot be promoted to proven Experience',async()=>{
  const {root}=await initProject('experience-trivial'); await writeFile(path.join(root,'tiny.md'),'short'); const evidenceId=await successfulEvidence(root);
  await main(['experience','add','--project',root,'--id','tiny-path','--trigger','build','--artifact','tiny.md','--yes']);
  await assert.rejects(main(['experience','confirm','--project',root,'--id','tiny-path','--evidence-id',evidenceId,'--yes']),/artifact-trivial/i);
});

test('Experience schema rejects future verification dates and fake proven entries',async()=>{
  const future=new Date(Date.now()+86400000).toISOString();
  const index={schema_version:2,entries:[{id:'fake',status:'proven',use_when:['build'],systems:[],artifacts:[{path:'runbook.md',sha256:'a'.repeat(64)}],verified_at:future,review_after:new Date(Date.now()+2*86400000).toISOString(),revalidate_when:[],verification:{authority_digest:'b'.repeat(64),skills_digest:'c'.repeat(64),evidence_ids:['ev-00000000-0000-0000-0000-000000000000']},environment:{os:process.platform,node_major:Number(process.versions.node.split('.')[0])},counterevidence:[]}]};
  assert.throws(()=>validateExperienceIndex(index),/future/i);
});

test('tampered evidence receipt invalidates Experience health',async()=>{
  const {root}=await initProject('experience-tamper'); await writeFile(path.join(root,'runbook.md'),'# Runbook\nA verified and reusable sequence.\n'); const evidenceId=await successfulEvidence(root);
  await main(['experience','add','--project',root,'--id','tamper-path','--trigger','build','--artifact','runbook.md','--yes']); await main(['experience','confirm','--project',root,'--id','tamper-path','--evidence-id',evidenceId,'--yes']);
  const c=await discoverContract(root); const a=await authoritySnapshot(c.executionRoot,parseTruthMap(c.truthSource),c.intentSource); const rt=await attachWorktree(c,a.authority_digest);
  for (const dir of [rt.paths.evidence,rt.paths.repository_evidence]) { const p=path.join(dir,`${evidenceId}.json`); const rec=await jsonFile(p); rec.successful=false; await writeJson(p,rec); }
  const health=await auditExperience(c,rt.paths,c.experience,{authorityDigest:a.authority_digest,skillsDigest:skillsLockDigest(c.skills),signals:['build']});
  assert.equal(health[0].effective_status,'suspect'); assert.ok(health[0].reasons.includes('evidence-missing'));
});
