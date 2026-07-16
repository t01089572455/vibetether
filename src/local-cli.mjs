import { createHash } from 'node:crypto';
import { VIBETETHER_RELEASE_COMPATIBILITY } from './skill-install.mjs';

export const LOCAL_CLI_PATH = '.vibetether/bin/vibetether.mjs';

export function releasePackage(version) {
  return `https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v${version}`;
}

export function renderLocalCliLauncher(packageSpec) {
  return `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const packageSpec = process.env.VIBETETHER_CLI_PACKAGE || ${JSON.stringify(packageSpec)};
const commandArgs = ['--yes', \`--package=\${packageSpec}\`, 'vibetether', ...process.argv.slice(2)];
let executable = 'npx';
let args = commandArgs;

if (process.platform === 'win32') {
  const npmExecPath = process.env.npm_execpath;
  const candidates = [
    npmExecPath ? path.join(path.dirname(npmExecPath), 'npx-cli.js') : null,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ].filter(Boolean);
  const npxCli = candidates.find((candidate) => existsSync(candidate));
  if (!npxCli) {
    process.stderr.write(
      'VibeTether local CLI could not find npm npx-cli.js. Repair the Node.js/npm installation, then retry.\\n',
    );
    process.exit(127);
  }
  executable = process.execPath;
  args = [npxCli, ...commandArgs];
}

const result = spawnSync(
  executable,
  args,
  { stdio: 'inherit', shell: false, windowsHide: true },
);

if (result.error) {
  const message = result.error.code === 'ENOENT'
    ? 'VibeTether local CLI requires Node.js with npm/npx available on PATH.'
    : 'VibeTether local CLI could not start the portable package command.';
  process.stderr.write(\`\${message}\\n\`);
  process.exitCode = 127;
} else if (typeof result.status === 'number') {
  process.exitCode = result.status;
} else {
  process.stderr.write('VibeTether local CLI ended without an exit status.\\n');
  process.exitCode = 1;
}
`;
}

export function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function currentLocalCliBaseline() {
  const expectedVersion = VIBETETHER_RELEASE_COMPATIBILITY.current.version;
  const packageSpec = releasePackage(expectedVersion);
  const content = renderLocalCliLauncher(packageSpec);
  return {
    content,
    manifest: {
      launcher: LOCAL_CLI_PATH,
      launcher_sha256: sha256Text(content),
      package: packageSpec,
      expected_version: expectedVersion,
    },
  };
}
