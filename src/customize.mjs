import { realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { loadCapabilityBoard } from './capabilities.mjs';
import { CliError } from './errors.mjs';
import {
  readTextIfPresent,
  rejectSymlinkPath,
  resolveInside,
  writeAtomic,
} from './files.mjs';
import { parseManifest, serializeManifest } from './manifest.mjs';
import {
  listInstalledProjectSkills,
  parseProjectRoutes,
  PROJECT_ROUTES_PATH,
  validateProjectRoutes,
} from './project-routes.mjs';
import { createTerminalPromptAdapter } from './terminal-prompts.mjs';

const ROLES = new Set(['primary', 'alternative', 'overlay']);
const SAFE_SIGNAL = /^[a-z0-9][a-z0-9._-]*$/;

async function projectRoot(project) {
  try {
    return await realpath(path.resolve(project));
  } catch {
    throw new CliError(`Project directory does not exist: ${project}`);
  }
}

function harnesses(manifest) {
  return Object.entries(manifest.harnesses ?? {})
    .filter(([name, value]) => ['codex', 'claude'].includes(name) && value?.enabled)
    .map(([name]) => name);
}

function splitList(value, separator) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => String(entry).trim()).filter(Boolean))];
  }
  return [...new Set(String(value ?? '').split(separator).map((entry) => entry.trim()).filter(Boolean))];
}

function promptAdapter(runtime) {
  if (runtime.promptAdapter) {
    if (runtime.promptAdapter.interactive === false) {
      throw new CliError('Interactive input is unavailable. Run customize in a terminal.');
    }
    return runtime.promptAdapter;
  }
  const isTTY = typeof runtime.isTTY === 'function'
    ? Boolean(runtime.isTTY())
    : runtime.isTTY === undefined
      ? Boolean(process.stdin.isTTY && process.stdout.isTTY)
      : Boolean(runtime.isTTY);
  if (!isTTY) throw new CliError('Interactive input is unavailable. Run customize in a terminal.');
  return createTerminalPromptAdapter({ input: process.stdin, output: process.stdout });
}

function capabilityChoices(board) {
  return board.capabilities.flatMap((capability) => (capability.phases ?? []).map((phase) => ({
    value: `${phase}::${capability.id}`,
    label: `${phase} / ${capability.id}`,
    description: capability.purpose ?? `Use the existing ${capability.id} contract.`,
  })));
}

function routePreview(root, route, dryRun) {
  return [
    `${dryRun ? 'DRY RUN - ' : ''}VibeTether project route preview`,
    `Project: ${root}`,
    `Skill: ${route.skill}`,
    `Phase / capability: ${route.phases.join('/')} / ${route.capability}`,
    `Role: ${route.role}`,
    `Signals: ${route.when_any.join(', ') || 'none'}`,
    `Additional outputs: ${route.expected_outputs.join(', ') || 'none'}`,
    `Additional exit evidence: ${route.exit_evidence.join(' ') || 'none'}`,
    `Destination: ${PROJECT_ROUTES_PATH} (project-owned)`,
  ].join('\n');
}

async function readContext(root) {
  await rejectSymlinkPath(root, '.vibetether/project.yaml');
  await rejectSymlinkPath(root, PROJECT_ROUTES_PATH);
  const manifestTarget = resolveInside(root, '.vibetether/project.yaml');
  const manifestSource = await readTextIfPresent(manifestTarget);
  if (manifestSource === null) throw new CliError('VibeTether customize requires an initialized project. Run `vibetether init` first.');
  let manifest;
  try {
    manifest = parseManifest(manifestSource);
  } catch {
    throw new CliError('VibeTether customize requires a valid project manifest. Run `vibetether doctor` first.', 3);
  }
  const loaded = await loadCapabilityBoard(root);
  const installed = await listInstalledProjectSkills(root, harnesses(manifest));
  if (installed.length === 0) {
    throw new CliError('No installed project Skill is available to customize. Install a project Skill first.', 3);
  }
  const routeTarget = resolveInside(root, PROJECT_ROUTES_PATH);
  const routeSource = await readTextIfPresent(routeTarget);
  const routeDocument = routeSource === null
    ? { schema_version: 1, routes: [] }
    : validateProjectRoutes(parseProjectRoutes(routeSource), loaded.board);
  return {
    root,
    manifest,
    manifestSource,
    manifestTarget,
    board: loaded.board,
    installed,
    routeTarget,
    routeSource,
    routeDocument,
  };
}

