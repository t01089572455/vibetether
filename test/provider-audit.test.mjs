import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test('provider audit emits a stable complete Skill inventory with fingerprints', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibetether-provider-audit-'));
  for (const name of ['beta', 'alpha']) {
    await mkdir(path.join(root, 'skills', name), { recursive: true });
    await writeFile(
      path.join(root, 'skills', name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Audit fixture.\n---\n`,
      'utf8',
    );
  }
  run('git', ['init', '-q'], root);
  run('git', ['config', 'user.name', 'VibeTether Tests'], root);
  run('git', ['config', 'user.email', 'tests@example.invalid'], root);
  run('git', ['add', '.'], root);
  run('git', ['commit', '-qm', 'audit fixture'], root);

  const output = run(
    process.execPath,
    ['scripts/audit-provider-source.mjs', '--checkout', root, '--skill-root', 'skills'],
    projectRoot,
  );
  const audit = JSON.parse(output);

  assert.match(audit.commit, /^[a-f0-9]{40}$/);
  assert.deepEqual(audit.skills.map((skill) => skill.path), ['skills/alpha', 'skills/beta']);
  assert.equal(audit.skills.every((skill) => /^[a-f0-9]{64}$/.test(skill.fingerprint)), true);
});
