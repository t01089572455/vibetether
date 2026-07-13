import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = path.join(root, 'skills', 'vibe-tether');
const skillPath = path.join(skillDir, 'SKILL.md');

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, 'SKILL.md must start with YAML frontmatter');
  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf(':');
        assert.notEqual(index, -1, `invalid frontmatter line: ${line}`);
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

test('the public Skill exposes the VibeTether drift-control contract', async () => {
  const skill = await readFile(skillPath, 'utf8');
  const frontmatter = parseFrontmatter(skill);

  assert.deepEqual(Object.keys(frontmatter).sort(), ['description', 'name']);
  assert.equal(frontmatter.name, 'vibe-tether');
  assert.match(frontmatter.description, /^Use when /);
  assert.match(frontmatter.description, /long-running|long context/i);
  assert.match(skill, /directional uncertainty/i);
  assert.match(skill, /lightweight preflight/i);
  assert.match(skill, /full re-anchor/i);
  assert.match(skill, /project\.yaml/i);
  assert.match(skill, /one primary workflow provider/i);
  assert.match(skill, /DISCOVER[\s\S]*ALIGN[\s\S]*DESIGN[\s\S]*PLAN[\s\S]*EXECUTE_ONE/);
  assert.match(skill, /do not expose.*chain-of-thought|never expose.*chain-of-thought/i);
  assert.doesNotMatch(skill, /[\u3400-\u9fff]/);
  assert.doesNotMatch(skill, /(?:^|\s)[A-Za-z]:[\\/]/m);
  assert.ok(skill.split(/\r?\n/).length < 500, 'SKILL.md must stay below 500 lines');
});

test('every Skill reference is direct, present, and intentionally routed', async () => {
  const skill = await readFile(skillPath, 'utf8');
  const links = [...skill.matchAll(/\]\((references\/[^)]+\.md)\)/g)].map((match) => match[1]);
  const expected = [
    'references/authority-and-conflicts.md',
    'references/capability-routing.md',
    'references/checkpoint-and-drift.md',
    'references/project-manifest.md',
    'references/ui-control-loop.md',
  ];

  assert.deepEqual([...new Set(links)].sort(), expected.sort());
  for (const relative of expected) {
    const target = path.resolve(skillDir, relative);
    assert.equal(path.dirname(target), path.join(skillDir, 'references'));
    assert.equal((await stat(target)).isFile(), true);
  }
});

test('Codex UI metadata is present and references the public Skill', async () => {
  const metadata = await readFile(path.join(skillDir, 'agents', 'openai.yaml'), 'utf8');
  assert.match(metadata, /display_name:\s*"?VibeTether"?/);
  assert.match(metadata, /short_description:/);
  assert.match(metadata, /\$vibe-tether/);
});

test('the installed validator can validate its own public Skill', () => {
  const script = path.join(skillDir, 'scripts', 'validate-project.mjs');
  const result = spawnSync(process.execPath, [script, '--self'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /VibeTether Skill: valid/);
});

test('pressure-test feedback keeps control strict without unnecessary process overhead', async () => {
  const skill = await readFile(skillPath, 'utf8');
  const authority = await readFile(path.join(skillDir, 'references', 'authority-and-conflicts.md'), 'utf8');
  const ui = await readFile(path.join(skillDir, 'references', 'ui-control-loop.md'), 'utf8');

  assert.match(skill, /keep .*lifecycle.*checkpoint.*internal.*user-facing/i);
  assert.match(authority, /separable, reversible preparation/i);
  assert.match(authority, /does not encode the disputed direction/i);
  assert.match(ui, /prefer one representative golden screen/i);
  assert.match(ui, /two or three directions only when/i);
});

test('no published Skill resource leaks project-private product terms', async () => {
  const entries = await readdir(skillDir, { recursive: true, withFileTypes: true });
  const textFiles = entries
    .filter((entry) => entry.isFile() && /\.(md|mjs|yaml)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));

  for (const file of textFiles) {
    const content = await readFile(file, 'utf8');
    assert.doesNotMatch(content, /[\u3400-\u9fff]/, path.relative(root, file));
    assert.doesNotMatch(content, /(?:^|\s)[A-Za-z]:[\\/]/m, path.relative(root, file));
  }
});
