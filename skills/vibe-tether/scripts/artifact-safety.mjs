import path from 'node:path';

const SECRET_VALUE = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|hf_[A-Za-z0-9]{20,}|A(?:KI|SI)A[A-Z0-9]{16})\b/;
const BACKUP_SUFFIXES = new Set(['.bak', '.backup', '.old', '.orig', '.save']);
const ARCHIVE_WRAPPER_SUFFIXES = new Set([
  '.7z',
  '.bz2',
  '.gz',
  '.lz4',
  '.rar',
  '.tar',
  '.tgz',
  '.xz',
  '.zip',
  '.zst',
]);
const HARD_WRAPPER_SUFFIXES = new Set([...BACKUP_SUFFIXES, ...ARCHIVE_WRAPPER_SUFFIXES]);
const DOT_CONTROL_FILES = new Set(['.git-credentials', '.netrc', '.npmrc', '.pypirc']);
const HIDDEN_CREDENTIAL_ROOTS = new Set(['.aws', '.azure', '.docker', '.gnupg', '.kube', '.ssh']);
const CREDENTIAL_DOT_SEGMENTS = new Set([
  'cer',
  'credential',
  'credentials',
  'crt',
  'der',
  'jks',
  'key',
  'keystore',
  'p12',
  'pem',
  'pfx',
  'secret',
  'token',
]);
const RUNBOOK_EXTENSIONS = new Set(['.adoc', '.markdown', '.md', '.mdx', '.rst']);
const SENSITIVE_SINGLE_TERMS = new Set([
  'apikey',
  'credential',
  'keystore',
  'kubeconfig',
  'passwd',
  'password',
  'secret',
  'token',
]);
export const SENSITIVE_CREDENTIAL_PHRASES = Object.freeze([
  ['access', 'key'],
  ['access', 'token'],
  ['api', 'key'],
  ['auth', 'token'],
  ['client', 'secret'],
  ['github', 'pat'],
  ['gitlab', 'pat'],
  ['id', 'dsa'],
  ['id', 'ecdsa'],
  ['id', 'ed25519'],
  ['id', 'rsa'],
  ['id', 'token'],
  ['key', 'store'],
  ['kube', 'config'],
  ['private', 'key'],
  ['refresh', 'token'],
  ['secret', 'access', 'key'],
  ['service', 'account'],
].map((phrase) => Object.freeze(phrase)));
const COLLAPSED_SENSITIVE_PHRASES = new Set(SENSITIVE_CREDENTIAL_PHRASES.flatMap((phrase) => {
  const prefix = phrase.slice(0, -1).join('');
  const terminal = phrase.at(-1);
  return [phrase.join(''), `${prefix}${terminal}s`];
}));
const SINGULAR_TERMS = new Map([
  ['accounts', 'account'],
  ['apikeys', 'apikey'],
  ['credentials', 'credential'],
  ['keys', 'key'],
  ['passwords', 'password'],
  ['secrets', 'secret'],
  ['tokens', 'token'],
]);

function segments(value) {
  return value.replaceAll('\\', '/').split('/').filter(Boolean);
}

function stripSuffixChain(value, suffixes) {
  let candidate = value;
  let changed = true;
  while (changed && candidate.length > 0) {
    changed = false;
    const withoutTildes = candidate.replace(/~+$/g, '');
    if (withoutTildes !== candidate) {
      candidate = withoutTildes;
      changed = true;
      continue;
    }
    const extension = path.posix.extname(candidate.toLowerCase());
    if (suffixes.has(extension)) {
      candidate = candidate.slice(0, -extension.length);
      changed = true;
    }
  }
  return candidate;
}

function stripKnownBackups(value) {
  return stripSuffixChain(value, BACKUP_SUFFIXES);
}

function stripHardWrappers(value) {
  return stripSuffixChain(value, HARD_WRAPPER_SUFFIXES);
}

function normalizedControlSegment(value) {
  return stripHardWrappers(value).toLowerCase();
}

function isDotControlFile(raw, normalized) {
  const lower = raw.toLowerCase();
  for (const control of DOT_CONTROL_FILES) {
    if (normalized === control
        || lower === control
        || lower.startsWith(`${control}.`)
        || lower.startsWith(`${control}~`)) return true;
  }
  return false;
}

function isEnvironmentControl(raw, normalized) {
  const lower = raw.toLowerCase();
  return normalized === '.env'
    || normalized === '.envrc'
    || lower === '.env'
    || lower.startsWith('.env.')
    || lower === '.envrc'
    || lower.startsWith('.envrc.');
}

function hasHiddenCredentialRoot(normalizedParts) {
  if (normalizedParts.some((segment) => HIDDEN_CREDENTIAL_ROOTS.has(segment))) return true;
  return normalizedParts.some((segment, index) => (
    segment === '.config' && normalizedParts[index + 1] === 'gcloud'
  ));
}

function hasCredentialDotSegment(raw) {
  const components = raw.toLowerCase().split('.');
  const firstStem = components.findIndex((component) => component.length > 0);
  if (firstStem === -1) return false;
  return components.slice(firstStem + 1).some((component) => (
    CREDENTIAL_DOT_SEGMENTS.has(stripKnownBackups(component).toLowerCase())
  ));
}

function words(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => SINGULAR_TERMS.get(word) ?? word);
}

function hasHardSensitivePath(artifact) {
  if (artifact.includes(':') || artifact.includes('\0') || containsSecretValue(artifact)) return true;
  const rawParts = segments(artifact);
  const normalizedParts = rawParts.map(normalizedControlSegment);
  if (rawParts.some((segment, index) => (
    isDotControlFile(segment, normalizedParts[index])
      || isEnvironmentControl(segment, normalizedParts[index])
  ))) return true;
  if (hasHiddenCredentialRoot(normalizedParts)) return true;
  return rawParts.some(hasCredentialDotSegment);
}

function finalRealExtension(basename) {
  return path.posix.extname(stripKnownBackups(basename).toLowerCase());
}

function hasSensitiveSemantics(artifact) {
  const pathWords = segments(artifact).flatMap(words);
  if (pathWords.some((word) => SENSITIVE_SINGLE_TERMS.has(word))) return true;
  if (pathWords.some((word) => COLLAPSED_SENSITIVE_PHRASES.has(word))) return true;
  return SENSITIVE_CREDENTIAL_PHRASES.some((phrase) => pathWords.some((_, index) => (
    phrase.every((word, offset) => {
      const candidate = pathWords[index + offset];
      return candidate === word
        || (offset === phrase.length - 1 && candidate === `${word}s`);
    })
  )));
}

export function containsSecretValue(value) {
  return SECRET_VALUE.test(value);
}

export function isSensitiveArtifactDirectoryPath(directory) {
  return hasHardSensitivePath(directory);
}

export function isSensitiveArtifactPath(artifact) {
  if (hasHardSensitivePath(artifact)) return true;
  const basename = segments(artifact).at(-1) ?? '';
  if (RUNBOOK_EXTENSIONS.has(finalRealExtension(basename))) return false;
  return hasSensitiveSemantics(artifact);
}

export function isSafeProjectRelativeArtifactPath(artifact) {
  if (artifact.includes(':') || /[\u0000-\u001f\u007f]/.test(artifact)) return false;
  const portable = artifact.replaceAll('\\', '/');
  if (path.posix.isAbsolute(portable) || path.win32.parse(artifact).root) return false;
  return !portable.split('/').some((segment) => segment === '..');
}
