# Contributing

VibeTether changes should reduce drift without increasing default context cost.

## Development

```sh
npm ci
npm run check
npm run test:coverage
npm pack --dry-run
npm audit
```

Node.js 20 and 24 are the supported CI versions. Changes affecting Git worktrees must be tested on Linux and Windows behavior where portable.

## Design rules

- Put deterministic safety in the CLI, not in longer prompt prose.
- Keep the entry Skill and managed instruction block small.
- Never activate project documents or Experience by discovery alone.
- Automatic actions may lower trust; raising authority or Provider trust requires review.
- Runtime state belongs outside the repository and is scoped to one worktree.
- A Provider may implement a capability but may not own project direction.
- Add a failing regression test before or with every bug fix.
- Preserve byte-for-byte user prose during migration and rollback.

## Provider contributions

A Provider card needs a fixed source/version, license, content fingerprint, capabilities, phases, positive and negative triggers, host/OS compatibility, permission requirements, context cost, and evaluation evidence. New external Providers begin experimental. Popularity is discovery evidence, not approval.

## Pull requests

Describe the failure mode, why the change is the smallest safe correction, affected assets and budgets, tests added, and any limitations. Do not include credentials, private transcripts, or generated runtime state.
