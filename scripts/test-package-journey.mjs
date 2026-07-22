#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = process.argv.includes('--json');
const commands = [];
let guardedNodeInvocations = 0;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function textDigest(value) {
  return `sha256:${sha256(Buffer.from(value))}`;
}

function redactedCommand(command, args) {
  return [command, ...args].map((part) => String(part)).join(' ');
}

function npmInvocation(args) {
  if (process.env.npm_execpath) return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
  const bundledCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(bundledCli)) return { command: process.execPath, args: [bundledCli, ...args] };
  return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args };
}

function minimalEnvironment(overrides = {}) {
  const permitted = process.platform === 'win32'
    ? ['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP']
    : ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE'];
  const environment = {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
  for (const name of permitted) {
    if (typeof process.env[name] === 'string' && process.env[name]) environment[name] = process.env[name];
  }
  return { ...environment, ...overrides };
}

function run(command, args, { cwd, env, allowed = [0], label = null } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: minimalEnvironment(env),
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  const status = Number.isInteger(result.status) ? result.status : 1;
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  commands.push({
    label: label ?? path.basename(command),
    command: redactedCommand(command, args),
    exit_code: status,
    stdout_sha256: sha256(Buffer.from(stdout)),
    stderr_sha256: sha256(Buffer.from(stderr)),
  });
  if (!allowed.includes(status)) {
    throw new Error(`${label ?? command} exited ${status}: ${(result.error?.message || stderr || stdout).trim()}`);
  }
  return { status, stdout, stderr };
}

function runNpm(args, options = {}) {
  const invocation = npmInvocation(args);
  return run(invocation.command, invocation.args, { ...options, label: options.label ?? `npm ${args[0]}` });
}

function nodeGuardArgs(env = {}) {
  return env.VIBETETHER_SOURCE_GUARD_LOADER
    ? ['--no-warnings', '--experimental-loader', env.VIBETETHER_SOURCE_GUARD_LOADER]
    : [];
}

function runNode(script, args, { cwd, env, allowed = [0], label = null } = {}) {
  const result=run(process.execPath, [...nodeGuardArgs(env), script, ...args], { cwd, env, allowed, label });
  if (env?.VIBETETHER_SOURCE_GUARD_LOADER) guardedNodeInvocations+=1;
  return result;
}

function runJsonCli(installedCli, project, env, args, { allowed = [0] } = {}) {
  const result = runNode(installedCli, [...args, '--json'], {
    cwd: project,
    env,
    allowed,
    label: `installed vibetether ${args.slice(0, 2).join(' ')}`,
  });
  let body = null;
  if (result.stdout.trim()) {
    try { body = JSON.parse(result.stdout); }
    catch (error) { throw new Error(`Installed CLI emitted invalid JSON for ${args.join(' ')}: ${error.message}\n${result.stdout}`); }
  }
  return { ...result, body };
}

function runGit(project, args) {
  return run('git', args, { cwd: project, label: `git ${args[0]}` });
}

function captureCleanSourceIdentity() {
  const dirty=run('git',['status','--porcelain=v1','--untracked-files=all'],{cwd:sourceRoot,label:'verify source worktree clean'}).stdout;
  if (dirty.trim()) throw new Error('PACKAGE_SOURCE_DIRTY: exact package journey requires a clean committed source worktree. Commit or stash every change first.');
  const commit=run('git',['rev-parse','HEAD'],{cwd:sourceRoot,label:'resolve packaged source commit'}).stdout.trim().toLowerCase();
  const tree=run('git',['rev-parse','HEAD^{tree}'],{cwd:sourceRoot,label:'resolve packaged source tree'}).stdout.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)||!/^[a-f0-9]{40}$/.test(tree)) throw new Error('Unable to resolve the exact source commit and tree for package verification.');
  return {clean:true,commit,tree};
}

