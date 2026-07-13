# Complete Provider Catalog Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VibeTether catalog complete pinned community Skill inventories, expose only compatible providers, auto-select Web/Production bundles from repository evidence, and publish a novice-friendly usage guide that is contract-tested against the CLI and routing registry.

**Architecture:** Keep VibeTether as the sole entry router. Split provider state into catalog membership, exposure eligibility, route role, and live installation state. Explicit `init` stages exact upstream commits and license evidence, builds a project-local catalog, copies only eligible Skills into Codex/Claude discovery paths, then atomically writes the lock and capability board. Runtime route resolution remains offline and advisory.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, YAML, Git subprocesses, Markdown contract tests.

**Execution choice:** Inline in the current task, as confirmed by the user; no delegated implementation workers.

---

## Task 1: Freeze the baseline and provider audit contract

**Files:**

- Create: `scripts/audit-provider-source.mjs`
- Create: `test/provider-audit.test.mjs`
- Modify: `package.json`
- Modify: `.scratch/vibetether-provider-bundles/AGENT_DELIVERY.md` outside the public worktree after each evidence run

- [ ] Add a failing fixture test proving the audit rejects a source when an immediate Skill directory containing `SKILL.md` is absent from the declared catalog.
- [ ] Run `node --test test/provider-audit.test.mjs` and observe the missing-module failure.
- [ ] Implement `enumerateSkillDirectories(root, skillRoot)` and `auditProviderSource(source, checkoutRoot)` so output is stable and includes source commit, exact Skill paths, directory fingerprints, license-evidence fingerprint, and undeclared/missing entries.
- [ ] Support only `full-text` and `readme-declaration` evidence. The latter must require an exact declaration string and must report that complete license text is absent.
- [ ] Add `npm run audit:providers -- --registry registry/bundles.json --check` without network access; it validates an already staged checkout map or fixture data.
- [ ] Run the focused test and commit with `test: add deterministic provider inventory audit`.

## Task 2: Make catalog, exposure, and route roles first-class registry contracts

**Files:**

- Modify: `registry/bundles.json`
- Modify: `src/provider-registry.mjs`
- Modify: `src/provider-plan.mjs`
- Modify: `test/provider-registry.test.mjs`
- Modify: `test/registry.test.mjs`

- [ ] Add RED cases for an unclassified catalog Skill, exposed competing router, equal-priority primary providers, missing overlay compatibility, duplicate install names, and an alternative provider becoming automatic primary.
- [ ] Change each source to declare `catalog_mode`, `skill_root`, and `license_evidence`:

```json
{
  "catalog_mode": "complete",
  "skill_root": "skills",
  "license_evidence": {
    "mode": "full-text",
    "path": "LICENSE"
  }
}
```

- [ ] Change each Skill entry to declare `catalog_status`, `workflow_role`, `invocation_policy`, `exposure`, `capabilities`, `conflicts`, `fallback`, `required_outputs`, and `exit_evidence`.
- [ ] Add pure exports `validateProviderRegistry(registry)`, `resolveCatalogSources(registry, profile, bundles)`, and `resolveExposurePlan(registry, profile, bundles, signals)`.
- [ ] Ensure `buildRoutingDocument` rejects ambiguous primary ownership but permits compatible domain/policy overlays.
- [ ] Run `node --test test/provider-registry.test.mjs test/registry.test.mjs` and commit with `feat: model catalog and exposure policy`.

## Task 3: Detect and explain optional bundles

**Files:**

- Modify: `src/project-scan.mjs`
- Modify: `src/cli.mjs`
- Modify: `src/init.mjs`
- Modify: `test/cli-init.test.mjs`
- Create: `test/project-scan.test.mjs`

- [ ] Add RED tests for React/Next, React Native/Expo, Vercel, migration/deprecation, CI, observability, security, and performance evidence, plus a repository with no bundle evidence.
- [ ] Extend `scanProject` with `bundle_signals`, each containing `bundle`, `signal`, `path`, `confidence`, and `reason`.
- [ ] Extend init parsing with repeatable `--bundle web|production` and `--no-auto-bundles`; reject unknown or contradictory values with exit code 2.
- [ ] Resolve bundles using this precedence: explicit bundle, high-confidence auto detection, disabled by `--no-auto-bundles`, otherwise inactive.
- [ ] Make dry-run show detected signals, selected bundles, catalog actions, exposure actions, and disabled candidates without network or writes.
- [ ] Run `node --test test/project-scan.test.mjs test/cli-init.test.mjs` and commit with `feat: detect and explain specialist bundles`.

