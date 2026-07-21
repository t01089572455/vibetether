import { VERSION } from './constants.mjs';

export function officialPackage(version) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid VibeTether version.');
  return `https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v${version}`;
}

function runtimePrelude() {
  return `
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
  if (typeof relative !== 'string' || !relative || relative.includes('\\\\') || path.posix.isAbsolute(relative) || relative.split('/').some((part) => !part || part === '.' || part === '..')) return null;
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
  if (result.error) { process.stderr.write('VibeTether could not start the verified local runtime cache.\\n'); process.exit(127); }
  process.exit(typeof result.status === 'number' ? result.status : 1);
}
function runPortablePackage(version, args) {
  if (process.env.VIBETETHER_OFFLINE === '1') {
    process.stderr.write('VibeTether has no verified local runtime cache for this version and offline mode forbids network acquisition. Run the matching installer or upgrade command first.\\n');
    process.exit(127);
  }
  const packageSpec = process.env.VIBETETHER_CLI_PACKAGE || \`https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v\${version}\`;
  const commandArgs = ['--yes', \`--package=\${packageSpec}\`, 'vibetether', ...args];
  let executable = 'npx';
  let spawnArgs = commandArgs;
  if (process.platform === 'win32') {
    const candidates = [
      process.env.npm_execpath ? path.join(path.dirname(process.env.npm_execpath), 'npx-cli.js') : null,
      path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
      path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    ].filter(Boolean);
    const npxCli = candidates.find((candidate) => existsSync(candidate));
    if (!npxCli) { process.stderr.write('VibeTether requires Node.js with npm/npx available.\\n'); process.exit(127); }
    executable = process.execPath;
    spawnArgs = [npxCli, ...commandArgs];
  }
  const result = spawnSync(executable, spawnArgs, { stdio: 'inherit', shell: false, windowsHide: true });
  if (result.error) { process.stderr.write('VibeTether could not start the pinned package.\\n'); process.exit(127); }
  process.exit(typeof result.status === 'number' ? result.status : 1);
}
`;
}

export function renderProjectLauncher(version = VERSION) {
  return `#!/usr/bin/env node
${runtimePrelude()}
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(import.meta.url);
const manifestPath = path.join(path.dirname(launcher), 'project.json');
let version = ${JSON.stringify(version)};
try {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!/^\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.vibetether_version)) throw new Error('invalid version');
  version = manifest.vibetether_version;
} catch {
  process.stderr.write('VibeTether project launcher cannot read a valid pinned project version.\\n');
  process.exit(3);
}
const cached = cachedRuntime(version);
if (cached) runCached(cached, process.argv.slice(2));
runPortablePackage(version, process.argv.slice(2));
`;
}

export function renderGlobalDispatcher(defaultVersion = VERSION) {
  return `#!/usr/bin/env node
${runtimePrelude()}
import { realpathSync } from 'node:fs';

function stateHome() {
  if (process.env.VIBETETHER_STATE_HOME) return path.resolve(process.env.VIBETETHER_STATE_HOME);
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'VibeTether', 'state');
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'vibetether');
}
function findTrackedManifest(start) {
  let current = path.resolve(start);
  while (true) {
    const candidate = path.join(current, '.vibetether', 'project.json');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
function gitCommonIds(start) {
  let result = spawnSync('git', ['-C', start, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', shell: false, windowsHide: true });
  if (result.status !== 0) result = spawnSync('git', ['-C', start, 'rev-parse', '--git-common-dir'], { encoding: 'utf8', shell: false, windowsHide: true });
  if (result.status !== 0) return [];
  try {
    const raw = result.stdout.trim();
    const common = realpathSync(path.isAbsolute(raw) ? raw : path.resolve(start, raw));
    const legacy = createHash('sha256').update(common).digest('hex').slice(0, 24);
    try {
      const record = JSON.parse(readFileSync(path.join(common, 'vibetether', 'repository-id.json'), 'utf8'));
      if (record?.schema_version === 1 && record.kind === 'repository'
          && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.id)) {
        return [record.id, legacy];
      }
    } catch {}
    return [legacy];
  } catch { return []; }
}
function discoverManifest(start) {
  const tracked = findTrackedManifest(start);
  if (tracked) return tracked;
  const home = stateHome();
  for (const commonId of gitCommonIds(start)) {
    const local = path.join(home, 'local-contracts', commonId, 'project', '.vibetether', 'project.json');
    if (existsSync(local)) return local;
    const registryPath = path.join(home, 'repositories', commonId + '.json');
    if (!existsSync(registryPath)) continue;
    try {
      const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
      for (const root of registry.contract_roots || []) {
        const candidate = path.join(root, '.vibetether', 'project.json');
        if (existsSync(candidate)) return candidate;
      }
    } catch {}
  }
  return null;
}
let version = ${JSON.stringify(defaultVersion)};
const manifestPath = discoverManifest(process.cwd());
if (manifestPath) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!/^\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.vibetether_version)) throw new Error('invalid');
    version = manifest.vibetether_version;
  } catch { process.stderr.write('VibeTether dispatcher found an invalid project manifest version.\\n'); process.exit(3); }
}
const cached = cachedRuntime(version);
if (cached) runCached(cached, process.argv.slice(2));
runPortablePackage(version, process.argv.slice(2));
`;
}
