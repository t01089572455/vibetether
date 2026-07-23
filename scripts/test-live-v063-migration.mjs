#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const sourceRoot = path.resolve(path.dirname(scriptPath), '..');
const repository = 'https://github.com/t01089572455/vibetether.git';
const tag = 'v0.6.3';
const LEGACY_V063 = Object.freeze({
  tag_object: '97b83c121ff09f716fd2e64db7c1ac3768e1c844',
  commit: '9097a0d7014740f592132f50bc41d203b0b80ee5',
  tree: '8e86433a819dc1a9be933284321932ce5be3f926',
  content_sha256: 'e19d3e4d3ece5d83b3bbd5fe0b04dbdda1e889731e8c741542e9627c4cd2c268',
});
const json = process.argv.includes('--json');
const requireLive = process.env.VIBETETHER_REQUIRE_LIVE_V063 === '1';
const commands = [];
let artifactRoot = null;
let commandIndex = 0;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function commandText(command, args) {
  return [command, ...args].map((item) => String(item)).join(' ');
}

class NetworkUnavailableError extends Error {
  constructor(message) { super(message); this.code='NETWORK_UNAVAILABLE'; }
}

function minimalEnvironment(overrides = {}) {
  const names=process.platform==='win32'
    ? ['PATH','PATHEXT','SystemRoot','WINDIR','COMSPEC','TEMP','TMP']
    : ['PATH','HOME','TMPDIR','TEMP','TMP','LANG','LC_ALL','LC_CTYPE'];
  const value={};
  for (const name of names) if (typeof process.env[name]==='string'&&process.env[name]) value[name]=process.env[name];
  return {...value,...overrides};
}

function saveRawCommandOutput(record, stdout, stderr) {
  if (!artifactRoot) return;
  const raw=path.join(artifactRoot,'raw-command-output');
  mkdirSync(raw,{recursive:true});
  const stem=`${String(commandIndex).padStart(3,'0')}-${record.label.replace(/[^a-z0-9._-]+/gi,'-').slice(0,80)}`;
  const stdoutPath=path.join(raw,`${stem}.stdout.txt`);
  const stderrPath=path.join(raw,`${stem}.stderr.txt`);
  writeFileSync(stdoutPath,stdout.slice(0,4*1024*1024),'utf8');
  writeFileSync(stderrPath,stderr.slice(0,4*1024*1024),'utf8');
  record.stdout_path=path.relative(artifactRoot,stdoutPath).replaceAll('\\','/');
  record.stderr_path=path.relative(artifactRoot,stderrPath).replaceAll('\\','/');
}

function npmCli(name) {
  const fromNpm = process.env.npm_execpath ? path.join(path.dirname(process.env.npm_execpath), `${name}-cli.js`) : null;
  if (fromNpm && existsSync(fromNpm)) return fromNpm;
  const bundled = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', `${name}-cli.js`);
  if (existsSync(bundled)) return bundled;
  return null;
}

function npmInvocation(name, args) {
  const cli = npmCli(name);
  if (cli) return { command: process.execPath, args: [cli, ...args] };
  return { command: process.platform === 'win32' ? `${name}.cmd` : name, args };
}

