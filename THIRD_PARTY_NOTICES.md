# Third-Party Notices

VibeTether itself is licensed under MIT. During an explicit non-core initialization it can fetch third-party Skill directories directly from pinned upstream repositories. Those Skills remain governed by their upstream terms and are not relicensed by VibeTether.

The installer verifies an exact Git commit, the complete declared Skill inventory, each Skill-directory fingerprint, and declared license evidence before project writes. Provenance, fingerprints, catalog/exposure state, target paths, and ownership are recorded in `.vibetether/providers.lock.yaml`.

Two license-evidence modes are used:

- `full-text`: a pinned full license file and its hash are verified; an exact copy is installed under `.vibetether/licenses/` while VibeTether manages the source.
- `readme-declaration`: the pinned README hash and exact license declaration are verified because the reviewed commit does not contain the expected full license file. VibeTether records a warning and provenance, does not fabricate full license text, and does not embed the provider content in its npm package.

## mattpocock/skills

- Source: <https://github.com/mattpocock/skills>
- Release: `v1.1.0`
- Commit: `d574778f94cf620fcc8ce741584093bc650a61d3`
- Catalog: all 38 Skill directories found at the reviewed commit
- License: MIT, `full-text`
- Standard exposures: `grill-me`, `grilling`, `grill-with-docs`, `domain-modeling`, `codebase-design`, `prototype`, and `research`

The remaining Skills are catalog-only unless a later audited release changes their classification. Competing router `ask-matt` is not exposed automatically.

## obra/superpowers

- Source: <https://github.com/obra/superpowers>
- Release: `v5.1.0`
- Commit: `f2cbfbefebbfef77321e4c9abc9e949826bea9d7`
- Catalog: all 14 Skill directories found at the reviewed commit
- License: MIT, `full-text`
- Standard exposures: `brainstorming`, `dispatching-parallel-agents`, `executing-plans`, `finishing-a-development-branch`, `receiving-code-review`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, `verification-before-completion`, `writing-plans`, and `writing-skills`

Competing router `using-superpowers` is cataloged but not exposed because VibeTether owns the project routing entry point.

## multica-ai/andrej-karpathy-skills

- Source: <https://github.com/multica-ai/andrej-karpathy-skills>
- Commit: `2c606141936f1eeef17fa3043a72095b4765b9c2`
- Catalog: the complete `karpathy-guidelines` Skill
- License: MIT, `readme-declaration`
- Role: standard policy overlay; never the primary workflow router

The exact pinned README declaration and SHA-256 are recorded in the provider registry and lock. No synthetic license file is created.

## anthropics/skills

- Source: <https://github.com/anthropics/skills>
- Commit: `9d2f1ae187231d8199c64b5b762e1bdf2244733d`
- Catalog: selected `frontend-design` Skill only
- License: Apache-2.0, `full-text`
- Exposure: `extended` profile only

## vercel-labs/agent-skills

- Source: <https://github.com/vercel-labs/agent-skills>
- Commit: `f8a72b9603728bb92a217a879b7e62e43ad76c81`
- Catalog: all 9 Skill directories found at the reviewed commit
- License: MIT, `readme-declaration`
- Web bundle eligibility: eight implementation, verification, optimization, CLI, and deployment specialists

`writing-guidelines` remains catalog-only. Applicable bundle Skills are exposed only during explicit Web selection or when high-confidence React, Next.js, React Native, Expo, or Vercel repository evidence matches their signals. No synthetic license file is created.

## addyosmani/agent-skills

- Source: <https://github.com/addyosmani/agent-skills>
- Commit: `98967c45a42b88d6b8fb3a88b7ff6273920763d6`
- Catalog: all 24 Skill directories found at the reviewed commit
- License: MIT, `full-text`
- Production bundle exposures: `browser-testing-with-devtools`, `ci-cd-and-automation`, `deprecation-and-migration`, `observability-and-instrumentation`, `performance-optimization`, `security-and-hardening`, and `shipping-and-launch`

Competing router `using-agent-skills` remains catalog-only. Automatic production detection exposes only matching CI/CD or migration specialists; explicit Production bundle selection exposes the approved set above.

## Runtime dependency

The VibeTether CLI depends on the `yaml` npm package, which is licensed under ISC. Its resolved version and integrity are recorded in `package-lock.json`.
