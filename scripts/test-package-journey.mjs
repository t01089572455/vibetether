#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  STAGE0_PACKAGE_JOURNEYS, assertCapabilityCoverage, downgradeProjectToRc1,
  validateStage0PackageReport,
} from './test-stage0-package-contract.mjs';

const sourceArgument = process.argv.indexOf('--source');
const sourceRoot = sourceArgument >= 0
  ? path.resolve(process.argv[sourceArgument + 1] ?? '')
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  if (dirty.trim()) throw new Error(`PACKAGE_SOURCE_DIRTY: exact package journey requires a clean committed source worktree: ${sourceRoot}`);
  const commit=run('git',['rev-parse','HEAD'],{cwd:sourceRoot,label:'resolve packaged source commit'}).stdout.trim().toLowerCase();
  const tree=run('git',['rev-parse','HEAD^{tree}'],{cwd:sourceRoot,label:'resolve packaged source tree'}).stdout.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)||!/^[a-f0-9]{40}$/.test(tree)) throw new Error('Unable to resolve the exact source commit and tree for package verification.');
  return {clean:true,commit,tree,tree_status:[]};
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
  const files = [];
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
    files.push(archivePath);
    entries += 1;
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (entries === 0 || regularFiles === 0) throw new Error('Package archive contains no regular files.');
  if (unpackedBytes > 8 * 1024 * 1024) throw new Error(`Package archive exceeds the 8 MiB unpacked safety budget: ${unpackedBytes}`);
  if (unpackedBytes > compressed.length * 120) throw new Error('Package archive exceeds the 120x compression safety ratio.');
  return {
    safe: true, entries, regular_files: regularFiles, compressed_bytes: compressed.length,
    unpacked_bytes: unpackedBytes, sha256: sha256(compressed), files: files.sort(),
  };
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

