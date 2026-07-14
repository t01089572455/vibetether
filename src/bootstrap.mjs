import { realpath } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { selectedAdapters } from './adapters.mjs';
import {
  buildBootstrapModel,
  parseIntentContract,
  renderIntentContract,
} from './bootstrap-model.mjs';
import { validateBootstrapAuthority } from './bootstrap-authority.mjs';
import { CliError } from './errors.mjs';
import { readTextIfPresent, resolveInside } from './files.mjs';
import { initialize } from './init.mjs';
import { validateProviderLock } from './managed-project-state.mjs';
import { parseManifest } from './manifest.mjs';
import { scanProject } from './project-scan.mjs';
import { loadProviderRegistry } from './provider-registry.mjs';
import { createTerminalPromptAdapter } from './terminal-prompts.mjs';

const AGENTS = new Set(['codex', 'claude', 'both']);
const PROFILES = new Set(['core', 'standard', 'extended']);
const QUESTION_FIELDS = {
  goal: 'goal',
  success_evidence: 'successEvidence',
  scope_boundaries: 'scopeBoundaries',
  visual_direction: 'visualDirection',
};

async function projectRoot(project) {
  try {
    return await realpath(path.resolve(project));
  } catch {
    throw new CliError(`Project directory does not exist: ${project}`);
  }
}

