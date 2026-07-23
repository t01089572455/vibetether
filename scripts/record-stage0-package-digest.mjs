#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const officialRepository = 't01089572455/vibetether';

function git(args) {
  const result = spawnSync('git', ['-C', packageRoot, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed.`);
  return result.stdout.trim();
}

function remoteRepository() {
  const configured = process.env.GITHUB_REPOSITORY?.trim();
  if (configured) return configured;
  const remote = git(['config', '--get', 'remote.origin.url']);
  const match = remote.match(/github\.com(?::|\/)([^/]+\/[^/]+?)(?:\.git)?$/i);
  return match?.[1] ?? null;
}

function npmCli() {
  return [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean).find((candidate) => existsSync(candidate)) ?? null;
}

const cli = npmCli();
if (!cli) throw new Error('npm-cli.js is unavailable.');
const repository = remoteRepository();
const commit = git(['rev-parse', 'HEAD']);
const tree = git(['rev-parse', 'HEAD^{tree}']);
const committedAt = new Date(git(['show', '-s', '--format=%cI', 'HEAD'])).toISOString();
if (repository !== officialRepository) throw new Error(`Unexpected repository identity: ${repository ?? 'missing'}.`);
if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{40}$/.test(tree)) throw new Error('Exact Git commit/tree identity is unavailable.');
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== commit) throw new Error(`GitHub head ${process.env.GITHUB_SHA} differs from checked-out commit ${commit}.`);
if (git(['status', '--porcelain=v1']) !== '') throw new Error('Stage 0 package identity requires a clean candidate worktree.');
const directory = await mkdtemp(path.join(os.tmpdir(), 'vibetether-stage0-package-digest-'));
try {
  const packed = spawnSync(process.execPath, [cli, 'pack', '--json', '--ignore-scripts', '--pack-destination', directory], {
    cwd: packageRoot,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout || 'npm pack failed.');
  const metadata = JSON.parse(packed.stdout);
  if (!Array.isArray(metadata) || metadata.length !== 1 || typeof metadata[0]?.filename !== 'string') throw new Error('npm pack did not return one exact artifact.');
  const bytes = await readFile(path.join(directory, metadata[0].filename));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const expected = process.env.VIBETETHER_EXPECTED_STAGE0_PACKAGE_SHA256;
  if (expected && expected !== digest) throw new Error(`Exact package digest ${digest} differs from expected ${expected}.`);
  if (git(['status', '--porcelain=v1']) !== '') throw new Error('Stage 0 package recording changed or observed a dirty candidate worktree.');
  const identity = {
    schema_version: 1,
    repository,
    commit,
    tree,
    committed_at: committedAt,
    clean: true,
    package_sha256: digest,
  };
  process.stdout.write(`VIBETETHER_STAGE0_IDENTITY=${JSON.stringify(identity)}\n`);
  process.stdout.write(`VIBETETHER_STAGE0_PACKAGE_SHA256=${digest}\n`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
