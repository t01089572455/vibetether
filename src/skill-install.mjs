import { cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors.mjs';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sourceSkill = path.join(packageRoot, 'skills', 'vibe-tether');

const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

function loadReleaseCompatibility() {
  const target = path.join(packageRoot, 'registry', 'vibetether-releases.json');
  let value;
  try {
    value = JSON.parse(readFileSync(target, 'utf8'));
  } catch {
    throw new Error('The packaged VibeTether release compatibility registry is invalid.');
  }
  const validCurrent = value?.schema_version === 1
    && typeof value.current?.version === 'string'
    && HASH.test(value.current?.fingerprint ?? '');
  const validHistory = Array.isArray(value?.history)
    && value.history.every((entry) => (
      typeof entry?.id === 'string'
      && typeof entry?.version === 'string'
      && COMMIT.test(entry?.commit ?? '')
      && HASH.test(entry?.fingerprint ?? '')
    ));
  if (!validCurrent || !validHistory) {
    throw new Error('The packaged VibeTether release compatibility registry is invalid.');
  }
  const ids = new Set(value.history.map((entry) => entry.id));
  const fingerprints = new Set(value.history.map((entry) => entry.fingerprint));
  if (ids.size !== value.history.length || fingerprints.size !== value.history.length) {
    throw new Error('The packaged VibeTether release compatibility registry contains duplicates.');
  }
  return Object.freeze({
    schema_version: value.schema_version,
    current: Object.freeze({ ...value.current }),
    history: Object.freeze(value.history.map((entry) => Object.freeze({ ...entry }))),
  });
}

export const VIBETETHER_RELEASE_COMPATIBILITY = loadReleaseCompatibility();
const LEGACY_VIBETETHER_IDENTITY_AUTHORITY = new Set(
  VIBETETHER_RELEASE_COMPATIBILITY.history.map((entry) => entry.fingerprint),
);
export const LEGACY_VIBETETHER_FINGERPRINTS = Object.freeze({
  has(fingerprint) {
    return LEGACY_VIBETETHER_IDENTITY_AUTHORITY.has(fingerprint);
  },
  get size() {
    return LEGACY_VIBETETHER_IDENTITY_AUTHORITY.size;
  },
  values() {
    return LEGACY_VIBETETHER_IDENTITY_AUTHORITY.values();
  },
  [Symbol.iterator]() {
    return LEGACY_VIBETETHER_IDENTITY_AUTHORITY[Symbol.iterator]();
  },
});

function portableFileBytes(bytes) {
  if (bytes.includes(0)) return bytes;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return bytes;
  return Buffer.from(text.replaceAll('\r\n', '\n'), 'utf8');
}

async function fingerprintEntry(root, relativePath, hash, { portable = false } = {}) {
  const target = path.join(root, relativePath);
  const entry = await lstat(target);
  if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported in installed Skills: ${relativePath}`);
  if (entry.isDirectory()) {
    hash.update(`directory:${relativePath.replaceAll('\\', '/')}\n`);
    const children = (await readdir(target)).sort();
    for (const child of children) {
      await fingerprintEntry(root, path.join(relativePath, child), hash, { portable });
    }
    return;
  }
  hash.update(`file:${relativePath.replaceAll('\\', '/')}\n`);
  const bytes = await readFile(target);
  hash.update(portable ? portableFileBytes(bytes) : bytes);
}

async function directoryFingerprint(root, options) {
  const hash = createHash('sha256');
  await fingerprintEntry(root, '', hash, options);
  return hash.digest('hex');
}

export function skillFingerprint(root) {
  return directoryFingerprint(root, { portable: false });
}

export function portableSkillFingerprint(root) {
  return directoryFingerprint(root, { portable: true });
}

export async function inspectVibeTetherIdentity(target) {
  const [canonical, installed] = await Promise.all([
    portableSkillFingerprint(sourceSkill),
    portableSkillFingerprint(target),
  ]);
  if (canonical !== VIBETETHER_RELEASE_COMPATIBILITY.current.fingerprint) {
    throw new CliError('The packaged VibeTether Skill does not match its release compatibility registry.', 3);
  }
  const state = installed === canonical
    ? 'current'
    : LEGACY_VIBETETHER_IDENTITY_AUTHORITY.has(installed) ? 'legacy' : 'unknown';
  return { state, canonical, installed };
}

export async function inspectDirectoryInstall(source, target, relativePath, options = {}) {
  try {
    const [canonical, installed] = await Promise.all([skillFingerprint(source), skillFingerprint(target)]);
    if (canonical !== installed) {
      if (options.upgradeFingerprints?.has(installed)) {
        return { needsInstall: true, ownership: 'vibetether', replacesExisting: true };
      }
      throw new CliError(`Refusing to overwrite different or modified installed Skill at ${relativePath}. Back up or remove it first.`, 3);
    }
    return { needsInstall: false, ownership: 'preexisting' };
  } catch (error) {
    if (error.code === 'ENOENT') return { needsInstall: true, ownership: 'vibetether' };
    if (error instanceof CliError) throw error;
    throw new CliError(`Cannot verify installed Skill at ${relativePath}: ${error.message}`, 3);
  }
}

export async function inspectVibeTetherInstall(target, relativePath) {
  try {
    const identity = await inspectVibeTetherIdentity(target);
    if (identity.state === 'current') return { needsInstall: false, ownership: 'preexisting' };
    if (identity.state === 'legacy') {
      return { needsInstall: true, ownership: 'vibetether', replacesExisting: true };
    }
    throw new CliError(`Refusing to overwrite different or modified installed Skill at ${relativePath}. Back up or remove it first.`, 3);
  } catch (error) {
    if (error.code === 'ENOENT') return { needsInstall: true, ownership: 'vibetether' };
    if (error instanceof CliError) throw error;
    throw new CliError(`Cannot verify installed Skill at ${relativePath}: ${error.message}`, 3);
  }
}

export async function assertSkillInstallable(target, relativePath) {
  const plan = await inspectVibeTetherInstall(target, relativePath);
  return plan.needsInstall;
}

export async function installDirectory(source, target) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.vibe-tether.${randomUUID()}.tmp`);
  const previous = `${target}.${randomUUID()}.previous`;
  let movedPrevious = false;
  try {
    await cp(source, temporary, { recursive: true, errorOnExist: true, force: false });
    try {
      await rename(target, previous);
      movedPrevious = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rename(temporary, target);
    if (movedPrevious) {
      await rm(previous, { recursive: true, force: true });
      movedPrevious = false;
    }
  } catch (error) {
    if (movedPrevious) {
      await rm(target, { recursive: true, force: true }).catch(() => {});
      try {
        await rename(previous, target);
        movedPrevious = false;
      } catch (restoreError) {
        throw new CliError(
          `Skill installation failed and the previous copy is preserved at ${previous}: ${restoreError.message}`,
          3,
        );
      }
    }
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true }).catch(() => {});
  }
}

export async function installSkill(target) {
  return installDirectory(sourceSkill, target);
}
