import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cp, lstat, mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { ADAPTERS, managedBlock, selectedAdapters } from './adapters.mjs';
import { MANAGED_END, MANAGED_START, VERSION } from './constants.mjs';
import { discoverContract } from './contract.mjs';
import { conflictError } from './errors.mjs';
import {
  atomicJson, canonicalJson, copyVerifiedDirectory, exists, hashTree, portableTextEqual,
  readJsonFile, readTextIfPresent, rejectAbsoluteSymlinkChain, sha256File, transactionalWrites,
} from './files.mjs';
import { gitIdentity } from './git.mjs';
import { renderProjectLauncher } from './launcher.mjs';
import { cacheRuntimePackage } from './release-cache.mjs';
import { inspectLease, readRoute, runtimePaths } from './runtime.mjs';
import { stateHome } from './paths.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RC1_BODY = `Use the \`vibe-tether\` Skill at task entry, after compaction or resume, before a consequential decision, and before completion or handoff.\n\nRun \`vibetether context --boundary <boundary> --json\` before reading VibeTether state. Follow only its confirmed truth handles, current slice, blockers, selected provider, and fresh applicable experience.\n\nDo not read raw VibeTether runtime state, provider catalogs, unselected Skills, or unselected experience. Do not alter project direction or activate project truth without the required user confirmation.`;
const RC1_BLOCK = `${MANAGED_START}\n${RC1_BODY}\n${MANAGED_END}`;

function legacyProjectLauncher(version) {
  return `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(import.meta.url);
const manifestPath = path.join(path.dirname(launcher), 'project.json');
let version = ${JSON.stringify(version)};
try {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!/^\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.vibetether_version)) throw new Error('invalid version');
  version = manifest.vibetether_version;
} catch {
  process.stderr.write('VibeTether project launcher cannot read a valid pinned project version.\\n');
  process.exit(3);
}
const packageSpec = process.env.VIBETETHER_CLI_PACKAGE || \`https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v\${version}\`;
const commandArgs = ['--yes', \`--package=\${packageSpec}\`, 'vibetether', ...process.argv.slice(2)];
let executable = 'npx';
let args = commandArgs;
if (process.platform === 'win32') {
  const candidates = [
    process.env.npm_execpath ? path.join(path.dirname(process.env.npm_execpath), 'npx-cli.js') : null,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ].filter(Boolean);
  const npxCli = candidates.find((candidate) => existsSync(candidate));
  if (!npxCli) {
    process.stderr.write('VibeTether requires Node.js with npm/npx available.\\n');
    process.exit(127);
  }
  executable = process.execPath;
  args = [npxCli, ...commandArgs];
}
const result = spawnSync(executable, args, { stdio: 'inherit', shell: false, windowsHide: true });
if (result.error) {
  process.stderr.write('VibeTether could not start the pinned package.\\n');
  process.exit(127);
}
process.exit(typeof result.status === 'number' ? result.status : 1);
`;
}

