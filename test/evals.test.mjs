import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenariosDirectory = path.join(root, 'evals', 'scenarios');

async function scenarios() {
  const files = (await readdir(scenariosDirectory)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(scenariosDirectory, file), 'utf8'))));
}

test('preview scenarios cover the approved drift-pressure classes with complete contracts', async () => {
  const values = await scenarios();
  const ids = values.map((scenario) => scenario.id);
  assert.deepEqual(ids, [
    'changed-license-declaration',
    'codebase-orientation',
    'context-compaction',
    'document-conflict',
    'duplicate-primary-route',
    'first-proven-path',
    'greenfield-bootstrap',
    'huge-effort',
    'long-task-route-controls',
    'production-migration',
    'prototype-choice',
    'proven-path-recall',
    'safe-preparation',
    'structural-decision',
    'ui-propagation',
    'vague-project-routing',
    'web-routing',
  ]);

  const previewScenarios = values.filter((scenario) => scenario.input_state);
  for (const scenario of previewScenarios) {
    assert.equal(typeof scenario.input_state, 'object');
    assert.equal(typeof scenario.pressure, 'string');
    assert.ok(scenario.applicable_sources.length > 0);
    assert.ok(scenario.signals.length > 0);
    assert.match(scenario.expected_preflight_class, /^(lightweight|full-reanchor)$/);
    assert.equal(typeof scenario.expected_gate, 'string');
    assert.equal(typeof scenario.prohibited_action, 'string');
    assert.ok(scenario.required_evidence.length > 0);
  }
  const vague = values.find((scenario) => scenario.id === 'vague-project-routing');
  assert.equal(vague.expected_gate, 'automatic-readiness-assessment');
  for (const evidence of ['readiness-verdict', 'missing-facts', 'user-owned-decisions', 'selected-route']) {
    assert.equal(vague.required_evidence.includes(evidence), true, `vague-project-routing is missing ${evidence}`);
  }
  const firstProven = values.find((scenario) => scenario.id === 'first-proven-path');
  assert.equal(firstProven.expected_gate, 'success-capture-required');
  for (const evidence of ['verified-success', 'first-path-classification', 'durable-artifact', 'redaction-check']) {
    assert.equal(firstProven.required_evidence.includes(evidence), true, `first-proven-path is missing ${evidence}`);
  }

  const greenfield = values.find((scenario) => scenario.id === 'greenfield-bootstrap');
  assert.deepEqual(greenfield, {
    id: 'greenfield-bootstrap',
    request: 'Build me a project',
    project_state: 'empty-directory',
    expected: {
      phase: 'DISCOVER',
      capability: 'project-bootstrap',
      provider: 'grilling',
      must_not: ['write-product-code', 'guess-goal', 'guess-success-evidence'],
    },
  });
  const recall = values.find((scenario) => scenario.id === 'proven-path-recall');
  assert.deepEqual(recall, {
    id: 'proven-path-recall',
    request: 'Publish the current branch to GitHub from Windows',
    signals: ['publish', 'github', 'windows'],
    expected: {
      phase: 'SHIP',
      capability: 'proven-path-recall',
      artifact: 'docs/operations/github-publishing.md',
      must_precede: 'invent-new-publication-command',
    },
  });

  const controls = values.find((scenario) => scenario.id === 'long-task-route-controls');
  const controlIds = controls.cases.map((entry) => entry.id);
  assert.deepEqual(controlIds, [
    'active-plan-blocks-execute',
    'compaction-forces-reentry',
    'first-proven-deployment-captures',
    'local-primary-absent-falls-back',
    'missing-skill-peer-identity-recovers',
    'phase-plan-after-approved-design',
    'prd-local-to-issues',
    'release-ambiguity-asks-user',
    'repeat-proven-path-does-not-duplicate',
    'satisfied-verify-permits-review',
    'vague-greenfield-clarifies',
    'windows-lock-defers',
  ]);
  for (const entry of controls.cases) {
    assert.ok(Object.keys(entry.observed).length > 0, entry.id);
    assert.equal(Object.hasOwn(entry, 'reasoning'), false, entry.id);
  }
});

test('static runner validates every scenario and states the preview honesty boundary', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'evals', 'run-static-evals.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /17\/17 static scenario contracts passed/);
  assert.match(result.stdout, /long-task-route-controls: PASS/);
  assert.match(result.stdout, /greenfield-bootstrap: PASS/);
  assert.match(result.stdout, /proven-path-recall: PASS/);
  assert.match(result.stdout, /not independent agent forward tests/i);
  assert.match(result.stdout, /cannot justify a 1\.0\.0 claim/i);
});

test('scenario expected gates match deterministic control-kernel routing', async () => {
  const { evaluateScenario } = await import('../evals/run-static-evals.mjs');
  for (const scenario of (await scenarios()).filter((scenario) => scenario.input_state)) {
    const verdict = evaluateScenario(scenario);
    assert.equal(verdict.ok, true, `${scenario.id}: ${verdict.errors.join('; ')}`);
  }
});

test('behavioral evaluations validate bootstrap and proven-path registry contracts', async () => {
  const { evaluateBehavioralScenario } = await import('../evals/run-static-evals.mjs');
  for (const scenario of (await scenarios()).filter((scenario) => scenario.expected && !scenario.input_state)) {
    const verdict = await evaluateBehavioralScenario(scenario);
    assert.equal(verdict.ok, true, `${scenario.id}: ${verdict.errors.join('; ')}`);
  }
});

test('independent preview evaluation preserves raw runs, mapped scores, and honesty limits', async () => {
  const baseline = JSON.parse(await readFile(path.join(root, 'evals', 'results', 'baseline.json'), 'utf8'));
  const enabled = JSON.parse(await readFile(path.join(root, 'evals', 'results', 'skill-enabled.json'), 'utf8'));
  const judge = JSON.parse(await readFile(path.join(root, 'evals', 'results', 'judge-scores.json'), 'utf8'));
  const report = await readFile(path.join(root, 'evals', 'results', 'preview-evaluation.md'), 'utf8');
  const metadata = JSON.parse(await readFile(path.join(root, 'evals', 'results', 'run-metadata.json'), 'utf8'));
  const expectedIds = ['context-compaction', 'document-conflict', 'ui-propagation'];

  assert.deepEqual(baseline.scenarios.map((scenario) => scenario.id), expectedIds);
  assert.deepEqual(enabled.scenarios.map((scenario) => scenario.id), expectedIds);
  assert.deepEqual(judge.scenarios.map((scenario) => scenario.id), expectedIds);
  assert.equal(judge.method.criteria.length, 5);
  for (const scenario of judge.scenarios) {
    const baselineScore = judge.audited_mapped_results.baseline[scenario.id].total;
    const enabledScore = judge.audited_mapped_results['vibetether-enabled'][scenario.id].total;
    assert.ok(baselineScore >= 0 && baselineScore <= 10);
    assert.ok(enabledScore >= 0 && enabledScore <= 10);
  }
  assert.match(report, /independent (response|comparative) adjudication/i);
  assert.match(report, /baseline strengths/i);
  assert.match(report, /word-count overhead/i);
  assert.match(report, /not a real multi-hour coding-project trial/i);
  assert.doesNotMatch(report, /eliminates? (context )?drift/i);
  assert.equal(metadata.schema_version, 1);
  assert.match(metadata.host, /Codex/i);
  assert.match(metadata.model_family, /GPT-5/i);
  assert.equal(metadata.isolation.fresh_context_per_run, true);
  assert.equal(metadata.authorization, 'explicit-user-authorization-in-development-session');
});
