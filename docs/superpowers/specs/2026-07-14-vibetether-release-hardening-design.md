# VibeTether 0.2.3 Release Compatibility and Capability Hardening Design

Status: approved for implementation
Date: 2026-07-14
Scope: public VibeTether repository and its project-local Codex/Claude installation lifecycle

## 1. Goal

Release VibeTether 0.2.3 with a mechanically verified upgrade contract so an unchanged canonical earlier installation can be previewed, upgraded, checked, bootstrapped, and uninstalled without being mistaken for a user customization.

The release must preserve VibeTether's original purpose: keep strong coding agents aligned with project truth during long tasks, expose an advisory capability map, block guess-driven implementation, re-anchor after context loss, and turn reusable operational success into durable Proven Paths.

## 2. Confirmed Failure and Systemic Cause

The current project contains an unchanged VibeTether 0.2.1 Skill with fingerprint `2488d70f4a07bd5df8267c0baa15439f9463868778fd837d2d11134c2209f3df`. VibeTether 0.2.2 recognizes only two older fingerprints, so `init --dry-run`, `init --yes`, and `uninstall --dry-run` reject the legitimate installation as modified.

The immediate omission is one fingerprint. The systemic cause is broader:

1. historical canonical fingerprints are maintained as unstructured literals;
2. initialization, bootstrap authority, project-state inspection, doctor, and uninstall perform related identity checks in different places;
3. the test suite proves generic allowlist behavior but does not exercise the exact previous public release;
4. CI uses a shallow checkout and therefore cannot verify registry claims against historical Git trees;
5. byte fingerprints may differ only because a Windows checkout changed line endings.

## 3. Design Principles

- Preserve user work: an unknown or materially changed Skill must still stop before writes.
- Recognize only exact canonical history: compatibility is not a version-string bypass.
- Keep provider integrity strict: portable core-Skill recognition must not weaken raw provider fingerprints.
- Centralize identity decisions so every lifecycle command agrees.
- Make omissions fail in CI before publication.
- Keep the router advisory and the readiness gate automatic.
- Do not add features merely to increase the release diff.

## 4. Compatibility Contract

### 4.1 Structured history

Add a package-shipped compatibility registry under `registry/`. Each entry records:

- a stable release or canonical-snapshot identifier;
- the source commit;
- the package version at that commit;
- the canonical VibeTether Skill fingerprint;
- enough provenance for the repository audit to reproduce the fingerprint.

The current canonical Skill remains determined from the package contents. All previous exact canonical trees become accepted upgrade sources. A user customization is not added to the registry.

### 4.2 Portable core identity

Keep the existing raw `skillFingerprint` for curated provider catalogs and their lockfile integrity.

Add a VibeTether-core identity calculation that normalizes CRLF to LF for text content before hashing. Directory names, file names, file presence, and all non-line-ending bytes remain significant. This accepts the same canonical Skill copied through different Git line-ending settings while rejecting substantive edits, added files, removed files, symlinks, and binary changes.

### 4.3 One lifecycle decision

Expose one internal helper that answers whether a VibeTether Skill is:

- the current canonical package copy;
- a registered historical canonical copy;
- missing;
- unknown or modified.

Use that decision in:

- initialization and dry-run;
- bootstrap authority checks;
- managed-project-state recognition;
- doctor;
- uninstall.

Unknown content remains a controlled error. No command may silently reinterpret it as legacy.

## 5. Release Audit

Add a repository audit command that:

1. validates the compatibility registry schema;
2. verifies every historical commit exists;
3. reconstructs the Skill tree at that commit without checking it out over the worktree;
4. recomputes its portable fingerprint;
5. compares the result with the declared fingerprint;
6. verifies the current package version and current Skill contract;
7. fails on duplicate, malformed, missing, or unverifiable entries.

CI must fetch complete history and run this audit on Windows and Ubuntu. The packaged runtime consumes only the verified registry and does not need Git history.

## 6. Upgrade Test Matrix

