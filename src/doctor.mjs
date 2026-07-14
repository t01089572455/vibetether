import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { ADAPTERS, MANAGED_END, MANAGED_START } from './adapters.mjs';
import { CliError } from './errors.mjs';
import { managedBlockBody } from './files.mjs';
import { skillFingerprint, sourceSkill } from './skill-install.mjs';
import { assertCapabilityBoard } from '../skills/vibe-tether/scripts/capability-routing.mjs';

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

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function issue(code, message) {
  return { level: 'error', code, message };
}

function warning(code, message) {
  return { level: 'warning', code, message };
}

function projectPath(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  return relative.startsWith('..') || path.isAbsolute(relative) ? null : target;
}

function portablePath(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

async function validateExperienceFeedback(root, state, manifest, issues) {
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
    (CAPTURE_TRIGGERS.has(trigger) && disposition !== 'captured') ||
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

  for (const artifact of artifacts) {
    if (typeof artifact !== 'string' || !artifact.trim()) {
      issues.push(issue('invalid-experience-feedback', 'Experience artifact paths must be non-empty strings'));
      continue;
    }
    const target = projectPath(root, artifact);
    if (!target) {
      issues.push(issue('experience-artifact-escape', `Experience artifact path escapes the project: ${artifact}`));
    } else if (!(await exists(target))) {
      issues.push(issue('missing-experience-artifact', `Missing experience artifact: ${artifact}`));
    }
    if (/\.md$/i.test(artifact)) {
      const normalizedArtifact = portablePath(artifact).replace(/^\.\//, '');
      const declaredSources = [manifest.goal_source, manifest.intent_contract, ...flattenSources(manifest.sources)]
        .filter(Boolean)
        .map((source) => portablePath(source).replace(/^\.\//, '').replace(/\/+$/, ''));
      const routed = declaredSources.some(
        (source) => normalizedArtifact === source || normalizedArtifact.startsWith(`${source}/`),
      );
      if (!routed) {
        issues.push(issue(
          'unrouted-experience-artifact',
          `Captured Markdown experience artifact is not routed by the project manifest: ${artifact}`,
        ));
      }
    }
  }
}

async function readYamlArtifact(root, relativePath, label, issues) {
  if (!relativePath) {
    issues.push(issue(`missing-${label}-field`, `Manifest ${label.replaceAll('-', '_')} is required`));
    return null;
  }
  const target = projectPath(root, relativePath);
  if (!target) {
    issues.push(issue(`${label}-escape`, `${label} path escapes the project: ${relativePath}`));
    return null;
  }
  if (!(await exists(target))) {
    issues.push(issue(`missing-${label}`, `Missing ${label}: ${relativePath}`));
    return null;
  }
  try {
    const value = YAML.parse(await readFile(target, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('document must be a mapping');
    return value;
  } catch (error) {
    issues.push(issue(`invalid-${label}`, `Invalid ${label} YAML: ${error.message}`));
    return null;
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
  const manifestPath = path.join(root, '.vibetether', 'project.yaml');
  let manifest = null;
  if (!(await exists(manifestPath))) {
    issues.push(issue('missing-manifest', 'Missing .vibetether/project.yaml'));
  } else {
    try {
      manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      issues.push(issue('invalid-manifest', `Invalid manifest YAML: ${error.message}`));
    }
  }

  if (manifest && manifest.schema_version !== 1) {
    issues.push(issue('unsupported-schema', `Expected schema_version 1, found ${manifest.schema_version ?? 'none'}`));
  }

  if (manifest) {
    if (!manifest.intent_contract) {
      issues.push(issue('missing-intent-contract', 'Manifest intent_contract is required'));
    }
    const declared = [manifest.goal_source, manifest.intent_contract, ...flattenSources(manifest.sources)].filter(Boolean);
    for (const source of [...new Set(declared)]) {
      const sourcePath = path.resolve(root, source);
      const relative = path.relative(root, sourcePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        issues.push(issue('source-escape', `Declared source escapes the project: ${source}`));
      } else if (!(await exists(sourcePath))) {
        issues.push(issue('missing-source', `Missing declared source: ${source}`));
      }
    }

    for (const [name, harness] of Object.entries(manifest.harnesses ?? {})) {
      if (!harness?.enabled) continue;
      const adapter = ADAPTERS[name];
      if (!adapter) {
        issues.push(issue('unknown-harness', `Unknown enabled harness: ${name}`));
        continue;
      }
      const instructionPath = path.join(root, harness.instruction_file ?? adapter.instructionFile);
      const skillPath = path.join(root, adapter.skillDirectory, 'SKILL.md');
      if (!(await exists(instructionPath))) {
        issues.push(issue('missing-instructions', `Missing instruction file for ${name}`));
      } else {
        const instructions = await readFile(instructionPath, 'utf8');
        const starts = instructions.split(MANAGED_START).length - 1;
        const ends = instructions.split(MANAGED_END).length - 1;
        if (starts !== 1 || ends !== 1) {
          issues.push(issue('invalid-managed-block', `Expected one VibeTether managed block in ${path.basename(instructionPath)}`));
        } else if (managedBlockBody(instructions) !== adapter.managedBody.trim()) {
          issues.push(issue('changed-managed-block', `VibeTether managed block changed in ${path.basename(instructionPath)}`));
        }
      }
      if (!(await exists(skillPath))) {
        issues.push(issue('missing-skill', `Missing installed Skill for ${name}`));
      } else {
        try {
          const [canonical, installed] = await Promise.all([
            skillFingerprint(sourceSkill),
            skillFingerprint(path.dirname(skillPath)),
          ]);
          if (canonical !== installed) issues.push(issue('changed-skill', `Installed Skill changed for ${name}`));
        } catch (error) {
          issues.push(issue('invalid-skill', `Cannot verify installed Skill for ${name}: ${error.message}`));
        }
      }
    }

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
      issues.push(issue('provider-profile-mismatch', `Capability board profile ${board.profile} does not match provider lock profile ${lock.profile}`));
    }

    const lockedExposures = lock?.skills ?? lock?.exposures ?? [];
    const activeProviders = lockedExposures.filter((skill) => skill.active);
    const activeSourceIds = new Set([
      ...activeProviders.map((skill) => skill.source_id),
      ...(lock?.catalog ?? []).filter((skill) => skill.active).map((skill) => skill.source_id),
    ]);
    for (const source of lock?.sources ?? []) {
      const installation = source.license_installation;
      if (!installation?.path || !source.license_sha256) {
        if (activeSourceIds.has(source.id) && source.license_evidence?.mode !== 'readme-declaration') {
          issues.push(issue('missing-provider-license-record', `Active provider source ${source.id} lacks an installed license record`));
        }
        continue;
      }
      const expectedLicensePath = `.vibetether/licenses/${source.id}.LICENSE.txt`;
      if (portablePath(installation.path) !== expectedLicensePath) {
        issues.push(issue('provider-license-path-mismatch', `Provider license path does not match source ${source.id}: ${installation.path}`));
        continue;
      }
      const target = projectPath(root, installation.path);
      if (!target) {
        issues.push(issue('provider-license-path-escape', `Provider license path escapes the project: ${installation.path}`));
        continue;
      }
      if (!(await exists(target))) {
        if (activeSourceIds.has(source.id)) {
          issues.push(issue('missing-provider-license', `Missing installed ${source.license} license for ${source.id}: ${installation.path}`));
        }
        continue;
      }
      const actual = createHash('sha256').update(await readFile(target)).digest('hex');
      if (actual !== source.license_sha256) {
        const managed = installation.ownership === 'vibetether';
        (managed ? issues : warnings).push((managed ? issue : warning)(
          managed ? 'changed-managed-provider-license' : 'changed-preexisting-provider-license',
          `${managed ? 'VibeTether-managed' : 'Pre-existing'} provider license changed at ${installation.path}`,
        ));
      }
    }
    const availableProviders = new Set();
    for (const skill of lockedExposures) {
      if (!skill?.id || !skill?.install_name || !/^[a-f0-9]{64}$/.test(skill?.fingerprint ?? '')) {
        issues.push(issue('invalid-provider-lock', `Provider lock contains an invalid Skill record: ${skill?.id ?? 'unknown'}`));
        continue;
      }
      for (const [harness, installation] of Object.entries(skill.installations ?? {})) {
        if (!installation?.path || !['vibetether', 'preexisting'].includes(installation?.ownership)) {
          issues.push(issue('invalid-provider-installation', `Invalid ${skill.install_name} installation record for ${harness}`));
          continue;
        }
        const adapter = ADAPTERS[harness];
        const expectedPath = adapter
          ? portablePath(path.join(path.dirname(adapter.skillDirectory), skill.install_name))
          : null;
        if (!expectedPath || portablePath(installation.path) !== expectedPath) {
          issues.push(issue(
            'provider-installation-path-mismatch',
            `Provider install path does not match ${harness}/${skill.install_name}: ${installation.path}`,
          ));
          continue;
        }
        const target = projectPath(root, installation.path);
        if (!target) {
          issues.push(issue('provider-path-escape', `Provider path escapes the project: ${installation.path}`));
          continue;
        }
        if (!(await exists(target))) {
          if (skill.active) {
            const fallbacks = (board?.routes ?? [])
              .filter((route) => route.recommendation?.skill === skill.install_name)
              .map((route) => route.fallback)
              .filter(Boolean);
            const fallback = [...new Set(fallbacks)].join(', ') || 'the capability board fallback';
            warnings.push(warning(
              'missing-optional-provider',
              `Optional provider ${skill.install_name} is missing for ${harness}; use fallback ${fallback} and record the selection reason.`,
            ));
          }
          continue;
        }
        try {
          const installedFingerprint = await skillFingerprint(target);
          if (installedFingerprint !== skill.fingerprint) {
            const managed = installation.ownership === 'vibetether';
            (managed ? issues : warnings).push((managed ? issue : warning)(
              managed ? 'changed-managed-provider' : 'changed-preexisting-provider',
              `${managed ? 'VibeTether-managed' : 'Pre-existing'} provider ${skill.install_name} changed at ${installation.path}`,
            ));
          } else if (skill.active) {
            availableProviders.add(skill.id);
          }
        } catch (error) {
          issues.push(issue('invalid-provider', `Cannot verify provider ${skill.install_name}: ${error.message}`));
        }
      }
    }

    for (const skill of lock?.catalog ?? []) {
      const installation = skill.installation;
      if (!skill?.id || !skill?.install_name || !/^[a-f0-9]{64}$/.test(skill?.fingerprint ?? '')) {
        issues.push(issue('invalid-provider-lock', `Provider lock contains an invalid catalog record: ${skill?.id ?? 'unknown'}`));
        continue;
      }
      if (!['vibetether', 'preexisting'].includes(installation?.ownership)) {
        issues.push(issue('invalid-catalog-installation', `Catalog provider ${skill.id} has invalid ownership metadata: ${installation?.ownership ?? 'missing'}`));
        continue;
      }
      const expectedPath = `.vibetether/providers/catalog/${skill.source_id}/${skill.install_name}`;
      if (!installation?.path || portablePath(installation.path) !== expectedPath) {
        issues.push(issue('catalog-installation-path-mismatch', `Catalog path does not match ${skill.id}: ${installation?.path ?? 'missing'}`));
        continue;
      }
      const target = projectPath(root, installation.path);
      if (!target) {
        issues.push(issue('catalog-path-escape', `Catalog path escapes the project: ${installation.path}`));
        continue;
      }
      if (!(await exists(target))) {
        if (skill.active) issues.push(issue('missing-catalog-provider', `Missing cataloged provider ${skill.id}: ${installation.path}`));
        continue;
      }
      try {
        const installedFingerprint = await skillFingerprint(target);
        if (installedFingerprint !== skill.fingerprint) {
          const managed = installation.ownership === 'vibetether';
          (managed ? issues : warnings).push((managed ? issue : warning)(
            managed ? 'changed-managed-catalog-provider' : 'changed-preexisting-catalog-provider',
            `${managed ? 'VibeTether-managed' : 'Pre-existing'} catalog provider ${skill.install_name} changed at ${installation.path}`,
          ));
        }
      } catch (error) {
        issues.push(issue('invalid-catalog-provider', `Cannot verify catalog provider ${skill.install_name}: ${error.message}`));
      }
    }

    manifest.__providerSummary = {
      active: activeProviders.length,
      available: availableProviders.size,
      total: lockedExposures.length,
    };

    const checkpoint = manifest.checkpoint;
    if (checkpoint?.path) {
      const checkpointPath = path.resolve(root, checkpoint.path);
      const relative = path.relative(root, checkpointPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        issues.push(issue('checkpoint-escape', 'Checkpoint path escapes the project'));
      } else if (!(await exists(checkpointPath))) {
        issues.push(issue('missing-checkpoint', `Missing runtime checkpoint: ${checkpoint.path}`));
      } else {
        try {
          const state = YAML.parse(await readFile(checkpointPath, 'utf8'));
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
            await validateExperienceFeedback(root, state, manifest, issues);
          }
        } catch (error) {
          issues.push(issue('invalid-checkpoint', `Cannot parse runtime checkpoint: ${error.message}`));
        }
      }
    }
  }

  const harnesses = Object.entries(manifest?.harnesses ?? {})
    .filter(([, value]) => value?.enabled)
    .map(([name]) => name);
  const report = {
    ok: issues.length === 0,
    schema_version: manifest?.schema_version ?? null,
    project: root,
    harnesses,
    issues,
    warnings,
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
