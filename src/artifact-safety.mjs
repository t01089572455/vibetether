import path from 'node:path';

const SECRET_VALUE = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|hf_[A-Za-z0-9]{20,}|A(?:KI|SI)A[A-Z0-9]{16})\b/;
const SENSITIVE_CONTROL_FILES = new Set(['.git-credentials', '.netrc', '.npmrc', '.pypirc']);
const ALWAYS_SENSITIVE_DIRECTORIES = new Set(['.aws', '.azure', '.docker', '.gnupg', '.kube', '.ssh']);
const RUNBOOK_SENSITIVE_DIRECTORIES = new Set(['credentials', 'secrets', 'tokens']);
const SAFE_EXACT_RUNBOOK_STEMS = new Set(['credentials', 'secret', 'secrets', 'token', 'tokens']);
const SENSITIVE_BASENAME_PREFIXES = new Set([
  'access-token',
  'access-tokens',
  'api-key',
  'apikey',
  'application-default-credentials',
  'auth-token',
  'client-secret',
  'credentials',
  'id-token',
  'kubeconfig',
  'passwd',
  'password',
  'private-key',
  'refresh-token',
  'secret',
  'secrets',
  'service-account',
  'token',
  'tokens',
]);
const CANONICAL_CREDENTIAL_FILES = new Set([
  'accesstokens.json',
  'application_default_credentials.json',
  'kubeconfig',
]);
const PRIVATE_KEY_STEMS = new Set(['id-dsa', 'id-ecdsa', 'id-ed25519', 'id-rsa']);
const RUNBOOK_EXTENSIONS = new Set(['.adoc', '.markdown', '.md', '.mdx', '.rst']);
const BACKUP_SUFFIXES = new Set(['.bak', '.backup', '.old', '.orig', '.save']);
const DATA_CONFIG_EXTENSIONS = new Set([
  '.cfg',
  '.conf',
  '.config',
  '.csv',
  '.ini',
  '.json',
  '.properties',
  '.toml',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);
const CREDENTIAL_FILE_EXTENSIONS = new Set([
  '.cer',
  '.credential',
  '.credentials',
  '.crt',
  '.der',
  '.jks',
  '.key',
  '.keystore',
  '.p12',
  '.pem',
  '.pfx',
  '.secret',
  '.token',
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

function isSensitiveControlFile(value) {
  return [...SENSITIVE_CONTROL_FILES].some((control) => (
    value === control
    || value.startsWith(`${control}.`)
    || value === `${control}~`
  ));
}

function canonicalizeBasename(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function stripTrailingTildes(value) {
  return value.replace(/~+$/g, '');
}

function containsLiteralCredentialExtension(value) {
  return value.toLowerCase().split('.').slice(1)
    .some((extension) => CREDENTIAL_FILE_EXTENSIONS.has(`.${extension}`));
}

function classifyBasename(basename) {
  const lower = basename.toLowerCase();
  const actualExtension = path.posix.extname(lower);
  const strongRunbook = RUNBOOK_EXTENSIONS.has(actualExtension);
  let candidate = basename;
  let credentialExtension = false;

  if (strongRunbook) {
    candidate = basename.slice(0, -actualExtension.length);
    credentialExtension = containsLiteralCredentialExtension(candidate);
  } else {
    let changed = true;
    while (changed && candidate.length > 0) {
      changed = false;
      const withoutTildes = stripTrailingTildes(candidate);
      if (withoutTildes !== candidate) {
        candidate = withoutTildes;
        changed = true;
        continue;
      }
      const extension = path.posix.extname(candidate.toLowerCase());
      if (CREDENTIAL_FILE_EXTENSIONS.has(extension)) {
        credentialExtension = true;
        candidate = candidate.slice(0, -extension.length);
        changed = true;
      } else if (BACKUP_SUFFIXES.has(extension) || DATA_CONFIG_EXTENSIONS.has(extension)) {
        candidate = candidate.slice(0, -extension.length);
        changed = true;
      }
    }
  }

  return {
    canonicalStem: canonicalizeBasename(candidate),
    credentialExtension,
    strongRunbook,
  };
}

function matchingSensitivePrefix(canonicalStem) {
  return [...SENSITIVE_BASENAME_PREFIXES].find((prefix) => (
    canonicalStem === prefix || canonicalStem.startsWith(`${prefix}-`)
  ));
}

export function containsSecretValue(value) {
  return SECRET_VALUE.test(value);
}

function hasGcloudRoot(parts) {
  return parts.some((segment, index) => segment === '.config' && parts[index + 1] === 'gcloud');
}

export function isSensitiveArtifactPath(artifact, { documentationContainer = false } = {}) {
  if (artifact.includes(':') || artifact.includes('\0') || containsSecretValue(artifact)) return true;
  const rawParts = segments(artifact);
  const parts = rawParts.map((segment) => segment.toLowerCase());
  if (parts.some((segment) => isSensitiveControlFile(segment) || isEnvironmentFile(segment))) return true;
  if (parts.some((segment) => ALWAYS_SENSITIVE_DIRECTORIES.has(segment)) || hasGcloudRoot(parts)) return true;
  const basename = parts.at(-1) ?? '';
  const classification = classifyBasename(rawParts.at(-1) ?? '');
  const sensitivePrefix = matchingSensitivePrefix(classification.canonicalStem);
  if (CANONICAL_CREDENTIAL_FILES.has(basename)
      || classification.credentialExtension
      || PRIVATE_KEY_STEMS.has(classification.canonicalStem)) return true;

  const hasRunbookDirectory = parts.some((segment) => RUNBOOK_SENSITIVE_DIRECTORIES.has(segment));
  if (!hasRunbookDirectory && !sensitivePrefix) return false;
  if (documentationContainer) {
    if (!hasRunbookDirectory) return Boolean(sensitivePrefix);
    return sensitivePrefix !== undefined
      && !RUNBOOK_SENSITIVE_DIRECTORIES.has(classification.canonicalStem);
  }
  if (!classification.strongRunbook) return true;
  return sensitivePrefix !== undefined
    && classification.canonicalStem === sensitivePrefix
    && !SAFE_EXACT_RUNBOOK_STEMS.has(sensitivePrefix);
}

export function isSafeProjectRelativeArtifactPath(artifact) {
  if (artifact.includes(':') || artifact.includes('\0')) return false;
  const portable = artifact.replaceAll('\\', '/');
  if (path.posix.isAbsolute(portable) || path.win32.parse(artifact).root) return false;
  return !portable.split('/').some((segment) => segment === '..');
}
