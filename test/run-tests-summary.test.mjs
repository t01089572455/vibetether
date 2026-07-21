import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTapSummary } from '../scripts/tap-summary.mjs';

test('test runner parses Node TAP summaries on Windows and Unix renderers',()=>{
  assert.deepEqual(parseTapSummary('# pass 7\n# fail 1\n'),{pass:7,fail:1});
  assert.deepEqual(parseTapSummary('ℹ pass 9\r\nℹ fail 0\r\n'),{pass:9,fail:0});
});

test('test runner rejects successful output without assertion counts',()=>{
  assert.throws(()=>parseTapSummary('process exited successfully\n'),/TAP pass\/fail counts/);
});
