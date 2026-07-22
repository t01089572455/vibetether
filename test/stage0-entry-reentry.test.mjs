import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { MANAGED_BODY } from '../src/adapters.mjs';

const root = path.resolve(import.meta.dirname, '..');
const triggers = [
  ['phase or slice change', /phase or slice change/i],
  ['compaction or resume', /compaction.{0,40}resume|resume.{0,40}compaction/is],
  ['handoff', /handoff/i],
  ['repeated failure', /repeated failure/i],
  ['merge', /merge/i],
  ['completion boundary', /completion(?:-like)? boundary|before (?:claiming )?completion/i],
];

async function skill(name) {
  return readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
}

function assertCanonicalTriggers(source, label) {
  for (const [name, pattern] of triggers) assert.match(source, pattern, `${label} omits ${name}`);
}

test('normal Skill names every canonical entry and re-entry boundary', async () => {
  assertCanonicalTriggers(await skill('vibe-tether'), 'normal Skill');
});

test('S0-R04: Deep Skill names every canonical entry and re-entry boundary', async () => {
  assertCanonicalTriggers(await skill('vibe-tether-deep'), 'Deep Skill');
});

test('S0-R04: managed host adapters name every canonical entry and re-entry boundary', () => {
  assertCanonicalTriggers(MANAGED_BODY, 'managed adapter');
});
