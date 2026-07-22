import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { main } from '../src/cli.mjs';
import { MANAGED_END, MANAGED_START, VERSION } from '../src/constants.mjs';
import { discoverContract } from '../src/contract.mjs';
import { exists } from '../src/files.mjs';
import { renderProjectLauncher } from '../src/launcher.mjs';
import { migrate, planMigration, rollbackMigration } from '../src/migrate.mjs';
import { parseTruthMap } from '../src/truth.mjs';
import { uninstallProject } from '../src/uninstall.mjs';
import { planUpgrade, rollbackUpgrade, upgradeProject } from '../src/upgrade.mjs';
import { fixture, initProject, jsonFile, writeJson } from './helpers.mjs';

const RC3_ENTRY = `---
name: vibe-tether
description: Use at task entry, after compaction or resume, before consequential decisions, and before completion or handoff in long-running coding work.
---

# VibeTether

Run \`vibetether context --boundary <boundary> --json\` before reading VibeTether state. Treat the returned capsule as the only default control context.

Follow confirmed Truth, the current bounded slice, blockers, the selected Provider, and only fresh applicable Experience. Use \`context read <handle>\` for one needed source instead of scanning the project control assets.

Start consequential work with \`vibetether step start\`; finish it with fresh command or artifact evidence. Never read raw runtime state, provider catalogs, unselected Skills, or unselected Experience. Never activate project direction or weaken security, data, permission, destructive-operation, merge, deployment, release, or publication gates without the required user decision.
`;
const RC3_DEEP_ENTRY = `---
name: vibe-tether-deep
description: Prepare and govern high-ambiguity or high-impact coding work before implementation. Use when the user explicitly requests deep mode, asks for facts and assumptions to be checked before work, or when product direction, public behavior, architecture, data, security, permissions, migration, or release choices require a user-approved Start Card and Implementation Permit.
---

# VibeTether Deep

Use this Skill only for work that needs an explicit user-confirmed start gate.

1. Run \`vibetether context --task "<request>" --boundary task-entry --json\`.
2. Investigate discoverable facts without writing product code.
3. Prepare a Start Card with \`vibetether deep prepare\`, naming the bounded slice, success evidence, facts, assumptions, and decisions still owned by the user.
4. Show the Start Card and recommended decisions to the user. Do not start implementation.
5. After explicit user confirmation, run \`vibetether deep permit --confirmed-by-user --reason "<what the user approved>"\`.
6. Start the controlled step with \`vibetether step start --deep ...\`. The step must match the permitted slice.
7. The permit expires or is consumed when the step exits, and becomes stale when authority, control generation, or worktree identity changes.

A Start Card is planning evidence, not permission. An Implementation Permit authorizes only its exact slice and does not authorize deployment, migration, credential access, destructive data changes, or release unless those permissions were separately approved.
`;
const RC3_MANAGED_BLOCK = `${MANAGED_START}
Use the \`vibe-tether\` Skill at task entry, after compaction or resume, before a consequential decision, and before completion or handoff.

Run \`vibetether context --boundary <boundary> --json\` before reading VibeTether state. Follow only its confirmed truth handles, current slice, blockers, selected provider, and fresh applicable experience.

Do not read raw VibeTether runtime state, provider catalogs, unselected Skills, or unselected experience. For an explicit deep request or unresolved direction, use the \`vibe-tether-deep\` Skill and do not write product code until its Start Card has a user-confirmed Implementation Permit. Do not alter project direction or activate project truth without the required user confirmation.
${MANAGED_END}`;

async function downgradeToSchema1(root, version = VERSION) {
  const manifestPath = path.join(root, '.vibetether', 'project.json');
  const manifest = await jsonFile(manifestPath);
  manifest.schema_version = 1;
  manifest.vibetether_version = version;
  delete manifest.outcome_index;
  delete manifest.progress_projection;
  await writeJson(manifestPath, manifest);
  await writeFile(path.join(root, '.vibetether', 'vt.mjs'), renderProjectLauncher(version));
  await rm(path.join(root, '.vibetether', 'outcomes.json'), { force: true });
  await rm(path.join(root, '.vibetether', 'PROGRESS.md'), { force: true });
  return manifest;
}

