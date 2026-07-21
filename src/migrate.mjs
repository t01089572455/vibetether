import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cp, lstat, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { conflictError } from './errors.mjs';
import {
  atomicJson, boundedText, canonicalJson, copyVerifiedDirectory, exists, hashTree, sha256File,
  readJsonFile, readTextIfPresent, safeRelative, transactionalWrites,
} from './files.mjs';
import { cacheHome, stateHome } from './paths.mjs';
import { createManifest, createSkillsLock, discoverContract } from './contract.mjs';
import { loadProviderRegistry } from './provider-registry.mjs';
import { importProvider } from './provider-cache.mjs';
import { parseIntent, renderIntent } from './intent.mjs';
import { emptyExperienceIndex } from './experience.mjs';
import { addTruthCandidate, emptyTruthMap, parseTruthMap, renderTruthMap, authoritySnapshot } from './truth.mjs';
import { renderProjectLauncher } from './launcher.mjs';
import { cacheRuntimePackage } from './release-cache.mjs';
import { ADAPTERS, managedBlock, selectedAdapters } from './adapters.mjs';
import { MANAGED_END, MANAGED_START } from './constants.mjs';
import { attachWorktree } from './worktree.mjs';
import { writeCurrentProjection } from './runtime.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationRoot = (id) => path.join(stateHome(), 'migrations', id);

