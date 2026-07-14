import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.mjs';
import { serializeExperienceIndex } from '../src/experience-index.mjs';

const project = await mkdtemp(path.join(os.tmpdir(), 'vibetether-acceptance-'));

const exampleIndex = {
  schema_version: 1,
  entries: [{
    id: 'github-publication',
    use_when: ['github', 'publish', 'release'],
    systems: ['git', 'windows'],
    artifacts: ['docs/operations/github-publishing.md'],
    verified_at: '2026-07-13',
    revalidate_when: ['authentication-method-changes', 'remote-changes'],
    status: 'proven',
  }],
};

try {
  const initialized = await main([
    'init', '--project', project, '--profile', 'core', '--yes',
    '--goal', 'Help a beginner complete a controlled long-running task.',
    '--success-evidence', 'Doctor and applicable-experience checks pass.',
  ]);
  assert.match(initialized, /initialized/i);
  await assert.rejects(access(path.join(project, '.vibetether', 'providers')));
  process.stdout.write('guided bootstrap: PASS\n');

  await mkdir(path.join(project, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(project, 'docs', 'operations', 'github-publishing.md'), '# GitHub publishing\n');
  await writeFile(
    path.join(project, '.vibetether', 'experience-index.yaml'),
    serializeExperienceIndex(exampleIndex),
  );

  const route = JSON.parse(await main([
    'capabilities', '--project', project, '--phase', 'SHIP',
    '--capability', 'proven-path-recall', '--signal', 'publish', '--signal', 'windows', '--json',
  ]));
  assert.equal(route.applicable_experience[0].id, 'github-publication');
  process.stdout.write('applicable experience: github-publication\n');

  const health = await main(['doctor', '--project', project]);
  assert.match(health, /doctor: healthy/i);
  process.stdout.write('doctor healthy: PASS\n');

  await main(['uninstall', '--project', project, '--dry-run']);
  await main(['uninstall', '--project', project, '--yes']);
  process.stdout.write(`VibeTether acceptance tour passed in ${project}\n`);
} finally {
  await rm(project, { recursive: true, force: true });
}
