# Contributing to VibeTether

Thanks for helping make long-running agent work more controllable.

## Design principles

- Project truth outranks provider preferences.
- Directional ambiguity requires user confirmation.
- Low-risk reversible technical choices remain autonomous.
- Structural, destructive, visual-direction, data, security, and release decisions are gated.
- One primary workflow provider is recommended per phase; optional provider selection remains advisory.
- Functional, visual, review, and release evidence remain distinct.
- Managed project content is bounded, backed up, idempotent, and reversible.
- Claims must match measured evidence.

## Development setup

Use Node.js 20 or newer:

```sh
npm ci
npm run check
```

For CLI behavior changes, add a failing Node test first, observe the intended failure, implement the smallest correction, and run the complete suite. For Skill behavior changes, add or update a pressure scenario and keep `SKILL.md` concise by routing detail to a one-level reference.

Before opening a pull request, run:

```sh
npm run check
npm pack --dry-run
```

## Provider bundles and candidates

A curated provider proposal must identify its capabilities, lifecycle phases, workflow role, supported page types when applicable, source repository, exact commit, complete Skill fingerprint, license path, agent compatibility, evaluation evidence, trigger conflicts, and safe fallback. Add it to a profile only after fetch, fingerprint-mismatch, license, idempotence, doctor, and managed-only uninstall tests pass.

Do not enable a provider because it is popular. Discovery-only candidates stay inert until the required metadata and evaluation are complete. Runtime routing must never fetch or install a provider.

## Pull requests

Describe the user problem, changed control contract, risks, RED and GREEN evidence, preview limitations, and any documentation or scenario changes. Keep unrelated refactors out of the same change.

By contributing, you agree that your contribution is licensed under the repository's MIT license.
