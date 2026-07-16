# Windows Skill Lifecycle Recovery

This runbook covers safe VibeTether update, interrupted-upgrade recovery, and
uninstall on Windows. It preserves user customizations and avoids manual
recursive deletion.

## Safety model

VibeTether removes a Skill only when its bytes match the current release or an exact registered legacy fingerprint. An unknown or customized fingerprint remains blocked until the user backs it up and reviews the difference.

During an upgrade, VibeTether verifies a separate transaction copy and the new
pending copy before changing the installed target. A transaction manifest names
every exact source, destination, expected fingerprint, and state. Recovery never
chooses an arbitrary directory by timestamp.

A first install uses activation-last publication. VibeTether writes every other
Skill resource into its final directory before it writes `SKILL.md` last as the
activation marker. Codex or Claude therefore cannot discover a temporary Skill
tree and lock it before a directory rename; the discoverable Skill appears only
after its complete resources are in place.

## Normal update

Preview and then apply the same initialization profile already used by the project:

```powershell
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.1 vibetether init --project . --agent both --profile standard --dry-run
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.1 vibetether init --project . --agent both --profile standard --yes
```

Keep the explicit Codeload tarball `--package=https://...tar.gz` form on Windows. It does not require a local Git client or SSH. The shorter npm `github:` shorthand or a `git+https` package spec can exit with code 128 before VibeTether starts.

## Normal uninstall

Always inspect the removal plan first:

```powershell
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.1 vibetether uninstall --project . --dry-run
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v0.6.1 vibetether uninstall --project . --yes
```

The plan should name only VibeTether-managed instruction blocks, unchanged managed Skills, generated routing artifacts, and owned provider material. Intent, runtime checkpoint, first-change backups, pre-existing Skills, and user documents are preserved.

## Registered legacy release

A message about a modified installed Skill can come from an older VibeTether release. A current release accepts only fingerprints explicitly registered in its source as old canonical releases. It does not treat arbitrary differences as legacy content.

The unchanged public 0.2.1 Skill is a registered canonical release and upgrades through the normal `init --dry-run` and `init --yes` path. Core Skill text copied with CRLF instead of LF line endings has the same portable identity. File names, directory structure, binary bytes, added files, removed files, and all other content remain significant.

Use the current pinned release for both preview and application. If the portable fingerprint is not registered, stop and compare the Skill instead of bypassing the guard.

## Provider transport and verified cache

A first non-core installation fetches exact pinned commits. Recognized transient TLS transport failures receive at most three total attempts; Schannel-specific failures switch later attempts to OpenSSL. Authentication, repository, commit, fingerprint, and license failures are not retried as transient.

After provider content succeeds once, the valid lock, canonical catalog path, exact raw Skill fingerprint, source commit, and license evidence form the local cache authority. Repeating an unchanged initialization or upgrading only the VibeTether core Skill reuses that verified catalog without provider network access. Missing or changed evidence returns only the unresolved source to the pinned fetch-and-verify path.

## Locked active Skill on Windows

An `EPERM` or `EACCES` rename error usually means Claude Code, Codex, an editor,
antivirus software, or another process is using the Skill without Windows delete
sharing. A host cannot replace its own active Skill while it holds that lock.

VibeTether does not terminate the host or delete the target. It preserves the
verified pending replacement under `.vibetether/transaction/`, writes the
transaction manifest, and returns controlled instructions:

1. Note the exact Skill path and pending transaction.
2. Close Codex, Claude Code, the editor, or other process using the path.
3. Rerun the same `init` command again.
4. Run `node .vibetether/bin/vibetether.mjs doctor --project . --boundary ordinary --json` and confirm the transaction issue
   is gone.

Pending recovery runs before provider metadata or provider network access. If
the directory is still locked, the verified transaction remains pending and the
same close-and-retry instruction is returned.

## Doctor recovery states

Doctor uses actionable codes instead of treating every missing directory as the
same problem:

- `pending-skill-upgrade`: a verified transaction is waiting for the lock to be
  released;
- `recoverable-missing-skill`: exactly one safe registered recovery path exists;
- `ambiguous-recovery`: more than one registered candidate exists and VibeTether
  will not guess;
- `unrecoverable-skill-state`: no safe exact candidate can reconstruct the
  missing managed Skill.

`recoverable-missing-skill` recovery uses the candidate as identity authority
and publishes the current canonical Skill activation-last before removing that
candidate. This avoids restoring an old discoverable tree and immediately
renaming it again while the host is opening it.

For an older interrupted release without a transaction manifest, recovery uses
only directly registered `.previous` candidates. One exact candidate can be
restored. If both harnesses were enabled, an unchanged peer harness with the
same registered portable fingerprint can disambiguate an exact candidate. Peer
harness recovery is identity evidence, not permission to copy a modified Skill.
Unknown or customized candidates are never restored automatically.

## Legacy partial rollback

If an older release reports a partial rollback:

1. Stop repeating update commands.
2. Check the Codex and Claude VibeTether Skill paths separately; one may exist while the other is missing.
3. Preserve any transaction directory or registered `.previous` candidate that
   still contains a copy.
4. Run `node .vibetether/bin/vibetether.mjs doctor --project . --boundary ordinary --json` and follow the exact recovery code.
5. If recovery is unambiguous, rerun the same current `init` command. If Windows
   reports a lock, close the owning process and retry.
6. For `ambiguous-recovery`, preserve every numbered candidate and compare them;
   do not choose the newest directory.

Do not manually erase agent directories to force success. The corrected lifecycle tests cover registered legacy removal, target availability during atomic replacement, missing transaction-copy reporting, rollback, and locked-directory guidance.