## Task 4: Stage complete catalogs and explicit license evidence

**Files:**

- Modify: `src/provider-fetch.mjs`
- Modify: `src/provider-plan.mjs`
- Modify: `src/skill-install.mjs`
- Modify: `test/provider-fetch.test.mjs`
- Modify: `test/provider-install.test.mjs`

- [ ] Add RED tests proving complete enumeration fails on an omitted upstream Skill, a changed README declaration fails before writes, and provider package contents are never copied into the npm tarball.
- [ ] Make `stageProviderSources` enumerate every immediate Skill directory under `skill_root`, compare it to registry entries, and return `catalog_skills` independently of `exposed_skills`.
- [ ] For `full-text`, verify and retain exact license content. For `readme-declaration`, verify README SHA-256 and exact declaration, retain provenance metadata only, and emit a visible warning.
- [ ] Add directory plans for `.vibetether/providers/catalog/<source-id>/<install-name>/` using the existing path-escape and symlink checks.
- [ ] Keep staged checkouts temporary and guarantee cleanup on every failure.
- [ ] Run `node --test test/provider-fetch.test.mjs test/provider-install.test.mjs` and commit with `feat: stage complete provider catalogs`.

## Task 5: Install catalog and exposure state transactionally

**Files:**

- Modify: `src/init.mjs`
- Modify: `src/provider-plan.mjs`
- Modify: `src/manifest.mjs`
- Modify: `src/adapters.mjs`
- Modify: `test/provider-init.test.mjs`
- Modify: `test/init-transaction.test.mjs`

- [ ] Add RED tests proving a catalog-only router is present under `.vibetether/providers/catalog` but absent from `.agents/skills` and `.claude/skills`, and a late exposure failure restores the old catalog, lock, board, licenses, and Skills.
- [ ] Build separate `catalogPlans` and `exposurePlans`; pass both through one `applyInitialization` rollback journal.
- [ ] Write manifest fields `provider_catalog`, `bundles`, and `bundle_signals` while preserving user-curated fields.
- [ ] Generate managed instructions that tell Codex/Claude to consult VibeTether at task entry, re-anchor, and phase boundaries, while keeping provider recommendations advisory outside existing gates.
- [ ] Prove repeated initialization is byte-for-byte idempotent for catalog, exposed copies, lock, board, and managed blocks.
- [ ] Run `node --test test/provider-init.test.mjs test/init-transaction.test.mjs test/cli-init.test.mjs` and commit with `feat: install catalogs and exposures atomically`.

## Task 6: Extend lock, doctor, and uninstall ownership

**Files:**

- Modify: `src/provider-plan.mjs`
- Modify: `src/doctor.mjs`
- Modify: `src/uninstall.mjs`
- Modify: `test/provider-lifecycle.test.mjs`
- Modify: `test/cli-lifecycle.test.mjs`
- Modify: `test/uninstall-transaction.test.mjs`

- [ ] Add RED cases for separately modified catalog/exposed copies, missing declared-license evidence, changed bundle selection, and uninstall preserving pre-existing identical Skills.
- [ ] Move the lock to schema version 2 with separate `catalog`, `exposures`, `license_evidence`, `classification`, and `active_bundles` fields.
- [ ] Make doctor distinguish `catalog-drift`, `exposure-drift`, `license-evidence-drift`, `missing-optional-provider`, and `route-conflict`.
- [ ] Make uninstall remove only unchanged VibeTether-owned catalog directories, exposed copies, generated boards, locks, and full-text license copies; declaration evidence is metadata, not a fabricated license file.
- [ ] Verify rollback and dry-run lists exact affected paths.
- [ ] Run the three focused lifecycle suites and commit with `feat: manage catalog lifecycle safely`.

## Task 7: Populate the complete reviewed provider catalogs

**Files:**

- Modify: `registry/bundles.json`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `test/registry.test.mjs`
- Modify: `test/public-release.test.mjs`

