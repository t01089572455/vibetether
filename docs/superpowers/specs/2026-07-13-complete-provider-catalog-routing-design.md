# Complete Provider Catalog and Selective Routing Design

**Status:** Approved direction; awaiting written-spec review before implementation planning.

**Decision date:** 2026-07-13

## 1. Goal

Expand VibeTether from a curated set of 17 active provider Skills into a high-adoption provider catalog without turning the project into a pile of competing routers.

The approved model is:

> Cache complete upstream Skill catalogs during explicit initialization, expose only route-compatible Skills to the agent host, and let VibeTether recommend one primary workflow provider for the current situation.

This design preserves VibeTether's purpose: capable agents remain autonomous on local technical work, but long-running work repeatedly re-anchors to project truth, chooses a suitable specialist, and stops before directional or high-risk decisions.

## 2. Success Criteria

The design succeeds when:

1. A novice can initialize VibeTether with one command and does not need to know Skill names.
2. Complete Skill directories from the approved foundation repositories are available locally at exact pinned commits.
3. The host discovery directories contain only Skills whose invocation policy is compatible with VibeTether.
4. A natural-language situation maps to a capability, one primary workflow provider, optional non-overlapping overlays, and a built-in fallback.
5. Competing top-level routers remain auditable in the catalog but cannot automatically take ownership from VibeTether.
6. Equivalent TDD, debugging, planning, review, and completion Skills are alternatives, not simultaneous primary workflows.
7. Framework- and production-specific Skills activate only when repository evidence or an explicit profile requires them.
8. Initialization, upgrade, doctor, dry-run, and uninstall remain transactional, idempotent, fingerprinted, and license-aware.
9. No Skill is downloaded during an active coding task. Missing optional providers use a visible fallback until the user runs an explicit initialization or update command.

## 3. Non-Goals

- VibeTether will not copy every upstream instruction into its own `SKILL.md`.
- VibeTether will not promise that every agent host invokes the router before every action.
- Repository stars or Skills.sh install counts will not be treated as proof of correctness.
- Spec Kit, OpenSpec, BMAD, ECC, or another complete agent harness will not become a second project-truth tree.
- All cataloged Skills will not be placed directly into host discovery directories.
- Runtime routing will not mutate the Skill installation, access the network, or broaden permissions.
- Domain-specific document, media, marketing, cloud, and database Skills are outside the default coding catalog unless a later profile explicitly adopts them.

## 4. Terminology

| Term | Meaning |
| --- | --- |
| `catalog source` | An approved upstream repository pinned by exact commit and license. |
| `cataloged Skill` | A complete, unmodified upstream Skill directory stored in the VibeTether-managed local catalog. |
| `exposed Skill` | A complete Skill directory copied into a supported host's direct discovery path. |
| `primary workflow` | The single Skill that owns the current lifecycle method, such as brainstorming, TDD, or debugging. |
| `domain overlay` | A compatible specialist that adds domain rules without replacing the primary workflow. |
| `policy overlay` | A short cross-cutting discipline, such as Karpathy Guidelines, that constrains implementation without becoming the workflow. |
| `explicit alias` | An upstream user-invoked command kept available while its underlying behavior has an automatic route. |
| `competing router` | A Skill whose job is to select other Skills or run at every conversation entry, overlapping VibeTether's ownership. |
| `catalog-only` | Available for audit and later activation, but absent from host discovery paths. |

## 5. Architecture

```text
User request
  -> VibeTether readiness and authority check
  -> scenario classification
  -> capability lookup
  -> one primary workflow provider
  -> zero or more non-overlapping domain/policy overlays
  -> one approved execution slice
  -> evidence, review, and checkpoint

Explicit init/update only
  -> fetch exact upstream commit
  -> enumerate complete Skill directories
  -> verify license and fingerprints
  -> populate project-local provider catalog
  -> calculate exposure plan from profile + repository evidence
  -> copy exposed Skills to Codex/Claude discovery paths
  -> generate lock and capability board
```

The project-local managed catalog is stored below:

```text
.vibetether/providers/catalog/<source-id>/<skill-name>/
```

It contains complete upstream Skill directories, not rewritten summaries. It is generated content and is added to the VibeTether-managed ignore block. The provider lock records catalog fingerprints separately from exposed-copy fingerprints and ownership.

Exposed copies remain at the existing locations:

```text
.agents/skills/<skill-name>/
.claude/skills/<skill-name>/
```