function parseVersion(value) {
  const match = String(value ?? '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) throw conflictError(`Unsupported VibeTether version: ${value}`, 'UPGRADE_NOT_APPLICABLE');
  return { core: match.slice(1, 4).map(Number), pre: match[4]?.split('.') ?? [] };
}

function compareVersions(left, right) {
  const a = parseVersion(left); const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
  if (!a.pre.length && !b.pre.length) return 0;
  if (!a.pre.length) return 1;
  if (!b.pre.length) return -1;
  const length = Math.max(a.pre.length, b.pre.length);
  for (let index = 0; index < length; index += 1) {
    if (a.pre[index] === undefined) return -1;
    if (b.pre[index] === undefined) return 1;
    const leftNumeric = /^\d+$/.test(a.pre[index]);
    const rightNumeric = /^\d+$/.test(b.pre[index]);
    if (leftNumeric && rightNumeric) {
      const difference = Number(a.pre[index]) - Number(b.pre[index]);
      if (difference) return difference < 0 ? -1 : 1;
    } else if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    else if (a.pre[index] !== b.pre[index]) return a.pre[index] < b.pre[index] ? -1 : 1;
  }
  return 0;
}

function extractManagedBlock(source, label) {
  const content = source ?? '';
  const starts = content.split(MANAGED_START).length - 1;
  const ends = content.split(MANAGED_END).length - 1;
  if (starts !== 1 || ends !== 1) throw conflictError(`${label} must contain exactly one VibeTether managed block.`, 'MANAGED_BLOCK_CONFLICT');
  const start = content.indexOf(MANAGED_START);
  const end = content.indexOf(MANAGED_END, start) + MANAGED_END.length;
  return { block: content.slice(start, end), start, end };
}

function replaceKnownManagedBlock(source, label) {
  const located = extractManagedBlock(source, label);
  if (![managedBlock(), RC1_BLOCK].some((candidate) => portableTextEqual(located.block, candidate))) {
    throw conflictError(`${label} managed instruction block was modified; preserve the customization and upgrade it deliberately.`, 'MANAGED_BLOCK_CONFLICT');
  }
  return `${source.slice(0, located.start)}${managedBlock()}${source.slice(located.end)}`;
}

function itemTarget(record, item) {
  const base = item.base === 'contract' ? record.contract_root : record.execution_root;
  return path.join(base, ...item.relative.split('/'));
}

async function itemState(target) {
  if (!await exists(target)) return { existed: false, kind: null, digest: null };
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink()) throw conflictError(`Upgrade refuses linked asset: ${target}`, 'UNSAFE_PATH');
  if (metadata.isDirectory()) return { existed: true, kind: 'directory', digest: await hashTree(target) };
  if (metadata.isFile()) return { existed: true, kind: 'file', digest: await sha256File(target) };
  throw conflictError(`Upgrade requires a regular file or directory: ${target}`, 'UNSAFE_FILE');
}

async function inventoryItems(record, items) {
  const output = {};
  for (const item of items) output[item.key] = await itemState(itemTarget(record, item));
  return output;
}

function sameInventory(left, right) { return canonicalJson(left) === canonicalJson(right); }

function recordRoot(id) { return path.join(stateHome(), 'upgrades', id); }

async function copyItem(source, destination, kind) {
  await mkdir(path.dirname(destination), { recursive: true });
  if (kind === 'directory') {
    const digest = await hashTree(source);
    await copyVerifiedDirectory(source, destination, digest);
    return;
  }
  await cp(source, destination, { errorOnExist: true, force: false });
  if (await sha256File(source) !== await sha256File(destination)) throw conflictError(`Upgrade backup verification failed: ${source}`, 'UPGRADE_BACKUP_FAILED');
}

async function backupItems(record, items) {
  const root = recordRoot(record.id);
  const backup = path.join(root, 'backup');
  await mkdir(backup, { recursive: true });
  const inventory = await inventoryItems(record, items);
  const manifest = { schema_version: 1, items: {}, before_inventory: inventory };
  for (const item of items) {
    const state = inventory[item.key];
    manifest.items[item.key] = { ...item, ...state };
    if (!state.existed) continue;
    await copyItem(itemTarget(record, item), path.join(backup, item.base, ...item.relative.split('/')), state.kind);
  }
  await atomicJson(path.join(backup, 'backup-manifest.json'), manifest);
  return { backup, manifest };
}

