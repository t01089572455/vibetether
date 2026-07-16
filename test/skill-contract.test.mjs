import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as skillInstall from '../src/skill-install.mjs';
import { ADAPTERS } from '../src/adapters.mjs';

const { LEGACY_VIBETETHER_FINGERPRINTS } = skillInstall;

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
  assert.match(skill, /routes\.local\.yaml/);
  assert.match(skill, /vibetether\.mjs route --project \. --execution-root \. --phase/i);
  assert.match(skill, /route complete/i);
  assert.match(skill, /route abandon/i);
  assert.match(skill, /truth reconcile/i);
  assert.match(skill, /doctor --project \. --boundary/i);
  assert.match(skill, /phase transition/i);
  assert.match(skill, /do not force an optional provider/i);
  assert.match(skill, /first-proven-path/i);
  assert.match(skill, /first verified reusable (workflow|path)[\s\S]*captur/i);
  assert.match(skill, /captured[\s\S]*already-encoded[\s\S]*not-reusable/i);
  assert.match(skill, /vibetether\.mjs doctor[\s\S]*pending/i);
  assert.match(skill, /DISCOVER[\s\S]*ALIGN[\s\S]*DESIGN[\s\S]*PLAN[\s\S]*EXECUTE_ONE/);
  assert.match(skill, /smallest verifiable outcome/i);
  assert.match(skill, /including delegated work/i);
  assert.match(skill, /meaningfully advances the approved user goal/i);
  assert.doesNotMatch(skill, /maximum subagents|subagent cap|delegation budget/i);
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

test('managed instructions require bootstrap and proven-path recall before operational reinvention', async () => {
  const managedBody = ADAPTERS.codex.managedBody;
  const skill = await readFile(skillPath, 'utf8');

  assert.match(managedBody, /experience-index\.yaml/);
  assert.match(managedBody, /query applicable experience at task entry/i);
  assert.match(managedBody, /read the returned artifacts before inventing a new operational path/i);
  assert.match(managedBody, /record.*selected experience paths.*material reason/i);
  assert.match(skill, /project-bootstrap/);
  assert.match(skill, /proven-path-recall/);
  assert.match(skill, /requires_revalidation/);
});

test('the public Skill documents user-owned route roles and phase disposition', async () => {
  const skill = await readFile(skillPath, 'utf8');
  const routing = await readFile(path.join(skillDir, 'references', 'capability-routing.md'), 'utf8');
  const checkpoint = await readFile(path.join(skillDir, 'references', 'checkpoint-and-drift.md'), 'utf8');

  assert.match(`${skill}\n${routing}`, /primary[\s\S]*alternative[\s\S]*overlay/i);
  assert.match(routing, /project-owned[\s\S]*routes\.local\.yaml/i);
  assert.match(routing, /observable signal/i);
  assert.match(`${routing}\n${checkpoint}`, /route complete[\s\S]*route abandon/i);
  assert.match(`${routing}\n${checkpoint}`, /host.*cooperat|cooperat.*host/i);
});

test('the public 0.1.0 Skill fingerprint remains an explicit upgrade allowlist entry', () => {
  assert.equal(
    LEGACY_VIBETETHER_FINGERPRINTS.has('07e14f9aae4f66ed8baed16893f35a5730b9702174f72a04bf61dd5df45ca89d'),
    true,
  );
});

