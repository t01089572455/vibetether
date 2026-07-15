#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const evalRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(evalRoot, '..');

const ROUTES = {
  'context-compaction': { preflight: 'full-reanchor', gate: 're-anchor-required' },
  'authority-conflict': { preflight: 'full-reanchor', gate: 'user-confirmation-required' },
  'direction-gate-with-safe-preparation': {
    preflight: 'full-reanchor',
    gate: 'confirm-direction-continue-safe-preparation',
  },
  'structural-technical-decision': { preflight: 'full-reanchor', gate: 'investigate-recommend-confirm' },
  'ui-direction-propagation': { preflight: 'full-reanchor', gate: 'visual-approval-required' },
  'vague-project-request': { preflight: 'lightweight', gate: 'automatic-readiness-assessment' },
  'codebase-unfamiliar': { preflight: 'lightweight', gate: 'orientation-before-edit' },
  'huge-effort': { preflight: 'full-reanchor', gate: 'milestone-map-required' },
  'runnable-experiment-needed': { preflight: 'lightweight', gate: 'learning-contract-required' },
  'react-repository-evidence': { preflight: 'lightweight', gate: 'web-specialist-advisory-route' },
  'production-migration': { preflight: 'full-reanchor', gate: 'destructive-data-confirmation-required' },
  'duplicate-primary-route': { preflight: 'lightweight', gate: 'registry-validation-fails-closed' },
  'changed-license-declaration': { preflight: 'lightweight', gate: 'stop-before-project-write' },
  'first-proven-path': { preflight: 'full-reanchor', gate: 'success-capture-required' },
};

const REQUIRED_FIELDS = [
  'id',
  'input_state',
  'pressure',
  'applicable_sources',
  'signals',
  'expected_preflight_class',
  'expected_gate',
  'prohibited_action',
  'required_evidence',
];

const INSPECTABLE_CONTROL_FIELDS = new Set([
  'phase',
  'capability',
  'selected_skill',
  'selection_source',
  'readiness_verdict',
  'confirmation_required',
  'handshake_state',
  'transition',
  'required_outputs',
  'exit_evidence',
  'experience_disposition',
  'recovery_class',
  'recovery_status',
  'reanchor_required',
  'must',
  'must_not',
]);

const LONG_TASK_CONTRACTS = {
  'active-plan-blocks-execute': {
    phase: 'EXECUTE_ONE', capability: 'implementation', selected_skill: 'writing-plans',
    selection_source: 'recommended', handshake_state: 'active', transition: 'blocked',
  },
  'compaction-forces-reentry': {
    phase: 'ALIGN', capability: 'handoff-recovery', selected_skill: 'vibe-tether',
    selection_source: 'built-in-fallback', handshake_state: 'active', reanchor_required: true,
  },
  'first-proven-deployment-captures': {
    phase: 'VERIFY', capability: 'success-capture', experience_disposition: 'captured',
    required_outputs: ['trigger_class', 'experience_disposition', 'durable_artifacts', 'redaction_check'],
  },
  'local-primary-absent-falls-back': {
    phase: 'PLAN', capability: 'planning', selected_skill: 'writing-plans',
    selection_source: 'curated-fallback', handshake_state: 'active',
  },
  'missing-skill-peer-identity-recovers': {
    recovery_class: 'recoverable-missing-skill', recovery_status: 'recovered',
  },
  'phase-plan-after-approved-design': {
    phase: 'PLAN', capability: 'planning', selected_skill: 'writing-plans',
    selection_source: 'recommended', handshake_state: 'active',
    required_outputs: ['ordered_slices', 'verification_commands', 'risk_gates'],
  },
  'prd-local-to-issues': {
    phase: 'PLAN', capability: 'planning', selected_skill: 'to-issues',
    selection_source: 'project-local', handshake_state: 'active',
    required_outputs: ['ordered_slices', 'verification_commands', 'risk_gates', 'scoped-issues'],
  },
  'release-ambiguity-asks-user': {
    phase: 'SHIP', capability: 'release-verification', readiness_verdict: 'ASK_USER_DECISION',
    confirmation_required: true, transition: 'blocked', must: ['ask-user'],
  },
  'repeat-proven-path-does-not-duplicate': {
    phase: 'REVIEW', capability: 'success-capture', experience_disposition: 'already-encoded',
    must_not: ['duplicate-documentation'],
  },
  'satisfied-verify-permits-review': {
    phase: 'REVIEW', capability: 'code-review', handshake_state: 'satisfied', transition: 'allowed',
  },
  'vague-greenfield-clarifies': {
    phase: 'DISCOVER', capability: 'requirements-clarification', selected_skill: 'grilling',
    selection_source: 'recommended', readiness_verdict: 'ASK_USER_DECISION', handshake_state: 'active',
    must_not: ['start-implementation', 'invent-requirements'],
  },
  'windows-lock-defers': {
    recovery_class: 'pending-skill-upgrade', recovery_status: 'waiting-for-host-release',
  },
};

