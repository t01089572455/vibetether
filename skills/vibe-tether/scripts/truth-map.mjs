import { isSafeProjectRelativeArtifactPath, isSensitiveArtifactPath } from './artifact-safety.mjs';

const SECTION_NAMES = Object.freeze({
  'Host bootstrap': 'hosts',
  'Control-plane pointers': 'control',
  'Confirmed project truth': 'confirmed',
  'Candidates awaiting confirmation': 'candidates',
  'Declined candidates': 'declined',
});

function parseMetadata(line) {
  const match = line.match(/^  - ([a-z_]+):(?: `([^`]*)`|(.*))$/);
  if (!match) return null;
  return [match[1], (match[2] ?? match[3] ?? '').trim()];
}

function validatePath(value) {
  if (typeof value !== 'string'
      || !value.trim()
      || value.includes('\\')
      || !isSafeProjectRelativeArtifactPath(value)
      || isSensitiveArtifactPath(value)
      || value === '.'
      || value.startsWith('./')) {
    throw new Error('Truth entry path must be a portable project-relative path');
  }
  return value;
}

export function parseProjectTruthMap(source) {
  if (typeof source !== 'string') throw new Error('Truth map must be text');
  const result = { hosts: [], control: [], confirmed: [], candidates: [], declined: [] };
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let section = null;
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^## (.+)$/);
    if (heading) {
      section = SECTION_NAMES[heading[1]] ?? null;
      continue;
    }
    const bullet = lines[index].match(/^- \[([ xX])\] `([^`]+)`$/);
    if (!bullet && lines[index].startsWith('- [')) throw new Error('Malformed truth entry');
    if (!bullet) continue;
    if (!section) throw new Error('Truth entry appears outside a canonical section');
    const metadata = {};
    while (index + 1 < lines.length) {
      const parsed = parseMetadata(lines[index + 1]);
      if (!parsed) {
        if (lines[index + 1].startsWith('  - ')) throw new Error('Malformed truth entry metadata');
        break;
      }
      metadata[parsed[0]] = parsed[1];
      index += 1;
    }
    if (!metadata.role) throw new Error('Truth entry role is required');
    if (!metadata.scope) throw new Error('Truth entry scope is required');
    const checked = bullet[1].toLowerCase() === 'x';
    if (['confirmed', 'hosts', 'control'].includes(section) && !checked) {
      throw new Error('Active truth entry must be checked');
    }
    if (['candidates', 'declined'].includes(section) && checked) {
      throw new Error('Non-authoritative truth entry must be unchecked');
    }
    result[section].push({ path: validatePath(bullet[2]), role: metadata.role, scope: metadata.scope });
  }
  for (const title of Object.keys(SECTION_NAMES)) {
    if (!lines.includes(`## ${title}`)) throw new Error('Truth map is missing a canonical section');
  }
  const seen = new Set();
  for (const entry of Object.values(result).flat()) {
    if (seen.has(entry.path)) throw new Error('Truth map contains a duplicate path');
    seen.add(entry.path);
  }
  return result;
}
