import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTaskText } from '../src/task-classifier.mjs';
import { answerDeepQuestion, grantDeepPermit, prepareDeep } from '../src/deep.mjs';
import { abandonStep, startStep } from '../src/step.mjs';
import { answerDeepCard, deepResolution, initProject, testSuccessCheck } from './helpers.mjs';

test('mixed read and consequential action requests never downgrade to observation',()=>{
  const cases = [
    ['Deploy the service and then show me the logs.','release'],
    ['Delete old accounts and explain what changed.','destructive-action'],
    ['Run the migration, then summarize it.','migration'],
    ['Publish the package and list the generated files.','publication'],
    ['部署服务后给我看日志。','release'],
    ['删除旧账号，然后解释改了什么。','destructive-action'],
    ['执行迁移后总结结果。','migration'],
  ];
  for (const [text, signal] of cases) {
    const result=classifyTaskText(text,{intentStatus:'confirmed',currentPhase:'DISCOVER'});
    assert.notEqual(result.mode,'observation',text);
    assert.equal(result.needs_user_decision,true,text);
    assert.ok(result.signals.includes(signal),`${text}: ${JSON.stringify(result.signals)}`);
  }
});

test('negating deep mode does not trigger it or hide the remaining task impact',()=>{
  const explanation=classifyTaskText('Please do not use deep mode; only explain the current implementation.');
  assert.equal(explanation.deep_requested,false);
  assert.equal(explanation.mode,'observation');

  const implementation=classifyTaskText('Do not use deep mode; implement the new public API.');
  assert.equal(implementation.deep_requested,false);
  assert.equal(implementation.mode,'controlled');
  assert.equal(implementation.needs_user_decision,true);
  assert.equal(implementation.capability,'requirements-clarification');
});

test('a file name and test target cannot pre-approve directional work',()=>{
  for (const text of [
    'In src/auth.mjs add SSO and decide the architecture yourself; make auth.test.mjs pass.',
    'In src/data.mjs change the database schema and make data.test.mjs pass.',
    '在 src/auth.mjs 中增加 SSO，并自行决定架构，让 auth.test.mjs 通过。',
  ]) {
    const result=classifyTaskText(text,{intentStatus:'confirmed'});
    assert.equal(result.phase,'DISCOVER',text);
    assert.equal(result.capability,'requirements-clarification',text);
    assert.equal(result.needs_user_decision,true,text);
  }
});

test('Deep Start Cards require verified fact targets and an explicit user-owned decision',async()=>{
  const {root}=await initProject('deep-required-content');
  await assert.rejects(
    prepareDeep({
      project:root,
      task:'Deeply verify and implement a bounded change.',
      slice:'Implement the confirmed bounded change.',
      success_evidence:['The focused acceptance check passes.'],
      success_checks:[testSuccessCheck('The focused acceptance check passes.')],
      decisions:['Confirm the exact behavior before implementation.'],
    }),
    /fact/i,
  );
  await assert.rejects(
    prepareDeep({
      project:root,
      task:'Deeply verify and implement a bounded change.',
      slice:'Implement the confirmed bounded change.',
      success_evidence:['The focused acceptance check passes.'],
      success_checks:[testSuccessCheck('The focused acceptance check passes.')],
      facts:['The current behavior is reproduced by a focused check.'],
    }),
    /decision/i,
  );
});

test('Deep mode records exactly one user decision at a time before final confirmation',async()=>{
  const {root}=await initProject('deep-one-question');
  const prepared=await prepareDeep({
    project:root,
    task:'Choose and implement the approved authentication model.',
    slice:'Implement only the approved authentication model.',
    permissions:{code_write:true},
    success_evidence:['The approved authentication acceptance check passes.'],
    success_checks:[testSuccessCheck('The approved authentication acceptance check passes.')],
    facts:['The current repository supports password login only.'],
    assumptions:['Production identity-provider metadata will be available.'],
    decisions:['Choose OIDC SSO versus passkey authentication.'],
  });
  assert.equal(prepared.status,'awaiting-user-answer');
  assert.equal(prepared.decision_receipts.length,0);
  assert.equal(prepared.questions.length,2);
  assert.equal(prepared.next_question.id,prepared.questions[0].id);

  await assert.rejects(
    grantDeepPermit({
      project:root,
      confirmed_by_user:true,
      reason:'The user approved the final Start Card.',
      resolution:deepResolution(prepared.start_card),
    }),
    /answer|question|confirmation/i,
  );
  await assert.rejects(
    answerDeepQuestion({project:root,question_id:'wrong-question',selected_option:'Confirm the production metadata precondition.',user_message_locator:'user-message:answer-1'}),
    /next|question/i,
  );

  const first=await answerDeepQuestion({
    project:root,
    question_id:prepared.next_question.id,
    selected_option:'The user confirmed that production identity-provider metadata will be supplied through the existing secret boundary.',
    user_message_locator:'user-message:answer-1',
  });
  assert.equal(first.status,'awaiting-user-answer');
  assert.equal(first.decision_receipts.length,1);
  assert.equal(first.next_question.id,prepared.questions[1].id);

  const second=await answerDeepQuestion({
    project:root,
    question_id:first.next_question.id,
    selected_option:'Use OIDC SSO for enterprise accounts; passkey authentication remains outside this slice.',
    user_message_locator:'user-message:answer-2',
  });
  assert.equal(second.status,'awaiting-final-confirmation');
  assert.equal(second.decision_receipts.length,2);
  assert.equal(second.next_question,null);
});

test('Deep Permit binds the approved scope, permissions, phase, capability, and success checks',async()=>{
  const {root}=await initProject('deep-envelope');
  const claim='The approved authentication acceptance check passes.';
  const check=testSuccessCheck(claim,'app.txt');
  const prepared=await prepareDeep({
    project:root,
    task:'Implement the approved authentication model.',
    slice:'Implement only the approved authentication model.',
    phase:'EXECUTE_ONE',
    capability:'implementation',
    scope_paths:['app.txt'],
    permissions:{code_write:true,network:false,external_write:false},
    success_evidence:[claim],
    success_checks:[check],
    facts:['The current repository supports password login only.'],
    decisions:['Choose the exact authentication model.'],
  });
  const resolution=deepResolution(prepared.start_card);
  await answerDeepCard(root,prepared,resolution);
  await grantDeepPermit({project:root,confirmed_by_user:true,reason:'The user approved the exact bounded Start Card.',resolution});

  await assert.rejects(
    startStep({
      project:root,
      task_text:prepared.start_card.task,
      phase:'EXECUTE_ONE',
      capability:'implementation',
      slice:prepared.start_card.slice,
      scope_paths:['other.txt'],
      success_evidence:[claim],
      success_checks:[{...check,covers_paths:['other.txt'],consumer_paths:['other.txt']}],
      code_write:true,
      deep:true,
    }),
    /Permit|scope|envelope|success check/i,
  );

  const started=await startStep({
    project:root,
    task_text:prepared.start_card.task,
    phase:'EXECUTE_ONE',
    capability:'implementation',
    slice:prepared.start_card.slice,
    scope_paths:['app.txt'],
    success_evidence:[claim],
    success_checks:[check],
    code_write:true,
    deep:true,
  });
  assert.equal(started.route.implementation_permit_id.startsWith('permit-'),true);
  await abandonStep({project:root,reason:'Deep envelope test cleanup.'});
});
