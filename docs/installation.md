# Installation and scope

## From this release-candidate source checkout

```sh
npm install -g .
vibetether global install --agent both --yes
```

The dispatcher chooses the official version tag declared by the discovered project Contract. It never accepts an arbitrary package URL from project files. `VIBETETHER_CLI_PACKAGE` is an explicit operator/testing override and should be treated as trusted local configuration.


## Guided initialization

In an interactive terminal, `vibetether init --project . --agent both` asks only for missing goal and success evidence and confirms the reviewed Contract before writing. In automation or a non-interactive shell, use `--dry-run` or provide goal, success evidence, `--confirmed`, and `--yes`. Existing 0.x assets cause `init` to stop and direct the user to `migrate --dry-run`; they are never overwritten as a fresh project.

Initialization installs two small entry Skills for each enabled host: `vibe-tether` for adaptive work and `vibe-tether-deep` for an explicit Start Card / Implementation Permit gate. Provider packs remain cold.

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
