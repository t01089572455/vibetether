# Troubleshooting

Start with:

```sh
vibetether doctor --project . --json
```

## npm exits 128 before VibeTether starts

Use the documented Codeload tarball form:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether init --project .
```

The shorter `github:t01089572455/vibetether` shorthand can make npm invoke Git
or SSH and exit 128 before VibeTether is running. VibeTether cannot recover an
acquisition failure that happens before its executable starts.

`curl -I https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main`
tests package acquisition separately from later provider Git access.

## A provider fetch reports TLS or an unexpected EOF

Recognized transient TLS failures receive at most three attempts with bounded
backoff. On Windows, a Schannel-specific failure switches later provider attempts
to OpenSSL. Authentication, missing repository, commit, fingerprint, and license
errors are not retried as transient.

After a successful fetch, the lock, commit, catalog path, fingerprints, and
license evidence form a verified cached catalog. Repeating an unchanged
initialization reuses it without provider network access.

If Schannel keeps failing, use Git's command-session configuration in Command
Prompt, then rerun the same install:

```bat
set "GIT_CONFIG_COUNT=1"
set "GIT_CONFIG_KEY_0=http.sslBackend"
set "GIT_CONFIG_VALUE_0=openssl"
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether init --project . --agent both --profile extended --bundle web --bundle production --yes
```

`GIT_SSL_BACKEND=openssl` alone does not configure Git's HTTP backend.

## Windows reports EPERM or EACCES

On a first install, the current release copies complete resources into the final
directory and writes `SKILL.md` last. This activation-last path avoids renaming a
temporary discoverable Skill after Codex or Claude has already opened it. An
error that names `.vibe-tether.<id>.tmp` inside an agent directory indicates an
older installer path; rerun with the current Codeload release.

Codex, Claude Code, an editor, antivirus, or another process may hold the active
Skill without delete sharing. A host cannot replace the Skill it has locked.
VibeTether records a pending verified replacement instead of deleting blindly.
Close the owning host and rerun the same command. See the
[Windows lifecycle runbook](operations/windows-skill-lifecycle.md).

## Doctor reports a changed managed Skill

VibeTether will not overwrite or remove an unknown or customized copy. Back it
up, compare it with the current release, and move intentional customization to a
project-owned Skill name before retrying. Registered canonical older releases
and portable LF/CRLF differences are handled separately from custom content.

## A provider is unavailable during a task

Run `vibetether capabilities --project .` to refresh live availability. Optional
providers use their declared fallback. Do not download a provider in the middle
of active work; change the profile or bundle through a reviewed `init`.

## The expected Web or production Skill is absent

Inspect `bundle_signals` in `.vibetether/project.yaml`. Select `--bundle web` or
`--bundle production` explicitly, or use `--no-auto-bundles` when repository
evidence should not select bundles.

## Initialization stops on license evidence

This is intentional. Changed declarations, unexpected Skill directories, wrong
commits, fingerprint mismatch, or missing required evidence stop before project
writes. Update the audited registry in a release; do not bypass the check.

## Project instruction markers conflict

VibeTether edits only its exact marked block. Preserve user text, repair duplicate
or reversed markers, and rerun `init --dry-run`.

## PowerShell blocks npm.ps1

Use `npm.cmd` or run the Codeload command from Command Prompt. Do not weaken the
machine execution policy merely for installation.
