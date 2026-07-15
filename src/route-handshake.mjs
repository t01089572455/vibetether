import { lstat, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { createAuthoritySnapshot } from './authority-snapshot.mjs';
import {
  containsSecretValue,
  isSafeProjectRelativeArtifactPath,
  isSensitiveArtifactPath,
} from './artifact-safety.mjs';
import { resolveCapabilityRequest } from './capabilities.mjs';
import { CliError } from './errors.mjs';
import {
  readTextIfPresent,
  rejectSymlinkPath,
  resolveInside,
  writeAtomic,
} from './files.mjs';

export const ROUTE_HANDSHAKE_PATH = '.vibetether/state/route-handshake.yaml';
const EVIDENCE_LIMIT = 500;

async function resolveProject(project) {
  try {
    return await realpath(path.resolve(project));
  } catch {
    throw new CliError(`Project directory does not exist: ${project}`);
  }
}

function nonemptyStrings(values, label, { required = false, requiredNoun = 'value', limit = null } = {}) {
  const normalized = [...new Set(
    (values ?? [])
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter(Boolean),
  )];
  if (required && normalized.length === 0) {
    throw new CliError(`${label} requires at least one ${requiredNoun}.`);
  }
  if (limit && normalized.some((value) => value.length > limit)) {
    throw new CliError(`${label} entries must be ${limit} characters or fewer.`);
  }
  if (normalized.some(containsSecretValue)) {
    throw new CliError(`${label} must not contain credentials, private keys, or secret values.`, 3);
  }
  return normalized;
}

async function readCheckpoint(root, manifest) {
  const relativePath = manifest.checkpoint?.path;
  if (typeof relativePath !== 'string' || !relativePath) {
    throw new CliError('Manifest checkpoint route is missing. Run vibetether doctor.', 3);
  }
  await rejectSymlinkPath(root, relativePath);
  const source = await readTextIfPresent(resolveInside(root, relativePath));
  if (source === null) throw new CliError('Runtime checkpoint is missing. Run vibetether doctor.', 3);
  try {
    const value = YAML.parse(source);
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.phase !== 'string') {
      throw new Error('invalid checkpoint');
    }
    return value;
  } catch {
    throw new CliError('Runtime checkpoint is invalid. Run vibetether doctor.', 3);
  }
}

async function readManifest(root) {
  const relativePath = '.vibetether/project.yaml';
  await rejectSymlinkPath(root, relativePath);
  const source = await readTextIfPresent(resolveInside(root, relativePath));
  if (source === null) throw new CliError('Project manifest is missing. Run vibetether doctor.', 3);
  try {
    const value = YAML.parse(source);
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema_version !== 1) {
      throw new Error('invalid manifest');
    }
    return value;
  } catch {
    throw new CliError('Project manifest is invalid. Run vibetether doctor.', 3);
  }
}

async function readHandshake(root) {
  await rejectSymlinkPath(root, ROUTE_HANDSHAKE_PATH);
  const source = await readTextIfPresent(resolveInside(root, ROUTE_HANDSHAKE_PATH));
  if (source === null) return null;
  try {
    const value = YAML.parse(source);
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema_version !== 1) {
      throw new Error('invalid route handshake');
    }
    return value;
  } catch {
    throw new CliError('Route handshake is invalid. Run vibetether doctor.', 3);
  }
}

async function restoreText(target, original, operations = {}) {
  const runRm = operations.rm ?? rm;
  const runWrite = operations.writeAtomic ?? writeAtomic;
  if (original === null) await runRm(target, { force: true });
  else await runWrite(target, original);
}

