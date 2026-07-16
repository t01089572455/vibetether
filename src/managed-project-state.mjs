import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import {
  ADAPTERS,
  GITIGNORE_BODY,
  LEGACY_MANAGED_BODIES,
} from './adapters.mjs';
import {
  inspectManagedBlock,
  managedBlockBody,
  rejectSymlinkPath,
  removeManagedBlock,
} from './files.mjs';
import { parseManifest } from './manifest.mjs';
import {
  inspectVibeTetherIdentity,
  skillFingerprint,
} from './skill-install.mjs';
import { LOCAL_CLI_PATH } from './local-cli.mjs';

const LEGACY_GITIGNORE_BODY = '.vibetether/state/';
const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/;
const OWNERSHIP = new Set(['vibetether', 'preexisting']);
const COLLISION_REASONS = new Set([
  'different-preexisting-skill',
  'modified-managed-skill',
]);
const CONTROL_FILES = new Set([
  '.vibetether/project.yaml',
  '.vibetether/intent.md',
  '.vibetether/capabilities.yaml',
  '.vibetether/providers.lock.yaml',
  '.vibetether/experience-index.yaml',
  '.vibetether/TRUTH.md',
]);
const CONTROL_PREFIXES = new Set([
  '.vibetether/state',
  '.vibetether/transaction',
  '.vibetether/quarantine',
]);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function safeId(value) {
  return nonemptyString(value) && SAFE_ID.test(value);
}

function stringArray(value) {
  return Array.isArray(value) && value.every(nonemptyString);
}

function portablePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function samePath(actual, expected) {
  return nonemptyString(actual) && portablePath(actual) === portablePath(expected);
}

async function readRegularFile(root, relativePath) {
  await rejectSymlinkPath(root, relativePath);
  const target = path.join(root, ...relativePath.split('/'));
  const entry = await lstat(target);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`${relativePath} is not a regular file`);
  return readFile(target);
}

function validateManifest(manifest) {
  if (!record(manifest.harnesses)) return null;
  if (!samePath(manifest.provider_lock, '.vibetether/providers.lock.yaml')) return null;
  const enabled = new Set();
  for (const [name, harness] of Object.entries(manifest.harnesses)) {
    const adapter = ADAPTERS[name];
    if (!adapter || !record(harness) || typeof harness.enabled !== 'boolean') return null;
    if (!samePath(harness.instruction_file, adapter.instructionFile)) return null;
    if (harness.enabled) enabled.add(name);
  }
  return enabled.size > 0 ? enabled : null;
}

function validateInstallation(installation, expectedPath) {
  return record(installation)
    && OWNERSHIP.has(installation.ownership)
    && samePath(installation.path, expectedPath);
}

function validateCollision(collision, expectedPath) {
  return record(collision)
    && collision.preserved === true
    && COLLISION_REASONS.has(collision.reason)
    && samePath(collision.path, expectedPath);
}

function validateSource(source) {
  if (!record(source)
    || !safeId(source.id)
    || !nonemptyString(source.repository)
    || !nonemptyString(source.ref)
    || !nonemptyString(source.commit)
    || !nonemptyString(source.license)) {
    return false;
  }
  if (source.license_path !== undefined && !nonemptyString(source.license_path)) return false;
  const hasHash = source.license_sha256 !== undefined;
  const hasInstallation = source.license_installation !== undefined;
  if (hasHash !== hasInstallation) return false;
  if (hasHash) {
    const expected = `.vibetether/licenses/${source.id}.LICENSE.txt`;
    if (!HASH.test(source.license_sha256)
      || !validateInstallation(source.license_installation, expected)) return false;
  }
  if (source.license_evidence !== undefined) {
    if (!record(source.license_evidence)
      || !nonemptyString(source.license_evidence.mode)
      || (source.license_evidence.sha256 !== undefined && !HASH.test(source.license_evidence.sha256))) {
      return false;
    }
  }
  return true;
}

function validateSkillRecord(skill, sources) {
  if (!record(skill)
    || !safeId(skill.id)
    || !safeId(skill.install_name)
    || !safeId(skill.source_id)
    || !sources.has(skill.source_id)
    || !HASH.test(skill.fingerprint ?? '')
    || typeof skill.active !== 'boolean'
    || !stringArray(skill.capabilities)
    || !record(skill.installations)
    || (skill.collisions !== undefined && !record(skill.collisions))) {
    return false;
  }
  for (const [harness, installation] of Object.entries(skill.installations)) {
    const adapter = ADAPTERS[harness];
    if (!adapter) return false;
    const expected = path.join(path.dirname(adapter.skillDirectory), skill.install_name);
    if (!validateInstallation(installation, expected)) return false;
  }
  for (const [harness, collision] of Object.entries(skill.collisions ?? {})) {
    const adapter = ADAPTERS[harness];
    if (!adapter || Object.hasOwn(skill.installations, harness)) return false;
    const expected = path.join(path.dirname(adapter.skillDirectory), skill.install_name);
    if (!validateCollision(collision, expected)) return false;
  }
  return true;
}

