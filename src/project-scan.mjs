import { stat } from 'node:fs/promises';
import path from 'node:path';

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

  const context = await record('CONTEXT.md', 'product context');
  const direction = await record('docs/product-direction.md', 'product direction');
  const architecture = await record('docs/adr', 'architecture decisions');
  const uiSpec = await record('docs/ui-spec.md', 'user interface specification');
  const designSystem = await record('docs/design-system.md', 'design system');
  const release = await record('docs/release-checklist.md', 'release checklist');

  const instructionFiles = enabledAdapters.map((name) => (name === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'));
  for (const file of instructionFiles) {
    discovery[file] = { role: 'agent instructions', confidence: 'high', kind: 'file' };
  }

  const goalSource = direction || '.vibetether/intent.md';
  const always = [...instructionFiles];
  if (context) always.push(context);
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
        architecture: architecture ? [architecture] : [],
        ui: [uiSpec, designSystem].filter(Boolean),
        release: release ? [release] : [],
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