The regression suite must cover:

| Source state | Operation | Expected result |
| --- | --- | --- |
| Exact 0.2.1 Skill, Codex | `init --dry-run` | preview succeeds with no writes or provider fetch |
| Exact 0.2.1 Skill, Codex + Claude | `init --yes` | both copies upgrade transactionally |
| Exact registered historical Skill | `doctor` / bootstrap authority | recognized as canonical legacy until repair |
| Exact registered historical Skill | `uninstall --dry-run` and `--yes` | safe plan and removal succeed |
| CRLF-only canonical legacy copy | lifecycle operations | recognized as the same canonical content |
| Legacy copy plus one changed byte/file | every destructive lifecycle operation | stop before project writes |
| Failure after first replacement | rollback | all prior bytes restored |
| Current copy | repeated `init` | byte-for-byte idempotent |

Tests must prove RED against the omitted 0.2.1 fingerprint before the implementation is changed.

## 7. Capability Review

### 7.1 Capabilities that are already substantive

Fresh baseline evidence shows 355 tests with 354 passes and one Windows portability skip, plus 16/16 static routing scenarios. The implementation already has meaningful coverage for:

- automatic work-readiness assessment;
- vague-requirement routing to model-invokable grilling;
- project truth discovery and conflict stops;
- guided greenfield bootstrap and Intent Contracts;
- advisory primary, overlay, alternative, and fallback routing;
- Codex and Claude installation;
- long-task checkpoints and re-anchor instructions;
- provider pinning, license evidence, catalog/exposure separation, and no runtime auto-install;
- Proven Path indexing, safe experience recall, success-capture health gates, and secret-safe diagnostics;
- transactional initialization, rollback, doctor, and ownership-safe uninstall.

These capabilities must be preserved by existing tests, static evaluations, installed/package resolver parity tests, the offline acceptance tour, package audit, and real upgrade acceptance.

### 7.2 Honest limitations

VibeTether cannot guarantee that every host model obeys project instructions or invokes a Skill before every action. It supplies durable instructions, a capability board, an offline resolver, checkpoints, and doctor gates; final invocation still depends on the Codex or Claude host honoring those inputs.

The resolver is deterministic after phase, capability, and signals are supplied. Translating arbitrary natural language into those fields remains an Agent responsibility supported by the scenario guide; VibeTether does not pretend to be a reliable zero-model natural-language classifier.

Success capture is mechanically checked when `doctor` runs, but no portable Skill can force a hostile or non-compliant host to run the command. Stronger hooks would be harness-specific, permission-sensitive, and outside this compatibility release.

Static scenarios prove registry and gate contracts, not an empirical probability that every future model will route correctly. The README must retain this boundary and must not claim guaranteed autonomous invocation or measured Token savings.

### 7.3 Capability changes in 0.2.3

This release will not add a speculative classifier, mandatory hook system, second router, or more community Skills. The evidence-backed capability improvement is reliability: every existing capability becomes safely reachable from prior canonical installations, and CI will prevent another release from stranding users on an unrecognized version.

Any capability issue discovered during implementation may be fixed only when it has a failing contract test, does not change approved product direction, and stays within the release budget. Broader host-hook or classifier work requires a separate approved design.

## 8. Beginner-Guided Initialization Choices

Interactive initialization should minimize unexplained free-text questions without fabricating project direction.

- Agent harness and control profile use numbered choices with labels, short consequences, and one clearly marked recommendation.
- Optional scope and visual-direction questions offer safe recommended, custom-answer, and no-additional-constraint choices. Selecting custom opens one focused text prompt.
- Goal and success evidence remain required user-owned text because generic fixed answers would create false direction. Each prompt explains what is needed, shows one concise example, and repeats on a blank answer instead of failing later.
- Invalid numbered choices are explained and re-prompted without writing project files.
- Final confirmation presents explicit Apply and Cancel choices; cancellation remains the safe default.
- Non-interactive flags and `--yes` behavior remain stable. Automation must not fabricate goal or success evidence.

