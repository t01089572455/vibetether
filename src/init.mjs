import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ADAPTERS, GITIGNORE_BODY, selectedAdapters } from './adapters.mjs';
import { CliError } from './errors.mjs';
import {
  applyManagedBlock,
  backupOnce,
  inspectManagedBlock,
  readTextIfPresent,
  rejectSymlinkPath,
  resolveInside,
  writeAtomic,
} from './files.mjs';
import { DEFAULT_INTENT, serializeManifest } from './manifest.mjs';
import { scanProject } from './project-scan.mjs';
import { installSkill } from './skill-install.mjs';

function instructionBody(adapter) {
  return ADAPTERS[adapter].managedBody;
}

export async function initialize(options) {
  let root;
  try {
    root = await realpath(path.resolve(options.project));
  } catch {
    throw new CliError(`Project directory does not exist: ${options.project}`);
  }

  const adapters = selectedAdapters(options.agent);
  const textPlans = [];
  for (const adapter of adapters) {
    const relativePath = ADAPTERS[adapter].instructionFile;
    await rejectSymlinkPath(root, relativePath);
    const target = resolveInside(root, relativePath);
    const original = await readTextIfPresent(target);
    const content = original ?? '';
    inspectManagedBlock(content, relativePath);
    textPlans.push({ relativePath, target, original, content: applyManagedBlock(content, instructionBody(adapter)) });
  }

  await rejectSymlinkPath(root, '.gitignore');
  const ignoreTarget = resolveInside(root, '.gitignore');
  const ignoreOriginal = await readTextIfPresent(ignoreTarget);
  inspectManagedBlock(ignoreOriginal ?? '', '.gitignore');
  textPlans.push({
    relativePath: '.gitignore',
    target: ignoreTarget,
    original: ignoreOriginal,
    content: applyManagedBlock(ignoreOriginal ?? '', GITIGNORE_BODY),
  });

  for (const relativePath of ['.vibetether/project.yaml', '.vibetether/intent.md']) {
    await rejectSymlinkPath(root, relativePath);
  }
  for (const adapter of adapters) {
    await rejectSymlinkPath(root, ADAPTERS[adapter].skillDirectory);
  }

  const manifest = await scanProject(root, adapters, options.profile);
  const manifestTarget = resolveInside(root, '.vibetether/project.yaml');
  const manifestOriginal = await readTextIfPresent(manifestTarget);
  textPlans.push({
    relativePath: '.vibetether/project.yaml',
    target: manifestTarget,
    original: manifestOriginal,
    content: serializeManifest(manifest),
  });

  const intentTarget = resolveInside(root, '.vibetether/intent.md');
  const intentOriginal = await readTextIfPresent(intentTarget);
  if (intentOriginal === null) {
    textPlans.push({
      relativePath: '.vibetether/intent.md',
      target: intentTarget,
      original: null,
      content: DEFAULT_INTENT,
    });
  }

  const skillPlans = adapters.map((adapter) => ({
    relativePath: ADAPTERS[adapter].skillDirectory,
    target: resolveInside(root, ADAPTERS[adapter].skillDirectory),
  }));

  if (options.dryRun) {
    const items = [...textPlans.map((item) => item.relativePath), ...skillPlans.map((item) => item.relativePath)];
    return `DRY RUN — VibeTether would initialize ${root}:\n${items.map((item) => `  - ${item}`).join('\n')}\n`;
  }

  if (!options.yes) {
    throw new CliError('Refusing to change the project without --yes. Use --dry-run to inspect the plan.');
  }

  await mkdir(resolveInside(root, '.vibetether'), { recursive: true });
  for (const plan of textPlans) {
    if (plan.original === plan.content) continue;
    await backupOnce(plan.target, plan.original);
    await writeAtomic(plan.target, plan.content);
  }
  for (const plan of skillPlans) {
    await installSkill(plan.target);
  }

  return `VibeTether initialized ${root} for ${adapters.join(' + ')} using the ${options.profile} profile.\n`;
}
