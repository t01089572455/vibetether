# Truth and Experience lifecycle

## Truth

The Truth Map is a human-readable registry. Only confirmed entries contribute to the authority digest. Context selects applicable confirmed entries using stable ID, role, scope, phase, operation/capability, and current paths; it reports omitted counts instead of silently treating a truncated projection as complete. Candidates and declined entries remain visible for review but cannot guide implementation.

Confirmation, decline, removal, role/scope changes, and supersession are user-owned actions. During a step, `no-material-change` succeeds only when confirmed authority matches the start snapshot. `applied` can reconcile only the declared confirmed path; unrelated authority changes require a separate decision.

## Experience

Experience stores metadata and artifact pointers, not transcripts. A proven entry requires:

- non-trivial regular artifacts and SHA-256 hashes;
- successful command or artifact evidence receipts;
- matching authority and Skills-lock digests;
- OS and Node major version;
- verification and review timestamps;
- revalidation signals and counterevidence.

Audit computes an effective status without silently deleting user records. Any mismatch makes a declared proven entry suspect and excludes it from recall. At most three exact signal matches are returned. Truth always outranks Experience.


A stable Truth ID is separate from its revision digest. A digest change records drift and requires re-anchor. Only entries predeclared as deterministic, machine-verifiable, and non-directional may accept a new revision after their versioned validator succeeds; direction-sensitive changes remain user decisions.

Verified reusable success candidates contain a bounded observed sequence, evidence receipt references, decisive conditions, reusability reasons, and any validated durable output artifacts. Routine results do not create Experience noise.
