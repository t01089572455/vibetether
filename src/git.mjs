import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readlink, realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { conflictError } from './errors.mjs';
import { atomicJson, canonicalJson, hashTree, readJsonFile, withFileLock } from './files.mjs';

const exec = promisify(execFile);

function unavailable(error) {
  const diagnostic = String(error?.stderr ?? '');
  return error?.code === 'ENOENT' || /not a git repository/i.test(diagnostic);
}
function unborn(error) {
  return error?.code === 128 && /needed a single revision|unknown revision/i.test(String(error?.stderr ?? ''));
}

export async function runGit(cwd, args, { allowUnavailable = false, allowExit = [], allowFailure = null, binary = false } = {}) {
  try {
    const result = await exec('git', ['-C', cwd, ...args], {
      encoding: binary ? 'buffer' : 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
    });
    return result.stdout;
  } catch (error) {
    if ((allowUnavailable && unavailable(error)) || allowExit.includes(error.code) || (typeof allowFailure === 'function' && allowFailure(error))) return null;
    const diagnostic = String(error.stderr ?? error.stdout ?? '').trim().slice(0, 500);
    throw conflictError(`Git command failed${diagnostic ? `: ${diagnostic}` : ''}`, 'GIT_ERROR');
  }
}

function legacyLocatorId(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

async function stableGitId(directory, kind, { create = true } = {}) {
  const identityRoot = path.join(directory, 'vibetether');
  const target = path.join(identityRoot, `${kind}-id.json`);
  const validate = (record) => {
    if (!record || record.schema_version !== 1 || record.kind !== kind
        || typeof record.id !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.id)) {
      throw conflictError(`Git ${kind} identity record is invalid.`, 'RUNTIME_IDENTITY');
    }
    return record.id;
  };
  try { return validate(await readJsonFile(target, `Git ${kind} identity`)); }
  catch (error) {
    if (error.code !== 'MISSING_FILE') throw error;
    if (!create) return null;
  }
  await mkdir(identityRoot, { recursive: true });
  return withFileLock(path.join(identityRoot, `.${kind}-id.lock`), async () => {
    const prior = await readJsonFile(target, `Git ${kind} identity`, { allowMissing: true });
    if (prior) return validate(prior);
    const record = { schema_version: 1, kind, id: randomUUID(), created_at: new Date().toISOString() };
    await atomicJson(target, record);
    return record.id;
  });
}

export async function gitIdentity(cwd, { create = true } = {}) {
  const top = await runGit(cwd, ['rev-parse', '--show-toplevel'], { allowUnavailable: true });
  if (top === null) return null;
  const commonRaw = await runGit(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    allowFailure: (error) => /unknown option|unknown switch/i.test(String(error?.stderr ?? '')),
  });
  const privateRaw = await runGit(cwd, ['rev-parse', '--path-format=absolute', '--git-dir'], {
    allowFailure: (error) => /unknown option|unknown switch/i.test(String(error?.stderr ?? '')),
  });
  const fallbackCommon = commonRaw === null ? await runGit(cwd, ['rev-parse', '--git-common-dir']) : commonRaw;
  const fallbackPrivate = privateRaw === null ? await runGit(cwd, ['rev-parse', '--git-dir']) : privateRaw;
  const topRoot = await realpath(String(top).trim());
  const commonDir = await realpath(path.isAbsolute(String(fallbackCommon).trim()) ? String(fallbackCommon).trim() : path.resolve(cwd, String(fallbackCommon).trim()));
  const gitDir = await realpath(path.isAbsolute(String(fallbackPrivate).trim()) ? String(fallbackPrivate).trim() : path.resolve(cwd, String(fallbackPrivate).trim()));
  const repositoryId = await stableGitId(commonDir, 'repository', { create });
  const worktreeId = await stableGitId(gitDir, 'worktree', { create });
  return {
    worktree_root: topRoot,
    common_dir: commonDir,
    git_dir: gitDir,
    common_id: repositoryId ?? legacyLocatorId(commonDir),
    worktree_id: worktreeId ?? legacyLocatorId(gitDir),
    repository_id: repositoryId,
    legacy_common_id: legacyLocatorId(commonDir),
    legacy_worktree_id: legacyLocatorId(gitDir),
  };
}

