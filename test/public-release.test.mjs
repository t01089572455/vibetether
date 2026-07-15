import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codeload = 'npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether';

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('README opens with the user problem and puts the reliable install before explanation', async () => {
  const readme = (await text('README.md')).replace(/\r\n/g, '\n');
  assert.ok(readme.startsWith(`# VibeTether\n\n> Even strong agents can drift during long-running work.\n\nVibeTether is a beginner-friendly control Skill for long-running Codex and Claude\nprojects. It is designed for increasingly capable models—including GPT‑5.6 Sol,\nClaude Fable 5, and the models that come next—helping coding agents stay aligned\n`));
  const install = `${codeload} init --project . --agent both --profile extended --bundle web --bundle production --yes`;
  assert.match(readme, new RegExp(install.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(readme.indexOf(install) < readme.indexOf('## Why I built this'));
  assert.match(readme, /one command|copy.*paste/i);
  assert.doesNotMatch(readme, /<github-owner>|your-username|OWNER\/vibetether/i);
});

test('README makes a strong but honest long-task claim', async () => {
  const readme = await text('README.md');
  assert.match(readme, /stronger agents such as Claude Fable 5 and GPT-5\.6/i);
  assert.match(readme, /designed[\s\S]*reduce[\s\S]*long-task drift and expensive rework/i);
  assert.match(readme, /design goal|cannot guarantee|host.*cooperat/i);
  assert.doesNotMatch(readme, /net Token savings|saves? Tokens|reduce(?:s|d)? Token usage|lower Token cost/i);
});

test('README presents smallest verifiable scope as a non-restrictive Subagent benefit', async () => {
  const readme = await text('README.md');
  assert.match(readme, /Smallest Verifiable Slice/);
  assert.match(readme, /smallest verifiable (outcome|result)/i);
  assert.match(readme, /including delegated work|direct or delegated work/i);
  assert.match(readme, /does not limit.*Subagent|without limiting.*Subagent/is);
  assert.match(readme, /host.*orchestrat|Codex.*Claude.*decide.*Subagent/is);
  assert.doesNotMatch(readme, /makes Ultra cheap|guaranteed Token|guarantees? usage savings/i);
});

test('README gives beginners a 30-second phase-routing example', async () => {
  const readme = await text('README.md');
  const start = readme.indexOf('## See it in 30 seconds');
  assert.notEqual(start, -1);
  const example = readme.slice(start, readme.indexOf('\n## ', start + 4));
  for (const skill of [
    'grilling',
    'brainstorming',
    'writing-plans',
    'test-driven-development',
    'verification-before-completion',
  ]) assert.match(example, new RegExp(skill));
  assert.match(example, /phase change|re-enter|re-check/i);
  assert.match(example, /route complete/i);
});

test('README moves the feature overview directly after the quick tour and removes the duplicate Subagent section', async () => {
  const readme = await text('README.md');
  const quickTour = readme.indexOf('## See it in 30 seconds');
  const features = readme.indexOf('## Features');
  const controlPlane = readme.indexOf('## A project control plane, not another prompt');
  assert.ok(quickTour < features, 'Features should follow the 30-second tour');
  assert.ok(features < controlPlane, 'Features should appear before the control-plane details');
  const afterQuickTour = readme.slice(quickTour).match(/\n## ([^\n]+)/g)?.slice(0, 3) ?? [];
  assert.deepEqual(afterQuickTour, [
    '\n## Features',
    '\n## A project control plane, not another prompt',
    '\n## Manage VibeTether your way',
  ]);
  assert.doesNotMatch(readme, /## Powerful Agents, smaller finish lines/i);
  assert.match(readme, /\*\*Readiness gate\*\*/i);
  assert.match(readme, /\*\*Smallest Verifiable Slice\*\*/);
  assert.match(readme, /\*\*First-success capture\*\*/i);
});

test('control-loop artwork shows the implemented readiness, bounded delegation, and re-anchor loop', async () => {
  const svg = await text('docs/assets/vibetether-control-loop.svg');
  assert.match(svg, /Keep capable agents aligned through long-running work\./);
  assert.match(svg, /Readiness/);
  assert.match(svg, /Route \+ Slice/);
  assert.match(svg, /smallest verifiable slice/i);
  assert.match(svg, /Subagents/i);
  assert.match(svg, /re-anchor/i);
  assert.doesNotMatch(svg, /without slowing them down/i);
});

test('README explains the beginner bootstrap and autonomous control loop', async () => {
  const readme = await text('README.md');
  for (const artifact of [
    '.vibetether/intent.md',
    '.vibetether/TRUTH.md',
    '.vibetether/project.yaml',
    '.vibetether/capabilities.yaml',
    '.vibetether/state/current.yaml',
    '.vibetether/experience-index.yaml',
  ]) assert.match(readme, new RegExp(artifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(readme, /AGENTS\.md.*CLAUDE\.md|CLAUDE\.md.*AGENTS\.md/s);
  assert.match(readme, /ordinary language|do not need to know.*Skill/i);
  assert.match(readme, /task entry.*phase|phase.*task entry/is);
  assert.match(readme, /compaction|resume|handoff/i);
  assert.match(readme, /first-proven-path/i);
  assert.match(readme, /captured.*already-encoded.*not-reusable/is);
  assert.match(readme, /does not.*(?:scan|activate).*project documents|no.*automatic.*activation/is);
  assert.match(readme, /candidate.*user confirmation/is);
  assert.match(readme, /truth.*experience.*conflict.*ask/is);
  assert.match(readme, /Manage VibeTether your way/i);
  assert.match(readme, /safe to edit|edit directly/i);
  assert.match(readme, /CLI-maintained|generated/i);
  assert.match(readme, /vibetether doctor --project \. --json/);
});

test('README teaches project truth control in ordinary language and links the visual control loop', async () => {
  const readme = await text('README.md');
  assert.match(readme, /find.*candidate.*truth|search.*candidate.*specification/is);
  assert.match(readme, /add.*candidate|activate.*candidate/is);
  assert.match(readme, /move.*delete.*supersed/is);
  assert.match(readme, /docs\/assets\/vibetether-control-loop\.svg/);
  assert.match(readme, /\(docs\/project-truth\.md\)/);
  const guide = await text('docs/project-truth.md');
  assert.match(guide, /confirmed.*candidate.*declined/is);
  assert.match(guide, /user confirmation/i);
});

test('README exposes route customization and the stateful handshake', async () => {
  const readme = await text('README.md');
  assert.match(readme, /vibetether customize --project \./);
  assert.match(readme, /\.vibetether\/routes\.local\.yaml/);
  assert.match(readme, /primary.*alternative.*overlay/is);
  assert.match(readme, /vibetether route --project \. --phase PLAN --capability planning/);
  assert.match(readme, /vibetether route complete --project \. --evidence/);
  assert.match(readme, /vibetether route abandon --project \. --reason/);
});

test('README stays focused and delegates complete inventories and operations', async () => {
  const readme = await text('README.md');
  const nonemptyLines = readme.split(/\r?\n/).filter((line) => line.trim()).length;
  assert.ok(nonemptyLines < 420, `README has ${nonemptyLines} non-empty lines`);
  for (const linked of [
    'docs/installation.md',
    'docs/routing.md',
    'docs/proven-paths.md',
    'docs/project-truth.md',
    'docs/providers.md',
    'docs/troubleshooting.md',
  ]) {
    assert.match(readme, new RegExp(`\\(${linked.replaceAll('.', '\\.')}\\)`));
    await text(linked);
  }
  assert.doesNotMatch(readme, /\| `grill-me` \|/);
  assert.match(await text('docs/providers.md'), /\| `grill-me` \|/);
});

test('installation guide separates reliable acquisition, guided setup, profiles, and uninstall', async () => {
  const guide = await text('docs/installation.md');
  assert.match(guide, new RegExp(codeload.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(guide, /guided|numbered choices/i);
  assert.match(guide, /core.*standard.*extended/is);
  assert.match(guide, /--bundle web/);
  assert.match(guide, /--bundle production/);
  assert.match(guide, /--no-auto-bundles/);
  assert.match(guide, /outer `npx --yes`.*VibeTether's `--yes`/is);
  assert.match(guide, /uninstall --project \. --dry-run/);
  assert.match(guide, /github:.*not.*primary|not use.*github:/is);
});

test('routing guide documents automatic re-entry, local extension, and authority limits', async () => {
  const guide = await text('docs/routing.md');
  for (const boundary of ['task entry', 'phase change', 'compaction', 'resume', 'handoff', 'repeated failure', 'completion', 'release']) {
    assert.match(guide, new RegExp(boundary, 'i'));
  }
  assert.match(guide, /routes\.local\.yaml/);
  assert.match(guide, /primary.*alternative.*overlay/is);
  assert.match(guide, /cannot weaken.*authority|authority.*cannot be weakened/is);
  assert.match(guide, /missing.*local primary.*curated|curated.*fallback/is);
  assert.match(guide, /host.*cooperat|behavioral control/i);
});

test('Proven Path guide documents first success, recall, deduplication, and secrets', async () => {
  const guide = await text('docs/proven-paths.md');
  assert.match(guide, /first-proven-path/i);
  assert.match(guide, /first.*success.*capture|capture.*first.*success/is);
  assert.match(guide, /applicable_experience/);
  assert.match(guide, /captured.*already-encoded.*not-reusable/is);
  assert.match(guide, /credentials|private keys|one-time codes/i);
  assert.match(guide, /build|deploy|environment|publish/i);
});

test('provider guide owns complete curated inventory and discovery behavior', async () => {
  const guide = await text('docs/providers.md');
  for (const source of ['mattpocock/skills', 'obra/superpowers', 'andrej-karpathy-skills', 'anthropics/skills', 'vercel-labs/agent-skills', 'addyosmani/agent-skills']) {
    assert.match(guide, new RegExp(source.replace('/', '\\/'), 'i'));
  }
  assert.match(guide, /53 complete upstream Skills/i);
  assert.match(guide, /21 exposed Skills/i);
  assert.match(guide, /catalog-only.*outside host discovery/is);
  assert.match(guide, /exact commit/i);
  assert.match(guide, /does not search GitHub by star count/i);
});

test('Windows recovery guide describes deferred replacement and deterministic recovery', async () => {
  const runbook = await text('docs/operations/windows-skill-lifecycle.md');
  assert.match(runbook, /EPERM|EACCES/);
  assert.match(runbook, /pending-skill-upgrade/);
  assert.match(runbook, /recoverable-missing-skill/);
  assert.match(runbook, /ambiguous-recovery/);
  assert.match(runbook, /unrecoverable-skill-state/);
  assert.match(runbook, /close.*Codex.*Claude|close.*Claude.*Codex/is);
  assert.match(runbook, /same.*command.*again|rerun.*same.*command/is);
  assert.match(runbook, /peer harness/i);
  assert.match(runbook, /cannot replace.*active Skill|host.*active Skill.*replace/is);
  assert.match(runbook, /transaction manifest/i);
  assert.match(runbook, /SKILL\.md.*(?:last|activation)|activation marker.*last/is);
  assert.match(runbook, /recoverable-missing-skill[^.]{0,240}activation-last/is);
  assert.match(runbook, /unknown|customized/i);
  assert.doesNotMatch(runbook, /Remove-Item.*-Recurse|rm\s+-rf/i);
});

test('troubleshooting distinguishes package acquisition, provider TLS, and host locks', async () => {
  const guide = await text('docs/troubleshooting.md');
  assert.match(guide, /Codeload.*tarball/is);
  assert.match(guide, /github:.*(?:SSH|exit 128)|(?:SSH|exit 128).*github:/is);
  assert.match(guide, /TLS.*retry|retry.*TLS/is);
  assert.match(guide, /verified.*catalog.*without.*network|cached.*catalog/is);
  assert.match(guide, /EPERM|EACCES/);
  assert.match(guide, /first install.*SKILL\.md.*last|SKILL\.md.*last.*first install/is);
  assert.match(guide, /vibetether doctor/);
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
  assert.doesNotMatch(runbook, /BEGIN (?:OPENSSH|RSA|EC) PRIVATE KEY/);
});

test('package metadata points to the public repository', async () => {
  const pkg = JSON.parse(await text('package.json'));
  assert.equal(pkg.repository.url, 'git+https://github.com/t01089572455/vibetether.git');
  assert.equal(pkg.homepage, 'https://github.com/t01089572455/vibetether#readme');
  assert.equal(pkg.bugs.url, 'https://github.com/t01089572455/vibetether/issues');
  assert.equal(pkg.version, '0.5.0');
  for (const entry of [
    'docs/operations',
    'docs/installation.md',
    'docs/routing.md',
    'docs/proven-paths.md',
    'docs/project-truth.md',
    'docs/providers.md',
    'docs/troubleshooting.md',
  ]) assert.ok(pkg.files.includes(entry), `package files are missing ${entry}`);
  assert.equal(pkg.files.includes('docs'), false);
  const registry = JSON.parse(await text('registry/vibetether-releases.json'));
  assert.ok(registry.history.some((entry) => (
    entry.version === '0.2.3'
    && entry.commit === '56ea83e8e0feb7a086eff8e792225b418b41137b'
    && entry.fingerprint === '047f54c493f2ff17443f0c891f7b2f88e2bae67466a021bf30df321c5a7db5a2'
  )));
});

test('the npm tarball contains new routing, recovery, and focused documentation files', () => {
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm.cmd pack --dry-run --json']
    : ['pack', '--dry-run', '--json'];
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, npm_config_cache: path.join(os.tmpdir(), 'vibetether-npm-pack-cache') },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const [{ files }] = JSON.parse(result.stdout);
  const packFiles = files.map(({ path: file }) => file.replaceAll('\\', '/'));
  for (const file of [
    'src/project-routes.mjs',
    'src/customize.mjs',
    'src/route-handshake.mjs',
    'src/skill-upgrade-recovery.mjs',
    'docs/installation.md',
    'docs/routing.md',
    'docs/proven-paths.md',
    'docs/project-truth.md',
    'docs/assets/vibetether-control-loop.svg',
    'docs/providers.md',
    'docs/troubleshooting.md',
  ]) assert.ok(packFiles.includes(file), `tarball is missing ${file}`);
  assert.equal(packFiles.some((file) => file.startsWith('docs/superpowers/')), false);
});

test('public release documents contain no local path or non-English brand leakage', async () => {
  const corpus = await Promise.all([
    'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md',
    'docs/installation.md', 'docs/routing.md', 'docs/project-truth.md', 'docs/proven-paths.md', 'docs/providers.md', 'docs/troubleshooting.md',
  ].map(text));
  const joined = corpus.join('\n');
  assert.doesNotMatch(joined, /(?:^|\s)[A-Za-z]:[\\/]/m);
  assert.doesNotMatch(joined, /[\u3400-\u9fff]/);
});

test('third-party notices identify every curated source and license boundary', async () => {
  const notices = await text('THIRD_PARTY_NOTICES.md');
  for (const source of ['mattpocock/skills', 'obra/superpowers', 'anthropics/skills', 'andrej-karpathy-skills', 'vercel-labs/agent-skills', 'addyosmani/agent-skills']) {
    assert.match(notices, new RegExp(source.replace('/', '\\/'), 'i'));
  }
  assert.match(notices, /readme-declaration/i);
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

test('release history reproduces every registered canonical fingerprint', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-release-history.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /release compatibility: valid \(8 historical identities\)/i);
});
