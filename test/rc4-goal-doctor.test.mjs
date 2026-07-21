import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectProject } from '../src/doctor.mjs';
import { finishStep, startStep } from '../src/step.mjs';
import { canonicalJson, sha256Text } from '../src/files.mjs';
import { discoverContract } from '../src/contract.mjs';
import { confirmOutcomeCoverage } from '../src/outcomes.mjs';
import { readOutcomeProgress, writeOutcomeGovernance } from '../src/outcome-progress.mjs';
import { authoritySnapshot, parseTruthMap } from '../src/truth.mjs';
import { attachWorktree, createWorktree } from '../src/worktree.mjs';
import { git, initProject, mainJson, routeProofOptions } from './helpers.mjs';

const digest = (value) => `sha256:${sha256Text(value)}`;

function outcome(id, acceptanceId, artifact, { requiredAt = ['goal'], dependencies = [] } = {}) {
  const command = [process.execPath, '-e', `const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(artifact)},'utf8')!=='verified\\n')process.exit(7)`];
  return {
    id, title: `Deliver ${id}`, authority_sources: ['truth:truth_project_direction'],
    parent_id: null, dependencies, superseded_by: [], disposition: 'candidate', required_at: requiredAt,
    acceptance: [{
      id: acceptanceId, claim: `The final product proves ${acceptanceId}.`,
      evidence_kind: 'command', required_maturity: 'functional',
      validator: { kind: 'command', command, validator_revision: digest(`${acceptanceId}-validator-v1`), covers_paths: [artifact] },
    }],
    decision_receipt: null, revision_digest: digest(`${id}-v1`),
  };
}

function releaseOutcome() {
  const artifact='package-result.tgz';
  const command=[process.execPath,'-e',`const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(artifact)},'utf8')!=='verified\\n')process.exit(7)`];
  return {
    id:'outcome_release',title:'Produce and authorize the release',authority_sources:['truth:truth_project_direction'],
    parent_id:null,dependencies:[],superseded_by:[],disposition:'candidate',required_at:['release'],
    acceptance:[
      {id:'acceptance_release_package',claim:'The exact release package is verified.',evidence_kind:'command',required_maturity:'release',validator:{kind:'command',command,validator_revision:digest('release-package-validator-v1'),covers_paths:[artifact]}},
      {id:'acceptance_release_authorization',claim:'The user explicitly authorizes this exact release.',evidence_kind:'user-decision',required_maturity:'release',validator:{kind:'user-decision',decision_type:'release-authorization',validator_revision:digest('release-authorization-v1'),covers_paths:[]}},
    ],
    decision_receipt:null,revision_digest:digest('outcome-release-v1'),
  };
}

function reviewOutcome() {
  return {
    id:'outcome_review',title:'Record the required review disposition',authority_sources:['truth:truth_project_direction'],
    parent_id:null,dependencies:[],superseded_by:[],disposition:'candidate',required_at:['goal'],
    acceptance:[{id:'acceptance_review',claim:'The required review disposition is recorded honestly.',evidence_kind:'review-decision',required_maturity:'reviewed',validator:{kind:'review-decision',decision_type:'code-review-disposition',validator_revision:digest('review-disposition-v1'),covers_paths:[]}}],
    decision_receipt:null,revision_digest:digest('outcome-review-v1'),
  };
}

async function govern(root, outcomes) {
  for (const value of outcomes) {
    await mainJson(['outcomes', 'propose', '--project', root, '--outcome-json', JSON.stringify(value), '--yes']);
    await mainJson([
      'outcomes', 'confirm', '--project', root, '--id', value.id,
      '--user-message-locator', `user-message:confirm-${value.id}`,
      '--reason', `The user confirmed ${value.id} as a required result.`, '--yes',
    ]);
  }
  await mainJson([
    'outcomes', 'coverage', 'confirm', '--project', root,
    '--user-message-locator', 'user-message:confirm-complete-goal-coverage',
    '--reason', 'The user confirmed the declared Outcome set as the complete goal boundary.', '--yes',
  ]);
}