async function legacyProject(name, { agent = 'claude' } = {}) {
  const f = await fixture(name);
  const control = path.join(f.root, '.vibetether');
  await mkdir(path.join(control, 'state'), { recursive: true });
  await writeFile(path.join(control, 'project.yaml'), [
    'schema_version: 1',
    'profile: standard',
    'truth_index: .vibetether/TRUTH.md',
    'sources:',
    '  requirements:',
    '    - docs/requirements.md',
    '',
  ].join('\r\n'));
  await mkdir(path.join(f.root, 'docs'), { recursive: true });
  await writeFile(path.join(f.root, 'docs', 'requirements.md'), '# Requirements\r\n\r\nKeep user decisions.\r\n');
  await writeFile(path.join(control, 'TRUTH.md'), '# Legacy truth\r\n\r\nPreserve these bytes.\r\n');
  await writeFile(path.join(control, 'intent.md'), '# VibeTether Intent Contract\r\n\r\n## Goal\r\n\r\nKeep legacy behavior.\r\n\r\n## Success evidence\r\n\r\n- Migration rolls back.\r\n');
  await writeFile(path.join(control, 'experience-index.yaml'), 'schema_version: 1\r\nentries: []\r\n');
  await writeFile(path.join(control, 'coverage.json'), '{"legacy":"unknown tracker"}\r\n');
  await writeFile(path.join(control, 'PROGRESS.md'), '# Legacy hand-written progress\r\n\r\nDo not infer completion.\r\n');
  const hostRoot = agent === 'claude' ? '.claude' : '.agents';
  const instruction = agent === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';
  await mkdir(path.join(f.root, hostRoot, 'skills', 'vibe-tether'), { recursive: true });
  await writeFile(path.join(f.root, hostRoot, 'skills', 'vibe-tether', 'SKILL.md'), '---\nname: vibe-tether\ndescription: user-modified legacy entry\n---\n');
  await writeFile(path.join(f.root, instruction), '# User instructions\r\n');
  return f;
}

test('schema-1 contracts fail closed before consequential work with an exact upgrade command', async () => {
  const { root } = await initProject('rc4-schema1-gate', { agent: 'codex' });
  await downgradeToSchema1(root);

  await assert.rejects(
    main([
      'step', 'start', '--project', root, '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
      '--slice', 'Change one governed behavior.', '--success-evidence', 'Focused verification passes.',
      '--success-check-json', JSON.stringify({
        id: 'focused-check', claim: 'Focused verification passes.', kind: 'command',
        command: [process.execPath, '-e', 'process.exit(0)'], covers_paths: ['app.txt'], consumer_paths: ['app.txt'],
      }), '--signal', 'bug-fix', '--code-write',
    ]),
    (error) => {
      assert.equal(error.code, 'UPGRADE_REQUIRED');
      assert.match(error.message, /vibetether upgrade --project/);
      assert.match(error.message, /--dry-run/);
      return true;
    },
  );
});

test('same-version schema-1 upgrade previews every write, creates an empty draft registry, and rolls back byte-exactly', async () => {
  const { root, state } = await initProject('rc4-schema1-upgrade', { agent: 'codex' });
  const beforeManifest = await downgradeToSchema1(root);
  const preserved = Object.fromEntries(await Promise.all([
    'intent.md', 'TRUTH.md', 'experience.json', 'skills.lock.json', 'routes.json',
  ].map(async (name) => [name, await readFile(path.join(root, '.vibetether', name))])));

  const preview = await planUpgrade({ project: root, agent: 'codex' });
  assert.equal(preview.status, 'preview');
  const operations = new Map(preview.operations.map((item) => [item.path, item.action]));
  assert.equal(operations.get('.vibetether/project.json'), 'replace');
  assert.equal(operations.get('.vibetether/outcomes.json'), 'create');
  assert.equal(operations.get('.vibetether/PROGRESS.md'), 'create');
  assert.equal(operations.get('.vibetether/vt.mjs'), 'replace');
  assert.equal(operations.get('AGENTS.md'), 'replace-managed-block');
  assert.equal(operations.get('.vibetether/intent.md'), 'preserve');
  assert.equal(operations.get('.vibetether/TRUTH.md'), 'preserve');
  assert.equal(operations.get('.vibetether/experience.json'), 'preserve');
  assert.equal(operations.get('.vibetether/skills.lock.json'), 'preserve');
  assert.equal(operations.get('.vibetether/routes.json'), 'preserve');

  const applied = await upgradeProject({ project: root, agent: 'codex', yes: true });
  const context = await discoverContract(root);
  assert.equal(context.manifest.schema_version, 2);
  assert.equal(context.outcomes.coverage_status, 'draft');
  assert.deepEqual(context.outcomes.outcomes, []);
  assert.match(await readFile(path.join(root, '.vibetether', 'PROGRESS.md'), 'utf8'), /Precise completion label: NOT_STARTED/);
  for (const [name, bytes] of Object.entries(preserved)) assert.deepEqual(await readFile(path.join(root, '.vibetether', name)), bytes);

  await rollbackUpgrade({ id: applied.upgrade_id, yes: true });
  assert.deepEqual(await jsonFile(path.join(root, '.vibetether', 'project.json')), beforeManifest);
  assert.equal(await exists(path.join(root, '.vibetether', 'outcomes.json')), false);
  assert.equal(await exists(path.join(root, '.vibetether', 'PROGRESS.md')), false);
  const rolledBack = await jsonFile(path.join(state, 'upgrades', applied.upgrade_id, 'upgrade.json'));
  assert.equal(rolledBack.lifecycle_assets['contract:progress'].current_digest, 'absent');
  assert.equal(rolledBack.lifecycle_assets['contract:progress'].current_digest, rolledBack.lifecycle_assets['contract:progress'].before_digest);
});

