#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = (await readdir(path.join(root, 'test')))
  .filter((name) => name.endsWith('.test.mjs') && name !== 'all.test.mjs')
  .sort()
  .map((name) => path.join('test', name));
// Serial is the deterministic cross-platform default; maintainers may opt into parallelism explicitly.
const concurrency = Math.max(1, Math.min(Number(process.env.VIBETETHER_TEST_CONCURRENCY ?? 1), files.length));
let next = 0;
const results = [];

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', file], {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ file, code: 1, stdout, stderr: `${stderr}${error.stack ?? error.message}\n` }));
    child.on('close', (code) => resolve({ file, code: code ?? 1, stdout, stderr }));
  });
}

async function worker() {
  while (true) {
    const index = next++;
    if (index >= files.length) return;
    const result = await run(files[index]);
    results[index] = result;
    process.stdout.write(`${result.code === 0 ? 'PASS' : 'FAIL'} ${result.file}\n`);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
let passed = 0;
let failed = 0;
for (const result of results) {
  const pass = Number(result.stdout.match(/# pass (\d+)/)?.[1] ?? 0);
  const fail = Number(result.stdout.match(/# fail (\d+)/)?.[1] ?? (result.code === 0 ? 0 : 1));
  passed += pass;
  failed += fail;
  if (result.code !== 0) {
    process.stderr.write(`\n--- ${result.file} ---\n${result.stdout}${result.stderr}`);
  }
}
process.stdout.write(`Test summary: ${passed} passed, ${failed} failed across ${files.length} files.\n`);
if (results.some((result) => result.code !== 0) || failed > 0) process.exitCode = 1;
