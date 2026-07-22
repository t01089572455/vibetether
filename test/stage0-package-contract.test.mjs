import assert from 'node:assert/strict';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  downgradeProjectToRc1, validateArchiveContract, validateStage0PackageReport,
} from '../scripts/test-stage0-package-contract.mjs';
import { installedPackageFixture, runCli, runGit } from './stage0-package-helpers.mjs';

function jsonCli(fixture, args, options) {
  const result = runCli(fixture, [...args, '--json'], options);
  return { ...result, body: result.stdout.trim() ? JSON.parse(result.stdout) : null };
}

function proofArgs(route, checkId, artifact) {
  const result = [];
  for (const output of route.required_outputs ?? []) result.push('--output-proof-json', JSON.stringify({
    output, check_ids: [checkId], summary: `Installed package evidence proves ${output}.`, artifact_paths: [artifact],
  }));
  for (const criterion of route.exit_evidence ?? []) result.push('--exit-proof-json', JSON.stringify({
    criterion, check_ids: [checkId], summary: 'The installed package command passed on final fixture bytes.', artifact_paths: [artifact],
  }));
  return result;
}

async function initFixtureProject(fixture, name, extra = []) {
  const project = path.join(fixture.base, 'projects', name);
  await mkdir(project, { recursive: true });
  runGit(project, ['init', '-q']);
  runGit(project, ['config', 'user.email', 'test@example.com']);
  runGit(project, ['config', 'user.name', 'VibeTether Tests']);
  await writeFile(path.join(project, 'app.txt'), 'initial\n');
  runGit(project, ['add', 'app.txt']);
  runGit(project, ['commit', '-qm', 'initial']);
  jsonCli(fixture, [
    'init', '--project', project, '--agent', 'codex',
    '--goal', `Exercise installed package profile ${name}.`,
    '--success-evidence', 'The installed package journey passes.',
    '--confirmed', '--yes', ...extra,
  ]);
  return project;
}