function check(value, acceptanceId, artifact, command = value.acceptance[0].validator.command) {
  return {
    id: `check-${acceptanceId}`, claim: value.acceptance[0].claim, kind: 'command', command,
    covers_paths: [artifact], consumer_paths: [artifact], acceptance_ids: [acceptanceId],
  };
}

async function satisfy(root, value, acceptanceId, artifact) {
  const started = await startStep({
    project: root, phase: 'EXECUTE_ONE', capability: 'implementation',
    slice: `Implement ${acceptanceId}.`, task_text: `Implement the approved ${acceptanceId} slice.`,
    outcome_ids: [value.id], scope_paths: [artifact], success_evidence: [value.acceptance[0].claim],
    success_checks: [check(value, acceptanceId, artifact)], signals: ['approved-feature'], code_write: true,
    confirmed_by_user: true, decision_reason: `The user approved the exact ${acceptanceId} slice.`,
  });
  await writeFile(path.join(root, artifact), 'verified\n');
  await finishStep({ project: root, ...routeProofOptions(started.route, artifact) });
}

test('a green slice reports exact parent work and cannot impersonate goal or release completion', async () => {
  const { root } = await initProject('rc4-layered-doctor');
  const first = outcome('outcome_export', 'acceptance_export', 'export-result.txt');
  const second = outcome('outcome_release_integrity', 'acceptance_release_integrity', 'release-result.txt', { dependencies: [first.id] });
  await govern(root, [first, second]);
  await satisfy(root, first, 'acceptance_export', 'export-result.txt');

  const slice = await inspectProject({ project: root, boundary: 'slice', throw_on_error: false });
  assert.equal(slice.ok, true);
  assert.equal(slice.requested_boundary, 'slice');
  assert.equal(slice.effective_boundary, 'slice');
  assert.equal(slice.completion.label, 'SLICE_GREEN');

  const blockedGoal = await inspectProject({ project: root, boundary: 'goal', throw_on_error: false });
  assert.equal(blockedGoal.ok, false);
  assert.equal(blockedGoal.completion.label, 'SLICE_GREEN');
  assert.deepEqual(blockedGoal.completion.remaining_outcome_ids, [second.id]);
  assert.deepEqual(blockedGoal.completion.remaining_acceptance_ids, ['acceptance_release_integrity']);
  const legacyMerge=await inspectProject({project:root,boundary:'merge',throw_on_error:false});
  assert.equal(legacyMerge.effective_boundary,'goal');
  assert.equal(legacyMerge.ok,false);

  await satisfy(root, second, 'acceptance_release_integrity', 'release-result.txt');
  const goal = await inspectProject({ project: root, boundary: 'goal', throw_on_error: false });
  assert.equal(goal.ok, true);
  assert.equal(goal.completion.label, 'GOAL_ENGINEERING_CLOSED');
  assert.deepEqual(goal.completion.remaining_outcome_ids, []);
  const legacyCompletion=await inspectProject({project:root,boundary:'completion',throw_on_error:false});
  assert.equal(legacyCompletion.effective_boundary,'slice');
  assert.equal(legacyCompletion.completion.label,'SLICE_GREEN');

  const release = await inspectProject({ project: root, boundary: 'release', throw_on_error: false });
  assert.equal(release.ok, false);
  assert.equal(release.completion.label, 'GOAL_ENGINEERING_CLOSED');
  assert.ok(release.issues.some((item) => item.code === 'RELEASE_AUTHORIZATION_REQUIRED'));
});

test('a route cannot replace a governed acceptance validator with an easier command', async () => {
  const { root } = await initProject('rc4-validator-substitution');
  const value = outcome('outcome_export', 'acceptance_export', 'export-result.txt');
  await govern(root, [value]);
  await assert.rejects(
    startStep({
      project: root, phase: 'EXECUTE_ONE', capability: 'implementation', slice: 'Use a weaker validator.',
      outcome_ids: [value.id], scope_paths: ['export-result.txt'], success_evidence: [value.acceptance[0].claim],
      success_checks: [check(value, 'acceptance_export', 'export-result.txt', [process.execPath, '-e', "if(!require('node:fs').existsSync('export-result.txt'))process.exit(7)"])],
      code_write: true, confirmed_by_user: true, decision_reason: 'Fixture attempts validator substitution.',
    }),
    (error) => error.code === 'ACCEPTANCE_VALIDATOR_MISMATCH',
  );
});

