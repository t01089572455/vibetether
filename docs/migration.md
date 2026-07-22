# Migration from 0.x

`vibetether migrate --dry-run` reports preservation, candidate conversion, runtime recovery, heavy-asset removal, and rollback behavior without writing.

On apply, VibeTether makes an external byte-preserving backup before project changes. Legacy manifest sources become candidates. A canonical Truth Map is preserved; a prose `.vibetether/TRUTH.md` is preserved byte-for-byte and a `.vibetether/TRUTH-MAP.md` sidecar becomes the index. Legacy proven Experience becomes provisional with hashes and verification cleared. Only goal, phase, slice, and next action may be recovered from a parseable checkpoint; self-declared PASS fields and large history are discarded.

The schema-2 migration creates a **draft** `outcomes.json` and generated `PROGRESS.md`. It does not pretend to infer the complete product requirement universe from old routes, tests, or progress prose. Unknown legacy trackers are recorded as candidates. A user must review and explicitly confirm Outcome coverage before `doctor --boundary goal` can close a goal.

Provider catalogs are verified into an external legacy cache before removal. Generated boards, locks, catalogs, licenses, old runtime, and old launchers are removed from the project only after the new Contract writes succeed. Any error restores the backup. The migration ID supports a later explicit rollback.

Migration directly from shared 0.x authority to local-only mode is refused because it would silently change team portability and authority scope.


Rollback records original and migration-output inventories. It restores bytes only while the current asset still equals the migration output. A post-migration user edit creates `ROLLBACK_CONFLICT`; the current, original, and migration versions are preserved for manual reconciliation instead of being overwritten.


## Compatibility corpus

The release-candidate migration tests include sanitized fixtures derived from a real installed 0.6.3 control-plane shape, including section-based Intent metadata, conditional sources, Provider profile/bundles, Experience, generated assets, host instructions, and local runtime. A separate canonical fixture includes the 0.6.3 Host bootstrap and Control-plane pointer Truth sections. The live compatibility journey pins the annotated `v0.6.3` tag object, peeled commit, Git tree, and normalized content digest before it runs anything. It installs the exact historical lockfile with lifecycle scripts disabled and a minimal environment, initializes Codex-only, Claude-only, and both-host projects, then proves context readability, one Outcome-controlled slice, byte-inventory rollback, and preservation of a post-migration user edit. A moved tag fails as `TAG_MOVED`; a network failure is retained as `not-run` evidence rather than promoted to a pass. These fixtures and journeys are evidence for those scenarios, not a claim that every private historical project has been exercised.

Tracked text is compared using portable LF normalization so the same Git Contract checked out under Windows `core.autocrlf=true` does not become a different authority solely because of line endings. Binary data remains byte-exact.

## If rollback reports a conflict

Do not retry with `--force`. A conflict means an asset changed after the migration. VibeTether preserves the pre-migration bytes, migration output, and current user bytes for manual reconciliation. This protects a user edit from being erased merely because a rollback was requested later.
