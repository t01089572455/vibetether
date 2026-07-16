# VibeTether Provider Collision and Upgrade Preservation Design

Date: 2026-07-16
Status: approved for implementation planning
Audience: VibeTether maintainers and contributors

## 1. Context

VibeTether initialization currently protects a different or modified installed Skill by refusing to overwrite it. That is the correct data-safety default, but one optional provider collision aborts the entire installation. A beginner can therefore lose the benefit of every non-conflicting reviewed Skill because one project-local Skill happens to use the same install name.

Upgrade behavior must also distinguish user-owned data from VibeTether-managed projections. Treating every control-plane file as immutable would prevent schema and routing upgrades. Treating every file as generated would risk overwriting project truth, checkpoints, experience, custom routes, or user Skills.

This change introduces an explicit preservation and collision contract:

- user-owned data and Skills are never overwritten or deleted by an ordinary upgrade;
- bounded or structured VibeTether artifacts may update only through their declared ownership rules;
- a different same-name optional Skill is preserved and isolated instead of aborting unrelated provider installation;
- an unverified same-name Skill is never represented as the reviewed provider;
- core identity, path safety, and transactional recovery remain fail-closed.

## 2. Goals

1. Let `vibetether init` finish installing non-conflicting optional providers when a different same-name Skill already exists.
2. Preserve user-created, user-downloaded, or user-modified Skills byte-for-byte.
3. Prevent VibeTether from claiming provenance, routing eligibility, or uninstall ownership for an unverified same-name Skill.
4. Preserve project truth, intent, experience, checkpoints, custom routes, and host instructions according to their declared ownership model during upgrades.
5. Give beginners one clear summary and recovery path instead of a fatal error for every optional name collision.
6. Keep core VibeTether identity conflicts, unsafe paths, symlinks, unknown cache state, and transactional failures fail-closed.

## 3. Non-Goals

- Do not merge two same-name Skill directories.
- Do not silently rename a reviewed provider to a new install name.
- Do not automatically treat a user's same-name Skill as an approved substitute.
- Do not automatically add an unreviewed Skill to project routing.
- Do not make `.vibetether/capabilities.yaml` a user-editable source of truth.
- Do not weaken provider commit, fingerprint, license, path, or source verification.
- Do not delete user data to make an upgrade succeed.
- Do not add a background repair service or terminate processes that hold files open.

## 4. Ownership Model

### 4.1 User-owned artifacts

Ordinary initialization and version upgrades must not overwrite or delete:

- confirmed and candidate entries in `.vibetether/TRUTH.md`;
- user-authored content in `.vibetether/intent.md`;
- reusable experience in `.vibetether/experience-index.yaml`;
- project routes in `.vibetether/routes.local.yaml`;
- user-created or user-downloaded Skills;
- user content outside the VibeTether managed block in `AGENTS.md` or `CLAUDE.md`;
- runtime evidence already recorded in `.vibetether/state/route-handshake.yaml`.

An explicit user operation may intentionally edit one of these artifacts, but a version upgrade alone does not authorize such a change.

### 4.2 Bounded managed artifacts

`AGENTS.md` and `CLAUDE.md` contain a VibeTether-owned marked block. Upgrade may replace only a recognized current or registered legacy managed block. Bytes outside that block remain unchanged. If the managed block has unknown modifications, the core upgrade stops rather than overwriting it.

### 4.3 Structurally merged artifacts

`.vibetether/project.yaml` and `.vibetether/state/current.yaml` may receive required compatibility fields. The merger must preserve:

- unknown project extension fields;
- confirmed source routes and project gates;
- user decisions, evidence, assumptions, and current work state;
- existing harness configuration unless the user explicitly changes the requested harnesses.

Serialization changes are acceptable only when a managed schema migration is required. Semantic user data must remain intact.

### 4.4 Runtime-owned artifacts

