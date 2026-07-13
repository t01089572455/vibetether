import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { CliError } from './errors.mjs';
import { initialize } from './init.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `VibeTether — keep coding agents tethered to project truth

Usage:
  vibetether init [options]
  vibetether --help
  vibetether --version

Init options:
  --project PATH                    Project directory (default: current directory)
  --agent codex|claude|both         Agent harnesses to install (default: both)
  --profile core|standard|extended  Control profile (default: standard)
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

async function version() {
  const data = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  return `${data.version}\n`;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') return HELP;
  if (args[0] === '--version' || args[0] === '-v') return version();
  if (args[0] !== 'init') throw new CliError(`Unknown command: ${args[0]}`);
  const options = parseInit(args.slice(1));
  if (options.help) return HELP;
  return initialize(options);
}

export { CliError, HELP };