function sameInspectableValue(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function evaluateLongTaskControls(scenario) {
  const errors = [];
  if (!Array.isArray(scenario.cases)) return ['cases must be an array'];
  const actualIds = scenario.cases.map(({ id }) => id);
  const expectedIds = Object.keys(LONG_TASK_CONTRACTS).sort();
  if (!sameInspectableValue(actualIds, expectedIds)) {
    errors.push('long-task case ids do not match the deterministic contract');
  }
  for (const entry of scenario.cases) {
    const expected = LONG_TASK_CONTRACTS[entry.id];
    if (!expected || !entry.observed || typeof entry.observed !== 'object' || Array.isArray(entry.observed)) {
      errors.push(`${entry.id ?? 'unknown'} is missing an inspectable observation`);
      continue;
    }
    const unknown = Object.keys(entry.observed).find((field) => !INSPECTABLE_CONTROL_FIELDS.has(field));
    if (unknown) errors.push(`${entry.id} contains non-inspectable field ${unknown}`);
    if (!sameInspectableValue(entry.observed, expected)) {
      errors.push(`${entry.id} does not match the deterministic control contract`);
    }
  }
  return errors;
}

export function evaluateScenario(scenario) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (scenario[field] === undefined || scenario[field] === null || scenario[field] === '') {
      errors.push(`missing ${field}`);
    }
  }
  if (!Array.isArray(scenario.signals) || scenario.signals.length !== 1) {
    errors.push('static preview scenarios must isolate exactly one routing signal');
  }
  if (!Array.isArray(scenario.applicable_sources) || scenario.applicable_sources.length === 0) {
    errors.push('applicable_sources must be a non-empty array');
  }
  if (!Array.isArray(scenario.required_evidence) || scenario.required_evidence.length === 0) {
    errors.push('required_evidence must be a non-empty array');
  }

  const route = ROUTES[scenario.signals?.[0]];
  if (!route) errors.push(`unknown routing signal: ${scenario.signals?.[0] ?? 'none'}`);
  if (route && scenario.expected_preflight_class !== route.preflight) {
    errors.push(`expected preflight ${route.preflight}, found ${scenario.expected_preflight_class}`);
  }
  if (route && scenario.expected_gate !== route.gate) {
    errors.push(`expected gate ${route.gate}, found ${scenario.expected_gate}`);
  }
  return { id: scenario.id, ok: errors.length === 0, errors };
}

async function loadControlRegistry() {
  const [capabilitySource, scenarioSource] = await Promise.all([
    readFile(path.join(projectRoot, 'registry', 'capabilities.json'), 'utf8'),
    readFile(path.join(projectRoot, 'registry', 'scenarios.json'), 'utf8'),
  ]);
  return {
    capabilities: JSON.parse(capabilitySource).capabilities,
    scenarios: JSON.parse(scenarioSource).scenarios,
  };
}

function findCapability(registry, id, phase) {
  const capability = registry.capabilities.find((candidate) => candidate.id === id);
  if (!capability) return null;
  return capability.phases.includes(phase) ? capability : null;
}

function requiresExactValues(actual, expected, label, errors) {
  if (!Array.isArray(actual) || actual.length !== expected.length
      || expected.some((value) => !actual.includes(value))) {
    errors.push(`${label} does not match the deterministic fixture contract`);
  }
}

