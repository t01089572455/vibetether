# Windows Skill Lifecycle Recovery

This runbook covers safe VibeTether update and uninstall recovery on Windows. It preserves user customizations and avoids manual recursive deletion.

## Safety model

VibeTether removes a Skill only when its bytes match the current release or an exact registered legacy fingerprint. An unknown or customized fingerprint remains blocked until the user backs it up and reviews the difference.

During an upgrade, VibeTether creates a separate transaction copy while leaving the existing target available to the atomic installer. If a later operation fails, the transaction copy supports rollback. Recovery errors retain the original installation failure instead of claiming that a missing backup was preserved.

## Normal update

Preview and then apply the same initialization profile already used by the project:

```powershell
npx --yes github:t01089572455/vibetether init --project . --agent both --profile standard --dry-run
npx --yes github:t01089572455/vibetether init --project . --agent both --profile standard --yes
```

## Normal uninstall

Always inspect the removal plan first:

```powershell
npx --yes github:t01089572455/vibetether uninstall --project . --dry-run
npx --yes github:t01089572455/vibetether uninstall --project . --yes
```

The plan should name only VibeTether-managed instruction blocks, unchanged managed Skills, generated routing artifacts, and owned provider material. Intent, runtime checkpoint, first-change backups, pre-existing Skills, and user documents are preserved.

## Registered legacy release

A message about a modified installed Skill can come from an older VibeTether release. A current release accepts only fingerprints explicitly registered in its source as old canonical releases. It does not treat arbitrary differences as legacy content.

The unchanged public 0.2.1 Skill is a registered canonical release and upgrades through the normal `init --dry-run` and `init --yes` path. Core Skill text copied with CRLF instead of LF line endings has the same portable identity. File names, directory structure, binary bytes, added files, removed files, and all other content remain significant.

Use the current pinned release for both preview and application. If the portable fingerprint is not registered, stop and compare the Skill instead of bypassing the guard.

## Provider transport and verified cache

A first non-core installation fetches exact pinned commits. Recognized transient TLS transport failures receive at most three total attempts; Schannel-specific failures switch later attempts to OpenSSL. Authentication, repository, commit, fingerprint, and license failures are not retried as transient.

After provider content succeeds once, the valid lock, canonical catalog path, exact raw Skill fingerprint, source commit, and license evidence form the local cache authority. Repeating an unchanged initialization or upgrading only the VibeTether core Skill reuses that verified catalog without provider network access. Missing or changed evidence returns only the unresolved source to the pinned fetch-and-verify path.

## Locked Skill on Windows

An `EPERM` or `EACCES` quarantine error usually means Claude Code, Codex, an editor, antivirus software, or another process is using the Skill without Windows delete sharing.

1. Note the exact Skill path in the error.
2. Close Claude Code, Codex, the editor, or another process using that path. Do not let the installer terminate user processes automatically.
3. Run `uninstall --project . --dry-run` again.
4. Apply only after the preview remains scoped to VibeTether-owned content.

Quarantine happens before managed text is edited. A lock at that boundary returns an error and rolls back any earlier quarantine move.

## Partial rollback

If an older release reports a partial rollback:

1. Stop repeating update commands.
2. Check the Codex and Claude VibeTether Skill paths separately; one may exist while the other is missing.
3. Preserve any transaction directory that still contains a copy.
4. Run the corrected release's uninstall preview. Missing harness copies are skipped, exact registered legacy copies are removable, and unknown copies remain protected.
5. If Windows reports a lock, close the owning process and retry the preview.

Do not manually erase agent directories to force success. The corrected lifecycle tests cover registered legacy removal, target availability during atomic replacement, missing transaction-copy reporting, rollback, and locked-directory guidance.