export async function writeControlState(root, manifest, state, checkpoint, operations = {}) {
  const runWrite = operations.writeAtomic ?? writeAtomic;
  const checkpointPath = manifest.checkpoint?.path;
  if (typeof checkpointPath !== 'string' || !checkpointPath) {
    throw new CliError('Manifest checkpoint route is missing. Run vibetether doctor.', 3);
  }
  await rejectSymlinkPath(root, ROUTE_HANDSHAKE_PATH);
  await rejectSymlinkPath(root, checkpointPath);
  const handshakeTarget = resolveInside(root, ROUTE_HANDSHAKE_PATH);
  const checkpointTarget = resolveInside(root, checkpointPath);
  const handshakeOriginal = await readTextIfPresent(handshakeTarget);
  const checkpointOriginal = await readTextIfPresent(checkpointTarget);
  try {
    await runWrite(handshakeTarget, YAML.stringify(state, { lineWidth: 0 }));
    await runWrite(checkpointTarget, YAML.stringify(checkpoint, { lineWidth: 0 }));
  } catch (error) {
    const rollback = [];
    await restoreText(handshakeTarget, handshakeOriginal, operations).catch((failure) => rollback.push(failure.message));
    await restoreText(checkpointTarget, checkpointOriginal, operations).catch((failure) => rollback.push(failure.message));
    if (rollback.length > 0) {
      throw new CliError(`Route control update failed and rollback was incomplete (${rollback.join('; ')}).`, 3);
    }
    throw error;
  }
  return state;
}

function selectionCheckpoint(selection, result, status, reason = selection.reason) {
  return {
    capability: result.capability,
    recommended: result.recommendation?.skill ?? result.selection?.skill ?? null,
    selected: selection.skill,
    selection_reason: reason ?? null,
    invocation_status: status,
  };
}

function candidateRoutes(result) {
  const candidates = [];
  if (result.recommendation) candidates.push(result.recommendation);
  candidates.push(...(result.alternatives ?? []));
  return candidates;
}

function selectRoute(result, requested, reason) {
  if (!requested) return {
    ...result.selection,
    route_id: result.recommendation?.route_id ?? null,
    source: result.selection.source,
    alternative_reason: null,
  };
  if (!reason?.trim()) throw new CliError('--reason is required when --select is used.');
  const candidate = candidateRoutes(result).find((entry) => entry.skill === requested);
  if (!candidate || candidate.available !== true) {
    throw new CliError(`Selected Skill is not an available route alternative: ${requested}`);
  }
  return {
    skill: candidate.skill,
    source: candidate.source ?? 'curated-alternative',
    reason: reason.trim(),
    route_id: candidate.route_id ?? candidate.id ?? null,
    alternative_reason: reason.trim(),
  };
}

function formatHuman(state) {
  const lines = [
    `VibeTether route ${state.status}: ${state.phase} / ${state.capability}`,
    `Recommended: ${state.recommended_skill ?? 'built-in fallback'}`,
    `Selected: ${state.selected_skill} [${state.selection_source}]`,
    `Signals: ${(state.signals ?? []).join(', ') || 'none'}`,
    `Required outputs: ${(state.expected_outputs ?? []).join(', ') || 'none'}`,
    `Exit evidence: ${(state.exit_evidence ?? []).join(' ') || 'none'}`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function startRoute(options) {
  const resolved = await resolveCapabilityRequest(options);
  const root = resolved.root;
  const prior = await readHandshake(root);
  if (prior?.status === 'active'
      && (prior.phase !== resolved.result.phase || prior.capability !== resolved.result.capability)) {
    throw new CliError('Complete or abandon the active route before entering a new phase or capability.', 3);
  }
  const checkpoint = await readCheckpoint(root, resolved.manifest);
  if (String(checkpoint.phase).toUpperCase() !== String(resolved.result.phase).toUpperCase()) {
    throw new CliError(
      `Checkpoint phase ${checkpoint.phase} does not match route phase ${resolved.result.phase}. Re-anchor and update the semantic checkpoint first.`,
      3,
    );
  }
  const selection = selectRoute(resolved.result, options.select, options.reason);
  const now = new Date().toISOString();
  const state = {
    schema_version: 1,
    agent: options.agent,
    phase: resolved.result.phase,
    capability: resolved.result.capability,
    signals: [...(resolved.result.detected_signals ?? resolved.result.signals ?? [])],
    recommended_skill: resolved.result.recommendation?.skill ?? resolved.result.selection.skill,
    selected_skill: selection.skill,
    selection_source: selection.source,
    route_id: selection.route_id,
    alternative_reason: selection.alternative_reason,
    selection_reason: selection.reason,
    expected_outputs: [...(resolved.result.required_outputs ?? resolved.result.expected_outputs ?? [])],
    exit_evidence: [...(resolved.result.exit_evidence ?? [])],
    status: 'active',
    updated_at: now,
  };
  checkpoint.provider_selection = selectionCheckpoint(selection, resolved.result, 'active');
  checkpoint.last_reanchor = now;
  checkpoint.authority_snapshot = await createAuthoritySnapshot(root, resolved.manifest, now);
  await writeControlState(root, resolved.manifest, state, checkpoint);
  return {
    ...resolved.result,
    ...state,
    selection: { ...resolved.result.selection, ...selection },
    checkpoint_phase: checkpoint.phase,
  };
}

async function requireActiveHandshake(project) {
  const root = await resolveProject(project);
  const manifest = await readManifest(root);
  const state = await readHandshake(root);
  if (!state || state.status !== 'active') {
    throw new CliError('An active route handshake is required for this operation.', 3);
  }
  const checkpoint = await readCheckpoint(root, manifest);
  if (String(checkpoint.phase).toUpperCase() !== String(state.phase).toUpperCase()) {
    throw new CliError('Checkpoint phase and active route phase differ. Reconcile them before changing route state.', 3);
  }
  return { root, manifest, state, checkpoint };
}

async function inspectArtifact(root, artifact) {
  const portable = String(artifact).trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (!portable || !isSafeProjectRelativeArtifactPath(portable)) {
    throw new CliError('Route evidence artifact must be a safe path inside the project.', 3);
  }
  if (isSensitiveArtifactPath(portable)) {
    throw new CliError('Route evidence artifact must not reference a sensitive path.', 3);
  }
  const target = path.resolve(root, ...portable.split('/'));
  const relative = path.relative(root, target);
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') throw new CliError(`Route evidence artifact is missing: ${portable}`, 3);
      throw new CliError('Route evidence artifact cannot be inspected safely.', 3);
    }
    if (metadata.isSymbolicLink()) throw new CliError('Route evidence artifact path is linked.', 3);
    if (current !== target && !metadata.isDirectory()) {
      throw new CliError('Route evidence artifact has an unsafe ancestor.', 3);
    }
    if (current === target && !metadata.isFile()) {
      throw new CliError('Route evidence artifact must be a regular file.', 3);
    }
  }
  return portable;
}

