import assert from 'node:assert/strict';
import test from 'node:test';
import { ADAPTERS } from '../src/adapters.mjs';
import { applyManagedBlock, removeManagedBlock } from '../src/files.mjs';

test('managed block insertion and removal preserves every original byte', () => {
  const originals = [
    '',
    '# Team rules',
    '# Team rules\n',
    '# Team rules\n\n',
    '# Team rules\r\n',
    '# Team rules\r\n\r\n',
    '# Team rules  \r\nKeep this trailing space.  ',
  ];

  for (const original of originals) {
    const initialized = applyManagedBlock(original, '## VibeTether\n\nStay aligned.');
    assert.equal(removeManagedBlock(initialized), original, JSON.stringify(original));
  }
});

test('a managed block keeps a no-final-newline ignore rule on its own line', () => {
  const original = 'dist/';
  const initialized = applyManagedBlock(original, '.vibetether/state/');

  assert.match(initialized, /^dist\/\r?\n<!-- vibetether:start -->/);
  assert.equal(initialized.split(/\r?\n/)[0], 'dist/');
  assert.equal(removeManagedBlock(initialized), original);
});

test('managed instructions re-enter the stateful router at every long-task boundary', () => {
  const body = ADAPTERS.codex.managedBody.toLowerCase();
  for (const phrase of [
    'task entry',
    'phase transition',
    'compaction',
    'resume',
    'handoff',
    'repeated failure',
    'next slice',
    'completion',
    'merge',
    'release',
    'publication',
  ]) {
    assert.match(body, new RegExp(phrase.replace(' ', '.*')), phrase);
  }
  assert.match(body, /vibetether route --project \. --phase/);
  assert.match(body, /route complete/);
  assert.match(body, /route abandon/);
  assert.match(body, /routes\.local\.yaml/);
  assert.match(body, /cannot weaken.*authority.*readiness.*evidence.*high-risk.*destructive.*permission.*release/s);
});

test('managed instructions keep direct and delegated work inside one smallest verifiable slice', () => {
  for (const adapter of Object.values(ADAPTERS)) {
    assert.match(adapter.managedBody, /smallest verifiable outcome/i);
    assert.match(adapter.managedBody, /including delegated work/i);
    assert.doesNotMatch(adapter.managedBody, /maximum subagents|subagent cap|delegation budget/i);
  }
});