function run(command, args, { cwd, env, allowed = [0], label = null, timeout = 120_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: minimalEnvironment(env),
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
  const status = Number.isInteger(result.status) ? result.status : 1;
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  const record={
    label: label ?? path.basename(command),
    command: commandText(command, args),
    exit_code: status,
    stdout_sha256: sha256(Buffer.from(stdout)),
    stderr_sha256: sha256(Buffer.from(stderr)),
  };
  commandIndex+=1;
  saveRawCommandOutput(record,stdout,stderr);
  commands.push(record);
  if (!allowed.includes(status)) {
    const message=`${label ?? command} exited ${status}: ${(result.error?.message || stderr || stdout).trim()}`;
    if (isNetworkFailure(message)) throw new NetworkUnavailableError(message);
    throw new Error(message);
  }
  return { status, stdout, stderr, error: result.error ?? null };
}

function runNpm(args, options = {}) {
  const invocation = npmInvocation('npm', args);
  return run(invocation.command, invocation.args, { ...options, label: options.label ?? `npm ${args[0]}` });
}

function runGit(project, args, env = {}) {
  return run('git', args, { cwd: project, env, label: `git ${args[0]}` });
}

function runCandidate(installedCli, project, env, args, { allowed = [0] } = {}) {
  const result = run(process.execPath, [installedCli, ...args, '--json'], {
    cwd: project, env, allowed, label: `candidate vibetether ${args.slice(0, 2).join(' ')}`,
  });
  let body = null;
  if (result.stdout.trim()) {
    try { body = JSON.parse(result.stdout); }
    catch (error) { throw new Error(`Candidate CLI emitted invalid JSON for ${args.join(' ')}: ${error.message}\n${result.stdout}`); }
  }
  return { ...result, body };
}

function runLegacy(legacyCli, project, env, args) {
  const result = run(process.execPath, [legacyCli, ...args], {
    cwd: project, env, label: 'exact pinned v0.6.3 CLI', timeout: 180_000,
  });
  return result;
}

function isNetworkFailure(value) {
  return /unable to access|could not resolve|tls|ssl|handshake|connection|network|timed? ?out|econn|enotfound|eai_again|offline|certificate/i.test(value);
}

function probeTag() {
  const result=run('git',['ls-remote','--tags',repository,`refs/tags/${tag}`,`refs/tags/${tag}^{}`],{
    cwd:sourceRoot,env:{GIT_SSL_BACKEND:process.env.GIT_SSL_BACKEND??'openssl'},label:'resolve immutable v0.6.3 tag',timeout:30_000,
  });
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(/\s+/));
  const peeled = lines.find(([, ref]) => ref === `refs/tags/${tag}^{}`)?.[0];
  const direct = lines.find(([, ref]) => ref === `refs/tags/${tag}`)?.[0];
  const commit = peeled ?? direct;
  if (!/^[a-f0-9]{40}$/i.test(commit ?? '')) throw new Error(`Remote tag ${tag} did not resolve to an immutable commit.`);
  if (direct?.toLowerCase()!==LEGACY_V063.tag_object||commit.toLowerCase()!==LEGACY_V063.commit) {
    const error=new Error(`TAG_MOVED: ${tag} resolved tag object ${direct?.toLowerCase()??'missing'} and commit ${commit.toLowerCase()}, expected ${LEGACY_V063.tag_object} and ${LEGACY_V063.commit}.`);
    error.code='TAG_MOVED';
    throw error;
  }
  return { status: 'resolved', commit: LEGACY_V063.commit };
}

async function inventory(root, relative = '', output = []) {
  const directory = path.join(root, relative);
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!relative && entry.name === '.git') continue;
    const next = path.join(relative, entry.name);
    const target = path.join(root, next);
    const metadata = await stat(target);
    if (entry.isDirectory()) await inventory(root, next, output);
    else if (entry.isFile()) {
      const bytes = await readFile(target);
      output.push({ path: next.replaceAll('\\', '/'), kind: 'file', bytes: metadata.size, sha256: sha256(bytes) });
    } else throw new Error(`Unexpected legacy fixture object: ${next}`);
  }
  return output;
}

