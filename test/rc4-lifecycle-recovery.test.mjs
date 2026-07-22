import assert from 'node:assert/strict';
import {
  mkdir, readFile, readdir, rm, stat, utimes, writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { managedBlock } from '../src/adapters.mjs';
import { main } from '../src/cli.mjs';
import { discoverContract } from '../src/contract.mjs';
import { breakFileLock, exists, withFileLock } from '../src/files.mjs';
import { gitIdentity } from '../src/git.mjs';
import { installGlobalEntry, uninstallGlobalEntry } from '../src/global-entry.mjs';
import { initialize } from '../src/init.mjs';
import { renderProjectLauncher } from '../src/launcher.mjs';
import { migrate, planMigration, rollbackMigration } from '../src/migrate.mjs';
import { readJsonFile } from '../src/files.mjs';
import { uninstallProject } from '../src/uninstall.mjs';
import { rollbackUpgrade, upgradeProject } from '../src/upgrade.mjs';
import {
  attachFromDirectory, listAttachedWorktrees, pruneWorktrees,
} from '../src/worktree.mjs';
import { fixture, git, initProject, successCheckCliArgs, writeJson } from './helpers.mjs';

async function legacyProject(name, truthIndex = '.vibetether/TRUTH.md') {
  const result = await fixture(name);
  const control = path.join(result.root, '.vibetether');
  await mkdir(control, { recursive: true });
  await writeFile(path.join(control, 'project.yaml'), `schema_version: 1\nprofile: standard\ntruth_index: ${truthIndex}\n`);
  if (truthIndex === '.vibetether/TRUTH.md') {
    await writeFile(path.join(control, 'TRUTH.md'), '# Legacy truth\n\nPreserve this source.\n');
  }
  await writeFile(path.join(control, 'intent.md'), '# VibeTether Intent Contract\n\nStatus: confirmed\n\n## Goal\n\nPreserve legacy behavior.\n\n## Success evidence\n\n- Migration is reversible.\n\n## Scope boundaries\n\n_None._\n\n## Constraints\n\n_None._\n');
  await writeFile(path.join(result.root, 'AGENTS.md'), '# Existing instructions\n');
  return result;
}

async function onlyRecord(root, folder, file) {
  const directory = path.join(root, folder);
  const entries = await readdir(directory);
  assert.equal(entries.length, 1);
  return readJsonFile(path.join(directory, entries[0], file), file);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('a stale-looking lock owned by the live process is never stolen automatically', async () => {
  const f = await fixture('live-lock', { gitRepo: false });
  const lock = path.join(f.base, 'operation.lock');
  await mkdir(lock, { recursive: true });
  await writeFile(path.join(lock, 'owner.json'), `${JSON.stringify({ pid: process.pid, created_at: '2000-01-01T00:00:00.000Z' })}\n`);
  const old = new Date('2000-01-01T00:00:00.000Z');
  await utimes(lock, old, old);
  let entered = false;
  await assert.rejects(
    withFileLock(lock, async () => { entered = true; }, { staleMs: 1, retries: 1, delayMs: 1 }),
    /lock/i,
  );
  assert.equal(entered, false);
  assert.equal((await stat(lock)).isDirectory(), true);
});

test('a lock whose owner process is proven dead can be reclaimed', async () => {
  const f=await fixture('dead-lock',{gitRepo:false});
  const lock=path.join(f.base,'operation.lock');
  await mkdir(lock,{recursive:true});
  await writeFile(path.join(lock,'owner.json'),`${JSON.stringify({schema_version:1,owner_id:'dead-owner',pid:2147483647,process_start_token:'dead',created_at:'2000-01-01T00:00:00.000Z'})}\n`);
  let entered=false;
  await withFileLock(lock,async()=>{entered=true;},{retries:1,delayMs:1});
  assert.equal(entered,true);
  assert.equal(await exists(lock),false);
});

test('concurrent contenders serialize while reclaiming the same proven-dead lock', async () => {
  const f = await fixture('dead-lock-contenders', { gitRepo: false });
  const lock = path.join(f.base, 'operation.lock');
  await mkdir(lock, { recursive: true });
  await writeFile(path.join(lock, 'owner.json'), `${JSON.stringify({
    schema_version: 1,
    owner_id: 'dead-owner',
    pid: 2147483647,
    process_start_token: 'dead',
    created_at: '2000-01-01T00:00:00.000Z',
  })}\n`);
  let active = 0;
  let maxActive = 0;
  const enter = async () => withFileLock(lock, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
  }, { retries: 100, delayMs: 2 });
  await Promise.all([enter(), enter()]);
  assert.equal(maxActive, 1);
  assert.equal(await exists(lock), false);
  assert.equal(await exists(`${lock}.recovery`), false);
});

test('rapid lock handoff cannot let a retiring owner collide with its successor', async () => {
  const f = await fixture('lock-release-handoff', { gitRepo: false });
  const lock = path.join(f.base, 'operation.lock');
  let operations = 0;
  for (let round = 0; round < 5; round += 1) {
    await Promise.all(Array.from({ length: 40 }, () => withFileLock(lock, async () => {
      operations += 1;
    }, { retries: 5000, delayMs: 0 })));
  }
  assert.equal(operations, 200);
  assert.equal(await exists(lock), false);
  assert.deepEqual((await readdir(f.base)).filter((name) => name.includes('.release-')), []);
});

test('an unverifiable state lock requires an explicit audited recovery command', async () => {
  const project = await initProject('explicit-state-lock-recovery', { agent: 'codex' });
  await main([
    'step', 'start', '--project', project.root,
    '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
    '--slice', 'Exercise the explicit state-lock recovery path.',
    '--success-evidence', 'The focused recovery check passes.',
    ...successCheckCliArgs('The focused recovery check passes.'),
    '--signal', 'new-behavior', '--code-write', '--confirmed-by-user',
    '--decision-reason', 'The test author approved this exact recovery fixture.',
  ]);
  const attached = await attachFromDirectory(project.root);
  const lock = path.join(attached.runtime, '.state-lock');
  await mkdir(lock, { recursive: true });
  await writeFile(path.join(lock, 'owner.json'), '{malformed owner json\n');
  await assert.rejects(
    withFileLock(lock, async () => {}, { retries: 1, delayMs: 1 }),
    /lock/i,
  );
  await assert.rejects(
    main(['step', 'break-state-lock', '--project', project.root, '--reason', 'Recover a damaged state lock.']),
    /confirmation/i,
  );
  const recovered = JSON.parse(await main([
    'step', 'break-state-lock', '--project', project.root,
    '--reason', 'Recover a damaged state lock.', '--yes', '--json',
  ]));
  assert.equal(recovered.status, 'quarantined');
  assert.equal(recovered.route_status, 'broken');
  assert.equal(await exists(lock), false);
  assert.equal(await exists(path.join(recovered.quarantine, 'owner.json')), true);
  assert.equal(await exists(recovered.record_path), true);
  const record = await readJsonFile(path.join(recovered.quarantine, 'break-record.json'), 'Lock break record');
  assert.equal(record.id, recovered.id);
  assert.match(record.owner_read_error, /json|unexpected|position|property/i);
  let entered = false;
  await withFileLock(lock, async () => { entered = true; });
  assert.equal(entered, true);
});

test('a broken old owner cannot delete a replacement owner lock when it later fails', async () => {
  const f = await fixture('replacement-lock-owner', { gitRepo: false });
  const lock = path.join(f.base, 'operation.lock');
  const firstEntered = deferred();
  const releaseFirst = deferred();
  const secondEntered = deferred();
  const releaseSecond = deferred();
  const first = withFileLock(lock, async () => {
    firstEntered.resolve();
    await releaseFirst.promise;
    throw new Error('old owner failed after its lock was broken');
  });
  await firstEntered.promise;
  await breakFileLock(lock, {
    reason: 'Replace a deliberately wedged test owner.',
    confirmed: true,
    quarantineRoot: path.join(f.base, 'quarantine'),
  });
  const second = withFileLock(lock, async () => {
    secondEntered.resolve();
    await releaseSecond.promise;
  });
  await secondEntered.promise;
  releaseFirst.resolve();
  await assert.rejects(first, /old owner failed/);
  assert.equal(await exists(lock), true);
  releaseSecond.resolve();
  await second;
  assert.equal(await exists(lock), false);
});

test('legacy Truth paths cannot escape the project during migration preview', async () => {
  const project = await legacyProject('unsafe-legacy-truth', '../../outside.md');
  await writeFile(path.join(project.base, 'outside.md'), 'outside bytes must never become migration input\n');
  await assert.rejects(planMigration({ project: project.root }), /portable|escape|unsafe|project-relative/i);
  assert.equal(await exists(path.join(project.root, '.vibetether', 'project.json')), false);
});

test('project uninstall refuses modified launchers and modified managed instruction blocks', async () => {
  const launcherProject = await initProject('uninstall-modified-launcher', { agent: 'codex' });
  const launcher = path.join(launcherProject.root, '.vibetether', 'vt.mjs');
  await writeFile(launcher, `${await readFile(launcher, 'utf8')}\n// user customization\n`);
  await assert.rejects(uninstallProject({ project: launcherProject.root, agent: 'codex', yes: true }), /modified.*launcher|launcher.*modified/i);
  assert.match(await readFile(launcher, 'utf8'), /user customization/);

  const blockProject = await initProject('uninstall-modified-block', { agent: 'codex' });
  const instructions = path.join(blockProject.root, 'AGENTS.md');
  const changed = (await readFile(instructions, 'utf8')).replace(managedBlock(), managedBlock().replace('Run `vibetether context', 'Run the customized `vibetether context'));
  await writeFile(instructions, changed);
  await assert.rejects(uninstallProject({ project: blockProject.root, agent: 'codex', yes: true }), /managed.*modified|modified.*instruction/i);
  assert.match(await readFile(instructions, 'utf8'), /customized/);
});

test('global uninstall still removes the deep entry when the adaptive entry is already absent', async () => {
  const f = await fixture('global-partial-uninstall', { gitRepo: false });
  const binDir = path.join(f.base, 'bin');
  await installGlobalEntry({ agent: 'codex', bin_dir: binDir, yes: true });
  const adaptive = path.join(f.userHome, '.codex', 'skills', 'vibe-tether', 'SKILL.md');
  const deep = path.join(f.userHome, '.codex', 'skills', 'vibe-tether-deep', 'SKILL.md');
  await rm(adaptive, { force: true });
  assert.equal(await exists(deep), true);
  await uninstallGlobalEntry({ agent: 'codex', bin_dir: binDir, yes: true });
  assert.equal(await exists(deep), false);
  assert.equal(await exists(path.join(binDir, process.platform === 'win32' ? 'vibetether.mjs' : 'vibetether')), false);
});

test('fresh initialization rolls project files back when runtime attach fails', async () => {
  const f = await fixture('init-attach-failure');
  await assert.rejects(
    initialize({ project: f.root, agent: 'codex', goal: 'Attach safely.', success_evidence: 'The Contract is usable.', confirmed: true, yes: true }, {
      attachWorktree: async () => { throw new Error('injected attach failure'); },
    }),
    /injected attach failure/,
  );
  assert.equal(await exists(path.join(f.root, '.vibetether', 'project.json')), false);
  assert.equal(await exists(path.join(f.root, 'AGENTS.md')), false);
  assert.equal(await exists(path.join(f.root, '.agents', 'skills', 'vibe-tether', 'SKILL.md')), false);
});

test('a transient Git identity failure quarantines rather than prunes worktree state', async () => {
  const project = await initProject('prune-transient');
  git(project.root, ['add', '.']);
  git(project.root, ['commit', '-qm', 'initialize']);
  const sibling = path.join(project.base, 'sibling');
  git(project.root, ['worktree', 'add', '-q', '-b', 'prune-transient-sibling', sibling]);
  const attached = await attachFromDirectory(sibling);
  const result = await pruneWorktrees(project.root, {
    gitIdentity: async (candidate) => {
      const inspected = await gitIdentity(candidate);
      if (inspected?.worktree_id === attached.worktree_id) throw new Error('injected transient inspection failure');
      return inspected;
    },
  });
  assert.deepEqual(result.pruned, []);
  assert.ok(result.quarantined.includes(attached.worktree_id));
  assert.ok((await listAttachedWorktrees(project.root)).some((item) => item.id === attached.worktree_id));
  assert.equal(await exists(attached.runtime), true);
});

test('migration backup failure leaves the legacy Provider tree and project bytes untouched', async () => {
  const project = await legacyProject('migration-backup-failure');
  const provider = path.join(project.root, '.vibetether', 'providers', 'catalog', 'demo', 'SKILL.md');
  await mkdir(path.dirname(provider), { recursive: true });
  await writeFile(provider, 'legacy provider bytes\n');
  const beforeManifest = await readFile(path.join(project.root, '.vibetether', 'project.yaml'), 'utf8');
  const beforeInstructions = await readFile(path.join(project.root, 'AGENTS.md'), 'utf8');
  await assert.rejects(
    migrate({ project: project.root, control_mode: 'team', agent: 'codex', yes: true }, {
      backupProject: async () => { throw new Error('injected migration backup failure'); },
    }),
    /injected migration backup failure/,
  );
  assert.equal(await readFile(provider, 'utf8'), 'legacy provider bytes\n');
  assert.equal(await readFile(path.join(project.root, '.vibetether', 'project.yaml'), 'utf8'), beforeManifest);
  assert.equal(await readFile(path.join(project.root, 'AGENTS.md'), 'utf8'), beforeInstructions);
  assert.equal(await exists(path.join(project.root, '.vibetether', 'project.json')), false);
});

test('migration apply failure restores the complete legacy Provider tree automatically', async () => {
  const project = await legacyProject('migration-apply-auto-restore');
  const provider = path.join(project.root, '.vibetether', 'providers', 'catalog', 'demo', 'SKILL.md');
  await mkdir(path.dirname(provider), { recursive: true });
  await writeFile(provider, 'legacy provider bytes\n');
  await assert.rejects(
    migrate({ project: project.root, control_mode: 'team', agent: 'codex', yes: true }, {
      afterApply: async () => { throw new Error('injected post-apply migration failure'); },
    }),
    /injected post-apply migration failure/,
  );
  assert.equal(await readFile(provider, 'utf8'), 'legacy provider bytes\n');
  assert.equal(await exists(path.join(project.root, '.vibetether', 'project.json')), false);
  const record = await onlyRecord(project.state, 'migrations', 'migration.json');
  assert.equal(record.status, 'rolled-back');
  assert.equal(record.recovery.completed, true);
});

test('upgrade backup failure leaves the prior manifest and launcher bytes untouched', async () => {
  const project = await initProject('upgrade-backup-failure', { agent: 'codex' });
  const manifestPath = path.join(project.root, '.vibetether', 'project.json');
  const launcherPath = path.join(project.root, '.vibetether', 'vt.mjs');
  const context = await discoverContract(project.root);
  const priorManifest = { ...context.manifest, vibetether_version: '1.0.0-rc.2' };
  await writeJson(manifestPath, priorManifest);
  await writeFile(launcherPath, renderProjectLauncher('1.0.0-rc.2'));
  const beforeManifest = await readFile(manifestPath, 'utf8');
  const beforeLauncher = await readFile(launcherPath, 'utf8');
  await assert.rejects(
    upgradeProject({ project: project.root, agent: 'codex', yes: true }, {
      backupItems: async () => { throw new Error('injected upgrade backup failure'); },
    }),
    /injected upgrade backup failure/,
  );
  assert.equal(await readFile(manifestPath, 'utf8'), beforeManifest);
  assert.equal(await readFile(launcherPath, 'utf8'), beforeLauncher);
});

test('upgrade apply failure restores prior manifest and launcher bytes automatically', async () => {
  const project = await initProject('upgrade-apply-auto-restore', { agent: 'codex' });
  const manifestPath = path.join(project.root, '.vibetether', 'project.json');
  const launcherPath = path.join(project.root, '.vibetether', 'vt.mjs');
  const context = await discoverContract(project.root);
  const priorManifest = { ...context.manifest, vibetether_version: '1.0.0-rc.2' };
  await writeJson(manifestPath, priorManifest);
  await writeFile(launcherPath, renderProjectLauncher('1.0.0-rc.2'));
  const beforeManifest = await readFile(manifestPath, 'utf8');
  const beforeLauncher = await readFile(launcherPath, 'utf8');
  await assert.rejects(
    upgradeProject({ project: project.root, agent: 'codex', yes: true }, {
      afterApply: async () => { throw new Error('injected post-apply upgrade failure'); },
    }),
    /injected post-apply upgrade failure/,
  );
  assert.equal(await readFile(manifestPath, 'utf8'), beforeManifest);
  assert.equal(await readFile(launcherPath, 'utf8'), beforeLauncher);
  const record = await onlyRecord(project.state, 'upgrades', 'upgrade.json');
  assert.equal(record.status, 'rolled-back');
  assert.equal(record.recovery.completed, true);
});

test('migration records recovery-required when automatic restore itself fails', async () => {
  const project = await legacyProject('migration-recovery-required');
  await assert.rejects(
    migrate({ project: project.root, control_mode: 'team', agent: 'codex', yes: true }, {
      afterApply: async () => { throw new Error('injected migration apply failure'); },
      restoreBackup: async () => { throw new Error('injected migration restore failure'); },
    }),
    /recovery|restore/i,
  );
  const record = await onlyRecord(project.state, 'migrations', 'migration.json');
  assert.equal(record.status, 'recovery-required');
  assert.equal(record.recovery.attempted, true);
  assert.equal(record.recovery.completed, false);
  assert.match(record.recovery.errors.join('\n'), /injected migration restore failure/);
});

test('upgrade records recovery-required when automatic restore itself fails', async () => {
  const project = await initProject('upgrade-recovery-required', { agent: 'codex' });
  const context = await discoverContract(project.root);
  const manifest = { ...context.manifest, vibetether_version: '1.0.0-rc.2' };
  await writeJson(path.join(project.root, '.vibetether', 'project.json'), manifest);
  await writeFile(path.join(project.root, '.vibetether', 'vt.mjs'), renderProjectLauncher('1.0.0-rc.2'));
  await assert.rejects(
    upgradeProject({ project: project.root, agent: 'codex', yes: true }, {
      afterApply: async () => { throw new Error('injected upgrade apply failure'); },
      restoreItems: async () => { throw new Error('injected upgrade restore failure'); },
    }),
    /recovery|restore/i,
  );
  const record = await onlyRecord(project.state, 'upgrades', 'upgrade.json');
  assert.equal(record.status, 'recovery-required');
  assert.equal(record.recovery.attempted, true);
  assert.equal(record.recovery.completed, false);
  assert.match(record.recovery.errors.join('\n'), /injected upgrade restore failure/);
});

test('migration rollback conflicts preserve before, migration-output, and current bytes', async () => {
  const project=await legacyProject('migration-three-way-conflict');
  const applied=await migrate({project:project.root,control_mode:'team',agent:'codex',yes:true});
  const intent=path.join(project.root,'.vibetether','intent.md');
  await writeFile(intent,`${await readFile(intent,'utf8')}\nUser edit after migration.\n`);
  await assert.rejects(rollbackMigration({id:applied.migration_id,yes:true}),/rollback stopped|changed after migration/i);
  const record=await onlyRecord(project.state,'migrations','migration.json');
  assert.equal(record.status,'conflict-preserved');
  assert.equal(await exists(path.join(record.rollback_conflict_path,'before','.vibetether','project.yaml')),true);
  assert.equal(await exists(path.join(record.rollback_conflict_path,'migration-output','.vibetether','project.json')),true);
  assert.match(await readFile(path.join(record.rollback_conflict_path,'current','.vibetether','intent.md'),'utf8'),/User edit after migration/);
});

test('upgrade rollback conflicts preserve before, upgrade-output, and current bytes', async () => {
  const project=await initProject('upgrade-three-way-conflict',{agent:'codex'});
  const context=await discoverContract(project.root);
  const manifest={...context.manifest,vibetether_version:'1.0.0-rc.2'};
  await writeJson(path.join(project.root,'.vibetether','project.json'),manifest);
  await writeFile(path.join(project.root,'.vibetether','vt.mjs'),renderProjectLauncher('1.0.0-rc.2'));
  const applied=await upgradeProject({project:project.root,agent:'codex',yes:true});
  const instructions=path.join(project.root,'AGENTS.md');
  await writeFile(instructions,`${await readFile(instructions,'utf8')}\nUser edit after upgrade.\n`);
  await assert.rejects(rollbackUpgrade({id:applied.upgrade_id,yes:true}),/rollback stopped|changed after upgrade/i);
  const record=await onlyRecord(project.state,'upgrades','upgrade.json');
  assert.equal(record.status,'conflict-preserved');
  assert.equal(await exists(path.join(record.rollback_conflict_path,'before','contract','.vibetether','project.json')),true);
  assert.equal(await exists(path.join(record.rollback_conflict_path,'upgrade-output','contract','.vibetether','project.json')),true);
  assert.match(await readFile(path.join(record.rollback_conflict_path,'current','host','AGENTS.md'),'utf8'),/User edit after upgrade/);
});
