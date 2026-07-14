import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ADAPTERS, GITIGNORE_BODY, LEGACY_MANAGED_BODIES } from './adapters.mjs';
import { CliError } from './errors.mjs';
import { inspectManagedBlock, managedBlockBody, removeManagedBlock } from './files.mjs';
import { parseManifest } from './manifest.mjs';

const LEGACY_GITIGNORE_BODY = '.vibetether/state/';

function portablePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function validProviderInstallations(lock) {
  const validV1 = lock?.schema_version === 1
    && Array.isArray(lock.sources)
    && Array.isArray(lock.skills);
  const validV2 = lock?.schema_version === 2
    && Array.isArray(lock.sources)
    && Array.isArray(lock.catalog)
    && Array.isArray(lock.exposures)
    && Array.isArray(lock.skills);
  if (!validV1 && !validV2) return null;

  const allowed = [];
  for (const skill of lock.skills) {
    if (!skill || typeof skill !== 'object' || typeof skill.install_name !== 'string') return null;
    if (skill.installations !== undefined
      && (!skill.installations || typeof skill.installations !== 'object' || Array.isArray(skill.installations))) {
      return null;
    }
    for (const [harness, installation] of Object.entries(skill.installations ?? {})) {
      const adapter = ADAPTERS[harness];
      if (!adapter
        || !installation
        || typeof installation !== 'object'
        || !['vibetether', 'preexisting'].includes(installation.ownership)) {
        return null;
      }
      const expected = portablePath(path.join(path.dirname(adapter.skillDirectory), skill.install_name));
      if (portablePath(installation.path) !== expected) return null;
      if (installation.ownership === 'vibetether') allowed.push(expected);
    }
  }
  return allowed;
}

async function verifiedManagedState(root) {
  try {
    const manifest = parseManifest(await readFile(path.join(root, '.vibetether', 'project.yaml'), 'utf8'));
    let providerPaths = [];
    try {
      const lock = YAML.parse(await readFile(path.join(root, '.vibetether', 'providers.lock.yaml'), 'utf8'));
      providerPaths = validProviderInstallations(lock);
      if (providerPaths === null) return null;
    } catch (error) {
      if (error.code !== 'ENOENT') return null;
    }
    return {
      manifest,
      allowedSkillDirectories: new Set([
        ...Object.values(ADAPTERS).map((adapter) => portablePath(adapter.skillDirectory)),
        ...providerPaths,
      ]),
    };
  } catch {
    return null;
  }
}

async function managedBlockOnly(root, relativePath) {
  try {
    const content = await readFile(path.join(root, relativePath), 'utf8');
    inspectManagedBlock(content, relativePath);
    const body = managedBlockBody(content);
    const recognizedBody = relativePath === '.gitignore'
      ? body === GITIGNORE_BODY || body === LEGACY_GITIGNORE_BODY
      : body === ADAPTERS[relativePath === 'AGENTS.md' ? 'codex' : 'claude'].managedBody.trim()
        || LEGACY_MANAGED_BODIES.has(body);
    return recognizedBody && removeManagedBlock(content).trim() === '';
  } catch {
    return false;
  }
}

function relatedToAllowedDirectory(relativePath, allowedDirectories) {
  return [...allowedDirectories].some((allowed) => (
    relativePath === allowed
    || relativePath.startsWith(`${allowed}/`)
    || allowed.startsWith(`${relativePath}/`)
  ));
}

async function managedSkillTreeOnly(root, relativeRoot, allowedDirectories) {
  if (![...allowedDirectories].some((allowed) => allowed.startsWith(`${relativeRoot}/`))) return false;
  const visit = async (relativeDirectory) => {
    let entries;
    try {
      entries = await readdir(path.join(root, ...relativeDirectory.split('/')), { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!relatedToAllowedDirectory(relativePath, allowedDirectories) || !(await visit(relativePath))) return false;
      } else if (!entry.isFile()
        || ![...allowedDirectories].some((allowed) => relativePath.startsWith(`${allowed}/`))) {
        return false;
      }
    }
    return true;
  };
  return visit(relativeRoot);
}

async function detectProjectState(root, topLevelEntries) {
  const managedState = await verifiedManagedState(root);
  for (const entry of topLevelEntries) {
    if (entry.name === '.git') continue;
    if (!managedState) return 'existing';
    if (entry.name === '.vibetether' && entry.isDirectory()) continue;
    if (['AGENTS.md', 'CLAUDE.md', '.gitignore'].includes(entry.name)
      && entry.isFile()
      && await managedBlockOnly(root, entry.name)) {
      continue;
    }
    if (['.agents', '.claude'].includes(entry.name)
      && entry.isDirectory()
      && await managedSkillTreeOnly(root, entry.name, managedState.allowedSkillDirectories)) {
      continue;
    }
    return 'existing';
  }
  return 'greenfield';
}

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
