# Third-Party Notices

VibeTether itself is licensed under MIT. Its `standard` and `extended` initializers can fetch complete third-party Skill directories directly from their upstream repositories. Those Skills remain governed by their upstream licenses and are not relicensed by VibeTether.

The installer verifies an exact Git commit, complete Skill-directory fingerprint, and license file before copying a provider. The installed source, commit, fingerprint, license hash, target path, and ownership are recorded in `.vibetether/providers.lock.yaml`. An exact copy of each upstream license is stored under `.vibetether/licenses/` while the provider is managed.

## mattpocock/skills

- Source: <https://github.com/mattpocock/skills>
- Release: `v1.1.0`
- Commit: `d574778f94cf620fcc8ce741584093bc650a61d3`
- License: MIT
- Standard Skills: `grill-me`, `grilling`, `grill-with-docs`, and `domain-modeling`

## obra/superpowers

- Source: <https://github.com/obra/superpowers>
- Release: `v5.1.0`
- Commit: `f2cbfbefebbfef77321e4c9abc9e949826bea9d7`
- License: MIT
- Standard Skills: `brainstorming`, `dispatching-parallel-agents`, `executing-plans`, `finishing-a-development-branch`, `receiving-code-review`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, `verification-before-completion`, `writing-plans`, and `writing-skills`

The upstream `using-superpowers` router is intentionally not installed because VibeTether is the project entry router.

## anthropics/skills

- Source: <https://github.com/anthropics/skills>
- Commit: `9d2f1ae187231d8199c64b5b762e1bdf2244733d`
- License for `frontend-design`: Apache-2.0
- Extended-only Skill: `frontend-design`

## Runtime dependency

The VibeTether CLI depends on the `yaml` npm package, which is licensed under ISC. Its resolved version and integrity are recorded in `package-lock.json`.
