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
npm run acceptance:tour
npm run check
```

For CLI behavior changes, add a failing Node test first, observe the intended failure, implement the smallest correction, and run the complete suite. For Skill behavior changes, add or update a pressure scenario and keep `SKILL.md` concise by routing detail to a one-level reference.

Before opening a pull request, run:

```sh
npm run check
npm run acceptance:tour
npm pack --dry-run
```

## Provider catalogs, exposures, and bundles

A curated provider proposal must identify its capabilities, lifecycle phases, workflow role, invocation policy, catalog status, exposure policy, source repository, exact commit, complete Skill fingerprint, license-evidence mode, agent compatibility, evaluation evidence, trigger conflicts, required outputs, exit evidence, and safe fallback.

For a complete catalog, run the deterministic source audit and prove that every upstream Skill directory is declared. Keep catalog storage separate from Codex and Claude discovery. A catalog-only Skill must never become exposed merely because it was downloaded.

Use `full-text` only when a pinned full license file is available and verified. Use `readme-declaration` only for the explicitly supported declaration boundary: pin the README hash and exact declaration, emit a warning, avoid synthetic license text, and test changed-declaration failure before project writes.

Add a provider to a profile or bundle only after fetch, inventory, fingerprint-mismatch, license, route-collision, idempotence, doctor, rollback, and managed-only uninstall tests pass. Update the README scenario table, provider counts, notices, and `registry/scenarios.json` in the same change.

Do not enable a provider because it is popular. Discovery-only candidates stay inert until the required metadata and evaluation are complete. Runtime routing must never fetch or install a provider.

## Pull requests

Describe the user problem, changed control contract, risks, RED and GREEN evidence, preview limitations, and any documentation or scenario changes. Keep unrelated refactors out of the same change.

By contributing, you agree that your contribution is licensed under the repository's MIT license.