`.vibetether/state/route-handshake.yaml` is maintained by the route lifecycle, not by initialization. `init` must not replace its current route evidence.

### 4.5 Generated projections

`.vibetether/capabilities.yaml` and `.vibetether/providers.lock.yaml` are generated projections and may be regenerated from verified registry, installation, and collision state.

Users extend routing through `.vibetether/routes.local.yaml`; direct edits to the generated capability board are not a supported customization mechanism.

### 4.6 Versioned core artifacts

`.vibetether/bin/vibetether.mjs` and the installed core `vibe-tether` Skill may upgrade only from a recognized canonical current or legacy identity. Unknown or modified core content remains untouched and blocks the core upgrade.

### 4.7 Internal provider cache

`.vibetether/providers/catalog/` is a VibeTether internal verified cache, not a host Skill customization directory. An unknown or modified catalog copy must not be skipped as though it were a harmless user collision. Initialization stops with a cache recovery instruction because routing provenance depends on that cache.

## 5. Optional Provider Collision Policy

For every selected optional provider and enabled harness, initialization classifies the target path into one of these states:

| State | Condition | Action |
| --- | --- | --- |
| `missing` | Target directory does not exist | Install the reviewed provider and record VibeTether ownership |
| `verified-preexisting` | Target fingerprint exactly matches the reviewed provider | Reuse it and record `preexisting` ownership |
| `verified-managed` | Target matches the current locked reviewed provider owned by VibeTether | Retain or upgrade through the registered provider lifecycle |
| `different-preexisting` | Target is a safe regular Skill directory but fingerprint differs | Preserve it, skip this reviewed provider for this harness, and continue |
| `modified-managed` | The lock previously claimed VibeTether ownership but the target now differs | Preserve it, relinquish VibeTether uninstall ownership, record a collision, and continue |
| `unsafe` | Symlink, path escape, non-directory target, unreadable tree, or unverifiable filesystem state | Stop initialization without changing the target |

`different-preexisting` and `modified-managed` are optional-provider name collisions, not successful installations.

The core `vibe-tether` Skill does not use the optional collision policy. An unknown core identity remains a blocking conflict because initialization cannot safely continue with an unverified control Skill.

## 6. Collision Records

The provider lock remains the machine-readable source for reviewed provider provenance. An active exposure may contain harness-specific collision records in addition to verified installations:

```yaml
schema_version: 2
exposures:
  - id: frontend-design
    install_name: frontend-design
    active: true
    installations:
      claude:
        path: .claude/skills/frontend-design
        ownership: vibetether
    collisions:
      codex:
        path: .agents/skills/frontend-design
        reason: different-preexisting-skill
        preserved: true
```

Allowed collision reasons are:

- `different-preexisting-skill`;
- `modified-managed-skill`.

A collision record:

- identifies only the safe project-relative target path and public reason;
- does not store the unreviewed Skill's contents;
- does not claim its fingerprint as the reviewed fingerprint;
- never grants VibeTether uninstall ownership;
- is removed automatically when the reviewed provider is later verified or installed at that harness path;
- is retained only while the provider remains selected or while required to relinquish prior managed ownership safely.

The lock builder must not merge a stale prior installation back into a harness that is now represented by a collision. Collision state explicitly suppresses stale installation inheritance.

## 7. Capability Board and Routing Semantics

Only a verified installation of the reviewed provider makes that provider available in a harness.

The generated capability board reports:

- `eligible` when every enabled harness has a verified reviewed installation;
- `partially-available` when at least one enabled harness is verified and at least one has a collision or missing installation;
- `blocked-by-name-collision` when no enabled harness has the reviewed provider and at least one has a collision;
- `inactive-not-recommended` when the provider is no longer active.

Provider entries may expose a bounded collision summary:

```yaml
selection_status: blocked-by-name-collision
available_in: []
blocked_in:
  codex: different-preexisting-skill
```