async function writeSourceTreeImportGuard(base) {
  const target=path.join(base,'source-tree-import-guard.mjs');
  await writeFile(target, `import path from 'node:path';\nimport { fileURLToPath } from 'node:url';\nconst forbidden=path.resolve(process.env.VIBETETHER_FORBID_SOURCE_ROOT ?? '');\nfunction blocked(url){if(!url.startsWith('file:'))return false;const target=path.resolve(fileURLToPath(url));return Boolean(forbidden)&&(target===forbidden||target.startsWith(forbidden+path.sep));}\nexport async function resolve(specifier,context,nextResolve){const resolved=await nextResolve(specifier,context);if(blocked(resolved.url))throw new Error('SOURCE_TREE_IMPORT_FORBIDDEN: '+resolved.url);return resolved;}\n`, 'utf8');
  return pathToFileURL(target).href;
}

function octal(block, start, length) {
  const text = block.subarray(start, start + length).toString('utf8').replace(/\0/g, '').trim();
  return text ? Number.parseInt(text, 8) : 0;
}

function tarText(block, start, length) {
  return block.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
}

function unsafeArchivePath(value) {
  if (!value || value.includes('\\') || value.includes('\0') || /^[/\\]/.test(value) || /^[a-zA-Z]:/.test(value)) return true;
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':'))) return true;
  return segments.some((segment) => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(segment));
}

async function inspectTgz(tgz) {
  const compressed = await readFile(tgz);
  let tar;
  try { tar=gunzipSync(compressed,{maxOutputLength:10*1024*1024}); }
  catch (error) { throw new Error(`Package archive exceeds the bounded decompression limit: ${error.message}`); }
  const paths = new Set();
  let offset = 0;
  let entries = 0;
  let regularFiles = 0;
  let unpackedBytes = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = tarText(header, 0, 100);
    const prefix = tarText(header, 345, 155);
    const archivePath = prefix ? `${prefix}/${name}` : name;
    const type = String.fromCharCode(header[156] || 0);
    const size = octal(header, 124, 12);
    if (unsafeArchivePath(archivePath) || !archivePath.startsWith('package/')) {
      throw new Error(`Unsafe package archive path: ${archivePath}`);
    }
    const folded = archivePath.toLocaleLowerCase('en-US');
    if (paths.has(folded)) throw new Error(`Case-colliding package archive path: ${archivePath}`);
    paths.add(folded);
    // Reject PAX/GNU extension records until they are parsed and constrained.
    // Accepting an unparsed x/g record would let it override a later path.
    if (!['\0', '0', '5'].includes(type)) {
      throw new Error(`Unsupported or unsafe package archive entry type ${JSON.stringify(type)} at ${archivePath}`);
    }
    if (type === '\0' || type === '0') {
      regularFiles += 1;
      unpackedBytes += size;
    }
    entries += 1;
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (entries === 0 || regularFiles === 0) throw new Error('Package archive contains no regular files.');
  if (unpackedBytes > 8 * 1024 * 1024) throw new Error(`Package archive exceeds the 8 MiB unpacked safety budget: ${unpackedBytes}`);
  if (unpackedBytes > compressed.length * 120) throw new Error('Package archive exceeds the 120x compression safety ratio.');
  return { safe: true, entries, regular_files: regularFiles, compressed_bytes: compressed.length, unpacked_bytes: unpackedBytes, sha256: sha256(compressed) };
}

async function inventory(root, relative = '', output = []) {
  const directory = path.join(root, relative);
  const entries = await (await import('node:fs/promises')).readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!relative && entry.name === '.git') continue;
    const next = path.join(relative, entry.name);
    const target = path.join(root, next);
    if (entry.isDirectory()) await inventory(root, next, output);
    else if (entry.isFile()) {
      const bytes = await readFile(target);
      output.push({ path: next.replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes) });
    } else throw new Error(`Unexpected non-regular project object: ${next}`);
  }
  return output;
}

