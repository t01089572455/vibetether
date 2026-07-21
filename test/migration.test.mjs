import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fixture, mainJson } from './helpers.mjs';
import { exists, hashTree, sha256File } from '../src/files.mjs';
import { planMigration, migrate, rollbackMigration } from '../src/migrate.mjs';
import { discoverContract } from '../src/contract.mjs';
import { parseTruthMap } from '../src/truth.mjs';
import { readCurrent } from '../src/runtime.mjs';
import { authoritySnapshot } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';



async function byteInventory(root, relativePaths) {
  const inventory = {};
  for (const relative of relativePaths) {
    const target = path.join(root, ...relative.split('/'));
    if (!await exists(target)) {
      inventory[relative] = { existed: false };
      continue;
    }
    const metadata = await lstat(target);
    inventory[relative] = metadata.isDirectory()
      ? { existed: true, kind: 'directory', digest: await hashTree(target) }
      : { existed: true, kind: 'file', digest: await sha256File(target) };
  }
  return inventory;
}

const FULL_LEGACY_SURFACE = ['.vibetether', '.agents', '.claude', 'AGENTS.md', 'CLAUDE.md', '.gitignore'];

async function legacyProject(name,{canonicalTruth=false,brokenMarkers=false}={}) {
  const f=await fixture(name);
  const vt=path.join(f.root,'.vibetether');
  await mkdir(path.join(vt,'state'),{recursive:true});
  await mkdir(path.join(vt,'providers','catalog','demo'),{recursive:true});
  await mkdir(path.join(f.root,'docs','operations'),{recursive:true});
  await writeFile(path.join(f.root,'docs','requirements.md'),'# Requirements\n\nPreserve the approved workflow.\n');
  await writeFile(path.join(f.root,'docs','operations','publish.md'),'# Publication\n\nRun a focused verification before publishing.\n');
  await writeFile(path.join(vt,'project.yaml'),`schema_version: 1\nprofile: standard\ntruth_index: .vibetether/TRUTH.md\nsources:\n  requirements:\n    - docs/requirements.md\n  operations:\n    - docs/operations/publish.md\n`);
  const prose='# Legacy project authority\n\nThis prose must be preserved byte-for-byte.\n';
  if(canonicalTruth) await writeFile(path.join(vt,'TRUTH.md'),'# VibeTether Project Truth Map\n\n<!-- vibetether:truth-map-v1 -->\n\n## Confirmed project truth\n\n_None._\n\n## Candidates awaiting confirmation\n\n_None._\n\n## Declined candidates\n\n_None._\n');
  else await writeFile(path.join(vt,'TRUTH.md'),prose);
  await writeFile(path.join(vt,'intent.md'),'# VibeTether Intent Contract\n\nStatus: confirmed\n\n## Goal\n\nPreserve legacy behavior.\n\n## Success evidence\n\n- Migration is reversible.\n\n## Scope boundaries\n\n_None._\n\n## Constraints\n\n_None._\n');
  await writeFile(path.join(vt,'experience-index.yaml'),'schema_version: 1\nentries:\n  - id: publication-path\n    use_when:\n      - publish\n    systems:\n      - windows\n    artifacts:\n      - docs/operations/publish.md\n    verified_at: 2026-07-19\n    revalidate_when:\n      - remote-changes\n    status: proven\n');
  await writeFile(path.join(vt,'state','current.yaml'),'schema_version: 1\ngoal: Preserve legacy behavior\nphase: VERIFY\nslice: Verify one bounded migration\nnext_intended_action: Run fresh checks\ndoctor_verdict: PASS\nevidence_verdict: VERIFIED_DELIVERY: stale self claim\n');
  await writeFile(path.join(vt,'capabilities.yaml'),'legacy board\n');
  await writeFile(path.join(vt,'providers.lock.yaml'),'legacy lock\n');
  await writeFile(path.join(vt,'providers','catalog','demo','SKILL.md'),'---\nname: demo\ndescription: Legacy demo.\n---\n');
  const agents=brokenMarkers?'<!-- vibetether:start -->\nbroken\n':'# Existing instructions\n';
  await writeFile(path.join(f.root,'AGENTS.md'),agents);
  return {...f,legacyTruth:prose,legacyManifest:await readFile(path.join(vt,'project.yaml'),'utf8'),legacyAgents:agents};
}