async function initializeInstalledProject(installedCli, base, env, name, initArgs = [], seed = {}) {
  const project = path.join(base, 'stage0-projects', name);
  await mkdir(project, { recursive: true });
  runGit(project, ['init', '-q']);
  runGit(project, ['config', 'user.email', 'package-journey@example.test']);
  runGit(project, ['config', 'user.name', 'VibeTether Package Journey']);
  const entries = Object.entries({ 'app.txt': 'initial\n', ...seed });
  for (const [relative, content] of entries) {
    const target = path.join(project, ...relative.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  runGit(project, ['add', '.']);
  runGit(project, ['commit', '-qm', `initial ${name} fixture`]);
  runJsonCli(installedCli, project, env, [
    'init', '--project', project, '--agent', 'codex',
    '--goal', `Exercise the installed ${name} package journey.`,
    '--success-evidence', 'The installed package journey passes.',
    '--confirmed', '--yes', ...initArgs,
  ]);
  return project;
}

async function exerciseCapabilityCoverage(installedCli, installedRoot, project, env) {
  const baseline = JSON.parse(await readFile(path.join(installedRoot, 'registry', 'stage0-baseline.json'), 'utf8'));
  const registry = runJsonCli(installedCli, project, env, ['capabilities']).body;
  const observed = [];
  for (const capability of registry.capabilities) {
    const routed = runJsonCli(installedCli, project, env, [
      'capabilities', '--project', project, '--phase', capability.phases[0], '--capability', capability.id,
      '--network', '--external-write', '--code-write',
    ]).body;
    observed.push({
      id: capability.id,
      journey_id: 'installed-capability-routing',
      phase: routed.phase,
      provider_id: routed.selected.id,
      provider_fingerprint: routed.selected.fingerprint,
      provider_object_hash: routed.selected.object_hash,
      shortlist_size: routed.shortlist.length,
    });
  }
  return assertCapabilityCoverage({ baseline, registry, observed });
}

async function exerciseProviderProfiles(installedCli, base, env) {
  const specifications = [
    ['core', ['--profile', 'core']],
    ['standard', ['--profile', 'standard']],
    ['extended', ['--profile', 'extended']],
    ['web', ['--profile', 'standard', '--bundle', 'web']],
    ['production', ['--profile', 'standard', '--bundle', 'production']],
  ];
  const profiles = [];
  let runtimeDownloadDirectoryCreated = false;
  for (const [id, args] of specifications) {
    const project = await initializeInstalledProject(installedCli, base, env, `profile-${id}`, args);
    const routed = runJsonCli(installedCli, project, env, [
      'capabilities', '--project', project, '--phase', 'DIAGNOSE', '--capability', 'debugging',
    ]).body;
    profiles.push({
      id, provider_id: routed.selected.id, fingerprint: routed.selected.fingerprint,
      object_hash: routed.selected.object_hash, shortlist_size: routed.shortlist.length,
    });
    runtimeDownloadDirectoryCreated ||= existsSync(path.join(project, '.vibetether', 'providers'));
  }
  return {
    profile_ids: profiles.map((item) => item.id), profiles,
    runtime_download_directory_created: runtimeDownloadDirectoryCreated,
  };
}

async function exerciseCustomRoutes(installedCli, base, env) {
  const project = await initializeInstalledProject(
    installedCli, base, env, 'custom-routes', ['--profile', 'extended', '--bundle', 'production'],
  );
  const routesPath = path.join(project, '.vibetether', 'routes.json');
  const routes = JSON.parse(await readFile(routesPath, 'utf8'));
  routes.routes.push({
    id: 'package-primary', phases: ['EXECUTE_ONE'], capability: 'implementation',
    signals: { all: [], any: ['package-overlay'], none: [] }, provider: 'vibetether-built-in-implementation',
    role: 'primary', priority: 100, required_outputs: ['package_primary_output'], exit_evidence: ['Package primary evidence.'],
  }, {
    id: 'package-alternative', phases: ['EXECUTE_ONE'], capability: 'implementation',
    signals: { all: [], any: ['package-overlay'], none: [] }, provider: 'addy-incremental-implementation',
    role: 'alternative', priority: 50, required_outputs: ['package_alternative_output'], exit_evidence: ['Package alternative evidence.'],
  }, {
    id: 'package-overlay', phases: ['EXECUTE_ONE'], capability: 'implementation',
    signals: { all: [], any: ['package-overlay'], none: [] }, provider: 'vibetether-built-in-implementation',
    role: 'overlay', priority: 10, required_outputs: ['package_overlay_output'], exit_evidence: ['Package overlay evidence.'],
  });
  await writeFile(routesPath, `${JSON.stringify(routes, null, 2)}\n`);
  const composed = runJsonCli(installedCli, project, env, [
    'capabilities', '--project', project, '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
    '--signal', 'package-overlay', '--code-write',
  ]).body;
  const overlayUnionOnly = ['bounded_change', 'package_primary_output', 'package_alternative_output', 'package_overlay_output']
    .every((item) => composed.required_outputs.includes(item));

  const uiRoutes = structuredClone(routes);
  uiRoutes.routes.push({
    id: 'attempted-ui-weakening', phases: ['EXECUTE_ONE'], capability: 'frontend-propagation',
    signals: { all: [], any: ['attempted-ui-weakening'], none: [] }, provider: 'vibetether-built-in-implementation',
    role: 'overlay', priority: 1000, required_outputs: [], exit_evidence: [],
  });
  await writeFile(routesPath, `${JSON.stringify(uiRoutes, null, 2)}\n`);
  const uiCheck = {
    id: 'check-installed-ui-weakening', claim: 'The attempted installed UI propagation passes.', kind: 'command',
    command: [process.execPath, '-e', "const fs=require('node:fs');if(!fs.existsSync('ui.txt'))process.exit(7)"],
    covers_paths: ['ui.txt'], consumer_paths: ['ui.txt'], acceptance_ids: [],
  };
  const ui = runJsonCli(installedCli, project, env, [
    'step', 'start', '--project', project, '--phase', 'EXECUTE_ONE', '--capability', 'frontend-propagation',
    '--task', 'Propagate the installed UI state through the attempted weakening route.', '--slice', 'Propagate only the refused UI route.',
    '--path', 'ui.txt', '--success-evidence', uiCheck.claim, '--success-check-json', JSON.stringify(uiCheck),
    '--signal', 'attempted-ui-weakening', '--code-write', '--confirmed-by-user',
    '--decision-reason', 'The fixture user confirms this exact refused route.',
  ], { allowed: [3] });
  const uiPrerequisiteNotWeakened = ui.status === 3 && /required UI Outcome/i.test(ui.stderr);

  const permission = runJsonCli(installedCli, project, env, [
    'capabilities', '--project', project, '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
    '--signal', 'package-overlay',
  ], { allowed: [3] });
  const permissionBoundaryNotWeakened = permission.status === 3 && /permission|unavailable/i.test(permission.stderr);

  const ambiguous = structuredClone(routes);
  ambiguous.routes.push({ ...ambiguous.routes[0], id: 'package-primary-duplicate' });
  await writeFile(routesPath, `${JSON.stringify(ambiguous, null, 2)}\n`);
  const refused = runJsonCli(installedCli, project, env, [
    'capabilities', '--project', project, '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
    '--signal', 'package-overlay', '--code-write',
  ], { allowed: [3] });
  return {
    overlay_union_only: overlayUnionOnly,
    ambiguous_primaries_rejected: refused.status === 3 && /equally matching primaries/i.test(refused.stderr),
    ui_prerequisite_not_weakened: uiPrerequisiteNotWeakened,
    permission_boundary_not_weakened: permissionBoundaryNotWeakened,
  };
}

async function exerciseUpgrade(installedCli, base, env) {
  const project = await initializeInstalledProject(
    installedCli, base, env, 'upgrade-rollback', ['--profile', 'extended', '--bundle', 'production'],
  );
  const routesPath = path.join(project, '.vibetether', 'routes.json');
  const skillsPath = path.join(project, '.vibetether', 'skills.lock.json');
  const routes = JSON.parse(await readFile(routesPath, 'utf8'));
  routes.routes.push({
    id: 'preserved-upgrade-route', phases: ['EXECUTE_ONE'], capability: 'implementation',
    signals: { all: [], any: ['upgrade-preserve'], none: [] }, provider: 'vibetether-built-in-implementation',
    role: 'primary', priority: 100, required_outputs: ['preserved_route_output'], exit_evidence: ['Preserved route evidence.'],
  });
  await writeFile(routesPath, `${JSON.stringify(routes, null, 2)}\n`);
  runJsonCli(installedCli, project, env, ['skills', 'prefer', '--project', project, '--id', 'addy-incremental-implementation']);
  runJsonCli(installedCli, project, env, ['skills', 'disable', '--project', project, '--id', 'vibetether-built-in-tdd']);
  const routesBefore = await readFile(routesPath);
  const skillsBefore = await readFile(skillsPath);
  await downgradeProjectToRc1(project, { agent: 'codex' });
  const before = await inventory(project);
  const preview = runJsonCli(installedCli, project, env, ['upgrade', '--project', project, '--agent', 'codex', '--dry-run']).body;
  const applied = runJsonCli(installedCli, project, env, ['upgrade', '--project', project, '--agent', 'codex', '--yes']).body;
  const routesAfterApply = await readFile(routesPath);
  const skillsAfterApply = await readFile(skillsPath);
  runJsonCli(installedCli, project, env, ['upgrade', 'rollback', '--id', applied.upgrade_id, '--yes']);
  const after = await inventory(project);
  return {
    previewed: preview.status === 'preview', applied: applied.status === 'upgraded',
    user_routes_byte_preserved: routesBefore.equals(routesAfterApply) && routesBefore.equals(await readFile(routesPath)),
    provider_choices_byte_preserved: skillsBefore.equals(skillsAfterApply) && skillsBefore.equals(await readFile(skillsPath)),
    rollback_byte_exact: JSON.stringify(before) === JSON.stringify(after),
    upgrade_id: applied.upgrade_id,
  };
}

function routeProofArguments(route, checkId, artifact) {
  const args = [];
  for (const output of route.required_outputs ?? []) args.push('--output-proof-json', JSON.stringify({
    output, check_ids: [checkId], summary: `The installed package check proves ${output}.`, artifact_paths: [artifact],
  }));
  for (const criterion of route.exit_evidence ?? []) args.push('--exit-proof-json', JSON.stringify({
    criterion, check_ids: [checkId], summary: 'The installed package check passed on final bytes.', artifact_paths: [artifact],
  }));
  return args;
}

async function exerciseProvenPath(installedCli, base, env) {
  const project = await initializeInstalledProject(installedCli, base, env, 'proven-path');
  const artifact = 'recovery.txt';
  const original = '# Installed recovery path\n\nRun the verified installed recovery sequence and preserve its bounded evidence.\n';
  const check = {
    id: 'check-installed-proven-path', claim: 'The recovered installed-package workflow passes.', kind: 'command',
    command: [process.execPath, '-e', "const fs=require('node:fs');if(!fs.readFileSync('recovery.txt','utf8').includes('verified installed recovery sequence'))process.exit(7)"],
    covers_paths: [artifact], consumer_paths: [artifact], acceptance_ids: [],
  };
  const started = runJsonCli(installedCli, project, env, [
    'step', 'start', '--project', project, '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
    '--task', 'Recover the non-obvious installed package workflow.', '--slice', 'Recover only the reusable local workflow.',
    '--path', artifact, '--success-evidence', check.claim, '--success-check-json', JSON.stringify(check),
    '--signal', 'bug-fix', '--signal', 'recovered-path', '--provider', 'vibetether-built-in-implementation',
    '--code-write', '--confirmed-by-user', '--decision-reason', 'The fixture user approved this recovered path.',
  ]).body;
  await writeFile(path.join(project, artifact), original);
  const finished = runJsonCli(installedCli, project, env, [
    'step', 'finish', '--project', project, ...routeProofArguments(started.route, check.id, artifact),
  ]).body;
  const candidateId = finished.experience_capture.candidate_id;
  const confirm = ['experience', 'confirm', '--project', project, '--id', candidateId];
  for (const id of finished.route.evidence_ids) confirm.push('--evidence-id', id);
  runJsonCli(installedCli, project, env, [...confirm, '--yes']);
  const recalled = runJsonCli(installedCli, project, env, [
    'context', '--project', project, '--boundary', 'task-entry', '--phase', 'EXECUTE_ONE',
    '--capability', 'proven-path-recall', '--signal', 'recovered-path', '--code-write',
  ]).body;
  const recalledWhenMatching = recalled.experience.some((item) => item.id === candidateId);

  await writeFile(path.join(project, artifact), '# Changed recovery path\n\nThe bytes changed and now require explicit revalidation.\n');
  let audit = runJsonCli(installedCli, project, env, ['experience', 'audit', '--project', project, '--signal', 'recovered-path']).body;
  const artifactChangeInvalidated = audit.find((item) => item.id === candidateId)?.reasons.includes('artifact-changed') === true;
  await writeFile(path.join(project, artifact), original);
  const lockPath = path.join(project, '.vibetether', 'skills.lock.json');
  const lock = await readFile(lockPath);
  runJsonCli(installedCli, project, env, ['skills', 'prefer', '--project', project, '--id', 'vibetether-built-in-tdd']);
  audit = runJsonCli(installedCli, project, env, ['experience', 'audit', '--project', project, '--signal', 'recovered-path']).body;
  const skillsChangeInvalidated = audit.find((item) => item.id === candidateId)?.reasons.includes('skills-changed') === true;
  await writeFile(lockPath, lock);
  await writeFile(path.join(project, 'new-truth.md'), '# Truth\nA new confirmed requirement.\n');
  runJsonCli(installedCli, project, env, ['truth', 'add', '--project', project, '--path', 'new-truth.md', '--role', 'requirement', '--scope', '.', '--yes']);
  runJsonCli(installedCli, project, env, ['truth', 'confirm', '--project', project, '--path', 'new-truth.md', '--yes']);
  audit = runJsonCli(installedCli, project, env, ['experience', 'audit', '--project', project, '--signal', 'recovered-path']).body;
  const authorityChangeInvalidated = audit.find((item) => item.id === candidateId)?.reasons.includes('authority-changed') === true;
  return {
    candidate_id: candidateId, recalled_when_matching: recalledWhenMatching,
    artifact_change_invalidated: artifactChangeInvalidated,
    skills_change_invalidated: skillsChangeInvalidated,
    authority_change_invalidated: authorityChangeInvalidated,
  };
}

async function exerciseProviderTamper(installedCli, installedRoot, project, env) {
  const target = path.join(installedRoot, 'registry', 'builtins', 'vibetether-built-in-design', 'SKILL.md');
  const original = await readFile(target);
  try {
    await writeFile(target, Buffer.concat([original, Buffer.from('\ntampered\n')]));
    const refused = runJsonCli(installedCli, project, env, [
      'capabilities', '--project', project, '--phase', 'DESIGN', '--capability', 'product-design',
    ], { allowed: [3] });
    return refused.status === 3 && /digest|integrity|fingerprint|hash|mismatch/i.test(refused.stderr);
  } finally {
    await writeFile(target, original);
  }
}

async function main() {
  const source=captureCleanSourceIdentity();
  const base = await mkdtemp(path.join(os.tmpdir(), 'vibetether-package-journey-'));
  let report = null;
  let cleanup = { completed: false, base_removed: false };
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

    const suppliedTgz = process.env.VIBETETHER_STAGE0_CANDIDATE_TGZ;
    let tgz;
    let acquisition;
    if (suppliedTgz) {
      const suppliedPath = path.resolve(suppliedTgz);
      if (!existsSync(suppliedPath)) throw new Error(`The supplied Stage 0 candidate TGZ does not exist: ${suppliedPath}`);
      const suppliedBytes = await readFile(suppliedPath);
      tgz = path.join(packDirectory, 'provided-stage0-candidate.tgz');
      await writeFile(tgz, suppliedBytes, { flag: 'wx' });
      acquisition = 'provided-exact-stage0-tgz';
    } else {
      const packed = runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory], {
        cwd: sourceRoot, env: environment, label: 'pack exact source commit',
      });
      const metadata = JSON.parse(packed.stdout);
      if (!Array.isArray(metadata) || metadata.length !== 1 || typeof metadata[0]?.filename !== 'string') throw new Error('npm pack did not return one package filename.');
      tgz = path.join(packDirectory, metadata[0].filename);
      acquisition = 'clean-source-pack';
    }
    const archive = await inspectTgz(tgz);
    archive.acquisition = acquisition;

    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline', '--prefix', prefix, tgz], {
      cwd: base, env: environment, label: 'install exact TGZ into isolated prefix',
    });
    if (sha256(await readFile(tgz)) !== archive.sha256) throw new Error('The private Stage 0 TGZ snapshot changed while npm installed it.');
    const installedCli = path.join(prefix, 'node_modules', 'vibetether', 'bin', 'vibetether.mjs');
    const installedRoot = path.join(prefix, 'node_modules', 'vibetether');
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
    await mkdir(path.join(project, 'docs', 'adr'), { recursive: true });
    await mkdir(path.join(project, 'docs', 'ui'), { recursive: true });
    await Promise.all([
      writeFile(path.join(project, 'README.md'), '# Product\n\nCandidate dark mode and SSO notes.\n'),
      writeFile(path.join(project, 'docs', 'requirements.md'), '# Requirements\n\nCandidate requirements only.\n'),
      writeFile(path.join(project, 'docs', 'adr', '0001.md'), '# ADR\n\nCandidate architecture only.\n'),
      writeFile(path.join(project, 'docs', 'ui', 'reference.md'), '# UI reference\n\nCandidate visual reference only.\n'),
      writeFile(path.join(project, 'docs', 'old-plan.md'), '# Old plan\n\nHistorical plan only.\n'),
    ]);
    runGit(project, ['add', '.']);
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

    const truth = runJsonCli(installedCli, project, guardedEnvironment, ['truth', 'list', '--project', project]).body;
    const intent = await readFile(path.join(project, '.vibetether', 'intent.md'), 'utf8');
    const entrySkills = (await readdir(path.join(project, '.agents', 'skills'))).sort();
    const freshContract = {
      truth_confirmed: truth.confirmed?.length ?? 0,
      truth_candidates: truth.candidates?.length ?? 0,
      truth_declined: truth.declined?.length ?? 0,
      repository_documents_activated: [...(truth.confirmed ?? []), ...(truth.candidates ?? []), ...(truth.declined ?? [])].length > 0,
      intent_only_explicit: intent.includes('Prove the isolated exact package control journey.')
        && intent.includes('The installed package preserves true completion boundaries.')
        && !/dark mode|SSO|Candidate requirements|Candidate architecture|Historical plan/i.test(intent),
      entry_skills: entrySkills,
      requested_entry_skills_only: JSON.stringify(entrySkills) === JSON.stringify(['vibe-tether', 'vibe-tether-deep']),
    };

    const capabilityCoverage = await exerciseCapabilityCoverage(installedCli, installedRoot, project, guardedEnvironment);
    const providers = await exerciseProviderProfiles(installedCli, base, guardedEnvironment);
    const customRoutes = await exerciseCustomRoutes(installedCli, base, guardedEnvironment);
    const upgradeContract = await exerciseUpgrade(installedCli, base, guardedEnvironment);
    const provenPath = await exerciseProvenPath(installedCli, base, guardedEnvironment);

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
    const integrityTamperRejected = await exerciseProviderTamper(installedCli, installedRoot, project, guardedEnvironment);
    providers.integrity_tamper_rejected = integrityTamperRejected;
    providers.runtime_download_directory_created ||= existsSync(path.join(project, '.vibetether', 'providers'));

    const detailedGreen = freshContract.intent_only_explicit && freshContract.requested_entry_skills_only
      && capabilityCoverage.complete && providers.runtime_download_directory_created === false && integrityTamperRejected
      && Object.entries(customRoutes).every(([, value]) => value === true)
      && upgradeContract.previewed && upgradeContract.applied && upgradeContract.user_routes_byte_preserved
      && upgradeContract.provider_choices_byte_preserved && upgradeContract.rollback_byte_exact
      && provenPath.recalled_when_matching && provenPath.artifact_change_invalidated
      && provenPath.skills_change_invalidated && provenPath.authority_change_invalidated;
    report = {
      ok: source.clean && archive.safe && goalBlockedAfterOneSlice && goalClosedAfterTwoSlices && releaseBlockedWithoutReleaseAuthorization
        && deepRevocationBlocksFinish && upgradePreviewed && uninstallPreservedModifiedContract && detailedGreen,
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
      runtime: {
        node: process.version,
        npm: process.env.npm_config_user_agent ?? null,
        platform: process.platform,
        arch: process.arch,
        os_release: os.release(),
      },
      journey_ids: [...STAGE0_PACKAGE_JOURNEYS],
      fresh_contract: freshContract,
      providers,
      custom_routes: customRoutes,
      upgrade: upgradeContract,
      proven_path: provenPath,
      capability_coverage: capabilityCoverage,
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
    cleanup = { completed: true, base_removed: !existsSync(base) };
  }
  report.cleanup = cleanup;
  report.ok &&= cleanup.completed && cleanup.base_removed;
  validateStage0PackageReport(report);
  return report;
}

try {
  const report = await main();
  process.stdout.write(`${json ? JSON.stringify(report, null, 2) : JSON.stringify({ ok: report.ok, journey: report.journey }, null, 2)}\n`);
  if (!report.ok) process.exitCode = 4;
} catch (error) {
  process.stderr.write(`VibeTether exact package journey failed: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