test('release requires both current package evidence and an explicit user-grounded authorization receipt', async () => {
  const {root}=await initProject('rc4-release-doctor');
  const goal=outcome('outcome_goal','acceptance_goal','goal-result.txt');
  const release=releaseOutcome();
  await govern(root,[goal,release]);
  await satisfy(root,goal,'acceptance_goal','goal-result.txt');
  await satisfy(root,release,'acceptance_release_package','package-result.tgz');

  let report=await inspectProject({project:root,boundary:'release',throw_on_error:false});
  assert.equal(report.ok,false);
  assert.ok(report.issues.some((item)=>item.code==='RELEASE_AUTHORIZATION_REQUIRED'));
  assert.equal(report.completion.label,'GOAL_ENGINEERING_CLOSED');

  const preview=await mainJson(['outcomes','acceptance','record','--project',root,'--id','acceptance_release_authorization']);
  assert.equal(preview.applied,false);
  await mainJson([
    'outcomes','acceptance','record','--project',root,'--id','acceptance_release_authorization',
    '--user-message-locator','user-message:authorize-exact-release-candidate',
    '--reason','The user explicitly authorized publication of this exact verified release candidate.','--yes',
  ]);
  report=await inspectProject({project:root,boundary:'release',throw_on_error:false});
  assert.equal(report.ok,true);
  assert.equal(report.completion.label,'RELEASE_READY');
  assert.deepEqual(report.completion.remaining_outcome_ids,[]);

  await writeFile(path.join(root,'package-result.tgz'),'changed-after-release-authorization\n');
  report=await inspectProject({project:root,boundary:'release',throw_on_error:false});
  assert.equal(report.ok,false);
  assert.ok(report.completion.unproven_maturity.some((item)=>item.acceptance_id==='acceptance_release_authorization'));
});

test('goal closure blocks changed coverage and a missing generated projection', async () => {
  const {root}=await initProject('rc4-goal-contract-drift');
  const value=outcome('outcome_goal','acceptance_goal','goal-result.txt');
  await govern(root,[value]);
  await satisfy(root,value,'acceptance_goal','goal-result.txt');
  const candidate=outcome('outcome_late_candidate','acceptance_late_candidate','late-result.txt');
  await mainJson(['outcomes','propose','--project',root,'--outcome-json',JSON.stringify(candidate),'--yes']);
  let report=await inspectProject({project:root,boundary:'goal',throw_on_error:false});
  assert.ok(report.issues.some((item)=>item.code==='GOAL_COVERAGE_NOT_CONFIRMED'));
  assert.notEqual(report.completion.label,'GOAL_ENGINEERING_CLOSED');

  await mainJson(['outcomes','reject','--project',root,'--id',candidate.id,'--user-message-locator','user-message:reject-late-candidate','--reason','The user confirmed that the late candidate is outside the current goal.','--yes']);
  await mainJson(['outcomes','coverage','confirm','--project',root,'--user-message-locator','user-message:reconfirm-goal-after-rejection','--reason','The user reconfirmed the complete goal set after dispositioning the candidate.','--yes']);
  await rm(path.join(root,'.vibetether','PROGRESS.md'));
  report=await inspectProject({project:root,boundary:'goal',throw_on_error:false});
  assert.ok(report.issues.some((item)=>item.code==='PROGRESS_PROJECTION_MISSING'));
});