async function artifactPaths(root, values) {
  const artifacts = [];
  for (const value of values ?? []) {
    const artifact = await inspectArtifact(root, value);
    if (!artifacts.includes(artifact)) artifacts.push(artifact);
  }
  return artifacts;
}

export async function completeRoute(options) {
  const { root, manifest, state, checkpoint } = await requireActiveHandshake(options.project);
  const evidence = nonemptyStrings(options.evidence, 'Route completion', {
    required: true,
    requiredNoun: 'evidence description',
    limit: EVIDENCE_LIMIT,
  });
  const completed = {
    ...state,
    status: 'satisfied',
    completion_evidence: evidence,
    artifacts: await artifactPaths(root, options.artifacts),
    updated_at: new Date().toISOString(),
  };
  checkpoint.provider_selection = {
    ...(checkpoint.provider_selection ?? {}),
    capability: state.capability,
    recommended: state.recommended_skill,
    selected: state.selected_skill,
    selection_reason: state.selection_reason ?? state.alternative_reason ?? null,
    invocation_status: 'satisfied',
  };
  checkpoint.last_reanchor = completed.updated_at;
  await writeControlState(root, manifest, completed, checkpoint);
  return completed;
}

export async function abandonRoute(options) {
  const { root, manifest, state, checkpoint } = await requireActiveHandshake(options.project);
  const [reason] = nonemptyStrings([options.reason], 'Route abandonment', {
    required: true,
    requiredNoun: 'material reason',
    limit: EVIDENCE_LIMIT,
  });
  const abandoned = {
    ...state,
    status: 'abandoned',
    abandonment_reason: reason,
    updated_at: new Date().toISOString(),
  };
  checkpoint.provider_selection = {
    ...(checkpoint.provider_selection ?? {}),
    capability: state.capability,
    recommended: state.recommended_skill,
    selected: state.selected_skill,
    selection_reason: reason,
    invocation_status: 'abandoned',
  };
  checkpoint.last_reanchor = abandoned.updated_at;
  await writeControlState(root, manifest, abandoned, checkpoint);
  return abandoned;
}

export async function runRoute(options) {
  const result = options.action === 'complete'
    ? await completeRoute(options)
    : options.action === 'abandon'
      ? await abandonRoute(options)
      : await startRoute(options);
  return options.json ? `${JSON.stringify(result, null, 2)}\n` : formatHuman(result);
}
