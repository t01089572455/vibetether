import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('S0-R07: README documents custom routes and separates current limits from future stages', async () => {
  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /^## Custom routes$/im);
  assert.match(readme, /^## Current enforcement limits$/im);
  assert.match(readme, /^## Future stages$/im);
  for (const feature of ['Decision Memory', 'Correction', 'Claim', 'Host Enforcement', 'Failure Replay', 'operator cockpit']) {
    assert.match(readme, new RegExp(`${feature}[^\\n]*(?:not implemented|future stage)`, 'i'));
  }
});
