# VibeTether Compatibility and Data Contract

Status: release-candidate design contract  
Decision owner: project user  
Compatibility baseline: installed VibeTether 0.6.x project control planes

## Compatibility definition

Compatibility protects both user-observable capability and user data. A new implementation may replace old layouts and generated artifacts only when it preserves the promised behavior, confirmed decisions, user-authored content, recoverability, and explicit project customizations.

A migration is not successful merely because files were written. The migrated Contract must be readable by the new runtime, pass structural validation, preserve or safely downgrade prior trust, and have a tested rollback path.

## Data classes

### User authority and configuration

These assets are user-controlled and must remain reviewable in the repository or an explicitly selected local Contract:

- Intent and success evidence;
- confirmed, candidate, declined, and superseded Truth;
- custom routes;
- project Provider selections, disables, and preferences;
- durable runbooks and Experience metadata;
- user prose outside managed instruction markers.

They cannot be silently overwritten, activated, removed, or reinterpreted.

### Generated project assets

Generated boards, locks, launchers, and exact managed blocks can be replaced only after identity and ownership checks. Modified or unrelated content blocks the operation and is preserved.

### Runtime state

Checkpoint projections, route state, evidence, activation receipts, handoff capsules, journals, leases, and quarantine records are per-worktree machine state. Persistent state and cache live outside the project; short-lived leases use the platform runtime location.

### Provider cache

Provider bytes are content-addressed, bounded, integrity checked, and excluded from default host discovery. Cache corruption causes quarantine or refetch, not silent trust.

## 0.6.x migration requirements

The migration reader must accept real installed 0.6.x structures, including:

- section-based Intent Contracts and v1 metadata;
- canonical Truth maps containing Host bootstrap and Control-plane pointer sections;
- legacy prose Truth documents;
- manifests without a `truth_index` field;
- conditional sources, Provider profiles, Web/Production bundles, routes, Experience, managed blocks, and local runtime state;
- Codex-only, Claude-only, and dual-host projects;
- LF and CRLF files.

Legacy manifest sources that were not explicitly confirmed in a canonical Truth map become candidates. Existing canonical confirmed Truth remains confirmed and retains its stable logical identity where possible. Legacy proven Experience is downgraded to provisional until fresh 1.0 evidence establishes its new verification contract.

Provider packs and project-local routes are preserved as user capability, even if their storage and loading mechanism changes.

## Migration transaction

Before writes, migration records:

- existence, type, and digest for every managed path;
- a verified external backup;
- the exact proposed output inventory;
- selected host adapters and control mode.

Writes are transactional and heavy old generated assets are removed only after the new Contract is readable and authority/runtime initialization succeeds.

Migration failure restores the backup. If restoration itself cannot complete, recovery copies and a conflict report remain available; the implementation must not claim success.

## Rollback and concurrent modification

Byte-for-byte restoration is allowed only when a current asset still matches the migration output or already matches the original.

For each managed asset, rollback distinguishes:

- current digest equals migration output — safe to restore original;
- current digest equals original — already restored;
- current digest equals neither — user or process changed it after migration.

The third case stops automatic overwrite. The system preserves original, migration output, and current bytes in a conflict location and gives a merge-oriented next action. Rollback must not destroy post-migration user work.

The rule applies to files and directories, including Intent, Truth, Experience, routes, Provider locks, installed Skills, managed instruction blocks, and `.gitignore`.

## Line-ending and cross-worktree portability

Tracked text authority and generated entry assets use portable text comparison so the same Git content checked out as LF or CRLF retains the same authority and control identity. `.gitattributes` records the intended normalization policy.

Binary content is hashed byte-for-byte. Portable normalization is not applied to arbitrary binary files.

Repository identity uses the Git common directory; each attached worktree receives a stable VibeTether worktree UUID. Git administrative paths are current locators, not permanent business IDs.

## Truth revision compatibility

Stable Truth IDs are preserved independently from path and revision digest. A content change records expected and observed revisions and triggers re-anchor. Directional changes require user confirmation unless the user explicitly approved that exact change.

Candidates never become confirmed merely because an old manifest listed their path or because migration found them.

## Provider provenance and redistribution

A Provider source can be requested by release or tag, but installation records the resolved immutable commit or tree plus a normalized content digest. A moved tag is treated as a different update candidate.

Each redistributed source records license evidence. Where a full license text is present at the pinned source, the exact text and digest are retained. A README-only declaration is recorded as declaration evidence and explicitly marked for legal review; it is not represented as a retained full license text.

Provider archives and imported directories are subject to file-count, byte-size, depth, path-length, compression-ratio, link, and special-file limits.

## Runtime and fault-recovery requirements

Source review, fault injection, and cross-platform testing supplement black-box conformance for properties that ordinary user journeys cannot prove, including:

- concurrent writers and stale leases;
- interrupted or failed replacement;
- `EPERM`, `EACCES`, `ENOSPC`, partial writes, and failed rollback;
- symlink, hardlink, junction, traversal, case-folding, Windows ADS, and device-name handling;
- receipt and journal tampering;
- stale Provider activation and environment-variable containment;
- quarantine recovery.

A broken lease must leave the route recoverable rather than permanently blocking every legal command.

## Release evidence

A release candidate must be tested from the exact source ZIP and npm tarball that are delivered. Verification reports name the actual operating system, Node.js, npm, and Git versions run. A configured CI matrix is not reported as an executed matrix.

Local Linux fault injection does not substitute for real Windows execution. A formal 1.0 promotion requires the declared remote matrix and independent review; local source ZIPs remain release candidates until that evidence exists.
