import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import {
  VERSION, PROJECT_MANIFEST, DEFAULT_EXPERIENCE, DEFAULT_INTENT, DEFAULT_LAUNCHER,
  DEFAULT_ROUTES, DEFAULT_SKILLS_LOCK, DEFAULT_TRUTH, DEFAULT_OUTCOMES, DEFAULT_PROGRESS,
  HOTSET_MAX, SHORTLIST_MAX,
} from './constants.mjs';
import { conflictError } from './errors.mjs';
import {
  assertSafeId, canonicalJson, readJsonFile, readProjectJson, readProjectText,
  rejectAbsoluteSymlinkChain, safeRelative, sha256Text,
} from './files.mjs';
import { gitIdentity } from './git.mjs';
import { findTrackedProject, stateHome } from './paths.mjs';
import { validateOutcomeRegistry } from './outcomes.mjs';

const CONTROL_MODES = new Set(['team', 'hybrid', 'local']);
const AUTO_POLICIES = new Set(['stable-only', 'stable-and-beta', 'explicit-only']);
const MANIFEST_KEYS = new Set([
  'schema_version', 'vibetether_version', 'project_id', 'control_generation', 'control_mode',
  'intent', 'truth_index', 'experience_index', 'skills_lock', 'routes', 'launcher', 'created_at',
  'outcome_index', 'progress_projection',
]);
const LOCK_KEYS = new Set(['schema_version', 'auto_activate', 'shortlist_max', 'hotset_max', 'packs', 'pins', 'disabled', 'preferences', 'hotset']);
const PIN_KEYS = new Set(['id', 'object_hash', 'fingerprint', 'source', 'version', 'license']);

function only(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw conflictError(`${label} contains unsupported field: ${key}`, 'INVALID_CONTRACT');
}
function semver(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}

export function createManifest({ project_id = randomUUID(), control_mode = 'team', truth_index = DEFAULT_TRUTH, created_at = new Date().toISOString() } = {}) {
  return {
    schema_version: 2,
    vibetether_version: VERSION,
    project_id,
    control_generation: randomUUID(),
    control_mode,
    intent: DEFAULT_INTENT,
    truth_index,
    experience_index: DEFAULT_EXPERIENCE,
    skills_lock: DEFAULT_SKILLS_LOCK,
    routes: DEFAULT_ROUTES,
    launcher: DEFAULT_LAUNCHER,
    outcome_index: DEFAULT_OUTCOMES,
    progress_projection: DEFAULT_PROGRESS,
    created_at,
  };
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw conflictError('Project manifest must be a JSON object.', 'INVALID_CONTRACT');
  only(manifest, MANIFEST_KEYS, 'Project manifest');
  if (![1, 2].includes(manifest.schema_version)) throw conflictError('Project manifest schema_version must be 1 or 2.', 'INVALID_CONTRACT');
  if (!semver(manifest.vibetether_version)) throw conflictError('Project manifest requires a semantic vibetether_version.', 'INVALID_CONTRACT');
  if (typeof manifest.project_id !== 'string' || !/^[0-9a-f-]{16,64}$/i.test(manifest.project_id)) throw conflictError('Project manifest project_id is invalid.', 'INVALID_CONTRACT');
  if (typeof manifest.control_generation !== 'string' || !/^[0-9a-f-]{16,64}$/i.test(manifest.control_generation)) throw conflictError('Project manifest control_generation is invalid.', 'INVALID_CONTRACT');
  if (!CONTROL_MODES.has(manifest.control_mode)) throw conflictError('Project manifest control_mode is invalid.', 'INVALID_CONTRACT');
  for (const field of ['intent', 'truth_index', 'experience_index', 'skills_lock', 'routes', 'launcher']) manifest[field] = safeRelative(manifest[field], `Manifest ${field}`);
  if (manifest.schema_version === 2) {
    manifest.outcome_index = safeRelative(manifest.outcome_index, 'Manifest outcome_index');
    manifest.progress_projection = safeRelative(manifest.progress_projection, 'Manifest progress_projection');
  } else if (manifest.outcome_index !== undefined || manifest.progress_projection !== undefined) {
    throw conflictError('Schema-1 manifest cannot declare schema-2 Outcome assets.', 'INVALID_CONTRACT');
  }
  if (!Number.isFinite(Date.parse(manifest.created_at))) throw conflictError('Project manifest created_at is invalid.', 'INVALID_CONTRACT');
  return manifest;
}

