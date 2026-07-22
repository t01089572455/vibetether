import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { installedPackageFixture, runCli, runGit } from './stage0-package-helpers.mjs';

test('S0-R06 characterization: installed package preserves fresh Truth and composes a project route overlay', async (t) => {
  const fixture = await installedPackageFixture('contract');
  t.after(fixture.cleanup);
  runGit(fixture.project, ['init', '-q']);
  runGit(fixture.project, ['config', 'user.email', 'test@example.com']);
  runGit(fixture.project, ['config', 'user.name', 'VibeTether Tests']);
  await writeFile(path.join(fixture.project, 'README.md'), '# Product\n\nThe product supports dark mode and SSO.\n');
  runGit(fixture.project, ['add', 'README.md']);
  runGit(fixture.project, ['commit', '-qm', 'initial']);

  runCli(fixture, [
    'init', '--project', fixture.project, '--agent', 'codex',
    '--goal', 'Keep the package contract honest.',
    '--success-evidence', 'Installed public journeys pass.',
    '--confirmed', '--yes', '--json',
  ]);
  const truth = runCli(fixture, ['truth', 'list', '--project', fixture.project, '--json']);
  const truthReport = JSON.parse(truth.stdout);
  assert.deepEqual(truthReport.confirmed ?? [], []);
  assert.deepEqual(truthReport.candidates ?? [], []);
  assert.deepEqual(truthReport.declined ?? [], []);
  await assert.rejects(access(path.join(fixture.project, '.vibetether', 'providers')));

  const routesPath = path.join(fixture.project, '.vibetether', 'routes.json');
  const routes = JSON.parse(await readFile(routesPath, 'utf8'));
  routes.routes.push({
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
  assert.ok(report.required_outputs.includes('package_overlay_output'));
  assert.ok(report.exit_evidence.includes('Package overlay evidence is preserved.'));
});
