import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { runBootstrap, runInit } from './bootstrap.mjs';
import { CliError } from './errors.mjs';
import { inspectProject } from './doctor.mjs';
import { uninstall } from './uninstall.mjs';
import { showCapabilities } from './capabilities.mjs';
import { runCustomize } from './customize.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `VibeTether — keep coding agents tethered to project truth

Usage:
  vibetether init [options]
  vibetether bootstrap [options]
  vibetether doctor [options]
  vibetether capabilities [options]
  vibetether customize [options]
  vibetether uninstall [options]
  vibetether --help
  vibetether --version

Init and bootstrap options:
  --project PATH                    Project directory (default: current directory)
  --agent codex|claude|both         Agent harnesses to install (default: both)
  --profile core|standard|extended  Control profile (default: standard)
  --bundle web|production           Add a specialist bundle (repeatable)
  --no-auto-bundles                 Disable repository-evidence bundle selection
  --dry-run                         Show the plan without changing files
  --yes                             Apply changes without an interactive prompt
  --goal TEXT                       Record the project goal
  --success-evidence TEXT           Record required success evidence
  --scope-boundary TEXT             Add a scope boundary (repeatable)
  --constraint TEXT                 Add a non-negotiable constraint (repeatable)
  --visual-direction TEXT           Record the governing visual direction

Doctor options:
  --project PATH                    Project directory (default: current directory)
  --json                            Print a machine-readable report

Capabilities options:
  --project PATH                    Project directory (default: current directory)
  --phase PHASE                     Resolve one lifecycle phase (use with --capability)
  --capability ID                   Resolve one capability (use with --phase)
  --signal SIGNAL                   Add a routing signal (repeatable)
  --agent codex|claude              Check availability for one harness
  --json                            Print the dashboard or resolution as JSON

Customize options:
  --project PATH                    Project directory (default: current directory)
  --dry-run                         Preview the project route without writing

Uninstall options:
  --project PATH                    Project directory (default: current directory)
  --dry-run                         Show the plan without changing files
  --yes                             Apply changes without an interactive prompt