export function createSkillsLock({ packs = ['standard'] } = {}) {
  return {
    schema_version: 1,
    auto_activate: 'stable-only',
    shortlist_max: SHORTLIST_MAX,
    hotset_max: HOTSET_MAX,
    packs: [...new Set(packs)],
    pins: [], disabled: [], preferences: [], hotset: [],
  };
}

export function validateSkillsLock(lock) {
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) throw conflictError('Skills lock must be a JSON object.', 'INVALID_SKILLS_LOCK');
  only(lock, LOCK_KEYS, 'Skills lock');
  if (lock.schema_version !== 1 || !AUTO_POLICIES.has(lock.auto_activate)) throw conflictError('Skills lock has an unsupported schema or auto_activate policy.', 'INVALID_SKILLS_LOCK');
  if (!Number.isInteger(lock.shortlist_max) || lock.shortlist_max < 1 || lock.shortlist_max > SHORTLIST_MAX) throw conflictError(`shortlist_max must be 1-${SHORTLIST_MAX}.`, 'INVALID_SKILLS_LOCK');
  if (!Number.isInteger(lock.hotset_max) || lock.hotset_max < 0 || lock.hotset_max > HOTSET_MAX) throw conflictError(`hotset_max must be 0-${HOTSET_MAX}.`, 'INVALID_SKILLS_LOCK');
  for (const field of ['packs', 'pins', 'disabled', 'preferences', 'hotset']) if (!Array.isArray(lock[field])) throw conflictError(`Skills lock ${field} must be an array.`, 'INVALID_SKILLS_LOCK');
  const packIds = new Set();
  for (const pack of lock.packs) {
    assertSafeId(pack, 'Provider pack id');
    if (packIds.has(pack)) throw conflictError(`Duplicate Provider pack: ${pack}`, 'INVALID_SKILLS_LOCK');
    packIds.add(pack);
  }
  const pinIds = new Set();
  for (const pin of lock.pins) {
    if (!pin || typeof pin !== 'object' || Array.isArray(pin)) throw conflictError('Skills lock pin must be an object.', 'INVALID_SKILLS_LOCK');
    only(pin, PIN_KEYS, `Provider pin ${pin.id ?? ''}`);
    assertSafeId(pin.id, 'Provider id');
    if (pinIds.has(pin.id)) throw conflictError(`Duplicate provider pin: ${pin.id}`, 'INVALID_SKILLS_LOCK');
    pinIds.add(pin.id);
    if (!/^[a-f0-9]{64}$/.test(pin.object_hash ?? '') || !/^[a-f0-9]{64}$/.test(pin.fingerprint ?? '')) throw conflictError(`Provider pin ${pin.id} requires object_hash and fingerprint.`, 'INVALID_SKILLS_LOCK');
    for (const field of ['source', 'version', 'license']) if (pin[field] !== undefined && (typeof pin[field] !== 'string' || !pin[field].trim())) throw conflictError(`Provider pin ${pin.id} ${field} is invalid.`, 'INVALID_SKILLS_LOCK');
  }
  for (const field of ['disabled', 'preferences', 'hotset']) {
    const seen = new Set();
    for (const id of lock[field]) {
      assertSafeId(id, `Skills lock ${field} id`);
      if (seen.has(id)) throw conflictError(`Duplicate ${field} provider: ${id}`, 'INVALID_SKILLS_LOCK');
      seen.add(id);
    }
  }
  if (lock.hotset.length > lock.hotset_max) throw conflictError('Skills lock hotset exceeds hotset_max.', 'INVALID_SKILLS_LOCK');
  return lock;
}