async function restoreItems(record, backup, { expectedCurrent = null } = {}) {
  const manifest = await readJsonFile(path.join(backup, 'backup-manifest.json'), 'Upgrade backup manifest');
  const items = Object.values(manifest.items);
  if (expectedCurrent) {
    const current = await inventoryItems(record, items);
    if (!sameInventory(current, expectedCurrent)) {
      if (sameInventory(current, manifest.before_inventory)) return { status: 'already-restored' };
      const conflict = path.join(recordRoot(record.id), `rollback-conflict-${Date.now()}`);
      await mkdir(conflict, { recursive: true });
      for (const item of items) {
        const source = itemTarget(record, item);
        if (!await exists(source)) continue;
        await copyItem(source, path.join(conflict, item.base, ...item.relative.split('/')), (await itemState(source)).kind);
      }
      throw conflictError(`Upgrade rollback stopped because managed assets changed after upgrade. Current bytes were preserved at ${conflict}.`, 'ROLLBACK_CONFLICT');
    }
  }
  const transactions = new Map();
  const moved = [];
  const restored = [];
  try {
    for (const item of items) {
      const target = itemTarget(record, item);
      if (!await exists(target)) continue;
      const base = item.base === 'contract' ? record.contract_root : record.execution_root;
      let transaction = transactions.get(base);
      if (!transaction) {
        transaction = path.join(base, `.vibetether-upgrade-rollback-${randomUUID()}`);
        await mkdir(transaction, { recursive: true });
        transactions.set(base, transaction);
      }
      const held = path.join(transaction, item.base, ...item.relative.split('/'));
      await mkdir(path.dirname(held), { recursive: true });
      await rename(target, held);
      moved.push({ target, held });
    }
    for (const item of items) {
      const state = manifest.items[item.key];
      if (!state.existed) continue;
      const stored = path.join(backup, item.base, ...item.relative.split('/'));
      if (!await exists(stored)) throw conflictError(`Upgrade backup is missing ${item.key}.`, 'ROLLBACK_FAILED');
      const target = itemTarget(record, item);
      await copyItem(stored, target, state.kind);
      restored.push(target);
    }
    const actual = await inventoryItems(record, items);
    if (!sameInventory(actual, manifest.before_inventory)) throw conflictError('Restored upgrade bytes do not match the pre-upgrade inventory.', 'ROLLBACK_FAILED');
    for (const transaction of transactions.values()) await rm(transaction, { recursive: true, force: true });
    return { status: 'restored' };
  } catch (cause) {
    const errors = [];
    for (const target of restored.reverse()) await rm(target, { recursive: true, force: true }).catch((error) => errors.push(error.message));
    for (const item of moved.reverse()) {
      if (!await exists(item.held)) continue;
      await mkdir(path.dirname(item.target), { recursive: true });
      await rename(item.held, item.target).catch((error) => errors.push(error.message));
    }
    for (const transaction of transactions.values()) await rm(transaction, { recursive: true, force: true }).catch(() => {});
    if (errors.length) throw conflictError(`Upgrade rollback failed and recovery was incomplete: ${errors.join('; ')}`, 'ROLLBACK_FAILED');
    throw cause;
  }
}

function upgradeItems(context, adapters) {
  const items = [
    { key: 'contract:manifest', base: 'contract', relative: '.vibetether/project.json' },
    { key: 'contract:launcher', base: 'contract', relative: context.manifest.launcher },
  ];
  for (const adapter of adapters) {
    const config = ADAPTERS[adapter];
    items.push(
      { key: `host:${adapter}:instructions`, base: 'host', relative: config.instruction },
      { key: `host:${adapter}:skill`, base: 'host', relative: path.posix.dirname(config.skill) },
      { key: `host:${adapter}:deep-skill`, base: 'host', relative: path.posix.dirname(config.deepSkill) },
    );
  }
  return items;
}

async function assertNoActiveWork(context) {
  const identity = await gitIdentity(context.executionRoot);
  const identities = [identity];
  if (identity?.legacy_common_id && identity?.legacy_worktree_id
      && (identity.legacy_common_id !== identity.common_id || identity.legacy_worktree_id !== identity.worktree_id)) {
    identities.push({ ...identity, common_id: identity.legacy_common_id, worktree_id: identity.legacy_worktree_id });
  }
  for (const candidate of identities) {
    const paths = runtimePaths(context, candidate);
    const route = await readRoute(paths, { allowMissing: true });
    if (route?.status === 'active') throw conflictError('Finish or abandon the active step before upgrading.', 'ACTIVE_STEP_REQUIRED');
    const lease = await inspectLease(paths);
    if (lease && Date.parse(lease.expires_at ?? '') > Date.now()) throw conflictError('Release the active writer lease before upgrading.', 'LEASE_HELD');
  }
}

