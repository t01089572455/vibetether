# Installation and Updates

## Easiest complete setup

Run this in the project VibeTether should control:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether init --project . --agent both --profile extended --bundle web --bundle production --yes
```

The Codeload tarball is the primary acquisition path. It downloads the public
package over HTTPS without asking npm to invoke Git or SSH. Do not use the
shorter `github:t01089572455/vibetether` form as the primary path; on some npm
and Windows Git combinations it exits 128 before VibeTether starts.

The outer `npx --yes` lets npm acquire the package. VibeTether's `--yes` is the
final flag and accepts the fully specified project plan. They answer different
questions.

## Guided initialization

For a beginner-friendly setup, omit the trailing options:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether init --project .
```

Finite questions use explained numbered choices and a recommendation. Goal and
success evidence remain user-owned free text. VibeTether can investigate facts
already present in the repository, but it does not invent product direction.
Before writing or provider fetching, it prints a preview and asks for confirmation.

Use guided discovery again without rebuilding unchanged provider catalogs:

```sh
vibetether bootstrap --project .
```

`bootstrap --dry-run` discovers truth and previews changes without writing.
`bootstrap --yes` still refuses to invent required user-owned direction.

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
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether init --project . --agent both --profile core --no-auto-bundles --yes
vibetether init --project . --agent both --profile extended --bundle web --bundle production --yes
```

## Preview and inspect

```sh
vibetether init --project . --agent both --profile standard --dry-run
vibetether doctor --project . --json
vibetether capabilities --project .
```

The dry-run writes nothing. Re-running `init` is the supported update and repair
path. Verified unchanged catalogs are reused locally; only unresolved pinned
sources use provider networking.

## What is written

Initialization can add a bounded managed block to `AGENTS.md`, `CLAUDE.md`, or
both; install VibeTether and exposed specialists under the enabled host Skill
directory; and create the `.vibetether/` intent, truth index, capability board,
provider lock, checkpoint, and experience index.

VibeTether backs up an instruction file before its first managed-block change.
It does not overwrite text outside its exact markers or replace an unknown or
customized installed Skill.

## Update

Repeat the desired canonical command. Core VibeTether replacement happens before
provider fetching. On Windows, a host may lock the active Skill. The update is
then recorded as pending; close the host and rerun the same command. See the
[Windows lifecycle runbook](operations/windows-skill-lifecycle.md).

## Uninstall

Always preview first:

```sh
vibetether uninstall --project . --dry-run
vibetether uninstall --project . --yes
```

Only unchanged VibeTether-owned files and managed blocks are removed. Intent,
runtime checkpoint, first-change backups, user documents, pre-existing Skills,
and modified installed Skills are preserved.

## Exit codes

- `2`: invalid command input.
- `3`: project conflict or safety refusal.
- `4`: failed health check.