- [ ] Audit and record all Skill directories from Superpowers `f2cbfbefebbfef77321e4c9abc9e949826bea9d7`, Matt Pocock `d574778f94cf620fcc8ce741584093bc650a61d3`, Karpathy `2c606141936f1eeef17fa3043a72095b4765b9c2`, Vercel `f8a72b9603728bb92a217a879b7e62e43ad76c81`, Addy `98967c45a42b88d6b8fb3a88b7ff6273920763d6`, and the existing Anthropic pin.
- [ ] Classify every entry; keep `using-superpowers`, `using-agent-skills`, `ask-matt`, and duplicate lifecycle owners catalog-only or explicit-only.
- [ ] Expose Karpathy only as a policy overlay; expose Vercel only from Web evidence/selection; expose only the seven approved Addy Production specialists.
- [ ] Record all exact pins, license modes, provenance, and exclusions in notices without live star-count claims.
- [ ] Run `npm run audit:providers`, registry/public tests, and commit with `data: add complete reviewed provider catalogs`.

## Task 8: Complete scenario routing and the agent-facing capability board

**Files:**

- Modify: `registry/capabilities.json`
- Modify: `registry/bundles.json`
- Modify: `src/capabilities.mjs`
- Modify: `src/provider-plan.mjs`
- Create: `skills/vibe-tether/references/scenario-routing.md`
- Modify: `skills/vibe-tether/SKILL.md`
- Modify: `test/capabilities.test.mjs`
- Modify: `test/skill-contract.test.mjs`

- [ ] Add RED route tests for vague request, document conflict, unfamiliar codebase, huge effort, prototype decision, TDD, diagnosis, UI direction, Web implementation, compaction/handoff, triage/QA, architecture improvement, production hardening, and completion.
- [ ] Extend each resolution with `primary`, `overlays`, `alternatives`, `detected_signals`, `rationale`, `fallback`, `required_outputs`, and `exit_evidence`.
- [ ] Ensure explicit aliases remain discoverable while novice-facing automatic routes use model-invokable equivalents.
- [ ] Generate or contract-test `scenario-routing.md` from the same registry scenario IDs used by the board.
- [ ] Update the entry Skill to consult the board before consequential action and after re-anchor, without promising host-level invocation.
- [ ] Run capability and Skill contract tests and commit with `feat: complete scenario skill routing`.

## Task 9: Rewrite README as a tested product journey

**Files:**

- Modify: `README.md`
- Modify: `test/public-release.test.mjs`
- Modify: `test/cli-init.test.mjs`
- Modify: `CONTRIBUTING.md`

- [ ] First add RED assertions for required headings, exact commands, all CLI options, profile/bundle semantics, scenario IDs, host limitations, license modes, troubleshooting, and manual acceptance steps.
- [ ] Rewrite the opening around the outcome: keep capable agents aligned during long work and recommend the right specialist without making users memorize Skill names.
- [ ] Include copy-paste sections for Skill-only install, dry-run, full init, core/standard/extended, Web/Production bundles, no-auto-bundles, dashboard/route lookup, doctor, update/re-run, uninstall, and offline resolver.
- [ ] Add "When should I use what?" and six walkthroughs: vague project, unfamiliar codebase, long/compacted task, UI work, bug diagnosis, and release/migration.
- [ ] Explain cataloged vs exposed vs eligible vs alternative vs explicit-only, Codex/Claude paths, auto-detection signals, provider provenance, declaration-only licensing, troubleshooting, preview evidence, and the no-guarantee boundary.
- [ ] Add a temporary-project personal acceptance tour whose commands are executed by the test suite where safe.
- [ ] Run `node --test test/public-release.test.mjs test/cli-init.test.mjs` and commit with `docs: publish complete VibeTether usage guide`.

## Task 10: Expand evaluations and perform release-candidate verification

**Files:**

- Modify: `evals/scenarios.json`
- Modify: `evals/run-static-evals.mjs`
- Modify: `evals/README.md`
- Modify: `test/evals.test.mjs`
- Modify: `.scratch/vibetether-provider-bundles/AGENT_DELIVERY.md` outside the public worktree

- [ ] Add RED evaluation scenarios for orientation, huge-effort decomposition, prototype selection, compaction recovery, Web routing, production migration, duplicate-primary pressure, and changed declared-license evidence.
- [ ] Implement deterministic checks for route choice, overlays, gates, outputs, and fallback without claiming model effectiveness.
- [ ] Run focused eval tests, then fresh `npm run check`.
- [ ] Run `npm pack --dry-run` and prove upstream provider content is absent from the package.
- [ ] Exercise core, standard, Web, and Production initialization in fresh temporary projects; capture doctor, capabilities, idempotence, rollback, and uninstall evidence.
- [ ] Run `git diff --check`, review the complete diff against the design and delivery packet, update the evidence section, and keep release status preview until real Codex/Claude long-context trials exist.
- [ ] Commit with `test: verify complete provider routing release candidate`.
