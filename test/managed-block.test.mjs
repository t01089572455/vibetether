import assert from 'node:assert/strict';
import test from 'node:test';
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