test('S0-R06: installed package preserves fresh Truth and composes non-weakening project routes', { timeout: 180_000 }, async (t) => {
  const fixture = await installedPackageFixture('contract');
  t.after(fixture.cleanup);
  runGit(fixture.project, ['init', '-q']);
  runGit(fixture.project, ['config', 'user.email', 'test@example.com']);
  runGit(fixture.project, ['config', 'user.name', 'VibeTether Tests']);
  await mkdir(path.join(fixture.project, 'docs', 'adr'), { recursive: true });
  await mkdir(path.join(fixture.project, 'docs', 'ui'), { recursive: true });
  await Promise.all([
    writeFile(path.join(fixture.project, 'README.md'), '# Product\n\nThe product supports dark mode and SSO.\n'),
    writeFile(path.join(fixture.project, 'docs', 'requirements.md'), '# Requirements\n\nCandidate requirements only.\n'),
    writeFile(path.join(fixture.project, 'docs', 'adr', '0001.md'), '# ADR\n\nCandidate architecture only.\n'),
    writeFile(path.join(fixture.project, 'docs', 'ui', 'reference.md'), '# UI reference\n\nCandidate visual reference only.\n'),
    writeFile(path.join(fixture.project, 'docs', 'old-plan.md'), '# Old plan\n\nHistorical plan only.\n'),
  ]);
  runGit(fixture.project, ['add', 'README.md', 'docs']);
  runGit(fixture.project, ['commit', '-qm', 'initial']);

  runCli(fixture, [
    'init', '--project', fixture.project, '--agent', 'codex',
    '--goal', 'Keep the package contract honest.',
    '--success-evidence', 'Installed public journeys pass.',
    '--profile', 'extended', '--bundle', 'production', '--confirmed', '--yes', '--json',
  ]);
  const truth = runCli(fixture, ['truth', 'list', '--project', fixture.project, '--json']);
  const truthReport = JSON.parse(truth.stdout);
  assert.deepEqual(truthReport.confirmed ?? [], []);
  assert.deepEqual(truthReport.candidates ?? [], []);
  assert.deepEqual(truthReport.declined ?? [], []);
  const intent = await readFile(path.join(fixture.project, '.vibetether', 'intent.md'), 'utf8');
  assert.match(intent, /Keep the package contract honest/);
  assert.match(intent, /Installed public journeys pass/);
  assert.doesNotMatch(intent, /dark mode|SSO|Candidate requirements|Candidate architecture|Historical plan/i);
  assert.deepEqual((await readdir(path.join(fixture.project, '.agents', 'skills'))).sort(), ['vibe-tether', 'vibe-tether-deep']);
  await assert.rejects(access(path.join(fixture.project, '.vibetether', 'providers')));

  const routesPath = path.join(fixture.project, '.vibetether', 'routes.json');
  const routes = JSON.parse(await readFile(routesPath, 'utf8'));
  routes.routes.push({
    id: 'package-primary',
    phases: ['EXECUTE_ONE'],
    capability: 'implementation',
    signals: { all: [], any: ['package-overlay'], none: [] },
    provider: 'vibetether-built-in-implementation',
    role: 'primary',
    priority: 100,
    required_outputs: ['package_primary_output'],
    exit_evidence: ['Package primary evidence is preserved.'],
  }, {
    id: 'package-alternative',
    phases: ['EXECUTE_ONE'],
    capability: 'implementation',
    signals: { all: [], any: ['package-overlay'], none: [] },
    provider: 'addy-incremental-implementation',
    role: 'alternative',
    priority: 50,
    required_outputs: ['package_alternative_output'],
    exit_evidence: ['Package alternative evidence is preserved.'],
  }, {
    id: 'package-output-overlay',
    phases: ['EXECUTE_ONE'],
    capability: 'implementation',
    signals: { all: [], any: ['package-overlay'], none: [] },
    provider: 'vibetether-built-in-implementation',
    role: 'overlay',
    priority: 10,
    required_outputs: ['package_overlay_output'],
    exit_evidence: ['Package overlay evidence is preserved.'],
  });
  await writeFile(routesPath, `${JSON.stringify(routes, null, 2)}\n`);
  const capability = runCli(fixture, [
    'capabilities', '--project', fixture.project,
    '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
    '--signal', 'package-overlay', '--code-write', '--json',
  ]);
  const report = JSON.parse(capability.stdout);
  assert.ok(report.required_outputs.includes('bounded_change'));
  assert.ok(report.required_outputs.includes('package_primary_output'));
  assert.ok(report.required_outputs.includes('package_alternative_output'));
  assert.ok(report.required_outputs.includes('package_overlay_output'));
  assert.ok(report.exit_evidence.includes('Package overlay evidence is preserved.'));
  assert.equal(report.selected.id, 'vibetether-built-in-implementation');

  const weakUiRoutes = structuredClone(routes);
  weakUiRoutes.routes.push({
    id: 'attempted-ui-weakening', phases: ['EXECUTE_ONE'], capability: 'frontend-propagation',
    signals: { all: [], any: ['attempted-ui-weakening'], none: [] },
    provider: 'vibetether-built-in-implementation', role: 'overlay', priority: 1000,
    required_outputs: [], exit_evidence: [],
  });
  await writeFile(routesPath, `${JSON.stringify(weakUiRoutes, null, 2)}\n`);
  const uiCheck = {
    id: 'check-package-ui-weakening', claim: 'The attempted package UI propagation passes.', kind: 'command',
    command: [process.execPath, '-e', "const fs=require('node:fs');if(!fs.existsSync('ui.txt'))process.exit(7)"],
    covers_paths: ['ui.txt'], consumer_paths: ['ui.txt'], acceptance_ids: [],
  };
  const weakUi = runCli(fixture, [
    'step', 'start', '--project', fixture.project, '--phase', 'EXECUTE_ONE', '--capability', 'frontend-propagation',
    '--task', 'Propagate the UI without its governed Outcome.', '--slice', 'Attempt only the refused UI propagation.',
    '--path', 'ui.txt', '--success-evidence', uiCheck.claim, '--success-check-json', JSON.stringify(uiCheck),
    '--signal', 'attempted-ui-weakening', '--code-write', '--confirmed-by-user',
    '--decision-reason', 'The fixture user confirms this exact refused propagation attempt.', '--json',
  ], { allowFailure: true });
  assert.notEqual(weakUi.status, 0);
  assert.match(`${weakUi.stdout}\n${weakUi.stderr}`, /requires a selected required UI Outcome/i);

  const permission = runCli(fixture, [
    'capabilities', '--project', fixture.project, '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
    '--signal', 'package-overlay', '--json',
  ], { allowFailure: true });
  assert.notEqual(permission.status, 0);
  assert.match(`${permission.stdout}\n${permission.stderr}`, /PROVIDER_UNAVAILABLE|permissions/i);

  const ambiguous = structuredClone(routes);
  ambiguous.routes.push({ ...ambiguous.routes[0], id: 'package-primary-duplicate' });
  await writeFile(routesPath, `${JSON.stringify(ambiguous, null, 2)}\n`);
  const refused = runCli(fixture, [
    'capabilities', '--project', fixture.project, '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
    '--signal', 'package-overlay', '--code-write', '--json',
  ], { allowFailure: true });
  assert.notEqual(refused.status, 0);
  assert.match(`${refused.stdout}\n${refused.stderr}`, /AMBIGUOUS_ROUTE|equally matching primaries/i);
});

