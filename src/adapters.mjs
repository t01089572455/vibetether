import { MANAGED_END, MANAGED_START } from './constants.mjs';
import { conflictError } from './errors.mjs';
import { normalizePortableText, portableTextEqual } from './files.mjs';

export const MANAGED_BODY = `Use the \`vibe-tether\` Skill at task entry, after compaction or resume, before a consequential decision, and before completion or handoff.\n\nRun \`vibetether context --boundary <boundary> --json\` before reading VibeTether state. Follow only its confirmed truth handles, current slice, blockers, selected provider, and fresh applicable experience.\n\nDo not read raw VibeTether runtime state, provider catalogs, unselected Skills, or unselected experience. For an explicit deep request or unresolved direction, use the \`vibe-tether-deep\` Skill and do not write product code until its Start Card has a user-confirmed Implementation Permit. Do not alter project direction or activate project truth without the required user confirmation.`;

export const ADAPTERS = {
  codex: { instruction: 'AGENTS.md', skill: '.agents/skills/vibe-tether/SKILL.md', deepSkill: '.agents/skills/vibe-tether-deep/SKILL.md', userSkillRoot: '.codex/skills' },
  claude: { instruction: 'CLAUDE.md', skill: '.claude/skills/vibe-tether/SKILL.md', deepSkill: '.claude/skills/vibe-tether-deep/SKILL.md', userSkillRoot: '.claude/skills' },
};

export function selectedAdapters(agent = 'both') {
  if (agent === 'both') return ['codex', 'claude'];
  if (!Object.hasOwn(ADAPTERS, agent)) throw conflictError('Agent must be codex, claude, or both.', 'INVALID_AGENT');
  return [agent];
}

export function managedBlock() {
  return `${MANAGED_START}\n${MANAGED_BODY}\n${MANAGED_END}`;
}

export function hasCanonicalManagedBlock(source) {
  return normalizePortableText(source ?? '').includes(managedBlock());
}

export function applyManagedBlock(source) {
  const content = source ?? '';
  const starts = content.split(MANAGED_START).length - 1;
  const ends = content.split(MANAGED_END).length - 1;
  if (starts !== ends || starts > 1 || (starts === 1 && content.indexOf(MANAGED_START) > content.indexOf(MANAGED_END))) {
    throw conflictError('Instruction file contains malformed VibeTether markers.', 'MANAGED_BLOCK_CONFLICT');
  }
  const block = managedBlock();
  if (starts === 1) {
    const start = content.indexOf(MANAGED_START);
    const end = content.indexOf(MANAGED_END, start) + MANAGED_END.length;
    const existing = content.slice(start, end);
    if (!portableTextEqual(existing, block)) throw conflictError('Managed instruction block was modified; preserve the customization and migrate it deliberately.', 'MANAGED_BLOCK_CONFLICT');
    return content;
  }
  if (!content) return `${block}\n`;
  return `${content}${content.endsWith('\n') ? '' : '\n'}\n${block}\n`;
}

export function removeManagedBlock(source) {
  const content = source ?? '';
  const starts = content.split(MANAGED_START).length - 1;
  const ends = content.split(MANAGED_END).length - 1;
  if (starts === 0 && ends === 0) return content;
  if (starts !== 1 || ends !== 1) throw conflictError('Instruction file contains malformed VibeTether markers.', 'MANAGED_BLOCK_CONFLICT');
  const start = content.indexOf(MANAGED_START);
  const end = content.indexOf(MANAGED_END, start) + MANAGED_END.length;
  return `${content.slice(0, start)}${content.slice(end)}`.replace(/^\n+|\n+$/g, '').trimEnd() + (content.slice(0, start).trim() || content.slice(end).trim() ? '\n' : '');
}