function outcome(id, acceptanceId, artifact) {
  const command = [process.execPath, '-e', `const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(artifact)},'utf8')!=='verified\\n')process.exit(7)`];
  return {
    id,
    title: `Deliver ${id}`,
    authority_sources: ['truth:package-journey-fixture'],
    parent_id: null,
    dependencies: [],
    superseded_by: [],
    disposition: 'candidate',
    required_at: ['goal'],
    acceptance: [{
      id: acceptanceId,
      claim: `The final package journey proves ${acceptanceId}.`,
      evidence_kind: 'command',
      required_maturity: 'functional',
      validator: {
        kind: 'command',
        command,
        validator_revision: textDigest(`${id}:${acceptanceId}:validator:v1`),
        covers_paths: [artifact],
      },
    }],
    decision_receipt: null,
    revision_digest: textDigest(`${id}:outcome:v1`),
  };
}

async function governOutcomes(installedCli, project, env, outcomes) {
  for (const item of outcomes) {
    runJsonCli(installedCli, project, env, ['outcomes', 'propose', '--project', project, '--outcome-json', JSON.stringify(item), '--yes']);
    runJsonCli(installedCli, project, env, [
      'outcomes', 'confirm', '--project', project, '--id', item.id,
      '--user-message-locator', `user-message:package-journey-confirm-${item.id}`,
      '--reason', `The user confirmed ${item.id} as a required package smoke-test outcome.`, '--yes',
    ]);
  }
  runJsonCli(installedCli, project, env, [
    'outcomes', 'coverage', 'confirm', '--project', project,
    '--user-message-locator', 'user-message:package-journey-confirm-complete-coverage',
    '--reason', 'The user confirmed this exact two-outcome package smoke-test boundary.', '--yes',
  ]);
}

async function satisfyOutcome(installedCli, project, env, item, artifact) {
  const acceptance = item.acceptance[0];
  const check = {
    id: `check-${acceptance.id}`,
    claim: acceptance.claim,
    kind: 'command',
    command: acceptance.validator.command,
    covers_paths: [artifact],
    consumer_paths: [artifact],
    acceptance_ids: [acceptance.id],
  };
  const started = runJsonCli(installedCli, project, env, [
    'step', 'start', '--project', project,
    '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
    '--task', `Implement the approved ${item.id} package journey slice.`,
    '--slice', `Implement ${item.id}.`, '--outcome', item.id, '--path', artifact,
    '--success-evidence', acceptance.claim, '--success-check-json', JSON.stringify(check),
    '--signal', 'known-small-fix', '--code-write', '--confirmed-by-user',
    '--decision-reason', `The user approved the exact package journey slice for ${item.id}.`,
  ]).body;
  await writeFile(path.join(project, artifact), 'verified\n');
  const proofArgs = [];
  for (const output of started.route.required_outputs ?? []) {
    proofArgs.push('--output-proof-json', JSON.stringify({
      output, check_ids: [check.id], summary: `The installed package check proves ${output}.`, artifact_paths: [artifact],
    }));
  }
  for (const criterion of started.route.exit_evidence ?? []) {
    proofArgs.push('--exit-proof-json', JSON.stringify({
      criterion, check_ids: [check.id], summary: 'The installed package check passed against final product bytes.', artifact_paths: [artifact],
    }));
  }
  runJsonCli(installedCli, project, env, ['step', 'finish', '--project', project, ...proofArgs]);
}

function deepResolution(card) {
  const source = 'user-message:package-journey-deep-permit-confirmation';
  return {
    user_confirmation: {
      source,
      summary: 'The user reviewed the installed-package Deep Start Card, retained the bounded smoke-test route, and explicitly authorized only this reversible verification exercise.',
    },
    facts_verified: card.facts.map((fact) => ({
      fact,
      evidence: `The isolated installed package binary, generated project launcher, and Git fixture establish this package-journey fact before implementation: ${fact}`,
      evidence_kind: 'repository-and-command',
      source_locator: 'installed-package-cli plus generated-project-launcher',
    })),
    assumptions_resolved: card.assumptions.map((assumption) => ({
      assumption,
      disposition: 'confirmed',
      rationale: `The user confirmed this bounded precondition after inspecting the package smoke journey and accepted the reversible consequence: ${assumption}`,
      confirmation_source: source,
    })),
    decisions_resolved: card.decisions_needed.map((decision) => ({
      decision,
      resolution: `The user selected the narrow verification choice and excluded silent completion after permit revocation: ${decision}`,
      confirmation_source: source,
    })),
    success_evidence_confirmed: [...card.success_evidence],
    success_evidence_verifiers: card.success_evidence.map((criterion) => ({
      criterion,
      verifier: `Run the predeclared installed-package command against the final artifact bytes and bind its receipt to this exact criterion: ${criterion}`,
    })),
    counterexample_challenge: {
      challenge: 'Could a revoked implementation permit still let an active Deep route claim a successful final package result?',
      outcome: 'No. Revocation must invalidate the active route, its activation, and any later completion attempt before the route can claim success.',
      evidence: 'The isolated package journey invokes revoke and then confirms that the installed CLI refuses step finish and completion inspection remains blocked.',
    },
  };
}

