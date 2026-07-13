import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('README gives exact install, bootstrap, health, and uninstall commands', async () => {
  const readme = await text('README.md');
  assert.match(readme, /Keep coding agents tethered to project truth/);
  assert.match(readme, /npx skills add t01089572455\/vibetether --skill vibe-tether/);
  assert.match(readme, /npx --yes github:t01089572455\/vibetether init --agent both --profile standard --yes/);
  assert.match(readme, /vibetether doctor/);
  assert.match(readme, /vibetether uninstall --dry-run/);
  assert.doesNotMatch(readme, /<github-owner>|your-username|OWNER\/vibetether/i);
});

test('README explains support, architecture, UI control, and preview limitations without overclaiming', async () => {
  const readme = await text('README.md');
  assert.match(readme, /Codex[\s\S]*official preview/i);
  assert.match(readme, /Claude Code[\s\S]*official preview/i);
  assert.match(readme, /```mermaid[\s\S]*control kernel/i);
  assert.match(readme, /```mermaid[\s\S]*golden screen/i);
  assert.match(readme, /0\.1\.0 preview/i);
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
  assert.equal(pkg.version, '0.1.0');
});

test('public release documents contain no local path or non-English brand leakage', async () => {
  const corpus = await Promise.all(['README.md', 'SECURITY.md', 'CONTRIBUTING.md'].map(text));
  const joined = corpus.join('\n');
  assert.doesNotMatch(joined, /(?:^|\s)[A-Za-z]:[\\/]/m);
  assert.doesNotMatch(joined, /[\u3400-\u9fff]/);
  assert.doesNotMatch(joined, /<[^>]*(owner|username|repository)[^>]*>/i);
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
