#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function cacheHome() {
  if (process.env.VIBETETHER_CACHE_HOME) return path.resolve(process.env.VIBETETHER_CACHE_HOME);
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'VibeTether', 'cache');
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'vibetether');
}
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function safeRuntimePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.posix.isAbsolute(relative) || relative.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  const target = path.resolve(root, ...relative.split('/'));
  const inside = path.relative(root, target);
  return inside && !inside.startsWith('..') && !path.isAbsolute(inside) ? target : null;
}
function cachedRuntime(version) {
  try {
    const runtimeRoot = path.join(cacheHome(), 'runtime');
    const index = JSON.parse(readFileSync(path.join(runtimeRoot, 'index.json'), 'utf8'));
    const record = index?.schema_version === 1 ? index.versions?.[version] : null;
    if (!record || !/^[a-f0-9]{64}$/.test(record.object_hash || '') || !/^[a-f0-9]{64}$/.test(record.entry_sha256 || '') || !/^[a-f0-9]{64}$/.test(record.manifest_sha256 || '')) return null;
    const root = path.join(runtimeRoot, 'objects', record.object_hash);
    const manifestPath = path.join(root, '.vibetether-runtime-manifest.json');
    if (!existsSync(manifestPath)) return null;
    const manifestSource = readFileSync(manifestPath);
    if (digest(manifestSource) !== record.manifest_sha256) return null;
    const manifest = JSON.parse(manifestSource.toString('utf8'));
    if (manifest?.schema_version !== 1 || !Array.isArray(manifest.files)) return null;
    for (const file of manifest.files) {
      const target = safeRuntimePath(root, file.path);
      if (!target || !existsSync(target)) return null;
      const metadata = lstatSync(target);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size !== file.size || digest(readFileSync(target)) !== file.sha256) return null;
    }
    const entry = path.join(root, 'bin', 'vibetether.mjs');
    if (!existsSync(entry) || digest(readFileSync(entry)) !== record.entry_sha256) return null;
    return entry;
  } catch { return null; }
}
function runCached(entry, args) {
  const result = spawnSync(process.execPath, [entry, ...args], { stdio: 'inherit', shell: false, windowsHide: true });
  if (result.error) { process.stderr.write('VibeTether could not start the verified local runtime cache.\n'); process.exit(127); }
  process.exit(typeof result.status === 'number' ? result.status : 1);
}
function missingVerifiedRuntime(version) {
  process.stderr.write(`VibeTether has no verified local runtime cache for version ${version}. Run an installer or upgrade command from an immutable commit and verified digest first.\n`);
  process.exit(127);
}

import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(import.meta.url);
const manifestPath = path.join(path.dirname(launcher), 'project.json');
let version = "1.0.0-rc.4";
try {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.vibetether_version)) throw new Error('invalid version');
  version = manifest.vibetether_version;
} catch {
  process.stderr.write('VibeTether project launcher cannot read a valid pinned project version.\n');
  process.exit(3);
}
const cached = cachedRuntime(version);
if (cached) runCached(cached, process.argv.slice(2));
missingVerifiedRuntime(version);
