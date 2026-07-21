import assert from 'node:assert/strict';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cli, fixture, git, initProject, mainJson, successCheckCliArgs } from './helpers.mjs';
import { installGlobalEntry, uninstallGlobalEntry } from '../src/global-entry.mjs';
import { uninstallProject } from '../src/uninstall.mjs';
import { discoverContract } from '../src/contract.mjs';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { readCurrent } from '../src/runtime.mjs';
import { safeRelative, writeProjectText } from '../src/files.mjs';

const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('real CLI subprocess reports version, creates a Contract, and returns machine-readable context',async()=>{
  const f=await fixture('cli-e2e');
  const env={VIBETETHER_STATE_HOME:f.state,VIBETETHER_CACHE_HOME:f.cache,VIBETETHER_CONFIG_HOME:f.config};
  const version=cli(sourceRoot,['--version'],env); assert.equal(version.status,0); assert.equal(version.stdout.trim(),'1.0.0-rc.3');
  const init=cli(sourceRoot,['init','--project',f.root,'--agent','codex','--goal','CLI goal','--success-evidence','CLI evidence','--confirmed','--yes','--json'],env);
  assert.equal(init.status,0,init.stderr); assert.equal(JSON.parse(init.stdout).status,'initialized');
  const context=cli(sourceRoot,['context','--project',f.root,'--boundary','task-entry','--json'],env);
  assert.equal(context.status,0,context.stderr); assert.equal(JSON.parse(context.stdout).readiness.verdict,'READY_FOR_IMPLEMENT_ONE');
});

test('CLI uses stable exit-code classes for usage, safety, and health failures',async()=>{
  const bad=cli(sourceRoot,['unknown-command']); assert.equal(bad.status,2); assert.match(bad.stderr,/Unknown command/);
  const {root,state,cache,config}=await initProject('cli-exits');
  const env={VIBETETHER_STATE_HOME:state,VIBETETHER_CACHE_HOME:cache,VIBETETHER_CONFIG_HOME:config};
  const unsafe=cli(sourceRoot,['truth','add','--project',root,'--path','../outside.md','--role','reference','--yes'],env);
  assert.equal(unsafe.status,3); assert.match(unsafe.stderr,/escapes the project/i);
  const active=cli(sourceRoot,['step','start','--project',root,'--phase','EXECUTE_ONE','--capability','implementation','--slice','Leave active.','--success-evidence','A command passes.',...successCheckCliArgs('A command passes.'),'--signal','bug-fix','--agent','codex','--code-write','--confirmed-by-user','--decision-reason','The test author approved this exact active-route fixture.','--json'],env);
  assert.equal(active.status,0,active.stderr);
  const doctor=cli(sourceRoot,['doctor','--project',root,'--boundary','completion','--json'],env);
  assert.equal(doctor.status,4); assert.equal(JSON.parse(doctor.stdout).ok,false);
});

test('credential-like text and credential paths are rejected before persistence or execution',async()=>{
  assert.throws(()=>safeRelative('.env'),/credential|sensitive/i);
  const {root}=await initProject('secret-safety');
  await assert.rejects(writeProjectText(root,'.vibetether/notes.md','access_token=abcdefghijklmnopqrstuvwxyz123456'),/credential|secret/i);
  await assert.rejects(mainJson(['step','start','--project',root,'--phase','EXECUTE_ONE','--capability','implementation','--slice','Use ghp_abcdefghijklmnopqrstuvwxyz1234567890','--success-evidence','Check passes.','--signal','bug-fix','--agent','codex','--code-write']),/credential|private key/i);
});

test('invalid runtime checkpoint is quarantined and never treated as recovery authority',async()=>{
  const {root}=await initProject('runtime-quarantine');
  const context=await discoverContract(root); const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource); const first=await attachWorktree(context,authority.authority_digest);
  await writeFile(first.paths.current,'{"schema_version":1,"doctor_verdict":"PASS"}\n');
  const second=await attachWorktree(context,authority.authority_digest);
  const current=await readCurrent(second.paths);
  assert.equal(current.phase,'BLOCKED'); assert.equal(current.status,'blocked');
  assert.equal(JSON.stringify(current).includes('doctor_verdict'),false);
});

test('project writes reject symlink targets even when the link resolves inside the project',async(t)=>{
  const {root}=await initProject('write-symlink');
  const target=path.join(root,'real.md'); await writeFile(target,'real\n');
  const link=path.join(root,'linked.md');
  try { await symlink(target,link,'file'); } catch(error){ if(process.platform==='win32'&&['EPERM','EACCES'].includes(error.code)){t.skip('Windows denied symlink creation');return;} throw error; }
  await assert.rejects(writeProjectText(root,'linked.md','replacement\n'),/symbolic-link/i);
  assert.equal(await readFile(target,'utf8'),'real\n');
});