Copying rather than symlinking preserves current portability and avoids host-specific symlink behavior. Doctor verifies that an exposed copy still matches its cataloged source unless the copy pre-existed and VibeTether does not own it.

## 6. Provider Strategy

### 6.1 Foundation catalogs

The default `standard` profile catalogs the complete Skill inventories of these sources:

1. **obra/superpowers** — primary lifecycle foundation.
2. **mattpocock/skills** — complementary entry, orientation, specification, prototype, handoff, triage, architecture, and productivity capabilities.
3. **multica-ai/andrej-karpathy-skills** — one short policy overlay for assumptions, simplicity, surgical changes, and verifiable goals.

Every source must be pinned to an immutable commit. Tags are display metadata only. Each complete Skill directory and applicable license file receives a deterministic fingerprint before project writes begin.

### 6.2 Superpowers classification

Superpowers remains the preferred provider for overlapping lifecycle capabilities:

- product/design exploration;
- implementation planning;
- plan execution;
- worktree isolation;
- TDD;
- systematic debugging;
- requesting and receiving code review;
- verification before completion;
- branch finish;
- Skill authoring.

All upstream Skills are cataloged. `using-superpowers` is classified as `competing-router`, remains catalog-only, and is never automatically exposed. Other Superpowers Skills are exposed when their dependencies and host compatibility pass validation.

### 6.3 Matt Pocock classification

All Skills in the pinned Matt Pocock release are cataloged. They are classified into four groups:

1. **Complementary auto-route candidates:** codebase orientation, huge-effort wayfinding, prototype, research, domain modeling, architecture design, architecture improvement, and other capabilities that do not duplicate the selected Superpowers primary.
2. **Explicit aliases/orchestrators:** grilling commands, spec capture, task decomposition, implementation orchestration, triage, QA, handoff, and similar user-invoked surfaces. These may be exposed when their upstream invocation metadata prevents implicit competition or when VibeTether supplies an automatic equivalent route.
3. **Alternative providers:** TDD, diagnosis, review, and other capabilities already owned by a preferred Superpowers provider. They remain catalog-only by default and appear as alternatives in the capability board.
4. **Unrelated or profile-specific Skills:** teaching, writing, media, exercises, language support, and other non-default coding domains. They remain catalog-only unless an explicit future profile adopts them.

`ask-matt` is a competing or explicit secondary router. It may remain available only as a user-explicit alias; it cannot be auto-eligible while VibeTether owns entry routing.

The exact classification is registry data, not hard-coded prose. Adding or upgrading a Matt Skill fails validation until the Skill has a declared capability, workflow role, invocation policy, conflict set, exposure rule, and fallback.

### 6.4 Karpathy classification

Karpathy Guidelines is a `policy-overlay`, not a primary workflow. It may be exposed by default for coding, refactoring, and review because it constrains scope and verification without replacing TDD, debugging, planning, UI design, or review.

The overlay cannot authorize implementation, resolve product ambiguity, weaken project instructions, or substitute for a phase exit contract.

### 6.5 Specialist packs

Specialist packs use the same catalog/exposure model but are activated only during explicit initialization, from high-confidence repository evidence or an explicit initialization option. Automatic bundle detection changes only which local Skill instructions are cataloged and exposed; it never performs the production, deployment, migration, or network operations described by those Skills.

#### Web pack

The Web pack catalogs the complete pinned `vercel-labs/agent-skills` inventory and keeps Anthropic's pinned `frontend-design` provider. Exposure is evidence-driven:

- React or Next.js evidence enables React best-practice providers.
- React Native or Expo evidence enables React Native providers.
- Vercel configuration enables Vercel operations and optimization providers.
- User-visible Web UI enables Web design review providers.
- `frontend-design` remains the aesthetic director only when visual direction is needed; it does not replace browser verification or framework engineering rules.

Unrelated Vercel Skills stay cataloged but inactive. A non-Web repository does not fetch the Web pack during ordinary `standard` initialization unless the user explicitly requests it.

#### Production pack

The Production pack uses selected, non-overlapping Skills from the pinned `addyosmani/agent-skills` repository for:

- browser testing with developer tools;
- security and hardening;
- performance optimization;
- CI/CD and automation;
- deprecation and migration;
- observability and instrumentation;
- shipping and launch.

The Addy lifecycle Skills that duplicate the preferred Superpowers flow remain catalog-only alternatives. ECC is a research and comparison source, not a bundled provider in this design, because installing its Skills, hooks, MCP configuration, rules, and agents would introduce another harness surface.

