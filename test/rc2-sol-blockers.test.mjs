import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';
import { buildContext } from '../src/context.mjs';
import { inspectProject } from '../src/doctor.mjs';
import { migrate } from '../src/migrate.mjs';
import { discoverContract } from '../src/contract.mjs';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import { answerDeepCard, contractFinishArgs, deepResolution, fixture, git, initProject, mainJson, successCheckCliArgs } from './helpers.mjs';

async function addConfirmed(root, entry) {
  await mkdir(path.dirname(path.join(root, ...entry.path.split('/'))), { recursive: true });
  await writeFile(path.join(root, ...entry.path.split('/')), entry.content ?? '# Truth\n', 'utf8');
  const args = ['truth', 'add', '--project', root, '--path', entry.path, '--role', entry.role, '--scope', entry.scope ?? '.', '--directionality', entry.directionality ?? 'directional'];
  for (const phase of entry.phases ?? []) args.push('--phase', phase);
  for (const operation of entry.operations ?? []) args.push('--operation', operation);
  args.push('--yes');
  await main(args);
  await main(['truth', 'confirm', '--project', root, '--path', entry.path, '--yes']);
}

test('deep mode requires a Start Card and user-confirmed Implementation Permit before code write', async () => {
  const { root } = await initProject('deep-permit');
  const task = '请使用 deep 模式，先核对事实并让我确认后再开工';
  const slice = 'Implement the confirmed deep-mode slice.';
  const capsule = await buildContext({ project: root, task_text: task, agent: 'codex' });
  assert.equal(capsule.task.classification.deep_requested, true);
  assert.equal(capsule.readiness.verdict, 'ASK_USER_DECISION');
  assert.ok(capsule.readiness.reasons.includes('IMPLEMENTATION_PERMIT_REQUIRED'));

  await assert.rejects(
    main(['step', 'start', '--project', root, '--task', task, '--phase', 'EXECUTE_ONE', '--capability', 'implementation', '--slice', slice, '--success-evidence', 'Focused checks pass.', ...successCheckCliArgs('Focused checks pass.'), '--code-write']),
    /Implementation Permit|user decision/i,
  );

  const prepared = await mainJson(['deep', 'prepare', '--project', root, '--task', task, '--slice', slice, '--success-evidence', 'Focused checks pass.', ...successCheckCliArgs('Focused checks pass.'), '--fact', 'The requested behavior is not yet implemented.', '--decision', 'Confirm the bounded implementation slice.', '--code-write']);
  assert.equal(prepared.status, 'awaiting-user-answer');
  assert.equal(prepared.start_card.slice, slice);

  await assert.rejects(main(['deep', 'permit', '--project', root, '--reason', 'Not actually confirmed.']), /confirmed-by-user/i);
  await answerDeepCard(root, prepared, deepResolution(prepared.start_card));
  const permitted = await mainJson(['deep', 'permit', '--project', root, '--confirmed-by-user', '--reason', 'The user approved this exact Start Card.', '--resolution-json', JSON.stringify(deepResolution(prepared.start_card))]);
  assert.equal(permitted.status, 'permitted');
  assert.equal(permitted.permit.status, 'active');

  const started = await mainJson(['step', 'start', '--project', root, '--task', task, '--phase', 'EXECUTE_ONE', '--capability', 'implementation', '--slice', slice, '--success-evidence', 'Focused checks pass.', ...successCheckCliArgs('Focused checks pass.'), '--code-write', '--deep']);
  assert.equal(started.route.status, 'active');
  assert.equal(started.route.task_mode, 'deep');
  assert.equal(started.route.implementation_permit_id, permitted.permit.id);
  await main(['step', 'abandon', '--project', root, '--reason', 'Deep-mode test cleanup.']);
});

test('a task requiring a user decision cannot start an implementation step', async () => {
  const { root } = await initProject('decision-gate');
  const task = 'Implement a new public API and choose the architecture yourself.';
  const capsule = await buildContext({ project: root, task_text: task, agent: 'codex' });
  assert.equal(capsule.task.classification.needs_user_decision, true);
  assert.equal(capsule.readiness.verdict, 'ASK_USER_DECISION');
  await assert.rejects(
    main(['step', 'start', '--project', root, '--task', task, '--slice', task, '--success-evidence', 'The new public API works.', ...successCheckCliArgs('The new public API works.'), '--code-write']),
    /user decision/i,
  );
});

