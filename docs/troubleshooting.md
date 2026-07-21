# Troubleshooting

## No Contract found

Run `vibetether init`, or use `vibetether worktree attach --contract-root <tracked-worktree>` for a linked worktree of the same Git repository.

## Contract missing on this branch

The Context Capsule found a valid tracked Contract in another worktree. Merge or deliberately copy the Contract into this branch before consequential writes. VibeTether does not silently treat another branch as current authority.

## Active writer lease

Another route owns this worktree. Use another worktree, finish or abandon the existing route, or inspect it before an explicit `step break-lease`. Never break a live lease merely to bypass coordination.

## Stale execution snapshot

Files, branch, HEAD, or dirty bytes changed after evidence. Run fresh verification and finish a new bounded step.

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