test('declared review maturity stays open until a labeled review disposition is recorded', async () => {
  const {root}=await initProject('rc4-goal-review-maturity');
  const functional=outcome('outcome_functional','acceptance_functional','functional-result.txt');
  const review=reviewOutcome();
  await govern(root,[functional,review]);
  await satisfy(root,functional,'acceptance_functional','functional-result.txt');
  let report=await inspectProject({project:root,boundary:'goal',throw_on_error:false});
  assert.equal(report.ok,false);
  assert.ok(report.completion.unproven_maturity.some((item)=>item.acceptance_id==='acceptance_review'&&item.required_maturity==='reviewed'));
  await assert.rejects(
    startStep({project:root,phase:'VERIFY',capability:'verification',slice:'Try to replace review with a command.',outcome_ids:[review.id],success_evidence:[review.acceptance[0].claim],success_checks:[{id:'check-review-proxy',claim:review.acceptance[0].claim,kind:'command',command:[process.execPath,'-e',"if(!require('node:fs').existsSync('functional-result.txt'))process.exit(7)"],covers_paths:['functional-result.txt'],consumer_paths:['functional-result.txt'],acceptance_ids:['acceptance_review']}],confirmed_by_user:true,decision_reason:'Fixture attempts a lower-maturity proxy.'}),
    (error)=>error.code==='ACCEPTANCE_RECEIPT_REQUIRED',
  );
  await assert.rejects(
    mainJson(['outcomes','acceptance','record','--project',root,'--id','acceptance_review','--user-message-locator','review-message:review-disposition','--reason','A reviewer completed the required review and recorded the disposition.','--yes']),
    (error)=>error.code==='REVIEW_INDEPENDENCE_REQUIRED',
  );
  await mainJson(['outcomes','acceptance','record','--project',root,'--id','acceptance_review','--independence-level','peer','--user-message-locator','review-message:review-disposition','--reason','A peer reviewer completed the required review and recorded the disposition.','--yes']);
  report=await inspectProject({project:root,boundary:'goal',throw_on_error:false});
  assert.equal(report.ok,true);
  assert.equal(report.completion.label,'GOAL_ENGINEERING_CLOSED');
  const context=await discoverContract(root); const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource); const runtime=await attachWorktree(context,authority.authority_digest);
  const progress=await readOutcomeProgress(runtime.paths,context.outcomes,{persist:false});
  const receiptId=progress.outcomes[review.id].acceptance_proofs.acceptance_review.decision_receipt.id;
  await writeFile(path.join(runtime.paths.decisions,`${receiptId}.json`),'{}\n');
  report=await inspectProject({project:root,boundary:'goal',throw_on_error:false});
  assert.equal(report.ok,false);
  assert.ok(report.completion.unproven_maturity.some((item)=>item.acceptance_id==='acceptance_review'));
});

test('goal Doctor rechecks older acceptance artifacts after later slices', async () => {
  const {root}=await initProject('rc4-goal-stale-evidence');
  const first=outcome('outcome_first','acceptance_first','first-result.txt');
  const second=outcome('outcome_second','acceptance_second','second-result.txt');
  await govern(root,[first,second]);
  await satisfy(root,first,'acceptance_first','first-result.txt');
  await writeFile(path.join(root,'first-result.txt'),'changed-after-first-evidence\n');
  await satisfy(root,second,'acceptance_second','second-result.txt');

  const slice=await inspectProject({project:root,boundary:'slice',throw_on_error:false});
  assert.equal(slice.ok,true);
  const goal=await inspectProject({project:root,boundary:'goal',throw_on_error:false});
  assert.equal(goal.ok,false);
  assert.ok(goal.issues.some((item)=>item.code==='ACCEPTANCE_EVIDENCE_STALE'));
  assert.deepEqual(goal.completion.remaining_acceptance_ids,['acceptance_first']);
});

test('a satisfied dependent Outcome cannot hide an unsatisfied prerequisite', async () => {
  const {root}=await initProject('rc4-goal-dependency');
  const prerequisite=outcome('outcome_prerequisite','acceptance_prerequisite','prerequisite.txt');
  const dependent=outcome('outcome_dependent','acceptance_dependent','dependent.txt',{dependencies:[prerequisite.id]});
  await govern(root,[prerequisite,dependent]);
  await satisfy(root,dependent,'acceptance_dependent','dependent.txt');
  const report=await inspectProject({project:root,boundary:'goal',throw_on_error:false});
  assert.ok(report.issues.some((item)=>item.code==='OUTCOME_DEPENDENCY_UNSATISFIED'));
  assert.deepEqual(report.completion.remaining_outcome_ids,[dependent.id,prerequisite.id].sort());
});

