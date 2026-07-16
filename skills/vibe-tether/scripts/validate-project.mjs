#!/usr/bin/env node

import { access, lstat, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isSafeProjectRelativeArtifactPath, isSensitiveArtifactPath } from './artifact-safety.mjs';
import { assertCapabilityBoard, validateProjectRouteDocument } from './capability-routing.mjs';
import { parseExperienceIndex } from './experience-index.mjs';
import { parseCanonicalManifest, parseCanonicalYaml } from './manifest.mjs';
import { parseProjectTruthMap } from './truth-map.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, '..');
const managedStart = '<!-- vibetether:start -->';
const managedEnd = '<!-- vibetether:end -->';
const projectRoutesPath = '.vibetether/routes.local.yaml';
const localCliPath = '.vibetether/bin/vibetether.mjs';
const routeHandshakePath = '.vibetether/state/route-handshake.yaml';
const hashPattern = /^[a-f0-9]{64}$/;
const reconciliationStatuses = new Set([
  'unknown',
  'pending',
  'candidate_pending',
  'no_material_change',
  'applied',
  'declined',
]);

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function projectEntryStatus(projectRoot, relativePath, expectedType = 'file') {
  if (typeof relativePath !== 'string') return 'invalid';
  if (!isSafeProjectRelativeArtifactPath(relativePath)) return 'escape';
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return 'escape';
  if (!relative) return 'not-file';
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') return 'missing';
      throw error;
    }
    if (metadata.isSymbolicLink()) return 'linked';
    if (current === target) {
      const matchesExpectedType = expectedType === 'file'
        ? metadata.isFile()
        : expectedType === 'directory'
          ? metadata.isDirectory()
          : metadata.isFile() || metadata.isDirectory();
      if (!matchesExpectedType) return 'not-file';
    }
  }
  return 'ok';
}

async function recursiveTextFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await recursiveTextFiles(target)));
    else if (entry.isFile() && /\.(md|mjs|yaml|yml|json)$/i.test(entry.name)) files.push(target);
  }
  return files;
}

async function validateSelf() {
  const errors = [];
  const skillPath = path.join(skillDir, 'SKILL.md');
  const skill = await readFile(skillPath, 'utf8');
  const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);

  if (!frontmatter) errors.push('SKILL.md is missing YAML frontmatter');
  if (!/^name:\s*vibe-tether$/m.test(frontmatter?.[1] ?? '')) errors.push('Skill name must be vibe-tether');
  if (!/^description:\s*Use when /m.test(frontmatter?.[1] ?? '')) errors.push('Description must start with Use when');
  if (/TODO|TBD/.test(skill)) errors.push('Skill contains unresolved placeholders');
  if (skill.split(/\r?\n/).length >= 500) errors.push('SKILL.md must stay below 500 lines');

  const references = [
    'authority-and-conflicts.md',
    'capability-routing.md',
    'checkpoint-and-drift.md',
    'project-manifest.md',
    'project-truth.md',
    'ui-control-loop.md',
  ];
  for (const reference of references) {
    if (!(await exists(path.join(skillDir, 'references', reference)))) {
      errors.push(`Missing reference: ${reference}`);
    }
  }
  if (!(await exists(path.join(skillDir, 'scripts', 'resolve-route.mjs')))) {
    errors.push('Missing deterministic route resolver: scripts/resolve-route.mjs');
  }
  for (const file of await recursiveTextFiles(skillDir)) {
    const relative = path.relative(skillDir, file);
    const content = await readFile(file, 'utf8');
    if (/[\u3400-\u9fff]/.test(content)) errors.push(`Non-public language or brand leakage in ${relative}`);
    if (/(?:^|\s)[A-Za-z]:[\\/]/m.test(content)) errors.push(`Absolute local path leakage in ${relative}`);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b/.test(content)) {
      errors.push(`Credential-like content in ${relative}`);
    }
    if (/(^|[\\/])\.env($|[.\\/])|\.(?:pem|key)$/i.test(relative)) errors.push(`Non-public artifact in ${relative}`);
  }
  return errors;
}

function parseManifest(source) {
  return parseCanonicalManifest(source);
}

function flattenSources(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenSources);
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenSources);
  return [];
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validExecutionSnapshot(snapshot) {
  if (!record(snapshot)
      || typeof snapshot.root !== 'string'
      || !snapshot.root
      || !Number.isFinite(Date.parse(snapshot.captured_at ?? ''))
      || !record(snapshot.git)
      || typeof snapshot.git.available !== 'boolean') {
    return false;
  }
  if (!snapshot.git.available) {
    return snapshot.git.worktree_root === null
      && snapshot.git.ref === null
      && snapshot.git.head === null
      && snapshot.git.status_sha256 === null
      && snapshot.git.worktree_sha256 === null;
  }
  return typeof snapshot.git.worktree_root === 'string'
    && (snapshot.git.ref === null || typeof snapshot.git.ref === 'string')
    && (snapshot.git.head === null || /^[a-f0-9]{40}$/.test(snapshot.git.head))
    && hashPattern.test(snapshot.git.status_sha256 ?? '')
    && hashPattern.test(snapshot.git.worktree_sha256 ?? '');
}