test('S0-R06: installed profiles, upgrade rollback, provenance, and Proven Path remain exact', { timeout: 240_000 }, async (t) => {
  const fixture = await installedPackageFixture('profiles-upgrade-proven-path');
  t.after(fixture.cleanup);

  const profiles = [
    ['core', ['--profile', 'core']],
    ['standard', ['--profile', 'standard']],
    ['extended', ['--profile', 'extended']],
    ['web', ['--profile', 'standard', '--bundle', 'web']],
    ['production', ['--profile', 'standard', '--bundle', 'production']],
  ];
  for (const [name, args] of profiles) {
    const project = await initFixtureProject(fixture, name, args);
    const routed = jsonCli(fixture, [
      'capabilities', '--project', project, '--phase', 'DIAGNOSE', '--capability', 'debugging',
    ]).body;
    assert.match(routed.selected.fingerprint, /^[a-f0-9]{64}$/);
    assert.match(routed.selected.object_hash, /^[a-f0-9]{64}$/);
    assert.ok(routed.shortlist.length >= 1 && routed.shortlist.length <= 3);
    await assert.rejects(access(path.join(project, '.vibetether', 'providers')));
  }

  const upgrade = await initFixtureProject(fixture, 'upgrade', ['--profile', 'extended', '--bundle', 'production']);
  const routesPath = path.join(upgrade, '.vibetether', 'routes.json');
  const skillsPath = path.join(upgrade, '.vibetether', 'skills.lock.json');
  const routes = JSON.parse(await readFile(routesPath, 'utf8'));
  routes.routes.push({
    id: 'preserved-upgrade-route', phases: ['EXECUTE_ONE'], capability: 'implementation',
    signals: { all: [], any: ['upgrade-preserve'], none: [] }, provider: 'vibetether-built-in-implementation',
    role: 'primary', priority: 100, required_outputs: ['preserved_route_output'], exit_evidence: ['Preserved route evidence.'],
  });
  await writeFile(routesPath, `${JSON.stringify(routes, null, 2)}\n`);
  jsonCli(fixture, ['skills', 'prefer', '--project', upgrade, '--id', 'addy-incremental-implementation']);
  jsonCli(fixture, ['skills', 'disable', '--project', upgrade, '--id', 'vibetether-built-in-tdd']);
  const routesBefore = await readFile(routesPath);
  const skillsBefore = await readFile(skillsPath);
  await downgradeProjectToRc1(upgrade, { agent: 'codex' });
  const preview = jsonCli(fixture, ['upgrade', '--project', upgrade, '--agent', 'codex', '--dry-run']).body;
  assert.equal(preview.status, 'preview');
  const applied = jsonCli(fixture, ['upgrade', '--project', upgrade, '--agent', 'codex', '--yes']).body;
  assert.deepEqual(await readFile(routesPath), routesBefore);
  assert.deepEqual(await readFile(skillsPath), skillsBefore);
  jsonCli(fixture, ['upgrade', 'rollback', '--id', applied.upgrade_id, '--yes']);
  assert.deepEqual(await readFile(routesPath), routesBefore);
  assert.deepEqual(await readFile(skillsPath), skillsBefore);

  const proven = await initFixtureProject(fixture, 'proven-path');
  const artifact = 'recovery.txt';
  const recoveryText = '# Installed recovery path\n\nRun the verified installed recovery sequence and preserve its bounded evidence.\n';
  const check = {
    id: 'check-installed-proven-path', claim: 'The recovered installed-package workflow passes.', kind: 'command',
    command: [process.execPath, '-e', "const fs=require('node:fs');if(!fs.readFileSync('recovery.txt','utf8').includes('verified installed recovery sequence'))process.exit(7)"],
    covers_paths: [artifact], consumer_paths: [artifact], acceptance_ids: [],
  };
  const started = jsonCli(fixture, [
    'step', 'start', '--project', proven, '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
    '--task', 'Recover the non-obvious installed package workflow.', '--slice', 'Recover only the reusable local workflow.',
    '--path', artifact, '--success-evidence', check.claim, '--success-check-json', JSON.stringify(check),
    '--signal', 'bug-fix', '--signal', 'recovered-path', '--provider', 'vibetether-built-in-implementation',
    '--code-write', '--confirmed-by-user', '--decision-reason', 'The fixture user approved this exact recovered path.',
  ]).body;
  await writeFile(path.join(proven, artifact), recoveryText);
  const finished = jsonCli(fixture, [
    'step', 'finish', '--project', proven, ...proofArgs(started.route, check.id, artifact),
  ]).body;
  assert.match(finished.experience_capture.candidate_id, /^capture-/);
  const confirmArgs = ['experience', 'confirm', '--project', proven, '--id', finished.experience_capture.candidate_id];
  for (const id of finished.route.evidence_ids) confirmArgs.push('--evidence-id', id);
  jsonCli(fixture, [...confirmArgs, '--yes']);
  const recalled = jsonCli(fixture, [
    'context', '--project', proven, '--boundary', 'task-entry', '--phase', 'EXECUTE_ONE',
    '--capability', 'proven-path-recall', '--signal', 'recovered-path', '--code-write',
  ]).body;
  assert.ok(recalled.experience.some((item) => item.id === finished.experience_capture.candidate_id));

  await writeFile(path.join(proven, artifact), '# Changed recovery path\n\nThe artifact bytes changed and now require explicit revalidation.\n');
  let audit = jsonCli(fixture, ['experience', 'audit', '--project', proven, '--signal', 'recovered-path']).body;
  let audited = audit.find((item) => item.id === finished.experience_capture.candidate_id);
  assert.ok(audited?.reasons.includes('artifact-changed'), JSON.stringify(audited));
  await writeFile(path.join(proven, artifact), recoveryText);
  const skillsRaw = await readFile(path.join(proven, '.vibetether', 'skills.lock.json'));
  jsonCli(fixture, ['skills', 'prefer', '--project', proven, '--id', 'vibetether-built-in-tdd']);
  audit = jsonCli(fixture, ['experience', 'audit', '--project', proven, '--signal', 'recovered-path']).body;
  audited = audit.find((item) => item.id === finished.experience_capture.candidate_id);
  assert.ok(audited?.reasons.includes('skills-changed'), JSON.stringify(audited));
  await writeFile(path.join(proven, '.vibetether', 'skills.lock.json'), skillsRaw);
  await writeFile(path.join(proven, 'new-truth.md'), '# Truth\nA new confirmed requirement.\n');
  jsonCli(fixture, ['truth', 'add', '--project', proven, '--path', 'new-truth.md', '--role', 'requirement', '--scope', '.', '--yes']);
  jsonCli(fixture, ['truth', 'confirm', '--project', proven, '--path', 'new-truth.md', '--yes']);
  audit = jsonCli(fixture, ['experience', 'audit', '--project', proven, '--signal', 'recovered-path']).body;
  audited = audit.find((item) => item.id === finished.experience_capture.candidate_id);
  assert.ok(audited?.reasons.includes('authority-changed'), JSON.stringify(audited));

  const installedRoot = path.resolve(path.dirname(fixture.cli), '..');
  const provider = path.join(installedRoot, 'registry', 'builtins', 'vibetether-built-in-design', 'SKILL.md');
  const providerBytes = await readFile(provider);
  await writeFile(provider, Buffer.concat([providerBytes, Buffer.from('\ntampered\n')]));
  const tampered = runCli(fixture, [
    'capabilities', '--phase', 'DESIGN', '--capability', 'product-design', '--json',
  ], { allowFailure: true });
  await writeFile(provider, providerBytes);
  assert.notEqual(tampered.status, 0);
  assert.match(`${tampered.stdout}\n${tampered.stderr}`, /integrity|fingerprint|hash|digest|mismatch/i);
});

