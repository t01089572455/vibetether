import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';
import { buildContext, readContextHandle } from '../src/context.mjs';
import { discoverContract } from '../src/contract.mjs';
import { inspectProject } from '../src/doctor.mjs';
import { parseIntent } from '../src/intent.mjs';
import { migrate, rollbackMigration } from '../src/migrate.mjs';
import { readRoute } from '../src/runtime.mjs';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { fixture, initProject, mainJson, successCheckCliArgs } from './helpers.mjs';

async function legacyFixture(name,{withClaude=true}={}) {
  const f=await fixture(name);
  const vt=path.join(f.root,'.vibetether');
  await mkdir(path.join(vt,'state'),{recursive:true});
  await writeFile(path.join(vt,'project.yaml'),'schema_version: 1\nprofile: standard\ntruth_index: .vibetether/TRUTH.md\nsources:\n  requirements:\n    - docs/spec.md\n');
  await mkdir(path.join(f.root,'docs'),{recursive:true});
  await writeFile(path.join(f.root,'docs','spec.md'),'# Spec\n');
  await writeFile(path.join(vt,'TRUTH.md'),'# Legacy truth prose\n');
  const metadata=Buffer.from(JSON.stringify({
    goal:'Preserve the real legacy goal.',
    success_evidence:'Legacy migration remains reversible.',
    scope_boundaries:['Do not change public behavior.'],
    constraints:['Preserve existing project instructions and higher-authority decisions.','Confirm destructive actions and releases before execution.'],
    visual_direction:null,
  }),'utf8').toString('base64url');
  await writeFile(path.join(vt,'intent.md'),`# VibeTether Intent Contract\n\nStatus: confirmed\n<!-- vibetether:intent:v1 ${metadata} -->\n\nThis contract is legacy.\n\n## Goal\n\nPreserve the real legacy goal.\n\n## Success evidence\n\nLegacy migration remains reversible.\n\n## Scope boundaries\n\n- Do not change public behavior.\n\n## Non-negotiable constraints\n\n- Preserve existing project instructions and higher-authority decisions.\n- Confirm destructive actions and releases before execution.\n\n## Visual direction\n\nNo visual direction has been recorded yet.\n\n## Open direction decisions\n\nNo open direction decisions.\n`);
  await writeFile(path.join(vt,'experience-index.yaml'),'schema_version: 1\nentries: []\n');
  await writeFile(path.join(f.root,'AGENTS.md'),'# Existing AGENTS\n');
  if(withClaude) await writeFile(path.join(f.root,'CLAUDE.md'),'# Existing CLAUDE\n');
  return f;
}

test('Truth handles are stable identifiers and read the advertised source',async()=>{
  const {root}=await initProject('truth-stable-handle');
  await writeFile(path.join(root,'z.md'),'Z content\n');
  await writeFile(path.join(root,'a.md'),'A content\n');
  for(const name of ['z.md','a.md']) {
    await main(['truth','add','--project',root,'--path',name,'--role','specification','--scope','.','--yes']);
    await main(['truth','confirm','--project',root,'--path',name,'--yes']);
  }
  await main(['step','reanchor','--project',root,'--reason','Truth was explicitly confirmed.']);
  const capsule=await buildContext({project:root});
  assert.equal(capsule.truth[0].path,'a.md');
  assert.match(capsule.truth[0].handle,/^truth:[a-z0-9._-]+$/);
  const read=await readContextHandle({project:root,handle:capsule.truth[0].handle});
  assert.equal(read.path,'a.md');
  assert.equal(read.content,'A content\n');
});

test('init refuses an existing 0.x control plane and preserves its bytes',async()=>{
  const f=await legacyFixture('init-legacy-refusal');
  const intent=await readFile(path.join(f.root,'.vibetether','intent.md'),'utf8');
  const truth=await readFile(path.join(f.root,'.vibetether','TRUTH.md'),'utf8');
  await assert.rejects(main(['init','--project',f.root,'--agent','codex','--yes']),/migrate|0\.x|legacy/i);
  assert.equal(await readFile(path.join(f.root,'.vibetether','intent.md'),'utf8'),intent);
  assert.equal(await readFile(path.join(f.root,'.vibetether','TRUTH.md'),'utf8'),truth);
});

