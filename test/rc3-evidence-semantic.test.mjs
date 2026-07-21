import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { startStep, finishStep } from '../src/step.mjs';
import { initProject } from './helpers.mjs';

function check(claim, coveredPath) {
  return {
    id: 'acceptance-check',
    claim,
    kind: 'command',
    command: [
      process.execPath,
      '-e',
      `const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(coveredPath)},'utf8')!=='implemented\\n')process.exit(7)`,
    ],
    covers_paths: [coveredPath],
    consumer_paths: [coveredPath],
  };
}

function proofs(route, artifact) {
  return {
    output_proofs: (route.required_outputs ?? []).map((output) => ({
      output,
      check_ids: ['acceptance-check'],
      summary: `The changed product artifact is validated as the concrete producer of ${output}.`,
      artifact_paths: [artifact],
    })),
    exit_proofs: (route.exit_evidence ?? []).map((criterion) => ({
      criterion,
      check_ids: ['acceptance-check'],
      summary: 'The real product artifact passed the predeclared acceptance check against final bytes.',
      artifact_paths: [artifact],
    })),
  };
}

async function start(root, { scope = ['src/auth/oidc.mjs'], covered = 'src/auth/oidc.mjs' } = {}) {
  const claim = 'The final OIDC callback consumer accepts the approved enterprise identity response.';
  return startStep({
    project: root,
    task_text: 'Implement the approved OIDC callback behavior for enterprise SSO.',
    phase: 'EXECUTE_ONE',
    capability: 'implementation',
    slice: 'Implement only the approved OIDC callback consumer.',
    success_evidence: [claim],
    success_checks: [check(claim, covered)],
    scope_paths: scope,
    signals: ['bug-fix'],
    code_write: true,
    confirmed_by_user: true,
    decision_reason: 'The user approved OIDC SSO and this exact callback slice.',
  });
}

async function materialize(root, relative, content = 'implemented\n') {
  const target = path.join(root, ...relative.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

test('a direction-sensitive code-write cannot bind its acceptance check to an unrelated product path', async () => {
  const { root } = await initProject('evidence-unrelated-scope');
  await assert.rejects(
    start(root, { scope: ['src/auth/oidc.mjs'], covered: 'decoy.txt' }),
    /approved.*scope|scope path|covered path|consumer/i,
  );
});

test('every material product change must be covered by a successful predeclared check', async () => {
  const { root } = await initProject('evidence-all-changes-covered');
  const started = await start(root);
  await materialize(root, 'src/auth/oidc.mjs');
  await materialize(root, 'src/auth/unverified-helper.mjs', 'unverified\n');
  await assert.rejects(
    finishStep({ project: root, ...proofs(started.route, 'src/auth/oidc.mjs') }),
    /uncovered product change|all material product changes|unverified-helper/i,
  );
});

test('output and exit proofs must bind a successful check to an artifact changed in the approved slice', async () => {
  const { root } = await initProject('evidence-proof-artifact-binding');
  const started = await start(root);
  await materialize(root, 'src/auth/oidc.mjs');
  await materialize(root, 'docs/unrelated.md', '# unrelated\n');
  const bad = proofs(started.route, 'docs/unrelated.md');
  await assert.rejects(
    finishStep({ project: root, ...bad }),
    /approved scope|material change|proof artifact|covered/i,
  );
});

test('a scoped real-consumer change with complete artifact-bound proofs can finish', async () => {
  const { root } = await initProject('evidence-scoped-valid');
  const started = await start(root);
  await materialize(root, 'src/auth/oidc.mjs');
  const finished = await finishStep({ project: root, ...proofs(started.route, 'src/auth/oidc.mjs') });
  assert.equal(finished.route.status, 'satisfied');
  assert.deepEqual(finished.route.approved_paths, ['src/auth/oidc.mjs']);
  assert.ok(finished.route.output_contract.exit_proofs.every((proof) => proof.artifacts.length === 1));
});