async function validateUpgradeSurface(context, adapters) {
  const entryRoot = path.join(packageRoot, 'skills', 'vibe-tether');
  const deepRoot = path.join(packageRoot, 'skills', 'vibe-tether-deep');
  const entryDigest = await hashTree(entryRoot);
  const deepDigest = await hashTree(deepRoot);
  for (const adapter of adapters) {
    const config = ADAPTERS[adapter];
    const instructions = await readTextIfPresent(path.join(context.executionRoot, config.instruction));
    if (instructions === null) throw conflictError(`Upgrade requires ${config.instruction}.`, 'UPGRADE_SURFACE_MISSING');
    extractManagedBlock(instructions, config.instruction);
    replaceKnownManagedBlock(instructions, config.instruction);
    const skillRoot = path.join(context.executionRoot, path.dirname(config.skill));
    if (!await exists(skillRoot) || await hashTree(skillRoot) !== entryDigest) throw conflictError(`Refusing to upgrade a different or modified entry Skill: ${path.posix.dirname(config.skill)}`, 'FILE_COLLISION');
    const deepSkillRoot = path.join(context.executionRoot, path.dirname(config.deepSkill));
    if (await exists(deepSkillRoot) && await hashTree(deepSkillRoot) !== deepDigest) throw conflictError(`Refusing to upgrade a different or modified deep entry Skill: ${path.posix.dirname(config.deepSkill)}`, 'FILE_COLLISION');
  }
  const launcherPath = path.join(context.root, ...context.manifest.launcher.split('/'));
  const launcher = await readTextIfPresent(launcherPath);
  if (launcher === null) throw conflictError(`Project launcher is missing: ${context.manifest.launcher}`, 'UPGRADE_SURFACE_MISSING');
  const acceptedLaunchers = [renderProjectLauncher(context.manifest.vibetether_version), legacyProjectLauncher(context.manifest.vibetether_version)];
  if (!acceptedLaunchers.some((candidate) => portableTextEqual(launcher, candidate))) throw conflictError(`Refusing to overwrite modified project launcher: ${context.manifest.launcher}`, 'FILE_COLLISION');
}

async function upgradeContext(options = {}) {
  const context = await discoverContract(options.project ?? process.cwd());
  const relation = compareVersions(context.manifest.vibetether_version, VERSION);
  if (relation > 0) throw conflictError(`Project expects newer VibeTether ${context.manifest.vibetether_version}; this runtime is ${VERSION}.`, 'UPGRADE_NOT_APPLICABLE');
  if (context.manifest.vibetether_version.startsWith('0.')) throw conflictError('VibeTether 0.x projects require `vibetether migrate`, not upgrade.', 'MIGRATION_REQUIRED');
  const adapters = selectedAdapters(options.agent ?? 'both');
  await assertNoActiveWork(context);
  await validateUpgradeSurface(context, adapters);
  return { context, adapters, relation };
}

export async function planUpgrade(options = {}) {
  const { context, adapters, relation } = await upgradeContext(options);
  const items = upgradeItems(context, adapters);
  return {
    schema_version: 1,
    status: relation === 0 ? 'current' : 'preview',
    project: context.executionRoot,
    contract_root: context.root,
    from_version: context.manifest.vibetether_version,
    to_version: VERSION,
    files: items.flatMap((item) => item.kind === 'directory' ? [] : [item.relative]).concat(adapters.flatMap((adapter) => [ADAPTERS[adapter].skill, ADAPTERS[adapter].deepSkill])).filter((value, index, values) => values.indexOf(value) === index),
    rollback: relation === 0 ? null : 'external verified backup with post-upgrade modification protection',
  };
}

