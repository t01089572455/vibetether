import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const sourceRoot = path.resolve(import.meta.dirname, '..');

function npmInvocation(args) {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
  }
  const bundled = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(bundled)) return { command: process.execPath, args: [bundled, ...args] };
  return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function npm(args, options) {
  const invocation = npmInvocation(args);
  return run(invocation.command, invocation.args, options);
}

export async function installedPackageFixture(name) {
  const base = await mkdtemp(path.join(os.tmpdir(), `vibetether-stage0-${name}-`));
  const packDir = path.join(base, 'pack');
  const prefix = path.join(base, 'prefix');
  const project = path.join(base, 'project');
  const home = path.join(base, 'home');
  const cache = path.join(base, 'npm-cache');
  await Promise.all([packDir, prefix, project, home, cache].map((target) => mkdir(target, { recursive: true })));
  const env = {
    ...process.env,
    npm_config_cache: cache,
    VIBETETHER_STATE_HOME: path.join(base, 'state'),
    VIBETETHER_CACHE_HOME: path.join(base, 'cache'),
    VIBETETHER_CONFIG_HOME: path.join(base, 'config'),
    VIBETETHER_USER_HOME: home,
  };
  const packed = npm(['pack', '--json', '--ignore-scripts', '--pack-destination', packDir], {
    cwd: sourceRoot,
    env,
  });
  const metadata = JSON.parse(packed.stdout);
  const tgz = path.join(packDir, metadata[0].filename);
  npm(['install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--prefix', prefix, tgz], {
    cwd: base,
    env,
  });
  return {
    base,
    project,
    env,
    tgz,
    cli: path.join(prefix, 'node_modules', 'vibetether', 'bin', 'vibetether.mjs'),
    cleanup: () => rm(base, { recursive: true, force: true }),
  };
}

export function runCli(fixture, args, { allowFailure = false } = {}) {
  const result = spawnSync(process.execPath, [fixture.cli, ...args], {
    cwd: fixture.project,
    env: fixture.env,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`installed CLI failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

export function runGit(cwd, args) {
  return run('git', args, { cwd });
}

export async function baseline() {
  return JSON.parse(await readFile(path.join(sourceRoot, 'registry', 'stage0-baseline.json'), 'utf8'));
}
