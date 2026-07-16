import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, readlink, realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { rejectSymlinkPath } from './files.mjs';

const runFile = promisify(execFile);

function portableRelative(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Execution root and Git worktree must stay inside the project.');
  }
  return relative ? relative.replaceAll('\\', '/') : '.';
}

export function gitFailureIsUnavailable(error) {
  const diagnostic = `${error?.stderr ?? ''}`;
  return error?.code === 'ENOENT' || /not a git repository/i.test(diagnostic);
}

export function gitFailureIsUnbornHead(error) {
  const diagnostic = `${error?.stderr ?? ''}`;
  return error?.code === 128 && /needed a single revision/i.test(diagnostic);
}

async function git(root, args, { expectedFailure = null, binary = false } = {}) {
  try {
    const result = await runFile('git', ['-C', root, ...args], {
      encoding: binary ? 'buffer' : 'utf8',
      env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return result.stdout;
  } catch (error) {
    if (gitFailureIsUnavailable(error) || expectedFailure?.(error)) {
      return null;
    }
    throw new Error('Git execution state could not be inspected safely.');
  }
}

function changedPaths(status) {
  const records = status.toString('utf8').split('\0');
  const paths = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const state = record.slice(0, 2);
    const relativePath = record.slice(3);
    if (relativePath) paths.push(relativePath);
    if (/[RC]/.test(state)) index += 1;
  }
  return [...new Set(paths)].sort();
}

async function worktreeFingerprint(worktree, status) {
  const hash = createHash('sha256');
  hash.update(status);
  for (const relativePath of changedPaths(status)) {
    hash.update(`\0path:${relativePath}\0`);
    const target = path.resolve(worktree, relativePath);
    const relative = path.relative(worktree, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Git reported an unsafe changed path.');
    }
    let metadata;
    try {
      metadata = await lstat(target);
    } catch (error) {
      if (error.code === 'ENOENT') {
        hash.update('missing');
        continue;
      }
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      hash.update(`symlink:${await readlink(target)}`);
    } else if (metadata.isFile()) {
      hash.update(`file:${metadata.size}:`);
      for await (const chunk of createReadStream(target)) hash.update(chunk);
    } else {
      hash.update(`other:${metadata.mode}:${metadata.size}`);
    }
  }
  return hash.digest('hex');
}

export async function captureExecutionSnapshot(projectRoot, requestedRoot = null) {
  const candidate = requestedRoot
    ? path.isAbsolute(requestedRoot)
      ? requestedRoot
      : path.resolve(projectRoot, requestedRoot)
    : projectRoot;
  const resolved = await realpath(candidate).catch(() => {
    throw new Error(`Execution root does not exist: ${requestedRoot ?? '.'}`);
  });
  const relativeRoot = portableRelative(projectRoot, resolved);
  if (relativeRoot !== '.') await rejectSymlinkPath(projectRoot, relativeRoot);
  const metadata = await lstat(resolved);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('Execution root must be a regular project-contained directory.');
  }

  const worktreeOutput = await git(resolved, ['rev-parse', '--show-toplevel']);
  if (worktreeOutput === null) {
    return {
      root: relativeRoot,
      captured_at: new Date().toISOString(),
      git: {
        available: false,
        worktree_root: null,
        ref: null,
        head: null,
        status_sha256: null,
        worktree_sha256: null,
      },
    };
  }
  const worktree = await realpath(String(worktreeOutput).trim());
  const worktreeRelative = portableRelative(projectRoot, worktree);
  const headOutput = await git(
    resolved,
    ['rev-parse', '--verify', 'HEAD'],
    { expectedFailure: gitFailureIsUnbornHead },
  );
  const refOutput = await git(
    resolved,
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    { expectedFailure: (error) => error.code === 1 },
  );
  const status = await git(
    resolved,
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { binary: true },
  );
  const statusSha256 = createHash('sha256').update(status).digest('hex');
  return {
    root: relativeRoot,
    captured_at: new Date().toISOString(),
    git: {
      available: true,
      worktree_root: worktreeRelative,
      ref: refOutput === null ? null : String(refOutput).trim() || null,
      head: headOutput === null ? null : String(headOutput).trim() || null,
      status_sha256: statusSha256,
      worktree_sha256: await worktreeFingerprint(worktree, status),
    },
  };
}

export function executionSnapshotEvidence(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return {
    root: snapshot.root ?? null,
    git: snapshot.git ?? null,
  };
}

export function executionSnapshotsMatch(left, right) {
  return JSON.stringify(executionSnapshotEvidence(left)) === JSON.stringify(executionSnapshotEvidence(right));
}

export function validExecutionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  if (typeof snapshot.root !== 'string' || !snapshot.root) return false;
  if (typeof snapshot.captured_at !== 'string' || !Number.isFinite(Date.parse(snapshot.captured_at))) return false;
  const gitState = snapshot.git;
  if (!gitState || typeof gitState !== 'object' || Array.isArray(gitState)) return false;
  if (typeof gitState.available !== 'boolean') return false;
  if (!gitState.available) {
    return gitState.worktree_root === null
      && gitState.ref === null
      && gitState.head === null
      && gitState.status_sha256 === null
      && gitState.worktree_sha256 === null;
  }
  return typeof gitState.worktree_root === 'string'
    && (gitState.ref === null || typeof gitState.ref === 'string')
    && (gitState.head === null || /^[a-f0-9]{40}$/.test(gitState.head))
    && /^[a-f0-9]{64}$/.test(gitState.status_sha256 ?? '')
    && /^[a-f0-9]{64}$/.test(gitState.worktree_sha256 ?? '');
}
