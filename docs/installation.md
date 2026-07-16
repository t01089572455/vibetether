# Installation and Updates

## Easiest complete setup

Run this in the project VibeTether should control:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main?v=0.6.1 vibetether init --project . --agent both --profile extended --bundle web --bundle production --yes
```

The Codeload tarball is the primary acquisition path. It downloads the public
package over HTTPS without asking npm to invoke Git or SSH. Do not use the
shorter `github:t01089572455/vibetether` form as the primary path; on some npm
and Windows Git combinations it exits 128 before VibeTether starts.
This command follows the current `main`. The `?v=0.6.1` suffix is a
release-scoped npm cache key, not a source pin: Codeload still resolves `main`.
Copy the current README command for a later release; without a changed key, npm
may reuse an older tarball even with `--prefer-online` or `--force`. Use the
version-pinned update command below when the exact target version matters.

The outer `npx --yes` lets npm acquire the package. VibeTether's `--yes` is the
final flag and accepts the fully specified project plan. They answer different
questions. `init` does not install a global `vibetether` command. It writes a
managed project-local launcher at `.vibetether/bin/vibetether.mjs`, pinned to the
versioned release tag matching the project's manifest baseline. Use that
launcher for routine project commands; keep the complete portable command for
first acquisition, update, and recovery.

The launcher still uses npm/Codeload and therefore is not an offline guarantee.
It does not add `node_modules`, change `package.json`, or run a background
process. An explicitly supplied `VIBETETHER_CLI_PACKAGE` environment variable
overrides the acquisition source for that invocation; treat it as a trusted
testing or recovery control, not ordinary project configuration.

## Guided initialization

For a beginner-friendly setup, omit the trailing options:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main?v=0.6.1 vibetether init --project .
```

Finite questions use explained numbered choices and a recommendation. Goal and
success evidence remain user-owned free text. VibeTether can investigate facts
already present in the repository, but it does not invent product direction.
Before writing or provider fetching, it prints a preview and asks for confirmation.

Use guided discovery again without rebuilding unchanged provider catalogs:

```sh
node .vibetether/bin/vibetether.mjs bootstrap --project .
```

`bootstrap --dry-run` previews Intent Contract changes without writing.
`bootstrap --yes` still refuses to invent required user-owned direction and does
not activate repository documents. Use `.vibetether/TRUTH.md` directly or ask the
Agent to search for candidates and confirm them one at a time.

## Profiles

| Profile | Result | Provider network |
| --- | --- | --- |
| `core` | VibeTether, managed instructions, control board, checkpoint, and built-in fallbacks | None |
| `standard` | `core` plus compatible Matt Pocock, Superpowers, and Karpathy specialists | Missing pinned catalogs only |
| `extended` | `standard` plus Anthropic `frontend-design` | Missing pinned catalogs only |

Optional bundles:

- `--bundle web` adds signal-matched Vercel Web specialists.
- `--bundle production` adds approved production specialists.
- `--no-auto-bundles` disables repository-evidence bundle selection.

An offline-first two-stage installation is safe:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main?v=0.6.1 vibetether init --project . --agent both --profile core --no-auto-bundles --yes
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main?v=0.6.1 vibetether init --project . --agent both --profile extended --bundle web --bundle production --yes
```

## Preview and inspect

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main?v=0.6.1 vibetether init --project . --agent both --profile standard --dry-run
node .vibetether/bin/vibetether.mjs doctor --project . --boundary ordinary --json
node .vibetether/bin/vibetether.mjs capabilities --project .
```

The dry-run writes nothing. Re-running `init` is the supported update and repair
path. Verified unchanged catalogs are reused locally; only unresolved pinned
sources use provider networking.

## What is written

Initialization can add a bounded managed block to `AGENTS.md`, `CLAUDE.md`, or
both; install VibeTether and exposed specialists under the enabled host Skill
directory; and create the `.vibetether/` intent, blank user-owned `TRUTH.md`, capability board,
provider lock, checkpoint, experience index, and project-local CLI launcher.
The manifest records the launcher's path, fingerprint, versioned package tag, and
expected release version. Initialization finishes with an in-process doctor
baseline so structural problems are visible immediately.

VibeTether backs up an instruction file before its first managed-block change.
It does not overwrite text outside its exact markers or replace an unknown or
customized installed Skill.

## Update

Choose the target release explicitly and rerun `init`:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.1 vibetether init --project . --agent both --profile extended --bundle web --bundle production --yes
```

The existing installation makes this an update; the versioned release tag makes
the target reproducible and avoids npm's cache reusing a stale package for the
moving `main` URL. Core VibeTether replacement happens before provider fetching.
An unchanged managed launcher is upgraded atomically; a modified or unrelated
launcher is preserved and blocks the update before partial writes. On Windows, a
host may lock the active Skill. The update is then recorded as pending; close the
host and rerun the same command. See the
[Windows lifecycle runbook](operations/windows-skill-lifecycle.md).

## Uninstall

Always preview first:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.1 vibetether uninstall --project . --dry-run
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.1 vibetether uninstall --project . --yes
```

Only unchanged VibeTether-owned files and managed blocks are removed. Intent,
runtime checkpoint, first-change backups, user documents, pre-existing Skills,
and modified installed Skills are preserved.

## Exit codes

- `2`: invalid command input.
- `3`: project conflict or safety refusal.
- `4`: failed health check.