Production-pack exposure requires applicable repository evidence during explicit initialization or an explicit `--bundle production`. High-risk production actions retain VibeTether's user-confirmation gates regardless of provider availability.

## 7. Profile and Activation Model

Existing profiles remain backward compatible:

| Profile | Catalog behavior | Default exposure |
| --- | --- | --- |
| `core` | No external provider catalog or network access. | VibeTether only. |
| `standard` | Complete Superpowers, Matt Pocock, and Karpathy foundation catalogs, plus specialist catalogs selected by high-confidence repository evidence during init. | Preferred lifecycle Skills, complementary Matt Skills, explicit aliases with safe invocation policy, Karpathy overlay, and evidence-matched specialists. |
| `extended` | `standard` plus the complete Web catalog and Anthropic frontend provider even when framework detection is inconclusive. | Evidence-matched Web providers plus the existing UI provider behavior. |

The initializer gains repeatable specialist selection without changing the default:

```text
--bundle web
--bundle production
--no-auto-bundles
```

Unless `--no-auto-bundles` is present, initialization may select Web or Production packs from high-confidence repository evidence such as framework manifests, deployment configuration, CI workflows, migration directories, or observability configuration. Ambiguous evidence does not activate a pack. Dry-run shows every detected signal, source to be fetched, cataloged Skill, exposed Skill, catalog-only Skill, classification, conflict, and reason. Explicit `--bundle` selection overrides missing detection evidence but not compatibility, license, or security validation.

Runtime routing never activates a catalog-only Skill by writing files. If a new task needs an unavailable optional Skill, VibeTether recommends the explicit initialization command and uses the declared built-in or installed fallback in the current session.

## 8. Routing and Precedence

Routing order is:

1. Project instructions and durable truth.
2. VibeTether readiness, authority, risk, and lifecycle control.
3. One primary workflow provider for the current phase.
4. Compatible domain overlays.
5. Compatible policy overlays.
6. Verification and review providers required by the exit contract.
7. Built-in fallback when an optional provider is absent.

Every provider registry entry must declare:

```text
capabilities
phases
workflow_role
invocation_policy
auto_eligible
exposure_policy
project_signals
requires
conflicts_with
supersedes
fallback
required_outputs
exit_evidence
```

The resolver rejects ambiguous automatic routes when two providers have equal priority for the same primary capability. Domain and policy overlays may compose only if neither claims primary ownership and no conflict is declared.

User-explicit invocation remains available when safe. It does not let a lower-level provider override project truth or bypass readiness, high-risk, visual-direction, migration, permission, destructive-data, or release gates.

## 9. Scenario Routing Surface

The public README and an agent-facing `scenario-routing.md` reference will expose the same generated scenario map.

Representative routes include:

| Situation | Capability | Preferred route |
| --- | --- | --- |
| Vague request with missing outcome or success evidence | requirements clarification | model-invokable grilling; explicit grill alias remains available |
| Existing documents or terminology disagree | document alignment | grilling + domain modeling + authority resolution |
| Agent does not understand where a change belongs | codebase orientation | zoom-out or equivalent installed orientation provider |
| Effort is too large for one context window | wayfinding | investigation map before implementation planning |
| Several product or architecture directions are valid | product/design exploration | brainstorming; user approves written direction |
| A runnable experiment is needed to answer a design question | prototype | throwaway prototype with a declared learning goal |
| Discussion must become durable project truth | spec capture | installed spec-capture provider or built-in durable-spec path |
| Approved work must be decomposed across sessions | task decomposition | dependency-aware tracer slices |
| New behavior or a bug fix is ready | implementation discipline | Superpowers TDD primary + Karpathy policy overlay |
| Unexpected behavior lacks a root cause | diagnosis | systematic debugging primary |
| UI direction is unapproved | UI direction | frontend-design only after product intent; one golden screen |
| React/Next/Web UI implementation is approved | Web engineering | primary implementation flow + compatible Vercel domain provider |
| Context was compacted or responsibility changes | handoff/recovery | VibeTether re-anchor + durable handoff provider when useful |
| Issues or feedback need classification | triage/QA | installed Matt intake provider |
| Architecture has become hard to change | architecture improvement | architecture report and approved narrow refactor target |
| Migration, security, CI/CD, or release work begins | production hardening | applicable Addy specialist + mandatory VibeTether high-risk gate |
| Work is about to be called complete | completion | fresh verification, review, and branch/release decision |