test('archive and report validators fail closed on unsafe or incomplete evidence', () => {
  const base = {
    entries: [
      { path: 'package/bin/vibetether.mjs', type: 'file' },
      { path: 'package/package.json', type: 'file' },
      { path: 'package/registry/capabilities.json', type: 'file' },
      { path: 'package/registry/providers.json', type: 'file' },
      { path: 'package/src/cli.mjs', type: 'file' },
      { path: 'package/skills/vibe-tether/SKILL.md', type: 'file' },
    ],
    sha256: 'a'.repeat(64), expected_sha256: 'a'.repeat(64),
  };
  assert.equal(validateArchiveContract(base).safe, true);
  assert.throws(() => validateArchiveContract({ ...base, entries: [...base.entries, { path: 'package/../escape', type: 'file' }] }), /unsafe/i);
  assert.throws(() => validateArchiveContract({ ...base, entries: [...base.entries, { path: 'package/link', type: 'symlink' }] }), /symlink|entry type/i);
  assert.throws(() => validateArchiveContract({ ...base, entries: base.entries.slice(0, 2) }), /missing/i);
  assert.throws(() => validateArchiveContract({ ...base, expected_sha256: 'b'.repeat(64) }), /digest/i);
  assert.throws(() => validateStage0PackageReport({ ok: true }), /source|archive|runtime|journey/i);
});
