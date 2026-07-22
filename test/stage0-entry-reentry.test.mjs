import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { MANAGED_BODY } from '../src/adapters.mjs';

const root = path.resolve(import.meta.dirname, '..');
const triggerPatterns = new Map([
  ['task-entry', /task entry/i],
  ['phase-slice-change', /phase or slice change/i],
  ['consequential-decision', /consequential decision/i],
  ['compaction-resume', /compaction.{0,40}resume|resume.{0,40}compaction/is],
  ['handoff', /handoff/i],
  ['repeated-failure', /repeated failure/i],
  ['merge', /merge/i],
  ['completion-like-boundary', /completion(?:-like)? boundary|before (?:claiming )?completion/i],
]);

async function skill(name) {
  return readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
}

function assertCanonicalTriggers(source, label, ids = [...triggerPatterns.keys()]) {
  for (const id of ids) assert.match(source, triggerPatterns.get(id), `${label} omits ${id}`);
}

test('one canonical boundary vocabulary defines every entry and re-entry trigger', async () => {
  const { REENTRY_BOUNDARIES } = await import('../src/adapters.mjs');
  assert.deepEqual(REENTRY_BOUNDARIES.map((entry) => entry.id), [...triggerPatterns.keys()]);
});

test('normal Skill names every canonical entry and re-entry boundary', async () => {
  assertCanonicalTriggers(await skill('vibe-tether'), 'normal Skill');
});

test('S0-R04: Deep Skill keeps the Permit workflow and every canonical re-entry boundary', async () => {
  const source = await skill('vibe-tether-deep');
  assertCanonicalTriggers(source, 'Deep Skill');
  assert.match(source, /Start Card/i);
  assert.match(source, /Implementation Permit/i);
  assert.match(source, /do not write product code|before (?:writing|implementation)/i);
});

test('S0-R04: managed host adapters name concise triggers without claiming automatic enforcement', () => {
  assertCanonicalTriggers(MANAGED_BODY, 'managed adapter');
  assert.match(MANAGED_BODY, /re-enter/i);
  assert.match(MANAGED_BODY, /agent cooperation|cannot control|advisory/i);
  assert.ok(Buffer.byteLength(MANAGED_BODY, 'utf8') <= 1024, `managed block is ${Buffer.byteLength(MANAGED_BODY, 'utf8')} bytes`);
});
