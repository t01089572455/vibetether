import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ADAPTERS, MANAGED_END, MANAGED_START } from './adapters.mjs';
import { CliError } from './errors.mjs';

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

export async function inspectProject(options) {
  let root;
  try {
    root = await realpath(path.resolve(options.project));
  } catch {
    throw new CliError(`Project directory does not exist: ${options.project}`);
  }
  const issues = [];
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
        }
      }
      if (!(await exists(skillPath))) issues.push(issue('missing-skill', `Missing installed Skill for ${name}`));
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
  };
  const output = options.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : report.ok
      ? `VibeTether doctor: healthy (${harnesses.join(' + ') || 'no harnesses'})\n`
      : `VibeTether doctor found ${issues.length} issue(s):\n${issues.map((value) => `  - [${value.code}] ${value.message}`).join('\n')}\n`;

  if (!report.ok) throw new CliError('Project health check failed.', 4, output, options.json ? 'stdout' : 'stderr');
  return output;
}
