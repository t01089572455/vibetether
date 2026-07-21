import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContext } from '../src/context.mjs';
import { classifyTaskText } from '../src/task-classifier.mjs';
import { initProject } from './helpers.mjs';

test('Chinese failure request is classified and routed without naming a Skill',async()=>{
  const {root}=await initProject('beginner-debug');
  const capsule=await buildContext({project:root,task_text:'这个程序间歇崩溃，请先排查根因',agent:'codex'});
  assert.equal(capsule.task.phase,'DIAGNOSE');
  assert.equal(capsule.task.classification.mode,'controlled');
  assert.equal(capsule.skill.selected,'superpowers-systematic-debugging');
});

test('vague product request stays in discovery and selects the clarification Provider',async()=>{
  const {root}=await initProject('beginner-vague');
  const capsule=await buildContext({project:root,task_text:'帮我做一个现代一点的后台',agent:'codex'});
  assert.equal(capsule.task.phase,'DISCOVER');
  assert.equal(capsule.task.classification.needs_user_decision,true);
  assert.equal(capsule.skill.selected,'mattpocock-grilling');
});

test('low-impact observation remains lightweight until material impact appears',()=>{
  const observation=classifyTaskText('请读取这个文件并解释它',{intentStatus:'confirmed',currentPhase:'DISCOVER'});
  assert.equal(observation.mode,'observation');
  const implementation=classifyTaskText('实现新的导出功能',{intentStatus:'confirmed',currentPhase:'DISCOVER'});
  assert.equal(implementation.mode,'controlled');
  assert.equal(implementation.phase,'DISCOVER');
  assert.equal(implementation.needs_user_decision,true);
});
