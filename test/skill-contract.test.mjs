import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LEGACY_VIBETETHER_FINGERPRINTS } from '../src/skill-install.mjs';

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

async function collectTextFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTextFiles(target)));
    } else if (entry.isFile() && /\.(md|mjs|yaml)$/.test(entry.name)) {
      files.push(target);
    }
  }
  return files;
}

test('the public Skill exposes the VibeTether drift-control contract', async () => {
  const skill = await readFile(skillPath, 'utf8');
  const frontmatter = parseFrontmatter(skill);

  assert.deepEqual(Object.keys(frontmatter).sort(), ['description', 'name']);
  assert.equal(frontmatter.name, 'vibe-tether');
  assert.match(frontmatter.description, /^Use when /);
  assert.match(frontmatter.description, /long-running|long context/i);
  assert.match(frontmatter.description, /coding request is vague|vague coding request/i);
  assert.match(frontmatter.description, /incomplete|missing/i);
  assert.match(frontmatter.description, /assumption|guess/i);
  assert.doesNotMatch(frontmatter.description, /Provides|routes the|checks the/i);
  assert.match(skill, /directional uncertainty/i);
  assert.match(skill, /lightweight preflight/i);
  assert.match(skill, /full re-anchor/i);
  assert.match(skill, /project\.yaml/i);
  assert.match(skill, /one primary workflow provider/i);
  assert.match(skill, /capabilities\.yaml/);
  assert.match(skill, /resolve-route\.mjs/);
  assert.match(skill, /do not force an optional provider/i);
  assert.match(skill, /first-proven-path/i);
  assert.match(skill, /first verified reusable (workflow|path)[\s\S]*captur/i);
  assert.match(skill, /captured[\s\S]*already-encoded[\s\S]*not-reusable/i);
  assert.match(skill, /vibetether doctor[\s\S]*pending/i);
  assert.match(skill, /DISCOVER[\s\S]*ALIGN[\s\S]*DESIGN[\s\S]*PLAN[\s\S]*EXECUTE_ONE/);
  assert.match(skill, /do not expose.*chain-of-thought|never expose.*chain-of-thought/i);
  assert.doesNotMatch(skill, /[\u3400-\u9fff]/);
  assert.doesNotMatch(skill, /(?:^|\s)[A-Za-z]:[\\/]/m);
  assert.ok(skill.split(/\r?\n/).length < 500, 'SKILL.md must stay below 500 lines');
});

test('the public Skill blocks guess-driven implementation with an automatic readiness assessment', async () => {
  const content = await readFile(path.join(root, 'skills', 'vibe-tether', 'SKILL.md'), 'utf8');
  assert.match(content, /Automatic Work-Readiness Gate/);
  assert.match(content, /investigate.*fact.*before asking/i);
  assert.match(content, /READY_FOR_IMPLEMENT_ONE/);
  assert.match(content, /one recommended question at a time/i);
  assert.match(content, /grill-me.*alias.*grilling/is);
  assert.match(content, /grill-with-docs.*grilling.*domain-modeling/is);
});

test('the public 0.1.0 Skill fingerprint remains an explicit upgrade allowlist entry', () => {
  assert.equal(
    LEGACY_VIBETETHER_FINGERPRINTS.has('07e14f9aae4f66ed8baed16893f35a5730b9702174f72a04bf61dd5df45ca89d'),
    true,
  );
});

test('every Skill reference is direct, present, and intentionally routed', async () => {
  const skill = await readFile(skillPath, 'utf8');
  const links = [...skill.matchAll(/\]\((references\/[^)]+\.md)\)/g)].map((match) => match[1]);
  const expected = [
    'references/authority-and-conflicts.md',
    'references/capability-routing.md',
    'references/checkpoint-and-drift.md',
    'references/project-manifest.md',
    'references/scenario-routing.md',
    'references/success-capture.md',
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
  assert.match(metadata, /Automatic readiness checks/);
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

test('the public Skill ships the zero-dependency experience resolver substrate', async () => {
  const resolver = await readFile(path.join(skillDir, 'scripts', 'resolve-route.mjs'), 'utf8');
  const experience = await readFile(path.join(skillDir, 'scripts', 'experience-index.mjs'), 'utf8');
  const safety = await readFile(path.join(skillDir, 'scripts', 'artifact-safety.mjs'), 'utf8');

  assert.match(resolver, /experience-index\.mjs/);
  assert.match(resolver, /applicable_experience/);
  assert.match(experience, /parseExperienceIndex/);
  assert.match(experience, /matchExperience/);
  assert.match(safety, /isSensitiveArtifactPath/);
  assert.doesNotMatch(`${resolver}\n${experience}\n${safety}`, /from ['"]yaml['"]/);
});

test('the installed validator performs its own recursive leakage scan', async () => {
  const script = await readFile(path.join(skillDir, 'scripts', 'validate-project.mjs'), 'utf8');
  assert.match(script, /readdir/);
  assert.match(script, /recursive/i);
  assert.match(script, /\\u3400/);
  assert.match(script, /absolute local path/i);
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
  const textFiles = await collectTextFiles(skillDir);

  for (const file of textFiles) {
    const content = await readFile(file, 'utf8');
    assert.doesNotMatch(content, /[\u3400-\u9fff]/, path.relative(root, file));
    assert.doesNotMatch(content, /(?:^|\s)[A-Za-z]:[\\/]/m, path.relative(root, file));
  }
});