test('completion Doctor rejects an abandoned route with no successful evidence', async () => {
  const { root } = await initProject('doctor-abandoned');
  await main(['step', 'start', '--project', root, '--phase', 'EXECUTE_ONE', '--capability', 'implementation', '--slice', 'Apply one bounded implementation change.', '--success-evidence', 'Focused check passes.', ...successCheckCliArgs('Focused check passes.'), '--signal', 'bug-fix', '--code-write']);
  await main(['step', 'abandon', '--project', root, '--reason', 'The step could not be completed.']);
  const report = await inspectProject({ project: root, boundary: 'completion', throw_on_error: false });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some(({ code }) => code === 'ROUTE_NOT_SATISFIED'));
});

test('finish and completion Doctor reject a missing required output artifact', async () => {
  const { root } = await initProject('missing-route-output');
  const context = await discoverContract(root);
  const routes = { schema_version: 1, routes: [{
    id: 'artifact-contract', phases: ['EXECUTE_ONE'], capability: 'implementation',
    signals: { all: [], any: ['artifact-contract'], none: [] }, provider: 'vibetether-built-in-implementation',
    role: 'primary', priority: 100, required_outputs: ['artifact-that-does-not-exist.md'],
    exit_evidence: ['The required artifact exists and was reviewed.'],
  }] };
  await writeFile(path.join(root, ...context.manifest.routes.split('/')), `${JSON.stringify(routes, null, 2)}\n`, 'utf8');
  await main(['step', 'start', '--project', root, '--phase', 'EXECUTE_ONE', '--capability', 'implementation', '--slice', 'Produce the required artifact.', '--success-evidence', 'The artifact exists.', ...successCheckCliArgs('The artifact exists.'), '--signal', 'artifact-contract', '--code-write', '--confirmed-by-user', '--decision-reason', 'The test author approved the exact artifact-contract slice.']);
  const declarations = await contractFinishArgs(root, { createPathOutputs: false });
  await assert.rejects(
    main(['step', 'finish', '--project', root, ...declarations]),
    /artifact-that-does-not-exist|output contract/i,
  );
  const report = await inspectProject({ project: root, boundary: 'completion', throw_on_error: false });
  assert.equal(report.ok, false);
  await main(['step', 'abandon', '--project', root, '--reason', 'Required output was not produced.']);
});

async function realCanonicalLegacyFixture() {
  const f = await fixture('real-v063-canonical');
  const vt = path.join(f.root, '.vibetether');
  await mkdir(path.join(vt, 'state'), { recursive: true });
  await mkdir(path.join(f.root, 'docs'), { recursive: true });
  await writeFile(path.join(f.root, 'docs', 'spec.md'), '# Real legacy specification\n', 'utf8');
  await writeFile(path.join(vt, 'project.yaml'), [
    'schema_version: 1',
    'profile: standard',
    'truth_index: .vibetether/TRUTH.md',
    'sources:',
    '  conditional:',
    '    requirements:',
    '      - docs/spec.md',
    'experience_index: .vibetether/experience-index.yaml',
    '',
  ].join('\n'), 'utf8');
  const metadata = Buffer.from(JSON.stringify({
    goal: 'Preserve a real v0.6.3 project.',
    success_evidence: 'Migration and rollback remain safe.',
    scope_boundaries: [],
    constraints: ['Preserve existing project instructions and higher-authority decisions.', 'Confirm destructive actions and releases before execution.'],
    visual_direction: null,
  }), 'utf8').toString('base64url');
  await writeFile(path.join(vt, 'intent.md'), `# VibeTether Intent Contract\n\nStatus: confirmed\n<!-- vibetether:intent:v1 ${metadata} -->\n\n## Goal\n\nPreserve a real v0.6.3 project.\n\n## Success evidence\n\nMigration and rollback remain safe.\n\n## Scope boundaries\n\nNo additional boundaries have been recorded yet.\n\n## Non-negotiable constraints\n\n- Preserve existing project instructions and higher-authority decisions.\n- Confirm destructive actions and releases before execution.\n\n## Visual direction\n\nNo visual direction has been recorded yet.\n\n## Open direction decisions\n\nNo open direction decisions.\n`, 'utf8');
  const legacyTruth = `# VibeTether Project Truth Map\n\n<!-- vibetether:truth-map-v1 -->\n\nThis project owns this file. VibeTether never silently activates project documents.\nUnconfirmed candidates do not guide implementation.\n\n## Host bootstrap\n\n- [x] \`AGENTS.md\`\n  - role: \`host-governance\`\n  - scope: \`.\`\n\n## Control-plane pointers\n\n- [x] \`.vibetether/intent.md\`\n  - role: \`intent-contract\`\n  - scope: \`.\`\n\n- [x] \`.vibetether/project.yaml\`\n  - role: \`control-plane-manifest\`\n  - scope: \`.\`\n\n## Confirmed project truth\n\n- [x] \`docs/spec.md\`\n  - role: \`product-requirements\`\n  - scope: \`.\`\n\n## Candidates awaiting confirmation\n\n_None._\n\n## Declined candidates\n\n_None._\n`;
  await writeFile(path.join(vt, 'TRUTH.md'), legacyTruth, 'utf8');
  await writeFile(path.join(vt, 'experience-index.yaml'), 'schema_version: 1\nentries: []\n', 'utf8');
  await writeFile(path.join(f.root, 'AGENTS.md'), '# Existing AGENTS\n', 'utf8');
  return { ...f, legacyTruth };
}

