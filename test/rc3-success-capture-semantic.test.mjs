import assert from 'node:assert/strict';
import test from 'node:test';
import { captureSuccessCandidate, emptyExperienceIndex } from '../src/experience.mjs';

function route(overrides={}) {
  return {
    id:'route-00000000-0000-4000-8000-000000000001',
    capability:'implementation',
    slice:'Apply a routine local rename.',
    signals:['bug-fix'],
    provider:{id:'vibetether-built-in-implementation'},
    success_evidence:['Focused check passes.'],
    required_outputs:['bounded_change'],
    exit_evidence:['The final bytes pass the focused check.'],
    output_contract:{validated_artifacts:[]},
    ...overrides,
  };
}

function evidence(overrides={}) {
  return {
    id:'ev-00000000-0000-4000-8000-000000000001',
    kind:'command',
    successful:true,
    command:['node','scripts/verify-auth.mjs','--final'],
    coverage_artifacts:[{path:'src/auth.mjs',sha256:'a'.repeat(64),present:true}],
    ...overrides,
  };
}

test('explicit reusable labels cannot force a routine result into a Success Capture candidate',()=>{
  const result=captureSuccessCandidate(emptyExperienceIndex(),route(),evidence(),'first-proven-path');
  assert.equal(result.disposition,'routine-non-path');
  assert.equal(result.candidate_id,null);
  assert.equal(result.index.entries.length,0);
});

test('high-value candidates derive the actual verification command, covered artifacts, and decisive conditions from evidence',()=>{
  const result=captureSuccessCandidate(emptyExperienceIndex(),route({
    capability:'authentication',
    slice:'Recover the non-obvious OIDC issuer and callback ordering.',
    signals:['authentication','recovery','oidc'],
  }),evidence());
  assert.equal(result.disposition,'first-proven-path');
  const entry=result.index.entries[0];
  assert.deepEqual(entry.evidence_ids,[evidence().id]);
  assert.ok(entry.artifacts.some((item)=>item.path==='src/auth.mjs'&&item.sha256==='a'.repeat(64)));
  assert.ok(entry.observed_sequence.some((item)=>item.includes('node scripts/verify-auth.mjs --final')));
  assert.ok(entry.observed_sequence.some((item)=>item.includes('src/auth.mjs')));
  assert.ok(entry.decisive_conditions.includes('authentication'));
  assert.ok(entry.decisive_conditions.length>0);
  assert.ok(entry.reusability_reasons.some((item)=>/reusable|rediscovery|non-obvious/i.test(item)));
});

test('assertion-only or artifact-free evidence cannot create reusable candidate proof',()=>{
  assert.throws(()=>captureSuccessCandidate(emptyExperienceIndex(),route({
    capability:'authentication',signals:['authentication'],slice:'Recover authentication setup.',
  }),evidence({kind:'assertion',command:undefined,coverage_artifacts:[]})),/command or artifact evidence/i);
});