function changedRecords(statusBuffer) {
  const raw = statusBuffer.toString('utf8').split('\0');
  const records = [];
  for (let index = 0; index < raw.length; index += 1) {
    const record = raw[index];
    if (!record) continue;
    const state = record.slice(0, 2);
    const first = record.slice(3);
    if (first) records.push({ state, path: first });
    if (/[RC]/.test(state)) {
      const second = raw[index + 1];
      if (second) records.push({ state, path: second });
      index += 1;
    }
  }
  const byPath = new Map();
  for (const record of records) byPath.set(record.path, record);
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

async function changedFileInventory(root, status) {
  const inventory = [];
  for (const record of changedRecords(status)) {
    const relativePath = record.path;
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw conflictError('Git returned an unsafe changed path.', 'GIT_ERROR');
    let kind; let digest; let size = null;
    try {
      const metadata = await lstat(target);
      size = metadata.size;
      if (metadata.isSymbolicLink()) { kind = 'symlink'; digest = createHash('sha256').update(await readlink(target)).digest('hex'); }
      else if (metadata.isFile()) {
        kind = 'file'; const hash = createHash('sha256');
        for await (const chunk of createReadStream(target)) hash.update(chunk);
        digest = hash.digest('hex');
      } else { kind = 'other'; digest = createHash('sha256').update(`${metadata.mode}:${metadata.size}`).digest('hex'); }
    } catch (error) {
      if (error.code === 'ENOENT') { kind = 'missing'; digest = null; }
      else throw error;
    }
    inventory.push({ state: record.state, path: relativePath.replaceAll('\\', '/'), kind, size, sha256: digest });
  }
  return inventory;
}

function inventoryDigest(inventory) {
  return createHash('sha256').update(canonicalJson(inventory)).digest('hex');
}

export async function executionSnapshot(cwd) {
  const identity = await gitIdentity(cwd);
  if (!identity) {
    const root = await realpath(cwd);
    return {
      captured_at: new Date().toISOString(),
      root,
      git: {
        available: false, common_id: null, worktree_id: null, branch: null, head: null,
        status_sha256: null,
        changed_files: null,
        content_sha256: await hashTree(root, { ignore: ['.git', '.vibetether', 'node_modules', 'coverage', 'dist', 'build', '.cache'] }),
      },
    };
  }
  const head = await runGit(identity.worktree_root, ['rev-parse', '--verify', 'HEAD'], { allowFailure: unborn });
  // `symbolic-ref` exits 1 in detached HEAD and is not a failure.
  const branch = await runGit(identity.worktree_root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowExit: [1] });
  const status = await runGit(identity.worktree_root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { binary: true });
  const changedFiles = await changedFileInventory(identity.worktree_root, status);
  return {
    captured_at: new Date().toISOString(),
    root: identity.worktree_root,
    git: {
      available: true,
      common_id: identity.common_id,
      worktree_id: identity.worktree_id,
      branch: branch === null ? null : String(branch).trim() || null,
      head: head === null ? null : String(head).trim() || null,
      status_sha256: createHash('sha256').update(status).digest('hex'),
      changed_files: changedFiles,
      content_sha256: inventoryDigest(changedFiles),
    },
  };
}

export function snapshotsMatch(left, right) {
  const project = (snapshot) => ({ root: snapshot?.root ?? null, git: snapshot?.git ?? null });
  return canonicalJson(project(left)) === canonicalJson(project(right));
}

export function snapshotsMatchIgnoringPaths(left, right, ignoredPaths = []) {
  const ignored = new Set(ignoredPaths.map((item) => String(item).replaceAll('\\', '/')));
  const project = (snapshot) => {
    if (!snapshot?.git?.available) return { root: snapshot?.root ?? null, git: snapshot?.git ?? null };
    const { status_sha256: _status, content_sha256: _content, changed_files: files = [], ...metadata } = snapshot.git;
    const changed_files = files.filter((item) => !ignored.has(item.path));
    return { root: snapshot.root, git: { ...metadata, changed_files } };
  };
  return canonicalJson(project(left)) === canonicalJson(project(right));
}

export async function sameRepository(left, right) {
  const [a, b] = await Promise.all([gitIdentity(left), gitIdentity(right)]);
  return Boolean(a && b && a.common_id === b.common_id);
}

export async function gitListWorktrees(cwd) {
  const output = await runGit(cwd, ['worktree', 'list', '--porcelain']);
  const worktrees = [];
  let current = null;
  for (const line of String(output).split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice(9), head: null, branch: null, detached: false, locked: false, prunable: false };
      worktrees.push(current);
    } else if (current && line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (current && line.startsWith('branch ')) current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (current && line === 'detached') current.detached = true;
    else if (current && line.startsWith('locked')) current.locked = true;
    else if (current && line.startsWith('prunable')) current.prunable = true;
  }
  return worktrees;
}

export async function gitCheckIgnored(cwd, relativePath) {
  const result = await runGit(cwd, ['check-ignore', '-q', '--', relativePath], { allowExit: [1] });
  return result !== null;
}