function sameInventory(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function inventoryDigest(value) {
  return sha256(Buffer.from(JSON.stringify(value)));
}

export async function retainRollbackEvidence(base, agent, {
  migrationId, rollbackResult, before, after,
}) {
  if (!['codex', 'claude', 'both'].includes(agent)) throw new Error(`Unsupported live v0.6.3 fixture agent: ${agent}.`);
  if (typeof migrationId !== 'string' || !migrationId) throw new Error(`Live v0.6.3 ${agent} migration id is missing.`);
  if (!rollbackResult || rollbackResult.migration_id !== migrationId || !['rolled-back', 'already-restored'].includes(rollbackResult.status)) {
    throw new Error(`Live v0.6.3 ${agent} rollback receipt is incomplete.`);
  }
  if (!sameInventory(before, after)) throw new Error(`Exact ${tag} ${agent} rollback inventory differs from its protected baseline.`);
  const directory = path.join(path.resolve(base), 'inventories');
  await mkdir(directory, { recursive: true });
  const beforeBytes = `${JSON.stringify(before, null, 2)}\n`;
  const afterBytes = `${JSON.stringify(after, null, 2)}\n`;
  const beforePath = path.join(directory, `${agent}-rollback-before.json`);
  const afterPath = path.join(directory, `${agent}-rollback-after.json`);
  await writeFile(beforePath, beforeBytes, 'utf8');
  await writeFile(afterPath, afterBytes, 'utf8');
  return {
    migration_id: migrationId,
    rollback_id: rollbackResult.migration_id,
    rollback_status: rollbackResult.status,
    rollback_result: 'restored',
    before_inventory: { path: beforePath, sha256: sha256(Buffer.from(beforeBytes)) },
    post_rollback_inventory: { path: afterPath, sha256: sha256(Buffer.from(afterBytes)) },
    post_rollback_matches: true,
  };
}

function outcome(id, acceptanceId, artifact) {
  const command = [process.execPath, '-e', `const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(artifact)},'utf8')!=='verified\\n')process.exit(7)`];
  return {
    id, title: `Validate ${id}`, authority_sources: ['truth:live-v063-fixture'], parent_id: null,
    dependencies: [], superseded_by: [], disposition: 'candidate', required_at: ['goal'],
    acceptance: [{
      id: acceptanceId, claim: `The migrated exact v0.6.3 project proves ${acceptanceId}.`, evidence_kind: 'command', required_maturity: 'functional',
      validator: { kind: 'command', command, validator_revision: `sha256:${sha256(Buffer.from(`${id}:${acceptanceId}:v1`))}`, covers_paths: [artifact] },
    }],
    decision_receipt: null, revision_digest: `sha256:${sha256(Buffer.from(`${id}:v1`))}`,
  };
}

function governOutcome(installedCli, project, env, item) {
  runCandidate(installedCli, project, env, ['outcomes', 'propose', '--project', project, '--outcome-json', JSON.stringify(item), '--yes']);
  runCandidate(installedCli, project, env, [
    'outcomes', 'confirm', '--project', project, '--id', item.id,
    '--user-message-locator', `user-message:live-v063-confirm-${item.id}`,
    '--reason', `The user confirmed ${item.id} as the only migration smoke-test outcome.`, '--yes',
  ]);
  runCandidate(installedCli, project, env, [
    'outcomes', 'coverage', 'confirm', '--project', project,
    '--user-message-locator', 'user-message:live-v063-confirm-coverage',
    '--reason', 'The user confirmed the exact one-outcome compatibility smoke-test boundary.', '--yes',
  ]);
}

async function satisfyOutcome(installedCli, project, env, item, artifact) {
  const acceptance = item.acceptance[0];
  const check = {
    id: `check-${acceptance.id}`, claim: acceptance.claim, kind: 'command', command: acceptance.validator.command,
    covers_paths: [artifact], consumer_paths: [artifact], acceptance_ids: [acceptance.id],
  };
  const started = runCandidate(installedCli, project, env, [
    'step', 'start', '--project', project, '--phase', 'EXECUTE_ONE', '--capability', 'implementation',
    '--task', 'Prove the migrated project can complete one bounded compatibility outcome.',
    '--slice', 'Complete only the migration smoke-test outcome.', '--outcome', item.id, '--path', artifact,
    '--success-evidence', acceptance.claim, '--success-check-json', JSON.stringify(check), '--signal', 'known-small-fix', '--code-write',
    '--confirmed-by-user', '--decision-reason', 'The user approved only this bounded migration compatibility smoke-test slice.',
  ]).body;
  await writeFile(path.join(project, artifact), 'verified\n');
  const proofs = [];
  for (const output of started.route.required_outputs ?? []) proofs.push('--output-proof-json', JSON.stringify({
    output, check_ids: [check.id], summary: 'The exact candidate command verifies this migrated product artifact.', artifact_paths: [artifact],
  }));
  for (const criterion of started.route.exit_evidence ?? []) proofs.push('--exit-proof-json', JSON.stringify({
    criterion, check_ids: [check.id], summary: 'The exact candidate command passed on final migrated project bytes.', artifact_paths: [artifact],
  }));
  runCandidate(installedCli, project, env, ['step', 'finish', '--project', project, ...proofs]);
}

async function prepareCandidate(base, environment) {
  const pack = path.join(base, 'candidate-pack');
  const prefix = path.join(base, 'candidate-prefix');
  await Promise.all([pack, prefix].map((target) => mkdir(target, { recursive: true })));
  const readIdentity = () => {
    const commit = runGit(sourceRoot, ['rev-parse', 'HEAD'], environment).stdout.trim();
    const tree = runGit(sourceRoot, ['rev-parse', 'HEAD^{tree}'], environment).stdout.trim();
    const root = path.resolve(runGit(sourceRoot, ['rev-parse', '--show-toplevel'], environment).stdout.trim());
    const committedAt = new Date(runGit(sourceRoot, ['show', '-s', '--format=%cI', 'HEAD'], environment).stdout.trim()).toISOString();
    const clean = runGit(sourceRoot, ['status', '--porcelain=v1'], environment).stdout.trim() === '';
    return { repository: root, commit, tree, committed_at: committedAt, clean };
  };
  const before = readIdentity();
  if (!before.clean) throw new Error('Candidate repository is dirty before live v0.6.3 migration evidence.');
  let tgz;
  let acquisition;
  const supplied = process.env.VIBETETHER_STAGE0_CANDIDATE_TGZ;
  if (supplied) {
    tgz = path.resolve(supplied);
    if (!existsSync(tgz)) throw new Error('VIBETETHER_STAGE0_CANDIDATE_TGZ does not exist.');
    acquisition = 'provided-exact-stage0-tgz';
  } else {
    const packed = runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', pack], {
      cwd: sourceRoot, env: environment, label: 'pack candidate for live v0.6.3 migration',
    });
    const metadata = JSON.parse(packed.stdout);
    if (!Array.isArray(metadata) || metadata.length !== 1 || typeof metadata[0]?.filename !== 'string') throw new Error('Candidate npm pack did not produce one TGZ.');
    tgz = path.join(pack, metadata[0].filename);
    acquisition = 'clean-source-pack';
  }
  const tgzSha256 = sha256(await readFile(tgz));
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline', '--prefix', prefix, tgz], {
    cwd: base, env: environment, label: 'install candidate TGZ for live v0.6.3 migration',
  });
  const installedCli = path.join(prefix, 'node_modules', 'vibetether', 'bin', 'vibetether.mjs');
  if (!existsSync(installedCli)) throw new Error('Candidate TGZ installation does not contain vibetether.mjs.');
  const after = readIdentity();
  if (!after.clean || before.repository !== after.repository || before.commit !== after.commit || before.tree !== after.tree
      || before.committed_at !== after.committed_at) throw new Error('Candidate Git identity changed while preparing live v0.6.3 evidence.');
  return {
    installedCli,
    repository: before.repository,
    commit: before.commit,
    tree: before.tree,
    committed_at: before.committed_at,
    clean_before: before.clean,
    clean_after: after.clean,
    tgz_sha256: tgzSha256,
    acquisition,
  };
}