test('the compatibility registry includes the exact public 0.2.1 Skill', () => {
  assert.equal(
    LEGACY_VIBETETHER_FINGERPRINTS.has('2488d70f4a07bd5df8267c0baa15439f9463868778fd837d2d11134c2209f3df'),
    true,
  );
  assert.equal(skillInstall.VIBETETHER_RELEASE_COMPATIBILITY?.current?.version, '0.6.1');
  assert.equal(
    skillInstall.VIBETETHER_RELEASE_COMPATIBILITY.history.some((entry) => (
      entry.version === '0.2.3'
      && entry.commit === '56ea83e8e0feb7a086eff8e792225b418b41137b'
      && entry.fingerprint === '047f54c493f2ff17443f0c891f7b2f88e2bae67466a021bf30df321c5a7db5a2'
    )),
    true,
  );
  assert.equal(
    skillInstall.VIBETETHER_RELEASE_COMPATIBILITY.history.some((entry) => (
      entry.version === '0.4.0'
      && entry.commit === '7fe763f8af4dc9c45a118293dbc292961f6df9ef'
      && entry.fingerprint === '7378a1a9b9847495dd40767734208325a0bdc2fd293162b2e718df8ee40237c0'
    )),
    true,
  );
  assert.equal(
    skillInstall.VIBETETHER_RELEASE_COMPATIBILITY.history.some((entry) => (
      entry.version === '0.6.0'
      && entry.commit === 'ea5af1d418fd54eb788904d0e56a763f8c6d5b2e'
      && entry.fingerprint === 'efb74ee880340fc899bb4657b3abe24ae09dabbc316c35b400d250e8ecdb41c9'
    )),
    true,
  );
});

test('the exported compatibility view cannot grant new historical identities', () => {
  assert.equal(Object.isFrozen(LEGACY_VIBETETHER_FINGERPRINTS), true);
  assert.equal(LEGACY_VIBETETHER_FINGERPRINTS.add, undefined);
  assert.equal(LEGACY_VIBETETHER_FINGERPRINTS.delete, undefined);
  assert.equal(LEGACY_VIBETETHER_FINGERPRINTS.clear, undefined);
});

test('the current packaged Skill matches its portable release identity', async () => {
  assert.equal(typeof skillInstall.portableSkillFingerprint, 'function');
  assert.equal(
    skillInstall.VIBETETHER_RELEASE_COMPATIBILITY.current.fingerprint,
    await skillInstall.portableSkillFingerprint(skillInstall.sourceSkill),
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
    'references/project-truth.md',
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

test('the Skill defines a user-confirmed project truth lifecycle and selective re-entry', async () => {
  const skill = await readFile(skillPath, 'utf8');
  const truth = await readFile(path.join(skillDir, 'references', 'project-truth.md'), 'utf8');

  assert.match(skill, /candidates? (?:are|remain) non-authoritative/i);
  assert.match(skill, /active additions?.*require user confirmation/i);
  assert.match(skill, /truth.*experience.*conflict.*ask the user/i);
  assert.match(skill, /unchanged.*low-risk.*fingerprint/i);
  assert.match(truth, /generated during.*conversation.*candidate/i);
  assert.match(truth, /move.*delete.*supersed/i);
});

test('managed host instructions re-enter the complete project control plane', () => {
  for (const adapter of Object.values(ADAPTERS)) {
    assert.match(adapter.managedBody, /\.vibetether\/TRUTH\.md/);
    assert.match(adapter.managedBody, /candidate.*user confirmation/i);
    assert.match(adapter.managedBody, /truth.*experience.*conflict.*ask the user/i);
    assert.match(adapter.managedBody, /low-risk.*autonomously/i);
    assert.match(adapter.managedBody, /node \.vibetether\/bin\/vibetether\.mjs route/);
    assert.match(adapter.managedBody, /--execution-root/);
    assert.match(adapter.managedBody, /truth reconcile/);
    assert.match(adapter.managedBody, /doctor --project \. --boundary/);
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

test('the installed manifest resolver requires and exposes the project truth route', async () => {
  const { authorityRoutesFromManifest } = await import(
    new URL('../skills/vibe-tether/scripts/manifest.mjs', import.meta.url)
  );
  const source = [
    'schema_version: 1',
    'capability_board: .vibetether/capabilities.yaml',
    'truth_index: .vibetether/TRUTH.md',
    '',
  ].join('\n');

  assert.equal(authorityRoutesFromManifest(source).truthIndex, '.vibetether/TRUTH.md');
  assert.throws(
    () => authorityRoutesFromManifest(source.replace('truth_index: .vibetether/TRUTH.md\n', '')),
    /truth_index/i,
  );
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
