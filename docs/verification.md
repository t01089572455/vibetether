# VibeTether RC.4 verification boundary

This file is a verification contract, not a self-issued release certificate. A green source-tree test does not prove that the final TGZ works, and a configured CI matrix does not prove that Windows has run.

## What must be verified

Run these commands against the final candidate bytes before any release recommendation:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:coverage
npm run test:compat:v063-live
node scripts/test-package-journey.mjs
npm pack --dry-run
npm audit --audit-level=low
```

The package journey first rejects a dirty worktree and records the exact Git commit/tree it packs. It rejects unsupported archive extension records (including unparsed PAX records), installs the exact TGZ into an isolated prefix with redirected state/cache/home, and runs installed CLIs behind an import guard that rejects source-tree modules. It exercises adaptive ambiguity blocking, Deep Permit revocation, re-anchor recovery, bounded Outcome progress, slice/goal/release distinction, uninstall conflict preservation, and offline launcher reuse.

The live compatibility journey verifies the historical `v0.6.3` tag object, peeled commit, Git tree, and normalized source-content digest before it runs an exact historical CLI. It installs that CLI's committed lockfile with lifecycle scripts disabled and a minimal environment, then initializes Codex-only, Claude-only, and both-host fixtures before the packed candidate migrates, reads context, finishes an Outcome-controlled slice, rolls back byte inventories, and preserves a post-migration user edit. A moved tag is a hard failure; network unavailability at any remote acquisition step is reported as `not-run`, never as a pass. Failure logs, fixtures, and inventories are retained under the configured artifact directory, and CI uploads them when that gate fails.

## Completion evidence is layered

The Doctor reports one of these precise labels:

```text
SLICE_GREEN
GOAL_ENGINEERING_CLOSED
EXTERNAL_EVIDENCE_VERIFIED
REVIEW_DISPOSITION_RECORDED
OWNER_ACCEPTED
RELEASE_READY
```

The report is valid only at its requested boundary. A `SLICE_GREEN` route is not a closed parent goal; a closed goal is not release-ready; an Agent cannot manufacture external authority evidence. The labels are ordered only among maturity gates declared by the project: a project without an external gate can still have a review/owner milestone, but it cannot claim external verification. `PROGRESS.md` records the last verified transition; Doctor recalculates freshness against current bytes. Tests verify that authority, user/review decision receipts, and release evidence become stale when final product bytes change.

## Local versus remote evidence

The repository defines four mandatory remote jobs:

```text
ubuntu-latest  / Node 20
ubuntu-latest  / Node 24
windows-latest / Node 20
windows-latest / Node 24
```

Each must run the source checks, coverage, exact live-v0.6.3 journey, exact package journey, package preview, and audit. The remote matrix remains a release blocker until all jobs terminate successfully. Windows file-lock, case, short-path, and path-normalization behavior are not inferred from Linux tests.

## What a final review must inspect

- the final commit and tree ID;
- the exact TGZ/ZIP hashes and archive manifests;
- raw exit codes and summaries for the commands above;
- the live v0.6.3 inventories and rollback conflict report;
- the GitHub Actions URLs for all four jobs;
- the final diff against the delivery packet;
- an independently scoped review of product claims, migration safety, and security boundaries.

The implementing Agent’s own test summary is self-review. It is useful evidence, but not independent approval.

## Limits

VibeTether is not an operating-system sandbox, semantic oracle, or host-enforced daemon. Hashes prove byte identity, not product meaning. A receipt proves the recorded command or adapter result, not that every relevant test exists. Without a mandatory host hook, an Agent that never invokes VibeTether cannot be forced into its control plane.
