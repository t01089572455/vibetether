export const MANAGED_START = '<!-- vibetether:start -->';
export const MANAGED_END = '<!-- vibetether:end -->';

const sharedRules = [
  '## VibeTether drift control',
  '',
  'Invoke the `vibe-tether` Skill before each consequential action in a long-running task.',
  'Re-read `.vibetether/project.yaml` and its applicable truth sources before choosing direction.',
  'Ask the user when product direction, architecture, visual direction, destructive data changes, or release scope is ambiguous.',
  'Make low-risk, reversible, goal-aligned technical choices autonomously and record material decisions.',
  'After compaction, resume, handoff, repeated failure, or a phase change, perform a full VibeTether re-anchor before continuing.',
].join('\n');

export const ADAPTERS = {
  codex: {
    instructionFile: 'AGENTS.md',
    skillDirectory: '.agents/skills/vibe-tether',
    managedBody: sharedRules,
  },
  claude: {
    instructionFile: 'CLAUDE.md',
    skillDirectory: '.claude/skills/vibe-tether',
    managedBody: sharedRules,
  },
};

export const GITIGNORE_BODY = '.vibetether/state/';

export function selectedAdapters(agent) {
  if (agent === 'both') return ['codex', 'claude'];
  return [agent];
}