function yamlScalar(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

function legacyProviderPacks(source) {
  const profile = yamlScalar(source, 'profile') ?? 'standard';
  const packs = profile === 'core' ? [] : profile === 'extended' ? ['standard', 'extended'] : ['standard'];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let inBundles = false;
  for (const line of lines) {
    if (/^bundles:\s*$/.test(line)) { inBundles = true; continue; }
    if (inBundles && /^\S/.test(line)) break;
    if (!inBundles) continue;
    const match = line.match(/^\s*-\s+(.+?)\s*$/);
    if (!match) continue;
    const pack = match[1].replace(/^['"]|['"]$/g, '');
    if (['web', 'production'].includes(pack)) packs.push(pack);
  }
  return [...new Set(packs)];
}

function legacySourcePaths(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const output = [];
  let inSources = false;
  for (const line of lines) {
    if (/^sources:\s*$/.test(line)) { inSources = true; continue; }
    if (inSources && /^\S/.test(line)) break;
    if (!inSources) continue;
    const match = line.match(/^\s*-\s+(.+?)\s*$/);
    if (!match) continue;
    const item = match[1].replace(/^['"]|['"]$/g, '');
    if (item && !/^https?:/.test(item) && !item.includes('${')) output.push(item);
  }
  return [...new Set(output)];
}




const LEGACY_ROUTE_LIST_FIELDS = new Set(['phases','when_any','expected_outputs','exit_evidence','use_when']);
const LEGACY_ROUTE_SCALAR_FIELDS = new Set(['id','capability','skill','role']);

function unquoteLegacyScalar(value) {
  const text = String(value ?? '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  return text;
}
function legacyFlowList(value) {
  const text = String(value ?? '').trim();
  if (text === '[]') return [];
  if (!(text.startsWith('[') && text.endsWith(']'))) return null;
  return text.slice(1, -1).split(',').map(unquoteLegacyScalar).map((item) => item.trim()).filter(Boolean);
}

export function parseLegacyProjectRoutes(source) {
  if (!source || !String(source).trim()) return { schema_version: 1, routes: [] };
  const normalized = String(source).replaceAll('\r\n', '\n');
  if (!/^schema_version:\s*1\s*$/m.test(normalized)) throw conflictError('Legacy project routes require schema_version 1.', 'INVALID_ROUTES');
  const routes = [];
  let current = null;
  let listKey = null;
  for (const line of normalized.split('\n')) {
    let match;
    if ((match = line.match(/^  - id:\s*(.+)$/))) {
      current = { id: unquoteLegacyScalar(match[1]), phases: [], when_any: [], expected_outputs: [], exit_evidence: [], use_when: [] };
      routes.push(current);
      listKey = null;
      continue;
    }
    if (!current) continue;
    if ((match = line.match(/^    ([a-z_]+):\s*(.*)$/))) {
      const key = match[1];
      const value = match[2];
      if (LEGACY_ROUTE_LIST_FIELDS.has(key)) {
        const flow = legacyFlowList(value);
        if (flow !== null) { current[key] = flow; listKey = null; }
        else if (!value) { current[key] = []; listKey = key; }
        else throw conflictError(`Legacy route ${current.id} has unsupported list syntax for ${key}.`, 'INVALID_ROUTES');
      } else if (LEGACY_ROUTE_SCALAR_FIELDS.has(key)) {
        if (!value) throw conflictError(`Legacy route ${current.id} is missing ${key}.`, 'INVALID_ROUTES');
        current[key] = unquoteLegacyScalar(value);
        listKey = null;
      } else if (value || key) {
        throw conflictError(`Legacy route ${current.id} contains unsupported field: ${key}`, 'INVALID_ROUTES');
      }
      continue;
    }
    if ((match = line.match(/^      -\s+(.+)$/)) && listKey) {
      current[listKey].push(unquoteLegacyScalar(match[1]));
      continue;
    }
  }
  for (const route of routes) {
    for (const key of ['id','capability','skill','role']) if (!route[key]) throw conflictError(`Legacy route is missing ${key}.`, 'INVALID_ROUTES');
    if (!route.phases.length) throw conflictError(`Legacy route ${route.id} requires phases.`, 'INVALID_ROUTES');
    if (!['primary','alternative','overlay'].includes(route.role)) throw conflictError(`Legacy route ${route.id} has invalid role.`, 'INVALID_ROUTES');
    if (route.role === 'primary' && !route.when_any.length) throw conflictError(`Legacy primary route ${route.id} requires when_any.`, 'INVALID_ROUTES');
  }
  return { schema_version: 1, routes };
}

function legacyProviderInstallMap(source) {
  const map = new Map();
  if (!source) return map;
  let currentId = null;
  for (const line of String(source).replaceAll('\r\n', '\n').split('\n')) {
    let match;
    if ((match = line.match(/^\s*- id:\s*(.+)$/))) currentId = unquoteLegacyScalar(match[1]);
    else if (currentId && (match = line.match(/^\s+install_name:\s*(.+)$/))) map.set(unquoteLegacyScalar(match[1]), currentId);
  }
  return map;
}

function packagedProviderForLegacySkill(skill, registry, installMap) {
  const locked = installMap.get(skill);
  if (locked && registry.providers.some((provider) => provider.id === locked)) return locked;
  const exact = registry.providers.find((provider) => provider.id === skill);
  if (exact) return exact.id;
  const candidates = registry.providers.filter((provider) => provider.path?.split('/').at(-1) === skill || provider.id.endsWith(`-${skill}`));
  if (candidates.length === 1) return candidates[0].id;
  return null;
}

async function findLegacyProjectSkill(root, skill, adapters) {
  for (const adapter of adapters) {
    const skillRoot = path.dirname(path.dirname(ADAPTERS[adapter].skill));
    const candidate = path.join(root, ...skillRoot.split('/'), skill);
    if (await exists(path.join(candidate, 'SKILL.md'))) return { path: candidate, adapter };
  }
  return null;
}

async function migrateLegacyRoutes(root, agent, routesSource, providerLockSource, packs) {
  const parsed = parseLegacyProjectRoutes(routesSource);
  if (!parsed.routes.length) return { routes: { schema_version: 1, routes: [] }, skills: createSkillsLock({ packs }), imported: [] };
  const registry = await loadProviderRegistry();
  const installMap = legacyProviderInstallMap(providerLockSource);
  const adapters = selectedAdapters(agent ?? 'both');
  const grouped = new Map();
  for (const route of parsed.routes) {
    const list = grouped.get(route.skill) ?? [];
    list.push(route);
    grouped.set(route.skill, list);
  }
  const providerIds = new Map();
  const imported = [];
  const skills = createSkillsLock({ packs });
  for (const [skill, skillRoutes] of grouped) {
    let providerId = packagedProviderForLegacySkill(skill, registry, installMap);
    if (!providerId) {
      const installed = await findLegacyProjectSkill(root, skill, adapters);
      if (!installed) throw conflictError(`Legacy project route ${skillRoutes[0].id} references Skill ${skill}, but no verified installed copy is available for migration.`, 'MIGRATION_ROUTE_UNRESOLVED');
      const capabilities = [...new Set(skillRoutes.map((route) => route.capability))];
      const phases = [...new Set(skillRoutes.flatMap((route) => route.phases))];
      const triggers = [...new Set(skillRoutes.flatMap((route) => route.when_any))];
      const card = await importProvider({
        id: skill, source: installed.path, source_label: `v0.6.3-project-skill:${skill}`, version: '0.6.3-project-local',
        license: 'Project-local; user review required', capabilities, phases, positive_triggers: triggers,
        hosts: adapters, operating_systems: ['linux','darwin','win32'],
        network: false, external_write: false, code_write: phases.includes('EXECUTE_ONE'),
      });
      providerId = card.id;
      skills.pins.push({ id: card.id, object_hash: card.object_hash, fingerprint: card.fingerprint, source: card.source, version: card.version, license: card.license });
      imported.push(card.id);
    }
    providerIds.set(skill, providerId);
  }
  const routes = parsed.routes.map((route) => ({
    id: route.id, phases: route.phases, capability: route.capability,
    signals: { all: [], any: route.when_any, none: [] },
    provider: providerIds.get(route.skill), role: route.role,
    priority: route.role === 'primary' ? 1_000_000 : route.role === 'overlay' ? 900_000 : -1,
    required_outputs: route.expected_outputs, exit_evidence: route.exit_evidence,
  }));
  return { routes: { schema_version: 1, routes }, skills, imported };
}

function parseLegacyIntent(source) {
  if (!source) return renderIntent({ status: 'draft' });
  try {
    const parsed = parseIntent(source);
    return renderIntent(parsed);
  } catch {
    // Continue with the real 0.x section/metadata format.
  }
  const normalized = String(source).replaceAll('\r\n', '\n');
  const marker = normalized.match(/<!-- vibetether:intent:v1 ([A-Za-z0-9_-]+) -->/);
  if (marker) {
    try {
      const value = JSON.parse(Buffer.from(marker[1], 'base64url').toString('utf8'));
      const goal = typeof value.goal === 'string' ? value.goal.trim() : '';
      const evidenceValue = value.success_evidence ?? value.successEvidence;
      const successEvidence = Array.isArray(evidenceValue)
        ? evidenceValue.filter((item) => typeof item === 'string' && item.trim()).join('; ')
        : typeof evidenceValue === 'string' ? evidenceValue.trim() : '';
      const boundariesValue = value.scope_boundaries ?? value.scopeBoundaries;
      const scopeBoundaries = Array.isArray(boundariesValue)
        ? boundariesValue.filter((item) => typeof item === 'string' && item.trim())
        : typeof boundariesValue === 'string' && boundariesValue.trim() ? [boundariesValue.trim()] : [];
      const constraints = Array.isArray(value.constraints)
        ? value.constraints.filter((item) => typeof item === 'string' && item.trim())
        : [];
      return renderIntent({
        status: goal && successEvidence ? 'confirmed' : 'draft',
        goal,
        success_evidence: successEvidence,
        scope_boundaries: scopeBoundaries,
        constraints,
      });
    } catch {
      // Fall through to visible Markdown sections.
    }
  }
  const section = (titles) => {
    for (const title of titles) {
      const match = normalized.match(new RegExp(`^## ${title}\\s*$\\n([\\s\\S]*?)(?=^## |\\Z)`, 'm'));
      if (match) return match[1].trim();
    }
    return '';
  };
  const scalar = (value) => value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== '_None._' && line !== 'None.' && !/^No .* recorded/i.test(line))
    .map((line) => line.replace(/^-\s+/, ''))
    .join(' ')
    .trim();
  const list = (value) => value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ') && line !== '- _None._' && line !== '- None.')
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
  const goal = scalar(section(['Goal']));
  const successEvidence = scalar(section(['Success evidence']));
  return renderIntent({
    status: goal && successEvidence ? 'confirmed' : 'draft',
    goal,
    success_evidence: successEvidence,
    scope_boundaries: list(section(['Scope boundaries'])),
    constraints: list(section(['Non-negotiable constraints', 'Constraints'])),
  });
}

function legacyTruthMetadata(line) {
  const match = line.match(/^  - ([a-z_]+):(?: `([^`]*)`|(.*))$/);
  if (!match) return null;
  return [match[1], (match[2] ?? match[3] ?? '').trim()];
}

export function parseLegacyCanonicalTruth(source) {
  const normalized = String(source ?? '').replaceAll('\r\n', '\n');
  if (!normalized.includes('vibetether:truth-map-v1')) throw conflictError('Legacy Truth Map marker is missing.', 'INVALID_TRUTH');
  const sections = new Map([
    ['Confirmed project truth', 'confirmed'],
    ['Candidates awaiting confirmation', 'candidates'],
    ['Declined candidates', 'declined'],
    ['Host bootstrap', null],
    ['Control-plane pointers', null],
  ]);
  const map = emptyTruthMap();
  let current = undefined;
  for (const lines = normalized.split('\n'), length = lines.length, state = { index: 0 }; state.index < length; state.index += 1) {
    const line = lines[state.index];
    const heading = line.match(/^## (.+)$/);
    if (heading) { current = sections.has(heading[1]) ? sections.get(heading[1]) : undefined; continue; }
    const bullet = line.match(/^- \[([ xX])\] `([^`]+)`$/);
    if (!bullet) continue;
    const fields = {};
    while (state.index + 1 < length) {
      const item = legacyTruthMetadata(lines[state.index + 1]);
      if (!item) break;
      fields[item[0]] = item[1];
      state.index += 1;
    }
    if (!current) continue; // Host and control-plane entries are bootstrap mechanics, not project authority.
    if (!fields.role || !fields.scope) throw conflictError(`Legacy Truth entry requires role and scope: ${bullet[2]}`, 'INVALID_TRUTH');
    const checked = bullet[1].toLowerCase() === 'x';
    if (current === 'confirmed' && !checked) throw conflictError(`Legacy confirmed Truth must be checked: ${bullet[2]}`, 'INVALID_TRUTH');
    if (current !== 'confirmed' && checked) throw conflictError(`Legacy non-authoritative Truth must be unchecked: ${bullet[2]}`, 'INVALID_TRUTH');
    map[current].push({
      path: bullet[2],
      id: fields.id || undefined,
      role: fields.role,
      scope: fields.scope,
      source: fields.source || 'v0.6.3-truth-map',
      reason: fields.reason || undefined,
      supersedes: fields.supersedes || undefined,
      phases: [],
      operations: [],
      directionality: 'directional',
    });
  }
  return map;
}

function migrationTruthIndex(legacyPath) {
  if (legacyPath === '.vibetether/TRUTH.md') return '.vibetether/TRUTH-MAP.md';
  if (legacyPath === '.vibetether/TRUTH-MAP.md') return '.vibetether/TRUTH-MAP.v1.md';
  return '.vibetether/TRUTH-MAP.md';
}

function parseLegacyExperience(source) {
  if (!source) return emptyExperienceIndex();
  if (source.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(source);
      if (parsed?.schema_version === 2 && Array.isArray(parsed.entries)) {
        return {
          schema_version: 2,
          entries: parsed.entries.map((entry) => ({
            ...entry,
            status: entry.status === 'proven' ? 'provisional' : entry.status,
            artifacts: (entry.artifacts ?? []).map((item) => typeof item === 'string' ? { path: item, sha256: null } : { ...item, sha256: null }),
            verification: null,
            environment: null,
            counterevidence: entry.counterevidence ?? [],
          })),
        };
      }
    } catch {
      return emptyExperienceIndex();
    }
  }
  const entries = [];
  let current = null;
  let list = null;
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    let match;
    if ((match = line.match(/^\s*- id:\s*(.+)$/))) {
      current = {
        id: match[1].trim().replace(/^['"]|['"]$/g, ''), status: 'provisional', use_when: [], systems: [],
        artifacts: [], verified_at: null, review_after: null, revalidate_when: [], verification: null,
        environment: null, counterevidence: [],
      };
      entries.push(current);
      list = null;
      continue;
    }
    if (!current) continue;
    if ((match = line.match(/^\s{4}(use_when|systems|artifacts|revalidate_when):\s*$/))) { list = match[1]; continue; }
    if ((match = line.match(/^\s{6}-\s+(.+)$/)) && list) {
      const item = match[1].trim().replace(/^['"]|['"]$/g, '');
      if (list === 'artifacts') current.artifacts.push({ path: item, sha256: null });
      else current[list].push(item);
      continue;
    }
    if ((match = line.match(/^\s{4}verified_at:\s*(.+)$/))) current.verified_at = match[1].trim().replace(/^['"]|['"]$/g, '');
  }
  return { schema_version: 2, entries: entries.filter((entry) => entry.id && entry.use_when.length && entry.artifacts.length) };
}

function recoverCheckpoint(source) {
  if (!source) return null;
  const text = source.replace(/\r\n/g, '\n');
  const read = (key) => text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null;
  const data = { goal: read('goal'), phase: read('phase'), slice: read('slice'), next: read('next_intended_action') };
  if (!data.goal && !data.slice) return null;
  const forbidden = /doctor_verdict|verified_delivery|evidence_verdict|chain.of.thought/i;
  for (const key of ['goal', 'slice', 'next']) if (forbidden.test(data[key] ?? '')) data[key] = null;
  if (!/^[A-Z_]+$/.test(data.phase ?? '')) data.phase = null;
  return data;
}

function replaceLegacyManagedBlock(source) {
  const content = source ?? '';
  const start = content.indexOf(MANAGED_START);
  const end = content.indexOf(MANAGED_END, Math.max(0, start));
  if (start === -1 && end === -1) return `${content}${content && !content.endsWith('\n') ? '\n' : ''}${content ? '\n' : ''}${managedBlock()}\n`;
  if (start === -1 || end === -1 || content.indexOf(MANAGED_START, start + 1) !== -1 || content.indexOf(MANAGED_END, end + 1) !== -1) {
    throw conflictError('Legacy instruction markers are malformed.', 'MANAGED_BLOCK_CONFLICT');
  }
  return `${content.slice(0, start)}${managedBlock()}${content.slice(end + MANAGED_END.length)}`;
}

export async function planMigration({ project = process.cwd(), control_mode = 'team' } = {}) {
  const root = path.resolve(project);
  const legacyManifest = path.join(root, '.vibetether', 'project.yaml');
  if (!await exists(legacyManifest)) throw conflictError('No 0.x VibeTether project.yaml was found.', 'MIGRATION_NOT_APPLICABLE');
  if (await exists(path.join(root, '.vibetether', 'project.json'))) throw conflictError('Project already has a 1.0 Contract.', 'MIGRATION_NOT_APPLICABLE');
  if (control_mode === 'local') throw conflictError('Migration of a shared 0.x control plane to local-only mode is refused. Migrate to team or hybrid first.', 'MIGRATION_LOCAL_REFUSED');
  const source = await readFile(legacyManifest, 'utf8');
  const truthPath = safeRelative(yamlScalar(source, 'truth_index') ?? '.vibetether/TRUTH.md', 'Legacy Truth index');
  const truthSource = await readTextIfPresent(path.join(root, ...truthPath.split('/')));
  return {
    schema_version: 1,
    status: 'preview',
    project: root,
    control_mode,
    legacy_sources: legacySourcePaths(source).map((item) => ({ path: item, destination: 'candidate' })),
    truth: { path: truthPath, canonical: truthSource?.includes('vibetether:truth-map-v1') === true, action: truthSource?.includes('vibetether:truth-map-v1') ? 'preserve-map' : 'preserve-prose-and-create-sidecar' },
    experience: { action: 'downgrade-all-proven-to-provisional' },
    routes: { action: 'preserve-and-resolve-installed-providers', path: '.vibetether/routes.local.yaml' },
    runtime: { action: 'recover-only-bounded-fields' },
    heavy_assets: ['capabilities.yaml', 'providers.lock.yaml', 'providers/', 'licenses/', 'state/', 'bin/'],
    rollback: 'external byte-preserving backup',
  };
}

const MIGRATION_MANAGED_PATHS = ['.vibetether', '.agents', '.claude', 'AGENTS.md', 'CLAUDE.md', '.gitignore'];

async function inventoryManagedPaths(root) {
  const inventory = {};
  for (const relative of MIGRATION_MANAGED_PATHS) {
    const target = path.join(root, ...relative.split('/'));
    if (!await exists(target)) { inventory[relative] = { existed: false }; continue; }
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink()) throw conflictError(`Migration inventory refuses linked path: ${relative}`, 'UNSAFE_PATH');
    if (metadata.isDirectory()) inventory[relative] = { existed: true, kind: 'directory', digest: await hashTree(target) };
    else if (metadata.isFile()) inventory[relative] = { existed: true, kind: 'file', digest: await sha256File(target) };
    else throw conflictError(`Migration inventory requires a regular file or directory: ${relative}`, 'UNSAFE_FILE');
  }
  return inventory;
}

function inventoryEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

async function copyManagedSnapshot(root, destination) {
  await mkdir(destination, { recursive: true });
  const inventory=await inventoryManagedPaths(root);
  for (const relative of MIGRATION_MANAGED_PATHS) {
    const entry=inventory[relative];
    if (!entry.existed) continue;
    await copyBackupPath(
      path.join(root,...relative.split('/')),
      path.join(destination,...relative.split('/')),
      entry.kind,
    );
  }
  await atomicJson(path.join(destination,'snapshot-manifest.json'),{schema_version:1,inventory});
  return {destination,inventory};
}

async function preserveRollbackConflict(root, record) {
  const id=record.id;
  const destination = path.join(migrationRoot(id), `rollback-conflict-${Date.now()}`);
  const current=await copyManagedSnapshot(root,path.join(destination,'current'));
  if (record.backup&&await exists(record.backup)) {
    const digest=await hashTree(record.backup);
    await copyVerifiedDirectory(record.backup,path.join(destination,'before'),digest);
  }
  if (record.output_snapshot&&await exists(record.output_snapshot)) {
    const digest=await hashTree(record.output_snapshot);
    await copyVerifiedDirectory(record.output_snapshot,path.join(destination,'migration-output'),digest);
  }
  await atomicJson(path.join(destination,'conflict-manifest.json'),{
    schema_version:1,migration_id:id,created_at:new Date().toISOString(),
    before:'before',migration_output:record.output_snapshot?'migration-output':null,current:'current',current_inventory:current.inventory,
  });
  return destination;
}

async function copyBackupPath(source, destination, kind) {
  await mkdir(path.dirname(destination), { recursive: true });
  if (kind === 'directory') {
    const expected = await hashTree(source);
    await copyVerifiedDirectory(source, destination, expected);
  } else {
    await cp(source, destination, { force: false, errorOnExist: true });
    if (await sha256File(source) !== await sha256File(destination)) {
      throw conflictError(`Migration backup verification failed: ${source}`, 'MIGRATION_BACKUP_FAILED');
    }
  }
}

async function backupProject(root, id) {
  const backup = path.join(migrationRoot(id), 'backup');
  await mkdir(backup, { recursive: true });
  const manifest = { schema_version: 1, paths: {}, before_inventory: await inventoryManagedPaths(root) };
  for (const relative of MIGRATION_MANAGED_PATHS) {
    const source = path.join(root, ...relative.split('/'));
    const entry = manifest.before_inventory[relative];
    manifest.paths[relative] = { existed: entry.existed === true, kind: entry.kind ?? null, digest: entry.digest ?? null };
    if (!entry.existed) continue;
    await copyBackupPath(source, path.join(backup, ...relative.split('/')), entry.kind);
  }
  await atomicJson(path.join(backup, 'backup-manifest.json'), manifest);
  return backup;
}

async function restoreBackup(root, backup, { expectedCurrent = null } = {}) {
  const manifest = await readJsonFile(path.join(backup, 'backup-manifest.json'), 'Migration backup manifest');
  if (expectedCurrent) {
    const current = await inventoryManagedPaths(root);
    if (!inventoryEqual(current, expectedCurrent)) {
      if (inventoryEqual(current, manifest.before_inventory)) return { status: 'already-restored' };
      throw conflictError('Migration recovery stopped because managed assets changed after the failed write.', 'ROLLBACK_CONFLICT');
    }
  }
  const transaction = path.join(root, `.vibetether-rollback-${randomUUID()}`);
  const moved = [];
  const restored = [];
  await mkdir(transaction, { recursive: true });
  try {
    for (const relative of MIGRATION_MANAGED_PATHS) {
      const target = path.join(root, ...relative.split('/'));
      if (!await exists(target)) continue;
      const held = path.join(transaction, ...relative.split('/'));
      await mkdir(path.dirname(held), { recursive: true });
      await import('node:fs/promises').then(({ rename }) => rename(target, held));
      moved.push({ relative, target, held });
    }
    for (const relative of MIGRATION_MANAGED_PATHS) {
      const record = manifest.paths[relative];
      if (!record?.existed) continue;
      const stored = path.join(backup, ...relative.split('/'));
      if (!await exists(stored)) throw conflictError(`Migration backup is missing ${relative}.`, 'ROLLBACK_FAILED');
      const target = path.join(root, ...relative.split('/'));
      await copyBackupPath(stored, target, record.kind);
      restored.push(target);
    }
    const actual = await inventoryManagedPaths(root);
    if (!inventoryEqual(actual, manifest.before_inventory)) throw conflictError('Restored migration bytes do not match the pre-migration inventory.', 'ROLLBACK_FAILED');
    await rm(transaction, { recursive: true, force: true });
    return { status: 'restored' };
  } catch (cause) {
    const recoveryErrors = [];
    for (const target of restored.reverse()) await rm(target, { recursive: true, force: true }).catch((error) => recoveryErrors.push(error.message));
    for (const item of moved.reverse()) {
      if (!await exists(item.held)) continue;
      await mkdir(path.dirname(item.target), { recursive: true });
      await import('node:fs/promises').then(({ rename }) => rename(item.held, item.target)).catch((error) => recoveryErrors.push(error.message));
    }
    if (recoveryErrors.length) throw conflictError(`Rollback failed and recovery was incomplete. Preserved recovery bytes: ${transaction}. Errors: ${recoveryErrors.join('; ')}`, 'ROLLBACK_FAILED');
    await rm(transaction, { recursive: true, force: true }).catch(() => {});
    throw cause;
  }
}

export async function migrate(options = {}, runtimeHooks = {}) {
  const plan = await planMigration(options);
  if (options.dry_run) return plan;
  if (!options.yes) throw conflictError('Migration requires --yes or --dry-run.', 'CONFIRMATION_REQUIRED');
  const root = plan.project;
  const id = `migration-${randomUUID()}`;
  const createBackup = runtimeHooks.backupProject ?? backupProject;
  const backup = await createBackup(root, id);
  const record = {
    schema_version: 1, id, project: root, backup, created_at: new Date().toISOString(), status: 'applying', plan,
    recovery: { attempted: false, completed: false, errors: [] },
  };
  const recordPath = path.join(migrationRoot(id), 'migration.json');
  await atomicJson(recordPath, record);
  try {
    const legacyManifestSource = await readFile(path.join(root, '.vibetether', 'project.yaml'), 'utf8');
    const legacyTruthPath = safeRelative(yamlScalar(legacyManifestSource, 'truth_index') ?? '.vibetether/TRUTH.md', 'Legacy Truth index');
    const legacyTruthSource = await readTextIfPresent(path.join(root, ...legacyTruthPath.split('/')));
    let truthMap = emptyTruthMap();
    let truthIndex = '.vibetether/TRUTH.md';
    if (legacyTruthSource?.includes('vibetether:truth-map-v1')) {
      truthMap = parseLegacyCanonicalTruth(legacyTruthSource);
      truthIndex = migrationTruthIndex(legacyTruthPath); // Preserve the v0.6.3 Truth bytes and write the 1.0 index beside them.
    } else if (legacyTruthSource !== null) truthIndex = migrationTruthIndex(legacyTruthPath);
    const registered = new Set([...truthMap.confirmed, ...truthMap.candidates, ...truthMap.declined].map((item) => item.path));
    for (const sourcePath of legacySourcePaths(legacyManifestSource)) {
      if (registered.has(sourcePath)) continue;
      try {
        truthMap = addTruthCandidate(truthMap, { path: sourcePath, role: 'legacy-source', scope: '.', source: '0.x-manifest-migration', reason: 'Legacy source requires explicit 1.0 authority review.' });
        registered.add(sourcePath);
      } catch {
        // Unsafe legacy paths remain available only in the external backup.
      }
    }
    if (truthIndex !== legacyTruthPath && legacyTruthSource !== null && !legacyTruthSource.includes('vibetether:truth-map-v1') && !registered.has(legacyTruthPath)) {
      truthMap = addTruthCandidate(truthMap, { path: legacyTruthPath, role: 'legacy-authority-document', scope: '.', source: '0.x-truth-collision', reason: 'Preserved legacy prose Truth document requires explicit activation review.' });
    }
    const oldExperience = await readTextIfPresent(path.join(root, '.vibetether', 'experience-index.yaml'));
    const experience = parseLegacyExperience(oldExperience);
    const oldIntent = await readTextIfPresent(path.join(root, '.vibetether', 'intent.md'));
    const intent = parseLegacyIntent(oldIntent);
    const oldRoutes = await readTextIfPresent(path.join(root, '.vibetether', 'routes.local.yaml'));
    const oldProviderLock = await readTextIfPresent(path.join(root, '.vibetether', 'providers.lock.yaml'));
    const packs = legacyProviderPacks(legacyManifestSource);
    const migratedRouting = await migrateLegacyRoutes(root, options.agent ?? 'both', oldRoutes, oldProviderLock, packs);
    const manifest = createManifest({ control_mode: options.control_mode ?? 'team', truth_index: truthIndex });
    const entrySkill = await readFile(path.join(packageRoot, 'skills', 'vibe-tether', 'SKILL.md'), 'utf8');
    const deepSkill = await readFile(path.join(packageRoot, 'skills', 'vibe-tether-deep', 'SKILL.md'), 'utf8');
    const plans = [
      { target: path.join(root, '.vibetether', 'project.json'), content: canonicalJson(manifest) },
      { target: path.join(root, ...manifest.intent.split('/')), content: intent },
      { target: path.join(root, ...manifest.truth_index.split('/')), content: renderTruthMap(truthMap) },
      { target: path.join(root, ...manifest.experience_index.split('/')), content: canonicalJson(experience) },
      { target: path.join(root, ...manifest.skills_lock.split('/')), content: canonicalJson(migratedRouting.skills) },
      { target: path.join(root, ...manifest.routes.split('/')), content: canonicalJson(migratedRouting.routes) },
      { target: path.join(root, ...manifest.launcher.split('/')), content: renderProjectLauncher(manifest.vibetether_version), mode: 0o755 },
    ];
    for (const adapter of selectedAdapters(options.agent ?? 'both')) {
      const config = ADAPTERS[adapter];
      plans.push({ target: path.join(root, config.instruction), content: replaceLegacyManagedBlock(await readTextIfPresent(path.join(root, config.instruction))) });
      plans.push({ target: path.join(root, ...config.skill.split('/')), content: entrySkill });
      plans.push({ target: path.join(root, ...config.deepSkill.split('/')), content: deepSkill });
    }
    await cacheRuntimePackage();
    await transactionalWrites(plans);
    const catalog = path.join(root, '.vibetether', 'providers', 'catalog');
    if (await exists(catalog)) {
      const digest = await hashTree(catalog);
      await copyVerifiedDirectory(catalog, path.join(cacheHome(), 'legacy-catalogs', digest), digest);
      record.legacy_catalog_hash = digest;
    }
    for (const relative of ['capabilities.yaml', 'providers.lock.yaml', 'providers', 'licenses', 'state', 'bin']) {
      await rm(path.join(root, '.vibetether', relative), { recursive: true, force: true });
    }
    const context = await discoverContract(root);
    const authority = await authoritySnapshot(root, parseTruthMap(context.truthSource), context.intentSource);
    const runtime = await attachWorktree(context, authority.authority_digest);
    const recovered = recoverCheckpoint(await readTextIfPresent(path.join(backup, '.vibetether', 'state', 'current.yaml')));
    if (recovered) {
      const current = runtime.current;
      if (recovered.goal) current.goal = boundedText(recovered.goal, 1000, 'Recovered goal');
      if (recovered.phase) current.phase = recovered.phase;
      if (recovered.slice) current.slice = boundedText(recovered.slice, 1000, 'Recovered slice');
      if (recovered.next) current.next_action = boundedText(recovered.next, 500, 'Recovered next action');
      current.status = 'blocked';
      current.open_risks = ['Legacy runtime was reduced to bounded recovery context and requires a fresh re-anchor.'];
      current.updated_at = new Date().toISOString();
      await writeCurrentProjection(runtime.paths, current);
    }
    if (typeof runtimeHooks.afterApply === 'function') await runtimeHooks.afterApply({ root, id, record });
    record.output_inventory = await inventoryManagedPaths(root);
    record.output_snapshot=path.join(migrationRoot(id),'output');
    await copyManagedSnapshot(root,record.output_snapshot);
    record.status = 'applied';
    record.completed_at = new Date().toISOString();
    await atomicJson(recordPath, record);
    return { status: 'migrated', migration_id: id, project_id: manifest.project_id, truth_index: truthIndex, legacy_sources: plan.legacy_sources, imported_project_skills: migratedRouting.imported, migrated_routes: migratedRouting.routes.routes.length, rollback: `vibetether migrate rollback --id ${id} --yes` };
  } catch (cause) {
    record.failure = String(cause.message);
    record.recovery = { attempted: true, completed: false, errors: [] };
    try { record.failure_inventory = await inventoryManagedPaths(root); }
    catch (inventoryCause) { record.recovery.errors.push(`Failure inventory: ${inventoryCause.message}`); }
    const restore = runtimeHooks.restoreBackup ?? restoreBackup;
    if (record.failure_inventory) {
      try {
        await restore(root, backup, { expectedCurrent: record.failure_inventory });
        record.status = 'rolled-back';
        record.recovery.completed = true;
        record.rolled_back_at = new Date().toISOString();
      } catch (restoreCause) {
        record.recovery.errors.push(String(restoreCause.message ?? restoreCause));
      }
    }
    if (!record.recovery.completed) {
      record.status = 'recovery-required';
      record.recovery_required_at = new Date().toISOString();
    }
    await atomicJson(recordPath, record);
    if (!record.recovery.completed) {
      throw conflictError(`Migration failed and automatic restore also failed; recovery is required. Original error: ${cause.message}. Restore error: ${record.recovery.errors.join('; ')}`, 'ROLLBACK_FAILED');
    }
    throw cause;
  }
}

export async function rollbackMigration({ id, yes = false } = {}) {
  if (!yes) throw conflictError('Migration rollback requires --yes.', 'CONFIRMATION_REQUIRED');
  const recordPath = path.join(migrationRoot(id), 'migration.json');
  const record = await readJsonFile(recordPath, 'Migration record');
  if (record.status === 'rolled-back') return { status: 'already-restored', migration_id: id, project: record.project };
  if (!['applied', 'rollback-conflict', 'conflict-preserved', 'recovery-required'].includes(record.status)) {
    throw conflictError(`Migration ${id} cannot be rolled back from status ${record.status}.`, 'MIGRATION_NOT_APPLICABLE');
  }
  const backupManifest = await readJsonFile(path.join(record.backup, 'backup-manifest.json'), 'Migration backup manifest');
  const currentInventory = await inventoryManagedPaths(record.project);
  const expectedCurrent=record.output_inventory??record.failure_inventory??null;
  if (expectedCurrent && !inventoryEqual(currentInventory, expectedCurrent)) {
    if (backupManifest.before_inventory && inventoryEqual(currentInventory, backupManifest.before_inventory)) {
      record.status = 'rolled-back';
      record.rolled_back_at = new Date().toISOString();
      await atomicJson(recordPath, record);
      return { status: 'already-restored', migration_id: id, project: record.project };
    }
    const conflictPath = await preserveRollbackConflict(record.project, record);
    record.status = 'conflict-preserved';
    record.rollback_conflict_path = conflictPath;
    record.rollback_conflict_at = new Date().toISOString();
    await atomicJson(recordPath, record);
    throw conflictError(`Rollback stopped because managed assets changed after migration. Current bytes were preserved at ${conflictPath}.`, 'ROLLBACK_CONFLICT');
  }
  await restoreBackup(record.project, record.backup,{expectedCurrent});
  record.status = 'rolled-back';
  record.rolled_back_at = new Date().toISOString();
  await atomicJson(recordPath, record);
  return { status: 'rolled-back', migration_id: id, project: record.project };
}
