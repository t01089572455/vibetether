# Troubleshooting

Start with:

```sh
node .vibetether/bin/vibetether.mjs doctor --project . --boundary ordinary --json
```

If the project-local launcher is missing or cannot start, use the documented
Codeload acquisition command to rerun `init`; do not create an unrelated
launcher by hand.

## Doctor reports a changed launcher or CLI version mismatch

The manifest records the managed launcher fingerprint, versioned package tag,
and expected release. A byte mismatch is a project conflict. Back up intentional
customization under another filename, then rerun the canonical `init` command.

A version mismatch means the CLI currently inspecting the project differs from
the project's recorded baseline. It is attention during ordinary work and a
blocking issue at completion-like boundaries. Prefer:

```sh
node .vibetether/bin/vibetether.mjs doctor --project . --boundary completion
```

If that launcher itself is stale, rerun the canonical update command from the
installation guide. The launcher still needs Node.js, npm, and network access to
the pinned Codeload release unless npm already has the package cached.
If `VIBETETHER_CLI_PACKAGE` is set, it deliberately overrides the recorded
acquisition source for that process; clear untrusted or accidental values before
diagnosing ordinary project behavior.

## npm exits 128 before VibeTether starts

Use the documented Codeload tarball form:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.1 vibetether init --project .
```

The shorter `github:t01089572455/vibetether` shorthand can make npm invoke Git
or SSH and exit 128 before VibeTether is running. VibeTether cannot recover an
acquisition failure that happens before its executable starts.

`curl -I https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.1`
tests package acquisition separately from later provider Git access.

If `vibetether --version` unexpectedly reports an older release, use the
current README command with `--prefer-online` so npm revalidates cached package
data. If an exact release is required, switch to the fixed release tag above,
then verify the version before `init`.

## A provider fetch reports TLS or an unexpected EOF

Recognized transient TLS failures receive at most three attempts with bounded
backoff. On Windows, a Schannel-specific failure switches later provider attempts
to OpenSSL. Authentication, missing repository, commit, fingerprint, and license
errors are not retried as transient.

For a pinned public GitHub provider, an exhausted transient Git fetch then uses
an exact-commit Codeload archive fallback. VibeTether still validates the full
catalog inventory, required license evidence, and every declared Skill
fingerprint before the provider can be installed. The fallback is deliberately
not used for authentication failures, non-GitHub sources, changed commits, or
integrity failures. If extraction itself reports that `tar` is unavailable,
enable a standard `tar` command or resolve the normal Git transport and rerun
the same command.

After a successful fetch, the lock, commit, catalog path, fingerprints, and
license evidence form a verified cached catalog. Repeating an unchanged
initialization reuses it without provider network access.

If Schannel keeps failing, use Git's command-session configuration in Command
Prompt, then rerun the same install:

```bat
set "GIT_CONFIG_COUNT=1"
set "GIT_CONFIG_KEY_0=http.sslBackend"
set "GIT_CONFIG_VALUE_0=openssl"
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.1 vibetether init --project . --agent both --profile extended --bundle web --bundle production --yes
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

Run the portable `capabilities` command to refresh live availability. Optional
providers use their declared fallback. Do not download a provider in the middle
of active work; change the profile or bundle through a reviewed portable `init`
command.

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
