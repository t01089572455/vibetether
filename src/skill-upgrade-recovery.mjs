import { access, cp, lstat, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ADAPTERS } from './adapters.mjs';
import { CliError } from './errors.mjs';
import {
  rejectSymlinkPath,
  resolveInside,
  writeAtomic,
} from './files.mjs';
import { inspectVibeTetherIdentity, sourceSkill } from './skill-install.mjs';

const WINDOWS_LOCK_CODES = new Set(['EACCES', 'EBUSY', 'ENOTEMPTY', 'EPERM']);
const SAFE_HARNESS = new Set(['codex', 'claude']);

const defaultOperations = Object.freeze({ access, cp, lstat, mkdir, rename, rm });

function operationsWith(overrides = {}) {
  return { ...defaultOperations, ...overrides };
}

function portable(relativePath) {
  return relativePath.replaceAll('\\', '/');
}

export function skillUpgradePaths(root, harness) {
  if (!SAFE_HARNESS.has(harness)) throw new CliError('Skill upgrade harness must be codex or claude.', 3);
  const base = `.vibetether/transaction/skill-upgrade-${harness}`;
  return {
    manifest: resolveInside(root, `${base}.yaml`),
    previous: resolveInside(root, `${base}.previous`),
    pending: resolveInside(root, `${base}.pending`),
    retired: resolveInside(root, `${base}.retired`),
    relative: {
      manifest: `${base}.yaml`,
      previous: `${base}.previous`,
      pending: `${base}.pending`,
      retired: `${base}.retired`,
    },
  };
}

function isWindowsLock(error) {
  return WINDOWS_LOCK_CODES.has(error?.code);
}