export async function evaluateBehavioralScenario(scenario, registry = null) {
  if (!registry) registry = await loadControlRegistry();
  const errors = [];
  if (scenario.id === 'long-task-route-controls') {
    errors.push(...evaluateLongTaskControls(scenario));
    return { id: scenario.id, ok: errors.length === 0, errors };
  }
  const expected = scenario.expected;
  if (!expected || typeof expected !== 'object') {
    return { id: scenario.id, ok: false, errors: ['missing expected behavior contract'] };
  }

  if (scenario.id === 'greenfield-bootstrap') {
    if (scenario.request !== 'Build me a project') errors.push('request is not the greenfield bootstrap fixture');
    if (scenario.project_state !== 'empty-directory') errors.push('project_state must be empty-directory');
    if (expected.phase !== 'DISCOVER' || expected.capability !== 'project-bootstrap') {
      errors.push('expected discovery bootstrap route is invalid');
    }
    if (expected.provider !== 'grilling') errors.push('expected bootstrap provider must be grilling');
    requiresExactValues(
      expected.must_not,
      ['write-product-code', 'guess-goal', 'guess-success-evidence'],
      'bootstrap must_not',
      errors,
    );
    const capability = findCapability(registry, expected.capability, expected.phase);
    if (!capability) errors.push('project-bootstrap capability is not registered for DISCOVER');
    const route = registry.scenarios.find((candidate) => candidate.id === 'greenfield-bootstrap');
    if (!route || route.phase !== expected.phase || route.capability !== expected.capability
        || !/\bgrilling\b/i.test(route.expected_path ?? '')) {
      errors.push('greenfield bootstrap scenario does not route to grilling through project-bootstrap');
    }
  } else if (scenario.id === 'proven-path-recall') {
    if (scenario.request !== 'Publish the current branch to GitHub from Windows') {
      errors.push('request is not the proven-path recall fixture');
    }
    requiresExactValues(scenario.signals, ['publish', 'github', 'windows'], 'recall signals', errors);
    if (expected.phase !== 'SHIP' || expected.capability !== 'proven-path-recall') {
      errors.push('expected ship recall route is invalid');
    }
    if (expected.artifact !== 'docs/operations/github-publishing.md') {
      errors.push('expected recall artifact is invalid');
    }
    if (expected.must_precede !== 'invent-new-publication-command') {
      errors.push('recall ordering gate is invalid');
    }
    const capability = findCapability(registry, expected.capability, expected.phase);
    if (!capability || !capability.invoke_when?.includes('publish')) {
      errors.push('proven-path-recall capability is not registered for SHIP publication');
    }
    const route = registry.scenarios.find((candidate) => candidate.id === 'known-proven-path');
    if (!route || route.phase !== expected.phase || route.capability !== expected.capability
        || !['publish', 'windows'].every((signal) => route.signals?.includes(signal))
        || !/before/i.test(route.expected_path ?? '')) {
      errors.push('known-proven-path scenario does not preserve recall-before-reuse routing');
    }
    try {
      await readFile(path.join(projectRoot, expected.artifact), 'utf8');
    } catch {
      errors.push('expected proven-path artifact is not present');
    }
  } else {
    errors.push('unknown behavioral evaluation scenario');
  }
  return { id: scenario.id, ok: errors.length === 0, errors };
}

export async function runStaticEvals(directory = path.join(evalRoot, 'scenarios')) {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  const verdicts = [];
  for (const file of files) {
    const scenario = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    verdicts.push(scenario.input_state
      ? evaluateScenario(scenario)
      : await evaluateBehavioralScenario(scenario));
  }
  return verdicts;
}

async function main() {
  const verdicts = await runStaticEvals();
  for (const verdict of verdicts) {
    const symbol = verdict.ok ? 'PASS' : 'FAIL';
    const detail = verdict.errors.length ? ` - ${verdict.errors.join('; ')}` : '';
    console.log(`${verdict.id}: ${symbol}${detail}`);
  }
  const passed = verdicts.filter((verdict) => verdict.ok).length;
  console.log(`\n${passed}/${verdicts.length} static scenario contracts passed.`);
  console.log('These static contract checks are not independent agent forward tests and cannot justify a 1.0.0 claim.');
  if (passed !== verdicts.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
