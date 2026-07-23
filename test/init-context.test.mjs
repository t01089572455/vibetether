import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';
import { buildContext } from '../src/context.mjs';
import { discoverContract } from '../src/contract.mjs';
import { renderProjectLauncher, officialPackage } from '../src/launcher.mjs';
import { fixture, git, initProject, jsonFile, mainJson } from './helpers.mjs';

test('team initialization creates a lean tracked Contract without runtime or provider catalogs', async()=>{
  const {root}=await initProject('lean');
  const files=['project.json','intent.md','TRUTH.md','experience.json','skills.lock.json','routes.json','vt.mjs'];
  let bytes=0; for (const file of files) bytes+=(await lstat(path.join(root,'.vibetether',file))).size;
  assert.ok(bytes<25*1024,`contract bytes ${bytes}`);
  await assert.rejects(lstat(path.join(root,'.vibetether','state')),/ENOENT/);
  await assert.rejects(lstat(path.join(root,'.vibetether','providers')),/ENOENT/);
  assert.match(await readFile(path.join(root,'AGENTS.md'),'utf8'),/vibetether context/);
});

test('initialization refuses a modified entry Skill instead of overwriting it',async()=>{
  const {root}=await fixture('collision');
  await mkdir(path.join(root,'.agents','skills','vibe-tether'),{recursive:true});
  await writeFile(path.join(root,'.agents','skills','vibe-tether','SKILL.md'),'custom\n');
  await assert.rejects(main(['init','--project',root,'--agent','codex','--yes']),/different or modified entry Skill/i);
});

test('context validates first and remains below the hard capsule budget',async()=>{
  const {root}=await initProject('context');
  const capsule=await buildContext({project:root});
  assert.equal(capsule.readiness.verdict,'READY_FOR_IMPLEMENT_ONE');
  assert.ok(Buffer.byteLength(JSON.stringify(capsule))<=4096);
  assert.equal(capsule.raw_state_policy.includes('Do not read raw runtime'),true);
});

test('candidate Truth is not returned as an implementation handle',async()=>{
  const {root}=await initProject('candidate');
  await writeFile(path.join(root,'candidate.md'),'# Candidate\nThis is not active.\n');
  await main(['truth','add','--project',root,'--path','candidate.md','--role','proposal','--scope','.','--yes']);
  const capsule=await buildContext({project:root});
  assert.deepEqual(capsule.truth,[]);
});

test('contract discovery refuses a symlinked manifest',async(t)=>{
  const {root,base}=await initProject('symlink-contract');
  const manifest=path.join(root,'.vibetether','project.json'); const outside=path.join(base,'outside.json');
  await writeFile(outside,await readFile(manifest)); await import('node:fs/promises').then(({rm})=>rm(manifest));
  try { await symlink(outside,manifest,'file'); } catch(error){ if(process.platform==='win32'&&['EPERM','EACCES'].includes(error.code)){t.skip('Windows denied symlink creation');return;} throw error; }
  await assert.rejects(discoverContract(root),/symbolic-link/i);
});

test('local Contract is discoverable from a sibling linked worktree',async()=>{
  const {root,base}=await fixture('local-mode');
  await main(['init','--project',root,'--agent','codex','--control-mode','local','--goal','Local goal','--success-evidence','Local evidence','--confirmed','--yes']);
  const sibling=path.join(base,'sibling'); git(root,['worktree','add','-q','-b','sibling',sibling]);
  const contract=await discoverContract(sibling);
  assert.equal(contract.manifest.control_mode,'local'); assert.equal(contract.shared,true);
  assert.equal(await realpath(contract.executionRoot),await realpath(sibling));
});

test('non-interactive init without direction creates a safe draft instead of inventing a goal',async()=>{
  const {root}=await fixture('draft');
  await main(['init','--project',root,'--agent','codex','--yes']);
  const context=await discoverContract(root);
  assert.match(context.intentSource,/Status: draft/);
  const capsule=await buildContext({project:root});
  assert.equal(capsule.readiness.verdict,'BLOCKED_BY_CONFLICT_OR_AUTHORIZATION');
  assert.ok(capsule.readiness.blockers.some((item)=>item.code==='INTENT_UNCONFIRMED'));
});

test('project launcher accepts only immutable acquisition and fails closed without a verified cache',async()=>{
  const commit='a'.repeat(40);
  assert.equal(officialPackage(commit),`https://codeload.github.com/t01089572455/vibetether/tar.gz/${commit}`);
  assert.throws(()=>officialPackage('1.0.0-rc.3'),/immutable|commit/i);
  assert.throws(()=>officialPackage('../main'),/immutable|commit/i);
  const source=renderProjectLauncher('1.0.0-rc.4');
  assert.doesNotMatch(source,/refs\/tags|runPortablePackage|\bnpx\b|VIBETETHER_CLI_PACKAGE/);
  assert.match(source,/no verified local runtime cache/i);
});

test('local-mode dry run does not create an external Contract directory',async()=>{
  const {root,state}=await fixture('local-dry-run');
  const preview=await mainJson(['init','--project',root,'--agent','codex','--control-mode','local','--goal','Preview goal','--success-evidence','Preview evidence','--confirmed','--dry-run']);
  assert.equal(preview.status,'preview');
  const {readdir}=await import('node:fs/promises');
  await assert.rejects(readdir(path.join(state,'local-contracts')),/ENOENT/);
});
