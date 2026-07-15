import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { createAuthoritySnapshot } from './authority-snapshot.mjs';
import { ADAPTERS, MANAGED_END, MANAGED_START } from './adapters.mjs';
import { CliError } from './errors.mjs';
import { managedBlockBody, rejectSymlinkPath } from './files.mjs';
import { parseExperienceIndex, validateExperienceIndex } from './experience-index.mjs';
import { isSafeProjectRelativeArtifactPath, isSensitiveArtifactPath } from './artifact-safety.mjs';
import { inspectVibeTetherIdentity, skillFingerprint } from './skill-install.mjs';
import { assertCapabilityBoard } from '../skills/vibe-tether/scripts/capability-routing.mjs';
import { parseCanonicalManifest } from '../skills/vibe-tether/scripts/manifest.mjs';
import { refreshBoardAvailability, resolveBoardRoute } from './capabilities.mjs';
import { loadEffectiveProjectRoutes } from './project-routes.mjs';
import { ROUTE_HANDSHAKE_PATH } from './route-handshake.mjs';
import { inspectSkillRecovery } from './skill-upgrade-recovery.mjs';
import { parseTruthMap, validateConfirmedTruth } from './truth-map.mjs';

const COMPLETION_PHASES = new Set(['REVIEW', 'SHIP']);
const CAPTURE_TRIGGERS = new Set(['first-proven-path', 'recovered-path', 'changed-proven-path']);
const VALID_TRIGGERS = new Set([...CAPTURE_TRIGGERS, 'repeat-proven-path', 'routine-non-path']);
const VALID_DISPOSITIONS = new Set(['captured', 'already-encoded', 'not-reusable']);

function flattenSources(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenSources);
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenSources);
  return [];
}

function issue(code, message) {
  return { level: 'error', code, message };
}

function warning(code, message) {
  return { level: 'warning', code, message };
}

function projectPath(root, relativePath) {
  if (typeof relativePath !== 'string') return null;
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  return relative.startsWith('..') || path.isAbsolute(relative) ? null : target;
}

async function projectEntryStatus(root, relativePath, expectedType = 'file') {
  if (typeof relativePath !== 'string') return { status: 'invalid', target: null };
  const target = projectPath(root, relativePath);
  if (!target) return { status: 'escape', target: null };
  try {
    await rejectSymlinkPath(root, relativePath);
    const metadata = await lstat(target);
    if (expectedType === 'file' && !metadata.isFile()) return { status: 'wrong-type', target };
    if (expectedType === 'directory' && !metadata.isDirectory()) return { status: 'wrong-type', target };
    if (expectedType === 'any' && !metadata.isFile() && !metadata.isDirectory()) {
      return { status: 'wrong-type', target };
    }
    return { status: 'ok', target };
  } catch (error) {
    if (error.code === 'ENOENT') return { status: 'missing', target };
    return { status: 'unsafe', target };
  }
}

function unsafeAuthorityMessage(label, expectedType = 'file') {
  const kind = expectedType === 'directory'
    ? 'directory'
    : expectedType === 'any'
      ? 'regular non-linked file or directory'
      : 'regular non-linked file';
  return `${label} must be a safe project-contained ${kind}`;
}

