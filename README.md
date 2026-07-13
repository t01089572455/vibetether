# VibeTether

> Keep coding agents tethered to project truth.

[![CI](https://github.com/t01089572455/vibetether/actions/workflows/ci.yml/badge.svg)](https://github.com/t01089572455/vibetether/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Preview](https://img.shields.io/badge/release-0.2.0%20preview-orange.svg)](#preview-status)

VibeTether is a project-local control Skill and advisory Skill router for long-running coding work. It helps capable agents keep the approved goal, project rules, current slice, and required evidence visible after context compaction, handoffs, phase changes, and repeated corrections.

Users do not need to memorize community Skill names. VibeTether checks whether the task is ready, infers observable scenario signals, recommends one installed specialist plus compatible overlays and alternatives, and keeps a safe built-in fallback. Product direction and high-risk decisions still belong to the user; low-risk, reversible technical work remains autonomous.

## Quick start

### 1. Install only the portable Skill

Use this if you want VibeTether's control method without changing project instructions or fetching community providers:

```sh
npx skills add t01089572455/vibetether --skill vibe-tether
```

### 2. Preview a full project installation

Run this from the project you want to control:

```sh
npx --yes github:t01089572455/vibetether init --agent both --profile standard --dry-run
```

The dry-run is network-free for provider content and writes nothing. Review the exact project files, provider catalogs, exposures, and license operations before applying them.

### 3. Initialize Codex and Claude Code

```sh
npx --yes github:t01089572455/vibetether init --agent both --profile standard --yes
```

The `standard` profile audits and catalogs 53 complete upstream Skills at exact commits, while only 21 exposed Skills enter Codex or Claude discovery. Competing routers and unrelated specialists stay outside host discovery.

### 4. Verify and inspect

```sh
npx --yes github:t01089572455/vibetether doctor --project . --json
npx --yes github:t01089572455/vibetether capabilities --project .
```

Ask the router for a deterministic decision:

```sh
npx --yes github:t01089572455/vibetether capabilities --project . --phase DISCOVER --capability requirements-clarification --signal goal-unclear --agent codex --json
```

### 5. Update or repair

Run the same `init` command again. Re-running `init` is the update and repair workflow: unchanged installations are byte-for-byte idempotent, new catalog plans are verified before writes, and modified managed copies stop for review.

### 6. Preview or apply uninstall

```sh
npx --yes github:t01089572455/vibetether uninstall --dry-run
npx --yes github:t01089572455/vibetether uninstall --project . --yes
```

Uninstall removes only unchanged VibeTether-owned files and managed instruction blocks. It preserves the Intent Contract, user documents, runtime checkpoint, backups, and every Skill that existed before VibeTether.

## How automatic routing works

VibeTether separates automatic readiness from advisory provider choice:

1. At task entry, phase transitions, consequential actions, resume, or compaction recovery, the agent rereads the project manifest and applicable truth.
2. It classifies missing information as discoverable fact, user-owned direction, structural decision, or local reversible technique.
3. It infers observable signals from the request, repository, lifecycle state, and current evidence.
4. The project board returns a `primary` recommendation, compatible `overlays`, ordered `alternatives`, a `fallback`, required outputs, and exit evidence.
5. The agent uses the recommendation when it fits, or records why another installed path is better. No provider is downloaded during active work.
6. High-risk gates remain mandatory regardless of which provider is selected.

```mermaid
flowchart LR
    U["User request"] --> K["VibeTether control kernel"]
    T["Project truth and checkpoint"] --> K
    K --> W{"Work ready?"}
    W -->|"Investigate facts"| F["Bounded read-only discovery"]
    W -->|"User decision"| Q["One recommended question"]
    W -->|"Ready"| R["Capability board"]
    R --> P["Primary Skill"]
    R --> O["Compatible overlays"]
    R --> A["Alternatives or built-in fallback"]
    P --> E["Execute one approved slice"]
    O --> E
    A --> E
    E --> V["Fresh verification and checkpoint"]
    V --> K
```

Implementation waits for `READY_FOR_IMPLEMENT_ONE`. A clear, low-risk task can pass in one compact check. A vague request routes to clarification automatically; the user does not need to type `grill-me` or know that it exists.

The router is explainable, not coercive. A JSON resolution includes detected signals, rationale, live harness availability, primary, overlays, alternatives, fallback, required outputs, exit evidence, and any confirmation gate. VibeTether cannot guarantee that every host model invokes a Skill before every step; initialized project instructions and broad Skill metadata make the route visible, while host behavior remains host-controlled.

## Profiles and bundles

| Profile | Catalog and exposure behavior | Network boundary |
| --- | --- | --- |
| `core` | VibeTether plus the full built-in capability board; no community catalog or provider exposure | No provider network access |
| `standard` | Complete Matt Pocock, Superpowers, and Karpathy catalogs; 21 exposed Skills | Fetches pinned sources during explicit `init` |
| `extended` | Standard plus Anthropic `frontend-design` | Fetches the additional pinned Anthropic source |

Optional bundles add complete catalogs and expose only applicable specialists:

| Bundle | Complete catalog | Automatically detected evidence | Exposed specialists |
| --- | --- | --- | --- |
| `web` | 9 Vercel Skills | React, Next.js, React Native, Expo, or `vercel.json` | Matching React, React Native, Web verification, Vercel, and performance specialists |
| `production` | 24 Addy Osmani Skills | GitHub Actions or a recognized migration directory | Matching CI/CD or migration specialists; explicit selection exposes the seven approved production specialists |

Force one or both bundles:

```sh
npx --yes github:t01089572455/vibetether init --profile standard --bundle web --yes
npx --yes github:t01089572455/vibetether init --profile standard --bundle production --yes
npx --yes github:t01089572455/vibetether init --profile standard --bundle web --bundle production --yes
```

Disable repository-evidence bundle selection:

```sh
npx --yes github:t01089572455/vibetether init --profile standard --no-auto-bundles --yes
```

An explicit bundle is an install-time decision, not permission to deploy, migrate data, change secrets, or publish. Those actions keep their separate user gates.

## When should I use what?

The agent-facing version of this table is contract-linked to [`registry/scenarios.json`](registry/scenarios.json) and installed with the Skill.

| Scenario ID | Plain-language situation | Recommended path |
| --- | --- | --- |
| `vague-project` | Goal, scope, or acceptance is unclear | `grilling`, then a user-owned Intent Contract |
| `document-conflict` | The request and durable project sources disagree | Document alignment and authority resolution; stop if unresolved |
| `unfamiliar-codebase` | Repository entry points are unclear | `codebase-design` before planning or editing |
| `huge-effort` | Work spans many workstreams or context windows | Built-in milestone/checkpoint wayfinding; catalog-only `wayfinder` remains visible |
| `prototype-choice` | A bounded experiment can answer costly uncertainty | `prototype` with a learning goal and discard boundary |
| `new-behavior` | One approved slice adds behavior | VibeTether execution primary plus `karpathy-guidelines` policy overlay |
| `bug-diagnosis` | Behavior is unexpected and cause is unknown | `systematic-debugging` before a fix |
| `ui-direction` | Visual direction is not approved | UI Intent Contract and golden screen; `frontend-design` in `extended` |
| `web-implementation` | Approved React, Next.js, React Native, or Vercel work | Highest-priority matching Web specialist |
| `compaction-handoff` | Context was compacted, resumed, or handed off | Full VibeTether re-anchor before action |
| `triage-qa` | Several issues need reproduction and priority | Built-in evidence-first triage; catalog alternatives remain visible |
| `architecture-improvement` | Structural friction suggests a durable change | Evidence-led recommendation, then user confirmation |
| `production-migration` | A migration or deprecation is proposed | `deprecation-and-migration` plus destructive-data gate |
| `completion` | The agent is about to claim completion | `verification-before-completion` with fresh evidence |

## Walkthroughs

### A vague new project

The user says, "Build me a customer portal." VibeTether detects `goal-unclear` and `scope-unclear`, investigates facts already present in the repository, and routes to model-invokable `grilling`. It asks only decisions the user owns, one at a time, with a recommendation. No product implementation starts until goal, boundaries, success evidence, and the first slice are explicit.

### An unfamiliar codebase

The task is clear, but the agent cannot name the relevant entry points. The `unfamiliar-codebase` route selects `codebase-design` for a read-only map. If external facts are also uncertain, `research` can run as a separate specialist. If a design question is cheaper to test than debate, `prototype-choice` selects a bounded throwaway experiment.

### A long or compacted task

After compaction or handoff, `compaction-handoff` does not trust the summary alone. It reloads the manifest, applicable project truth, checkpoint, repository state, current slice, and missing evidence. For `huge-effort`, the built-in milestone map keeps one current frontier and resumable checkpoints; upstream explicit wayfinding and handoff commands remain searchable catalog alternatives.

### UI direction and implementation

`ui-direction` first locks product goal, page type, information hierarchy, interaction states, brand constraints, and one representative golden screen. Visual direction requires user approval before propagation. Only then does `web-implementation` select a React, Next.js, React Native, or Web specialist. Browser behavior and visual similarity are verified separately.

```mermaid
flowchart LR
    G["Product goal"] --> I["UI Intent Contract"]
    I --> S["Golden screen"]
    S --> A{"User approves?"}
    A -->|"No"| I
    A -->|"Yes"| C["Components and states"]
    C --> B["Browser verification"]
    B --> F["Functional verdict"]
    B --> V["Visual verdict"]
```

### Bug diagnosis

`bug-diagnosis` routes to `systematic-debugging`: reproduce, isolate, form discriminating hypotheses, identify root cause, then implement the smallest correction with regression evidence. A test failure is evidence, not automatic permission for a broad rewrite.

### Release or migration

`production-migration` can recommend the Addy migration specialist, but it cannot approve destructive data work. Release preparation can recommend `shipping-and-launch`; publication still requires fresh verification and explicit user confirmation. Provider choice never weakens migration, permission, security, privacy, merge, deploy, release, or publish gates.

## Catalog vs exposure

VibeTether deliberately separates five concepts:

- **Cataloged**: the complete audited Skill directory is stored under `.vibetether/providers/catalog/` for local inventory and routing metadata. It is ignored by Git and outside host Skill discovery.
- **Exposed**: a verified copy is installed under `.agents/skills/` or `.claude/skills/`, where the selected host can discover it.
- **Automatically eligible**: the upstream Skill permits model invocation and VibeTether has a non-conflicting route for the current signals.
- **Alternative or overlay**: the Skill can support a primary workflow without taking phase ownership. Karpathy guidance is a policy overlay, not a workflow router.
- **Catalog-only or explicit-only**: the Skill remains searchable but is not silently invoked. VibeTether supplies an automatic built-in equivalent when appropriate.

Complete catalogs do not mean "run everything." Stacking several workflow owners increases trigger collisions and context cost. VibeTether therefore does not expose competing router Skills such as `using-superpowers`, `ask-matt`, or `using-agent-skills`. Their repositories are still fully cataloged.

Upstream command aliases are handled honestly. `grill-me` is an explicit alias, while its behavior is automatically covered by model-invokable `grilling`. `grill-with-docs` is covered by `grilling` plus `domain-modeling`. Upstream `wayfinder`, `handoff`, and `triage` remain catalog alternatives when their metadata does not permit implicit invocation; novice-facing automatic routes use VibeTether's safe equivalent instead of pretending the literal command ran.

## Codex and Claude

The same router supports both project harnesses:

| Harness | Instruction surface | Entry Skill | Provider exposure |
| --- | --- | --- | --- |
| Codex | `AGENTS.md` managed block | `.agents/skills/vibe-tether/` | `.agents/skills/` |
| Claude Code | `CLAUDE.md` managed block | `.claude/skills/vibe-tether/` | `.claude/skills/` |

Generated project surfaces:

```text
.vibetether/project.yaml          Project truth index, profile, bundles, and detected evidence
.vibetether/intent.md             Durable user-owned Intent Contract
.vibetether/capabilities.yaml     Scenarios, capabilities, routes, availability, and fallbacks
.vibetether/providers.lock.yaml   Exact sources, catalog/exposure state, fingerprints, and ownership
.vibetether/licenses/             Verified full license text when available
.vibetether/providers/catalog/    Complete local upstream catalogs; outside host discovery
.vibetether/state/current.yaml    Local resumable checkpoint; ignored by Git
```

VibeTether edits only its marked instruction blocks and creates a backup before the first instruction-file change. Existing project instructions remain authoritative. The managed block tells the agent to consult the board and reassess readiness before consequential work and after re-anchor boundaries.

The installed offline resolver needs no network:

```sh
node .agents/skills/vibe-tether/scripts/resolve-route.mjs --project . --phase PLAN --capability planning --signal multi-step-change --agent codex
node .claude/skills/vibe-tether/scripts/resolve-route.mjs --project . --phase VERIFY --capability completion-verification --signal about-to-claim-complete --agent claude
```

## Command reference

Show supported commands and flags:

```sh
npx --yes github:t01089572455/vibetether --help
```

Common operations:

```sh
# Offline provider-free project control
npx --yes github:t01089572455/vibetether init --agent codex --profile core --yes

# Standard setup with automatic repository-evidence bundles
npx --yes github:t01089572455/vibetether init --agent both --profile standard --yes

# Full dashboard or one JSON route
npx --yes github:t01089572455/vibetether capabilities --project .
npx --yes github:t01089572455/vibetether capabilities --project . --phase EXECUTE_ONE --capability frontend-engineering --signal react --agent codex --json

# Health check
npx --yes github:t01089572455/vibetether doctor --project . --json

# Safe removal preview and apply
npx --yes github:t01089572455/vibetether uninstall --project . --dry-run
npx --yes github:t01089572455/vibetether uninstall --project . --yes
```

Stable exit codes are `2` for invalid CLI input, `3` for a project conflict, and `4` for a failed health check.

## Upgrade and repair

Run `init` again with the desired profile, harnesses, and bundles. The installer:

1. scans repository evidence without changing files;
2. resolves the complete catalog and smaller exposure plan;
3. fetches exact commits only for non-core operations;
4. verifies every expected Skill directory, fingerprint, and license-evidence record in staging;
5. refuses undeclared upstream Skills or changed declared-license text;
6. applies catalog, exposures, lock, board, licenses, and managed instructions atomically;
7. preserves pre-existing identical Skills without claiming ownership.

Use `--dry-run` first when changing profiles or bundles. A profile downgrade keeps inactive ownership records so a later uninstall can still remove unchanged VibeTether-owned copies safely.

## Troubleshooting

### `doctor` reports a changed managed Skill

VibeTether will not overwrite or remove the modified copy. Back up the customization, compare it with the pinned upstream version, then either restore the managed fingerprint or move the customization to a user-owned Skill name before re-running `init`.

### A provider is unavailable during a task

Run `capabilities` again so live installation paths are refreshed. Optional providers fall back to the declared built-in path. Do not download a new provider in the middle of active work; reconfigure it through a reviewed `init` operation.

### The expected Web or Production specialist was not exposed

Inspect `bundle_signals` in `.vibetether/project.yaml`. Use `--bundle web` or `--bundle production` for an explicit install-time choice. Use `--no-auto-bundles` when repository evidence should not control bundle selection.

### Initialization stops on license evidence

This is intentional. A missing full license, changed README declaration, unexpected Skill directory, wrong commit, or fingerprint mismatch stops before project writes. Review the pinned source and update registry evidence in a new audited release; do not bypass the check locally.

### Project instructions contain a managed-block conflict

VibeTether edits only exact marked blocks. Preserve the user text, repair duplicate or reversed markers manually, and re-run `init --dry-run`. It will not guess which conflicting block should win.

### I only want the control loop

Use `--profile core`. Provider fetching is disabled for that initialization path. The initial `npx` acquisition may still require the package source unless it is already cached.

## Provider provenance and licensing

All provider sources are pinned to exact commits. VibeTether verifies the declared complete inventory and per-Skill fingerprints before copying anything into a project.

| Source | Pinned release or commit | Catalog | License evidence mode |
| --- | --- | ---: | --- |
| `mattpocock/skills` | `v1.1.0` / `d574778f94cf620fcc8ce741584093bc650a61d3` | 38 complete Skills | MIT `full-text` |
| `obra/superpowers` | `v5.1.0` / `f2cbfbefebbfef77321e4c9abc9e949826bea9d7` | 14 complete Skills | MIT `full-text` |
| `multica-ai/andrej-karpathy-skills` | `2c606141936f1eeef17fa3043a72095b4765b9c2` | 1 complete Skill | MIT `readme-declaration` |
| `anthropics/skills` | `9d2f1ae187231d8199c64b5b762e1bdf2244733d` | selected `frontend-design` | Apache-2.0 `full-text` |
| `vercel-labs/agent-skills` | `f8a72b9603728bb92a217a879b7e62e43ad76c81` | 9 complete Skills | MIT `readme-declaration` |
| `addyosmani/agent-skills` | `98967c45a42b88d6b8fb3a88b7ff6273920763d6` | 24 complete Skills | MIT `full-text` |

`full-text` means the pinned source contains a full license file whose exact hash is verified and whose text can be installed under `.vibetether/licenses/`. `readme-declaration` means the upstream repository declares the license in a pinned README but does not provide the expected full license file at that commit. VibeTether verifies the README hash and exact declaration, records a visible warning and provenance in the lock, does not fabricate license text, and does not embed that provider content in the npm package.

Provider content is fetched only during an explicit non-core `init`. It remains governed by its upstream license and is not relicensed by VibeTether. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Agent support and limitations

| Agent harness | Status | Control surfaces |
| --- | --- | --- |
| Codex | Official preview | Project Skill, `AGENTS.md`, board, offline resolver |
| Claude Code | Official preview | Project Skill, `CLAUDE.md`, board, offline resolver |
| Other Agent Skills hosts | Portable Skill; not release-tested | Host-dependent discovery and routing |

Project instructions are a behavioral control layer, not a security sandbox. VibeTether does not add privileged hooks, MCP servers, telemetry, deployment access, or remote execution. It reduces the risk and propagation cost of drift; it cannot guarantee zero drift, correct user decisions, provider quality, or host-level automatic invocation.

## Preview status

This is a **0.2.0 preview**. The repository includes deterministic contract, lifecycle, catalog, license, routing, rollback, and scenario-matrix tests plus 13 static drift-pressure scenarios. Those static checks are **not independent agent forward tests** and cannot justify a stable `1.0.0` effectiveness claim.

A three-role comparative adjudication in the development session scored synthetic next-action responses. The VibeTether-enabled run scored **30/30**, versus **24/30** for an already strong baseline, with **35.0%** more words. The observed gain was explicit re-anchor, checkpoint, authority, and functional-versus-visual acceptance discipline. This is preview evidence from a synthetic response trial, not a real multi-hour Codex and Claude project trial. Read the [evaluation report](evals/results/preview-evaluation.md), [run metadata](evals/results/run-metadata.json), and [honesty boundary](evals/README.md).

## Personal acceptance tour

After cloning the repository, run the offline tour:

```sh
npm ci
npm run acceptance:tour
```

The tour creates a temporary project, initializes the `core` profile for Codex, runs `doctor`, prints the capability dashboard, repeats initialization to exercise idempotence, previews uninstall, applies uninstall, and removes the temporary directory. It does not fetch provider repositories.

For a manual provider tour in a disposable project, preview before applying:

```sh
npx --yes github:t01089572455/vibetether init --project ./vibetether-smoke --agent both --profile standard --bundle web --dry-run
```

Then replace `--dry-run` with `--yes`, run `doctor` and `capabilities`, inspect the generated board and lock, re-run the same `init`, and finish with `uninstall --dry-run`. Standard and bundle tours fetch pinned upstream repositories.

## Community basis

VibeTether is an original control kernel informed by recurring practice in [Superpowers](https://github.com/obra/superpowers), [Matt Pocock's Skills](https://github.com/mattpocock/skills), [GitHub Spec Kit](https://github.com/github/spec-kit), [OpenSpec](https://github.com/Fission-AI/OpenSpec), [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD), [Anthropic Skills](https://github.com/anthropics/skills), Vercel's agent Skills, Addy Osmani's engineering Skills, and Karpathy-style guidance: persistent specifications, small slices, explicit authority, primary-source evidence, screenshot comparison, structured handoffs, and verification before claims.

Popularity was used for discovery, not as proof of fit. Each cataloged Skill is classified by role, invocation policy, exposure, conflicts, fallback, outputs, and exit evidence. No upstream provider becomes project authority.

## Development

Node.js 20 or newer is required.

```sh
npm ci
npm test
npm run eval
npm run acceptance:tour
npm run check
npm pack --dry-run
```

Use `npm run audit:provider -- --help` to inspect the deterministic provider-audit interface. Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing routing, catalog, adapter, or lifecycle contracts. Report security issues through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