Routes continue to recommend the reviewed provider only where it is verified as available. When unavailable in the active harness, the resolver uses an available declared alternative or the capability's built-in fallback and records the material selection reason.

A preserved same-name user Skill remains discoverable by its host, but VibeTether does not automatically route to it as the reviewed provider. The user may inspect it and add a project-owned route through `vibetether customize` or `.vibetether/routes.local.yaml`.

## 8. CLI Experience

### 8.1 Non-interactive default

`--yes` uses the beginner-safe deterministic default:

1. preserve a safe different same-name optional Skill;
2. skip only that reviewed provider installation for the affected harness;
3. install every other non-conflicting provider;
4. regenerate lock and capability projections honestly;
5. print one consolidated warning section.

Example:

```text
VibeTether initialized <project> for codex using the extended profile
with 36 of 37 reviewed provider Skills available.

Preserved Skill name collisions:
- .agents/skills/frontend-design
  Existing content differs from the reviewed frontend-design provider.
  It was preserved and was not added as the reviewed route.

The declared fallback remains available.
Run `node .vibetether/bin/vibetether.mjs customize --project .`
to review and route an existing project Skill.
```

Warnings must avoid raw stack traces and must not imply that the preserved Skill is defective.

### 8.2 Dry run

`--dry-run` reports planned installs, verified reuse, and preserved collisions. Optional collisions do not make the dry run fail. Unsafe filesystem state, core conflicts, invalid control artifacts, and corrupted internal cache still fail.

### 8.3 Interactive mode

The initial implementation keeps the deterministic preserve-and-skip behavior for optional collisions. It does not add a per-Skill prompt loop, because a large bundle could contain many collisions and interactive replacement would enlarge the destructive-action surface.

The warning explains the two explicit follow-up paths:

- keep the existing Skill and optionally add a reviewed project-local route;
- back up or remove the existing directory, then rerun the same init command to install the reviewed provider.

An explicit future conflict-resolution command may add guided replacement, but it is outside this slice.

## 9. Upgrade and Uninstall Safety

Upgrade and uninstall behavior must satisfy these invariants:

1. A target classified as `different-preexisting` is never renamed, copied over, normalized, or deleted.
2. A target classified as `modified-managed` is preserved and no longer treated as VibeTether-owned for uninstall.
3. An identical preexisting provider remains `preexisting` and is never deleted by uninstall.
4. Only a currently verified installation with `ownership: vibetether` may be removed by uninstall.
5. A provider collision in one harness does not remove or hide a verified provider in another harness.
6. Removing a conflicting directory and rerunning init installs the reviewed provider and clears the collision record.
7. Profile downgrade retains only the ownership metadata needed to remove verified VibeTether-managed inactive providers; it does not retain stale ownership for a modified or collided target.
8. Failed initialization rolls back generated files and newly installed providers without touching preserved collision targets.
9. Existing project truth, intent, experience, routes, and route-handshake evidence remain unchanged by an ordinary upgrade.

## 10. Doctor Behavior

Doctor validates collision records and reports:

- `optional-provider-name-collision` as a warning when a safe preserved collision makes an optional provider unavailable;
- `modified-managed-provider-preserved` as a warning when ownership was relinquished after user modification;
- invalid collision paths, unsupported reasons, simultaneous installation and collision for one harness, or unsafe target types as issues;
- an unavailable selected route as an issue at the applicable route or completion boundary;
- the provider summary using verified availability, not raw same-name directory presence.

Doctor must not require the preserved user Skill to match the reviewed provider fingerprint. It verifies only that the collision record is structurally safe and that VibeTether does not claim the path as a reviewed installation.

## 11. Transaction Order

Initialization uses this order:

1. validate project-owned and managed control artifacts without writing;
2. recover any pending core Skill transaction;
3. verify the core VibeTether Skill plan;
4. stage or reuse pinned provider sources;
5. classify every optional host installation target and internal catalog target;
6. construct the complete installation, collision, lock, board, and warning plan;
7. apply core, provider, lock, board, and compatible control changes transactionally;
8. roll back VibeTether writes on failure while leaving collision targets untouched;
9. run the ordinary doctor baseline and print the consolidated result.