export function skillsLockDigest(lock) {
  return sha256Text(canonicalJson(validateSkillsLock(structuredClone(lock))));
}
export function controlDigest(manifest, skills, routes) {
  return sha256Text(canonicalJson({
    manifest: validateManifest(structuredClone(manifest)),
    skills: validateSkillsLock(structuredClone(skills)),
    routes: routes ?? null,
  }));
}

export function localContractRoot(commonId) {
  return path.join(stateHome(), 'local-contracts', commonId, 'project');
}
export function repositoryRegistryPath(commonId) {
  return path.join(stateHome(), 'repositories', `${commonId}.json`);
}

export async function loadContract(root) {
  const resolvedRoot = await rejectAbsoluteSymlinkChain(path.resolve(root), { allowMissing: false });
  const metadata = await lstat(resolvedRoot);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw conflictError('Project Contract root must be a regular non-linked directory.', 'INVALID_CONTRACT');
  const manifest = validateManifest(await readProjectJson(resolvedRoot, PROJECT_MANIFEST, 'Project manifest'));
  const intentSource = await readProjectText(resolvedRoot, manifest.intent, 'Intent Contract');
  const truthSource = await readProjectText(resolvedRoot, manifest.truth_index, 'Truth Map');
  const experience = await readProjectJson(resolvedRoot, manifest.experience_index, 'Experience index');
  const skills = validateSkillsLock(await readProjectJson(resolvedRoot, manifest.skills_lock, 'Skills lock'));
  const routes = await readProjectJson(resolvedRoot, manifest.routes, 'Project routes', { allowMissing: true });
  const outcomes = manifest.schema_version === 2
    ? validateOutcomeRegistry(await readProjectJson(resolvedRoot, manifest.outcome_index, 'Outcome registry'))
    : null;
  const progressSource = manifest.schema_version === 2
    ? await readProjectText(resolvedRoot, manifest.progress_projection, 'Progress projection')
    : null;
  return { root: resolvedRoot, manifest, intentSource, truthSource, experience, skills, routes, outcomes, progressSource };
}

export async function discoverContract(start = process.cwd()) {
  const executionIdentity = await gitIdentity(start);
  const executionRoot = executionIdentity?.worktree_root ?? path.resolve(start);
  const tracked = await findTrackedProject(start);
  if (tracked) return { ...(await loadContract(tracked)), executionRoot, tracked: true, shared: false };
  if (executionIdentity) {
    const identityIds = [...new Set([executionIdentity.common_id, executionIdentity.legacy_common_id].filter(Boolean))];
    for (const identityId of identityIds) {
      const localRoot = localContractRoot(identityId);
      try {
        const local = await loadContract(localRoot);
        return { ...local, executionRoot, tracked: false, shared: true };
      } catch (error) {
        if (!['MISSING_FILE', 'INVALID_JSON', 'INVALID_CONTRACT'].includes(error.code)) throw error;
      }
    }
    for (const identityId of identityIds) {
      try {
        const registry = await readJsonFile(repositoryRegistryPath(identityId), 'Repository registry');
        for (const candidate of registry.contract_roots ?? []) {
          try {
            const candidateIdentity = await gitIdentity(candidate);
            if (!candidateIdentity || candidateIdentity.common_id !== executionIdentity.common_id) continue;
            const loaded = await loadContract(candidate);
            return { ...loaded, executionRoot, tracked: true, shared: true };
          } catch {
            // A stale registry entry must not stop discovery of another valid root.
          }
        }
      } catch (error) {
        if (error.code !== 'MISSING_FILE') throw error;
      }
    }
  }
  throw conflictError('No VibeTether Project Contract is discoverable from this directory. Run `vibetether init` or attach a worktree to an existing Contract.', 'CONTRACT_NOT_FOUND');
}
