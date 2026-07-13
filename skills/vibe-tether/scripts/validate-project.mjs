#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

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

async function validateSelf() {
  const errors = [];
  const skillPath = path.join(skillDir, 'SKILL.md');
  const skill = await readFile(skillPath, 'utf8');
  const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);

  if (!frontmatter) errors.push('SKILL.md is missing YAML frontmatter');
  if (!/^name:\s*vibe-tether$/m.test(frontmatter?.[1] ?? '')) errors.push('Skill name must be vibe-tether');
  if (!/^description:\s*Use when /m.test(frontmatter?.[1] ?? '')) errors.push('Description must start with Use when');
  if (/TODO|TBD|观翌问数|DB-GPT|Trace Rail|SQL Guard/.test(skill)) errors.push('Skill contains placeholders or project-private terms');
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
  return errors;
}

function flattenSources(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenSources);
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenSources);
  return [];
}

async function validateProject(projectRoot) {
  const errors = [];
  const manifestPath = path.join(projectRoot, '.vibetether', 'project.yaml');
  if (!(await exists(manifestPath))) return [`Missing manifest: ${manifestPath}`];

  let manifest;
  try {
    manifest = YAML.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    return [`Invalid manifest YAML: ${error.message}`];
  }

  if (manifest?.schema_version !== 1) errors.push('Manifest schema_version must be 1');
  if (!manifest?.project_id) errors.push('Manifest project_id is required');

  const declaredSources = [manifest?.goal_source, manifest?.intent_contract, ...flattenSources(manifest?.sources)].filter(Boolean);
  for (const source of [...new Set(declaredSources)]) {
    const sourcePath = path.resolve(projectRoot, source);
    if (!sourcePath.startsWith(path.resolve(projectRoot))) {
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
