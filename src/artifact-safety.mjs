import path from 'node:path';

const SECRET_VALUE = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|hf_[A-Za-z0-9]{20,}|A(?:KI|SI)A[A-Z0-9]{16})\b/;
const SENSITIVE_CONTROL_FILES = new Set(['.git-credentials', '.netrc', '.npmrc', '.pypirc']);
const ALWAYS_SENSITIVE_DIRECTORIES = new Set(['.aws', '.azure', '.docker', '.gnupg', '.kube', '.ssh']);
const RUNBOOK_SENSITIVE_DIRECTORIES = new Set(['credentials', 'secrets', 'tokens']);
const RUNBOOK_BASENAME_STEMS = new Set([
  'credentials',
  'secret',
  'secrets',
  'token',
  'tokens',
]);
const CREDENTIAL_BASENAME_STEMS = new Set([
  'access-token',
  'api-key',
  'apikey',
  'auth-token',
  'client-secret',
  'id-token',
  'private-key',
  'refresh-token',
  'service-account',
]);
const CANONICAL_CREDENTIAL_FILES = new Set([
  'accesstokens.json',
  'application_default_credentials.json',
  'kubeconfig',
]);
const PRIVATE_KEY_STEMS = new Set(['id_dsa', 'id_ecdsa', 'id_ed25519', 'id_rsa']);
const RUNBOOK_EXTENSIONS = new Set(['.adoc', '.markdown', '.md', '.mdx', '.rst']);
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
  return value === '.env'
    || value.startsWith('.env.')
    || value === '.envrc'
    || value.startsWith('.envrc.');
}

export function containsSecretValue(value) {
  return SECRET_VALUE.test(value);
}

function hasGcloudRoot(parts) {
  return parts.some((segment, index) => segment === '.config' && parts[index + 1] === 'gcloud');
}

export function isSensitiveArtifactPath(artifact, { documentationContainer = false } = {}) {
  if (artifact.includes(':') || artifact.includes('\0') || containsSecretValue(artifact)) return true;
  const parts = segments(artifact).map((segment) => segment.toLowerCase());
  if (parts.some((segment) => SENSITIVE_CONTROL_FILES.has(segment) || isEnvironmentFile(segment))) return true;
  if (parts.some((segment) => ALWAYS_SENSITIVE_DIRECTORIES.has(segment)) || hasGcloudRoot(parts)) return true;
  const basename = parts.at(-1) ?? '';
  const extension = path.posix.extname(basename);
  const stem = extension ? basename.slice(0, -extension.length) : basename;
  if (CANONICAL_CREDENTIAL_FILES.has(basename)
      || CREDENTIAL_BASENAME_STEMS.has(stem)
      || PRIVATE_KEY_STEMS.has(stem)
      || CREDENTIAL_FILE_EXTENSIONS.has(extension)) return true;

  const hasRunbookDirectory = parts.some((segment) => RUNBOOK_SENSITIVE_DIRECTORIES.has(segment));
  const hasRunbookBasename = RUNBOOK_BASENAME_STEMS.has(stem);
  if (!hasRunbookDirectory && !hasRunbookBasename) return false;
  if (documentationContainer) return !hasRunbookDirectory;
  return !RUNBOOK_EXTENSIONS.has(extension);
}

export function isSafeProjectRelativeArtifactPath(artifact) {
  if (artifact.includes(':') || artifact.includes('\0')) return false;
  const portable = artifact.replaceAll('\\', '/');
  if (path.posix.isAbsolute(portable) || path.win32.parse(artifact).root) return false;
  return !portable.split('/').some((segment) => segment === '..');
}