function terminalIsInteractive(runtime) {
  if (typeof runtime.isTTY === 'function') return Boolean(runtime.isTTY());
  if (runtime.isTTY !== undefined) return Boolean(runtime.isTTY);
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function promptForInteractive(runtime) {
  if (runtime.promptAdapter) {
    if (runtime.promptAdapter.interactive === false) {
      throw new CliError('Interactive input is unavailable. Use --dry-run to inspect the plan or --yes for deterministic automation.');
    }
    return runtime.promptAdapter;
  }
  if (!terminalIsInteractive(runtime)) {
    throw new CliError('Interactive input is unavailable. Use --dry-run to inspect the plan or --yes for deterministic automation.');
  }
  return createTerminalPromptAdapter({ input: process.stdin, output: process.stdout });
}

function cleanupWarning(result, error) {
  const output = typeof result === 'string' ? result.trimEnd() : String(result ?? '').trimEnd();
  const detail = error instanceof Error ? error.message : String(error);
  return `${output}${output ? '\n' : ''}Warning: Prompt cleanup failed: ${detail}\n`;
}

async function withPromptCleanup(promptAdapter, operation) {
  let result;
  try {
    result = await operation();
  } catch (primaryError) {
    try {
      await promptAdapter.close?.();
    } catch {
      // Cleanup is best-effort and must never replace the primary failure.
    }
    throw primaryError;
  }
  try {
    await promptAdapter.close?.();
  } catch (cleanupError) {
    return cleanupWarning(result, cleanupError);
  }
  return result;
}

async function existingIntent(root) {
  const source = await readTextIfPresent(resolveInside(root, '.vibetether/intent.md'));
  if (source === null) return { source: null, input: {} };
  try {
    return { source, input: parseIntentContract(source) };
  } catch (error) {
    throw new CliError(`Intent Contract conflict in .vibetether/intent.md: ${error.message}`, 3);
  }
}

function nonemptyStrings(values) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function mergeDirection(prior, options) {
  const explicit = options.explicit ?? {};
  const merged = { ...prior };
  if (explicit.goal) merged.goal = options.goal;
  if (explicit.successEvidence) merged.successEvidence = options.successEvidence;
  if (explicit.scopeBoundaries) {
    const values = nonemptyStrings(options.scopeBoundaries);
    if (values.length > 0) merged.scopeBoundaries = values;
  }
  if (explicit.constraints) {
    const values = nonemptyStrings(options.constraints);
    if (values.length > 0) merged.constraints = values;
  }
  if (explicit.visualDirection) merged.visualDirection = options.visualDirection;
  return merged;
}

function hasExplicitDirection(options) {
  const explicit = options.explicit ?? {};
  return ['goal', 'successEvidence', 'scopeBoundaries', 'constraints', 'visualDirection']
    .some((field) => explicit[field]);
}

function validateSharedConfiguration(options) {
  if (options.profile === 'core' && (options.bundles ?? []).length > 0) {
    throw new CliError('The core profile cannot be combined with --bundle because core is provider-free.');
  }
}

async function askDirection(model, discovery, input, promptAdapter) {
  const answers = { ...input };
  for (const question of model.questions) {
    const answer = await promptAdapter.ask(question);
    answers[QUESTION_FIELDS[question.id]] = typeof answer === 'string' ? answer.trim() : answer;
  }
  const resolved = buildBootstrapModel({ discovery, input: answers });
  if (!resolved.ready) {
    throw new CliError('Goal and success evidence must be nonempty before applying interactive project direction.');
  }
  return resolved;
}

function sameAnswers(discovery, priorInput, model) {
  const prior = buildBootstrapModel({ discovery, input: priorInput });
  return JSON.stringify(prior.answers) === JSON.stringify(model.answers);
}

function proposedIntent({ discovery, prior, model }) {
  if (prior.source !== null
      && isConfirmedIntent(prior.source)
      && sameAnswers(discovery, prior.input, model)) return prior.source;
  return renderIntentContract(model.answers);
}

function isConfirmedIntent(source) {
  const normalized = String(source ?? '').replaceAll('\r\n', '\n');
  return normalized.startsWith('# VibeTether Intent Contract\n\nStatus: confirmed\n');
}

function confirmationSummary(priorSource, proposal, preview) {
  const sections = [];
  if (priorSource !== null && priorSource !== proposal) {
    sections.push(`Prior Intent Contract:\n\n${priorSource.trimEnd()}`);
  }
  sections.push(`Proposed Intent Contract:\n\n${proposal.trimEnd()}`);
  sections.push(`Planned changes and provider activity:\n\n${preview.trimEnd()}`);
  return sections.join('\n\n');
}

async function recommendedAgent(root) {
  const agents = await readTextIfPresent(resolveInside(root, 'AGENTS.md'));
  const claude = await readTextIfPresent(resolveInside(root, 'CLAUDE.md'));
  if (agents !== null && claude === null) return 'codex';
  if (claude !== null && agents === null) return 'claude';
  return 'both';
}

async function recommendedProfile(root) {
  const source = await readTextIfPresent(resolveInside(root, '.vibetether/project.yaml'));
  if (source === null) return 'standard';
  try {
    const profile = parseManifest(source).profile;
    return PROFILES.has(profile) ? profile : 'standard';
  } catch {
    return 'standard';
  }
}

async function interactiveInit(options, promptAdapter, dependencies) {
  const root = await projectRoot(options.project);
  const explicit = options.explicit ?? {};
  const agentRecommendation = await recommendedAgent(root);
  const profileRecommendation = await recommendedProfile(root);
  let agent = explicit.agent ? options.agent : agentRecommendation;
  let profile = explicit.profile ? options.profile : profileRecommendation;
  let discovery = await scanProject(root, selectedAdapters(agent), profile);

  if (!explicit.agent) {
    agent = String(await promptAdapter.ask({
      id: 'agent',
      prompt: 'Which agent harness should VibeTether configure?',
      recommended: agentRecommendation,
      required: true,
    })).trim();
    if (!AGENTS.has(agent)) throw new CliError(`Invalid agent choice: ${agent}`);
  }
  if (!explicit.profile) {
    profile = String(await promptAdapter.ask({
      id: 'profile',
      prompt: 'Which VibeTether control profile should this project use?',
      recommended: profileRecommendation,
      required: true,
    })).trim();
    if (!PROFILES.has(profile)) throw new CliError(`Invalid profile choice: ${profile}`);
  }
  validateSharedConfiguration({ ...options, profile });
  if (agent !== (explicit.agent ? options.agent : agentRecommendation)
      || profile !== (explicit.profile ? options.profile : profileRecommendation)) {
    discovery = await scanProject(root, selectedAdapters(agent), profile);
  }

  const finalOptions = { ...options, agent, profile };
  const prior = await existingIntent(root);
  const input = mergeDirection(prior.input, options);
  let model = buildBootstrapModel({ discovery, input });
  model = await askDirection(model, discovery, input, promptAdapter);
  const intentContent = proposedIntent({ discovery, prior, model });
  const preview = await initialize(
    { ...finalOptions, dryRun: true, yes: false, intentContent },
    dependencies,
  );
  if (!await promptAdapter.confirm(confirmationSummary(prior.source, intentContent, preview))) {
    return 'VibeTether initialization cancelled; no project files were changed.\n';
  }
  return initialize(
    { ...finalOptions, dryRun: false, yes: true, intentContent },
    dependencies,
  );
}

async function noninteractiveInit(options, dependencies) {
  if (!hasExplicitDirection(options)) return initialize(options, dependencies);
  const root = await projectRoot(options.project);
  const prior = await existingIntent(root);
  const discovery = await scanProject(root, selectedAdapters(options.agent), options.profile);
  const model = buildBootstrapModel({ discovery, input: mergeDirection(prior.input, options) });
  return initialize({ ...options, intentContent: proposedIntent({ discovery, prior, model }) }, dependencies);
}

export async function runInit(options, runtime = {}) {
  const dependencies = runtime.initializeDependencies ?? {};
  if (options.yes || options.dryRun) return noninteractiveInit(options, dependencies);
  const promptAdapter = promptForInteractive(runtime);
  return withPromptCleanup(
    promptAdapter,
    () => interactiveInit(options, promptAdapter, dependencies),
  );
}

async function initializedProject(root) {
  const manifestSource = await readTextIfPresent(resolveInside(root, '.vibetether/project.yaml'));
  const lockSource = await readTextIfPresent(resolveInside(root, '.vibetether/providers.lock.yaml'));
  if (manifestSource === null || lockSource === null) {
    throw new CliError('VibeTether bootstrap requires an initialized project. Run `vibetether init` first.');
  }
  let manifest;
  try {
    manifest = parseManifest(manifestSource);
  } catch (error) {
    throw new CliError(`VibeTether bootstrap requires a valid manifest. Run \`vibetether init\` to repair it: ${error.message}`, 3);
  }
  let lock;
  try {
    lock = YAML.parse(lockSource);
    if (!validateProviderLock(lock)) throw new Error('the complete schema_version 1 or 2 provider contract is required');
    if (lock.bundles !== undefined && !Array.isArray(lock.bundles)) throw new Error('bundles must be an array');
  } catch (error) {
    throw new CliError(`VibeTether bootstrap requires a valid provider lock. Run \`vibetether init\` to repair it: ${error.message}`, 3);
  }
  return { manifest, lock };
}

function manifestAgent(manifest) {
  const codex = manifest.harnesses?.codex?.enabled === true;
  const claude = manifest.harnesses?.claude?.enabled === true;
  if (codex && !claude) return 'codex';
  if (claude && !codex) return 'claude';
  return 'both';
}

function bootstrapOptions(options, manifest) {
  const explicit = options.explicit ?? {};
  const currentAgent = manifestAgent(manifest);
  const currentBundles = [...(manifest.bundles ?? [])].sort();
  const requestedBundles = [...(options.bundles ?? [])].sort();
  if ((explicit.agent && options.agent !== currentAgent)
      || (explicit.profile && options.profile !== manifest.profile)
      || (explicit.bundles && JSON.stringify(requestedBundles) !== JSON.stringify(currentBundles))) {
    throw new CliError('Provider configuration changes require `vibetether init`; bootstrap is text-only.');
  }
  return {
    ...options,
    agent: currentAgent,
    profile: explicit.profile ? options.profile : manifest.profile,
    bundles: explicit.bundles ? options.bundles : currentBundles,
    autoBundles: false,
    bootstrapOnly: true,
  };
}

function unresolvedQuestions(model) {
  if (model.questions.length === 0) return 'No unresolved directional questions.';
  return `Unresolved directional questions:\n${model.questions.map((question) => `- ${question.prompt}`).join('\n')}`;
}

async function bootstrapContext(options, dependencies = {}) {
  const root = await projectRoot(options.project);
  const { manifest, lock } = await initializedProject(root);
  const finalOptions = bootstrapOptions(options, manifest);
  validateSharedConfiguration(finalOptions);
  if (!PROFILES.has(finalOptions.profile)) {
    throw new CliError(`Invalid initialized profile: ${finalOptions.profile}. Run \`vibetether init\` to repair it.`, 3);
  }
  let registry;
  try {
    registry = await (dependencies.loadRegistry ?? loadProviderRegistry)();
  } catch (error) {
    throw new CliError(`Cannot load the provider registry: ${error.message}`, 3);
  }
  await validateBootstrapAuthority({
    root,
    manifest,
    proposedManifest: manifest,
    lock,
    registry,
    adapters: selectedAdapters(finalOptions.agent),
    profile: finalOptions.profile,
    bundles: finalOptions.bundles,
  });
  const discovery = await scanProject(root, selectedAdapters(finalOptions.agent), finalOptions.profile);
  const prior = await existingIntent(root);
  const model = buildBootstrapModel({ discovery, input: mergeDirection(prior.input, options) });
  return { finalOptions, discovery, prior, model };
}

async function dryRunBootstrap(options, dependencies) {
  const context = await bootstrapContext(options, dependencies);
  const intentContent = proposedIntent(context);
  const preview = await initialize(
    { ...context.finalOptions, dryRun: true, yes: false, intentContent },
    dependencies,
  );
  return `${unresolvedQuestions(context.model)}\n\n${preview}`;
}

async function unattendedBootstrap(options, dependencies) {
  const context = await bootstrapContext(options, dependencies);
  const explicitRequiredDirection = Boolean(
    options.explicit?.goal && options.explicit?.successEvidence,
  );
  const priorConfirmed = isConfirmedIntent(context.prior.source);
  const answersUnchanged = sameAnswers(context.discovery, context.prior.input, context.model);
  const proposal = proposedIntent(context);
  if (priorConfirmed && !answersUnchanged) {
    throw new CliError('Confirmed direction changes require interactive prior/proposed preview and confirmation. Rerun `vibetether bootstrap` without --yes.');
  }
  if (!context.model.ready || (!priorConfirmed && !explicitRequiredDirection)) {
    throw new CliError('Unattended bootstrap requires byte-identical reuse of a confirmed Intent Contract or explicit --goal and --success-evidence; user-owned direction cannot be fabricated.');
  }
  return initialize(
    {
      ...context.finalOptions,
      dryRun: false,
      yes: true,
      intentContent: proposal,
    },
    dependencies,
  );
}

async function interactiveBootstrap(options, promptAdapter, dependencies, preparedContext = null) {
  const context = preparedContext ?? await bootstrapContext(options, dependencies);
  const model = await askDirection(
    context.model,
    context.discovery,
    mergeDirection(context.prior.input, options),
    promptAdapter,
  );
  const proposal = proposedIntent({ ...context, model });
  const preview = await initialize(
    { ...context.finalOptions, dryRun: true, yes: false, intentContent: proposal },
    dependencies,
  );
  if (!await promptAdapter.confirm(confirmationSummary(context.prior.source, proposal, preview))) {
    return 'VibeTether bootstrap cancelled; no project files were changed.\n';
  }
  return initialize(
    { ...context.finalOptions, dryRun: false, yes: true, intentContent: proposal },
    dependencies,
  );
}

export async function runBootstrap(options, runtime = {}) {
  const dependencies = runtime.initializeDependencies ?? {};
  if (options.dryRun) return dryRunBootstrap(options, dependencies);
  if (options.yes) return unattendedBootstrap(options, dependencies);
  const context = await bootstrapContext(options, dependencies);
  const promptAdapter = promptForInteractive(runtime);
  return withPromptCleanup(
    promptAdapter,
    () => interactiveBootstrap(options, promptAdapter, dependencies, context),
  );
}
