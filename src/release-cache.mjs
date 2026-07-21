import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cp, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { VERSION } from './constants.mjs';
import { conflictError } from './errors.mjs';
import {
  atomicJson, canonicalJson, copyVerifiedDirectory, exists, hashTree, readJsonFile, sha256File, sha256Text, withFileLock,
} from './files.mjs';
import { cacheHome } from './paths.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_ENTRIES = ['bin', 'src', 'registry', 'skills', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];


async function runtimeFileManifest(root) {
  const files = [];
  async function walk(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (relative === '.vibetether-runtime-manifest.json') continue;
      const target = path.join(directory, entry.name);
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
        throw conflictError(`Packaged runtime contains an unsafe object: ${relative}`, 'RUNTIME_CACHE_INVALID');
      }
      if (metadata.isDirectory()) await walk(target, relative);
      else files.push({ path: relative, size: metadata.size, sha256: await sha256File(target) });
    }
  }
  await walk(root);
  return { schema_version: 1, files };
}

export function runtimeIndexPath() {
  return path.join(cacheHome(), 'runtime', 'index.json');
}

export async function cacheRuntimePackage({ version = VERSION } = {}) {
  const runtimeRoot = path.join(cacheHome(), 'runtime');
  const lock = path.join(runtimeRoot, 'index.lock');
  return withFileLock(lock, async () => {
    const prior = await readJsonFile(runtimeIndexPath(), 'Runtime cache index', { allowMissing: true });
    const existing = prior?.versions?.[version];
    if (existing?.object_hash && /^[a-f0-9]{64}$/.test(existing.object_hash) && /^[a-f0-9]{64}$/.test(existing.entry_sha256 ?? '') && /^[a-f0-9]{64}$/.test(existing.manifest_sha256 ?? '')) {
      const objectRoot = path.join(runtimeRoot, 'objects', existing.object_hash);
      const entry = path.join(objectRoot, 'bin', 'vibetether.mjs');
      const manifestPath = path.join(objectRoot, '.vibetether-runtime-manifest.json');
      if (await exists(entry) && await exists(manifestPath) && await hashTree(objectRoot) === existing.object_hash && await sha256File(entry) === existing.entry_sha256 && sha256Text(await import('node:fs/promises').then(({ readFile }) => readFile(manifestPath, 'utf8'))) === existing.manifest_sha256) {
        return { ...existing, object_root: objectRoot, entry };
      }
    }

    const staging = path.join(runtimeRoot, 'staging', randomUUID());
    await mkdir(staging, { recursive: true });
    try {
      for (const relative of RUNTIME_ENTRIES) {
        const source = path.join(packageRoot, relative);
        if (!await exists(source)) throw conflictError(`Packaged runtime entry is missing: ${relative}`, 'RUNTIME_CACHE_INVALID');
        const destination = path.join(staging, relative);
        await mkdir(path.dirname(destination), { recursive: true });
        await cp(source, destination, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
      }
      const fileManifest = await runtimeFileManifest(staging);
      const manifestSource = canonicalJson(fileManifest);
      await import('node:fs/promises').then(({ writeFile }) => writeFile(path.join(staging, '.vibetether-runtime-manifest.json'), manifestSource, { encoding: 'utf8', mode: 0o600 }));
      const manifestSha256 = sha256Text(manifestSource);
      const objectHash = await hashTree(staging);
      const objectRoot = path.join(runtimeRoot, 'objects', objectHash);
      await copyVerifiedDirectory(staging, objectRoot, objectHash);
      const entry = path.join(objectRoot, 'bin', 'vibetether.mjs');
      const entrySha256 = await sha256File(entry);
      const index = prior?.schema_version === 1 && prior.versions && typeof prior.versions === 'object'
        ? structuredClone(prior)
        : { schema_version: 1, versions: {} };
      index.versions[version] = {
        version,
        object_hash: objectHash,
        entry_sha256: entrySha256,
        manifest_sha256: manifestSha256,
        cached_at: new Date().toISOString(),
      };
      await atomicJson(runtimeIndexPath(), index);
      return { ...index.versions[version], object_root: objectRoot, entry };
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  });
}

export async function inspectCachedRuntime(version = VERSION) {
  const index = await readJsonFile(runtimeIndexPath(), 'Runtime cache index', { allowMissing: true });
  const record = index?.versions?.[version];
  if (!record || !/^[a-f0-9]{64}$/.test(record.object_hash ?? '') || !/^[a-f0-9]{64}$/.test(record.entry_sha256 ?? '') || !/^[a-f0-9]{64}$/.test(record.manifest_sha256 ?? '')) return null;
  const objectRoot = path.join(cacheHome(), 'runtime', 'objects', record.object_hash);
  const entry = path.join(objectRoot, 'bin', 'vibetether.mjs');
  if (!await exists(entry)) return null;
  if (await hashTree(objectRoot) !== record.object_hash || await sha256File(entry) !== record.entry_sha256) return null;
  return { ...record, object_root: objectRoot, entry };
}