function portablePath(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function normalizedArtifactPath(value) {
  return portablePath(value).replace(/^\.\//, '');
}

function isBuiltInExperienceArtifact(artifact) {
  const normalized = normalizedArtifactPath(artifact);
  return normalized.startsWith('skills/vibe-tether/') || normalized.startsWith('evals/');
}

async function feedbackArtifactStatus(root, artifact) {
  if (!isSafeProjectRelativeArtifactPath(artifact) || isSensitiveArtifactPath(artifact)) return 'unsafe';
  const target = projectPath(root, artifact);
  if (!target) return 'escape';
  try {
    await rejectSymlinkPath(root, artifact);
    const metadata = await lstat(target);
    return metadata.isFile() && !metadata.isSymbolicLink() ? 'ok' : 'unsafe';
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    return 'unsafe';
  }
}

async function validateExperienceFeedback(root, state, manifest, experienceIndex, issues) {
  const feedback = state.experience_feedback;
  const completionLike = COMPLETION_PHASES.has(String(state.phase ?? '').toUpperCase());
  if (!feedback || feedback.disposition === 'pending') {
    if (completionLike) {
      issues.push(issue(
        'pending-experience-feedback',
        'Completion-like checkpoint requires a captured, already-encoded, or not-reusable experience disposition',
      ));
    }
    return;
  }
  if (typeof feedback !== 'object' || Array.isArray(feedback)) {
    issues.push(issue('invalid-experience-feedback', 'Checkpoint experience_feedback must be a mapping'));
    return;
  }

  const trigger = feedback.trigger;
  const disposition = feedback.disposition;
  const reason = typeof feedback.reason === 'string' ? feedback.reason.trim() : '';
  const artifacts = feedback.artifacts;
  const invalid =
    !VALID_TRIGGERS.has(trigger) ||
    !VALID_DISPOSITIONS.has(disposition) ||
    !reason ||
    !Array.isArray(artifacts) ||
    (CAPTURE_TRIGGERS.has(trigger) && !['captured', 'not-reusable'].includes(disposition)) ||
    (trigger === 'repeat-proven-path' && disposition !== 'already-encoded') ||
    (trigger === 'routine-non-path' && disposition !== 'not-reusable') ||
    (disposition !== 'not-reusable' && artifacts.length === 0) ||
    (disposition === 'not-reusable' && artifacts.length !== 0);
  if (invalid) {
    issues.push(issue(
      'invalid-experience-feedback',
      'Checkpoint experience_feedback trigger, disposition, reason, and artifacts are inconsistent',
    ));
    return;
  }

  const indexedArtifacts = new Set(
    (experienceIndex?.entries ?? [])
      .filter((entry) => entry.status !== 'obsolete')
      .flatMap((entry) => entry.artifacts)
      .map(normalizedArtifactPath),
  );
  const requiresIndex = disposition === 'captured' || disposition === 'already-encoded';

  for (const artifact of artifacts) {
    if (typeof artifact !== 'string' || !artifact.trim()) {
      issues.push(issue('invalid-experience-feedback', 'Experience artifact paths must be non-empty strings'));
      continue;
    }
    const artifactStatus = await feedbackArtifactStatus(root, artifact);
    if (artifactStatus === 'escape') {
      issues.push(issue('experience-artifact-escape', 'Experience artifact path must stay inside the project'));
    } else if (artifactStatus === 'missing') {
      issues.push(issue('missing-experience-artifact', 'Missing experience artifact'));
    } else if (artifactStatus !== 'ok') {
      issues.push(issue('unsafe-experience-artifact', 'Experience artifact must be a safe project-contained regular non-linked file'));
    }
    if (artifactStatus === 'ok' && /\.md$/i.test(artifact)) {
      const normalizedArtifact = portablePath(artifact).replace(/^\.\//, '');
      const declaredSources = manifest.truth_index
        ? []
        : [manifest.goal_source, manifest.intent_contract, ...flattenSources(manifest.sources)]
          .filter(Boolean)
          .map((source) => portablePath(source).replace(/^\.\//, '').replace(/\/+$/, ''));
      const routed = indexedArtifacts.has(normalizedArtifactPath(artifact)) || declaredSources.some(
        (source) => normalizedArtifact === source || normalizedArtifact.startsWith(`${source}/`),
      );
      if (!routed) {
        issues.push(issue(
          'unrouted-experience-artifact',
          `Captured Markdown experience artifact is not routed by the project manifest: ${artifact}`,
        ));
      }
    }
    if (artifactStatus === 'ok'
      && requiresIndex
      && !isBuiltInExperienceArtifact(artifact)
      && !indexedArtifacts.has(normalizedArtifactPath(artifact))) {
      issues.push(issue(
        'unindexed-experience-artifact',
        `Reusable experience artifact is not indexed: ${artifact}`,
      ));
    }
  }
}

async function readTruthIndex(root, manifest, issues) {
  const relativePath = manifest.truth_index;
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    issues.push(issue('missing-truth-index-field', 'Manifest truth_index is required'));
    return null;
  }
  const entry = await projectEntryStatus(root, relativePath);
  if (entry.status === 'escape') {
    issues.push(issue('truth-index-escape', 'Truth index path must stay inside the project'));
    return null;
  }
  if (entry.status === 'missing') {
    issues.push(issue('missing-truth-index', 'Missing project truth map declared by the manifest'));
    return null;
  }
  if (entry.status !== 'ok') {
    issues.push(issue('unsafe-truth-index', unsafeAuthorityMessage('Truth index')));
    return null;
  }
  try {
    const parsed = parseTruthMap(await readFile(entry.target, 'utf8'));
    for (const problem of await validateConfirmedTruth(root, parsed)) {
      issues.push(issue(
        problem.code,
        problem.code === 'missing-confirmed-truth'
          ? `Confirmed project truth is missing: ${problem.path}`
          : `Confirmed project truth is unsafe: ${problem.path}`,
      ));
    }
    return parsed;
  } catch {
    issues.push(issue('invalid-truth-index', 'Invalid project truth map. Preserve it, repair the reported structure, and rerun vibetether doctor.'));
    return null;
  }
}

function controlPlaneSummary(issues, warnings) {
  const areas = {
    bootstrap: ['manifest', 'harness', 'instructions', 'managed-block', 'skill', 'recovery'],
    intent: ['intent'],
    truth: ['truth', 'source', 'authority'],
    state: ['checkpoint'],
    routing: ['route', 'capability', 'project-routes'],
    experience: ['experience'],
    providers: ['provider', 'catalog', 'license'],
  };
  return Object.fromEntries(Object.entries(areas).map(([area, tokens]) => {
    const has = (entries) => entries.some((entry) => tokens.some((token) => entry.code.includes(token)));
    return [area, has(issues) ? 'error' : has(warnings) ? 'attention' : 'healthy'];
  }));
}

async function validateAuthoritySnapshot(root, manifest, truth, state, issues, warnings) {
  const snapshot = state.authority_snapshot;
  const completionLike = COMPLETION_PHASES.has(String(state.phase ?? '').toUpperCase());
  if (!snapshot) {
    (completionLike ? issues : warnings).push((completionLike ? issue : warning)(
      'authority-snapshot-not-established',
      'Run a full VibeTether route re-anchor so the checkpoint records current project truth fingerprints.',
    ));
    return;
  }
  const hash = /^[a-f0-9]{64}$/;
  const valid = typeof snapshot.anchored_at === 'string'
    && snapshot.truth_index?.path === manifest.truth_index
    && hash.test(snapshot.truth_index?.sha256 ?? '')
    && Array.isArray(snapshot.confirmed_sources)
    && snapshot.confirmed_sources.every((entry) => (
      typeof entry?.path === 'string'
      && typeof entry?.role === 'string'
      && typeof entry?.scope === 'string'
      && hash.test(entry?.sha256 ?? '')
    ));
  if (!valid) {
    issues.push(issue('invalid-authority-snapshot', 'Checkpoint authority_snapshot is structurally invalid.'));
    return;
  }
  let current;
  try {
    current = await createAuthoritySnapshot(root, manifest, snapshot.anchored_at);
  } catch {
    issues.push(issue('invalid-authority-snapshot', 'Current project authority cannot be fingerprinted safely.'));
    return;
  }
  if (snapshot.truth_index.sha256 !== current.truth_index.sha256) {
    issues.push(issue('changed-truth-index', 'Project truth map changed after the last full re-anchor.'));
  }
  if ((snapshot.intent?.sha256 ?? null) !== (current.intent?.sha256 ?? null)) {
    issues.push(issue('changed-intent-contract', 'Intent Contract changed after the last full re-anchor.'));
  }
  const currentSources = new Map(current.confirmed_sources.map((entry) => [entry.path, entry]));
  const snapshotSources = new Map(snapshot.confirmed_sources.map((entry) => [entry.path, entry]));
  for (const entry of truth?.confirmed ?? []) {
    const before = snapshotSources.get(entry.path);
    const after = currentSources.get(entry.path);
    if (!before || !after || before.sha256 !== after.sha256 || before.role !== entry.role || before.scope !== entry.scope) {
      issues.push(issue('changed-confirmed-truth', `Confirmed project truth changed after the last full re-anchor: ${entry.path}`));
    }
  }
}

async function readExperienceIndex(root, manifest, issues) {
  const relativePath = manifest.experience_index;
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    issues.push(issue('missing-experience-index-field', 'Manifest experience_index is required'));
    return null;
  }
  const entry = await projectEntryStatus(root, relativePath);
  if (entry.status === 'escape') {
    issues.push(issue('experience-index-escape', 'Experience index path must stay inside the project'));
    return null;
  }
  if (entry.status === 'missing') {
    issues.push(issue('missing-experience-index', 'Missing experience index declared by the project manifest'));
    return null;
  }
  if (entry.status !== 'ok') {
    issues.push(issue(
      'invalid-experience-index',
      'Experience index must be a safe project-contained regular non-linked file. Fix the index and rerun vibetether doctor.',
    ));
    return null;
  }
  try {
    const index = parseExperienceIndex(await readFile(entry.target, 'utf8'));
    await validateExperienceIndex(index, root);
    return index;
  } catch {
    issues.push(issue(
      'invalid-experience-index',
      'Cannot validate experience index. Fix the index and rerun vibetether doctor.',
    ));
    return null;
  }
}

async function readYamlArtifact(root, relativePath, label, issues) {
  if (!relativePath) {
    issues.push(issue(`missing-${label}-field`, `Manifest ${label.replaceAll('-', '_')} is required`));
    return null;
  }
  const entry = await projectEntryStatus(root, relativePath);
  if (entry.status === 'escape') {
    issues.push(issue(`${label}-escape`, `${label} path escapes the project`));
    return null;
  }
  if (entry.status === 'missing') {
    issues.push(issue(`missing-${label}`, `Missing ${label}`));
    return null;
  }
  if (entry.status !== 'ok') {
    issues.push(issue(`unsafe-${label}`, unsafeAuthorityMessage(label.replaceAll('-', ' '))));
    return null;
  }
  try {
    const value = YAML.parse(await readFile(entry.target, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('document must be a mapping');
    return value;
  } catch {
    issues.push(issue(
      `invalid-${label}`,
      `Invalid ${label} YAML. Fix the document and rerun vibetether doctor.`,
    ));
    return null;
  }
}

async function readRouteHandshake(root, issues) {
  const entry = await projectEntryStatus(root, ROUTE_HANDSHAKE_PATH);
  if (entry.status === 'missing') return null;
  if (entry.status !== 'ok') {
    issues.push(issue('invalid-route-handshake', unsafeAuthorityMessage('Route handshake')));
    return null;
  }
  try {
    const value = YAML.parse(await readFile(entry.target, 'utf8'));
    const valid = value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.schema_version === 1
      && ['codex', 'claude'].includes(value.agent)
      && typeof value.phase === 'string'
      && typeof value.capability === 'string'
      && Array.isArray(value.signals)
      && typeof value.selected_skill === 'string'
      && ['active', 'satisfied', 'abandoned'].includes(value.status);
    if (!valid) throw new Error('invalid handshake');
    return value;
  } catch {
    issues.push(issue('invalid-route-handshake', 'Route handshake is structurally invalid; rerun the current phase route.'));
    return null;
  }
}

function routeCandidates(result) {
  return [result.recommendation, ...(result.alternatives ?? [])].filter(Boolean);
}

async function validateRouteControlState({ root, manifest, baseBoard, checkpoint, issues, warnings }) {
  let board;
  try {
    board = (await loadEffectiveProjectRoutes(root, manifest, baseBoard)).board;
    board = await refreshBoardAvailability(board, root);
  } catch (error) {
    const ambiguous = /equally matching primary|duplicate project route id/i.test(error.message);
    issues.push(issue(
      ambiguous ? 'ambiguous-local-route' : 'invalid-project-routes',
      ambiguous
        ? 'Project routes contain an ambiguous local primary; make phase, capability, and signals deterministic.'
        : 'Project routes are missing, unsafe, or invalid; fix routes.local.yaml and rerun doctor.',
    ));
    return;
  }

  const handshake = await readRouteHandshake(root, issues);
  const completionLike = COMPLETION_PHASES.has(String(checkpoint?.phase ?? '').toUpperCase());
  if (!handshake) {
    if (completionLike) {
      issues.push(issue(
        'missing-route-handshake',
        'Completion-like checkpoint requires a current satisfied phase route handshake.',
      ));
    } else if (checkpoint) {
      warnings.push(warning(
        'route-handshake-not-established',
        'Establish a route handshake before the next consequential phase transition.',
      ));
    }
    return;
  }

  const checkpointPhase = String(checkpoint?.phase ?? '').toUpperCase();
  if (checkpointPhase && checkpointPhase !== handshake.phase) {
    issues.push(issue(
      handshake.status === 'active' ? 'pending-route-exit' : 'stale-route-handshake',
      handshake.status === 'active'
        ? 'The active route must be completed or abandoned before the checkpoint advances phases.'
        : 'The route handshake phase does not match the current checkpoint phase.',
    ));
  } else if (completionLike && handshake.status === 'active') {
    issues.push(issue(
      'pending-route-exit',
      'Completion-like checkpoint requires the active route to be completed or abandoned.',
    ));
  }

  let result;
  try {
    result = resolveBoardRoute(board, {
      phase: handshake.phase,
      capability: handshake.capability,
      signals: handshake.signals,
      harness: handshake.agent,
    });
  } catch {
    issues.push(issue(
      'route-selection-mismatch',
      'The saved route no longer resolves against the effective capability board.',
    ));
    return;
  }

  const candidates = routeCandidates(result);
  const selectedCandidate = candidates.find((candidate) => candidate.skill === handshake.selected_skill);
  const effectiveSelection = result.selection?.skill;
  const localRoute = (board.project_routes ?? []).find((route) => route.id === handshake.route_id);
  if (handshake.selection_source === 'project-local' && !localRoute) {
    issues.push(issue(
      'route-source-missing',
      'The selected project-local route no longer exists; rerun the current phase route.',
    ));
  }
  if (localRoute && !(localRoute.available_in ?? []).includes(handshake.agent)) {
    issues.push(issue(
      'selected-skill-unavailable',
      'The selected project-local Skill is no longer available in the recorded agent harness.',
    ));
  } else if (selectedCandidate && selectedCandidate.available === false) {
    issues.push(issue(
      'selected-skill-unavailable',
      'The selected Skill is no longer available in the recorded agent harness.',
    ));
  }

  const justifiedAlternative = Boolean(
    handshake.alternative_reason
      && selectedCandidate
      && selectedCandidate.available === true,
  );
  if (handshake.selected_skill !== effectiveSelection && !justifiedAlternative) {
    issues.push(issue(
      'route-selection-mismatch',
      'The selected Skill no longer matches the effective route and has no valid alternative reason.',
    ));
  }
}

export async function inspectProject(options) {
  let root;
  try {
    root = await realpath(path.resolve(options.project));
  } catch {
    throw new CliError(`Project directory does not exist: ${options.project}`);
  }
  const issues = [];
  const warnings = [];
  let manifest = null;
  const manifestEntry = await projectEntryStatus(root, '.vibetether/project.yaml');
  if (manifestEntry.status === 'missing') {
    issues.push(issue('missing-manifest', 'Missing .vibetether/project.yaml'));
  } else if (manifestEntry.status !== 'ok') {
    issues.push(issue('unsafe-manifest', unsafeAuthorityMessage('Manifest')));
  } else {
    try {
      manifest = parseCanonicalManifest(await readFile(manifestEntry.target, 'utf8'));
    } catch {
      issues.push(issue('invalid-manifest', 'Invalid manifest YAML. Use the canonical VibeTether manifest format and rerun vibetether doctor.'));
    }
  }

  if (manifest && manifest.schema_version !== 1) {
    issues.push(issue('unsupported-schema', `Expected schema_version 1, found ${manifest.schema_version ?? 'none'}`));
  }

  const pendingRecoveryHarnesses = new Set();
  const recoveryHarnesses = manifest
    ? Object.entries(manifest.harnesses ?? {})
        .filter(([name, harness]) => harness?.enabled && ADAPTERS[name])
        .map(([name]) => name)
    : Object.keys(ADAPTERS);
  for (const harness of recoveryHarnesses) {
    try {
      const recovery = await inspectSkillRecovery(root, harness);
      if (!recovery) continue;
      if (recovery.kind === 'pending-skill-upgrade') {
        pendingRecoveryHarnesses.add(harness);
        warnings.push(warning(
          'pending-skill-upgrade',
          `A verified ${harness} Skill upgrade is waiting for host release. Close Codex and Claude, then rerun init.`,
        ));
      } else if (recovery.kind === 'recoverable-missing-skill') {
        warnings.push(warning(
          'recoverable-missing-skill',
          `The missing ${harness} Skill has one authoritative recovery candidate. Rerun init before other work.`,
        ));
      } else if (recovery.kind === 'ambiguous-recovery') {
        issues.push(issue(
          'ambiguous-recovery',
          `Multiple verified ${harness} Skill recovery candidates remain and none has unique peer authority.`,
        ));
      } else {
        issues.push(issue(
          'unrecoverable-skill-state',
          `The missing ${harness} Skill has only modified, linked, or unknown recovery candidates.`,
        ));
      }
    } catch {
      issues.push(issue('unrecoverable-skill-state', `Cannot validate ${harness} Skill recovery state.`));
    }
  }

  if (manifest) {
    let checkpointState = null;
    if (!manifest.intent_contract) {
      issues.push(issue('missing-intent-contract', 'Manifest intent_contract is required'));
    }
    const truth = await readTruthIndex(root, manifest, issues);
    const declared = [
      manifest.intent_contract,
      ...(truth ? truth.confirmed.map((entry) => entry.path) : flattenSources(manifest.sources)),
    ].filter(Boolean);
    for (const source of [...new Set(declared)]) {
      const sourceEntry = await projectEntryStatus(root, source, 'any');
      if (sourceEntry.status === 'escape') {
        issues.push(issue('source-escape', 'Declared source escapes the project'));
      } else if (sourceEntry.status === 'missing') {
        issues.push(issue('missing-source', 'Missing declared source'));
      } else if (sourceEntry.status !== 'ok') {
        issues.push(issue('unsafe-source', unsafeAuthorityMessage('Declared source', 'any')));
      }
    }

    for (const [name, harness] of Object.entries(manifest.harnesses ?? {})) {
      if (!harness?.enabled) continue;
      const adapter = ADAPTERS[name];
      if (!adapter) {
        issues.push(issue('unknown-harness', 'Unknown enabled harness in the project manifest'));
        continue;
      }
      const instructionRelativePath = harness.instruction_file ?? adapter.instructionFile;
      const instructionEntry = await projectEntryStatus(root, instructionRelativePath);
      if (instructionEntry.status === 'missing') {
        issues.push(issue('missing-instructions', `Missing instruction file for ${name}`));
      } else if (instructionEntry.status !== 'ok') {
        issues.push(issue('unsafe-instructions', unsafeAuthorityMessage('Instruction file')));
      } else {
        const instructions = await readFile(instructionEntry.target, 'utf8');
        const starts = instructions.split(MANAGED_START).length - 1;
        const ends = instructions.split(MANAGED_END).length - 1;
        if (starts !== 1 || ends !== 1) {
          issues.push(issue('invalid-managed-block', 'Expected one VibeTether managed block in the instruction file'));
        } else if (managedBlockBody(instructions) !== adapter.managedBody.trim()) {
          issues.push(issue('changed-managed-block', 'VibeTether managed block changed in the instruction file'));
        }
      }
      const skillDirectory = await projectEntryStatus(root, adapter.skillDirectory, 'directory');
      const skillEntry = await projectEntryStatus(root, path.join(adapter.skillDirectory, 'SKILL.md'));
      if (skillDirectory.status === 'missing' || skillEntry.status === 'missing') {
        issues.push(issue('missing-skill', `Missing installed Skill for ${name}`));
      } else if (skillDirectory.status !== 'ok' || skillEntry.status !== 'ok') {
        issues.push(issue('unsafe-skill', unsafeAuthorityMessage('Installed Skill', 'directory')));
      } else {
        try {
          const identity = await inspectVibeTetherIdentity(skillDirectory.target);
          if (identity.state === 'legacy') {
            warnings.push(warning('legacy-skill', `Installed Skill for ${name} is a registered canonical earlier release; rerun init to upgrade it.`));
          } else if (identity.state === 'unknown') {
            issues.push(issue('changed-skill', `Installed Skill changed for ${name}`));
          }
        } catch {
          issues.push(issue('invalid-skill', `Cannot verify installed Skill for ${name}`));
        }
      }
    }

    const experienceIndex = await readExperienceIndex(root, manifest, issues);
    const board = await readYamlArtifact(root, manifest.capability_board, 'capability-board', issues);
    const lock = await readYamlArtifact(root, manifest.provider_lock, 'provider-lock', issues);
    if (board) {
      try {
        assertCapabilityBoard(board);
      } catch (error) {
        issues.push(issue('invalid-capability-board', error.message));
      }
      if (board.selection_policy?.provider_selection !== 'advisory') {
        issues.push(issue('invalid-capability-policy', 'Capability board provider selection must be advisory'));
      }
    }
    if (lock) {
      const validV1 = lock.schema_version === 1 && Array.isArray(lock.sources) && Array.isArray(lock.skills);
      const validV2 =
        lock.schema_version === 2 &&
        Array.isArray(lock.sources) &&
        Array.isArray(lock.catalog) &&
        Array.isArray(lock.exposures) &&
        Array.isArray(lock.skills);
      if (!validV1 && !validV2) {
        issues.push(issue('invalid-provider-lock', 'Provider lock must use schema_version 1 or 2 and declare its provider arrays'));
      }
    }
    if (board && lock && board.profile !== lock.profile) {
      issues.push(issue('provider-profile-mismatch', 'Capability board profile does not match provider lock profile'));
    }

    const lockedExposures = Array.isArray(lock?.skills)
      ? lock.skills
      : Array.isArray(lock?.exposures)
        ? lock.exposures
        : [];
    const lockedCatalog = Array.isArray(lock?.catalog) ? lock.catalog : [];
    const lockedSources = Array.isArray(lock?.sources) ? lock.sources : [];
    const activeProviders = lockedExposures.filter((skill) => skill?.active);
    const activeSourceIds = new Set([
      ...activeProviders.map((skill) => skill?.source_id),
      ...lockedCatalog.filter((skill) => skill?.active).map((skill) => skill?.source_id),
    ]);
    for (const source of lockedSources) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        issues.push(issue('invalid-provider-lock', 'Provider lock contains an invalid source record'));
        continue;
      }
      const installation = source.license_installation;
      if (!installation?.path || !source.license_sha256) {
        if (activeSourceIds.has(source.id) && source.license_evidence?.mode !== 'readme-declaration') {
          issues.push(issue('missing-provider-license-record', 'An active provider source lacks an installed license record'));
        }
        continue;
      }
      const expectedLicensePath = `.vibetether/licenses/${source.id}.LICENSE.txt`;
      if (portablePath(installation.path) !== expectedLicensePath) {
        issues.push(issue('provider-license-path-mismatch', 'Provider license path does not match the expected project path'));
        continue;
      }
      const licenseEntry = await projectEntryStatus(root, installation.path);
      if (licenseEntry.status === 'escape') {
        issues.push(issue('provider-license-path-escape', 'Provider license path escapes the project'));
        continue;
      }
      if (licenseEntry.status === 'missing') {
        if (activeSourceIds.has(source.id)) {
          issues.push(issue('missing-provider-license', 'Missing installed license for an active provider source'));
        }
        continue;
      }
      if (licenseEntry.status !== 'ok') {
        issues.push(issue('unsafe-provider-license', unsafeAuthorityMessage('Provider license')));
        continue;
      }
      const actual = createHash('sha256').update(await readFile(licenseEntry.target)).digest('hex');
      if (actual !== source.license_sha256) {
        const managed = installation.ownership === 'vibetether';
        (managed ? issues : warnings).push((managed ? issue : warning)(
          managed ? 'changed-managed-provider-license' : 'changed-preexisting-provider-license',
          `${managed ? 'VibeTether-managed' : 'Pre-existing'} provider license changed`,
        ));
      }
    }
    const availableProviders = new Set();
    for (const skill of lockedExposures) {
      if (!skill || typeof skill !== 'object' || Array.isArray(skill)
        || !skill.id || !skill.install_name || !/^[a-f0-9]{64}$/.test(skill.fingerprint ?? '')) {
        issues.push(issue('invalid-provider-lock', 'Provider lock contains an invalid Skill record'));
        continue;
      }
      const installations = skill.installations;
      if (!installations || typeof installations !== 'object' || Array.isArray(installations)) {
        issues.push(issue('invalid-provider-installation', 'Invalid provider installation record'));
        continue;
      }
      for (const [harness, installation] of Object.entries(installations)) {
        if (!installation?.path || !['vibetether', 'preexisting'].includes(installation?.ownership)) {
          issues.push(issue('invalid-provider-installation', 'Invalid provider installation record'));
          continue;
        }
        const adapter = ADAPTERS[harness];
        const expectedPath = adapter
          ? portablePath(path.join(path.dirname(adapter.skillDirectory), skill.install_name))
          : null;
        if (!expectedPath || portablePath(installation.path) !== expectedPath) {
          issues.push(issue(
            'provider-installation-path-mismatch',
            'Provider install path does not match the expected project path',
          ));
          continue;
        }
        const providerEntry = await projectEntryStatus(root, installation.path, 'directory');
        if (providerEntry.status === 'escape') {
          issues.push(issue('provider-path-escape', 'Provider path escapes the project'));
          continue;
        }
        if (providerEntry.status === 'missing') {
          if (skill.active) {
            warnings.push(warning(
              'missing-optional-provider',
              'An optional provider is missing; use the capability board fallback and record the selection reason.',
            ));
          }
          continue;
        }
        if (providerEntry.status !== 'ok') {
          issues.push(issue('unsafe-provider', unsafeAuthorityMessage('Provider installation', 'directory')));
          continue;
        }
        try {
          const installedFingerprint = await skillFingerprint(providerEntry.target);
          if (installedFingerprint !== skill.fingerprint) {
            const managed = installation.ownership === 'vibetether';
            (managed ? issues : warnings).push((managed ? issue : warning)(
              managed ? 'changed-managed-provider' : 'changed-preexisting-provider',
              `${managed ? 'VibeTether-managed' : 'Pre-existing'} provider changed`,
            ));
          } else if (skill.active) {
            availableProviders.add(skill.id);
          }
        } catch {
          issues.push(issue('invalid-provider', 'Cannot verify provider installation'));
        }
      }
    }

    for (const skill of lockedCatalog) {
      if (!skill || typeof skill !== 'object' || Array.isArray(skill)
        || !skill.id || !skill.install_name || !/^[a-f0-9]{64}$/.test(skill.fingerprint ?? '')) {
        issues.push(issue('invalid-provider-lock', 'Provider lock contains an invalid catalog record'));
        continue;
      }
      const installation = skill.installation;
      if (!['vibetether', 'preexisting'].includes(installation?.ownership)) {
        issues.push(issue('invalid-catalog-installation', 'Catalog provider has invalid ownership metadata'));
        continue;
      }
      const expectedPath = `.vibetether/providers/catalog/${skill.source_id}/${skill.install_name}`;
      if (!installation?.path || portablePath(installation.path) !== expectedPath) {
        issues.push(issue('catalog-installation-path-mismatch', 'Catalog path does not match the expected project path'));
        continue;
      }
      const catalogEntry = await projectEntryStatus(root, installation.path, 'directory');
      if (catalogEntry.status === 'escape') {
        issues.push(issue('catalog-path-escape', 'Catalog path escapes the project'));
        continue;
      }
      if (catalogEntry.status === 'missing') {
        if (skill.active) issues.push(issue('missing-catalog-provider', 'Missing catalog provider installation'));
        continue;
      }
      if (catalogEntry.status !== 'ok') {
        issues.push(issue('unsafe-catalog-provider', unsafeAuthorityMessage('Catalog provider', 'directory')));
        continue;
      }
      try {
        const installedFingerprint = await skillFingerprint(catalogEntry.target);
        if (installedFingerprint !== skill.fingerprint) {
          const managed = installation.ownership === 'vibetether';
          (managed ? issues : warnings).push((managed ? issue : warning)(
            managed ? 'changed-managed-catalog-provider' : 'changed-preexisting-catalog-provider',
            `${managed ? 'VibeTether-managed' : 'Pre-existing'} catalog provider changed`,
          ));
        }
      } catch {
        issues.push(issue('invalid-catalog-provider', 'Cannot verify catalog provider installation'));
      }
    }

    manifest.__providerSummary = {
      active: activeProviders.length,
      available: availableProviders.size,
      total: lockedExposures.length,
    };

    const checkpoint = manifest.checkpoint;
    if (checkpoint?.path) {
      const checkpointEntry = await projectEntryStatus(root, checkpoint.path);
      if (checkpointEntry.status === 'escape') {
        issues.push(issue('checkpoint-escape', 'Checkpoint path escapes the project'));
      } else if (checkpointEntry.status === 'missing') {
        issues.push(issue('missing-checkpoint', 'Missing runtime checkpoint'));
      } else if (checkpointEntry.status !== 'ok') {
        issues.push(issue('unsafe-checkpoint', unsafeAuthorityMessage('Checkpoint')));
      } else {
        try {
          const state = YAML.parse(await readFile(checkpointEntry.target, 'utf8'));
          if (
            state?.schema_version !== 1 ||
            !state?.goal ||
            !state?.phase ||
            !state?.slice ||
            !state?.last_reanchor ||
            !state?.next_intended_action
          ) {
            issues.push(issue('invalid-checkpoint', 'Runtime checkpoint is missing required recovery fields'));
          } else {
            const updatedAt = Date.parse(state.last_reanchor);
            const maxAge = Number(checkpoint.max_age_hours ?? 168) * 60 * 60 * 1000;
            if (!Number.isFinite(updatedAt)) {
              issues.push(issue('invalid-checkpoint', 'Runtime checkpoint has an invalid last_reanchor value'));
            } else if (Date.now() - updatedAt > maxAge) {
              issues.push(issue('stale-checkpoint', `Runtime checkpoint is older than ${checkpoint.max_age_hours ?? 168} hours`));
            }
            await validateAuthoritySnapshot(root, manifest, truth, state, issues, warnings);
            await validateExperienceFeedback(root, state, manifest, experienceIndex, issues);
            checkpointState = state;
          }
        } catch {
          issues.push(issue('invalid-checkpoint', 'Cannot parse runtime checkpoint'));
        }
      }
    }
    if (checkpointState
        && COMPLETION_PHASES.has(String(checkpointState.phase ?? '').toUpperCase())
        && pendingRecoveryHarnesses.size > 0) {
      issues.push(issue(
        'pending-skill-upgrade',
        'Completion-like project state cannot retain a pending Skill upgrade transaction.',
      ));
    }
    if (board) {
      await validateRouteControlState({
        root,
        manifest,
        baseBoard: board,
        checkpoint: checkpointState,
        issues,
        warnings,
      });
    }
  }

  const harnesses = Object.entries(manifest?.harnesses ?? {})
    .filter(([name, value]) => value?.enabled && Object.hasOwn(ADAPTERS, name))
    .map(([name]) => name);
  const report = {
    ok: issues.length === 0,
    schema_version: manifest?.schema_version ?? null,
    project: root,
    harnesses,
    issues,
    warnings,
    control_plane: controlPlaneSummary(issues, warnings),
    providers: manifest?.__providerSummary ?? { active: 0, available: 0, total: 0 },
  };
  if (manifest) delete manifest.__providerSummary;
  const output = options.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : report.ok
      ? `VibeTether doctor: healthy (${harnesses.join(' + ') || 'no harnesses'})${warnings.length ? ` with ${warnings.length} warning(s):\n${warnings.map((value) => `  - [${value.code}] ${value.message}`).join('\n')}` : ''}\n`
      : `VibeTether doctor found ${issues.length} issue(s)${warnings.length ? ` and ${warnings.length} warning(s)` : ''}:\n${[...issues, ...warnings].map((value) => `  - [${value.code}] ${value.message}`).join('\n')}\n`;

  if (!report.ok) throw new CliError('Project health check failed.', 4, output, options.json ? 'stdout' : 'stderr');
  return output;
}