async function preparePinnedLegacy(base, environment) {
  const source=path.join(base,'legacy-source');
  await mkdir(source,{recursive:true});
  runGit(source,['init','-q'],environment);
  runGit(source,['config','core.autocrlf','false'],environment);
  runGit(source,['config','core.eol','lf'],environment);
  runGit(source,['fetch','--depth=1',repository,LEGACY_V063.commit],environment);
  const commit=runGit(source,['rev-parse','FETCH_HEAD'],environment).stdout.trim().toLowerCase();
  const tree=runGit(source,['rev-parse','FETCH_HEAD^{tree}'],environment).stdout.trim().toLowerCase();
  if (commit!==LEGACY_V063.commit) {
    const error=new Error(`Pinned v0.6.3 fetch resolved ${commit}, expected ${LEGACY_V063.commit}.`);
    error.code='LEGACY_COMMIT_MISMATCH';
    throw error;
  }
  if (tree!==LEGACY_V063.tree) {
    const error=new Error(`Pinned v0.6.3 tree resolved ${tree}, expected ${LEGACY_V063.tree}.`);
    error.code='LEGACY_TREE_MISMATCH';
    throw error;
  }
  runGit(source,['checkout','--detach','-q','FETCH_HEAD'],environment);
  const sourceInventory=await inventory(source);
  const contentSha256=inventoryDigest(sourceInventory);
  if (contentSha256!==LEGACY_V063.content_sha256) {
    const error=new Error(`Pinned v0.6.3 content digest resolved ${contentSha256}, expected ${LEGACY_V063.content_sha256}.`);
    error.code='LEGACY_CONTENT_MISMATCH';
    throw error;
  }
  // npm ci consumes the pinned package-lock integrity records. Scripts stay
  // disabled, so the historical package cannot run lifecycle hooks during
  // acquisition. The exact checked-out CLI is then the only legacy code run.
  runNpm(['ci','--ignore-scripts','--no-audit','--no-fund','--omit=dev'],{
    cwd:source,env:environment,label:'install pinned v0.6.3 lockfile dependencies without scripts',
  });
  const cli=path.join(source,'bin','vibetether.mjs');
  if (!existsSync(cli)) throw new Error('Verified pinned v0.6.3 source does not contain vibetether.mjs.');
  return {cli,commit,tree,content_sha256:contentSha256,inventory_files:sourceInventory.length,dependency_install:'npm-ci-lockfile-ignore-scripts'};
}