No provider target is mutated during classification.

## 12. Compatibility

- Projects with no conflicts retain byte-for-byte idempotent provider-aware initialization.
- Existing lock files without `collisions` remain valid.
- Existing identical preinstalled Skills continue to be reused as `preexisting`.
- Existing provider bundles, profiles, route IDs, and fallbacks do not change merely because collision metadata is introduced.
- Existing custom routes continue to read from `.vibetether/routes.local.yaml`.
- Existing generated capability boards are regenerated to the new honest availability state.
- Current core conflict and Windows active-directory recovery behavior remains unchanged.

## 13. Verification Strategy

Implementation uses test-driven development.

### 13.1 Provider classification

- missing target installs normally;
- identical preexisting target is reused without ownership;
- different safe preexisting target returns a collision classification without writes;
- previously managed but modified target returns a collision and relinquishes ownership;
- symlink, traversal, non-directory, unreadable, and failed-fingerprint states remain fatal;
- core VibeTether unknown identity remains fatal.

### 13.2 Multi-provider initialization

- one collision does not block other providers;
- multiple collisions produce one consolidated result;
- Codex collision plus valid Claude installation produces `partially-available`;
- collisions in both harnesses produce `blocked-by-name-collision`;
- dry run previews collisions and remaining installs.

### 13.3 Lock and board

- collision records suppress stale prior installation inheritance;
- installation and collision cannot coexist for the same provider and harness;
- provider availability counts only verified installations;
- routes use alternatives or fallback when the reviewed provider is unavailable;
- a later successful install removes the collision record.

### 13.4 Upgrade preservation

Before and after an ordinary version upgrade, assert exact bytes or equivalent declared semantics for:

- `AGENTS.md` and `CLAUDE.md` outside managed blocks;
- `.vibetether/intent.md`;
- `.vibetether/TRUTH.md`;
- `.vibetether/project.yaml` custom fields and confirmed routes;
- `.vibetether/state/current.yaml` user decisions and evidence;
- `.vibetether/state/route-handshake.yaml`;
- `.vibetether/experience-index.yaml`;
- `.vibetether/routes.local.yaml`;
- every preserved conflicting Skill.

The local CLI and recognized managed blocks may update only through their existing compatibility contracts.

### 13.5 Uninstall and rollback

- uninstall removes only currently verified VibeTether-owned providers;
- uninstall preserves identical preexisting, different preexisting, and modified formerly managed Skills;
- failure after some non-conflicting providers install rolls them back while collision targets remain byte-identical;
- profile changes and repeated init do not resurrect stale ownership.

### 13.6 Public acceptance

- full test and static-evaluation suites;
- package audit and Skill self-validation;
- clean first install and repeated idempotent upgrade;
- disposable projects covering Codex-only, Claude-only, and both-harness collisions;
- remote-package installation from the documented GitHub Codeload command;
- Windows and Ubuntu CI on supported Node versions.

## 14. Acceptance Criteria

The change is complete only when:

1. A different same-name optional Skill is preserved byte-for-byte and no longer aborts unrelated provider installation by default.
2. VibeTether never reports the preserved Skill as the reviewed provider.
3. A formerly managed provider modified by the user loses VibeTether uninstall ownership before any future uninstall.
4. Capability and route availability reflect only verified reviewed installations.
5. A collision in one harness does not prevent verified installation in another harness.
6. Removing the collision and rerunning init installs the reviewed provider without manual lock-file editing.
7. Unsafe paths, unknown core identities, corrupted internal catalogs, and transaction failures remain fail-closed.
8. Ordinary upgrades preserve all user-owned project control data and custom Skills.
9. Regression, package, published-package, and cross-platform evidence passes.
