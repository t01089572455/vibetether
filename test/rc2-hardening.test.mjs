import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.mjs';
import { classifyTaskText } from '../src/task-classifier.mjs';
import { inspectProject } from '../src/doctor.mjs';
import { discoverContract } from '../src/contract.mjs';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { grantDeepPermit, prepareDeep, validateDeepPermit } from '../src/deep.mjs';
import { finishStep, startStep } from '../src/step.mjs';
import { migrate, rollbackMigration } from '../src/migrate.mjs';
import { answerDeepCard, contractFinishArgs, contractFinishOptions, deepResolution, fixture, git, initProject, mainJson, successCheckCliArgs, testSuccessCheck } from './helpers.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

async function runtimeContext(root) {
  const context = await discoverContract(root);
  const authority = await authoritySnapshot(context.executionRoot, parseTruthMap(context.truthSource), context.intentSource);
  const runtime = await attachWorktree(context, authority.authority_digest);
  return { context, authority, runtime };
}

test('realistic vague English and Chinese feature requests require a user decision', () => {
  for (const prompt of [
    'Add an export feature.',
    'Implement authentication.',
    'Please improve checkout.',
    '加一个导出功能。',
    '把登录做好一点。',
  ]) {
    const result = classifyTaskText(prompt, { intentStatus: 'confirmed', currentPhase: 'DISCOVER' });
    assert.equal(result.needs_user_decision, true, prompt);
    assert.equal(result.phase, 'DISCOVER', prompt);
    assert.equal(result.capability, 'requirements-clarification', prompt);
  }
});

test('a direction-sensitive user confirmation requires a durable decision reason', async () => {
  const { root } = await initProject('decision-reason');
  const args = ['step', 'start', '--project', root, '--task', 'Add an export feature.', '--slice', 'Implement the user-approved export slice.', '--success-evidence', 'The export acceptance test passes.', ...successCheckCliArgs('The export acceptance test passes.'), '--code-write', '--confirmed-by-user'];
  await assert.rejects(main(args), /decision reason|User decision reason|value/i);
  const started = await mainJson([...args, '--decision-reason', 'The user approved the exact export behavior and bounded slice.']);
  assert.equal(started.route.user_decision_confirmed, true);
  assert.match(started.route.user_decision_reason, /approved/i);
  await main(['step', 'abandon', '--project', root, '--reason', 'Decision-reason test cleanup.']);
});

test('deep permits expire, become stale with authority, and are consumed when the step exits', async () => {
  const { root } = await initProject('deep-lifecycle');
  const task = 'Use deep mode and confirm facts before implementation.';
  const slice = 'Implement the reviewed deep slice.';
  let card = await prepareDeep({ project: root, task, slice, permissions: { code_write: true }, success_evidence: ['Focused checks pass.'], success_checks: [testSuccessCheck('Focused checks pass.')], facts: ['The current implementation lacks the behavior.'], decisions: ['Confirm the exact bounded behavior.'] });
  await answerDeepCard(root, card, deepResolution(card.start_card));
  await grantDeepPermit({ project: root, confirmed_by_user: true, reason: 'The user approved the Start Card.', resolution: deepResolution(card.start_card), ttl_ms: -1 });
  let value = await runtimeContext(root);
  await assert.rejects(validateDeepPermit(value.context, value.runtime, value.authority, { required: true, slice }), /expired/i);

  card = await prepareDeep({ project: root, task, slice, permissions: { code_write: true }, success_evidence: ['Focused checks pass.'], success_checks: [testSuccessCheck('Focused checks pass.')], facts: ['The current implementation lacks the behavior.'], decisions: ['Confirm the exact bounded behavior.'] });
  await answerDeepCard(root, card, deepResolution(card.start_card));
  await grantDeepPermit({ project: root, confirmed_by_user: true, reason: 'The user approved a fresh Start Card.', resolution: deepResolution(card.start_card) });
  await writeFile(path.join(root, 'direction.md'), '# Direction\n\nUser-confirmed product direction.\n');
  await main(['truth', 'add', '--project', root, '--path', 'direction.md', '--role', 'product-direction', '--scope', '.', '--directionality', 'directional', '--yes']);
  await main(['truth', 'confirm', '--project', root, '--path', 'direction.md', '--yes']);
  value = await runtimeContext(root);
  await assert.rejects(validateDeepPermit(value.context, value.runtime, value.authority, { required: true, slice }), /stale/i);

  await main(['step', 'reanchor', '--project', root, '--reason', 'The user reviewed the changed direction.']);
  card = await prepareDeep({ project: root, task, slice, permissions: { code_write: true }, success_evidence: ['Focused checks pass.'], success_checks: [testSuccessCheck('Focused checks pass.')], facts: ['The current implementation lacks the behavior.'], decisions: ['Confirm the exact bounded behavior.'] });
  await answerDeepCard(root, card, deepResolution(card.start_card));
  await grantDeepPermit({ project: root, confirmed_by_user: true, reason: 'The user approved the re-anchored Start Card.', resolution: deepResolution(card.start_card) });
  await main(['step', 'start', '--project', root, '--task', task, '--phase', 'EXECUTE_ONE', '--capability', 'implementation', '--slice', slice, '--success-evidence', 'Focused checks pass.', ...successCheckCliArgs('Focused checks pass.'), '--code-write', '--deep']);
  await main(['step', 'abandon', '--project', root, '--reason', 'Deep lifecycle test cleanup.']);
  value = await runtimeContext(root);
  await assert.rejects(validateDeepPermit(value.context, value.runtime, value.authority, { required: true, slice }), /requires an active|Permit/i);
});