async function collectRoute(context, prompt) {
  const skillChoices = context.installed.map(({ skill, installations }) => ({
    value: skill,
    label: skill,
    description: `Available in ${Object.keys(installations).join(' + ')}.`,
  }));
  const skill = String(await prompt.ask({
    id: 'skill',
    prompt: 'Which installed project Skill should VibeTether expose?',
    choices: skillChoices,
    recommended: skillChoices[0].value,
    required: true,
  })).trim();
  if (!skillChoices.some((choice) => choice.value === skill)) {
    throw new CliError(`Unknown installed project Skill: ${skill}`);
  }

  const phaseChoices = capabilityChoices(context.board);
  const phaseCapability = String(await prompt.ask({
    id: 'phase_capability',
    prompt: 'Which existing phase and capability should use this Skill?',
    choices: phaseChoices,
    recommended: phaseChoices[0]?.value,
    required: true,
  })).trim();
  const selectedCapability = phaseChoices.find((choice) => choice.value === phaseCapability);
  if (!selectedCapability) throw new CliError(`Unknown phase and capability choice: ${phaseCapability}`);
  const [phase, capabilityId] = phaseCapability.split('::');
  const capability = context.board.capabilities.find((entry) => entry.id === capabilityId);

  const role = String(await prompt.ask({
    id: 'role',
    prompt: 'How should this project Skill participate?',
    choices: [
      { value: 'alternative', label: 'Alternative', description: 'Keep the curated route and make this Skill selectable.' },
      { value: 'primary', label: 'Primary for matching signals', description: 'Prefer this Skill only when its observable signals match.' },
      { value: 'overlay', label: 'Additive overlay', description: 'Add a non-overlapping policy or domain method.' },
    ],
    recommended: 'alternative',
    required: true,
  })).trim();
  if (!ROLES.has(role)) throw new CliError(`Unknown project route role: ${role}`);

  const signalChoices = [
    ...(capability.invoke_when ?? []).map((signal) => ({ value: signal, label: signal })),
    {
      value: 'custom-signal',
      label: 'Enter custom signals',
      description: 'Add one or more project-specific observable signals.',
      customPrompt: {
        id: 'custom_signals',
        prompt: 'Enter comma-separated observable signal names.',
        example: 'prd-approved, migration-reviewed',
        required: true,
      },
    },
    { value: 'no-signal', label: 'No trigger signal', description: 'Use only for an alternative or overlay.' },
  ];
  const signalAnswer = await prompt.ask({
    id: 'signals',
    prompt: 'Which observable signals should activate this route?',
    choices: signalChoices,
    multiple: true,
    recommended: signalChoices[0]?.value ?? 'no-signal',
    required: true,
  });
  const signals = splitList(signalAnswer, /[,\n]/).filter((signal) => signal !== 'no-signal');
  if (signals.some((signal) => !SAFE_SIGNAL.test(signal))) {
    throw new CliError('Route signals must use safe lowercase names.');
  }
  if (role === 'primary' && signals.length === 0) {
    throw new CliError('A project-local primary requires at least one observable signal.');
  }

  const expectedOutputs = splitList(await prompt.ask({
    id: 'expected_outputs',
    prompt: 'Which additional outputs should this Skill produce?',
    help: 'Enter comma-separated output names, or leave blank for no additions.',
    required: false,
  }), /[,\n]/);
  const exitEvidence = splitList(await prompt.ask({
    id: 'exit_evidence',
    prompt: 'Which additional evidence should be present before leaving this route?',
    help: 'Enter one or more statements separated by semicolons, or leave blank.',
    required: false,
  }), /[;\n]/);

  return {
    id: `project-${skill}-${capabilityId}`,
    phases: [phase],
    capability: capabilityId,
    when_any: signals,
    skill,
    role,
    use_when: [`Use ${skill} for ${capabilityId} when ${signals.join(', ') || 'explicitly selected'} is observed.`],
    expected_outputs: expectedOutputs,
    exit_evidence: exitEvidence,
  };
}

export async function planCustomization(options, runtime = {}) {
  const root = await projectRoot(options.project);
  const context = await readContext(root);
  const prompt = promptAdapter(runtime);
  const route = await collectRoute(context, prompt);
  const next = validateProjectRoutes({
    schema_version: 1,
    routes: [...context.routeDocument.routes, route],
  }, context.board);
  return { ...context, prompt, route, next };
}

async function persistCustomization(plan) {
  const routeContent = YAML.stringify(plan.next, { lineWidth: 0 });
  const manifestContent = serializeManifest({ ...plan.manifest, project_routes: PROJECT_ROUTES_PATH });
  await writeAtomic(plan.routeTarget, routeContent);
  try {
    await writeAtomic(plan.manifestTarget, manifestContent);
  } catch (error) {
    if (plan.routeSource === null) await rm(plan.routeTarget, { force: true }).catch(() => {});
    else await writeAtomic(plan.routeTarget, plan.routeSource).catch(() => {});
    throw error;
  }
}

export async function runCustomize(options, runtime = {}) {
  const prompt = promptAdapter(runtime);
  let plan;
  try {
    plan = await planCustomization(options, { ...runtime, promptAdapter: prompt });
    const preview = routePreview(plan.root, plan.route, options.dryRun);
    if (options.dryRun) return `${preview}\n`;
    if (!await plan.prompt.confirm(preview)) {
      return 'VibeTether customization cancelled; no files were changed.\n';
    }
    await persistCustomization(plan);
    return `VibeTether added the project route to ${PROJECT_ROUTES_PATH}.\n`;
  } finally {
    await prompt.close?.();
  }
}
