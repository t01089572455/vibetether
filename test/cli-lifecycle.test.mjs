import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { serializeExperienceIndex } from '../src/experience-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'vibetether.mjs');

async function project(name) {
  return mkdtemp(path.join(os.tmpdir(), `vibetether-lifecycle-${name}-`));
}

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function initializedProject(name) {
  const target = await project(name);
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  return target;
}

async function setExperienceFeedback(target, experienceFeedback) {
  const checkpointPath = path.join(target, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  checkpoint.experience_feedback = experienceFeedback;
  await writeFile(checkpointPath, YAML.stringify(checkpoint), 'utf8');
}

async function writeOperationalExperience(target, id, artifact) {
  await mkdir(path.join(target, path.dirname(artifact)), { recursive: true });
  await writeFile(path.join(target, artifact), '# Proven operation\n', 'utf8');

  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  manifest.sources.conditional.operations = [`${path.posix.dirname(artifact)}/`];
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');

  const index = {
    schema_version: 1,
    entries: [{
      id,
      use_when: ['release'],
      artifacts: [artifact],
      verified_at: '2026-07-14',
      revalidate_when: [],
      status: 'proven',
    }],
  };
  await writeFile(
    path.join(target, '.vibetether', 'experience-index.yaml'),
    serializeExperienceIndex(index),
    'utf8',
  );
}

function doctorFailure(target) {
  const result = runCli(['doctor', '--project', target, '--json']);
  assert.equal(result.status, 4, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('doctor reports a healthy initialized project as machine-readable JSON', async () => {
  const target = await project('doctor-ok');
  assert.equal(runCli(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']).status, 0);

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.schema_version, 1);
  assert.deepEqual(report.harnesses, ['codex', 'claude']);
});

test('doctor enforces the same canonical manifest grammar as runtime routing', async () => {
  const target = await initializedProject('doctor-canonical-manifest');
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  await writeFile(manifestPath, `# non-canonical comment\n${await readFile(manifestPath, 'utf8')}`, 'utf8');

  const runtime = runCli(['capabilities', '--project', target, '--json']);
  assert.equal(runtime.status, 3, runtime.stderr || runtime.stdout);

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((entry) => entry.code === 'invalid-manifest'), true);
  assert.match(JSON.stringify(report.issues), /canonical|manifest/i);
});

test('doctor neutralizes malformed provider-lock diagnostics without echoing secrets', async () => {
  const target = await initializedProject('doctor-provider-lock-redaction');
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const secret = `github_pat_${'L'.repeat(30)}`;
  await writeFile(lockPath, `sources: [${secret}\n`, 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((entry) => entry.code === 'invalid-provider-lock'), true);
  assert.match(JSON.stringify(report.issues), /invalid provider-lock yaml/i);
  assert.doesNotMatch(result.stdout, new RegExp(secret));
});

test('doctor reports malformed capability-board route structures', async () => {
  const target = await project('doctor-invalid-board-shape');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const boardPath = path.join(target, '.vibetether', 'capabilities.yaml');
  const board = JSON.parse(await readFile(boardPath, 'utf8'));
  board.routes = [{
    id: 'missing-recommendation',
    phase: 'PLAN',
    capability: 'requirements-clarification',
    signals: { all: [], any: [] },
  }];
  await writeFile(boardPath, `${JSON.stringify(board, null, 2)}\n`, 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((issue) => issue.code === 'invalid-capability-board'), true);
  assert.match(JSON.stringify(report.issues), /recommendation mapping/i);
});

test('doctor reports malformed capability boards without echoing untrusted identifiers', async () => {
  const target = await project('doctor-invalid-board-identifiers');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const boardPath = path.join(target, '.vibetether', 'capabilities.yaml');
  const baseBoard = JSON.parse(await readFile(boardPath, 'utf8'));
  const secret = `github_pat_${'Z'.repeat(30)}`;
  const cases = [
    ['route identifier', (board) => {
      board.routes = [{
        id: secret,
        phase: 'PLAN',
        capability: 'requirements-clarification',
        signals: { all: [], any: [] },
      }];
    }],
    ['capability identifier', (board) => {
      board.capabilities = [{ id: secret, provider_options: {} }];
    }],
    ['provider skill', (board) => {
      board.providers = [{ skill: secret, capabilities: {} }];
    }],
  ];

  for (const [label, mutate] of cases) {
    const board = structuredClone(baseBoard);
    mutate(board);
    await writeFile(boardPath, `${JSON.stringify(board, null, 2)}\n`, 'utf8');

    const result = runCli(['doctor', '--project', target, '--json']);

    assert.equal(result.status, 4, `${label}: ${result.stderr || result.stdout}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.issues.some((issue) => issue.code === 'invalid-capability-board'), true, label);
    assert.doesNotMatch(result.stdout, new RegExp(secret), label);
    assert.match(JSON.stringify(report.issues), /capability board/i, label);
  }
});

test('doctor reports invalid capability-board syntax without echoing its contents', async () => {
  const target = await project('doctor-invalid-board-syntax');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const boardPath = path.join(target, '.vibetether', 'capabilities.yaml');
  const secret = `github_pat_${'X'.repeat(30)}`;
  await writeFile(boardPath, `schema_version: 1\nmode: advisory-router\ncapabilities: [${secret}\n`, 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((issue) => issue.code === 'invalid-capability-board'), true);
  assert.match(JSON.stringify(report.issues), /invalid capability-board yaml/i);
  assert.doesNotMatch(result.stdout, new RegExp(secret));
});

test('doctor exits 4 when a declared truth source is missing', async () => {
  const target = await project('doctor-fail');
  await mkdir(path.join(target, 'docs'), { recursive: true });
  await writeFile(path.join(target, 'docs', 'product-direction.md'), '# Product direction\n', 'utf8');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  await rm(path.join(target, '.vibetether', 'intent.md'));

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.issues.some((issue) => issue.code === 'missing-source'), true);

  const installedValidator = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'validate-project.mjs');
  const validator = spawnSync(process.execPath, [installedValidator, '--project', target], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(validator.status, 1, validator.stderr || validator.stdout);
  assert.match(validator.stderr, /missing declared source.*intent\.md/i);
});

test('doctor requires an explicit Intent Contract manifest field', async () => {
  const target = await project('doctor-intent-field');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.intent_contract;
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((issue) => issue.code === 'missing-intent-contract'), true);
});

test('doctor detects a stale runtime checkpoint without exposing private reasoning', async () => {
  const target = await project('doctor-stale');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const checkpointPath = path.join(target, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  checkpoint.last_reanchor = '2000-01-01T00:00:00.000Z';
  await writeFile(checkpointPath, YAML.stringify(checkpoint), 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((issue) => issue.code === 'stale-checkpoint'), true);
  assert.doesNotMatch(result.stdout, /chain-of-thought|private_reasoning/i);

  const installedValidator = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'validate-project.mjs');
  const validator = spawnSync(process.execPath, [installedValidator, '--project', target], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(validator.status, 1, validator.stderr || validator.stdout);
  assert.match(validator.stderr, /stale checkpoint/i);
});

test('doctor blocks a completion-like checkpoint while success capture is pending', async () => {
  const target = await project('doctor-pending-success');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const checkpointPath = path.join(target, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  checkpoint.phase = 'REVIEW';
  await writeFile(checkpointPath, YAML.stringify(checkpoint), 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((issue) => issue.code === 'pending-experience-feedback'), true);
});

test('doctor rejects first-proven capture without a durable artifact', async () => {
  const target = await project('doctor-missing-success-artifact');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const checkpointPath = path.join(target, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  checkpoint.phase = 'REVIEW';
  checkpoint.experience_feedback = {
    trigger: 'first-proven-path',
    disposition: 'captured',
    reason: 'The first verified publication path is reusable.',
    artifacts: [],
  };
  await writeFile(checkpointPath, YAML.stringify(checkpoint), 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((issue) => issue.code === 'invalid-experience-feedback'), true);
});

test('doctor rejects a captured Markdown Proven Path that is not manifest-routed', async () => {
  const target = await project('doctor-unrouted-success');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  await mkdir(path.join(target, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(target, 'docs', 'operations', 'publication.md'), '# Publication\n', 'utf8');
  const checkpointPath = path.join(target, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  checkpoint.phase = 'REVIEW';
  checkpoint.experience_feedback = {
    trigger: 'first-proven-path',
    disposition: 'captured',
    reason: 'The first verified publication path is reusable.',
    artifacts: ['docs/operations/publication.md'],
  };
  await writeFile(checkpointPath, YAML.stringify(checkpoint), 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((issue) => issue.code === 'unrouted-experience-artifact'), true);
});

test('doctor accepts a captured first-proven path with a manifest-routed durable artifact', async () => {
  const target = await project('doctor-captured-success');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  await writeOperationalExperience(target, 'publication-path', 'docs/operations/publication.md');
  const checkpointPath = path.join(target, '.vibetether', 'state', 'current.yaml');
  const checkpoint = YAML.parse(await readFile(checkpointPath, 'utf8'));
  checkpoint.phase = 'REVIEW';
  checkpoint.experience_feedback = {
    trigger: 'first-proven-path',
    disposition: 'captured',
    reason: 'The first verified publication path is reusable.',
    artifacts: ['docs/operations/publication.md'],
  };
  await writeFile(checkpointPath, YAML.stringify(checkpoint), 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test('doctor rejects captured reusable operations missing from the experience index', async () => {
  const target = await initializedProject('captured-missing-index');
  const artifact = 'docs/operations/release.md';
  await mkdir(path.join(target, 'docs', 'operations'), { recursive: true });
  await writeFile(path.join(target, artifact), '# Release\n', 'utf8');
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  manifest.sources.conditional.operations = ['docs/operations/'];
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
  await setExperienceFeedback(target, {
    trigger: 'first-proven-path',
    disposition: 'captured',
    reason: 'The release workflow succeeded with fresh remote evidence.',
    artifacts: [artifact],
  });

  const report = doctorFailure(target);

  assert.equal(report.issues.some((entry) => entry.code === 'unindexed-experience-artifact'), true);
});

test('doctor accepts already-encoded operations only when a valid index entry remains', async () => {
  const target = await initializedProject('already-encoded');
  const artifact = 'docs/operations/release.md';
  await writeOperationalExperience(target, 'release-path', artifact);
  await setExperienceFeedback(target, {
    trigger: 'repeat-proven-path',
    disposition: 'already-encoded',
    reason: 'The unchanged path is already documented and indexed.',
    artifacts: [artifact],
  });

  const healthy = runCli(['doctor', '--project', target, '--json']);
  assert.equal(healthy.status, 0, healthy.stderr || healthy.stdout);

  await writeFile(
    path.join(target, '.vibetether', 'experience-index.yaml'),
    serializeExperienceIndex({ schema_version: 1, entries: [] }),
    'utf8',
  );
  const report = doctorFailure(target);
  assert.equal(report.issues.some((entry) => entry.code === 'unindexed-experience-artifact'), true);
});

test('doctor rejects secret-bearing and escaping index entries', async () => {
  const target = await initializedProject('unsafe-index');
  await writeFile(
    path.join(target, '.vibetether', 'experience-index.yaml'),
    'schema_version: 1\nentries:\n  - id: unsafe\n    use_when:\n      - release\n    artifacts:\n      - ../secret.md\n    verified_at: 2026-07-14\n    revalidate_when: []\n    status: proven\n    token: ghp_abcdefghijklmnopqrstuvwxyz123456\n',
    'utf8',
  );

  const report = doctorFailure(target);

  assert.equal(
    report.issues.some((entry) => ['invalid-experience-index', 'experience-artifact-escape'].includes(entry.code)),
    true,
  );

  const installedValidator = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'validate-project.mjs');
  const validator = spawnSync(process.execPath, [installedValidator, '--project', target], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(validator.status, 1, validator.stderr || validator.stdout);
  assert.match(validator.stderr, /experience index/i);
  assert.doesNotMatch(validator.stderr, /ghp_abcdefghijklmnopqrstuvwxyz123456/);
});

test('doctor and the installed validator reject a linked experience index authority', async (context) => {
  const target = await initializedProject('linked-index');
  const indexPath = path.join(target, '.vibetether', 'experience-index.yaml');
  const external = path.join(await project('linked-index-external'), 'experience-index.yaml');
  await writeFile(external, serializeExperienceIndex({ schema_version: 1, entries: [] }), 'utf8');
  await rm(indexPath);
  try {
    await symlink(external, indexPath, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
      context.skip('Symbolic links are not available to this Windows test process');
      return;
    }
    throw error;
  }

  const report = doctorFailure(target);
  assert.equal(report.issues.some((entry) => entry.code === 'invalid-experience-index'), true);

  const installedValidator = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'validate-project.mjs');
  const validator = spawnSync(process.execPath, [installedValidator, '--project', target], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(validator.status, 1, validator.stderr || validator.stdout);
  assert.match(validator.stderr, /experience index/i);
});

test('doctor rejects a linked built-in experience feedback artifact without exposing its target', async (context) => {
  const target = await initializedProject('linked-built-in-feedback-artifact');
  const artifact = 'skills/vibe-tether/proof.txt';
  const artifactPath = path.join(target, artifact);
  const secret = `github_pat_${'Q'.repeat(30)}`;
  const external = path.join(await project('linked-built-in-feedback-external'), `${secret}.txt`);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(external, 'outside project\n', 'utf8');
  try {
    await symlink(external, artifactPath, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
      context.skip('Symbolic links are not available to this Windows test process');
      return;
    }
    throw error;
  }
  await setExperienceFeedback(target, {
    trigger: 'first-proven-path',
    disposition: 'captured',
    reason: 'The verified path has a durable built-in proof artifact.',
    artifacts: [artifact],
  });

  const report = doctorFailure(target);

  assert.equal(report.issues.some((entry) => entry.code === 'unsafe-experience-artifact'), true);
  assert.doesNotMatch(JSON.stringify(report.issues), new RegExp(secret));
});

test('doctor and the installed validator reject a project-directory experience artifact', async () => {
  const target = await initializedProject('directory-artifact');
  await writeFile(
    path.join(target, '.vibetether', 'experience-index.yaml'),
    serializeExperienceIndex({
      schema_version: 1,
      entries: [{
        id: 'project-root',
        use_when: ['release'],
        artifacts: ['.'],
        verified_at: '2026-07-14',
        revalidate_when: [],
        status: 'proven',
      }],
    }),
    'utf8',
  );

  const report = doctorFailure(target);
  assert.equal(report.issues.some((entry) => entry.code === 'invalid-experience-index'), true);

  const installedValidator = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'validate-project.mjs');
  const validator = spawnSync(process.execPath, [installedValidator, '--project', target], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(validator.status, 1, validator.stderr || validator.stdout);
  assert.match(validator.stderr, /experience index artifact.*regular non-linked file/i);
});

test('doctor detects changed managed instructions and customized Skill copies', async () => {
  const target = await project('doctor-adapter-drift');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const agentsPath = path.join(target, 'AGENTS.md');
  const agents = await readFile(agentsPath, 'utf8');
  await writeFile(
    agentsPath,
    agents.replace(/<!-- vibetether:start -->[\s\S]*<!-- vibetether:end -->/, '<!-- vibetether:start -->\nChanged control rules.\n<!-- vibetether:end -->'),
    'utf8',
  );
  const installedSkill = path.join(target, '.agents', 'skills', 'vibe-tether', 'SKILL.md');
  await writeFile(installedSkill, `${await readFile(installedSkill, 'utf8')}\nCustomization.\n`, 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((issue) => issue.code === 'changed-managed-block'), true);
  assert.equal(report.issues.some((issue) => issue.code === 'changed-skill'), true);
});

test('uninstall dry-run leaves the project unchanged', async () => {
  const target = await project('uninstall-dry');
  assert.equal(runCli(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']).status, 0);
  const before = await readFile(path.join(target, 'AGENTS.md'), 'utf8');

  const result = runCli(['uninstall', '--project', target, '--dry-run']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /DRY RUN/);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), before);
  assert.equal(await exists(path.join(target, '.agents', 'skills', 'vibe-tether', 'SKILL.md')), true);
});

test('uninstall rejects reversed markers without changing user content', async () => {
  const target = await project('uninstall-reversed');
  const original = '# User content\r\n<!-- vibetether:end -->\r\nkeep me  \r\n<!-- vibetether:start -->\r\n';
  await writeFile(path.join(target, 'AGENTS.md'), original, 'utf8');

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /managed block conflict/i);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), original);
});

test('uninstall removes only VibeTether-managed content and preserves the Intent Contract', async () => {
  const target = await project('uninstall');
  const originalAgents = '# Team rules\n\nKeep me.\n';
  await writeFile(path.join(target, 'AGENTS.md'), originalAgents, 'utf8');
  assert.equal(runCli(['init', '--project', target, '--agent', 'both', '--profile', 'core', '--yes']).status, 0);

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  assert.equal(agents, originalAgents);
  assert.match(agents, /# Team rules/);
  assert.match(agents, /Keep me\./);
  assert.doesNotMatch(agents, /vibetether:start/);
  assert.equal(await exists(path.join(target, 'CLAUDE.md')), false);
  assert.equal(await exists(path.join(target, '.agents', 'skills', 'vibe-tether')), false);
  assert.equal(await exists(path.join(target, '.claude', 'skills', 'vibe-tether')), false);
  assert.equal(await exists(path.join(target, '.vibetether', 'project.yaml')), true);
  assert.equal(await exists(path.join(target, '.vibetether', 'intent.md')), true);
});

test('uninstall removes an unchanged empty VibeTether experience index', async () => {
  const target = await initializedProject('uninstall-empty-index');
  const before = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  assert.deepEqual(before.experience_index_ownership, {
    owner: 'vibetether',
    fingerprint: 'canonical-empty-v1',
  });

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(await exists(path.join(target, '.vibetether', 'experience-index.yaml')), false);
  const manifest = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(Object.hasOwn(manifest, 'experience_index'), false);
});

test('uninstall preserves a canonical empty experience index that predated initialization', async () => {
  const target = await project('uninstall-preexisting-empty-index');
  const indexPath = path.join(target, '.vibetether', 'experience-index.yaml');
  await mkdir(path.dirname(indexPath), { recursive: true });
  const original = serializeExperienceIndex({ schema_version: 1, entries: [] });
  await writeFile(indexPath, original, 'utf8');

  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const initializedManifest = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(Object.hasOwn(initializedManifest, 'experience_index_ownership'), false);

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(await readFile(indexPath, 'utf8'), original);
  const manifest = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(manifest.experience_index, '.vibetether/experience-index.yaml');
});

test('uninstall preserves a VibeTether-owned index after it becomes malformed', async () => {
  const target = await initializedProject('uninstall-malformed-owned-index');
  const indexPath = path.join(target, '.vibetether', 'experience-index.yaml');
  const malformed = 'schema_version: [unterminated\n';
  await writeFile(indexPath, malformed, 'utf8');

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(await readFile(indexPath, 'utf8'), malformed);
  const manifest = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(manifest.experience_index, '.vibetether/experience-index.yaml');
  assert.deepEqual(manifest.experience_index_ownership, {
    owner: 'vibetether',
    fingerprint: 'canonical-empty-v1',
  });
});

test('uninstall redacts malformed manifest and provider-lock parser diagnostics', async () => {
  const secret = `github_pat_${'U'.repeat(30)}`;
  const cases = [
    ['manifest', '.vibetether/project.yaml', `profile: [${secret}\n`, /project\.yaml.*invalid manifest yaml/i],
    ['provider lock', '.vibetether/providers.lock.yaml', `sources: [${secret}\n`, /provider lock is invalid/i],
  ];

  for (const [label, relativePath, malformed, expected] of cases) {
    const target = await initializedProject(`uninstall-redacted-${label.replaceAll(' ', '-')}`);
    const targetPath = path.join(target, ...relativePath.split('/'));
    await writeFile(targetPath, malformed, 'utf8');

    const result = runCli(['uninstall', '--project', target, '--yes']);

    assert.equal(result.status, 3, `${label}: ${result.stderr || result.stdout}`);
    assert.match(result.stderr, expected, label);
    assert.doesNotMatch(result.stderr, new RegExp(secret), label);
  }
});

test('uninstall redacts structural provider-lock diagnostics', async () => {
  const target = await initializedProject('uninstall-redacted-provider-lock-structure');
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  const secret = `github_pat_${'Z'.repeat(30)}`;
  lock.skills = [{
    id: 'safe',
    install_name: secret,
    fingerprint: 'bad',
    installations: {
      codex: { ownership: 'vibetether' },
    },
  }];
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /provider lock is missing an install path/i);
  assert.doesNotMatch(result.stderr, new RegExp(secret));
});

test('uninstall redacts provider-lock installation-path diagnostics', async () => {
  const target = await initializedProject('uninstall-redacted-provider-lock-path');
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  const secret = `github_pat_${'P'.repeat(30)}`;
  lock.skills = [{
    id: 'safe',
    install_name: 'safe',
    fingerprint: 'bad',
    installations: {
      codex: { ownership: 'vibetether', path: secret },
    },
  }];
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /provider install path does not match/i);
  assert.doesNotMatch(result.stderr, new RegExp(secret));
});

test('doctor redacts untrusted provider-lock Skill identifiers', async () => {
  const target = await initializedProject('doctor-redacted-provider-lock-record');
  const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
  const lock = YAML.parse(await readFile(lockPath, 'utf8'));
  const secret = `github_pat_${'D'.repeat(30)}`;
  lock.skills = [{
    id: secret,
    install_name: 'safe-name',
    fingerprint: 'not-a-fingerprint',
    installations: {},
  }];
  await writeFile(lockPath, YAML.stringify(lock), 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((entry) => entry.code === 'invalid-provider-lock'), true);
  assert.doesNotMatch(result.stdout, new RegExp(secret));
  assert.doesNotMatch(result.stderr, new RegExp(secret));
});

test('doctor redacts config-derived instruction-file paths in managed-block issues', async () => {
  const target = await initializedProject('doctor-redacted-instruction-file');
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  const secret = `github_pat_${'I'.repeat(30)}.md`;
  manifest.harnesses.codex.instruction_file = secret;
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
  await writeFile(path.join(target, secret), '# User instructions only\n', 'utf8');

  const result = runCli(['doctor', '--project', target, '--json']);

  assert.equal(result.status, 4, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.issues.some((entry) => entry.code === 'invalid-managed-block'), true);
  assert.doesNotMatch(JSON.stringify(report.issues), new RegExp(secret));
});

test('doctor and the installed validator reject a non-string checkpoint route without crashing', async () => {
  const target = await initializedProject('non-string-checkpoint-route');
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  const secret = `github_pat_${'K'.repeat(30)}`;
  manifest.checkpoint.path = { secret };
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');

  const doctor = runCli(['doctor', '--project', target, '--json']);

  assert.equal(doctor.status, 4, doctor.stderr || doctor.stdout);
  const report = JSON.parse(doctor.stdout);
  assert.equal(report.issues.some((entry) => entry.code === 'unsafe-checkpoint'), true);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secret));

  const installedValidator = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'validate-project.mjs');
  const validator = spawnSync(process.execPath, [installedValidator, '--project', target], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(validator.status, 1, validator.stderr || validator.stdout);
  assert.match(validator.stderr, /checkpoint.*regular non-linked file/i);
  assert.doesNotMatch(validator.stderr, new RegExp(secret));
  assert.doesNotMatch(validator.stderr, /TypeError|validateProject/);
});

test('doctor and uninstall reject null provider-lock records with controlled diagnostics', async () => {
  for (const [label, field] of [
    ['source', 'sources'],
    ['catalog', 'catalog'],
    ['Skill', 'skills'],
  ]) {
    const target = await initializedProject(`null-provider-lock-${label.toLowerCase()}`);
    const lockPath = path.join(target, '.vibetether', 'providers.lock.yaml');
    const lock = YAML.parse(await readFile(lockPath, 'utf8'));
    lock[field] = [null];
    await writeFile(lockPath, YAML.stringify(lock), 'utf8');

    const doctor = runCli(['doctor', '--project', target, '--json']);
    assert.equal(doctor.status, 4, `${label} doctor: ${doctor.stderr || doctor.stdout}`);
    const report = JSON.parse(doctor.stdout);
    assert.equal(report.issues.some((entry) => entry.code === 'invalid-provider-lock'), true, label);
    assert.doesNotMatch(`${doctor.stdout}\n${doctor.stderr}`, /TypeError|Cannot read properties/i, label);

    const uninstall = runCli(['uninstall', '--project', target, '--yes']);
    assert.equal(uninstall.status, 3, `${label} uninstall: ${uninstall.stderr || uninstall.stdout}`);
    assert.match(uninstall.stderr, /provider lock is invalid/i, label);
    assert.doesNotMatch(`${uninstall.stdout}\n${uninstall.stderr}`, /TypeError|Cannot read properties/i, label);
  }
});

test('doctor redacts untrusted harness and capability-board profile values', async () => {
  const secret = `github_pat_${'H'.repeat(30)}`;
  const harnessTarget = await initializedProject('doctor-redacted-unknown-harness');
  const manifestPath = path.join(harnessTarget, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  manifest.harnesses[secret] = { enabled: true, instruction_file: 'AGENTS.md' };
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');

  const harnessResult = runCli(['doctor', '--project', harnessTarget, '--json']);

  assert.equal(harnessResult.status, 4, harnessResult.stderr || harnessResult.stdout);
  assert.equal(JSON.parse(harnessResult.stdout).issues.some((entry) => entry.code === 'unknown-harness'), true);
  assert.doesNotMatch(harnessResult.stdout, new RegExp(secret));
  assert.doesNotMatch(harnessResult.stderr, new RegExp(secret));

  const profileTarget = await initializedProject('doctor-redacted-provider-profile');
  const boardPath = path.join(profileTarget, '.vibetether', 'capabilities.yaml');
  const board = YAML.parse(await readFile(boardPath, 'utf8'));
  board.profile = secret;
  await writeFile(boardPath, YAML.stringify(board), 'utf8');

  const profileResult = runCli(['doctor', '--project', profileTarget, '--json']);

  assert.equal(profileResult.status, 4, profileResult.stderr || profileResult.stdout);
  assert.equal(JSON.parse(profileResult.stdout).issues.some((entry) => entry.code === 'provider-profile-mismatch'), true);
  assert.doesNotMatch(profileResult.stdout, new RegExp(secret));
  assert.doesNotMatch(profileResult.stderr, new RegExp(secret));
});

test('installed validator accepts safe declared source directories and rejects linked or escaping directories', async (context) => {
  const target = await initializedProject('installed-validator-source-directories');
  await mkdir(path.join(target, 'docs', 'operations'), { recursive: true });
  await mkdir(path.join(target, 'docs', 'adr'), { recursive: true });
  await writeFile(path.join(target, 'docs', 'operations', 'release.md'), '# Release\n', 'utf8');
  await writeFile(path.join(target, 'docs', 'adr', '001.md'), '# ADR\n', 'utf8');
  const manifestPath = path.join(target, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  manifest.sources.conditional.operations = ['docs/operations/'];
  manifest.sources.conditional.architecture = ['docs/adr/'];
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
  const installedValidator = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'validate-project.mjs');

  const doctor = runCli(['doctor', '--project', target, '--json']);
  assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
  const valid = spawnSync(process.execPath, [installedValidator, '--project', target], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);

  const secret = `github_pat_${'S'.repeat(30)}`;
  manifest.sources.conditional.operations = [`../${secret}/`];
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
  const escaping = spawnSync(process.execPath, [installedValidator, '--project', target], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(escaping.status, 1, escaping.stderr || escaping.stdout);
  assert.match(escaping.stderr, /declared source escapes project root/i);
  assert.doesNotMatch(escaping.stderr, new RegExp(secret));

  manifest.sources.conditional.operations = ['docs/linked-operations/'];
  await writeFile(manifestPath, YAML.stringify(manifest), 'utf8');
  const external = path.join(await project('installed-validator-source-directory-external'), secret);
  await mkdir(external, { recursive: true });
  try {
    await symlink(external, path.join(target, 'docs', 'linked-operations'), 'junction');
  } catch (error) {
    if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
      context.skip('Symbolic links are not available to this Windows test process');
      return;
    }
    throw error;
  }
  const linked = spawnSync(process.execPath, [installedValidator, '--project', target], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(linked.status, 1, linked.stderr || linked.stdout);
  assert.match(linked.stderr, /declared source must be a regular non-linked file or directory/i);
  assert.doesNotMatch(linked.stderr, new RegExp(secret));
});

test('installed validator rejects malformed manifests and linked authority files without following targets', async (context) => {
  const malformedTarget = await initializedProject('installed-validator-malformed-manifest');
  const malformedManifest = path.join(malformedTarget, '.vibetether', 'project.yaml');
  const secret = `github_pat_${'R'.repeat(30)}`;
  await writeFile(malformedManifest, `${await readFile(malformedManifest, 'utf8')}profile: [${secret}\n`, 'utf8');
  const malformedValidator = path.join(malformedTarget, '.agents', 'skills', 'vibe-tether', 'scripts', 'validate-project.mjs');
  const malformed = spawnSync(process.execPath, [malformedValidator, '--project', malformedTarget], {
    cwd: malformedTarget,
    encoding: 'utf8',
  });
  assert.equal(malformed.status, 1, malformed.stderr || malformed.stdout);
  assert.match(malformed.stderr, /invalid manifest/i);
  assert.doesNotMatch(malformed.stderr, new RegExp(secret));

  const authorityCases = [
    ['manifest', '.vibetether/project.yaml'],
    ['capability board', '.vibetether/capabilities.yaml'],
    ['provider lock', '.vibetether/providers.lock.yaml'],
    ['checkpoint', '.vibetether/state/current.yaml'],
    ['instruction', 'AGENTS.md'],
  ];
  for (const [label, relativePath] of authorityCases) {
    const target = await initializedProject(`installed-validator-linked-${label.replaceAll(' ', '-')}`);
    const authorityPath = path.join(target, ...relativePath.split('/'));
    const original = await readFile(authorityPath, 'utf8');
    const external = path.join(await project(`installed-validator-external-${label.replaceAll(' ', '-')}`), `${secret}-${label.replaceAll(' ', '-')}.txt`);
    await writeFile(external, original, 'utf8');
    await rm(authorityPath);
    try {
      await symlink(external, authorityPath, 'file');
    } catch (error) {
      if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
        context.skip('Symbolic links are not available to this Windows test process');
        return;
      }
      throw error;
    }

    const installedValidator = path.join(target, '.agents', 'skills', 'vibe-tether', 'scripts', 'validate-project.mjs');
    const validator = spawnSync(process.execPath, [installedValidator, '--project', target], {
      cwd: target,
      encoding: 'utf8',
    });
    assert.equal(validator.status, 1, `${label}: ${validator.stderr || validator.stdout}`);
    assert.match(validator.stderr, new RegExp(`${label}.*regular non-linked file`, 'i'), label);
    assert.doesNotMatch(validator.stderr, new RegExp(secret), label);
  }
});

test('doctor rejects linked project authorities without following secret-bearing targets', async (context) => {
  const secret = `github_pat_${'Q'.repeat(30)}`;
  const authorityCases = [
    ['manifest', '.vibetether/project.yaml', 'unsafe-manifest'],
    ['capability board', '.vibetether/capabilities.yaml', 'unsafe-capability-board'],
    ['provider lock', '.vibetether/providers.lock.yaml', 'unsafe-provider-lock'],
    ['checkpoint', '.vibetether/state/current.yaml', 'unsafe-checkpoint'],
    ['instruction', 'AGENTS.md', 'unsafe-instructions'],
    ['installed Skill', '.agents/skills/vibe-tether', 'unsafe-skill', 'directory'],
  ];

  for (const [label, relativePath, expectedCode, kind] of authorityCases) {
    const target = await initializedProject(`doctor-linked-${label.replaceAll(' ', '-')}`);
    const authorityPath = path.join(target, ...relativePath.split('/'));
    const externalRoot = await project(`doctor-external-${label.replaceAll(' ', '-')}`);
    const external = path.join(externalRoot, `${secret}-${label.replaceAll(' ', '-')}`);
    if (kind === 'directory') {
      await cp(authorityPath, external, { recursive: true });
      await rm(authorityPath, { recursive: true });
    } else {
      await writeFile(external, await readFile(authorityPath, 'utf8'), 'utf8');
      await rm(authorityPath);
    }
    try {
      await symlink(external, authorityPath, kind === 'directory' ? 'junction' : 'file');
    } catch (error) {
      if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
        context.skip('Symbolic links are not available to this Windows test process');
        return;
      }
      throw error;
    }

    const result = runCli(['doctor', '--project', target, '--json']);
    assert.equal(result.status, 4, `${label}: ${result.stderr || result.stdout}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false, label);
    assert.equal(report.issues.some((entry) => entry.code === expectedCode), true, label);
    assert.doesNotMatch(JSON.stringify(report), new RegExp(secret), label);
  }
});

test('uninstall preserves a non-empty experience index and its manifest route', async () => {
  const target = await initializedProject('uninstall-user-index');
  const artifact = 'docs/operations/release.md';
  await writeOperationalExperience(target, 'release-path', artifact);

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(await exists(path.join(target, '.vibetether', 'experience-index.yaml')), true);
  assert.equal(await exists(path.join(target, artifact)), true);
  const manifest = YAML.parse(await readFile(path.join(target, '.vibetether', 'project.yaml'), 'utf8'));
  assert.equal(manifest.experience_index, '.vibetether/experience-index.yaml');
});

test('init preserves a no-final-newline gitignore rule while active and uninstall restores exact bytes', async () => {
  const target = await project('gitignore-roundtrip');
  const gitignorePath = path.join(target, '.gitignore');
  const original = 'dist/';
  await writeFile(gitignorePath, original, 'utf8');

  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const active = await readFile(gitignorePath, 'utf8');
  assert.match(active, /^dist\/\r?\n<!-- vibetether:start -->/);
  assert.equal(active.split(/\r?\n/)[0], 'dist/');

  assert.equal(runCli(['uninstall', '--project', target, '--yes']).status, 0);
  assert.equal(await readFile(gitignorePath, 'utf8'), original);
});

test('uninstall refuses a modified installed Skill without changing project files', async () => {
  const target = await project('uninstall-conflict');
  assert.equal(runCli(['init', '--project', target, '--agent', 'codex', '--profile', 'core', '--yes']).status, 0);
  const agentsBefore = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  const installedSkill = path.join(target, '.agents', 'skills', 'vibe-tether', 'SKILL.md');
  await writeFile(installedSkill, `${await readFile(installedSkill, 'utf8')}\nUser customization.\n`, 'utf8');

  const result = runCli(['uninstall', '--project', target, '--yes']);

  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /modified installed Skill/i);
  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), agentsBefore);
  assert.equal(await exists(installedSkill), true);
});
