#!/usr/bin/env node

import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, '..');
const managedStart = '<!-- vibetether:start -->';
const managedEnd = '<!-- vibetether:end -->';

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
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
    'ui-control-loop.md',
  ];
  for (const reference of references) {
    if (!(await exists(path.join(skillDir, 'references', reference)))) {
      errors.push(`Missing reference: ${reference}`);
    }
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

function scalar(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function topLevelScalar(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? scalar(match[1]) : undefined;
}

function sectionLines(source, section) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line === `${section}:`);
  if (start < 0) return [];
  const result = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index] && !/^\s/.test(lines[index])) break;
    result.push(lines[index]);
  }
  return result;
}

function parseManifest(source) {
  const sourceLines = sectionLines(source, 'sources');
  const sources = sourceLines
    .map((line) => line.match(/^\s+-\s+(.+)$/)?.[1])
    .filter(Boolean)
    .map(scalar);

  const harnesses = {};
  let currentHarness = null;
  for (const line of sectionLines(source, 'harnesses')) {
    const header = line.match(/^  ([a-zA-Z0-9_-]+):\s*$/);
    if (header) {
      currentHarness = header[1];
      harnesses[currentHarness] = {};
      continue;
    }
    const property = line.match(/^    ([a-zA-Z0-9_-]+):\s*(.+)$/);
    if (currentHarness && property) harnesses[currentHarness][property[1]] = scalar(property[2]);
  }

  const checkpoint = {};
  for (const line of sectionLines(source, 'checkpoint')) {
    const property = line.match(/^  ([a-zA-Z0-9_-]+):\s*(.+)$/);
    if (property) checkpoint[property[1]] = scalar(property[2]);
  }

  return {
    schema_version: topLevelScalar(source, 'schema_version'),
    project_id: topLevelScalar(source, 'project_id'),
    goal_source: topLevelScalar(source, 'goal_source'),
    intent_contract: topLevelScalar(source, 'intent_contract'),
    sources,
    harnesses,
    checkpoint,
  };
}

async function validateProject(projectRoot) {
  const errors = [];
  const manifestPath = path.join(projectRoot, '.vibetether', 'project.yaml');
  if (!(await exists(manifestPath))) return [`Missing manifest: ${manifestPath}`];

  let manifest;
  try {
    manifest = parseManifest(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    return [`Invalid manifest YAML: ${error.message}`];
  }

  if (manifest?.schema_version !== 1) errors.push('Manifest schema_version must be 1');
  if (!manifest?.project_id) errors.push('Manifest project_id is required');

  if (!manifest?.intent_contract) errors.push('Manifest intent_contract is required');
  const declaredSources = [manifest?.goal_source, manifest?.intent_contract, ...manifest.sources].filter(Boolean);
  for (const source of [...new Set(declaredSources)]) {
    const sourcePath = path.resolve(projectRoot, source);
    const relative = path.relative(path.resolve(projectRoot), sourcePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      errors.push(`Source escapes project root: ${source}`);
    } else if (!(await exists(sourcePath))) {
      errors.push(`Missing declared source: ${source}`);
    }
  }

  for (const harness of Object.values(manifest?.harnesses ?? {})) {
    if (!harness?.enabled || !harness?.instruction_file) continue;
    const instructionPath = path.join(projectRoot, harness.instruction_file);
    if (!(await exists(instructionPath))) {
      errors.push(`Missing instruction file: ${harness.instruction_file}`);
      continue;
    }
    const instructions = await readFile(instructionPath, 'utf8');
    if (!instructions.includes(managedStart) || !instructions.includes(managedEnd)) {
      errors.push(`Missing VibeTether managed block: ${harness.instruction_file}`);
    }
  }

  if (manifest.checkpoint?.path) {
    const checkpointPath = path.resolve(projectRoot, manifest.checkpoint.path);
    const relative = path.relative(path.resolve(projectRoot), checkpointPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      errors.push(`Checkpoint escapes project root: ${manifest.checkpoint.path}`);
    } else if (!(await exists(checkpointPath))) {
      errors.push(`Missing checkpoint: ${manifest.checkpoint.path}`);
    } else {
      const checkpointSource = await readFile(checkpointPath, 'utf8');
      for (const field of ['goal', 'phase', 'slice', 'last_reanchor', 'next_intended_action']) {
        if (!new RegExp(`^${field}:\\s*.+$`, 'm').test(checkpointSource)) {
          errors.push(`Checkpoint is missing required field: ${field}`);
        }
      }
      const lastReanchor = checkpointSource.match(/^last_reanchor:\s*(.+)$/m)?.[1];
      const timestamp = Date.parse(lastReanchor ?? '');
      const maxAge = Number(manifest.checkpoint.max_age_hours ?? 168) * 60 * 60 * 1000;
      if (!Number.isFinite(timestamp)) errors.push('Checkpoint has an invalid last_reanchor value');
      else if (Date.now() - timestamp > maxAge) errors.push(`Stale checkpoint: older than ${manifest.checkpoint.max_age_hours ?? 168} hours`);
      if (/private_reasoning|chain[-_ ]of[-_ ]thought/i.test(checkpointSource)) {
        errors.push('Checkpoint contains a forbidden private-reasoning field');
      }
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
