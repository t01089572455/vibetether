import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { ADAPTERS } from './adapters.mjs';
import { CliError } from './errors.mjs';
import { rejectSymlinkPath, resolveInside } from './files.mjs';
import { validateProviderLock } from './managed-project-state.mjs';
import { buildRoutingDocument, matchingRoutes } from './provider-registry.mjs';
import {
  LEGACY_VIBETETHER_FINGERPRINTS,
  skillFingerprint,
  sourceSkill,
} from './skill-install.mjs';

function sorted(values) {
  return [...values].sort();
}

function sameValues(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

export const BOOTSTRAP_TRANSITION_REQUEST = Object.freeze({
  phase: 'DISCOVER',
  capability: 'requirements-clarification',
  signals: Object.freeze(['goal-unclear']),
});

function authorityError(detail) {
  return new CliError(
    `VibeTether bootstrap authority check failed: ${detail} Run \`vibetether init\` to repair provider authority before bootstrapping.`,
    3,
  );
}

function rejectAuthority(detail) {
  throw authorityError(detail);
}

async function actualSkillFingerprint(root, relativePath, label, { allowMissing = false } = {}) {
  const target = resolveInside(root, relativePath);
  try {
    await rejectSymlinkPath(root, relativePath);
    await lstat(target);
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return null;
    throw authorityError(`${label} at ${relativePath} cannot be verified: ${error.message}`);
  }
  try {
    return await skillFingerprint(target);
  } catch (error) {
    throw authorityError(`${label} at ${relativePath} cannot be verified: ${error.message}`);
  }
}

async function verifySkill(root, relativePath, expectedFingerprint, label, options = {}) {
  const actual = await actualSkillFingerprint(root, relativePath, label, options);
  if (actual === null) return false;
  if (actual !== expectedFingerprint) {
    rejectAuthority(`${label} at ${relativePath} does not match its recorded fingerprint.`);
  }
  return true;
}

async function verifyLicense(root, source) {
  const installation = source.license_installation;
  try {
    await rejectSymlinkPath(root, installation.path);
    const content = await readFile(resolveInside(root, installation.path));
    const actual = createHash('sha256').update(content).digest('hex');
    if (actual !== source.license_sha256) {
      rejectAuthority(`provider license at ${installation.path} does not match its recorded fingerprint.`);
    }
  } catch (error) {
    if (error instanceof CliError && error.message.startsWith('VibeTether bootstrap authority check failed:')) {
      throw error;
    }
    throw authorityError(`provider license at ${installation.path} cannot be verified: ${error.message}`);
  }
}

export async function validateBootstrapAuthority({
  root,
  manifest,
  proposedManifest = manifest,
  lock,
  registry,
  request,
  adapters,
  profile,
  bundles,
}) {
  const validated = validateProviderLock(lock);
  if (!validated) rejectAuthority('the provider lock is incomplete or malformed.');

  const enabledHarnesses = Object.entries(manifest?.harnesses ?? {})
    .filter(([, harness]) => harness?.enabled === true)
    .map(([name]) => name);
  const proposedHarnesses = Object.entries(proposedManifest?.harnesses ?? {})
    .filter(([, harness]) => harness?.enabled === true)
    .map(([name]) => name);
  if (!sameValues(enabledHarnesses, adapters)) {
    rejectAuthority(`requested harnesses (${sorted(adapters).join(', ')}) do not exactly match persisted enabled harnesses (${sorted(enabledHarnesses).join(', ')}).`);
  }
  if (!sameValues(proposedHarnesses, adapters)) {
    rejectAuthority(`proposed harnesses (${sorted(proposedHarnesses).join(', ')}) do not exactly match persisted bootstrap authority.`);
  }
  if (manifest.profile !== profile || proposedManifest.profile !== profile || lock.profile !== profile) {
    rejectAuthority(`requested profile ${profile} does not exactly match the persisted manifest and provider lock.`);
  }
  if (!Array.isArray(manifest.bundles)
      || !Array.isArray(proposedManifest.bundles)
      || !Array.isArray(lock.bundles)
      || !Array.isArray(bundles)
      || !sameValues(manifest.bundles, bundles)
      || !sameValues(proposedManifest.bundles, bundles)
      || !sameValues(lock.bundles, bundles)) {
    rejectAuthority('requested bundles do not exactly match the persisted manifest and provider lock.');
  }

  let requiredProviders;
  try {
    if (!request
        || typeof request.phase !== 'string'
        || typeof request.capability !== 'string'
        || !Array.isArray(request.signals)) {
      throw new Error('an explicit phase, capability, and signals array are required');
    }
    requiredProviders = new Set(
      matchingRoutes(buildRoutingDocument(registry, profile), request)
        .filter((route) => route.required === true)
        .map((route) => route.provider),
    );
  } catch (error) {
    throw authorityError(`provider requirements cannot be established from the registry: ${error.message}`);
  }
  for (const provider of requiredProviders) {
    if (!validated.exposures.some((exposure) => exposure.active && exposure.install_name === provider)) {
      rejectAuthority(`required provider ${provider} has no active exposure record in the provider lock.`);
    }
  }

  const allowedVibeTetherFingerprints = new Set(LEGACY_VIBETETHER_FINGERPRINTS);
  allowedVibeTetherFingerprints.add(await skillFingerprint(sourceSkill));
  for (const harness of enabledHarnesses) {
    const adapter = ADAPTERS[harness];
    if (!adapter) rejectAuthority(`persisted harness ${harness} is unsupported.`);
    const actual = await actualSkillFingerprint(
      root,
      adapter.skillDirectory,
      `${harness} VibeTether Skill`,
    );
    if (!allowedVibeTetherFingerprints.has(actual)) {
      rejectAuthority(`${harness} VibeTether Skill at ${adapter.skillDirectory} is not a canonical or allowed legacy installation.`);
    }
  }

  for (const exposure of validated.exposures) {
    const installations = Object.entries(exposure.installations);
    if (exposure.active && !sameValues(installations.map(([harness]) => harness), enabledHarnesses)) {
      rejectAuthority(`active exposure ${exposure.id} does not have exactly one complete installation record for every enabled harness.`);
    }
    for (const [harness, installation] of installations) {
      if (!exposure.active && installation.ownership !== 'vibetether') continue;
      const required = exposure.active && requiredProviders.has(exposure.install_name);
      const kind = required
        ? 'required active'
        : exposure.active ? 'optional active' : 'retained managed';
      await verifySkill(
        root,
        installation.path,
        exposure.fingerprint,
        `${kind} exposure ${exposure.id} for ${harness}`,
        { allowMissing: exposure.active && !required },
      );
    }
  }

  for (const catalog of validated.catalog) {
    if (!catalog.active && catalog.installation.ownership !== 'vibetether') continue;
    await verifySkill(
      root,
      catalog.installation.path,
      catalog.fingerprint,
      `${catalog.active ? 'active' : 'retained managed'} catalog Skill ${catalog.id}`,
    );
  }

  const activeSourceIds = new Set([
    ...validated.exposures.filter((entry) => entry.active).map((entry) => entry.source_id),
    ...validated.catalog.filter((entry) => entry.active).map((entry) => entry.source_id),
  ]);
  for (const source of validated.sources) {
    const installation = source.license_installation;
    if (!installation) continue;
    if (!activeSourceIds.has(source.id) && installation.ownership !== 'vibetether') continue;
    await verifyLicense(root, source);
  }

  return validated;
}
