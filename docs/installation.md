# Installation and scope

## From this release-candidate source checkout

```sh
npm install -g .
vibetether global install --agent both --yes
vibetether init --project . --agent both
```

The dispatcher chooses the official version tag declared by the discovered project Contract. It never accepts an arbitrary package URL from project files. `VIBETETHER_CLI_PACKAGE` is an explicit operator/testing override and should be treated as trusted local configuration.


For a verified downloaded archive, install the archive itself:

```sh
npm install -g ./vibetether-1.0.0-rc.4.tgz
vibetether global install --agent both --yes
vibetether init --project . --agent both
```

For an immutable published commit, replace the source-tree install with a one-time initializer:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/<verified-commit> \
  vibetether init --project . --agent both
```

Verify that commit and the downloaded archive digest before use. Do not use an arbitrary branch or mutable tag as a release channel. A project Contract pins the expected runtime version after initialization.

## Guided initialization

In an interactive terminal, `vibetether init --project . --agent both` asks only for missing goal and success evidence and confirms the reviewed Contract before writing. In automation or a non-interactive shell, use `--dry-run` or provide goal, success evidence, `--confirmed`, and `--yes`. Existing 0.x assets cause `init` to stop and direct the user to `migrate --dry-run`; they are never overwritten as a fresh project.

Initialization installs two small entry Skills for each enabled host: `vibe-tether` for adaptive work and `vibe-tether-deep` for an explicit Start Card / Implementation Permit gate. Provider packs remain cold.

Use the adaptive entry for normal requests. It investigates facts available in the project before asking you anything and escalates only when the request would change product direction, acceptance, architecture, UI, data, permissions, or release scope. Use the deep entry when you want an explicit “do not code until I confirm the expanded interpretation” gate.

Initialization creates an empty, user-governed `.vibetether/outcomes.json` registry and a generated `.vibetether/PROGRESS.md` projection. It never invents or confirms your requirements from repository prose. Ask the Agent to propose Outcome candidates, review them, then confirm the complete coverage set. Regenerate a missing or hand-edited progress projection with:

```sh
vibetether outcomes status --project . --write-progress
```

If a governing source has stable requirement IDs, ask the Agent to propose a coverage sidecar under `.vibetether/coverage/`. Review every mapping or disposition before it changes authority, then confirm coverage. The goal Doctor checks the complete declared ID universe, not merely the number of tests that happen to be green.

## Project modes

- `team`: Contract tracked in the repository; recommended for teams.
- `hybrid`: tracked Contract with external runtime; equivalent runtime safety with explicit portability semantics.
- `local`: Contract in the user's VibeTether state directory for this Git clone; useful for private experiments but not team-portable.

All modes keep runtime outside the project. A sibling worktree can discover a local Contract through the Git common-directory identity. A team Contract absent from the current branch may be discovered from another registered worktree, but context is blocked with `CONTRACT_MISSING_ON_BRANCH` before consequential writes.

## Global uninstall

```sh
vibetether global uninstall --agent both --yes
```

Modified global entry files are preserved and cause a safety refusal.


## Provider packs

`core` uses built-in fallbacks only. `standard` enables the reviewed standard cold pack. `extended` includes standard plus the extended design pack. Add `--bundle web` and/or `--bundle production` during initialization to make those pinned Providers eligible. Pack content remains outside project `.vibetether` and only the selected Provider is activated.