function validateCatalogRecord(skill, sources) {
  if (!record(skill)
    || !safeId(skill.id)
    || !safeId(skill.install_name)
    || !safeId(skill.source_id)
    || !sources.has(skill.source_id)
    || !HASH.test(skill.fingerprint ?? '')
    || typeof skill.active !== 'boolean') {
    return false;
  }
  const expected = `.vibetether/providers/catalog/${skill.source_id}/${skill.install_name}`;
  return validateInstallation(skill.installation, expected);
}

function uniqueIds(values) {
  const ids = values.map((value) => value.id);
  return new Set(ids).size === ids.length;
}

export function validateProviderLock(lock) {
  const validV1 = lock?.schema_version === 1
    && Array.isArray(lock.sources)
    && Array.isArray(lock.skills);
  const validV2 = lock?.schema_version === 2
    && Array.isArray(lock.sources)
    && Array.isArray(lock.catalog)
    && Array.isArray(lock.exposures)
    && Array.isArray(lock.skills);
  if (!validV1 && !validV2) return null;
  if (!lock.sources.every(validateSource) || !uniqueIds(lock.sources)) return null;
  const sourceIds = new Set(lock.sources.map((source) => source.id));
  const exposures = validV2 ? lock.exposures : lock.skills;
  if (!exposures.every((skill) => validateSkillRecord(skill, sourceIds)) || !uniqueIds(exposures)) return null;
  if (validV2) {
    try {
      assert.deepEqual(lock.skills, lock.exposures);
    } catch {
      return null;
    }
    if (!lock.catalog.every((skill) => validateCatalogRecord(skill, sourceIds)) || !uniqueIds(lock.catalog)) return null;
    const catalogById = new Map(lock.catalog.map((skill) => [skill.id, skill]));
    for (const exposure of exposures) {
      const catalog = catalogById.get(exposure.id);
      if (!catalog
        || catalog.install_name !== exposure.install_name
        || catalog.source_id !== exposure.source_id
        || catalog.fingerprint !== exposure.fingerprint) return null;
    }
  }
  const activeSources = new Set([
    ...exposures.filter((skill) => skill.active).map((skill) => skill.source_id),
    ...(validV2 ? lock.catalog : []).filter((skill) => skill.active).map((skill) => skill.source_id),
  ]);
  for (const source of lock.sources) {
    if (!activeSources.has(source.id)) continue;
    const declaredLicense = source.license_sha256 && source.license_installation;
    const declaredEvidence = source.license_evidence?.mode === 'readme-declaration'
      && nonemptyString(source.license_evidence.path)
      && HASH.test(source.license_evidence.sha256 ?? '');
    if (!declaredLicense && !declaredEvidence) return null;
  }
  return { exposures, catalog: validV2 ? lock.catalog : [], sources: lock.sources };
}

async function verifySkillDirectory(root, relativePath, expectedFingerprints) {
  try {
    await rejectSymlinkPath(root, relativePath);
    const fingerprint = await skillFingerprint(path.join(root, ...relativePath.split('/')));
    return expectedFingerprints.has(fingerprint);
  } catch {
    return false;
  }
}

async function verifyVibeTetherDirectory(root, relativePath) {
  try {
    await rejectSymlinkPath(root, relativePath);
    const identity = await inspectVibeTetherIdentity(path.join(root, ...relativePath.split('/')));
    return identity.state === 'current' || identity.state === 'legacy';
  } catch {
    return false;
  }
}

async function verifyLicense(root, source) {
  try {
    const content = await readRegularFile(root, portablePath(source.license_installation.path));
    return createHash('sha256').update(content).digest('hex') === source.license_sha256;
  } catch {
    return false;
  }
}

