import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

const TRANSIENT_FETCH_FAILURE = /(?:TLS connect error|unexpected eof|SSL_read|connection (?:was )?reset|recv failure|failed to connect|timed out|could not resolve host|remote end hung up unexpectedly|early EOF|requested URL returned error:\s*(?:502|503|504))/i;
const SCHANNEL_FAILURE = /schannel:[\s\S]*(?:AcquireCredentialsHandle|SEC_E_NO_CREDENTIALS|failed to receive handshake|SSL\/TLS connection failed)/i;
const RETRY_DELAYS = [200, 600];
const CODELOAD_ARCHIVE_LIMIT = 100 * 1024 * 1024;

export class ProviderGitTransportError extends CliError {
  constructor(message) {
    super(message, 3);
    this.name = 'ProviderGitTransportError';
    this.transientFetchExhausted = true;
  }
}

function blockingSleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function runProviderGit(cwd, hooksPath, args, execute = spawnSync, retryOptions = {}) {
  const options = {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never',
    },
  };
  const sleep = retryOptions.sleep ?? blockingSleep;
  let useOpenSSL = false;
  let attempts = 0;
  let result;
  let failure = 'unknown git failure';
  let exhaustedTransient = false;

  while (attempts < 3) {
    attempts += 1;
    const controlledArgs = [
      '-c',
      `core.hooksPath=${hooksPath}`,
      '-c',
      'core.autocrlf=false',
      ...(useOpenSSL ? ['-c', 'http.sslBackend=openssl'] : []),
      ...args,
    ];
    result = execute('git', controlledArgs, options);
    if (result.error) {
      throw new CliError(`Git is required to install curated providers: ${result.error.message}`, 3);
    }
    if (result.status === 0) return result.stdout.trim();

    failure = (result.stderr || result.stdout || 'unknown git failure').trim();
    const schannelFailure = SCHANNEL_FAILURE.test(failure);
    const transient = args[0] === 'fetch' && (schannelFailure || TRANSIENT_FETCH_FAILURE.test(failure));
    if (!transient) break;
    if (schannelFailure) useOpenSSL = true;
    if (attempts >= 3) {
      exhaustedTransient = true;
      break;
    }
    sleep(RETRY_DELAYS[attempts - 1]);
  }

  if (exhaustedTransient) {
    throw new ProviderGitTransportError(
      `Provider git fetch failed after 3 attempts because the pinned upstream transport was interrupted. Retry the same command; no project files were changed. Last error: ${failure}`,
    );
  }
  throw new CliError(`Provider git ${args[0]} failed: ${failure}`, 3);
}

function runGit(cwd, hooksPath, args) {
  return runProviderGit(cwd, hooksPath, args);
}

export function githubCodeloadArchiveUrl(source) {
  if (!/^[a-f0-9]{40}$/i.test(String(source?.commit ?? ''))) return null;
  let parsed;
  try {
    parsed = new URL(source?.repository);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname !== 'github.com'
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.search
    || parsed.hash
  ) return null;
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) return null;
  const [owner, rawRepository] = segments;
  const repository = rawRepository.endsWith('.git') ? rawRepository.slice(0, -4) : rawRepository;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repository)) return null;
  return `https://codeload.github.com/${owner}/${repository}/tar.gz/${source.commit.toLowerCase()}`;
}

async function stageGithubCodeloadSource({ source, repositoryRoot, archiveUrl }) {
  if (typeof fetch !== 'function') {
    throw new CliError('Provider Git transport failed and this Node runtime has no Codeload fetch fallback.', 3);
  }
  let response;
  try {
    response = await fetch(archiveUrl, { redirect: 'error' });
  } catch (error) {
    throw new CliError(`Provider Git transport failed and Codeload fallback could not download ${source.id}: ${error.message}`, 3);
  }
  if (!response.ok) {
    throw new CliError(`Provider Git transport failed and Codeload fallback returned HTTP ${response.status} for ${source.id}.`, 3);
  }
  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.length === 0 || archive.length > CODELOAD_ARCHIVE_LIMIT) {
    throw new CliError(`Provider Codeload archive for ${source.id} has an unsafe size.`, 3);
  }
  const archivePath = path.join(repositoryRoot, '.vibetether-provider.tar.gz');
  await writeFile(archivePath, archive);
  try {
    const result = spawnSync(
      'tar',
      ['-xzf', archivePath, '--strip-components=1', '-C', repositoryRoot],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    if (result.error) {
      throw new CliError(`Provider Codeload fallback requires tar: ${result.error.message}`, 3);
    }
    if (result.status !== 0) {
      throw new CliError(`Provider Codeload fallback could not unpack ${source.id}: ${(result.stderr || result.stdout || 'tar failed').trim()}`, 3);
    }
  } finally {
    await rm(archivePath, { force: true }).catch(() => {});
  }
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
  const sourceGit = options.runGit ?? runGit;
  const stageCodeload = options.stageCodeload ?? stageGithubCodeloadSource;

  try {
    for (const [index, source] of sources.entries()) {
      const repositoryRoot = path.join(stagingRoot, `source-${index}`);
      await mkdir(repositoryRoot, { recursive: true });
      sourceGit(repositoryRoot, hooksPath, ['init', '-q']);
      sourceGit(repositoryRoot, hooksPath, ['remote', 'add', 'origin', source.repository]);
      let actualCommit;
      try {
        sourceGit(repositoryRoot, hooksPath, ['fetch', '--depth', '1', 'origin', source.commit]);
        sourceGit(repositoryRoot, hooksPath, ['checkout', '--detach', '-q', 'FETCH_HEAD']);
        actualCommit = sourceGit(repositoryRoot, hooksPath, ['rev-parse', 'HEAD']).toLowerCase();
      } catch (error) {
        const archiveUrl = error instanceof ProviderGitTransportError
          ? githubCodeloadArchiveUrl(source)
          : null;
        if (!archiveUrl) throw error;
        await stageCodeload({ source, repositoryRoot, archiveUrl });
        actualCommit = source.commit.toLowerCase();
      }
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