test('goal Doctor reruns exact source-ID coverage audit instead of trusting the old confirmation receipt', async () => {
  const {root}=await initProject('rc4-goal-source-audit');
  const first=outcome('outcome_source_first','acceptance_source_first','source-first.txt');
  const second=outcome('outcome_source_second','acceptance_source_second','source-second.txt');
  await govern(root,[first,second]);

  let context=await discoverContract(root);
  const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  const registry=structuredClone(context.outcomes);
  const mapping={schema_version:1,source_id:'source_requirements',source_revision_digest:digest('requirements-v1'),entries:[{source_item_id:'REQ-1',disposition:'mapped',outcome_ids:[first.id],reason:'REQ-1 is implemented by the first governed Outcome.'}]};
  const mappingPath='docs/coverage/source-requirements.json';
  await mkdir(path.dirname(path.join(root,...mappingPath.split('/'))),{recursive:true});
  await writeFile(path.join(root,...mappingPath.split('/')),canonicalJson(mapping));
  registry.coverage_sources.push({
    id:'source_requirements',truth_id:'truth_project_direction',source_revision_digest:mapping.source_revision_digest,
    expected_id_count:1,expected_id_set_digest:digest(canonicalJson(['REQ-1'])),mapping_path:mappingPath,
    mapping_revision_digest:digest(canonicalJson(mapping)),
  });
  const reconfirmed=await confirmOutcomeCoverage(context,registry,runtime.paths.worktree_id,{user_message_locator:'user-message:confirm-exact-source-coverage',reason:'The user confirmed this exact source-ID mapping as part of the complete goal boundary.'});
  await writeOutcomeGovernance(context,runtime.paths,context.outcomes,reconfirmed.registry);

  await satisfy(root,first,'acceptance_source_first','source-first.txt');
  await writeFile(path.join(root,...mappingPath.split('/')),canonicalJson({...mapping,entries:[]}));
  await satisfy(root,second,'acceptance_source_second','source-second.txt');
  context=await discoverContract(root);
  const report=await inspectProject({project:context.root,boundary:'goal',throw_on_error:false});
  assert.equal(report.ok,false);
  assert.ok(report.issues.some((item)=>['SOURCE_ID_COUNT_MISMATCH','SOURCE_ID_SET_MISMATCH','MAPPING_REVISION_MISMATCH'].includes(item.code)));
});

test('a sibling worktree cannot close the parent goal before integration', async () => {
  const {root,base}=await initProject('rc4-goal-integration-worktree');
  const value=outcome('outcome_integration','acceptance_integration','integration-result.txt');
  await govern(root,[value]);
  git(root,['add','.']); git(root,['commit','-qm','govern outcome contract']);
  const siblingPath=path.join(base,'sibling-worktree');
  await createWorktree({project:root,target:siblingPath,branch:'sibling-review'});
  await satisfy(root,value,'acceptance_integration','integration-result.txt');

  const report=await inspectProject({project:siblingPath,boundary:'goal',throw_on_error:false});
  assert.equal(report.ok,false);
  assert.ok(report.issues.some((item)=>item.code==='INTEGRATION_WORKTREE_REQUIRED'));
  assert.notEqual(report.completion.label,'GOAL_ENGINEERING_CLOSED');
});

