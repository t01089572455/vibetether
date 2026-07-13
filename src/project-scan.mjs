import { stat } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from './errors.mjs';

async function kind(root, relativePath) {
  try {
    const value = await stat(path.join(root, relativePath));
    return value.isDirectory() ? 'directory' : 'file';
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function scanProject(root, enabledAdapters, profile) {
  const discovery = {};
  const record = async (relativePath, role, confidence = 'high') => {
    const foundKind = await kind(root, relativePath);
    if (!foundKind) return false;
    const manifestPath = foundKind === 'directory' ? `${relativePath.replace(/\/$/, '')}/` : relativePath;
    discovery[manifestPath] = { role, confidence, kind: foundKind };
    return manifestPath;
  };

  const recordMany = async (candidates, role, confidence = 'medium') => {
    const found = [];
    for (const candidate of candidates) {
      const value = await record(candidate, role, confidence);
      if (value) found.push(value);
    }
    return found;
  };

  const contexts = await recordMany(['CONTEXT.md', 'docs/context.md'], 'product context');
  const directions = await recordMany(
    ['docs/product-direction.md', 'PRD.md', 'docs/PRD.md', 'docs/prd.md', 'docs/product.md'],
    'product direction',
    'high',
  );
  if (directions.length > 1) {
    throw new CliError(`Competing product direction candidates require user confirmation: ${directions.join(', ')}`, 3);
  }
  const direction = directions[0] ?? null;
  const architecture = await record('docs/adr', 'architecture decisions');
  const uiSpecs = await recordMany(
    ['docs/ui-spec.md', 'docs/ux-spec.md', 'docs/ui-design.md'],
    'user interface specification',
    'high',
  );
  if (uiSpecs.length > 1) {
    throw new CliError(`Competing UI direction candidates require user confirmation: ${uiSpecs.join(', ')}`, 3);
  }
  const designSystem = await record('docs/design-system.md', 'design system');
  const requirements = await recordMany(['docs/specs', 'docs/prd', 'specs'], 'requirements and specifications');
  const testing = await recordMany(['docs/testing.md', 'docs/test-plan.md'], 'testing contract');
  const release = await recordMany(
    ['docs/release-checklist.md', 'docs/release.md', 'RELEASE.md'],
    'release checklist',
  );

  const instructionFiles = enabledAdapters.map((name) => (name === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'));
  for (const file of instructionFiles) {
    discovery[file] = { role: 'agent instructions', confidence: 'high', kind: 'file' };
  }

  const goalSource = direction || '.vibetether/intent.md';
  const always = [...instructionFiles];
  always.push(...contexts);
  if (!always.includes(goalSource)) always.push(goalSource);

  discovery['.vibetether/intent.md'] = {
    role: 'intent contract',
    confidence: direction ? 'medium' : 'high',
    kind: 'file',
  };

  return {
    schema_version: 1,
    project_id: path.basename(root).toLowerCase().replace(/[^a-z0-9._-]+/g, '-'),
    profile,
    goal_source: goalSource,
    sources: {
      always,
      conditional: {
        requirements,
        architecture: architecture ? [architecture] : [],
        ui: [...uiSpecs, designSystem].filter(Boolean),
        testing,
        release,
      },
    },
    discovery,
    harnesses: {
      codex: { enabled: enabledAdapters.includes('codex'), instruction_file: 'AGENTS.md' },
      claude: { enabled: enabledAdapters.includes('claude'), instruction_file: 'CLAUDE.md' },
    },
    control: {
      direction_uncertainty: 'ask',
      local_reversible_technical_choices: 'autonomous',
      structural_technical_choices: 'recommend_then_confirm',
      destructive_actions: 'confirm',
      release_actions: 'confirm',
    },
    checkpoint: {
      mode: 'local',
      path: '.vibetether/state/current.yaml',
      max_age_hours: 168,
    },
  };
}