test('global entry installation is previewable, transactional, and refuses modified bytes on uninstall',async()=>{
  const f=await fixture('global-entry',{gitRepo:false});
  const binDir=path.join(f.base,'bin');
  const preview=await installGlobalEntry({agent:'codex',bin_dir:binDir,dry_run:true});
  assert.equal(preview.status,'preview');
  assert.ok(preview.files.every((file)=>file.startsWith(f.userHome)||file.startsWith(binDir)));
  const installed=await installGlobalEntry({agent:'codex',bin_dir:binDir,yes:true});
  assert.equal(installed.status,'installed');
  assert.ok(installed.files.every((file)=>file.startsWith(f.userHome)||file.startsWith(binDir)));
  const dispatcher=installed.files.find((file)=>file.startsWith(binDir));
  await writeFile(dispatcher,'user modification\n');
  await assert.rejects(uninstallGlobalEntry({agent:'codex',bin_dir:binDir,yes:true}),/modified global dispatcher/i);
});

test('project uninstall preserves the user Contract by default and refuses modified entry Skill bytes',async()=>{
  const {root}=await initProject('uninstall-preserve');
  const preview=await uninstallProject({project:root,agent:'codex',dry_run:true});
  assert.equal(preview.preserves_user_contract,true);
  await uninstallProject({project:root,agent:'codex',yes:true});
  assert.ok((await readFile(path.join(root,'.vibetether','project.json'),'utf8')).includes('vibetether_version'));
  const other=await initProject('uninstall-modified');
  const skill=path.join(other.root,'.agents','skills','vibe-tether','SKILL.md'); await writeFile(skill,'user customization\n');
  await assert.rejects(uninstallProject({project:other.root,agent:'codex',yes:true}),/modified entry Skill/i);
});

test('context resource reads enforce offset and maximum-size bounds',async()=>{
  const {root}=await initProject('context-read-bounds');
  await writeFile(path.join(root,'truth.md'),'# Truth\n\n'+('a'.repeat(1000))+'\n');
  await mainJson(['truth','add','--project',root,'--path','truth.md','--role','reference','--yes']);
  await mainJson(['truth','confirm','--project',root,'--path','truth.md','--yes']);
  const context=await mainJson(['context','--project',root]);
  const handle=context.truth[0].handle;
  await assert.rejects(mainJson(['context','read',handle,'--project',root,'--limit','70000']),/limit/i);
  await assert.rejects(mainJson(['context','read',handle,'--project',root,'--offset','-1']),/offset/i);
});

test('global dispatcher discovers the pinned version from an external local Contract', async()=>{
  const f=await fixture('dispatcher-local');
  await mainJson(['init','--project',f.root,'--agent','codex','--control-mode','local','--goal','Local dispatcher goal','--success-evidence','Dispatcher uses pinned version','--confirmed','--yes']);
  const context=await discoverContract(f.root);
  const manifestPath=path.join(context.root,'.vibetether','project.json');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8')); manifest.vibetether_version='9.8.7'; await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
  const {renderGlobalDispatcher}=await import('../src/launcher.mjs');
  const dispatcher=path.join(f.base,'vibetether-dispatcher.mjs'); await writeFile(dispatcher,renderGlobalDispatcher('1.0.0'));
  const fakeBin=path.join(f.base,'fake-bin'); await mkdir(fakeBin); const argsFile=path.join(f.base,'args.txt');
  const env={...process.env,VIBETETHER_STATE_HOME:f.state,VT_ARGS_FILE:argsFile};
  if(process.platform==='win32'){
    const npmCli=path.join(fakeBin,'npm-cli.js');
    await writeFile(npmCli,'// npm fixture\n','utf8');
    await writeFile(path.join(fakeBin,'npx-cli.js'),"require('node:fs').writeFileSync(process.env.VT_ARGS_FILE,process.argv.slice(2).join('\\n')+'\\n');\n",'utf8');
    env.npm_execpath=npmCli;
  } else {
    const fake=path.join(fakeBin,'npx'); await writeFile(fake,'#!/bin/sh\nprintf "%s\\n" "$@" > "$VT_ARGS_FILE"\n',{mode:0o755});
    env.PATH=`${fakeBin}:${process.env.PATH}`;
  }
  const {spawnSync}=await import('node:child_process');
  const result=spawnSync(process.execPath,[dispatcher,'--version'],{cwd:f.root,encoding:'utf8',env});
  assert.equal(result.status,0,result.stderr);
  const args=await readFile(argsFile,'utf8');
  assert.match(args,/--package=https:\/\/codeload\.github\.com\/t01089572455\/vibetether\/tar\.gz\/refs\/tags\/v9\.8\.7/);
});
