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

test('README states the long-task control promise without a Token-savings claim', async () => {
  const readme = await text('README.md');
  assert.match(readme, /stronger agents such as Claude Fable 5 and GPT-5\.6/i);
  assert.match(readme, /aims to reduce long-task drift and expensive rework/i);
  assert.doesNotMatch(readme, /net Token savings|saves? Tokens|reduce(?:s|d)? Token usage|lower Token cost/i);
  assert.match(readme, /npx --yes github:t01089572455\/vibetether init/);
  assert.match(readme, /outer `npx --yes`[\s\S]*VibeTether's own `--yes`/i);
  assert.match(readme, /vibetether bootstrap/);
  assert.match(readme, /experience-index\.yaml/);
  assert.match(readme, /applicable_experience/);
  assert.match(readme, /first-proven-path/);
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

test('README makes provider fetching and Agent discovery explicit for beginners', async () => {
  const readme = await text('README.md');
  assert.match(readme, /### What gets installed\?/i);
  assert.match(readme, /VibeTether does not require community Skills/i);
  assert.match(readme, /does not search GitHub by star count/i);
  assert.match(readme, /explicit non-core `init`/i);
  assert.match(readme, /no provider is downloaded during active work/i);
  assert.match(readme, /### How agents discover installed Skills/i);
  for (const artifact of [
    '.vibetether/capabilities.yaml',
    '.vibetether/providers.lock.yaml',
    '.vibetether/providers/catalog/',
    '.agents/skills/',
    '.claude/skills/',
  ]) assert.match(readme, new RegExp(artifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(readme, /Installed Skill inventory/i);
  assert.match(readme, /When to use/i);
  assert.match(readme, /live availability/i);
  for (const skill of [
    'grilling',
    'grill-me',
    'grill-with-docs',
    'domain-modeling',
    'codebase-design',
    'prototype',
    'research',
    'brainstorming',
    'dispatching-parallel-agents',
    'executing-plans',
    'finishing-a-development-branch',
    'receiving-code-review',
    'requesting-code-review',
    'subagent-driven-development',
    'systematic-debugging',
    'test-driven-development',
    'using-git-worktrees',
    'verification-before-completion',
    'writing-plans',
    'writing-skills',
    'karpathy-guidelines',
  ]) assert.match(readme, new RegExp('\\| `' + skill + '` \\|'), `README is missing the default provider ${skill}`);
  assert.match(readme, /21 exposed Skills/i);
  assert.match(readme, /53 complete upstream Skills/i);
  assert.match(readme, /catalog-only[\s\S]*outside host discovery/i);
});

test('README leads with one install-everything command before customization and documents Windows recovery', async () => {
  const readme = await text('README.md');
  const fastest = readme.search(/## Fastest setup: install everything/i);
  const customize = readme.search(/## Customize the installation/i);
  assert.notEqual(fastest, -1, 'README is missing the fastest install-everything entry');
  assert.ok(customize > fastest, 'README must put the easiest path before customization');
  assert.match(
    readme,
    /init --project \. --agent both --profile extended --bundle web --bundle production --yes/i,
  );
  assert.match(readme, /downloads and catalogs every curated source enabled by VibeTether/i);
  assert.match(readme, /does not expose every upstream Skill/i);
  assert.match(readme, /core[\s\S]*provider-free[\s\S]*extended/i);
  assert.match(readme, /GIT_CONFIG_COUNT/);
  assert.match(readme, /GIT_CONFIG_KEY_0=http\.sslBackend/);
  assert.match(readme, /GIT_CONFIG_VALUE_0=openssl/);
  assert.match(readme, /GIT_SSL_BACKEND[\s\S]*does not configure Git/i);
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
  assert.match(readme, /0\.2\.2 preview/i);
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
  assert.equal(pkg.version, '0.2.3');
  assert.equal(pkg.description, 'Direction control, guided readiness, Skill routing, and Proven Path recall for long-running coding agents.');
  assert.equal(pkg.files.includes('docs/operations'), true);
});

test('Windows Skill lifecycle recovery is documented without weakening customization safety', async () => {
  const runbook = await text('docs/operations/windows-skill-lifecycle.md');
  assert.match(runbook, /registered legacy fingerprint/i);
  assert.match(runbook, /transaction copy/i);
  assert.match(runbook, /uninstall --project .*--dry-run/i);
  assert.match(runbook, /close.*Claude Code.*retry/is);
  assert.match(runbook, /partial rollback/i);
  assert.match(runbook, /unknown|customized/i);
  assert.doesNotMatch(runbook, /Remove-Item.*-Recurse|rm\s+-rf/i);
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
  assert.match(result.stdout, /guided bootstrap/i);
  assert.match(result.stdout, /applicable experience/i);
  assert.match(result.stdout, /doctor healthy/i);
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
  assert.match(workflow, /actions\/checkout@v4[\s\S]*fetch-depth:\s*0/);
});

test('release history reproduces every registered canonical fingerprint', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-release-history.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /release compatibility: valid \(5 historical identities\)/i);
});

test('the package check command audits release history', async () => {
  const pkg = JSON.parse(await text('package.json'));
  assert.equal(pkg.scripts['audit:release'], 'node scripts/verify-release-history.mjs');
  assert.match(pkg.scripts.check, /npm run audit:release/);
});
