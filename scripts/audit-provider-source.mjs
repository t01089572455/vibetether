#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enumerateSkillDirectories } from '../src/provider-fetch.mjs';
import { skillFingerprint } from '../src/skill-install.mjs';

function gitCommit(checkout) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'git rev-parse failed').trim());
  return result.stdout.trim().toLowerCase();
}

export async function auditProviderCheckout(checkout, skillRoot) {
  const root = path.resolve(checkout);
  const skillPaths = await enumerateSkillDirectories(root, skillRoot);
  const skills = [];
  for (const skillPath of skillPaths) {
    skills.push({
      path: skillPath,
      fingerprint: await skillFingerprint(path.join(root, ...skillPath.split('/'))),
    });
  }
  return { commit: gitCommit(root), skill_root: skillRoot, skills };
}

function valueAfter(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

async function main(args) {
  let checkout;
  let skillRoot;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--checkout') checkout = valueAfter(args, index++, flag);
    else if (flag === '--skill-root') skillRoot = valueAfter(args, index++, flag);
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!checkout || !skillRoot) throw new Error('Usage: audit-provider-source --checkout PATH --skill-root PATH');
  process.stdout.write(`${JSON.stringify(await auditProviderCheckout(checkout, skillRoot), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
