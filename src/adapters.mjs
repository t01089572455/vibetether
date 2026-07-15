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

const preSuccessCaptureSharedRules = [
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

const preExperienceRecallSharedRules = [
  '## VibeTether drift control, capability routing, and success capture',
  '',
  'Automatically apply the `vibe-tether` Skill at task entry, before consequential actions, after compaction, resume, handoff, repeated failure, or a phase change, and before completion, the next slice, merge, release, or publication.',
  'Consult `.vibetether/capabilities.yaml` and automatically assess its work-readiness dimensions before implementation; do not start product work from guessed direction.',
  'Investigate discoverable facts autonomously. Route unresolved directional gaps to the recommended clarification provider and ask the user one recommended decision question at a time.',
  'Provider recommendations are advisory: use the recommended installed Skill when it fits, otherwise use an installed alternative or declared fallback and record the material reason in the checkpoint.',
  'Re-read `.vibetether/project.yaml` and its applicable truth sources before choosing direction or reusing an operational path.',
  'Ask the user when product direction, architecture, visual direction, destructive data changes, permissions, or release scope is ambiguous.',
  'Make low-risk, reversible, goal-aligned technical choices autonomously and record material decisions.',
  'After every verified user-level or engineering-level success, run the Success Capture Gate. A reusable workflow that succeeds for the first time is a `first-proven-path` and must be captured immediately; recovered or materially changed paths must update their Proven Path, while unchanged repeated paths must not create duplicate documentation.',
  'Record `captured`, `already-encoded`, or `not-reusable` in checkpoint `experience_feedback`, with a reason and artifact paths. Never persist credentials, private keys, one-time codes, private reasoning, or sensitive tool output. A completion-like state must pass `vibetether doctor` with no pending disposition.',
].join('\n');

const prePhaseHandshakeSharedRules = [
  preExperienceRecallSharedRules,
  'Query applicable experience at task entry from `.vibetether/experience-index.yaml`, at phase changes, resume, and before repeatable build, environment, CI, deployment, publication, migration, authentication, external-service, recovery, or release actions.',
  'Read the returned artifacts before inventing a new operational path; record selected experience paths or the material reason a candidate was stale or inapplicable in the checkpoint.',
  'Treat provisional or changed-environment paths as requiring fresh revalidation, then update the natural artifact and metadata index after verified success.',
].join('\n');

const sharedRules = [
  prePhaseHandshakeSharedRules,
  'At task entry and every phase transition, consequential action, compaction, resume, handoff, repeated failure, direction change, next slice, completion, merge, release, or publication, reload `.vibetether/project.yaml`, the live `.vibetether/routes.local.yaml` overlay when present, applicable truth, the checkpoint, and applicable experience.',
  'Before advancing a phase, run `vibetether route --project . --phase <PHASE> --capability <CAPABILITY>` with observable signals, invoke the selected installed Skill or declared fallback, then run `vibetether route complete --project . --evidence <EVIDENCE>` with bounded evidence or `vibetether route abandon --project . --reason <REASON>` with a material reason.',
  'Project routes are advisory and additive. They cannot weaken authority, readiness, evidence, high-risk, destructive-data, permission, or release gates.',
  'A route record proves selection and disposition, not semantic correctness; the host Agent must cooperate by re-entering this contract at the declared boundaries.',
].join('\n');

export const LEGACY_MANAGED_BODIES = new Set([
  legacySharedRules,
  preReadinessSharedRules,
  preSuccessCaptureSharedRules,
  preExperienceRecallSharedRules,
  prePhaseHandshakeSharedRules,
]);

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