async function oneFixture(base, installedCli, legacyCli, agent, environment) {
  const env = {
    ...environment,
    VIBETETHER_STATE_HOME: path.join(base, `state-${agent}`),
    VIBETETHER_CACHE_HOME: path.join(base, `cache-${agent}`),
    VIBETETHER_CONFIG_HOME: path.join(base, `config-${agent}`),
    VIBETETHER_RUNTIME_HOME: path.join(base, `runtime-${agent}`),
  };
  async function createLegacy(kind) {
    const project = path.join(base, `legacy-${agent}-${kind}`);
    await mkdir(project, { recursive: true });
    runGit(project, ['init', '-q'], env);
    runGit(project, ['config', 'user.email', 'live-v063@example.test'], env);
    runGit(project, ['config', 'user.name', 'VibeTether Live v0.6.3'], env);
    await mkdir(path.join(project, 'docs'), { recursive: true });
    await writeFile(path.join(project, 'docs', 'legacy-crlf-notes.md'), 'legacy line one\r\nlegacy line two\r\n', 'utf8');
    await writeFile(path.join(project, 'app.txt'), 'legacy fixture\n', 'utf8');
    runGit(project, ['add', '.'], env);
    runGit(project, ['commit', '-qm', `legacy ${agent} ${kind} fixture`], env);
    runLegacy(legacyCli, project, env, [
      'init', '--project', project, '--agent', agent, '--profile', 'core', '--no-auto-bundles', '--yes',
      '--goal', `Validate exact ${tag} ${agent} migration.`,
      '--success-evidence', 'The candidate migrates, controls one outcome, and restores exact legacy bytes.',
    ]);
    return { project, before: await inventory(project) };
  }

  const controlled = await createLegacy('controlled');
  const migrated = runCandidate(installedCli, controlled.project, env, ['migrate', '--project', controlled.project, '--agent', agent, '--yes']).body;
  if (!migrated?.migration_id) throw new Error(`Candidate migration did not return a migration id for ${agent}.`);
  const context = runCandidate(installedCli, controlled.project, env, ['context', '--project', controlled.project, '--boundary', 'task-entry']).body;
  if (!context || context.blockers?.some((item) => item.code === 'INTENT_UNCONFIRMED')) throw new Error(`Migrated ${agent} Context is not usable.`);
  const item = outcome(`outcome_live_v063_${agent}`, `acceptance_live_v063_${agent}`, `live-${agent}-result.txt`);
  governOutcome(installedCli, controlled.project, env, item);
  await satisfyOutcome(installedCli, controlled.project, env, item, `live-${agent}-result.txt`);
  const doctor = runCandidate(installedCli, controlled.project, env, ['doctor', '--project', controlled.project, '--boundary', 'goal']).body;
  if (doctor?.ok !== true || doctor?.completion?.label !== 'GOAL_ENGINEERING_CLOSED') throw new Error(`Migrated ${agent} project did not close the bounded Outcome-controlled smoke goal.`);

  const rollback = await createLegacy('rollback');
  const rollbackMigration = runCandidate(installedCli, rollback.project, env, ['migrate', '--project', rollback.project, '--agent', agent, '--yes']).body;
  const rollbackResult = runCandidate(installedCli, rollback.project, env, ['migrate', 'rollback', '--project', rollback.project, '--id', rollbackMigration.migration_id, '--yes']).body;
  const after = await inventory(rollback.project);
  const rollbackEvidence = await retainRollbackEvidence(base, agent, {
    migrationId: rollbackMigration.migration_id,
    rollbackResult,
    before: rollback.before,
    after,
  });

  const conflictProject = await createLegacy('post-migration-edit');
  const conflictMigration = runCandidate(installedCli, conflictProject.project, env, ['migrate', '--project', conflictProject.project, '--agent', agent, '--yes']).body;
  const protectedPath = agent === 'claude' ? path.join(conflictProject.project, 'CLAUDE.md') : path.join(conflictProject.project, 'AGENTS.md');
  await writeFile(protectedPath, `${await readFile(protectedPath, 'utf8')}\nUser edit after candidate migration.\n`, 'utf8');
  const conflict = runCandidate(installedCli, conflictProject.project, env, [
    'migrate', 'rollback', '--project', conflictProject.project, '--id', conflictMigration.migration_id, '--yes',
  ], { allowed: [3] });
  const preserved = (await readFile(protectedPath, 'utf8')).includes('User edit after candidate migration.');
  if (conflict.status !== 3 || !preserved) throw new Error(`Rollback conflict did not preserve the post-migration ${agent} user edit.`);
  return {
    agent,
    controlled_migration_id: migrated.migration_id,
    conflict_migration_id: conflictMigration.migration_id,
    ...rollbackEvidence,
    before_files: rollback.before.length,
    byte_identical_normal_rollback: true,
    crlf_fixture_sha256: rollback.before.find((item) => item.path === 'docs/legacy-crlf-notes.md')?.sha256 ?? null,
    context_readable: true,
    outcome_controlled_slice: true,
    conflict_preserved_post_migration_edit: true,
  };
}

