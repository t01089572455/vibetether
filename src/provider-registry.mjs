import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PROVIDER_CHANNELS } from './constants.mjs';
import { conflictError } from './errors.mjs';
import { assertSafeId, hashTree, readJsonFile, rejectAbsoluteSymlinkChain } from './files.mjs';
import { cacheHome } from './paths.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARD_KEYS = new Set([
  'id','channel','builtin','version','source','license','object_hash','fingerprint','capabilities','phases',
  'positive_triggers','negative_triggers','hosts','operating_systems','permissions','context_bytes','quality',
  'description','path','resources','scripts','worker_recommended','evaluation','created_at','updated_at','packs','workflow_role'
]);
const QUALITY_KEYS = new Set(['trigger_precision','trigger_recall','output_gain','evaluated_at']);
const PERMISSION_KEYS = new Set(['network','external_write','code_write']);

function only(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw conflictError(`${label} contains unsupported field: ${key}`, 'INVALID_PROVIDER');
}
function stringArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== 'string' || !item.trim())) throw conflictError(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings.`, 'INVALID_PROVIDER');
  return [...new Set(value.map((item) => item.trim()))];
}

export function validateProviderCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) throw conflictError('Provider card must be an object.', 'INVALID_PROVIDER');
  only(card, CARD_KEYS, `Provider ${card.id ?? ''}`);
  assertSafeId(card.id, 'Provider id');
  if (!PROVIDER_CHANNELS.has(card.channel)) throw conflictError(`Provider ${card.id} has an invalid channel.`, 'INVALID_PROVIDER');
  if (typeof card.builtin !== 'boolean') throw conflictError(`Provider ${card.id} builtin must be boolean.`, 'INVALID_PROVIDER');
  if (typeof card.version !== 'string' || !card.version.trim()) throw conflictError(`Provider ${card.id} requires a version.`, 'INVALID_PROVIDER');
  if (typeof card.source !== 'string' || !card.source.trim() || typeof card.license !== 'string' || !card.license.trim()) throw conflictError(`Provider ${card.id} requires source and license.`, 'INVALID_PROVIDER');
  card.capabilities = stringArray(card.capabilities, `Provider ${card.id} capabilities`);
  card.phases = stringArray(card.phases, `Provider ${card.id} phases`);
  card.packs = stringArray(card.packs ?? ['core'], `Provider ${card.id} packs`);
  card.workflow_role = card.workflow_role ?? 'primary';
  if (!['primary','alternative','overlay'].includes(card.workflow_role)) throw conflictError(`Provider ${card.id} workflow_role is invalid.`, 'INVALID_PROVIDER');
  for (const field of ['positive_triggers','negative_triggers','hosts','operating_systems','resources','scripts']) card[field] = stringArray(card[field] ?? [], `Provider ${card.id} ${field}`, { allowEmpty: true });
  if (!card.permissions || typeof card.permissions !== 'object' || Array.isArray(card.permissions)) throw conflictError(`Provider ${card.id} permissions must be an object.`, 'INVALID_PROVIDER');
  only(card.permissions, PERMISSION_KEYS, `Provider ${card.id} permissions`);
  for (const key of PERMISSION_KEYS) if (typeof card.permissions[key] !== 'boolean') throw conflictError(`Provider ${card.id} permission ${key} must be boolean.`, 'INVALID_PROVIDER');
  if (!Number.isInteger(card.context_bytes) || card.context_bytes < 1 || card.context_bytes > 1024 * 1024) throw conflictError(`Provider ${card.id} context_bytes is invalid.`, 'INVALID_PROVIDER');
  if (!card.quality || typeof card.quality !== 'object' || Array.isArray(card.quality)) throw conflictError(`Provider ${card.id} quality must be an object.`, 'INVALID_PROVIDER');
  only(card.quality, QUALITY_KEYS, `Provider ${card.id} quality`);
  for (const key of ['trigger_precision','trigger_recall']) if (typeof card.quality[key] !== 'number' || card.quality[key] < 0 || card.quality[key] > 1) throw conflictError(`Provider ${card.id} quality ${key} is invalid.`, 'INVALID_PROVIDER');
  if (typeof card.quality.output_gain !== 'number' || card.quality.output_gain < -1 || card.quality.output_gain > 10) throw conflictError(`Provider ${card.id} output_gain is invalid.`, 'INVALID_PROVIDER');
  if (!Number.isFinite(Date.parse(card.quality.evaluated_at))) throw conflictError(`Provider ${card.id} quality evaluated_at is invalid.`, 'INVALID_PROVIDER');
  if (typeof card.description !== 'string' || !card.description.trim() || Buffer.byteLength(card.description, 'utf8') > 1000) throw conflictError(`Provider ${card.id} description is invalid.`, 'INVALID_PROVIDER');
  if (typeof card.path !== 'string' || !card.path.trim()) throw conflictError(`Provider ${card.id} path is invalid.`, 'INVALID_PROVIDER');
  if (card.builtin) {
    if (card.object_hash !== null && card.object_hash !== undefined && !/^[a-f0-9]{64}$/.test(card.object_hash)) throw conflictError(`Provider ${card.id} object_hash is invalid.`, 'INVALID_PROVIDER');
  } else {
    if (!/^[a-f0-9]{64}$/.test(card.object_hash ?? '') || !/^[a-f0-9]{64}$/.test(card.fingerprint ?? '')) throw conflictError(`External Provider ${card.id} requires object_hash and fingerprint.`, 'INVALID_PROVIDER');
  }
  return card;
}

export async function loadCapabilities() {
  const value = JSON.parse(await readFile(path.join(packageRoot, 'registry', 'capabilities.json'), 'utf8'));
  if (!value || value.schema_version !== 1 || !Array.isArray(value.capabilities)) throw conflictError('Capability registry is invalid.', 'INVALID_REGISTRY');
  const ids = new Set();
  for (const capability of value.capabilities) {
    assertSafeId(capability.id, 'Capability id');
    if (ids.has(capability.id)) throw conflictError(`Duplicate capability: ${capability.id}`, 'INVALID_REGISTRY');
    ids.add(capability.id);
    if (!Array.isArray(capability.phases) || !capability.phases.length || typeof capability.fallback !== 'string') throw conflictError(`Capability ${capability.id} is invalid.`, 'INVALID_REGISTRY');
  }
  return value;
}

async function externalCards() {
  const directory = path.join(cacheHome(), 'providers', 'cards');
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const cards = [];
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const card = validateProviderCard(await readJsonFile(path.join(directory, entry.name), 'Provider card'));
    const objectRoot = path.join(cacheHome(), 'providers', 'objects', card.object_hash);
    await rejectAbsoluteSymlinkChain(objectRoot, { allowMissing: false });
    const actual = await hashTree(objectRoot);
    if (actual !== card.fingerprint || actual !== card.object_hash) throw conflictError(`Provider cache object is corrupt: ${card.id}`, 'PROVIDER_FINGERPRINT');
    cards.push({ ...card, resolved_path: objectRoot });
  }
  return cards;
}

let packagedRegistryPromise = null;

async function loadPackagedRegistry() {
  const [capabilities, source] = await Promise.all([
    loadCapabilities(),
    readFile(path.join(packageRoot, 'registry', 'providers.json'), 'utf8'),
  ]);
  const parsed = JSON.parse(source);
  if (!parsed || parsed.schema_version !== 1 || !Array.isArray(parsed.providers)) throw conflictError('Provider registry is invalid.', 'INVALID_REGISTRY');
  const providers = [];
  for (const raw of parsed.providers) {
    const card = validateProviderCard(raw);
    const resolved = path.resolve(packageRoot, card.path);
    await rejectAbsoluteSymlinkChain(resolved, { allowMissing: false });
    const fingerprint = await hashTree(resolved);
    providers.push({ ...card, fingerprint, object_hash: fingerprint, resolved_path: resolved });
  }
  return { capabilities, providers };
}

export async function loadProviderRegistry() {
  packagedRegistryPromise ??= loadPackagedRegistry();
  const packaged = await packagedRegistryPromise;
  const providers = [...packaged.providers, ...await externalCards()];
  const ids = new Set();
  for (const card of providers) {
    if (ids.has(card.id)) throw conflictError(`Duplicate Provider id: ${card.id}`, 'INVALID_REGISTRY');
    ids.add(card.id);
  }
  return { capabilities: packaged.capabilities, providers, packageRoot };
}
