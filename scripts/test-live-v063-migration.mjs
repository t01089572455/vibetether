#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { migrate, rollbackMigration } from '../src/migrate.mjs';
import { discoverContract } from '../src/contract.mjs';
import { parseIntent } from '../src/intent.mjs';
import { parseTruthMap } from '../src/truth.mjs';

const PACKAGE = 'https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.3';

function runNpx(args, cwd) {
  const commandArgs = ['--yes', `--package=${PACKAGE}`, 'vibetether', ...args];
  let executable = 'npx';
  let command = commandArgs;
  if (process.platform === 'win32') {
    const npmExec = process.env.npm_execpath;
    if (!npmExec) throw new Error('npm_execpath is required for the Windows live-compatibility test.');
    const npxCli = path.join(path.dirname(npmExec), 'npx-cli.js');
    executable = process.execPath;
    command = [npxCli, ...commandArgs];
  }
  const result = spawnSync(executable, command, {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`v0.6.3 CLI failed (${result.status}):\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }
}

async function inventory(root, relative = '', output = new Map()) {
  const directory = path.join(root, relative);
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (!relative && entry.name === '.git') continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) await inventory(root, next, output);
    else if (entry.isFile()) {
      const bytes = await readFile(path.join(root, next));
      output.set(next.replaceAll('\\','/'), createHash('sha256').update(bytes).digest('hex'));
    } else throw new Error(`Unexpected fixture object: ${next}`);
  }
  return output;
}

const base = await mkdtemp(path.join(os.tmpdir(), 'vibetether-live-v063-'));
const root = path.join(base, 'project');
await mkdir(root, { recursive: true });
process.env.VIBETETHER_STATE_HOME = path.join(base, 'state');
process.env.VIBETETHER_CACHE_HOME = path.join(base, 'cache');
process.env.VIBETETHER_CONFIG_HOME = path.join(base, 'config');
process.env.VIBETETHER_RUNTIME_HOME = path.join(base, 'runtime');

runNpx([
  'init', '--project', root, '--agent', 'both', '--profile', 'core', '--no-auto-bundles', '--yes',
  '--goal', 'Validate migration from the exact v0.6.3 release.',
  '--success-evidence', 'The RC migrates, reads, and rolls back the exact v0.6.3 project bytes.',
], root);

const before = await inventory(root);
const result = await migrate({ project: root, agent: 'both', yes: true });
const context = await discoverContract(root);
const intent = parseIntent(context.intentSource);
const truth = parseTruthMap(context.truthSource);
if (intent.status !== 'confirmed') throw new Error('Migrated v0.6.3 Intent is not confirmed.');
if (!Array.isArray(truth.confirmed) || !Array.isArray(truth.candidates)) throw new Error('Migrated Truth Map is unreadable.');
await rollbackMigration({ id: result.migration_id, yes: true });
const after = await inventory(root);
if (JSON.stringify([...before]) !== JSON.stringify([...after])) {
  throw new Error('v0.6.3 live migration rollback did not restore the project byte inventory.');
}
console.log(JSON.stringify({ ok: true, source: PACKAGE, files: before.size, platform: process.platform, node: process.version }, null, 2));
