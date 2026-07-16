import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { main } from '../src/cli.mjs';
import {
  currentLocalCliBaseline,
  LOCAL_CLI_PATH,
  releasePackage,
  renderLocalCliLauncher,
  sha256Text,
} from '../src/local-cli.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function initializedProject(name) {
  const root = await mkdtemp(path.join(os.tmpdir(), `vibetether-local-cli-${name}-`));
  await main([
    'init', '--project', root, '--agent', 'codex', '--profile', 'core', '--yes',
    '--goal', 'Keep the project-local CLI available.',
    '--success-evidence', 'Launcher integrity and version are observable.',
  ]);
  return root;
}

async function doctorReport(root, boundary = 'ordinary') {
  try {
    return JSON.parse(await main([
      'doctor', '--project', root, '--boundary', boundary, '--json',
    ]));
  } catch (error) {
    if (typeof error.output === 'string') return JSON.parse(error.output);
    throw error;
  }
}

test('the canonical launcher avoids a Windows command shell and executes npm npx-cli with Node', () => {
  const { content, manifest } = currentLocalCliBaseline();

  assert.equal(manifest.launcher, LOCAL_CLI_PATH);
  assert.match(content, /npx-cli\.js/);
  assert.match(content, /process\.execPath/);
  assert.match(content, /shell:\s*false/);
  assert.doesNotMatch(content, /shell:\s*true/);
  assert.doesNotMatch(content, /npx\.cmd/);
});

test('the generated project-local launcher executes the selected package on this host', async () => {
  const root = await initializedProject('execution');
  const launcherPath = path.join(root, ...LOCAL_CLI_PATH.split('/'));
  const result = spawnSync(process.execPath, [launcherPath, '--version'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      VIBETETHER_CLI_PACKAGE: packageRoot,
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), currentLocalCliBaseline().manifest.expected_version);
});

test('doctor reports launcher integrity and running-version drift with boundary severity', async () => {
  const root = await initializedProject('doctor');
  const launcherPath = path.join(root, ...LOCAL_CLI_PATH.split('/'));
  const launcher = await readFile(launcherPath, 'utf8');
  await writeFile(launcherPath, `${launcher}\n// user change\n`, 'utf8');

  let report = await doctorReport(root);
  assert.equal(report.ok, false);
  assert.equal(
    report.issues.some(({ code }) => code === 'changed-local-cli-launcher'),
    true,
  );
  const validatorPath = path.join(
    root,
    '.agents',
    'skills',
    'vibe-tether',
    'scripts',
    'validate-project.mjs',
  );
  const validator = spawnSync(process.execPath, [validatorPath, '--project', root], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(validator.status, 1, validator.stderr || validator.stdout);
  assert.match(validator.stderr, /local cli launcher.*fingerprint/i);

  await writeFile(launcherPath, launcher, 'utf8');
  const manifestPath = path.join(root, '.vibetether', 'project.yaml');
  const manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  const priorVersion = '0.4.0';
  const priorPackage = releasePackage(priorVersion);
  const priorLauncher = renderLocalCliLauncher(priorPackage);
  await writeFile(launcherPath, priorLauncher, 'utf8');
  manifest.cli.expected_version = priorVersion;
  manifest.cli.package = priorPackage;
  manifest.cli.launcher_sha256 = sha256Text(priorLauncher);
  await writeFile(manifestPath, YAML.stringify(manifest, { lineWidth: 0 }), 'utf8');

  report = await doctorReport(root);
  assert.equal(report.ok, true);
  assert.equal(report.warnings.some(({ code }) => code === 'cli-version-mismatch'), true);
  const completion = await doctorReport(root, 'completion');
  assert.equal(completion.ok, false);
  assert.equal(completion.issues.some(({ code }) => code === 'cli-version-mismatch'), true);
});