test('completion evidence is invalid after final product bytes change', async () => {
  const { root } = await initProject('final-byte-seal');
  await main(['step', 'start', '--project', root, '--phase', 'EXECUTE_ONE', '--capability', 'implementation', '--slice', 'Apply a bounded implementation change.', '--success-evidence', 'Focused command passes.', ...successCheckCliArgs('Focused command passes.'), '--signal', 'bug-fix', '--code-write']);
  await main(['step', 'finish', '--project', root, ...await contractFinishArgs(root)]);
  await writeFile(path.join(root, 'app.txt'), 'changed after verification\n');
  const report = await inspectProject({ project: root, boundary: 'completion', throw_on_error: false });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some(({ code }) => code === 'CODE_CHANGED_AFTER_EVIDENCE'));
});

test('verified high-value workflow creates a structured Success Capture candidate without explicit capture signals', async () => {
  const { root } = await initProject('capture-value');
  await startStep({
    project: root,
    phase: 'EXECUTE_ONE',
    capability: 'implementation',
    slice: 'Establish the non-obvious authentication environment flag order.',
    success_evidence: ['The focused authentication setup command succeeds.'],
    success_checks: [testSuccessCheck('The focused authentication setup command succeeds.')],
    signals: ['authentication', 'environment-setup', 'bug-fix'],
    agent: 'codex',
    code_write: true,
    confirmed_by_user: true,
    decision_reason: 'The user approved this exact authentication environment workflow for the bounded test slice.',
  });
  const result = await finishStep({ project: root, ...await contractFinishOptions(root) });
  assert.equal(result.experience_capture.disposition, 'first-proven-path');
  const context = await discoverContract(root);
  const candidate = context.experience.entries.find((entry) => entry.id === result.experience_capture.candidate_id);
  assert.equal(candidate.status, 'candidate');
  assert.ok(candidate.observed_sequence.length >= 3);
  assert.ok(candidate.reusability_reasons.length >= 1);
  assert.ok(candidate.decisive_conditions.includes('authentication'));
  assert.ok(candidate.artifacts.length >= 1);
  const candidateArtifact = candidate.artifacts[0];
  assert.match(candidateArtifact.path, /^docs\/operations\/vibetether-candidates\//);
  const candidateBody = await readFile(path.join(root, ...candidateArtifact.path.split('/')), 'utf8');
  assert.match(candidateBody, /Observed safe sequence/);
  assert.match(candidateBody, /Why this may be reusable/);
  assert.match(candidateBody, /Evidence references/);
});

test('portable host assets remain canonical after CRLF checkout conversion', async () => {
  const { root } = await initProject('crlf-host', { agent: 'both' });
  for (const relative of [
    'AGENTS.md', 'CLAUDE.md',
    '.agents/skills/vibe-tether/SKILL.md', '.agents/skills/vibe-tether-deep/SKILL.md',
    '.claude/skills/vibe-tether/SKILL.md', '.claude/skills/vibe-tether-deep/SKILL.md',
  ]) {
    const target = path.join(root, ...relative.split('/'));
    const source = await readFile(target, 'utf8');
    await writeFile(target, source.replace(/\r?\n/g, '\r\n'), 'utf8');
  }
  const report = await inspectProject({ project: root, boundary: 'ordinary', throw_on_error: false });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
});

test('sanitized real-installed v0.6.3 structure migrates, becomes readable, and rolls back byte-for-byte', async () => {
  const f = await fixture('v063-real-installed');
  const fixtureRoot = path.join(packageRoot, 'test', 'fixtures', 'v0.6.3-real-installed');
  await cp(fixtureRoot, f.root, { recursive: true, force: true });
  git(f.root, ['add', '.']);
  git(f.root, ['commit', '-qm', 'sanitized v0.6.3 installed fixture']);
  const before = new Map();
  for (const relative of ['.vibetether/project.yaml', '.vibetether/intent.md', '.vibetether/TRUTH.md', '.vibetether/experience-index.yaml', 'AGENTS.md', 'CLAUDE.md', '.gitignore']) {
    before.set(relative, await readFile(path.join(f.root, ...relative.split('/'))));
  }
  const result = await migrate({ project: f.root, agent: 'both', yes: true });
  const context = await discoverContract(f.root);
  assert.equal(context.manifest.profile, undefined);
  assert.deepEqual(context.skills.packs, ['standard', 'extended', 'production', 'web']);
  assert.equal(context.experience.entries[0].status, 'provisional');
  const capsule = await mainJson(['context', '--project', f.root, '--task', 'Review the migrated Contract.']);
  assert.equal(capsule.project.id, context.manifest.project_id);
  assert.ok(capsule.truth_summary.total >= 0);
  await rollbackMigration({ id: result.migration_id, yes: true });
  for (const [relative, bytes] of before) {
    assert.deepEqual(await readFile(path.join(f.root, ...relative.split('/'))), bytes, relative);
  }
});


test('guided initialization works through a real CLI subprocess on every supported platform', async () => {
  const f = await fixture('guided-init-subprocess');
  const cli = path.join(packageRoot, 'bin', 'vibetether.mjs');
  const result = spawnSync(process.execPath, [
    cli, 'init', '--interactive', '--project', f.root, '--agent', 'codex', '--json',
  ], {
    encoding: 'utf8',
    input: 'Help a beginner complete a safe long task.\nA focused acceptance check passes.\nyes\n',
    timeout: 15000,
    env: { ...process.env, VIBETETHER_STATE_HOME: f.state, VIBETETHER_CACHE_HOME: f.cache, VIBETETHER_CONFIG_HOME: f.config },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Project goal:/);
  assert.match(result.stdout, /Required success evidence:/);
  const contract = await discoverContract(f.root);
  assert.match(contract.intentSource, /Status: confirmed/);
  assert.match(contract.intentSource, /Help a beginner complete a safe long task/);
});

test('migration preserves a v0.6.3 project-local route by importing its installed Skill into the cold cache', async () => {
  const f = await fixture('legacy-route-preservation');
  const vt = path.join(f.root, '.vibetether');
  await mkdir(path.join(vt, 'state'), { recursive: true });
  await mkdir(path.join(f.root, '.agents', 'skills', 'project-helper'), { recursive: true });
  await writeFile(path.join(f.root, '.agents', 'skills', 'project-helper', 'SKILL.md'), `---\nname: project-helper\ndescription: Project-owned clarification helper for migration tests.\n---\n\n# Project helper\n\nReturn the approved goal and remaining ambiguity.\n`, 'utf8');
  await writeFile(path.join(vt, 'project.yaml'), `schema_version: 1\nprofile: core\nintent_contract: .vibetether/intent.md\nexperience_index: .vibetether/experience-index.yaml\nproject_routes: .vibetether/routes.local.yaml\nharnesses:\n  codex:\n    enabled: true\n    instruction_file: AGENTS.md\n`, 'utf8');
  await writeFile(path.join(vt, 'intent.md'), `# VibeTether Intent Contract\n\nStatus: confirmed\n\n## Goal\n\nPreserve the project-owned route.\n\n## Success evidence\n\nThe migrated route selects the imported helper.\n`, 'utf8');
  await writeFile(path.join(vt, 'experience-index.yaml'), 'schema_version: 1\nentries: []\n', 'utf8');
  await writeFile(path.join(vt, 'routes.local.yaml'), `schema_version: 1\nroutes:\n  - id: project-helper-primary\n    phases:\n      - DISCOVER\n    capability: requirements-clarification\n    when_any:\n      - project-helper-requested\n    skill: project-helper\n    role: primary\n    use_when:\n      - Use the project-owned helper when explicitly requested.\n    expected_outputs:\n      - approved_goal\n    exit_evidence:\n      - The project-specific goal is approved.\n`, 'utf8');
  await writeFile(path.join(f.root, 'AGENTS.md'), '# Existing agent instructions\n', 'utf8');

  const result = await migrate({ project: f.root, agent: 'codex', control_mode: 'team', yes: true });
  assert.equal(result.migrated_routes, 1);
  assert.deepEqual(result.imported_project_skills, ['project-helper']);
  const context = await discoverContract(f.root);
  assert.equal(context.routes.routes[0].provider, 'project-helper');
  assert.deepEqual(context.routes.routes[0].required_outputs, ['approved_goal']);
  assert.deepEqual(context.routes.routes[0].exit_evidence, ['The project-specific goal is approved.']);
  assert.ok(context.skills.pins.some((pin) => pin.id === 'project-helper'));
});