export async function upgradeProject(options = {}) {
  const prepared = await upgradeContext(options);
  if (prepared.relation === 0) return { status: 'current', project: prepared.context.executionRoot, version: VERSION };
  if (!options.yes) throw conflictError('Upgrade requires --yes or --dry-run.', 'CONFIRMATION_REQUIRED');
  const context = prepared.context;
  const id = `upgrade-${randomUUID()}`;
  const record = {
    schema_version: 1,
    id,
    project: context.executionRoot,
    execution_root: context.executionRoot,
    contract_root: context.root,
    from_version: context.manifest.vibetether_version,
    to_version: VERSION,
    created_at: new Date().toISOString(),
    status: 'started',
  };
  const items = upgradeItems(context, prepared.adapters);
  const { backup, manifest: backupManifest } = await backupItems(record, items);
  record.backup = backup;
  record.before_inventory = backupManifest.before_inventory;
  const recordPath = path.join(recordRoot(id), 'upgrade.json');
  await atomicJson(recordPath, record);
  try {
    await cacheRuntimePackage({ version: VERSION });
    const nextManifest = { ...context.manifest, vibetether_version: VERSION, control_generation: randomUUID() };
    const plans = [
      { target: path.join(context.root, '.vibetether', 'project.json'), content: canonicalJson(nextManifest), mode: 0o644 },
      { target: path.join(context.root, ...context.manifest.launcher.split('/')), content: renderProjectLauncher(VERSION), mode: 0o755 },
    ];
    const entry = await readFile(path.join(packageRoot, 'skills', 'vibe-tether', 'SKILL.md'), 'utf8');
    const deep = await readFile(path.join(packageRoot, 'skills', 'vibe-tether-deep', 'SKILL.md'), 'utf8');
    for (const adapter of prepared.adapters) {
      const config = ADAPTERS[adapter];
      const instructions = path.join(context.executionRoot, config.instruction);
      plans.push({ target: instructions, content: replaceKnownManagedBlock(await readFile(instructions, 'utf8'), config.instruction), mode: 0o644 });
      plans.push({ target: path.join(context.executionRoot, ...config.skill.split('/')), content: entry, mode: 0o644 });
      plans.push({ target: path.join(context.executionRoot, ...config.deepSkill.split('/')), content: deep, mode: 0o644 });
    }
    await transactionalWrites(plans);
    const verified = await discoverContract(context.executionRoot);
    if (verified.manifest.vibetether_version !== VERSION || verified.manifest.control_generation !== nextManifest.control_generation) throw conflictError('Upgraded Project Contract did not validate.', 'UPGRADE_FAILED');
    record.output_inventory = await inventoryItems(record, items);
    record.status = 'applied';
    record.completed_at = new Date().toISOString();
    await atomicJson(recordPath, record);
    return { status: 'upgraded', upgrade_id: id, from_version: record.from_version, to_version: VERSION, project: context.executionRoot, rollback: `vibetether upgrade rollback --id ${id} --yes` };
  } catch (cause) {
    await restoreItems(record, backup).catch(() => {});
    record.status = 'rolled-back-after-failure';
    record.failure = String(cause.message);
    await atomicJson(recordPath, record).catch(() => {});
    throw cause;
  }
}

export async function rollbackUpgrade({ id, yes = false } = {}) {
  if (!yes) throw conflictError('Upgrade rollback requires --yes.', 'CONFIRMATION_REQUIRED');
  const recordPath = path.join(recordRoot(id), 'upgrade.json');
  const record = await readJsonFile(recordPath, 'Upgrade record');
  if (!['applied', 'rollback-conflict'].includes(record.status)) {
    if (record.status === 'rolled-back') return { status: 'already-restored', upgrade_id: id, project: record.project };
    throw conflictError(`Upgrade ${id} cannot be rolled back from status ${record.status}.`, 'UPGRADE_NOT_APPLICABLE');
  }
  const result = await restoreItems(record, record.backup, { expectedCurrent: record.output_inventory });
  record.status = 'rolled-back';
  record.rolled_back_at = new Date().toISOString();
  await atomicJson(recordPath, record);
  return { status: result.status === 'already-restored' ? 'already-restored' : 'rolled-back', upgrade_id: id, project: record.project };
}