The choice adapter is a reusable terminal concern. Bootstrap question definitions declare labels, descriptions, examples, and custom follow-up prompts; they do not embed terminal formatting.

## 9. Provider Network Reliability

The reported `TLS connect error ... unexpected eof while reading` exposes two independent reliability defects:

1. provider Git fetch retries only the Windows Schannel-to-OpenSSL transition, so a transient failure after OpenSSL is active fails immediately;
2. normal repeated initialization stages every selected provider source even when the lock, catalog copies, exposed copies, fingerprints, commit pins, and license evidence already prove that no provider content changed.

The repaired provider path must follow these rules:

- A fully verified local catalog is an exact content-addressed cache. Repeated initialization and a core VibeTether upgrade with an unchanged provider plan reuse it without provider-network access.
- Cache reuse requires the desired registry source, commit, skill fingerprint, canonical catalog path, provider lock, and license evidence to agree. Missing, changed, malformed, or unverifiable evidence falls back to the pinned upstream fetch or stops on a protected local modification.
- A fetch retries only errors classified as transient transport failures. The retry count is finite, later attempts use short bounded backoff, and a Schannel failure switches subsequent attempts to OpenSSL.
- Authentication errors, repository-not-found errors, invalid commits, fingerprint mismatches, license mismatches, and Git setup errors are not disguised as transient transport failures and are not repeatedly retried.
- Exhausted retries produce one actionable error that distinguishes provider transport failure from VibeTether core compatibility. No retry may select a mirror, branch head, archive, or unpinned substitute.
- A partially cached plan may reuse verified sources and fetch only the missing or changed pinned sources. Remote content still passes the existing commit, raw fingerprint, path-containment, and license checks before any project write.

Regression tests must prove the exact OpenSSL EOF report recovers on a later attempt, non-network failures do not retry, retries are bounded, unchanged repeated apply performs zero provider staging calls, and a missing or changed cache still invokes the verified upstream path.

## 10. Documentation

Update the README and Windows lifecycle runbook to explain:

- normal update is the same `init` command;
- registered canonical history is accepted automatically;
- line-ending-only differences are portable;
- material customizations still stop and must be backed up;
- `--dry-run` performs the full ownership preflight without writes or provider fetches;
- capability guarantees and host-dependent limitations remain explicit.

The quick-start command stays first. Advanced recovery remains later in the document.

## 11. Versioning and Publication

- Bump the package version to `0.2.3`.
- Keep the public repository and one-command GitHub installation format unchanged.
- Commit implementation only after the RED/GREEN tests and full local verification pass.
- Push the release branch or approved main integration to GitHub.
- Verify the remote commit and GitHub CI before claiming verified delivery.

## 12. Acceptance Evidence

Minimum release evidence:

1. focused RED/GREEN compatibility tests;
2. full `npm run check` with zero failures;
3. release-history audit with zero mismatches;
4. offline acceptance tour;
5. `npm pack --dry-run` and package-content review;
6. source and published-Skill leakage scan;
7. local clean-project installation and repeated-init proof;
8. exact prior-version dry-run, apply, doctor, bootstrap, uninstall, and modification-refusal proof;
9. the user's extended Codex + Claude command succeeding against the repaired release, including recovery from transient TLS EOF and network-free reuse on the unchanged second apply;
10. remote GitHub commit and CI success.

The interactive acceptance tour must also prove numbered harness/profile choices, guided goal/success prompts, custom optional answers, invalid-choice recovery, and safe cancellation.

## 13. Non-Goals

- weakening customization protection;
- automatically deleting or renaming unknown installed Skills;
- changing provider selection, bundle contents, or route priorities without a separate failing capability contract;
- installing providers during active Agent work;
- forcing a heavyweight workflow on small reversible tasks;
- adding UI work;
- claiming guaranteed Agent compliance, universal community consensus, or measured Token savings.