async function verifiedManagedState(root) {
  try {
    const manifest = parseManifest((await readRegularFile(root, '.vibetether/project.yaml')).toString('utf8'));
    const enabledHarnesses = validateManifest(manifest);
    if (!enabledHarnesses) return null;
    const allowedControlFiles = new Set(CONTROL_FILES);
    if (manifest.cli !== undefined) {
      const cli = manifest.cli;
      if (!record(cli)
          || !samePath(cli.launcher, LOCAL_CLI_PATH)
          || !HASH.test(cli.launcher_sha256 ?? '')
          || !nonemptyString(cli.package)
          || !nonemptyString(cli.expected_version)) {
        return null;
      }
      const launcher = await readRegularFile(root, LOCAL_CLI_PATH);
      if (createHash('sha256').update(launcher).digest('hex') !== cli.launcher_sha256) return null;
      allowedControlFiles.add(LOCAL_CLI_PATH);
    }
    const lock = validateProviderLock(YAML.parse(
      (await readRegularFile(root, '.vibetether/providers.lock.yaml')).toString('utf8'),
    ));
    if (!lock) return null;

    const allowedSkillDirectories = new Set();
    const allowedInstructionFiles = new Set();
    for (const harness of enabledHarnesses) {
      const adapter = ADAPTERS[harness];
      if (!(await verifyVibeTetherDirectory(root, adapter.skillDirectory))) return null;
      allowedSkillDirectories.add(portablePath(adapter.skillDirectory));
      allowedInstructionFiles.add(adapter.instructionFile);
    }

    for (const skill of lock.exposures) {
      for (const [harness, installation] of Object.entries(skill.installations)) {
        if (installation.ownership !== 'vibetether') continue;
        if (!enabledHarnesses.has(harness)) return null;
        const relativePath = portablePath(installation.path);
        if (!(await verifySkillDirectory(root, relativePath, new Set([skill.fingerprint])))) return null;
        allowedSkillDirectories.add(relativePath);
      }
    }

    const allowedControlDirectories = new Set();
    for (const skill of lock.catalog) {
      if (skill.installation.ownership !== 'vibetether') continue;
      const relativePath = portablePath(skill.installation.path);
      if (!(await verifySkillDirectory(root, relativePath, new Set([skill.fingerprint])))) return null;
      allowedControlDirectories.add(relativePath);
    }

    for (const source of lock.sources) {
      if (source.license_installation?.ownership !== 'vibetether') continue;
      if (!(await verifyLicense(root, source))) return null;
      allowedControlFiles.add(portablePath(source.license_installation.path));
    }
    return {
      allowedControlDirectories,
      allowedControlFiles,
      allowedInstructionFiles,
      allowedSkillDirectories,
    };
  } catch {
    return null;
  }
}

async function managedBlockOnly(root, relativePath) {
  try {
    const content = (await readRegularFile(root, relativePath)).toString('utf8');
    inspectManagedBlock(content, relativePath);
    const body = managedBlockBody(content);
    const recognizedBody = relativePath === '.gitignore'
      ? body === GITIGNORE_BODY || body === LEGACY_GITIGNORE_BODY
      : body === ADAPTERS[relativePath === 'AGENTS.md' ? 'codex' : 'claude'].managedBody.trim()
        || LEGACY_MANAGED_BODIES.has(body);
    return recognizedBody && removeManagedBlock(content).trim() === '';
  } catch {
    return false;
  }
}

function isInside(relativePath, directory) {
  return relativePath.startsWith(`${directory}/`);
}

function isAncestor(relativePath, target) {
  return target.startsWith(`${relativePath}/`);
}

async function managedTreeOnly(root, relativeRoot, { files = new Set(), directories = new Set(), prefixes = new Set() }) {
  const visit = async (relativeDirectory) => {
    let entries;
    try {
      entries = await readdir(path.join(root, ...relativeDirectory.split('/')), { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isSymbolicLink()) return false;
      if (entry.isDirectory()) {
        if ([...prefixes].some((prefix) => relativePath === prefix || isInside(relativePath, prefix))) {
          if (!(await visit(relativePath))) return false;
          continue;
        }
        if (directories.has(relativePath)) continue;
        const isAllowedContainer = [...files, ...directories, ...prefixes]
          .some((target) => isAncestor(relativePath, target));
        if (!isAllowedContainer || !(await visit(relativePath))) return false;
        continue;
      }
      if (!entry.isFile()) return false;
      if (files.has(relativePath)) continue;
      if ([...prefixes].some((prefix) => isInside(relativePath, prefix))) continue;
      return false;
    }
    return true;
  };
  return visit(relativeRoot);
}

export async function detectProjectState(root, topLevelEntries) {
  const meaningfulEntries = topLevelEntries.filter((entry) => entry.name !== '.git');
  if (meaningfulEntries.length === 0) return 'greenfield';
  const managedState = await verifiedManagedState(root);
  if (!managedState) return 'existing';

  for (const entry of meaningfulEntries) {
    if (entry.name === '.vibetether' && entry.isDirectory()) {
      if (!(await managedTreeOnly(root, '.vibetether', {
        files: managedState.allowedControlFiles,
        directories: managedState.allowedControlDirectories,
        prefixes: CONTROL_PREFIXES,
      }))) return 'existing';
      continue;
    }
    if (entry.name === '.gitignore' && entry.isFile() && await managedBlockOnly(root, entry.name)) continue;
    if (managedState.allowedInstructionFiles.has(entry.name)
      && entry.isFile()
      && await managedBlockOnly(root, entry.name)) continue;
    if (['.agents', '.claude'].includes(entry.name) && entry.isDirectory()) {
      if (!(await managedTreeOnly(root, entry.name, {
        directories: managedState.allowedSkillDirectories,
      }))) return 'existing';
      continue;
    }
    return 'existing';
  }
  return 'greenfield';
}
