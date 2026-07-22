# Installation and scope

## Shortest verified TGZ path

The beginner path is the exact archive proved by the installed-package journey: `npm install -g ./vibetether-1.0.0-rc.4.tgz`, then `vibetether global install --agent both --yes`, then `vibetether init --project . --agent both`.

Verify the TGZ SHA-256 and archive manifest before installation. Do not substitute a floating tag, a branch, or the directory you happen to be in. RC.4 is a review candidate, not a signed final release.

An immutable commit initializer is also supported through `https://codeload.github.com/t01089572455/vibetether/tar.gz/<verified-commit>`. Verify both the commit identity and downloaded digest before use.

## Local source checkout

Source execution is secondary and intended for development: install locked dependencies with lifecycle scripts disabled, then use `node ./bin/vibetether.mjs`. A green source checkout does not prove the packed or globally installed CLI.

## Guided and automated initialization

Interactive initialization asks only for missing goal and success evidence and previews the Contract before writing. Automation must provide the goal, success evidence, `--confirmed`, and either `--dry-run` or `--yes`. Existing 0.x assets cause fresh initialization to stop and direct the operator to migration preview.

Choose a control mode deliberately:

- `team`: tracked Contract; recommended for shared repositories.
- `hybrid`: tracked Contract with explicitly external runtime.
- `local`: machine-local Contract for this Git clone; not team-portable.

Runtime checkpoints and evidence stay outside project files in every mode.

## Profiles and bundles

- `core` uses only the built-in fallbacks.
- `standard` adds the reviewed standard cold Provider pack.
- `extended` adds the extended design pack.
- `web` is an optional bundle for browser and frontend work.
- `production` is an optional bundle for CI, operations, and production work.

Profiles and bundles only make pinned Providers eligible. They do not preload the catalog, grant permissions, or download Provider code during an active route.

## Global dispatcher

The global dispatcher and entry Skills contain no project Intent, Truth, Outcomes, or Experience. Modified managed host files are preserved and cause a safety refusal during uninstall rather than silent overwrite or deletion.