`;

function valueAfter(args, index, flag) {
  if (index + 1 >= args.length || args[index + 1].startsWith('--')) {
    throw new CliError(`Missing value for ${flag}.`);
  }
  return args[index + 1];
}

function parseInit(args, command = 'init') {
  const options = {
    project: process.cwd(),
    agent: 'both',
    profile: 'standard',
    bundles: [],
    autoBundles: true,
    dryRun: false,
    yes: false,
    goal: null,
    successEvidence: null,
    scopeBoundaries: [],
    constraints: [],
    visualDirection: null,
    explicit: {
      agent: false,
      profile: false,
      bundles: false,
      goal: false,
      successEvidence: false,
      scopeBoundaries: false,
      constraints: false,
      visualDirection: false,
    },
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--project') options.project = valueAfter(args, index++, flag);
    else if (flag === '--agent') {
      options.agent = valueAfter(args, index++, flag);
      options.explicit.agent = true;
    } else if (flag === '--profile') {
      options.profile = valueAfter(args, index++, flag);
      options.explicit.profile = true;
    } else if (flag === '--bundle') {
      options.bundles.push(valueAfter(args, index++, flag));
      options.explicit.bundles = true;
    }
    else if (flag === '--no-auto-bundles') options.autoBundles = false;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--yes') options.yes = true;
    else if (flag === '--goal') {
      options.goal = valueAfter(args, index++, flag);
      options.explicit.goal = true;
    } else if (flag === '--success-evidence') {
      options.successEvidence = valueAfter(args, index++, flag);
      options.explicit.successEvidence = true;
    } else if (flag === '--scope-boundary') {
      options.scopeBoundaries.push(valueAfter(args, index++, flag));
      options.explicit.scopeBoundaries = true;
    } else if (flag === '--constraint') {
      options.constraints.push(valueAfter(args, index++, flag));
      options.explicit.constraints = true;
    } else if (flag === '--visual-direction') {
      options.visualDirection = valueAfter(args, index++, flag);
      options.explicit.visualDirection = true;
    }
    else if (flag === '--help' || flag === '-h') return { help: true };
    else throw new CliError(`Unknown option for ${command}: ${flag}`);
  }
  if (!['codex', 'claude', 'both'].includes(options.agent)) {
    throw new CliError(`Invalid --agent value: ${options.agent}`);
  }
  if (!['core', 'standard', 'extended'].includes(options.profile)) {
    throw new CliError(`Invalid --profile value: ${options.profile}`);
  }
  const invalidBundle = options.bundles.find((bundle) => !['web', 'production'].includes(bundle));
  if (invalidBundle) throw new CliError(`Invalid --bundle value: ${invalidBundle}`);
  options.bundles = [...new Set(options.bundles)];
  if (options.profile === 'core' && options.bundles.length > 0) {
    throw new CliError('The core profile cannot be combined with --bundle because core is provider-free.');
  }
  return options;
}

function parseSimple(args, command) {
  const options = { project: process.cwd(), json: false, dryRun: false, yes: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--project') options.project = valueAfter(args, index++, flag);
    else if (flag === '--json' && command === 'doctor') options.json = true;
    else if (flag === '--dry-run' && command === 'uninstall') options.dryRun = true;
    else if (flag === '--yes' && command === 'uninstall') options.yes = true;
    else if (flag === '--help' || flag === '-h') return { help: true };
    else throw new CliError(`Unknown option for ${command}: ${flag}`);
  }
  return options;
}

function parseCapabilities(args) {
  const options = {
    project: process.cwd(),
    phase: null,
    capability: null,
    signals: [],
    agent: null,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--project') options.project = valueAfter(args, index++, flag);
    else if (flag === '--phase') options.phase = valueAfter(args, index++, flag);
    else if (flag === '--capability') options.capability = valueAfter(args, index++, flag);
    else if (flag === '--signal') options.signals.push(valueAfter(args, index++, flag));
    else if (flag === '--agent') options.agent = valueAfter(args, index++, flag);
    else if (flag === '--json') options.json = true;
    else if (flag === '--help' || flag === '-h') return { help: true };
    else throw new CliError(`Unknown option for capabilities: ${flag}`);
  }
  if (options.agent && !['codex', 'claude'].includes(options.agent)) {
    throw new CliError(`Invalid --agent value: ${options.agent}`);
  }
  return options;
}

function parseCustomize(args) {
  const options = { project: process.cwd(), dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--project') options.project = valueAfter(args, index++, flag);
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--help' || flag === '-h') return { help: true };
    else throw new CliError(`Unknown option for customize: ${flag}`);
  }
  return options;
}

async function version() {
  const data = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  return `${data.version}\n`;
}

export async function main(args = process.argv.slice(2), runtime = {}) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') return HELP;
  if (args[0] === '--version' || args[0] === '-v') return version();
  if (args[0] === 'init') {
    const options = parseInit(args.slice(1), 'init');
    if (options.help) return HELP;
    return runInit(options, runtime);
  }
  if (args[0] === 'bootstrap') {
    const options = parseInit(args.slice(1), 'bootstrap');
    if (options.help) return HELP;
    return runBootstrap(options, runtime);
  }
  if (args[0] === 'doctor') {
    const options = parseSimple(args.slice(1), 'doctor');
    if (options.help) return HELP;
    return inspectProject(options);
  }
  if (args[0] === 'capabilities') {
    const options = parseCapabilities(args.slice(1));
    if (options.help) return HELP;
    return showCapabilities(options);
  }
  if (args[0] === 'customize') {
    const options = parseCustomize(args.slice(1));
    if (options.help) return HELP;
    return runCustomize(options, runtime);
  }
  if (args[0] === 'uninstall') {
    const options = parseSimple(args.slice(1), 'uninstall');
    if (options.help) return HELP;
    return uninstall(options);
  }
  throw new CliError(`Unknown command: ${args[0]}`);
}

export { CliError, HELP };
