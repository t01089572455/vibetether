import assert from 'node:assert/strict';
import test from 'node:test';
import { baseline, installedPackageFixture, runCli } from './stage0-package-helpers.mjs';

test('S0-R05: packed public CLI enumerates every Stage 0 capability', async (t) => {
  const fixture = await installedPackageFixture('capabilities');
  t.after(fixture.cleanup);
  const result = runCli(fixture, ['capabilities', '--json']);
  const report = JSON.parse(result.stdout);
  const expected = (await baseline()).public_capabilities.map(({ id }) => id).sort();
  const actual = report.capabilities.map(({ id }) => id).sort();
  assert.deepEqual(actual, expected);
});