async function main() {
  const requestedRoot=process.env.VIBETETHER_LIVE_V063_ARTIFACT_DIR;
  const base=requestedRoot
    ? path.join(path.resolve(requestedRoot),`run-${Date.now()}-${process.pid}`)
    : await mkdtemp(path.join(os.tmpdir(), 'vibetether-live-v063-'));
  artifactRoot=base;
  await mkdir(base,{recursive:true});
  let report;
  try {
    const environment = {
      HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'), APPDATA: path.join(base, 'appdata'), LOCALAPPDATA: path.join(base, 'localappdata'),
      TEMP: path.join(base, 'temp'), TMP: path.join(base, 'temp'), npm_config_cache: path.join(base, 'npm-cache'), npm_config_userconfig: path.join(base, 'npmrc'),
      VIBETETHER_USER_HOME: path.join(base, 'home'), GIT_SSL_BACKEND: process.env.GIT_SSL_BACKEND ?? 'openssl',
    };
    await Promise.all([environment.HOME, environment.TEMP].map((target) => mkdir(target, { recursive: true })));
    const resolved = probeTag();
    const legacy=await preparePinnedLegacy(base,environment);
    const candidate = await prepareCandidate(base, environment);
    const fixtures = [];
    for (const agent of ['codex', 'claude', 'both']) fixtures.push(await oneFixture(base, candidate.installedCli, legacy.cli, agent, environment));
    report={
      schema_version: 1, status: 'pass', ok: true, tag, resolved_commit: resolved.commit, legacy:{...LEGACY_V063,...legacy},
      candidate: {
        repository: candidate.repository,
        commit: candidate.commit,
        tree: candidate.tree,
        committed_at: candidate.committed_at,
        clean_before: candidate.clean_before,
        clean_after: candidate.clean_after,
        tgz_sha256: candidate.tgz_sha256,
        acquisition: candidate.acquisition,
      },
      candidate_tgz_sha256: candidate.tgz_sha256, fixtures, commands,
    };
    return report;
  } catch (error) {
    const network=error?.code==='NETWORK_UNAVAILABLE'||isNetworkFailure(String(error?.message??''));
    report={
      schema_version:1,status:network?'not-run':'fail',ok:false,tag,repository,legacy:LEGACY_V063,
      reason:network?'network-or-remote-unavailable':error?.code??'LIVE_V063_FAILED',
      failure:{code:error?.code??null,message:String(error?.message??error)},artifact_dir:base,commands,
    };
    return report;
  } finally {
    const keep=process.env.VIBETETHER_LIVE_V063_KEEP_ARTIFACTS==='1';
    if (report?.status==='pass'&&!keep) {
      for (const command of commands) { delete command.stdout_path; delete command.stderr_path; }
      report.artifact_retained=false;
      await rm(base,{recursive:true,force:true});
    } else if (report) {
      report.artifact_retained=true;
      report.artifact_dir=base;
      await writeFile(path.join(base,'live-v063-report.json'),`${JSON.stringify(report,null,2)}\n`,'utf8');
    }
    artifactRoot=null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) {
  try {
    const report = await main();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status === 'not-run' && requireLive) process.exitCode = 4;
    else if (report.status !== 'pass' && report.status !== 'not-run') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`VibeTether live v0.6.3 migration failed: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
