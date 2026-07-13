export const MANAGED_START = '<!-- vibetether:start -->';
export const MANAGED_END = '<!-- vibetether:end -->';

const legacySharedRules = [
  '## VibeTether drift control',
  '',
  'Invoke the `vibe-tether` Skill before each consequential action in a long-running task.',
  'Re-read `.vibetether/project.yaml` and its applicable truth sources before choosing direction.',
  'Ask the user when product direction, architecture, visual direction, destructive data changes, or release scope is ambiguous.',
  'Make low-risk, reversible, goal-aligned technical choices autonomously and record material decisions.',
  'After compaction, resume, handoff, repeated failure, or a phase change, perform a full VibeTether re-anchor before continuing.',
].join('\n');

const preReadinessSharedRules = [
  '## VibeTether drift control and capability routing',
  '',
  'Invoke the `vibe-tether` Skill before consequential actions in long-running work and after compaction, resume, handoff, repeated failure, or a phase change.',
  'Consult `.vibetether/capabilities.yaml` for the current phase, signals, recommended Skill, alternatives, availability, expected outputs, and exit evidence.',
  'For a live provider decision, run the installed offline resolver or `vibetether capabilities`; do not rely only on initialization-time availability.',
  'Provider recommendations are advisory: use the recommended Skill when it fits, or select a better installed alternative and record the material reason in the checkpoint.',
  'Do not install providers during an active task; use the declared built-in fallback when an optional provider is unavailable.',
  'Re-read `.vibetether/project.yaml` and its applicable truth sources before choosing direction.',
  'Ask the user when product direction, architecture, visual direction, destructive data changes, permissions, or release scope is ambiguous.',
  'Make low-risk, reversible, goal-aligned technical choices autonomously and record material decisions.',
].join('\n');

const sharedRules = [
  '## VibeTether drift control and capability routing',
  '',
  'Invoke the `vibe-tether` Skill before consequential actions in long-running work and after compaction, resume, handoff, repeated failure, or a phase change.',
  'Consult `.vibetether/capabilities.yaml` and automatically assess its work-readiness dimensions before implementation; do not start product work from guessed direction.',
  'Investigate discoverable facts autonomously. Route unresolved directional gaps to the recommended clarification provider and ask the user one recommended decision question at a time.',
  'For a live provider decision, run the installed offline resolver or `vibetether capabilities`; do not rely only on initialization-time availability.',
  'Provider recommendations are advisory: use the recommended Skill when it fits, or select a better installed alternative and record the material reason in the checkpoint.',
  'Do not install providers during an active task; use the declared built-in fallback when an optional provider is unavailable.',
  'Re-read `.vibetether/project.yaml` and its applicable truth sources before choosing direction.',
  'Ask the user when product direction, architecture, visual direction, destructive data changes, permissions, or release scope is ambiguous.',
  'Make low-risk, reversible, goal-aligned technical choices autonomously and record material decisions.',
].join('\n');

export const LEGACY_MANAGED_BODIES = new Set([legacySharedRules, preReadinessSharedRules]);

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

export const GITIGNORE_BODY = ['.vibetether/state/', '.vibetether/providers/catalog/'].join('\n');

export function selectedAdapters(agent) {
  if (agent === 'both') return ['codex', 'claude'];
  return [agent];
}
