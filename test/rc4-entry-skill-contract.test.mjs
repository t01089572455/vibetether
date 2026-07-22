import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('entry Skills state the honest longitudinal control contract', async () => {
  const adaptive=await readFile(path.join(root,'skills','vibe-tether','SKILL.md'),'utf8');
  const deep=await readFile(path.join(root,'skills','vibe-tether-deep','SKILL.md'),'utf8');
  for (const source of [adaptive,deep]) {
    assert.match(source,/compaction|resume/i);
    assert.match(source,/host.*cooperation|Agent cooperation/i);
    assert.match(source,/user.*(Truth|Outcome)|(Truth|Outcome).*user/i);
  }
  assert.match(adaptive,/one Primary Provider/i);
  assert.match(adaptive,/SLICE_GREEN/);
  assert.match(adaptive,/GOAL_ENGINEERING_CLOSED/);
  assert.match(adaptive,/RELEASE_READY/);
  assert.match(adaptive,/adaptive/i);
  assert.match(adaptive,/vibe-tether-deep/);
  assert.match(deep,/Start Card/);
  assert.match(deep,/Implementation Permit/);
  assert.match(deep,/SLICE_GREEN/);
});