async function replaceValidatorBytes(root,value) {
  const context=await discoverContract(root);
  const registry=structuredClone(context.outcomes);
  const changed=registry.outcomes.find((item)=>item.id===value.id);
  const acceptance=changed.acceptance[0];
  const oldNode=acceptance.validator.validator_revision;
  acceptance.validator.command=[process.execPath,'-e',`const fs=require('node:fs');if(fs.readFileSync('validator-result.txt','utf8').trim()!=='verified')process.exit(7)`];
  acceptance.validator.validator_revision=digest('replacement-validator-v2');
  acceptance.validator.covers_paths=['validator-result.txt'];
  acceptance.claim='The replacement validator proves the current product path.';
  changed.revision_digest=digest('replacement-outcome-v2');
  await writeFile(path.join(root,'.vibetether','outcomes.json'),canonicalJson(registry));
  return {registry,changed,oldNode,newNode:acceptance.validator.validator_revision};
}

test('changing a governed validator without positive and negative migration mapping blocks the Outcome', async () => {
  const {root}=await initProject('rc4-validator-migration-missing');
  const value=outcome('outcome_validator','acceptance_validator','validator-result.txt');
  await govern(root,[value]);
  await satisfy(root,value,'acceptance_validator','validator-result.txt');
  const changed=await replaceValidatorBytes(root,value);
  await mainJson(['outcomes','coverage','confirm','--project',root,'--user-message-locator','user-message:reconfirm-unmapped-validator','--reason','The user reconfirmed coverage, but no validator migration mapping was supplied.','--yes']);

  const context=await discoverContract(root);
  const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  const progress=await readOutcomeProgress(runtime.paths,context.outcomes,{persist:false});
  assert.equal(progress.outcomes[value.id].state,'blocked');
  await assert.rejects(
    startStep({
      project:root,phase:'EXECUTE_ONE',capability:'implementation',slice:'Try the unmapped validator.',outcome_ids:[value.id],scope_paths:['validator-result.txt'],
      success_evidence:[changed.changed.acceptance[0].claim],success_checks:[check(changed.changed,'acceptance_validator','validator-result.txt')],code_write:true,
      confirmed_by_user:true,decision_reason:'Fixture attempts an unmapped validator replacement.',
    }),
    (error)=>error.code==='VALIDATOR_MIGRATION_REQUIRED',
  );
});

test('an approved positive and negative validator migration permits fresh revalidation but never carries old proof forward', async () => {
  const {root}=await initProject('rc4-validator-migration-approved');
  const value=outcome('outcome_validator','acceptance_validator','validator-result.txt');
  await govern(root,[value]);
  await satisfy(root,value,'acceptance_validator','validator-result.txt');
  const changed=await replaceValidatorBytes(root,value);
  await mainJson([
    'outcomes','validator-migration','record','--project',root,'--outcome-id',value.id,'--acceptance-id','acceptance_validator',
    '--old-node',changed.oldNode,'--positive-replacement',changed.newNode,'--negative-replacement','test:validator-rejects-invalid-content',
    '--user-message-locator','user-message:approve-validator-migration','--reason','The user approved the replacement validator together with its negative counterexample check.','--yes',
  ]);
  await mainJson(['outcomes','coverage','confirm','--project',root,'--user-message-locator','user-message:reconfirm-mapped-validator','--reason','The user reconfirmed the complete Outcome set after the reviewed validator migration.','--yes']);
  let context=await discoverContract(root);
  let authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
  let runtime=await attachWorktree(context,authority.authority_digest);
  let progress=await readOutcomeProgress(runtime.paths,context.outcomes,{persist:false});
  assert.equal(progress.outcomes[value.id].state,'stale');
  assert.deepEqual(progress.outcomes[value.id].satisfied_acceptance_ids,[]);

  await writeFile(path.join(root,'validator-result.txt'),'before-revalidation\n');
  await satisfy(root,changed.changed,'acceptance_validator','validator-result.txt');
  context=await discoverContract(root); authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource); runtime=await attachWorktree(context,authority.authority_digest);
  progress=await readOutcomeProgress(runtime.paths,context.outcomes,{persist:false});
  assert.equal(progress.outcomes[value.id].state,'satisfied');
  const report=await inspectProject({project:root,boundary:'goal',throw_on_error:false});
  assert.equal(report.ok,true);
  assert.equal(report.completion.label,'GOAL_ENGINEERING_CLOSED');
});
