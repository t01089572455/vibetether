import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { CliError } from './errors.mjs';
import { initialize } from './init.mjs';
import { inspectProject } from './doctor.mjs';
import { uninstall } from './uninstall.mjs';
import { showCapabilities } from './capabilities.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `VibeTether — keep coding agents tethered to project truth

Usage:
  vibetether init [options]
  vibetether doctor [options]
  vibetether capabilities [options]
  vibetether uninstall [options]
  vibetether --help
  vibetether --version

Init options:
  --project PATH                    Project directory (default: current directory)
  --agent codex|claude|both         Agent harnesses to install (default: both)
  --profile core|standard|extended  Control profile (default: standard)
  --dry-run                         Show the plan without changing files
  --yes                             Apply changes without an interactive prompt

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

function parseInit(args) {
  const options = {
    project: process.cwd(),
    agent: 'both',
    profile: 'standard',
    dryRun: false,
    yes: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--project') options.project = valueAfter(args, index++, flag);
    else if (flag === '--agent') options.agent = valueAfter(args, index++, flag);
    else if (flag === '--profile') options.profile = valueAfter(args, index++, flag);
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--yes') options.yes = true;
    else if (flag === '--help' || flag === '-h') return { help: true };
    else throw new CliError(`Unknown option: ${flag}`);
  }
  if (!['codex', 'claude', 'both'].includes(options.agent)) {
    throw new CliError(`Invalid --agent value: ${options.agent}`);
  }
  if (!['core', 'standard', 'extended'].includes(options.profile)) {
    throw new CliError(`Invalid --profile value: ${options.profile}`);
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

async function version() {
  const data = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  return `${data.version}\n`;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') return HELP;
  if (args[0] === '--version' || args[0] === '-v') return version();
  if (args[0] === 'init') {
    const options = parseInit(args.slice(1));
    if (options.help) return HELP;
    return initialize(options);
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
  if (args[0] === 'uninstall') {
    const options = parseSimple(args.slice(1), 'uninstall');
    if (options.help) return HELP;
    return uninstall(options);
  }
  throw new CliError(`Unknown command: ${args[0]}`);
}

export { CliError, HELP };
