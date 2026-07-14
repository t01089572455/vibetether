import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from './errors.mjs';
import { detectProjectState } from './managed-project-state.mjs';

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
  const topLevelEntries = await readdir(root, { withFileTypes: true });
  const projectState = await detectProjectState(root, topLevelEntries);
  const discovery = {};
  const bundleSignals = [];
  const addBundleSignal = (bundle, signal, signalPath, reason, confidence = 'high') => {
    bundleSignals.push({ bundle, signal, path: signalPath, confidence, reason });
  };
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

  try {
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const packages = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
    if (packages.next) addBundleSignal('web', 'nextjs', 'package.json', 'Next.js dependency detected.');
    if (packages.react) addBundleSignal('web', 'react', 'package.json', 'React dependency detected.');
    if (packages['react-native'] || packages.expo) {
      addBundleSignal('web', 'react-native', 'package.json', 'React Native or Expo dependency detected.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw new CliError(`Cannot inspect package.json for bundle evidence: ${error.message}`, 3);
  }
  if (await kind(root, 'vercel.json')) {
    addBundleSignal('web', 'vercel', 'vercel.json', 'Vercel project configuration detected.');
  }
  if (await kind(root, '.github/workflows')) {
    addBundleSignal('production', 'ci', '.github/workflows/', 'GitHub Actions workflows detected.');
  }
  for (const candidate of ['migrations', 'db/migrations', 'prisma/migrations']) {
    if (await kind(root, candidate)) {
      addBundleSignal('production', 'migration', `${candidate}/`, 'Database migration directory detected.');
      break;
    }
  }

  const instructionFiles = enabledAdapters.map((name) => (name === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'));
  for (const file of instructionFiles) {
    discovery[file] = { role: 'agent instructions', confidence: 'high', kind: 'file' };
  }

  const goalSource = direction || '.vibetether/intent.md';
  const intentContract = '.vibetether/intent.md';
  const always = [...instructionFiles];
  always.push(...contexts);
  if (!always.includes(goalSource)) always.push(goalSource);
  if (!always.includes(intentContract)) always.push(intentContract);

  discovery['.vibetether/intent.md'] = {
    role: 'intent contract',
    confidence: direction ? 'medium' : 'high',
    kind: 'file',
  };

  return {
    schema_version: 1,
    project_id: path.basename(root).toLowerCase().replace(/[^a-z0-9._-]+/g, '-'),
    project_state: projectState,
    profile,
    bundle_signals: bundleSignals,
    goal_source: goalSource,
    intent_contract: intentContract,
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