function deepStartArgs(project, card) {
  const envelope = card.execution_envelope;
  const args = [
    'step', 'start', '--project', project, '--deep', '--task', card.task,
    '--phase', envelope.phase, '--capability', envelope.capability, '--slice', card.slice,
  ];
  for (const item of card.success_evidence) args.push('--success-evidence', item);
  for (const item of envelope.success_checks) args.push('--success-check-json', JSON.stringify(item));
  for (const item of envelope.scope_paths) args.push('--path', item);
  if (envelope.permissions.network) args.push('--network');
  if (envelope.permissions.external_write) args.push('--external-write');
  if (envelope.permissions.code_write) args.push('--code-write');
  return args;
}

async function exerciseDeepRevocation(installedCli, project, env) {
  const check = {
    id: 'package-deep-check',
    claim: 'The revoked Deep route must not claim completion.',
    kind: 'command',
    command: [process.execPath, '-e', "const fs=require('node:fs');if(fs.readFileSync('deep-result.txt','utf8')!=='verified\\n')process.exit(7)"],
    covers_paths: ['deep-result.txt'],
    consumer_paths: ['deep-result.txt'],
  };
  let prepared = runJsonCli(installedCli, project, env, [
    'deep', 'prepare', '--project', project,
    '--task', 'Use the installed package to verify that a revoked Deep permit blocks completion.',
    '--slice', 'Execute only the reversible Deep permit revocation package smoke slice.',
    '--phase', 'EXECUTE_ONE', '--capability', 'implementation', '--path', 'deep-result.txt', '--code-write',
    '--success-evidence', check.claim, '--success-check-json', JSON.stringify(check),
    '--fact', 'The CLI binary was installed from the exact TGZ under test.',
    '--assumption', 'The package smoke artifact remains local and reversible.',
    '--decision', 'Confirm that permit revocation must prevent the active Deep route from finishing.',
  ]).body;
  const resolution = deepResolution(prepared.start_card);
  while (prepared.next_question) {
    const question = prepared.next_question;
    const selected = question.kind === 'assumption'
      ? resolution.assumptions_resolved.find((item) => item.assumption === question.subject)?.rationale
      : resolution.decisions_resolved.find((item) => item.decision === question.subject)?.resolution;
    if (!selected) throw new Error(`Package Deep journey cannot answer ${question.id}.`);
    prepared = runJsonCli(installedCli, project, env, [
      'deep', 'answer', '--project', project, '--question-id', question.id,
      '--selected-option', selected, '--user-message-locator', `user-message:package-journey-deep-answer-${question.order}`,
    ]).body;
  }
  runJsonCli(installedCli, project, env, [
    'deep', 'permit', '--project', project, '--confirmed-by-user',
    '--reason', 'The user approved the exact installed-package Deep revocation smoke-test Start Card after fact and counterexample review.',
    '--resolution-json', JSON.stringify(resolution),
  ]);
  runJsonCli(installedCli, project, env, deepStartArgs(project, prepared.start_card));
  runJsonCli(installedCli, project, env, [
    'deep', 'revoke', '--project', project,
    '--reason', 'The package journey intentionally revokes the reviewed permit before evidence can be accepted.',
  ]);
  const refused = runJsonCli(installedCli, project, env, ['step', 'finish', '--project', project], { allowed: [3] });
  const blocked = runJsonCli(installedCli, project, env, ['doctor', '--project', project, '--boundary', 'completion'], { allowed: [4] });
  runJsonCli(installedCli, project, env, [
    'step', 'reanchor', '--project', project,
    '--reason', 'The package journey recovered from the intentionally revoked Deep permit before starting normal governed work.',
  ]);
  return refused.status === 3 && blocked.status === 4;
}