test('migration accepts the real v0.6.3 canonical Truth sections and preserves the original bytes', async () => {
  const f = await realCanonicalLegacyFixture();
  const result = await migrate({ project: f.root, agent: 'codex', control_mode: 'team', yes: true });
  assert.equal(result.status, 'migrated');
  assert.notEqual(result.truth_index, '.vibetether/TRUTH.md');
  assert.equal(await readFile(path.join(f.root, '.vibetether', 'TRUTH.md'), 'utf8'), f.legacyTruth);
  const context = await discoverContract(f.root);
  const map = parseTruthMap(context.truthSource);
  assert.ok(map.confirmed.some((entry) => entry.path === 'docs/spec.md'));
  assert.equal(map.confirmed.some((entry) => entry.path === 'AGENTS.md'), false);
  assert.equal(map.confirmed.some((entry) => entry.path === '.vibetether/intent.md'), false);
});

test('authority digest is line-ending portable across core.autocrlf worktrees', async () => {
  const { root, base } = await initProject('autocrlf-authority');
  await addConfirmed(root, { path: 'docs/spec.md', role: 'product-requirements', phases: ['EXECUTE_ONE'], operations: ['implementation'], content: '# Specification\nUse portable authority bytes.\n' });
  await main(['step', 'reanchor', '--project', root, '--reason', 'Confirmed portable Truth.']);
  await writeFile(path.join(root, '.gitattributes'), '* text=auto\n', 'utf8');
  git(root, ['config', 'core.autocrlf', 'true']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'add portable contract']);
  const sibling = path.join(base, 'crlf-sibling');
  git(root, ['worktree', 'add', '-q', '-b', 'crlf-sibling', sibling]);
  const mainContext = await discoverContract(root);
  const siblingContext = await discoverContract(sibling);
  const mainAuthority = await authoritySnapshot(root, parseTruthMap(mainContext.truthSource), mainContext.intentSource);
  const siblingAuthority = await authoritySnapshot(sibling, parseTruthMap(siblingContext.truthSource), siblingContext.intentSource);
  assert.equal(mainAuthority.authority_digest, siblingAuthority.authority_digest);
});

test('guided init asks for missing direction and writes a confirmed Contract', async () => {
  const f = await fixture('guided-init');
  const answers = ['Help a beginner complete a safe long task.', 'A focused acceptance check passes.', 'yes'];
  const prompts = [];
  const promptAdapter = { async question(prompt) { prompts.push(prompt); return answers.shift(); } };
  const result = JSON.parse(await main(['init', '--project', f.root, '--agent', 'codex', '--json'], { promptAdapter }));
  assert.equal(result.status, 'initialized');
  assert.equal(prompts.length, 3);
  const context = await discoverContract(f.root);
  assert.match(context.intentSource, /Status: confirmed/);
  assert.match(context.intentSource, /Help a beginner complete a safe long task/);
});

test('Truth role, phase, operation, module, and path affect applicability', async () => {
  const { root } = await initProject('truth-applicability');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'parser.mjs'), 'export const parse = () => true;\n', 'utf8');
  await addConfirmed(root, { path: 'release.md', role: 'release-policy', phases: ['SHIP'], operations: ['release'], content: '# Release policy\n' });
  await addConfirmed(root, { path: 'ui.md', role: 'ui-direction', phases: ['DESIGN'], operations: ['frontend'], content: '# UI direction\n' });
  await addConfirmed(root, { path: 'parser.md', role: 'parser-requirements', scope: 'src/parser.mjs', phases: ['DIAGNOSE'], operations: ['debugging'], content: '# Parser requirements\n' });
  await main(['step', 'reanchor', '--project', root, '--reason', 'Reviewed role and scope metadata.']);
  const capsule = await buildContext({ project: root, phase: 'DIAGNOSE', capability: 'debugging', signals: ['unexpected-behavior'], paths: ['src/parser.mjs'] });
  assert.deepEqual(capsule.truth.map((entry) => entry.path), ['parser.md']);
});
