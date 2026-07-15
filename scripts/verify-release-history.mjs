import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  packageRoot,
  portableSkillFingerprint,
  sourceSkill,
  VIBETETHER_RELEASE_COMPATIBILITY,
} from '../src/skill-install.mjs';

const COMMIT = /^[a-f0-9]{40}$/;

function git(repository, args) {
  const result = spawnSync('git', args, {
    cwd: repository,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error('Release compatibility history cannot be verified from the local Git object database.');
  }
  return result.stdout;
}

export async function materializeSkillAtCommit(repository, commit, destination) {
  if (!COMMIT.test(commit)) throw new Error('Release compatibility contains an invalid commit identity.');
  const listing = git(repository, [
    'ls-tree',
    '-r',
    '-z',
    '--full-tree',
    commit,
    '--',
    'skills/vibe-tether',
  ]);
  const records = listing.toString('utf8').split('\0').filter(Boolean);
  if (records.length === 0) throw new Error('A registered release does not contain the VibeTether Skill tree.');

  const prefix = 'skills/vibe-tether/';
  const destinationRoot = path.resolve(destination);
  for (const record of records) {
    const tab = record.indexOf('\t');
    if (tab === -1) throw new Error('A registered release contains an invalid Git tree record.');
    const [mode, type, object] = record.slice(0, tab).split(' ');
    const sourcePath = record.slice(tab + 1);
    if (type !== 'blob' || mode === '120000' || !sourcePath.startsWith(prefix)) {
      throw new Error('A registered release contains an unsupported Skill entry.');
    }
    const relativePath = sourcePath.slice(prefix.length);
    const target = path.resolve(destinationRoot, ...relativePath.split('/'));
    const relative = path.relative(destinationRoot, target);
    if (!relativePath || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('A registered release contains an unsafe Skill path.');
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, git(repository, ['cat-file', 'blob', object]));
  }
}

async function packageVersionAtCommit(repository, commit) {
  let value;
  try {
    value = JSON.parse(git(repository, ['show', `${commit}:package.json`]).toString('utf8'));
  } catch (error) {
    if (error.message.startsWith('Release compatibility history')) throw error;
    throw new Error('A registered release contains invalid package metadata.');
  }
  if (typeof value.version !== 'string') {
    throw new Error('A registered release is missing its package version.');
  }
  return value.version;
}

export async function verifyReleaseHistory(repository = packageRoot) {
  const registry = VIBETETHER_RELEASE_COMPATIBILITY;
  const pkg = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8'));
  if (pkg.version !== registry.current.version) {
    throw new Error('The current package version does not match the release compatibility registry.');
  }
  if (await portableSkillFingerprint(sourceSkill) !== registry.current.fingerprint) {
    throw new Error('The current packaged Skill does not match the release compatibility registry.');
  }

  for (const entry of registry.history) {
    git(repository, ['cat-file', '-e', `${entry.commit}^{commit}`]);
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'vibetether-release-history-'));
    try {
      await materializeSkillAtCommit(repository, entry.commit, temporary);
      if (await portableSkillFingerprint(temporary) !== entry.fingerprint) {
        throw new Error(`Registered release ${entry.id} has a fingerprint mismatch.`);
      }
      if (await packageVersionAtCommit(repository, entry.commit) !== entry.version) {
        throw new Error(`Registered release ${entry.id} has a package-version mismatch.`);
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  return registry.history.length;
}

async function main() {
  const count = await verifyReleaseHistory();
  process.stdout.write(`VibeTether release compatibility: valid (${count} historical identities).\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`VibeTether release compatibility: invalid (${error.message})\n`);
    process.exitCode = 1;
  });
}
