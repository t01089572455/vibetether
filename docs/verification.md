# VibeTether 1.0.0-rc.3 local source verification

This document records source-tree verification performed on **2026-07-21** before the immutable release-candidate archive is created. Exact ZIP, npm tarball, source-manifest, clean-extraction, and isolated-install results are generated beside the downloadable artifact; those external reports, not this source file, are the authority for the packaged bytes.

## Verified local environment

- Debian GNU/Linux 13
- Linux x86_64
- Node.js `v22.16.0`
- npm `10.9.2`
- Git `2.47.3`

The repository contains a GitHub Actions matrix for Ubuntu and Windows with Node.js 20 and 24. A configured matrix is not a passed run. The Windows matrix and exact tagged-v0.6.3 network acquisition were **not executed successfully in this local session** and are not counted as passing evidence.

## Current source-tree gates

All commands below were run from the repository root.

- `npm run check:syntax` — exit `0`; **65 JavaScript modules** parsed.
- `npm test` — exit `0`; **134 passed, 0 failed, 0 skipped across 19 test files** using the deterministic serial runner.
- `npm run test:coverage` — exit `0`; **131 tests, 130 passed, 0 failed, 1 Windows-only skip**.
- `npm run eval` — exit `0`; fixed regression corpora passed:
  - training: **12 cases**;
  - held-out: **14 cases**;
  - external-finding adversarial controlled: **34 cases**;
  - adversarial read-only near-miss: **6 cases**.
- `npm run audit:budgets` — exit `0`; all contract, Skill, managed-block, Context Capsule, and forbidden-project-asset budgets passed.
- `npm run audit:release` — exit `0`; **49 verified Providers, 44 capabilities, 6 pinned community sources**.
- `npm audit --audit-level=low` — exit `0`; **0 known vulnerabilities**.
- `npm pack --dry-run` — exit `0`; preview contained **147 files**, approximately **319.9 kB packed / 1.1 MB unpacked**.

The fixed routing corpora are regression evidence, not a measurement of general natural-language routing accuracy. The adversarial corpus incorporates prior external findings and therefore is not an unrevealed independent forward test.

## Coverage

The combined Node coverage run recorded:

- lines: **89.29%**
- branches: **71.89%**
- functions: **88.02%**

Coverage is supporting evidence only. It does not replace black-box migration, launcher, worktree, Deep Permit, completion-integrity, fault-recovery, or security checks.

## Focused compatibility and integrity evidence

Local focused suites additionally established:

- Deep Start Card and Permit semantics, revocation, expiry, lease-break invalidation, and finish-time revalidation: **18/18**;
- semantic completion evidence plus existing Evidence and Doctor regressions: **25/25**;
- migration, upgrade, rollback, and offline launcher regressions: **21/21**;
- worktree suite: **10 passed, 0 failed, 1 Windows-only skip**;
- Provider activation/environment containment: **11/11**;
- Evidence receipt/environment containment: **8/8**;
- safety CLI/path handling: **9/9**.

Success Capture tests confirm that an explicit label cannot promote routine work, while a reusable candidate derives its sequence, decisive conditions, command, artifact coverage, and Evidence IDs from actual receipts.

## v0.6.3 compatibility boundary

Local tests cover the canonical v0.6.3 Truth sections (`Host bootstrap`, `Control-plane pointers`, Confirmed/Candidate/Declined), legacy Intent metadata, CRLF host assets, Provider/profile/bundle restoration, Experience downgrade, complete `.agents`/`.claude`/`.vibetether` transaction coverage, byte-identical rollback when unchanged, and conflict-preserving rollback after a user edit.

`scripts/test-live-v063-migration.mjs` is designed to acquire the exact immutable `v0.6.3` tag, initialize a project with that released CLI, migrate it with RC.3, read the new Contract, and verify full byte-inventory rollback. The local container could not resolve/fetch the remote source, so that live acquisition is still an external CI/reviewer gate. Hand-written or sanitized fixtures are supporting evidence, not a substitute for the live released-version path.

## Provider license boundary

Four redistributed community sources retain complete license text. Multica/Karpathy and Vercel have declaration-only evidence in this package; their provenance metadata is retained, but their Provider bytes are not redistributed. They require separate user-initiated import and license review.

## Promotion boundary

This source is a release-candidate implementation, not a final 1.0 release and not an operating-system sandbox or semantic oracle. Final promotion requires at minimum:

- the actual Ubuntu/Windows Node 20/24 matrix;
- the exact tagged-v0.6.3 live migration and rollback path;
- independent review of the final immutable ZIP and npm tarball;
- no newly discovered P0/P1 conformance failures.

Hashes prove byte identity, not meaning. Fresh checks prove the declared path on the observed platform, not every untested host or acceptance condition. Self-review is not independent verification.
