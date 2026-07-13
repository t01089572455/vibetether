import { lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CliError } from './errors.mjs';
import { skillFingerprint } from './skill-install.mjs';

function resolveSourcePath(root, relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new CliError(`${label} escapes the checked-out provider source.`, 3);
  }
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new CliError(`${label} escapes the checked-out provider source.`, 3);
  }
  return target;
}

export function runProviderGit(cwd, hooksPath, args, execute = spawnSync) {
  const options = {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never',
    },
  };
  let result = execute('git', ['-c', `core.hooksPath=${hooksPath}`, ...args], options);
  if (result.error) {
    throw new CliError(`Git is required to install curated providers: ${result.error.message}`, 3);
  }
  const detail = (result.stderr || result.stdout || '').trim();
  if (result.status !== 0 && /schannel:.*(?:AcquireCredentialsHandle|SEC_E_NO_CREDENTIALS)/i.test(detail)) {
    result = execute(
      'git',
      ['-c', `core.hooksPath=${hooksPath}`, '-c', 'http.sslBackend=openssl', ...args],
      options,
    );
    if (result.error) {
      throw new CliError(`Git is required to install curated providers: ${result.error.message}`, 3);
    }
  }
  if (result.status !== 0) {
    const failure = (result.stderr || result.stdout || 'unknown git failure').trim();
    throw new CliError(`Provider git ${args[0]} failed: ${failure}`, 3);
  }
  return result.stdout.trim();
}

function runGit(cwd, hooksPath, args) {
  return runProviderGit(cwd, hooksPath, args);
}

async function assertRegularFile(target, label) {
  let entry;
  try {
    entry = await lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') throw new CliError(`Provider ${label} is missing.`, 3);
    throw error;
  }
  if (!entry.isFile() || entry.isSymbolicLink()) throw new CliError(`Provider ${label} must be a regular file.`, 3);
}

async function assertSkillDirectory(target, label) {
  let entry;
  try {
    entry = await lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') throw new CliError(`Provider Skill is missing: ${label}`, 3);
    throw error;
  }
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new CliError(`Provider Skill must be a real directory: ${label}`, 3);
  }
  await assertRegularFile(path.join(target, 'SKILL.md'), `Skill entry ${label}/SKILL.md`);
}

export async function stageProviderSources(sources, options = {}) {
  const parent = options.tempRoot ?? os.tmpdir();
  await mkdir(parent, { recursive: true });
  const stagingRoot = await mkdtemp(path.join(parent, 'vibetether-providers-'));
  const hooksPath = path.join(stagingRoot, 'disabled-hooks');
  await mkdir(hooksPath, { recursive: true });
  const repositories = [];
  const skills = [];

  try {
    for (const [index, source] of sources.entries()) {
      const repositoryRoot = path.join(stagingRoot, `source-${index}`);
      await mkdir(repositoryRoot, { recursive: true });
      runGit(repositoryRoot, hooksPath, ['init', '-q']);
      runGit(repositoryRoot, hooksPath, ['remote', 'add', 'origin', source.repository]);
      runGit(repositoryRoot, hooksPath, ['fetch', '--depth', '1', 'origin', source.commit]);
      runGit(repositoryRoot, hooksPath, ['checkout', '--detach', '-q', 'FETCH_HEAD']);
      const actualCommit = runGit(repositoryRoot, hooksPath, ['rev-parse', 'HEAD']).toLowerCase();
      if (actualCommit !== source.commit.toLowerCase()) {
        throw new CliError(
          `Provider commit mismatch for ${source.id}: expected ${source.commit}, received ${actualCommit}.`,
          3,
        );
      }

      const licensePath = resolveSourcePath(repositoryRoot, source.license_path, `License path for ${source.id}`);
      await assertRegularFile(licensePath, `license for ${source.id}`);
      const licenseBuffer = await readFile(licensePath);
      repositories.push({
        source_id: source.id,
        repository: source.repository,
        ref: source.ref,
        commit: actualCommit,
        license: source.license,
        license_path: licensePath,
        license_content: licenseBuffer.toString('utf8'),
        license_sha256: createHash('sha256').update(licenseBuffer).digest('hex'),
        root: repositoryRoot,
      });

      for (const skill of source.skills) {
        const sourcePath = resolveSourcePath(repositoryRoot, skill.path, `Skill path for ${skill.id}`);
        await assertSkillDirectory(sourcePath, skill.id);
        const actualFingerprint = await skillFingerprint(sourcePath);
        if (actualFingerprint !== skill.fingerprint) {
          throw new CliError(
            `Provider Skill fingerprint mismatch for ${skill.id}: expected ${skill.fingerprint}, received ${actualFingerprint}.`,
            3,
          );
        }
        skills.push({
          ...skill,
          source_id: source.id,
          repository: source.repository,
          ref: source.ref,
          commit: actualCommit,
          license: source.license,
          source_path: sourcePath,
        });
      }
    }
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  let cleaned = false;
  return {
    staging_root: stagingRoot,
    repositories,
    skills,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await rm(stagingRoot, { recursive: true, force: true });
    },
  };
}