function validTruthReconciliation(value) {
  if (!record(value)
      || !reconciliationStatuses.has(value.status)
      || typeof value.trigger !== 'string'
      || !value.trigger
      || !Number.isFinite(Date.parse(value.updated_at ?? ''))
      || !(value.route_instance_id === null || (typeof value.route_instance_id === 'string' && value.route_instance_id))
      || !(value.reason === null || (typeof value.reason === 'string' && value.reason.trim()))
      || !(value.candidate_path === null
        || (typeof value.candidate_path === 'string'
          && isSafeProjectRelativeArtifactPath(value.candidate_path)
          && !isSensitiveArtifactPath(value.candidate_path)))) {
    return false;
  }
  if (['candidate_pending', 'applied', 'declined'].includes(value.status)) {
    return typeof value.candidate_path === 'string' && Boolean(value.reason);
  }
  if (value.status === 'no_material_change') return value.candidate_path === null && Boolean(value.reason);
  return value.candidate_path === null;
}

function safeDiagnosticPath(value, fallback) {
  return typeof value === 'string'
    && isSafeProjectRelativeArtifactPath(value)
    && !isSensitiveArtifactPath(value)
    ? value
    : fallback;
}

async function validateProject(projectRoot) {
  const errors = [];
  const manifestPath = path.join(projectRoot, '.vibetether', 'project.yaml');
  const manifestStatus = await projectEntryStatus(projectRoot, '.vibetether/project.yaml');
  if (manifestStatus === 'missing') return ['Missing manifest: .vibetether/project.yaml'];
  if (manifestStatus !== 'ok') return ['Manifest must be a regular non-linked file'];

  let manifest;
  try {
    manifest = parseManifest(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    return ['Invalid manifest YAML'];
  }

  if (manifest?.schema_version !== 1) errors.push('Manifest schema_version must be 1');
  if (!manifest?.project_id) errors.push('Manifest project_id is required');

  if (!manifest?.intent_contract) errors.push('Manifest intent_contract is required');
  if (!manifest?.capability_board) errors.push('Manifest capability_board is required');
  if (!manifest?.provider_lock) errors.push('Manifest provider_lock is required');
  if (!manifest?.experience_index) errors.push('Manifest experience_index is required');
  if (!manifest?.truth_index) errors.push('Manifest truth_index is required');
  if (!record(manifest?.cli)
      || manifest.cli.launcher !== localCliPath
      || !hashPattern.test(manifest.cli.launcher_sha256 ?? '')
      || typeof manifest.cli.package !== 'string'
      || !manifest.cli.package.trim()
      || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.cli.expected_version ?? '')) {
    errors.push('Manifest cli baseline is invalid');
  } else {
    const launcherStatus = await projectEntryStatus(projectRoot, manifest.cli.launcher);
    if (launcherStatus === 'missing') {
      errors.push('Missing project-local CLI launcher');
    } else if (launcherStatus !== 'ok') {
      errors.push('Project-local CLI launcher must be a regular non-linked file');
    } else {
      const launcher = await readFile(path.resolve(projectRoot, manifest.cli.launcher));
      const actual = createHash('sha256').update(launcher).digest('hex');
      if (actual !== manifest.cli.launcher_sha256) {
        errors.push('Project-local CLI launcher differs from its managed fingerprint');
      }
    }
  }
  let truth = null;
  if (manifest.truth_index) {
    const truthStatus = await projectEntryStatus(projectRoot, manifest.truth_index);
    if (truthStatus === 'escape') {
      errors.push('Truth index escapes project root');
    } else if (truthStatus === 'missing') {
      errors.push('Missing truth index');
    } else if (truthStatus !== 'ok') {
      errors.push('Truth index must be a regular non-linked file');
    } else {
      try {
        truth = parseProjectTruthMap(await readFile(path.resolve(projectRoot, manifest.truth_index), 'utf8'));
      } catch {
        errors.push('Invalid truth map');
      }
    }
  }
  const declaredSources = [
    manifest?.intent_contract,
    ...(truth ? truth.confirmed.map((entry) => entry.path) : flattenSources(manifest?.sources)),
  ].filter(Boolean);
  for (const source of [...new Set(declaredSources)]) {
    const sourceStatus = await projectEntryStatus(projectRoot, source, 'any');
    if (sourceStatus === 'escape') {
      errors.push('Declared source escapes project root');
    } else if (sourceStatus === 'missing') {
      errors.push(`${truth?.confirmed.some((entry) => entry.path === source) ? 'Missing confirmed truth' : 'Missing declared source'}: ${safeDiagnosticPath(source, 'redacted')}`);
    } else if (sourceStatus !== 'ok') {
      errors.push('Declared source must be a regular non-linked file or directory');
    }
  }

  if (manifest.capability_board) {
    const boardStatus = await projectEntryStatus(projectRoot, manifest.capability_board);
    if (boardStatus === 'escape') {
      errors.push('Capability board escapes project root');
    } else if (boardStatus === 'missing') {
      errors.push(`Missing capability board: ${safeDiagnosticPath(manifest.capability_board, 'redacted')}`);
    } else if (boardStatus !== 'ok') {
      errors.push('Capability board must be a regular non-linked file');
    } else {
      try {
        const boardPath = path.resolve(projectRoot, manifest.capability_board);
        const board = JSON.parse(await readFile(boardPath, 'utf8'));
        assertCapabilityBoard(board);
        if (board.selection_policy?.provider_selection !== 'advisory') {
          errors.push('Capability board provider selection must be advisory');
        }
        const routeDeclared = Object.hasOwn(manifest, 'project_routes');
        if (routeDeclared && manifest.project_routes !== projectRoutesPath) {
          errors.push(`Manifest project_routes must use ${projectRoutesPath}`);
        } else {
          const routeStatus = await projectEntryStatus(projectRoot, projectRoutesPath);
          if (routeStatus === 'missing' && routeDeclared) {
            errors.push(`Missing project routes: ${projectRoutesPath}`);
          } else if (!['missing', 'ok'].includes(routeStatus)) {
            errors.push('Project routes must be a regular non-linked file');
          } else if (routeStatus === 'ok') {
            try {
              const document = parseCanonicalYaml(
                await readFile(path.resolve(projectRoot, projectRoutesPath), 'utf8'),
                { allowFlowSequences: true },
              );
              validateProjectRouteDocument(document, board);
            } catch (error) {
              errors.push(error.message.startsWith('Project route')
                ? error.message
                : 'Invalid project routes');
            }
          }
        }
      } catch {
        errors.push('Invalid capability board');
      }
    }
  }
  if (manifest.provider_lock) {
    const lockStatus = await projectEntryStatus(projectRoot, manifest.provider_lock);
    if (lockStatus === 'escape') {
      errors.push('Provider lock escapes project root');
    } else if (lockStatus === 'missing') {
      errors.push(`Missing provider lock: ${safeDiagnosticPath(manifest.provider_lock, 'redacted')}`);
    } else if (lockStatus !== 'ok') {
      errors.push('Provider lock must be a regular non-linked file');
    }
  }

  if (manifest.experience_index) {
    const indexStatus = await projectEntryStatus(projectRoot, manifest.experience_index);
    if (indexStatus === 'escape') {
      errors.push('Experience index escapes project root');
    } else if (indexStatus === 'missing') {
      errors.push('Missing experience index');
    } else if (indexStatus !== 'ok') {
      errors.push('Experience index must be a regular non-linked file');
    } else {
      try {
        const indexPath = path.resolve(projectRoot, manifest.experience_index);
        const index = parseExperienceIndex(await readFile(indexPath, 'utf8'));
        for (const entry of index.entries) {
          for (const artifact of entry.artifacts) {
            if (!isSafeProjectRelativeArtifactPath(artifact) || isSensitiveArtifactPath(artifact)) {
              errors.push('Experience index contains an unsafe artifact path');
              continue;
            }
            const artifactStatus = await projectEntryStatus(projectRoot, artifact);
            if (artifactStatus === 'escape') {
              errors.push('Experience index artifact escapes project root');
            } else if (artifactStatus === 'missing') {
              errors.push('Experience index references a missing artifact');
            } else if (artifactStatus !== 'ok') {
              errors.push('Experience index artifact must be a regular non-linked file');
            }
          }
        }
      } catch {
        errors.push('Invalid experience index');
      }
    }
  }

  for (const harness of Object.values(manifest?.harnesses ?? {})) {
    if (!harness?.enabled || !harness?.instruction_file) continue;
    const instructionStatus = await projectEntryStatus(projectRoot, harness.instruction_file);
    if (instructionStatus === 'missing') {
      errors.push(`Missing instruction file: ${safeDiagnosticPath(harness.instruction_file, 'redacted')}`);
      continue;
    }
    if (instructionStatus !== 'ok') {
      errors.push('Instruction file must be a regular non-linked file');
      continue;
    }
    const instructionPath = path.resolve(projectRoot, harness.instruction_file);
    const instructions = await readFile(instructionPath, 'utf8');
    if (!instructions.includes(managedStart) || !instructions.includes(managedEnd)) {
      errors.push('Missing VibeTether managed block in instruction file');
    }
  }

  if (manifest.checkpoint?.path) {
    const checkpointStatus = await projectEntryStatus(projectRoot, manifest.checkpoint.path);
    if (checkpointStatus === 'escape') {
      errors.push('Checkpoint escapes project root');
    } else if (checkpointStatus === 'missing') {
      errors.push(`Missing checkpoint: ${safeDiagnosticPath(manifest.checkpoint.path, 'redacted')}`);
    } else if (checkpointStatus !== 'ok') {
      errors.push('Checkpoint must be a regular non-linked file');
    } else {
      const checkpointPath = path.resolve(projectRoot, manifest.checkpoint.path);
      const checkpointSource = await readFile(checkpointPath, 'utf8');
      let checkpoint = null;
      try {
        checkpoint = parseCanonicalYaml(checkpointSource, { allowFlowSequences: true });
      } catch {
        errors.push('Checkpoint YAML is invalid');
      }
      for (const field of ['goal', 'phase', 'slice', 'last_reanchor', 'next_intended_action']) {
        if (!new RegExp(`^${field}:\\s*.+$`, 'm').test(checkpointSource)) {
          errors.push(`Checkpoint is missing required field: ${field}`);
        }
      }
      for (const field of ['capability', 'recommended', 'selected', 'selection_reason', 'invocation_status']) {
        if (!new RegExp(`^  ${field}:`, 'm').test(checkpointSource)) {
          errors.push(`Checkpoint provider_selection is missing field: ${field}`);
        }
      }
      const lastReanchor = checkpointSource.match(/^last_reanchor:\s*(.+)$/m)?.[1];
      const timestamp = Date.parse(lastReanchor ?? '');
      const maxAge = Number(manifest.checkpoint.max_age_hours ?? 168) * 60 * 60 * 1000;
      if (!Number.isFinite(timestamp)) errors.push('Checkpoint has an invalid last_reanchor value');
      else if (Date.now() - timestamp > maxAge) errors.push(`Stale checkpoint: older than ${manifest.checkpoint.max_age_hours ?? 168} hours`);
      if (checkpoint && !validTruthReconciliation(checkpoint.truth_reconciliation)) {
        errors.push('Checkpoint truth_reconciliation is invalid');
      }
      if (/private_reasoning|chain[-_ ]of[-_ ]thought/i.test(checkpointSource)) {
        errors.push('Checkpoint contains a forbidden private-reasoning field');
      }
    }
  }

  const handshakeStatus = await projectEntryStatus(projectRoot, routeHandshakePath);
  if (!['missing', 'ok'].includes(handshakeStatus)) {
    errors.push('Route handshake must be a regular non-linked file');
  } else if (handshakeStatus === 'ok') {
    try {
      const handshake = parseCanonicalYaml(
        await readFile(path.resolve(projectRoot, routeHandshakePath), 'utf8'),
        { allowFlowSequences: true },
      );
      const valid = record(handshake)
        && handshake.schema_version === 1
        && typeof handshake.route_instance_id === 'string'
        && Boolean(handshake.route_instance_id)
        && ['active', 'satisfied', 'abandoned'].includes(handshake.status)
        && validExecutionSnapshot(handshake.execution_start)
        && (handshake.execution_end === undefined || validExecutionSnapshot(handshake.execution_end))
        && (handshake.truth_reconciliation === undefined
          || validTruthReconciliation(handshake.truth_reconciliation));
      if (!valid) errors.push('Route handshake lifecycle state is invalid');
    } catch {
      errors.push('Route handshake YAML is invalid');
    }
  }
  return errors;
}

function printResult(label, errors) {
  if (errors.length === 0) {
    console.log(`${label}: valid`);
    return 0;
  }
  for (const error of errors) console.error(`ERROR ${error}`);
  return 1;
}

const args = process.argv.slice(2);
let exitCode;
if (args.length === 1 && args[0] === '--self') {
  exitCode = printResult('VibeTether Skill', await validateSelf());
} else if (args.length === 2 && args[0] === '--project') {
  exitCode = printResult('VibeTether project', await validateProject(path.resolve(args[1])));
} else {
  console.error('Usage: validate-project.mjs --self | --project <path>');
  exitCode = 2;
}

process.exitCode = exitCode;
