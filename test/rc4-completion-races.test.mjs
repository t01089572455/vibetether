import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import { discoverContract } from '../src/contract.mjs';
import { inspectProject } from '../src/doctor.mjs';
import { grantDeepPermit, prepareDeep, revokeDeepPermit } from '../src/deep.mjs';
import { captureSuccessCandidate, emptyExperienceIndex } from '../src/experience.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { breakLease, readRoute } from '../src/runtime.mjs';
import { finishStep, startStep } from '../src/step.mjs';
import { answerDeepCard, deepResolution, initProject } from './helpers.mjs';

const CLAIM='The final implementation artifact passes its focused consumer check.';
const ARTIFACT='implementation.txt';

function check(command=null) {
  return {
    id:'focused-final-check',
    claim:CLAIM,
    kind:'command',
    command:command??[process.execPath,'-e',`const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(ARTIFACT)},'utf8')!=='implemented\\n')process.exit(7)`],
    covers_paths:[ARTIFACT],
    consumer_paths:[ARTIFACT],
  };
}

function proofs(route) {
  return {
    output_proofs:(route.required_outputs??[]).map((output)=>({
      output,check_ids:['focused-final-check'],summary:`The focused final check proves ${output}.`,artifact_paths:[ARTIFACT],
    })),
    exit_proofs:(route.exit_evidence??[]).map((criterion)=>({
      criterion,check_ids:['focused-final-check'],summary:'The focused final check passed against the product artifact.',artifact_paths:[ARTIFACT],
    })),
  };
}

async function runtimeFor(root) {
  const context=await discoverContract(root);
  const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
  return attachWorktree(context,authority.authority_digest);
}

async function beginDeep(root,{ttlMs=60_000}={}) {
  const task='Implement the user-approved bounded authentication artifact.';
  const slice='Implement only the approved authentication artifact.';
  const prepared=await prepareDeep({
    project:root,task,slice,phase:'EXECUTE_ONE',capability:'implementation',scope_paths:[ARTIFACT],
    permissions:{code_write:true},success_evidence:[CLAIM],success_checks:[check()],
    facts:['The focused baseline shows that the final implementation artifact does not exist yet.'],
    decisions:['Confirm the exact bounded authentication artifact and exclude other product changes.'],
  });
  const resolution=deepResolution(prepared.start_card);
  await answerDeepCard(root,prepared,resolution);
  await grantDeepPermit({project:root,confirmed_by_user:true,reason:'The user approved the exact final Start Card.',resolution,ttl_ms:ttlMs});
  const started=await startStep({
    project:root,task_text:task,phase:'EXECUTE_ONE',capability:'implementation',slice,
    scope_paths:[ARTIFACT],success_evidence:[CLAIM],success_checks:[check()],signals:['authentication'],
    code_write:true,deep:true,
  });
  await writeFile(path.join(root,ARTIFACT),'implemented\n');
  return started;
}

async function expectUnsafeFinishBlocked(root,started,hook,pattern) {
  await assert.rejects(
    finishStep({project:root,...proofs(started.route)},{beforeFinalize:hook}),
    pattern,
  );
  const runtime=await runtimeFor(root);
  const route=await readRoute(runtime.paths);
  assert.notEqual(route.status,'satisfied');
  const report=await inspectProject({project:root,boundary:'completion',throw_on_error:false});
  assert.equal(report.ok,false);
}

test('revoking a Deep Permit during validation cannot be overwritten by satisfied completion',async()=>{
  const {root}=await initProject('completion-revoke-race');
  const started=await beginDeep(root);
  await expectUnsafeFinishBlocked(root,started,()=>revokeDeepPermit({project:root,reason:'User revoked approval during validation.'}),/Permit|revok|route|precondition/i);
});

test('breaking the lease during validation cannot be overwritten by satisfied completion',async()=>{
  const {root}=await initProject('completion-lease-race');
  const started=await beginDeep(root);
  const runtime=await runtimeFor(root);
  await expectUnsafeFinishBlocked(root,started,()=>breakLease(runtime.paths,'Writer ownership was explicitly broken during validation.'),/lease|route|precondition|broken/i);
});

test('a Deep Permit that expires before final commit blocks completion',async()=>{
  const {root}=await initProject('completion-expiry-race');
  const started=await beginDeep(root,{ttlMs:3_000});
  await expectUnsafeFinishBlocked(root,started,()=>new Promise((resolve)=>setTimeout(resolve,3_100)),/expired|Permit|precondition/i);
});

test('product bytes changed after evidence but before satisfaction block completion',async()=>{
  const {root}=await initProject('completion-byte-race');
  const started=await beginDeep(root);
  await expectUnsafeFinishBlocked(root,started,()=>writeFile(path.join(root,ARTIFACT),'changed-after-evidence\n'),/changed|bytes|snapshot|precondition/i);
});

test('literal-only successful commands cannot prove a product claim',async()=>{
  const {root}=await initProject('completion-literal-noop');
  await assert.rejects(
    startStep({
      project:root,task_text:'Apply one exact local fix.',phase:'EXECUTE_ONE',capability:'implementation',slice:'Apply one exact local fix.',
      success_evidence:[CLAIM],success_checks:[check([process.execPath,'-e','0'])],code_write:true,
      confirmed_by_user:true,decision_reason:'The user approved this exact local test slice.',
    }),
    /no-op|meaningful|verification/i,
  );
});

test('an explicit routine label cannot suppress an automatically reusable proven path',()=>{
  const route={
    id:'route-00000000-0000-4000-8000-000000000099',capability:'authentication',
    slice:'Recover the non-obvious OIDC issuer and callback ordering.',signals:['authentication','recovery'],
    provider:{id:'vibetether-built-in-implementation'},success_evidence:[CLAIM],required_outputs:['bounded_change'],
    exit_evidence:['The final bytes pass the focused check.'],output_contract:{validated_artifacts:[]},
  };
  const evidence={
    id:'ev-00000000-0000-4000-8000-000000000099',kind:'command',successful:true,
    command:['node','scripts/verify-auth.mjs'],coverage_artifacts:[{path:'src/auth.mjs',sha256:'a'.repeat(64),present:true}],
  };
  const result=captureSuccessCandidate(emptyExperienceIndex(),route,evidence,'routine-non-path');
  assert.equal(result.disposition,'first-proven-path');
  assert.equal(result.index.entries.length,1);
});

test('completion Doctor rejects a satisfied route whose completion seal was removed',async()=>{
  const {root}=await initProject('completion-seal-missing');
  const started=await beginDeep(root);
  await finishStep({project:root,...proofs(started.route)});
  const runtime=await runtimeFor(root);
  const route=await readRoute(runtime.paths);
  delete route.completion_seal;
  await writeFile(runtime.paths.route,`${JSON.stringify(route,null,2)}\n`);
  const report=await inspectProject({project:root,boundary:'completion',throw_on_error:false});
  assert.equal(report.ok,false);
  assert.ok(report.issues.some((item)=>item.code==='COMPLETION_SEAL_MISSING'));
});
