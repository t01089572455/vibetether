import path from 'node:path';

const SECRET_VALUE = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,}|A(?:KI|SI)A[A-Z0-9]{16})\b/;
const SENSITIVE_CONTROL_FILES = new Set(['.git-credentials', '.netrc', '.npmrc', '.pypirc']);
const SENSITIVE_DIRECTORIES = new Set(['.docker', '.ssh', 'credentials', 'secrets', 'tokens']);
const SENSITIVE_BASENAME_STEMS = new Set([
  'credentials',
  'private-key',
  'secret',
  'secrets',
  'service-account',
  'token',
  'tokens',
]);
const PRIVATE_KEY_STEMS = new Set(['id_dsa', 'id_ecdsa', 'id_ed25519', 'id_rsa']);
const CREDENTIAL_FILE_EXTENSIONS = new Set([
  '.cer',
  '.crt',
  '.der',
  '.jks',
  '.key',
  '.keystore',
  '.p12',
  '.pem',
  '.pfx',
]);

function segments(value) {
  return value.replaceAll('\\', '/').split('/').filter(Boolean);
}

function isEnvironmentFile(value) {
  return value === '.env' || value.startsWith('.env.');
}

export function isSensitiveArtifactPath(artifact) {
  if (SECRET_VALUE.test(artifact)) return true;
  const parts = segments(artifact).map((segment) => segment.toLowerCase());
  if (parts.some((segment) => SENSITIVE_CONTROL_FILES.has(segment) || isEnvironmentFile(segment))) return true;
  if (parts.some((segment) => SENSITIVE_DIRECTORIES.has(segment))) return true;
  const basename = parts.at(-1) ?? '';
  const extension = path.posix.extname(basename);
  const stem = extension ? basename.slice(0, -extension.length) : basename;
  return SENSITIVE_BASENAME_STEMS.has(stem)
    || PRIVATE_KEY_STEMS.has(stem)
    || CREDENTIAL_FILE_EXTENSIONS.has(extension);
}

export function isSafeProjectRelativeArtifactPath(artifact) {
  if (artifact.includes(':') || artifact.includes('\0')) return false;
  const portable = artifact.replaceAll('\\', '/');
  if (path.posix.isAbsolute(portable) || path.win32.parse(artifact).root) return false;
  return !portable.split('/').some((segment) => segment === '..');
}
