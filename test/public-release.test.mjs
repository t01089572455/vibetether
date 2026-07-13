import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('README gives exact install, bootstrap, routing, health, and uninstall commands', async () => {
  const readme = await text('README.md');
  assert.match(readme, /Keep coding agents tethered to project truth/);
  assert.match(readme, /npx skills add t01089572455\/vibetether --skill vibe-tether/);
  assert.match(readme, /npx --yes github:t01089572455\/vibetether init --agent both --profile standard --yes/);
  assert.match(readme, /vibetether doctor/);
  assert.match(readme, /vibetether capabilities/);
  assert.match(readme, /vibetether uninstall --dry-run/);
  assert.match(readme, /53 complete.*Skill/i);
  assert.match(readme, /21.*exposed.*Skill/i);
  assert.match(readme, /--bundle web/);
  assert.match(readme, /--bundle production/);
  assert.match(readme, /--no-auto-bundles/);
  assert.match(readme, /re-run.*init|run.*init again/i);
  assert.match(readme, /exact commit/i);
  assert.match(readme, /advisory/i);
  assert.doesNotMatch(readme, /<github-owner>|your-username|OWNER\/vibetether/i);
});

test('README is a complete scenario-led product and operations guide', async () => {
  const readme = await text('README.md');
  for (const heading of [
    'Quick start',
    'How automatic routing works',
    'Profiles and bundles',
    'When should I use what?',
    'Walkthroughs',
    'Catalog vs exposure',
    'Codex and Claude',
    'Upgrade and repair',
    'Troubleshooting',
    'Provider provenance and licensing',
    'Personal acceptance tour',
  ]) {
    assert.match(readme, new RegExp(`## ${heading}`, 'i'), `README is missing ${heading}`);
  }
  for (const scenario of [
    'vague-project',
    'unfamiliar-codebase',
    'huge-effort',
    'prototype-choice',
    'bug-diagnosis',
    'ui-direction',
    'web-implementation',
    'compaction-handoff',
    'triage-qa',
    'production-migration',
    'completion',
  ]) assert.match(readme, new RegExp(scenario));
  for (const source of ['mattpocock/skills', 'obra/superpowers', 'andrej-karpathy-skills', 'vercel-labs/agent-skills', 'addyosmani/agent-skills']) {
    assert.match(readme, new RegExp(source.replace('/', '\\/'), 'i'));
  }
  assert.match(readme, /full-text/);
  assert.match(readme, /readme-declaration/);
  assert.match(readme, /catalog-only/i);
  assert.match(readme, /competing router/i);
  assert.match(readme, /first-proven-path/i);
  assert.match(readme, /captured[\s\S]*already-encoded[\s\S]*not-reusable/i);
});

test('the public GitHub publishing runbook preserves the first proven path without credentials', async () => {
  const runbook = await text('docs/operations/github-publishing.md');
  assert.match(runbook, /first-proven-path/i);
  assert.match(runbook, /ssh\.github\.com/i);
  assert.match(runbook, /443/);
  assert.match(runbook, /IdentityFile|\s-i\s/i);
  assert.match(runbook, /remote ref/i);
  assert.match(runbook, /CI/i);
  assert.match(runbook, /cleanup|remove.*key/i);
  assert.match(runbook, /core\.autocrlf=false/i);
  assert.doesNotMatch(runbook, /BEGIN (?:OPENSSH|RSA|EC) PRIVATE KEY/);
  assert.doesNotMatch(runbook, /(?:token|password|one-time code)\s*[:=]\s*["']?[A-Za-z0-9_-]{6,}/i);
});

test('README explains support, architecture, UI control, and preview limitations without overclaiming', async () => {
  const readme = await text('README.md');
  assert.match(readme, /Codex[\s\S]*official preview/i);
  assert.match(readme, /Claude Code[\s\S]*official preview/i);
  assert.match(readme, /```mermaid[\s\S]*control kernel/i);
  assert.match(readme, /```mermaid[\s\S]*golden screen/i);
  assert.match(readme, /0\.2\.1 preview/i);
  assert.match(readme, /not independent agent forward tests/i);
  assert.match(readme, /30\/30[\s\S]*24\/30/);
  assert.match(readme, /35\.0%/);
  assert.match(readme, /preview-evaluation\.md/);
  assert.doesNotMatch(readme, /eliminates? (context )?drift/i);
  assert.match(readme, /reduces the risk/i);
});

test('package metadata points to the authenticated public repository', async () => {
  const pkg = JSON.parse(await text('package.json'));
  assert.equal(pkg.repository.url, 'git+https://github.com/t01089572455/vibetether.git');
  assert.equal(pkg.homepage, 'https://github.com/t01089572455/vibetether#readme');
  assert.equal(pkg.bugs.url, 'https://github.com/t01089572455/vibetether/issues');
  assert.equal(pkg.version, '0.2.1');
  assert.equal(pkg.files.includes('docs/operations'), true);
});

test('public release documents contain no local path or non-English brand leakage', async () => {
  const corpus = await Promise.all(['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md'].map(text));
  const joined = corpus.join('\n');
  assert.doesNotMatch(joined, /(?:^|\s)[A-Za-z]:[\\/]/m);
  assert.doesNotMatch(joined, /[\u3400-\u9fff]/);
  assert.doesNotMatch(joined, /<[^>]*(owner|username|repository)[^>]*>/i);
});

test('third-party notices identify every curated source and license boundary', async () => {
  const notices = await text('THIRD_PARTY_NOTICES.md');
  assert.match(notices, /mattpocock\/skills/i);
  assert.match(notices, /obra\/superpowers/i);
  assert.match(notices, /anthropics\/skills/i);
  assert.match(notices, /andrej-karpathy-skills/i);
  assert.match(notices, /vercel-labs\/agent-skills/i);
  assert.match(notices, /addyosmani\/agent-skills/i);
  assert.match(notices, /readme-declaration/i);
  assert.match(notices, /MIT/);
  assert.match(notices, /Apache-2\.0/);
  assert.match(notices, /providers\.lock\.yaml/);
});

test('the documented personal acceptance tour runs without network access', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'manual-acceptance-tour.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /acceptance tour passed/i);
});

test('CI verifies the release on Windows and Ubuntu with supported Node versions', async () => {
  const workflow = await text('.github/workflows/ci.yml');
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /20/);
  assert.match(workflow, /24/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm pack --dry-run/);
});
