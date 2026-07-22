#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cliEntry=path.join(sourceRoot,'bin','vibetether.mjs');
const json=process.argv.includes('--json');

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function commandError(result,args) {
  return new Error(`CLI ${args.join(' ')} exited ${result.status}: ${(result.stderr||result.stdout||'').trim()}`);
}

function runCli(project, environment, args, { allowed = [0] } = {}) {
  const tokens=args.includes('--json')?[...args]:[...args,'--json'];
  const result=spawnSync(process.execPath,[cliEntry,...tokens],{
    cwd:project,encoding:'utf8',windowsHide:true,env:{...process.env,...environment},maxBuffer:8*1024*1024,
  });
  const status=typeof result.status==='number'?result.status:1;
  let body=null;
  try { if (String(result.stdout??'').trim()) body=JSON.parse(result.stdout); } catch (error) {
    throw new Error(`CLI emitted invalid JSON for ${args.join(' ')}: ${error.message}\n${result.stdout}`);
  }
  const response={status,body,stdout:String(result.stdout??''),stderr:String(result.stderr??'')};
  if (!allowed.includes(status)) throw commandError(response,args);
  return response;
}

function runGit(project,args) {
  const result=spawnSync('git',args,{cwd:project,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  if (result.status!==0) throw new Error(`git ${args.join(' ')} exited ${result.status}: ${(result.stderr||result.stdout||'').trim()}`);
  return result;
}

async function makeFixture(name) {
  const base=await mkdtemp(path.join(os.tmpdir(),`vibetether-longitudinal-${name}-`));
  const project=path.join(base,'project');
  const home=path.join(base,'home');
  const environment={
    VIBETETHER_STATE_HOME:path.join(base,'state'),
    VIBETETHER_CACHE_HOME:path.join(base,'cache'),
    VIBETETHER_CONFIG_HOME:path.join(base,'config'),
    VIBETETHER_USER_HOME:home,
  };
  await Promise.all([project,home].map((target)=>mkdir(target,{recursive:true})));
  runGit(project,['init','-q']);
  runGit(project,['config','user.email','longitudinal@example.test']);
  runGit(project,['config','user.name','VibeTether Longitudinal Eval']);
  await writeFile(path.join(project,'app.txt'),'initial\n');
  runGit(project,['add','app.txt']);
  runGit(project,['commit','-qm','initial fixture']);
  runCli(project,environment,[
    'init','--project',project,'--agent','codex','--goal','Keep the evaluated delivery aligned.',
    '--success-evidence','The governed acceptance checks pass on final bytes.','--confirmed','--yes',
  ]);
  return {base,project,environment};
}

async function disposeFixture(fixture) {
  await rm(fixture.base,{recursive:true,force:true});
}

function outcome(id,acceptanceId,artifact,{requiredAt=['goal'],maturity='functional',validatorKind='command',decisionType=null,adapter=null}={}) {
  const validatorRevision=digest(`${id}:${acceptanceId}:validator:v1`);
  let validator;
  if (validatorKind==='command') {
    validator={
      kind:'command',
      command:[process.execPath,'-e',`const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(artifact)},'utf8')!=='verified\\n')process.exit(7)`],
      validator_revision:validatorRevision,covers_paths:[artifact],
    };
  } else if (validatorKind==='authority-adapter') {
    validator={kind:'authority-adapter',adapter,validator_revision:validatorRevision,covers_paths:[]};
  } else {
    validator={kind:validatorKind,decision_type:decisionType,validator_revision:validatorRevision,covers_paths:[]};
  }
  return {
    id,title:`Deliver ${id}`,authority_sources:['truth:longitudinal-fixture'],parent_id:null,dependencies:[],
    disposition:'candidate',superseded_by:[],required_at:requiredAt,
    acceptance:[{
      id:acceptanceId,claim:`${acceptanceId} is proven against the current final bytes.`,
      evidence_kind:validatorKind==='authority-adapter'?'external':validatorKind==='command'?'command':'user-decision',
      required_maturity:maturity,validator,
    }],decision_receipt:null,revision_digest:digest(`${id}:outcome:v1`),
  };
}

function releaseOutcome() {
  const id='outcome_release_axes';
  const commandArtifact='release-package.txt';
  return {
    id,title:'Prove external, review, owner, and release readiness',authority_sources:['truth:longitudinal-fixture'],parent_id:null,dependencies:[],
    disposition:'candidate',superseded_by:[],required_at:['release'],
    acceptance:[
      {
        id:'acceptance_external',claim:'The external authority adapter proves the live result.',evidence_kind:'external',required_maturity:'external',
        validator:{kind:'authority-adapter',adapter:'deployment-authority',validator_revision:digest('release-external-v1'),covers_paths:[]},
      },
      {
        id:'acceptance_review',claim:'An independent review disposition is current.',evidence_kind:'review-decision',required_maturity:'reviewed',
        validator:{kind:'review-decision',decision_type:'code-review-disposition',validator_revision:digest('release-review-v1'),covers_paths:[]},
      },
      {
        id:'acceptance_owner',claim:'The owner authorizes this exact release.',evidence_kind:'user-decision',required_maturity:'release',
        validator:{kind:'user-decision',decision_type:'release-authorization',validator_revision:digest('release-owner-v1'),covers_paths:[]},
      },
      {
        id:'acceptance_package',claim:'The exact release package is verified.',evidence_kind:'command',required_maturity:'release',
        validator:{
          kind:'command',
          command:[process.execPath,'-e',`const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(commandArtifact)},'utf8')!=='verified\\n')process.exit(7)`],
          validator_revision:digest('release-package-v1'),covers_paths:[commandArtifact],
        },
      },
    ],decision_receipt:null,revision_digest:digest('release-axes:v1'),
  };
}

async function govern(project,environment,values) {
  for (const value of values) {
    runCli(project,environment,['outcomes','propose','--project',project,'--outcome-json',JSON.stringify(value),'--yes']);
    runCli(project,environment,[
      'outcomes','confirm','--project',project,'--id',value.id,
      '--user-message-locator',`user-message:confirm-${value.id}`,
      '--reason',`The user confirmed ${value.id} as a required outcome.`,'--yes',
    ]);
  }
  runCli(project,environment,[
    'outcomes','coverage','confirm','--project',project,
    '--user-message-locator','user-message:confirm-complete-longitudinal-coverage',
    '--reason','The user confirmed this exact Outcome set as the complete current goal boundary.','--yes',
  ]);
}

async function satisfy(project,environment,value,artifact) {
  const acceptance=value.acceptance[0];
  if (acceptance.validator.kind!=='command') throw new Error(`Fixture only supports command acceptance for ${value.id}.`);
  const check={
    id:`check-${acceptance.id}`,claim:acceptance.claim,kind:'command',command:acceptance.validator.command,
    covers_paths:[artifact],consumer_paths:[artifact],acceptance_ids:[acceptance.id],
  };
  const started=runCli(project,environment,[
    'step','start','--project',project,'--phase','EXECUTE_ONE','--capability','implementation',
    '--task',`Implement the approved ${value.id} slice.`, '--slice',`Implement ${value.id}.`,
    '--outcome',value.id,'--path',artifact,'--success-evidence',acceptance.claim,
    '--success-check-json',JSON.stringify(check),'--signal','known-small-fix','--code-write',
    '--confirmed-by-user','--decision-reason',`The user approved the exact ${value.id} slice.`,
  ]).body;
  await writeFile(path.join(project,artifact),'verified\n');
  const proofArgs=[];
  for (const output of started.route.required_outputs??[]) proofArgs.push('--output-proof-json',JSON.stringify({
    output,check_ids:[check.id],summary:`The focused check proves ${output}.`,artifact_paths:[artifact],
  }));
  for (const criterion of started.route.exit_evidence??[]) proofArgs.push('--exit-proof-json',JSON.stringify({
    criterion,check_ids:[check.id],summary:'The focused check passed against final product bytes.',artifact_paths:[artifact],
  }));
  runCli(project,environment,['step','finish','--project',project,...proofArgs]);
}

function doctor(project,environment,boundary) {
  const result=runCli(project,environment,['doctor','--project',project,'--boundary',boundary],{allowed:[0,4]});
  return result.body;
}

function issueCodes(report) { return (report.issues??[]).map((item)=>item.code).sort(); }

async function scenarioSliceGreenParentOpen() {
  const fixture=await makeFixture('slice-green-parent-open');
  try {
    const first=outcome('outcome_completed','acceptance_completed','completed.txt');
    const second=outcome('outcome_parent_open','acceptance_parent_open','parent-open.txt');
    await govern(fixture.project,fixture.environment,[first,second]);
    await satisfy(fixture.project,fixture.environment,first,'completed.txt');
    const report=doctor(fixture.project,fixture.environment,'goal');
    return {
      requested_claim:'A passing local slice means the entire parent goal is complete.',
      verdict:report.ok?'UNEXPECTED_PASS':'BLOCKED',completion_label:report.completion.label,
      remaining_outcome_ids:report.completion.remaining_outcome_ids,issue_codes:issueCodes(report),
      next_action:'Complete and freshly verify Outcome outcome_parent_open before claiming goal completion.',
      ok:!report.ok&&report.completion.label==='SLICE_GREEN'&&report.completion.remaining_outcome_ids.includes('outcome_parent_open')&&issueCodes(report).includes('GOAL_OUTCOMES_INCOMPLETE'),
    };
  } finally { await disposeFixture(fixture); }
}

async function scenarioUnintegratedExternalReport() {
  const fixture=await makeFixture('unintegrated-external-report');
  const sibling=path.join(fixture.base,'external-agent-worktree');
  try {
    const value=outcome('outcome_external_report','acceptance_external_report','external-report.txt');
    await govern(fixture.project,fixture.environment,[value]);
    runGit(fixture.project,['add','-A']);
    runGit(fixture.project,['commit','-qm','govern external report outcome']);
    runCli(fixture.project,fixture.environment,[
      'worktree','create','--project',fixture.project,'--path',sibling,'--branch','longitudinal-external-report',
    ]);
    await satisfy(sibling,fixture.environment,value,'external-report.txt');
    const report=doctor(sibling,fixture.environment,'goal');
    return {
      requested_claim:'An external Agent or GPT Pro report closes the parent goal before its bytes are integrated.',
      verdict:report.ok?'UNEXPECTED_PASS':'BLOCKED',completion_label:report.completion.label,
      remaining_outcome_ids:report.completion.remaining_outcome_ids,issue_codes:issueCodes(report),
      next_action:'Integrate the verified bytes into the designated integration worktree, then run the goal Doctor there.',
      ok:!report.ok&&issueCodes(report).includes('INTEGRATION_WORKTREE_REQUIRED'),
    };
  } finally {
    try { runCli(fixture.project,fixture.environment,['worktree','remove','--project',fixture.project,'--path',sibling,'--force']); } catch {}
    await disposeFixture(fixture);
  }
}

async function scenarioWeakenedValidatorWithoutMapping() {
  const fixture=await makeFixture('weakened-validator-without-mapping');
  try {
    const value=outcome('outcome_validator_guard','acceptance_validator_guard','strong-result.txt');
    await govern(fixture.project,fixture.environment,[value]);
    const weakCheck={
      id:'check-acceptance_validator_guard',claim:value.acceptance[0].claim,kind:'command',
      command:[process.execPath,'-e',"if(!require('node:fs').existsSync('strong-result.txt'))process.exit(7)"],
      covers_paths:['strong-result.txt'],consumer_paths:['strong-result.txt'],acceptance_ids:['acceptance_validator_guard'],
    };
    const result=runCli(fixture.project,fixture.environment,[
      'step','start','--project',fixture.project,'--phase','EXECUTE_ONE','--capability','implementation',
      '--task','Implement the approved validator guard slice.','--slice','Try an unapproved weaker validator.',
      '--outcome','outcome_validator_guard','--path','strong-result.txt','--success-evidence',value.acceptance[0].claim,
      '--success-check-json',JSON.stringify(weakCheck),'--signal','known-small-fix','--code-write',
      '--confirmed-by-user','--decision-reason','The fixture attempts to substitute a weaker validator.',
    ],{allowed:[3]});
    const blocked=/ACCEPTANCE_VALIDATOR_MISMATCH|validator/i.test(result.stderr);
    return {
      requested_claim:'A weaker check can replace an approved validator without a reviewed positive and negative mapping.',
      verdict:blocked?'BLOCKED':'UNEXPECTED_PASS',completion_label:'NOT_STARTED',remaining_outcome_ids:['outcome_validator_guard'],
      issue_codes:blocked?['ACCEPTANCE_VALIDATOR_MISMATCH']:[],
      next_action:'Record a user-approved validator migration with both positive and negative replacements, then revalidate.',
      ok:blocked,
    };
  } finally { await disposeFixture(fixture); }
}

async function scenarioTruthRevisionDrift() {
  const fixture=await makeFixture('truth-revision-drift');
  try {
    const direction=path.join(fixture.project,'docs','direction.md');
    await mkdir(path.dirname(direction),{recursive:true});
    await writeFile(direction,'# Direction\n\nKeep the public behavior stable.\n');
    runCli(fixture.project,fixture.environment,[
      'truth','add','--project',fixture.project,'--path','docs/direction.md','--role','product-contract','--scope','.',
      '--directionality','directional','--source','longitudinal-eval','--reason','This document governs the fixture direction.','--yes',
    ]);
    runCli(fixture.project,fixture.environment,['truth','confirm','--project',fixture.project,'--path','docs/direction.md','--yes']);
    runCli(fixture.project,fixture.environment,['step','reanchor','--project',fixture.project,'--reason','Anchored the confirmed direction before the drift test.']);
    await writeFile(direction,'# Direction\n\nChange the public behavior without an approval receipt.\n');
    const report=doctor(fixture.project,fixture.environment,'slice');
    return {
      requested_claim:'A changed directional Truth revision can be silently accepted by an old route or checkpoint.',
      verdict:report.ok?'UNEXPECTED_PASS':'BLOCKED',completion_label:report.completion.label,
      remaining_outcome_ids:report.completion.remaining_outcome_ids,issue_codes:issueCodes(report),
      next_action:'Ask the user to confirm the changed directional source, then re-anchor before implementation.',
      ok:!report.ok&&issueCodes(report).includes('AUTHORITY_CHANGED'),
    };
  } finally { await disposeFixture(fixture); }
}

async function scenarioReleaseAxesOpen() {
  const fixture=await makeFixture('release-axes-open');
  try {
    const goal=outcome('outcome_goal_open','acceptance_goal_open','goal-open.txt');
    const release=releaseOutcome();
    await govern(fixture.project,fixture.environment,[goal,release]);
    const report=doctor(fixture.project,fixture.environment,'release');
    const codes=issueCodes(report);
    return {
      requested_claim:'A release can be declared while external, review, owner, and package evidence remain open.',
      verdict:report.ok?'UNEXPECTED_PASS':'BLOCKED',completion_label:report.completion.label,
      remaining_outcome_ids:report.completion.remaining_outcome_ids,issue_codes:codes,
      next_action:'Close the goal first, then obtain current external, review, owner authorization, and release-package evidence.',
      ok:!report.ok&&['RELEASE_AUTHORIZATION_REQUIRED','RELEASE_EVIDENCE_REQUIRED','RELEASE_GOAL_NOT_CLOSED'].every((code)=>codes.includes(code)),
    };
  } finally { await disposeFixture(fixture); }
}

async function scenarioCompactionRestoresExactIds() {
  const fixture=await makeFixture('compaction-restores-exact-remaining-ids');
  try {
    const done=outcome('outcome_completed_before_compaction','acceptance_completed_before_compaction','completed-before-compaction.txt');
    const first=outcome('outcome_remaining_a','acceptance_remaining_a','remaining-a.txt');
    const second=outcome('outcome_remaining_b','acceptance_remaining_b','remaining-b.txt');
    await govern(fixture.project,fixture.environment,[done,first,second]);
    await satisfy(fixture.project,fixture.environment,done,'completed-before-compaction.txt');
    runCli(fixture.project,fixture.environment,['context','--project',fixture.project,'--boundary','compaction']);
    const report=doctor(fixture.project,fixture.environment,'goal');
    return {
      requested_claim:'After compaction, a generic summary is enough and the exact remaining Outcome IDs may be forgotten.',
      verdict:report.ok?'UNEXPECTED_PASS':'RECOVERABLE_BLOCK',completion_label:report.completion.label,
      remaining_outcome_ids:report.completion.remaining_outcome_ids,issue_codes:issueCodes(report),
      next_action:'Resume from the exact remaining Outcome IDs returned by the goal Doctor.',
      ok:!report.ok&&JSON.stringify(report.completion.remaining_outcome_ids)===JSON.stringify(['outcome_remaining_a','outcome_remaining_b']),
    };
  } finally { await disposeFixture(fixture); }
}

async function scenarioLegacyMismatchedTruthReconciliation() {
  const fixture=await makeFixture('legacy-mismatched-truth-reconciliation');
  try {
    const attached=runCli(fixture.project,fixture.environment,['worktree','attach','--project',fixture.project]).body;
    const currentPath=path.join(attached.runtime,'current.json');
    const routePath=path.join(attached.runtime,'route.json');
    const current=JSON.parse(await readFile(currentPath,'utf8'));
    current.route_instance_id='route-current';
    current.status='ready';
    current.next_action='Legacy fixture route needs reconciliation.';
    current.updated_at=new Date().toISOString();
    await writeFile(currentPath,`${JSON.stringify(current,null,2)}\n`);
    await writeFile(routePath,`${JSON.stringify({
      schema_version:1,id:'route-current',generation:2,status:'satisfied',phase:'VERIFY',capability:'verification',
      authority_start:current.authority_digest,evidence_ids:[],truth_reconciliation:{status:'pending',route_instance_id:'route-legacy'},
      updated_at:new Date().toISOString(),
    },null,2)}\n`);
    const blocked=doctor(fixture.project,fixture.environment,'slice');
    const recovered=runCli(fixture.project,fixture.environment,[
      'step','recover-truth-reconciliation','--project',fixture.project,
      '--reason','The legacy pending reconciliation belongs to a different route receipt.','--yes',
    ]).body;
    const premature=runCli(fixture.project,fixture.environment,[
      'step','start','--project',fixture.project,'--phase','PLAN','--capability','planning',
      '--task','Plan the approved recovery follow-up.','--slice','Plan the recovery follow-up.',
      '--success-evidence','The recovery plan is bounded.',
      '--success-check-json',JSON.stringify({id:'check-recovery-plan',claim:'The recovery plan is bounded.',kind:'command',command:[process.execPath,'-e',"const fs=require('node:fs');if(!fs.existsSync('app.txt'))process.exit(7)"],covers_paths:['app.txt'],consumer_paths:['app.txt']}),
      '--confirmed-by-user','--decision-reason','The user approved the recovery planning slice.',
    ],{allowed:[3]});
    runCli(fixture.project,fixture.environment,['step','reanchor','--project',fixture.project,'--reason','Reviewed the preserved legacy reconciliation receipt.']);
    const fresh=runCli(fixture.project,fixture.environment,[
      'step','start','--project',fixture.project,'--phase','PLAN','--capability','planning',
      '--task','Plan the approved recovery follow-up.','--slice','Plan the recovery follow-up.',
      '--success-evidence','The recovery plan is bounded.',
      '--success-check-json',JSON.stringify({id:'check-recovery-plan',claim:'The recovery plan is bounded.',kind:'command',command:[process.execPath,'-e',"const fs=require('node:fs');if(!fs.existsSync('app.txt'))process.exit(7)"],covers_paths:['app.txt'],consumer_paths:['app.txt']}),
      '--confirmed-by-user','--decision-reason','The user approved the recovery planning slice.',
    ]).body;
    runCli(fixture.project,fixture.environment,['step','abandon','--project',fixture.project,'--reason','The evaluator only verifies that a fresh route can start after recovery.']);
    const codes=issueCodes(blocked);
    const recoveryBlocked=premature.status===3&&/reanchor/i.test(premature.stderr);
    return {
      requested_claim:'A legacy pending Truth reconciliation for another route can be silently ignored or manually edited away.',
      verdict:codes.includes('BLOCKED_REANCHOR_REQUIRED')?'RECOVERABLE_BLOCK':'UNEXPECTED_PASS',completion_label:blocked.completion.label,
      remaining_outcome_ids:blocked.completion.remaining_outcome_ids,issue_codes:codes,
      next_action:`Use the recovered receipt, then run vibetether step start for a fresh route (${fresh.route.id}).`,
      recovered:recovered.status==='blocked-reanchor-required'&&recoveryBlocked&&Boolean(recovered.preserved_receipt),
      ok:codes.includes('BLOCKED_REANCHOR_REQUIRED')&&recovered.status==='blocked-reanchor-required'&&recoveryBlocked&&Boolean(fresh.route?.id),
    };
  } finally { await disposeFixture(fixture); }
}

const definitions=[
  ['slice-green-parent-open',scenarioSliceGreenParentOpen],
  ['unintegrated-external-report',scenarioUnintegratedExternalReport],
  ['weakened-validator-without-mapping',scenarioWeakenedValidatorWithoutMapping],
  ['truth-revision-drift',scenarioTruthRevisionDrift],
  ['release-axes-open',scenarioReleaseAxesOpen],
  ['compaction-restores-exact-remaining-ids',scenarioCompactionRestoresExactIds],
  ['legacy-mismatched-truth-reconciliation',scenarioLegacyMismatchedTruthReconciliation],
];

const scenarios=[];
for (const [id,run] of definitions) {
  try { scenarios.push({id,...await run()}); }
  catch (error) {
    scenarios.push({id,ok:false,verdict:'EVALUATOR_ERROR',requested_claim:'The deterministic longitudinal control journey should complete.',completion_label:'NOT_STARTED',remaining_outcome_ids:[],issue_codes:['EVALUATOR_ERROR'],next_action:'Inspect the captured evaluator failure and repair the public control path.',error:String(error.message??error)});
  }
}
const report={
  schema_version:1,ok:scenarios.every((item)=>item.ok),scenarios,
  limitations:[
    'These are deterministic regression journeys over public CLI commands, not evidence of universal natural-language routing accuracy.',
    'Fixture setup writes isolated test files, while VibeTether behavior is exercised through its public CLI surface.',
    `This run covers ${process.platform}; Windows and Ubuntu host behavior still require the configured CI matrix.`,
  ],
};
process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
if (!report.ok) process.exitCode=1;