test('migration preview sends every legacy source to candidate review',async()=>{
  const {root}=await legacyProject('migration-preview');
  const plan=await planMigration({project:root});
  assert.equal(plan.status,'preview');
  assert.deepEqual(plan.legacy_sources.map((item)=>item.destination),['candidate','candidate']);
  assert.equal(plan.truth.action,'preserve-prose-and-create-sidecar');
});

test('0.x migration preserves prose Truth, downgrades Experience, removes heavy assets, and recovers only bounded runtime fields',async()=>{
  const project=await legacyProject('migration-apply');
  const result=await migrate({project:project.root,control_mode:'team',agent:'codex',yes:true});
  assert.equal(result.status,'migrated'); assert.equal(result.truth_index,'.vibetether/TRUTH-MAP.md');
  assert.equal(await readFile(path.join(project.root,'.vibetether','TRUTH.md'),'utf8'),project.legacyTruth);
  const context=await discoverContract(project.root);
  const truth=parseTruthMap(context.truthSource);
  assert.deepEqual(truth.confirmed,[]);
  assert.ok(truth.candidates.some((item)=>item.path==='docs/requirements.md'));
  assert.ok(truth.candidates.some((item)=>item.path==='docs/operations/publish.md'));
  assert.ok(truth.candidates.some((item)=>item.path==='.vibetether/TRUTH.md'));
  assert.equal(context.experience.entries[0].status,'provisional');
  assert.equal(context.experience.entries[0].verification,null);
  await assert.rejects(readFile(path.join(project.root,'.vibetether','capabilities.yaml')),/ENOENT/);
  await assert.rejects(readFile(path.join(project.root,'.vibetether','providers')),/EISDIR|ENOENT/);
  const authority=await authoritySnapshot(context.executionRoot,truth,context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  const current=await readCurrent(runtime.paths);
  assert.equal(current.goal,'Preserve legacy behavior');
  assert.equal(current.slice,'Verify one bounded migration');
  assert.equal(current.status,'blocked');
  assert.equal(JSON.stringify(current).includes('VERIFIED_DELIVERY'),false);
  assert.equal(JSON.stringify(current).includes('doctor_verdict'),false);
});

test('migration rollback restores the byte-identical 0.x control plane and removes newly created host files',async()=>{
  const project=await legacyProject('migration-rollback');
  const applied=await migrate({project:project.root,control_mode:'team',agent:'both',yes:true});
  assert.match(await readFile(path.join(project.root,'CLAUDE.md'),'utf8'),/vibetether:start/);
  await rollbackMigration({id:applied.migration_id,yes:true});
  assert.equal(await readFile(path.join(project.root,'.vibetether','project.yaml'),'utf8'),project.legacyManifest);
  assert.equal(await readFile(path.join(project.root,'AGENTS.md'),'utf8'),project.legacyAgents);
  await assert.rejects(readFile(path.join(project.root,'CLAUDE.md')),/ENOENT/);
  await assert.rejects(readFile(path.join(project.root,'.vibetether','project.json')),/ENOENT/);
});

test('failed migration restores the original tree automatically',async()=>{
  const project=await legacyProject('migration-failure',{brokenMarkers:true});
  await assert.rejects(migrate({project:project.root,control_mode:'team',agent:'codex',yes:true}),/markers/i);
  assert.equal(await readFile(path.join(project.root,'.vibetether','project.yaml'),'utf8'),project.legacyManifest);
  assert.equal(await readFile(path.join(project.root,'AGENTS.md'),'utf8'),project.legacyAgents);
  await assert.rejects(readFile(path.join(project.root,'.vibetether','project.json')),/ENOENT/);
});

test('shared 0.x authority cannot be silently migrated to local-only mode',async()=>{
  const {root}=await legacyProject('migration-local');
  await assert.rejects(planMigration({project:root,control_mode:'local'}),/local-only/i);
  await assert.rejects(migrate({project:root,control_mode:'local',yes:true}),/local-only/i);
});

test('canonical legacy Truth Map is preserved while a migrated sidecar becomes the active index',async()=>{
  const {root}=await legacyProject('migration-canonical',{canonicalTruth:true});
  const result=await migrate({project:root,control_mode:'hybrid',agent:'codex',yes:true});
  assert.equal(result.truth_index,'.vibetether/TRUTH-MAP.md');
  const context=await discoverContract(root); const truth=parseTruthMap(context.truthSource);
  assert.ok(truth.candidates.some((item)=>item.path==='docs/requirements.md'));
  assert.deepEqual(truth.confirmed,[]);
});

test('rollback stops instead of overwriting user changes made after migration',async()=>{
  const project=await legacyProject('migration-user-change');
  const applied=await migrate({project:project.root,control_mode:'team',agent:'codex',yes:true});
  const intentPath=path.join(project.root,'.vibetether','intent.md');
  await writeFile(intentPath,`${await readFile(intentPath,'utf8')}\nUser change after migration.\n`);
  await assert.rejects(rollbackMigration({id:applied.migration_id,yes:true}),/changed after migration|rollback stopped/i);
  assert.match(await readFile(intentPath,'utf8'),/User change after migration/);
  assert.equal(await readFile(path.join(project.root,'.vibetether','project.yaml'),'utf8'),project.legacyManifest);
});


test('migration rollback restores the complete v0.6.3 host Skill trees and removes newly introduced deep Skills', async () => {
  const project = await legacyProject('migration-full-skill-rollback');
  for (const host of ['.agents', '.claude']) {
    const legacy = path.join(project.root, host, 'skills', 'vibe-tether');
    const custom = path.join(project.root, host, 'skills', 'user-helper');
    await mkdir(path.join(legacy, 'references'), { recursive: true });
    await mkdir(custom, { recursive: true });
    await writeFile(path.join(legacy, 'SKILL.md'), `---
name: vibe-tether
description: v0.6.3 full legacy Skill.
---

${'Legacy control instructions.\n'.repeat(900)}`, 'utf8');
    await writeFile(path.join(legacy, 'references', 'legacy.md'), `# Legacy reference
Preserve these exact bytes.
`, 'utf8');
    await writeFile(path.join(custom, 'SKILL.md'), `---
name: user-helper
description: User-owned helper.
---
`, 'utf8');
  }
  await writeFile(path.join(project.root, 'CLAUDE.md'), `# Existing Claude instructions
`, 'utf8');
  await writeFile(path.join(project.root, '.gitignore'), `# User ignore rules
`, 'utf8');
  const before = await byteInventory(project.root, FULL_LEGACY_SURFACE);

  const applied = await migrate({ project: project.root, control_mode: 'team', agent: 'both', yes: true });
  assert.equal(await exists(path.join(project.root, '.agents', 'skills', 'vibe-tether-deep', 'SKILL.md')), true);
  assert.equal(await exists(path.join(project.root, '.claude', 'skills', 'vibe-tether-deep', 'SKILL.md')), true);
  await rollbackMigration({ id: applied.migration_id, yes: true });

  assert.deepEqual(await byteInventory(project.root, FULL_LEGACY_SURFACE), before);
  assert.equal(await exists(path.join(project.root, '.agents', 'skills', 'vibe-tether-deep')), false);
  assert.equal(await exists(path.join(project.root, '.claude', 'skills', 'vibe-tether-deep')), false);
});