test('migration converts the real 0.x Intent into the new canonical format',async()=>{
  const f=await legacyFixture('legacy-intent-conversion');
  await migrate({project:f.root,agent:'codex',control_mode:'team',yes:true});
  const context=await discoverContract(f.root);
  const intent=parseIntent(context.intentSource);
  assert.equal(intent.status,'confirmed');
  assert.equal(intent.goal,'Preserve the real legacy goal.');
  assert.equal(intent.success_evidence,'Legacy migration remains reversible.');
});

test('codex-only migration rollback preserves a pre-existing CLAUDE.md',async()=>{
  const f=await legacyFixture('codex-rollback-claude');
  const before=await readFile(path.join(f.root,'CLAUDE.md'),'utf8');
  const result=await migrate({project:f.root,agent:'codex',control_mode:'team',yes:true});
  await rollbackMigration({id:result.migration_id,yes:true});
  assert.equal(await readFile(path.join(f.root,'CLAUDE.md'),'utf8'),before);
});

test('project-local launcher reads .vibetether/project.json',async()=>{
  const {root}=await initProject('launcher-runtime');
  const source=await readFile(path.join(root,'.vibetether','vt.mjs'),'utf8');
  assert.match(source,/path\.join\(path\.dirname\(launcher\), 'project\.json'\)/);
});

test('completion doctor fails when no controlled step and evidence exist',async()=>{
  const {root}=await initProject('doctor-empty-completion');
  const report=await inspectProject({project:root,boundary:'completion',throw_on_error:false});
  assert.equal(report.ok,false);
  assert.ok(report.issues.some(({code})=>code==='MISSING_CONTROLLED_SESSION'));
});

test('break-lease converts an active route into a recoverable broken state',async()=>{
  const {root}=await initProject('break-lease-recovery');
  await main(['step','start','--project',root,'--phase','EXECUTE_ONE','--capability','implementation','--slice','Change one bounded behavior.','--success-evidence','Focused verification passes.',...successCheckCliArgs('Focused verification passes.'),'--signal','new-behavior','--code-write','--confirmed-by-user','--decision-reason','The test author approved this exact lease-recovery fixture.']);
  await main(['step','break-lease','--project',root]);
  const context=await discoverContract(root);
  const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  const route=await readRoute(runtime.paths);
  assert.equal(route.status,'broken');
  const next=await mainJson(['step','start','--project',root,'--phase','EXECUTE_ONE','--capability','implementation','--slice','Retry safely.','--success-evidence','Focused verification passes.',...successCheckCliArgs('Focused verification passes.'),'--signal','new-behavior','--code-write','--confirmed-by-user','--decision-reason','The test author approved this exact retry fixture.']);
  assert.equal(next.route.status,'active');
});

test('portable project paths reject Git metadata case variants and Windows ADS syntax',async()=>{
  const {safeRelative}=await import('../src/files.mjs');
  for(const value of ['.git/config','.GIT/config','.Git/config','docs/file.txt:stream']) {
    assert.throws(()=>safeRelative(value),/Git metadata|portable|unsafe/i,value);
  }
});

test('project route required outputs and exit evidence are merged into the selected contract',async()=>{
  const {root}=await initProject('route-contract-union');
  const context=await discoverContract(root);
  const routes={schema_version:1,routes:[{
    id:'project-implementation-contract',phases:['EXECUTE_ONE'],capability:'implementation',
    signals:{all:[],any:['project-contract'],none:[]},provider:'vibetether-built-in-implementation',role:'primary',priority:100,
    required_outputs:['project_specific_output'],exit_evidence:['Project-specific evidence exists.'],
  }]};
  await writeFile(path.join(root,...context.manifest.routes.split('/')),`${JSON.stringify(routes,null,2)}\n`);
  const started=await mainJson(['step','start','--project',root,'--phase','EXECUTE_ONE','--capability','implementation','--slice','Use the project route.','--success-evidence','Focused check passes.',...successCheckCliArgs('Focused check passes.'),'--signal','project-contract','--code-write','--confirmed-by-user','--decision-reason','The test author approved this exact project-route fixture.']);
  assert.ok(started.route.required_outputs.includes('project_specific_output'));
  assert.ok(started.route.exit_evidence.includes('Project-specific evidence exists.'));
});