async function main() {
  const source=captureCleanSourceIdentity();
  const base = await mkdtemp(path.join(os.tmpdir(), 'vibetether-package-journey-'));
  try {
    const packDirectory = path.join(base, 'pack');
    const prefix = path.join(base, 'prefix');
    const project = path.join(base, 'project');
    const home = path.join(base, 'home');
    const environment = {
      HOME: home,
      USERPROFILE: home,
      APPDATA: path.join(home, 'appdata'),
      LOCALAPPDATA: path.join(home, 'localappdata'),
      TEMP: path.join(base, 'temp'),
      TMP: path.join(base, 'temp'),
      npm_config_cache: path.join(base, 'npm-cache'),
      npm_config_userconfig: path.join(base, 'npmrc'),
      VIBETETHER_USER_HOME: home,
      VIBETETHER_STATE_HOME: path.join(base, 'state'),
      VIBETETHER_CACHE_HOME: path.join(base, 'cache'),
      VIBETETHER_CONFIG_HOME: path.join(base, 'config'),
      VIBETETHER_RUNTIME_HOME: path.join(base, 'runtime'),
    };
    await Promise.all([packDirectory, prefix, project, home, environment.TEMP].map((target) => mkdir(target, { recursive: true })));

    const packed = runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory], {
      cwd: sourceRoot, env: environment, label: 'pack exact source commit',
    });
    const metadata = JSON.parse(packed.stdout);
    if (!Array.isArray(metadata) || metadata.length !== 1 || typeof metadata[0]?.filename !== 'string') throw new Error('npm pack did not return one package filename.');
    const tgz = path.join(packDirectory, metadata[0].filename);
    const archive = await inspectTgz(tgz);

    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline', '--prefix', prefix, tgz], {
      cwd: base, env: environment, label: 'install exact TGZ into isolated prefix',
    });
    const installedCli = path.join(prefix, 'node_modules', 'vibetether', 'bin', 'vibetether.mjs');
    const installedCliStat = await stat(installedCli);
    if (!installedCliStat.isFile()) throw new Error('The isolated TGZ installation does not contain the CLI entrypoint.');
    if (path.resolve(installedCli).startsWith(`${sourceRoot}${path.sep}`)) throw new Error('Package journey attempted to execute a source-tree CLI.');
    const sourceGuardLoader=await writeSourceTreeImportGuard(base);
    const guardedEnvironment={...environment,VIBETETHER_FORBID_SOURCE_ROOT:sourceRoot,VIBETETHER_SOURCE_GUARD_LOADER:sourceGuardLoader};

    const version = runNode(installedCli, ['--version'], { cwd: project, env: guardedEnvironment, label: 'guarded installed CLI version' }).stdout.trim();
    runGit(project, ['init', '-q']);
    runGit(project, ['config', 'user.email', 'package-journey@example.test']);
    runGit(project, ['config', 'user.name', 'VibeTether Package Journey']);
    await writeFile(path.join(project, 'app.txt'), 'initial\n');
    runGit(project, ['add', 'app.txt']);
    runGit(project, ['commit', '-qm', 'initial package journey fixture']);

    runJsonCli(installedCli, project, guardedEnvironment, [
      'init', '--project', project, '--agent', 'codex',
      '--goal', 'Prove the isolated exact package control journey.',
      '--success-evidence', 'The installed package preserves true completion boundaries.', '--confirmed', '--yes',
    ]);
    const launcherVersion = runNode(path.join(project, '.vibetether', 'vt.mjs'), ['--version'], {
      cwd: project, env: guardedEnvironment, label: 'guarded offline generated project launcher version',
    }).stdout.trim();
    if (!version || launcherVersion !== version) throw new Error(`Project launcher ${launcherVersion} does not match installed CLI ${version}.`);

    const deepRevocationBlocksFinish = await exerciseDeepRevocation(installedCli, project, guardedEnvironment);
    const first = outcome('outcome_package_first', 'acceptance_package_first', 'first-result.txt');
    const second = outcome('outcome_package_second', 'acceptance_package_second', 'second-result.txt');
    await governOutcomes(installedCli, project, guardedEnvironment, [first, second]);
    await satisfyOutcome(installedCli, project, guardedEnvironment, first, 'first-result.txt');
    const firstGoal = runJsonCli(installedCli, project, guardedEnvironment, ['doctor', '--project', project, '--boundary', 'goal'], { allowed: [4] }).body;
    const goalBlockedAfterOneSlice = firstGoal.ok === false
      && firstGoal.completion?.remaining_outcome_ids?.includes(second.id) === true;

    await satisfyOutcome(installedCli, project, guardedEnvironment, second, 'second-result.txt');
    const closedGoal = runJsonCli(installedCli, project, guardedEnvironment, ['doctor', '--project', project, '--boundary', 'goal']).body;
    const goalClosedAfterTwoSlices = closedGoal.ok === true && closedGoal.completion?.label === 'GOAL_ENGINEERING_CLOSED';
    const blockedRelease = runJsonCli(installedCli, project, guardedEnvironment, ['doctor', '--project', project, '--boundary', 'release'], { allowed: [4] }).body;
    const releaseBlockedWithoutReleaseAuthorization = blockedRelease.ok === false
      && (blockedRelease.issues ?? []).some((item) => item.code === 'RELEASE_AUTHORIZATION_REQUIRED');

    const upgrade = runJsonCli(installedCli, project, guardedEnvironment, ['upgrade', '--project', project, '--agent', 'codex', '--dry-run']).body;
    const upgradePreviewed = ['preview', 'current'].includes(upgrade.status);
    const progress = path.join(project, '.vibetether', 'PROGRESS.md');
    await writeFile(progress, `${await readFile(progress, 'utf8')}\nuser-owned package journey edit\n`);
    const uninstall = runJsonCli(installedCli, project, guardedEnvironment, [
      'uninstall', '--project', project, '--agent', 'codex', '--remove-contract', '--yes',
    ], { allowed: [3] });
    const uninstallPreservedModifiedContract = uninstall.status === 3 && (await readFile(progress, 'utf8')).includes('user-owned package journey edit');

    return {
      ok: source.clean && archive.safe && goalBlockedAfterOneSlice && goalClosedAfterTwoSlices && releaseBlockedWithoutReleaseAuthorization
        && deepRevocationBlocksFinish && upgradePreviewed && uninstallPreservedModifiedContract,
      source,
      archive,
      install: {
        source_tree_imported: guardedNodeInvocations > 0 ? false : null,
        source_tree_import_guard: guardedNodeInvocations > 0 ? 'passed' : 'not-exercised',
        guarded_node_invocations: guardedNodeInvocations,
        tgz_sha256: archive.sha256,
        installed_cli_sha256: sha256(await readFile(installedCli)),
        version,
      },
      journey: {
        goal_blocked_after_one_slice: goalBlockedAfterOneSlice,
        goal_closed_after_two_slices: goalClosedAfterTwoSlices,
        release_blocked_without_release_authorization: releaseBlockedWithoutReleaseAuthorization,
        deep_revocation_blocks_finish: deepRevocationBlocksFinish,
        project_launcher_reused_offline: launcherVersion === version,
        upgrade_previewed: upgradePreviewed,
        uninstall_preserved_modified_contract: uninstallPreservedModifiedContract,
      },
      final_inventory: await inventory(project),
      commands,
    };
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

try {
  const report = await main();
  process.stdout.write(`${json ? JSON.stringify(report, null, 2) : JSON.stringify({ ok: report.ok, journey: report.journey }, null, 2)}\n`);
  if (!report.ok) process.exitCode = 4;
} catch (error) {
  process.stderr.write(`VibeTether exact package journey failed: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
