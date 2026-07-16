import { access, cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ADAPTERS } from './adapters.mjs';
import { CliError } from './errors.mjs';
import {
  rejectSymlinkPath,
  resolveInside,
  writeAtomic,
} from './files.mjs';
import { inspectVibeTetherIdentity, installDirectory, sourceSkill } from './skill-install.mjs';

const WINDOWS_LOCK_CODES = new Set(['EACCES', 'EBUSY', 'ENOTEMPTY', 'EPERM']);
const SAFE_HARNESS = new Set(['codex', 'claude']);

const defaultOperations = Object.freeze({ access, cp, lstat, mkdir, readFile, readdir, rename, rm });
const HASH = /^[a-f0-9]{64}$/;
const TRANSACTION_STATES = new Set(['applied', 'prepared', 'waiting-for-host-release']);
const TRANSACTION_KEYS = new Set([
  'schema_version',
  'harness',
  'target',
  'previous',
  'replacement',
  'retired_path',
  'state',
  'created_at',
  'updated_at',
  'waiting_step',
  'lock_code',
  'last_failed_step',
]);

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
  try {
    await writeTransaction(paths, transaction);
  } catch (error) {
    await operations.rm(paths.pending, { recursive: true, force: true }).catch(() => {});
    await operations.rm(paths.previous, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
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
  for (const target of [prepared.paths.previous, prepared.paths.pending, prepared.paths.retired]) {
    await prepared.operations.rm(target, { recursive: true, force: true })
      .catch((error) => cleanupWarnings.push(error.message));
  }
  if (cleanupWarnings.length === 0) {
    await prepared.operations.rm(prepared.paths.manifest, { force: true })
      .catch((error) => cleanupWarnings.push(error.message));
  }
  return cleanupWarnings;
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactTransactionShape(value, harness, paths) {
  if (!record(value)
      || value.schema_version !== 1
      || value.harness !== harness
      || value.target !== portable(ADAPTERS[harness].skillDirectory)
      || value.retired_path !== paths.relative.retired
      || !record(value.previous)
      || !record(value.replacement)
      || !HASH.test(value.previous.identity ?? '')
      || !['legacy', 'current'].includes(value.previous.state)
      || value.previous.path !== paths.relative.previous
      || !HASH.test(value.replacement.identity ?? '')
      || value.replacement.path !== paths.relative.pending
      || !TRANSACTION_STATES.has(value.state)
      || typeof value.created_at !== 'string'
      || typeof value.updated_at !== 'string'
      || Object.keys(value).some((key) => !TRANSACTION_KEYS.has(key))) {
    throw new CliError('The VibeTether Skill upgrade transaction is structurally invalid.', 3);
  }
  return value;
}

async function readTransaction(root, harness, operationOverrides = {}) {
  const operations = operationsWith(operationOverrides);
  const paths = skillUpgradePaths(root, harness);
  await rejectSymlinkPath(root, paths.relative.manifest);
  try {
    const source = await operations.readFile(paths.manifest, 'utf8');
    return {
      transaction: exactTransactionShape(YAML.parse(source), harness, paths),
      paths,
      operations,
    };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof CliError) throw error;
    throw new CliError('The VibeTether Skill upgrade transaction cannot be read safely.', 3);
  }
}

async function identityIfPresent(target) {
  try {
    return await inspectVibeTetherIdentity(target);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
    throw error;
  }
}

function legacyCandidateName(name, harness) {
  return new RegExp(`^skill-upgrade-${harness}\\.previous$`, 'i').test(name)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.previous$/i.test(name);
}

async function enabledPeerIdentity(root, harness, operations) {
  const peer = harness === 'codex' ? 'claude' : 'codex';
  try {
    await rejectSymlinkPath(root, '.vibetether/project.yaml');
    const manifest = YAML.parse(await operations.readFile(resolveInside(root, '.vibetether/project.yaml'), 'utf8'));
    if (manifest?.harnesses?.[peer]?.enabled !== true) return null;
    await rejectSymlinkPath(root, ADAPTERS[peer].skillDirectory);
    return identityIfPresent(resolveInside(root, ADAPTERS[peer].skillDirectory));
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
    return null;
  }
}

async function legacyCandidates(root, harness, operations) {
  const transactionRoot = resolveInside(root, '.vibetether/transaction');
  let entries;
  try {
    entries = await operations.readdir(transactionRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { candidates: [], rejected: [] };
    throw new CliError('The VibeTether transaction directory cannot be inspected safely.', 3);
  }
  const candidates = [];
  const rejected = [];
  for (const entry of entries) {
    if (!legacyCandidateName(entry.name, harness)) continue;
    const relativePath = `.vibetether/transaction/${entry.name}`;
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      rejected.push(relativePath);
      continue;
    }
    await rejectSymlinkPath(root, relativePath);
    const target = resolveInside(root, relativePath);
    try {
      const identity = await inspectVibeTetherIdentity(target);
      if (['current', 'legacy'].includes(identity.state)) {
        candidates.push({
          path: target,
          relativePath,
          identity: identity.installed,
          state: identity.state,
        });
      } else {
        rejected.push(relativePath);
      }
    } catch {
      rejected.push(relativePath);
    }
  }
  return { candidates, rejected };
}

export async function inspectSkillRecovery(root, harness, operationOverrides = {}) {
  if (!SAFE_HARNESS.has(harness)) throw new CliError('Skill recovery harness must be codex or claude.', 3);
  const operations = operationsWith(operationOverrides);
  const pending = await readTransaction(root, harness, operations);
  if (pending) {
    const target = resolveInside(root, ADAPTERS[harness].skillDirectory);
    return {
      kind: 'pending-skill-upgrade',
      harness,
      state: pending.transaction.state,
      targetState: (await identityIfPresent(target))?.state ?? 'missing',
      transactionPath: pending.paths.relative.manifest,
      recommendedAction: 'Close Codex and Claude processes using this project, then rerun init.',
    };
  }

  const target = resolveInside(root, ADAPTERS[harness].skillDirectory);
  if (await identityIfPresent(target)) return null;
  const { candidates, rejected } = await legacyCandidates(root, harness, operations);
  if (candidates.length === 0) {
    return rejected.length > 0
      ? {
          kind: 'unrecoverable-skill-state',
          harness,
          rejected,
          recommendedAction: 'Back up the transaction directory and reinstall from a verified release.',
        }
      : null;
  }

  let selected = candidates.length === 1 ? candidates[0] : null;
  if (!selected) {
    const peer = await enabledPeerIdentity(root, harness, operations);
    const matches = peer ? candidates.filter((candidate) => candidate.identity === peer.installed) : [];
    if (matches.length === 1) selected = matches[0];
  }
  if (!selected) {
    return {
      kind: 'ambiguous-recovery',
      harness,
      candidates,
      recommendedAction: 'Choose one verified candidate explicitly; VibeTether will not guess by timestamp.',
    };
  }
  return {
    kind: 'recoverable-missing-skill',
    harness,
    sourcePath: selected.path,
    source: selected.relativePath,
    sourceIdentity: selected.identity,
    sourceState: selected.state,
    recommendedAction: 'Rerun init to restore this verified candidate before other work.',
  };
}

async function recoverPendingTransaction(root, harness, operationOverrides = {}) {
  const prepared = await readTransaction(root, harness, operationOverrides);
  if (!prepared) return null;
  const request = {
    root,
    harness,
    relativePath: ADAPTERS[harness].skillDirectory,
    target: resolveInside(root, ADAPTERS[harness].skillDirectory),
  };
  const targetIdentity = await identityIfPresent(request.target);
  const previousIdentity = await identityIfPresent(prepared.paths.previous);
  const pendingIdentity = await identityIfPresent(prepared.paths.pending);

  if (targetIdentity?.installed === prepared.transaction.replacement.identity) {
    await writeTransaction(prepared.paths, {
      ...prepared.transaction,
      state: 'applied',
      updated_at: new Date().toISOString(),
    });
    return {
      kind: 'pending-skill-upgrade',
      harness,
      status: 'recovered',
      sourceIdentity: targetIdentity.installed,
      cleanupWarnings: await cleanupApplied(prepared),
    };
  }
  if (!pendingIdentity || pendingIdentity.installed !== prepared.transaction.replacement.identity) {
    throw new CliError('Pending Skill recovery is unrecoverable because the verified replacement copy is missing or changed.', 3);
  }
  const oldIdentityAvailable = previousIdentity?.installed === prepared.transaction.previous.identity;
  if (!oldIdentityAvailable && targetIdentity?.installed !== prepared.transaction.previous.identity) {
    throw new CliError('Pending Skill recovery is unrecoverable because no verified previous copy remains.', 3);
  }
  if (targetIdentity && targetIdentity.installed !== prepared.transaction.previous.identity) {
    if (!['legacy', 'current'].includes(targetIdentity.state)) {
      throw new CliError('Pending Skill recovery found an unexpected canonical target identity.', 3);
    }
    if (await exists(prepared.paths.retired, prepared.operations)) {
      throw new CliError('Pending Skill recovery found an unexpected retired target copy.', 3);
    }
    return {
      kind: 'pending-skill-upgrade',
      harness,
      status: 'superseded',
      sourceIdentity: targetIdentity.installed,
      cleanupWarnings: await cleanupApplied(prepared),
    };
  }
  if (targetIdentity) {
    if (await exists(prepared.paths.retired, prepared.operations)) {
      throw new CliError('Pending Skill recovery found an unexpected retired target copy.', 3);
    }
    try {
      await prepared.operations.rename(request.target, prepared.paths.retired);
    } catch (error) {
      if (isWindowsLock(error)) return deferUpgrade(prepared, request, 'recover-retire-active-skill', error);
      throw error;
    }
  }

  try {
    await prepared.operations.mkdir(path.dirname(request.target), { recursive: true });
    await prepared.operations.rename(prepared.paths.pending, request.target);
    await verifyIdentity(request.target, 'current', prepared.transaction.replacement.identity);
  } catch (error) {
    const restored = await restorePreviousWithoutDeletion(prepared, request);
    if (isWindowsLock(error) || !restored) {
      return deferUpgrade(prepared, request, 'recover-commit-replacement', error);
    }
    throw error;
  }
  await writeTransaction(prepared.paths, {
    ...prepared.transaction,
    state: 'applied',
    updated_at: new Date().toISOString(),
  });
  return {
    kind: 'pending-skill-upgrade',
    harness,
    status: 'recovered',
    sourceIdentity: prepared.transaction.replacement.identity,
    cleanupWarnings: await cleanupApplied(prepared),
  };
}

function ambiguousRecoveryError(plan) {
  const choices = plan.candidates
    .map((candidate, index) => `${index + 1}. ${candidate.relativePath} [${candidate.state}]`)
    .join('\n');
  return new CliError(
    `VibeTether found ambiguous recovery candidates and will not choose by timestamp:\n${choices}\nBack up the candidates and keep only the intended verified copy, then rerun init.`,
    3,
  );
}

export async function recoverSkillUpgrades({ root, adapters, operations = {} }) {
  const reports = [];
  for (const harness of adapters) {
    const harnessOperations = operations?.[harness] ?? operations;
    const pending = await readTransaction(root, harness, harnessOperations);
    if (pending) {
      reports.push(await recoverPendingTransaction(root, harness, harnessOperations));
      continue;
    }
    const plan = await inspectSkillRecovery(root, harness, harnessOperations);
    if (!plan) continue;
    if (plan.kind === 'ambiguous-recovery') throw ambiguousRecoveryError(plan);
    if (plan.kind === 'unrecoverable-skill-state') {
      throw new CliError('VibeTether found only modified, linked, or unknown recovery candidates. Back them up and reinstall from a verified release.', 3);
    }
    const activeOperations = operationsWith(harnessOperations);
    const target = resolveInside(root, ADAPTERS[harness].skillDirectory);
    await rejectSymlinkPath(root, ADAPTERS[harness].skillDirectory);
    await installDirectory(sourceSkill, target, activeOperations);
    const restored = await verifyIdentity(target, 'current');
    const cleanupWarnings = [];
    await activeOperations.rm(plan.sourcePath, { recursive: true, force: true })
      .catch((error) => cleanupWarnings.push(error.message));
    reports.push({
      ...plan,
      status: 'recovered',
      targetIdentity: restored.installed,
      cleanupWarnings,
    });
  }
  return reports;
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
