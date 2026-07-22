# Troubleshooting

## No Contract found

Run `vibetether init`, or use `vibetether worktree attach --contract-root <tracked-worktree>` for a linked worktree of the same Git repository.

## Contract missing on this branch

The Context Capsule found a valid tracked Contract in another worktree. Merge or deliberately copy the Contract into this branch before consequential writes. VibeTether does not silently treat another branch as current authority.

## Active writer lease

Another route owns this worktree. Use another worktree, finish or abandon the existing route, or inspect it before an explicit `step break-lease`. Never break a live lease merely to bypass coordination.

## Stale execution snapshot

Files, branch, HEAD, or dirty bytes changed after evidence. Run fresh verification and finish a new bounded step.

## `GOAL_OUTCOMES_INCOMPLETE` or `RELEASE_OUTCOMES_INCOMPLETE`

The latest slice may be green, but the complete user-governed Outcome set is not. Inspect exact remaining IDs instead of treating a progress sentence as authority:

```sh
vibetether outcomes list --project . --json
vibetether doctor --project . --boundary goal --json
vibetether doctor --project . --boundary release --json
```

Confirm missing Outcomes only after the user reviews them. Do not lower the goal boundary to make the Doctor pass.

## `INTEGRATION_WORKTREE_REQUIRED`

Only the worktree designated when coverage was confirmed may close the parent goal and update the tracked `PROGRESS.md` projection. A feature worktree can close its own slice but cannot silently claim the parent is complete. Merge or integrate the verified bytes into the designated worktree, then rerun the goal boundary.

## `PROGRESS_PROJECTION_MISSING` or a modified `PROGRESS.md`

`PROGRESS.md` is generated from the Outcome Contract and per-worktree ledger. Do not hand-edit it to change status. Restore it from Git or regenerate it from the integration worktree:

```sh
vibetether outcomes status --project . --write-progress
```

If regeneration is refused, first resolve the current Contract, worktree, or coverage error reported by `doctor`.

The projection's completion label records the latest verified transition. It is not a substitute for a fresh Doctor run: a changed artifact, authority revision, or tampered receipt can make the live boundary fail even when the generated document still shows an older label.

## Stale Experience

Inspect the audit reasons. Re-run the workflow under current authority and environment, then confirm it again with fresh evidence. Do not manually edit hashes to restore proven status.

## Provider unavailable

Check channel, pin, host, OS, permission grants, positive and negative triggers, cache fingerprint, and project failure history. Optional work uses the built-in fallback; a permission-sensitive capability may stop instead of bypassing the missing authorization.

## Invalid runtime

The corrupt current projection is moved to quarantine and replaced with a small blocked state. Re-anchor from the validated Contract; do not copy prose from the invalid file back into runtime.

## User decision or Deep Permit required

A vague or direction-sensitive request cannot start code-write. Clarify the requested behavior and acceptance evidence, then retry with a durable `--confirmed-by-user --decision-reason` record. For explicit deep mode, prepare and show the Start Card, obtain user confirmation, and issue a fresh `deep permit`.

## Route contract unsatisfied

Provide every non-path required output with `--output`, create every path-like output, and acknowledge each declared exit-evidence statement with `--exit-evidence`. A successful empty command cannot replace missing outputs.

## Rollback conflict

Rollback stopped because managed assets changed after migration. VibeTether preserves the current bytes in the reported conflict directory rather than overwriting them. Merge the original, migration output, and current versions deliberately.

## Windows `EPERM`, file lock, or interrupted upgrade

Close editors, terminals, indexers, and Agents holding the affected project files, then rerun the same preview command first. The transaction keeps recoverable copies rather than deleting the old asset before a replacement succeeds. If it reports a recovery directory, preserve it and use the exact reported recovery command; do not delete the transaction folder to "unstick" the install.

## External evidence will not close

`EXTERNAL_EVIDENCE_VERIFIED` cannot be produced by an Agent saying that a deployment, payment, or external system succeeded. It requires the declared authority adapter's sealed receipt, bound to the current Outcome, Truth, worktree, and final-byte snapshot. The reference candidate intentionally ships no generic CLI command that lets an Agent self-attest external facts; leave that acceptance open or install and trust a purpose-built adapter that verifies its own authority path before recording its receipt.