test('schema upgrade rollback preserves before, migration output, and a user-edited progress projection', async () => {
  const { root, state } = await initProject('rc4-schema1-conflict', { agent: 'codex' });
  await downgradeToSchema1(root);
  const applied = await upgradeProject({ project: root, agent: 'codex', yes: true });
  const progressPath = path.join(root, '.vibetether', 'PROGRESS.md');
  await writeFile(progressPath, `${await readFile(progressPath, 'utf8')}\nUser note after upgrade.\n`);

  await assert.rejects(rollbackUpgrade({ id: applied.upgrade_id, yes: true }), /rollback stopped|changed after upgrade/i);
  assert.match(await readFile(progressPath, 'utf8'), /User note after upgrade/);
  const record = await jsonFile(path.join(state, 'upgrades', applied.upgrade_id, 'upgrade.json'));
  assert.equal(record.status, 'conflict-preserved');
  assert.match(record.lifecycle_assets['contract:progress'].before_digest, /^absent$/);
  assert.match(record.lifecycle_assets['contract:progress'].migration_output_digest, /^[a-f0-9]{64}$/);
  assert.match(record.lifecycle_assets['contract:progress'].current_digest, /^[a-f0-9]{64}$/);
  assert.equal(await exists(path.join(record.rollback_conflict_path, 'before')), true);
  assert.equal(await exists(path.join(record.rollback_conflict_path, 'upgrade-output')), true);
  assert.match(await readFile(path.join(record.rollback_conflict_path, 'current', 'contract', '.vibetether', 'PROGRESS.md'), 'utf8'), /User note after upgrade/);
});

test('schema upgrade recognizes exact RC.3 entry Skills but rejects a modified RC.3 copy', async () => {
  const exact = await initProject('rc4-exact-rc3-entry', { agent: 'codex' });
  await downgradeToSchema1(exact.root, '1.0.0-rc.3');
  await writeFile(path.join(exact.root, '.agents', 'skills', 'vibe-tether', 'SKILL.md'), RC3_ENTRY);
  await writeFile(path.join(exact.root, '.agents', 'skills', 'vibe-tether-deep', 'SKILL.md'), RC3_DEEP_ENTRY);
  const instructions = await readFile(path.join(exact.root, 'AGENTS.md'), 'utf8');
  await writeFile(path.join(exact.root, 'AGENTS.md'), instructions.replace(/<!-- vibetether:start -->[\s\S]*?<!-- vibetether:end -->/, RC3_MANAGED_BLOCK));
  assert.equal((await planUpgrade({ project: exact.root, agent: 'codex' })).status, 'preview');
  assert.equal((await upgradeProject({ project: exact.root, agent: 'codex', yes: true })).status, 'upgraded');

  const modified = await initProject('rc4-modified-rc3-entry', { agent: 'codex' });
  await downgradeToSchema1(modified.root, '1.0.0-rc.3');
  await writeFile(path.join(modified.root, '.agents', 'skills', 'vibe-tether', 'SKILL.md'), `${RC3_ENTRY}\nUser customization.\n`);
  await writeFile(path.join(modified.root, '.agents', 'skills', 'vibe-tether-deep', 'SKILL.md'), RC3_DEEP_ENTRY);
  await assert.rejects(planUpgrade({ project: modified.root, agent: 'codex' }), /modified|different|collision/i);
});

