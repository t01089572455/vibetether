import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fixture, initProject } from './helpers.mjs';

const root = path.resolve(import.meta.dirname, '..');
const bin = path.join(root, 'bin', 'vibetether.mjs');
const protectedLinks = [
  '- [Control capability status: implemented vs partial vs designed](docs/design/VIBETETHER-CONTROL-CAPABILITY-STATUS.md)',
  '- [GYWS long-task failure forensics](docs/research/2026-07-22-gyws-long-task-failure-forensics.md)',
  '- [Host enforcement and claim integrity design](docs/superpowers/specs/2026-07-22-vibetether-host-enforcement-and-claim-integrity-design.md)',
  '- [Real-project failure replay suite](docs/superpowers/specs/2026-07-22-vibetether-real-project-failure-replay-suite.md)',
];

async function source(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

function taggedShellBlocks(markdown) {
  return [...markdown.matchAll(/<!-- stage0-command:(parse|execute) ([a-z0-9-]+) -->\s*```(?:sh|powershell)\r?\n([\s\S]*?)```/g)]
    .map((match) => ({ mode: match[1], id: match[2], body: match[3].trim() }));
}

function isolatedEnv(value) {
  return {
    ...process.env,
    VIBETETHER_STATE_HOME: value.state,
    VIBETETHER_CACHE_HOME: value.cache,
    VIBETETHER_CONFIG_HOME: value.config,
    VIBETETHER_USER_HOME: value.userHome,
  };
}

function runCli(value, args) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: value.root,
    env: isolatedEnv(value),
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('S0-R07: README preserves custody and presents every confirmed beginner situation', async () => {
  const readme = await source('README.md');
  for (const link of protectedLinks) assert.equal(readme.split(link).length - 1, 1, link);
  assert.ok(readme.indexOf('## Start here: verified package') < readme.indexOf('## Source checkout (secondary)'), 'verified TGZ must lead source execution');
  assert.match(readme, /npm install -g \.\/vibetether-1\.0\.0-rc\.4\.tgz/);
  assert.match(readme, /codeload\.github\.com\/t01089572455\/vibetether\/tar\.gz\/<verified-commit>/);

  for (const heading of [
    '### Vague project: Deep clarification',
    '### Clear local fix: Adaptive control',
    '### UI redesign: golden screen and dual acceptance',
    '### Compaction or resume: explicit re-entry',
    '### Correction today: abandon and re-anchor',
    '### Proven Path: capture, confirm, recall',
    '### Goal closure is not release authorization',
    '### Provider profiles, bundles, and custom routes',
  ]) assert.match(readme, new RegExp(`^${heading}$`, 'm'));

  assert.match(readme, /^## Custom routes$/m);
  assert.match(readme, /^## Current enforcement limits$/m);
  assert.match(readme, /^## Future stages$/m);
  for (const feature of ['Decision Memory', 'Correction', 'Claim Envelope', 'Host Enforcement', 'Failure Replay', 'inspect', 'operator cockpit']) {
    assert.match(readme, new RegExp(`${feature}[^\n]*(?:not implemented|future stage|designed)`, 'i'));
  }
  for (const absent of ['daemon', 'database', 'runtime Provider download', 'release automation', 'exact-environment proof']) {
    assert.match(readme, new RegExp(`${absent}[^\n]*(?:not implemented|does not|no )`, 'i'));
  }
  assert.match(readme, /advisory host can bypass the CLI/i);
  assert.doesNotMatch(readme, /\p{Script=Han}/u);
});

test('every current README shell block is classified and exercised or grammar-checked', async (t) => {
  const readme = await source('README.md');
  const commandDocuments = await Promise.all([
    'README.md',
    'docs/installation.md',
    'docs/skills.md',
    'docs/truth-and-experience.md',
    'docs/verification.md',
    'docs/troubleshooting.md',
  ].map(source));
  const tagged = commandDocuments.flatMap(taggedShellBlocks);
  const allShell = commandDocuments.flatMap((value) => [...value.matchAll(/```(?:sh|powershell)\r?\n[\s\S]*?```/g)]);
  assert.equal(tagged.length, allShell.length, 'every current shell block needs a stage0-command marker');
  assert.deepEqual(tagged.map(({ id }) => id).sort(), [
    'completion-boundaries',
    'immutable-init',
    'init-preview',
    'install-tgz',
    'provider-routing',
    'reentry-status',
    'source-checkout',
  ]);
  assert.deepEqual(tagged.filter(({ mode }) => mode === 'execute').map(({ id }) => id).sort(), [
    'completion-boundaries',
    'init-preview',
    'provider-routing',
    'reentry-status',
  ]);

  const help = spawnSync(process.execPath, [bin, '--help'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(help.status, 0, help.stderr);
  for (const { body } of tagged) {
    assert.doesNotMatch(body, /(?:@latest|\/main\b|refs\/heads\/)/i);
    for (const match of body.matchAll(/\bvibetether\s+([a-z][a-z0-9-]*)/g)) {
      assert.match(help.stdout, new RegExp(`vibetether ${match[1]}\\b`), match[0]);
    }
  }

  const preview = await fixture('readme-init-preview');
  const current = await initProject('readme-current', { agent: 'both', controlMode: 'team' });
  t.after(async () => Promise.all([
    rm(preview.base, { recursive: true, force: true }),
    rm(current.base, { recursive: true, force: true }),
  ]));

  const init = runCli(preview, [
    'init', '--project', preview.root, '--agent', 'both', '--profile', 'standard', '--control-mode', 'team',
    '--goal', 'Keep the verified workflow aligned.', '--success-evidence', 'The declared Outcome checks pass.',
    '--confirmed', '--dry-run', '--json',
  ]);
  assert.equal(init.status, 0, init.stderr || init.stdout);
  assert.equal(JSON.parse(init.stdout).status, 'preview');

  for (const args of [
    ['context', '--project', current.root, '--boundary', 'task-entry', '--json'],
    ['outcomes', 'status', '--project', current.root, '--json'],
    ['capabilities', '--project', current.root, '--phase', 'EXECUTE_ONE', '--capability', 'implementation', '--code-write', '--json'],
  ]) {
    const result = runCli(current, args);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
  }
  for (const boundary of ['goal', 'release']) {
    const result = runCli(current, ['doctor', '--project', current.root, '--boundary', boundary, '--json']);
    assert.equal(result.status, 4, result.stderr || result.stdout);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
  }
});

test('beginner-linked docs agree on installed paths, lifecycle, evidence, and recovery limits', async () => {
  const docs = Object.fromEntries(await Promise.all([
    'docs/installation.md',
    'docs/skills.md',
    'docs/truth-and-experience.md',
    'docs/verification.md',
    'docs/troubleshooting.md',
  ].map(async (relative) => [relative, await source(relative)])));
  for (const [relative, value] of Object.entries(docs)) assert.doesNotMatch(value, /\p{Script=Han}/u, relative);

  assert.ok(docs['docs/installation.md'].indexOf('verified TGZ') < docs['docs/installation.md'].indexOf('source checkout'));
  assert.match(docs['docs/installation.md'], /core.*standard.*extended.*web.*production/is);
  assert.match(docs['docs/skills.md'], /custom routes/i);
  assert.match(docs['docs/skills.md'], /No Provider is downloaded during an active route/i);
  assert.match(docs['docs/truth-and-experience.md'], /capture.*candidate.*confirm.*recall/is);
  assert.match(docs['docs/truth-and-experience.md'], /Truth always outranks Experience/);
  assert.match(docs['docs/verification.md'], /exact installed-package/i);
  assert.match(docs['docs/verification.md'], /Gate B[^\n]*pending/i);
  assert.match(docs['docs/troubleshooting.md'], /compaction or resume/i);
  assert.match(docs['docs/troubleshooting.md'], /manual correction.*abandon.*re-anchor/is);
});
