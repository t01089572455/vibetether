# Providers, Catalogs, and Skill Exposure

Community Skills are specialists; VibeTether remains the project control layer.
Popularity helps discover candidates, but does not authorize installation.
VibeTether does not search GitHub by star count, install arbitrary repositories,
or follow floating revisions during active work.

## Source controls

Every curated provider is pinned to an exact commit. Initialization verifies the
declared inventory, raw Skill fingerprints, and license evidence before copying
content into a project. No provider is downloaded during active work.

| Source | Pinned release or commit | Complete catalog | License evidence |
| --- | --- | ---: | --- |
| `mattpocock/skills` | `v1.1.0` / `d574778f94cf620fcc8ce741584093bc650a61d3` | 38 Skills | MIT full text |
| `obra/superpowers` | `v5.1.0` / `f2cbfbefebbfef77321e4c9abc9e949826bea9d7` | 14 Skills | MIT full text |
| `multica-ai/andrej-karpathy-skills` | `2c606141936f1eeef17fa3043a72095b4765b9c2` | 1 Skill | MIT README declaration |
| `anthropics/skills` | `9d2f1ae187231d8199c64b5b762e1bdf2244733d` | selected `frontend-design` | Apache-2.0 full text |
| `vercel-labs/agent-skills` | `f8a72b9603728bb92a217a879b7e62e43ad76c81` | 9 Skills | MIT README declaration |
| `addyosmani/agent-skills` | `98967c45a42b88d6b8fb3a88b7ff6273920763d6` | 24 Skills | MIT full text |

A README declaration is recorded with a warning when the pinned upstream lacks
the expected complete root license text. VibeTether does not fabricate license
files or relicense provider content. See [Third-party notices](../THIRD_PARTY_NOTICES.md).

## Catalog is not exposure

- **Cataloged:** complete audited content under `.vibetether/providers/catalog/`,
  outside host discovery.
- **Exposed:** a verified copy under `.agents/skills/` or `.claude/skills/`.
- **Automatically eligible:** compatible with one non-conflicting route and the
  upstream invocation policy.
- **Alternative or overlay:** available without taking phase ownership.
- **Catalog-only:** inspectable but outside host discovery.

`standard` catalogs 53 complete upstream Skills and provides 21 exposed Skills.
Catalog-only alternatives remain outside host discovery. Competing
routers such as `using-superpowers`, `ask-matt`, or `using-agent-skills` are not
silently stacked into the same control loop.

## Standard exposed inventory

| Skill | Source | Normal role |
| --- | --- | --- |
| `grilling` | `mattpocock/skills` | Requirements and document-alignment primary |
| `grill-me` | `mattpocock/skills` | Explicit alias; automatic behavior uses `grilling` |
| `grill-with-docs` | `mattpocock/skills` | Explicit alias; automatic behavior combines requirements and domain alignment |
| `domain-modeling` | `mattpocock/skills` | Durable terminology and model decisions |
| `codebase-design` | `mattpocock/skills` | Read-only repository orientation alternative |
| `prototype` | `mattpocock/skills` | Bounded learning experiment alternative |
| `research` | `mattpocock/skills` | Primary-source external research alternative |
| `brainstorming` | `obra/superpowers` | Product and design workflow primary |
| `dispatching-parallel-agents` | `obra/superpowers` | Authorized independent-work delegation |
| `executing-plans` | `obra/superpowers` | One verified plan slice at a time |
| `finishing-a-development-branch` | `obra/superpowers` | Integration and release-choice workflow |
| `receiving-code-review` | `obra/superpowers` | Review-feedback workflow |
| `requesting-code-review` | `obra/superpowers` | Independent review before consequential claims |
| `subagent-driven-development` | `obra/superpowers` | Approved independent slice execution |
| `systematic-debugging` | `obra/superpowers` | Root-cause diagnosis primary |
| `test-driven-development` | `obra/superpowers` | Test-first behavior changes |
| `using-git-worktrees` | `obra/superpowers` | Isolated feature work setup |
| `verification-before-completion` | `obra/superpowers` | Fresh evidence before completion |
| `writing-plans` | `obra/superpowers` | Implementation planning primary |
| `writing-skills` | `obra/superpowers` | Skill creation and revision |
| `karpathy-guidelines` | `multica-ai/andrej-karpathy-skills` | Surgical implementation policy overlay |

## Extended and optional bundles

`extended` adds Anthropic `frontend-design` without replacing VibeTether's
product-direction gate. The `web` bundle catalogs all 9 pinned Vercel Skills and
exposes only repository- or signal-matched Web specialists. The `production`
bundle catalogs all 24 pinned Addy Osmani Skills and exposes only approved
production specialists.

An explicit bundle is an installation decision, not permission to deploy,
migrate data, change secrets, merge, release, or publish.

## Discovery surfaces

| Surface | Purpose |
| --- | --- |
| `.agents/skills/`, `.claude/skills/` | Host discovery of exposed Skills |
| `.vibetether/capabilities.yaml` | Scenarios, triggers, routes, fallbacks, outputs, evidence, availability |
| `.vibetether/providers.lock.yaml` | Repository, commit, fingerprints, licenses, catalog and exposure ownership |
| `.vibetether/providers/catalog/` | Full local audited inventory for deliberate lookup |

`vibetether capabilities --project .` renders the live human-readable board.
Its JSON mode provides deterministic route data for automation.