Humans see plain-language situations. Agents use the equivalent capability IDs and observable signals. README text and registry data must be generated or contract-tested together so they cannot silently diverge.

## 10. Failure Handling

Initialization stops before project writes when:

- an upstream ref does not resolve to the pinned commit;
- an expected Skill is missing from a complete catalog;
- a Skill or license fingerprint differs;
- a Skill has no classification;
- two exposed Skills collide by install name;
- an automatic route has multiple equal primary providers;
- a dependency is cataloged but not available to an exposed Skill;
- a path escapes the staging, catalog, or host target boundary.

During an active task:

- a missing optional provider produces a visible fallback and optional reconfiguration command;
- a missing required safety or release capability blocks the affected transition;
- a catalog-only provider is never silently exposed;
- modified managed catalog or exposed copies produce a doctor conflict and are not overwritten or removed automatically.

Transactional rollback restores the prior catalog, exposed Skills, lock, board, managed instruction blocks, and license state if any later initialization step fails.

## 11. Compatibility and Migration

Existing `0.2.0` installations migrate through the existing exact-fingerprint path:

1. Preserve pre-existing identical provider Skills without claiming ownership.
2. Build the new catalog and exposure plan in staging.
3. Verify all sources, classifications, conflicts, fingerprints, and licenses.
4. Atomically replace only VibeTether-owned unchanged surfaces.
5. Regenerate the capability board and provider lock with catalog/exposure state.
6. Keep `core` network-free and preserve existing `standard`/`extended` command compatibility.

The legacy `extended` profile remains valid. New bundle flags add capability without requiring users to rewrite existing commands.

## 12. Testing Strategy

Implementation follows test-first development. Required RED scenarios include:

1. Complete-source enumeration detects a missing upstream Skill.
2. A competing router is cataloged but absent from host discovery.
3. Preferred and alternative TDD providers cannot both become automatic primary routes.
4. Karpathy is composed as a policy overlay without becoming primary.
5. A vague request routes to automatic clarification without requiring the user to name `grill-me`.
6. An unfamiliar codebase routes to orientation before planning or editing.
7. A huge effort routes to wayfinding before a one-session implementation plan.
8. A design uncertainty routes to prototype only when the experiment has a learning goal.
9. React/Next evidence exposes applicable Web providers; a non-Web repository does not.
10. Production providers require explicit selection or declared production evidence and never bypass confirmation gates.
11. Dry-run lists cataloged, exposed, alternative, disabled, and conflicting Skills without writes.
12. Repeated initialization is byte-for-byte idempotent.
13. Doctor detects modified catalog and exposed copies separately.
14. Uninstall removes only unchanged VibeTether-owned catalog and exposed copies.
15. A failed late installation restores the previous catalog, lock, board, and active Skills.
16. README scenario examples match registry routes and provider availability.

Static routing tests are necessary but insufficient. The preview evaluation set must add forward scenarios for codebase orientation, huge-effort decomposition, prototype choice, compaction/handoff, React UI routing, production migration, and duplicate-provider pressure. Claims remain preview-level until real long-running Codex and Claude trials show that the router reduces drift without unacceptable overhead.

## 13. Delivery Slices

Implementation must remain separable and reviewable:

1. Catalog schema, classifications, conflicts, and pure validation.
2. Complete foundation-source enumeration and project-local catalog transaction.
3. Exposure planner, profile migration, lock, doctor, and uninstall.
4. Missing scenario capabilities and routes for Matt complementary providers.
5. Karpathy policy-overlay support.
6. Web-pack detection and Vercel/Anthropic routing.
7. Production-pack provider intake and high-risk route integration.
8. README scenario map, agent-facing reference, notices, and deterministic evaluations.
9. Real temporary-project installation, upgrade, rollback, and uninstall evidence.
10. Cross-model forward evaluation before any stronger release claim.

Each slice must preserve a green baseline before the next begins. Provider additions that require new network, permissions, credentials, services, or external writes receive a separate user gate.

## 14. Release Boundary

This design authorizes implementation planning after written-spec approval. It does not authorize publication, deployment, GitHub push, or a stable `1.0.0` effectiveness claim.

The next release must state:

- which repositories are fully cataloged;
- which Skills are exposed by each profile;
- which Skills are catalog-only and why;
- exact commits and licenses;
- the host-level automatic invocation limitation;
- evaluation scope and known overhead;
- the explicit commands required to add optional bundles.
