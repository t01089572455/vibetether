import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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

export async function enumerateSkillDirectories(repositoryRoot, relativeRoot) {
  const skillRoot = resolveSourcePath(repositoryRoot, relativeRoot, 'Skill root');
  const discovered = [];

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    if (entries.some((entry) => entry.name === 'SKILL.md' && entry.isFile())) {
      discovered.push(path.relative(repositoryRoot, current).split(path.sep).join('/'));
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      await walk(path.join(current, entry.name));
    }
  }

  await walk(skillRoot);
  return discovered.sort();
}

export async function stageProviderSources(sources, options = {}) {
  const parent = options.tempRoot ?? os.tmpdir();
  await mkdir(parent, { recursive: true });
  const stagingRoot = await mkdtemp(path.join(parent, 'vibetether-providers-'));
  const hooksPath = path.join(stagingRoot, 'disabled-hooks');
  await mkdir(hooksPath, { recursive: true });
  const repositories = [];
  const skills = [];
  const warnings = [];

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

      if (source.catalog_mode === 'complete') {
        const discovered = await enumerateSkillDirectories(repositoryRoot, source.skill_root);
        const declared = new Set(source.skills.map((skill) => skill.path.replaceAll('\\', '/')));
        const undeclared = discovered.filter((skillPath) => !declared.has(skillPath));
        const missing = [...declared].filter((skillPath) => !discovered.includes(skillPath));
        if (undeclared.length > 0) {
          throw new CliError(`Complete provider catalog ${source.id} has undeclared Skill directories: ${undeclared.join(', ')}`, 3);
        }
        if (missing.length > 0) {
          throw new CliError(`Complete provider catalog ${source.id} declares missing Skill directories: ${missing.join(', ')}`, 3);
        }
      }

      const licenseEvidence = source.license_evidence ?? {
        mode: 'full-text',
        path: source.license_path,
      };
      if (!['full-text', 'readme-declaration'].includes(licenseEvidence.mode)) {
        throw new CliError(`Unsupported license evidence mode for ${source.id}: ${licenseEvidence.mode}`, 3);
      }
      const evidencePath = resolveSourcePath(
        repositoryRoot,
        licenseEvidence.path,
        `License evidence path for ${source.id}`,
      );
      await assertRegularFile(evidencePath, `license evidence for ${source.id}`);
      const evidenceBuffer = await readFile(evidencePath);
      const evidenceContent = evidenceBuffer.toString('utf8');
      const evidenceSha256 = createHash('sha256').update(evidenceBuffer).digest('hex');
      if (licenseEvidence.sha256 && licenseEvidence.sha256 !== evidenceSha256) {
        throw new CliError(
          `License evidence fingerprint mismatch for ${source.id}: expected ${licenseEvidence.sha256}, received ${evidenceSha256}.`,
          3,
        );
      }
      if (
        licenseEvidence.mode === 'readme-declaration' &&
        (!licenseEvidence.declaration || !evidenceContent.includes(licenseEvidence.declaration))
      ) {
        throw new CliError(`Pinned license declaration is missing or changed for ${source.id}.`, 3);
      }
      if (licenseEvidence.mode === 'readme-declaration') {
        warnings.push(
          `${source.id} declares ${source.license} in ${licenseEvidence.path}; complete license text is not present upstream.`,
        );
      }
      repositories.push({
        source_id: source.id,
        repository: source.repository,
        ref: source.ref,
        commit: actualCommit,
        license: source.license,
        license_evidence: {
          ...licenseEvidence,
          path: licenseEvidence.path,
          sha256: evidenceSha256,
        },
        ...(licenseEvidence.mode === 'full-text'
          ? {
              license_path: evidencePath,
              license_content: evidenceContent,
              license_sha256: createHash('sha256').update(evidenceBuffer).digest('hex'),
            }
          : {}),
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
    warnings,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await rm(stagingRoot, { recursive: true, force: true });
    },
  };
}