async function exists(target, operations) {
  try {
    await operations.lstat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertFreshTransaction(paths, operations) {
  for (const target of [paths.manifest, paths.previous, paths.pending, paths.retired]) {
    if (await exists(target, operations)) {
      throw new CliError('A prior VibeTether Skill upgrade transaction is pending. Close Codex and Claude, then rerun the same command.', 3);
    }
  }
}

async function writeTransaction(paths, transaction) {
  await writeAtomic(paths.manifest, YAML.stringify(transaction, { lineWidth: 0 }));
}

async function verifyIdentity(target, expectedState, expectedFingerprint = null) {
  const identity = await inspectVibeTetherIdentity(target);
  if (identity.state !== expectedState || (expectedFingerprint && identity.installed !== expectedFingerprint)) {
    throw new CliError('A staged VibeTether Skill copy failed canonical identity verification.', 3);
  }
  return identity;
}

function validateRequest(request) {
  if (!request?.root || !request?.target || !request?.relativePath || !SAFE_HARNESS.has(request?.harness)) {
    throw new CliError('Skill upgrade request is incomplete.', 3);
  }
  const expected = portable(ADAPTERS[request.harness].skillDirectory);
  if (portable(request.relativePath) !== expected || path.resolve(request.target) !== resolveInside(request.root, expected)) {
    throw new CliError('Skill upgrade target does not match the enabled harness.', 3);
  }
}

export async function prepareSkillUpgrade(request, operationOverrides = {}) {
  validateRequest(request);
  const operations = operationsWith(operationOverrides);
  const paths = skillUpgradePaths(request.root, request.harness);
  for (const relativePath of [
    request.relativePath,
    paths.relative.manifest,
    paths.relative.previous,
    paths.relative.pending,
    paths.relative.retired,
  ]) {
    await rejectSymlinkPath(request.root, relativePath);
  }
  await operations.mkdir(path.dirname(paths.manifest), { recursive: true });
  await assertFreshTransaction(paths, operations);

  const previousIdentity = await inspectVibeTetherIdentity(request.target);
  if (!['legacy', 'current'].includes(previousIdentity.state)) {
    throw new CliError('Refusing to stage an unknown or modified VibeTether Skill.', 3);
  }
  const replacementSource = request.source ?? sourceSkill;
  const replacementIdentity = await inspectVibeTetherIdentity(replacementSource);
  if (replacementIdentity.state !== 'current') {
    throw new CliError('The replacement VibeTether Skill is not the packaged canonical release.', 3);
  }

  let copiedPrevious = false;
  let copiedPending = false;
  try {
    await operations.cp(request.target, paths.previous, { recursive: true, errorOnExist: true, force: false });
    copiedPrevious = true;
    await verifyIdentity(paths.previous, previousIdentity.state, previousIdentity.installed);
    await operations.cp(replacementSource, paths.pending, { recursive: true, errorOnExist: true, force: false });
    copiedPending = true;
    await verifyIdentity(paths.pending, 'current', replacementIdentity.installed);
  } catch (error) {
    if (copiedPending) await operations.rm(paths.pending, { recursive: true, force: true }).catch(() => {});
    if (copiedPrevious) await operations.rm(paths.previous, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  const now = new Date().toISOString();
  const transaction = {
    schema_version: 1,
    harness: request.harness,
    target: portable(request.relativePath),
    previous: {
      identity: previousIdentity.installed,
      state: previousIdentity.state,
      path: paths.relative.previous,
    },
    replacement: {
      identity: replacementIdentity.installed,
      path: paths.relative.pending,
    },
    retired_path: paths.relative.retired,
    state: 'prepared',
    created_at: now,
    updated_at: now,
  };
  await writeTransaction(paths, transaction);
  return { transaction, paths, operations };
}

async function deferUpgrade(prepared, request, step, error) {
  const transaction = {
    ...prepared.transaction,
    state: 'waiting-for-host-release',
    waiting_step: step,
    lock_code: WINDOWS_LOCK_CODES.has(error?.code) ? error.code : 'RESTORE_BLOCKED',
    updated_at: new Date().toISOString(),
  };
  await writeTransaction(prepared.paths, transaction);
  const deferred = new CliError(
    `VibeTether could not replace the active ${request.harness === 'codex' ? 'Codex' : 'Claude'} Skill because Windows reports it is in use. Close Codex and Claude processes using this project, then rerun the same command. The verified old and replacement copies were preserved.`,
    3,
  );
  deferred.status = 'deferred';
  deferred.transactionPath = prepared.paths.manifest;
  throw deferred;
}

async function restorePreviousWithoutDeletion(prepared, request) {
  if (await exists(request.target, prepared.operations)) return false;
  try {
    await prepared.operations.rename(prepared.paths.retired, request.target);
    return true;
  } catch {
    return false;
  }
}

async function cleanupApplied(prepared) {
  const cleanupWarnings = [];
  for (const target of [prepared.paths.previous, prepared.paths.retired]) {
    await prepared.operations.rm(target, { recursive: true, force: true })
      .catch((error) => cleanupWarnings.push(error.message));
  }
  if (cleanupWarnings.length === 0) {
    await prepared.operations.rm(prepared.paths.manifest, { force: true })
      .catch((error) => cleanupWarnings.push(error.message));
  }
  return cleanupWarnings;
}

export async function replaceCanonicalSkill(request, operationOverrides = {}) {
  const prepared = await prepareSkillUpgrade(request, operationOverrides);
  try {
    await prepared.operations.rename(request.target, prepared.paths.retired);
  } catch (error) {
    if (isWindowsLock(error)) return deferUpgrade(prepared, request, 'retire-active-skill', error);
    throw error;
  }

  try {
    await prepared.operations.rename(prepared.paths.pending, request.target);
    await verifyIdentity(request.target, 'current', prepared.transaction.replacement.identity);
  } catch (error) {
    const restored = await restorePreviousWithoutDeletion(prepared, request);
    if (isWindowsLock(error) || !restored) {
      return deferUpgrade(prepared, request, 'commit-replacement', error);
    }
    await writeTransaction(prepared.paths, {
      ...prepared.transaction,
      state: 'prepared',
      last_failed_step: 'commit-replacement',
      updated_at: new Date().toISOString(),
    });
    throw error;
  }

  await writeTransaction(prepared.paths, {
    ...prepared.transaction,
    state: 'applied',
    updated_at: new Date().toISOString(),
  });
  return {
    status: 'installed',
    transactionPath: prepared.paths.manifest,
    cleanupWarnings: await cleanupApplied(prepared),
  };
}
