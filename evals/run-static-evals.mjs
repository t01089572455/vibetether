#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const evalRoot = path.dirname(fileURLToPath(import.meta.url));

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

export async function runStaticEvals(directory = path.join(evalRoot, 'scenarios')) {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  const verdicts = [];
  for (const file of files) {
    const scenario = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    verdicts.push(evaluateScenario(scenario));
  }
  return verdicts;
}

async function main() {
  const verdicts = await runStaticEvals();
  for (const verdict of verdicts) {
    const symbol = verdict.ok ? 'PASS' : 'FAIL';
    console.log(`${symbol} ${verdict.id}${verdict.errors.length ? ` — ${verdict.errors.join('; ')}` : ''}`);
  }
  const passed = verdicts.filter((verdict) => verdict.ok).length;
  console.log(`\n${passed}/${verdicts.length} static scenario contracts passed.`);
  console.log('These static contract checks are not independent agent forward tests and cannot justify a 1.0.0 claim.');
  if (passed !== verdicts.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