test('v0.6-style migration lists byte operations, treats unknown trackers as candidates, and rolls CRLF plus modified Skills back exactly', async () => {
  const project = await legacyProject('rc4-v063-lifecycle', { agent: 'claude' });
  const beforeControl = await readFile(path.join(project.root, '.vibetether', 'project.yaml'));
  const beforeSkill = await readFile(path.join(project.root, '.claude', 'skills', 'vibe-tether', 'SKILL.md'));
  const preview = await planMigration({ project: project.root, control_mode: 'team', agent: 'claude' });
  const operations = new Map(preview.operations.map((item) => [item.path, item.action]));
  assert.equal(operations.get('.vibetether/project.json'), 'create');
  assert.equal(operations.get('.vibetether/outcomes.json'), 'create');
  assert.equal(operations.get('.vibetether/PROGRESS.md'), 'create');
  assert.equal(operations.get('.vibetether/project.yaml'), 'preserve');
  assert.ok(preview.tracker_candidates.some((item) => item.path === '.vibetether/coverage.json'));
  assert.ok(preview.tracker_candidates.some((item) => item.path === '.vibetether/PROGRESS.md' && item.candidate_path === '.vibetether/legacy-candidates/PROGRESS.md'));

  const applied = await migrate({ project: project.root, control_mode: 'team', agent: 'claude', yes: true });
  const context = await discoverContract(project.root);
  assert.equal(context.outcomes.coverage_status, 'draft');
  assert.deepEqual(context.outcomes.outcomes, []);
  const truth = parseTruthMap(context.truthSource);
  assert.ok(truth.candidates.some((item) => item.path === '.vibetether/coverage.json' && item.role === 'legacy-tracker'));
  assert.ok(truth.candidates.some((item) => item.path === '.vibetether/legacy-candidates/PROGRESS.md' && item.role === 'legacy-tracker'));
  assert.match(await readFile(path.join(project.root, '.vibetether', 'legacy-candidates', 'PROGRESS.md'), 'utf8'), /Legacy hand-written progress/);
  assert.doesNotMatch(await readFile(path.join(project.root, '.vibetether', 'PROGRESS.md'), 'utf8'), /Legacy hand-written progress/);
  const record = await jsonFile(path.join(project.state, 'migrations', applied.migration_id, 'migration.json'));
  for (const key of [
    'contract:manifest', 'contract:intent', 'contract:truth', 'contract:experience',
    'contract:skills-lock', 'contract:routes', 'contract:launcher', 'contract:outcomes',
    'contract:progress', 'host:claude:instructions', 'host:claude:skill',
  ]) {
    assert.ok(record.lifecycle_assets[key], `missing lifecycle asset ${key}`);
    assert.equal(typeof record.lifecycle_assets[key].before_digest, 'string');
    assert.equal(typeof record.lifecycle_assets[key].migration_output_digest, 'string');
    assert.equal(record.lifecycle_assets[key].current_digest, record.lifecycle_assets[key].migration_output_digest);
  }

  await rollbackMigration({ id: applied.migration_id, yes: true });
  assert.deepEqual(await readFile(path.join(project.root, '.vibetether', 'project.yaml')), beforeControl);
  assert.deepEqual(await readFile(path.join(project.root, '.claude', 'skills', 'vibe-tether', 'SKILL.md')), beforeSkill);
  assert.equal(await exists(path.join(project.root, 'AGENTS.md')), false);
});

test('uninstall refuses modified Outcome or generated Progress bytes and removes only canonical clean assets', async () => {
  const modifiedProgress = await initProject('rc4-uninstall-progress', { agent: 'codex' });
  const progressPath = path.join(modifiedProgress.root, '.vibetether', 'PROGRESS.md');
  await writeFile(progressPath, `${await readFile(progressPath, 'utf8')}\nmanual edit\n`);
  await assert.rejects(
    uninstallProject({ project: modifiedProgress.root, agent: 'codex', yes: true, remove_contract: true }),
    /modified.*progress|progress.*modified/i,
  );
  assert.equal(await exists(progressPath), true);

  const modifiedOutcomes = await initProject('rc4-uninstall-outcomes', { agent: 'codex' });
  const outcomesPath = path.join(modifiedOutcomes.root, '.vibetether', 'outcomes.json');
  await writeFile(outcomesPath, `${await readFile(outcomesPath, 'utf8')}\n`);
  await assert.rejects(
    uninstallProject({ project: modifiedOutcomes.root, agent: 'codex', yes: true, remove_contract: true }),
    /modified.*outcome|outcome.*modified/i,
  );
  assert.equal(await exists(outcomesPath), true);

  const clean = await initProject('rc4-uninstall-clean', { agent: 'codex' });
  await uninstallProject({ project: clean.root, agent: 'codex', yes: true, remove_contract: true });
  assert.equal(await exists(path.join(clean.root, '.vibetether', 'outcomes.json')), false);
  assert.equal(await exists(path.join(clean.root, '.vibetether', 'PROGRESS.md')), false);
});
