# VibeTether 1.0.0-rc.3

> Even strong coding agents can drift during long-running work.

VibeTether is a lean control kernel and Skill broker for long-running Codex and Claude Code projects. It helps a cooperating Agent preserve the approved goal, reload only applicable project truth, execute one bounded slice, select one suitable Skill without preloading an entire catalog, attach evidence to the actual Git worktree, and distrust stale operational experience.

VibeTether does **not** replace the Agent's engineering judgment. It controls direction, authority, scope, worktree identity, evidence, and reusable procedure at the moments where drift becomes expensive.

## Why it exists

Long tasks fail in recurring ways even when the model is capable:

- a specification exists but stops governing after compaction or handoff;
- implementation starts from a guessed goal or acceptance criterion;
- a useful Skill exists, but the user does not know its name;
- a visual, architecture, data, permission, or release decision is silently improvised;
- a workflow succeeded once, was recorded incorrectly, or later became stale;
- a new Git worktree isolates code but loses or overwrites the controlling state;
- completion is claimed from a summary rather than fresh evidence.

VibeTether 1.0.0-rc.3 maps those failures to six bounded mechanisms:

1. a user-owned Intent Contract and confirmed-only Truth Map;
2. a validated Context Capsule capped at 4 KB;
3. per-worktree runtime state and a single-writer lease outside the repository;
4. a cold Skill catalog with a top-three shortlist and one active Provider;
5. a deep Start Card and user-confirmed Implementation Permit for explicit high-ambiguity work;
6. tamper-evident evidence and Experience that automatically loses trust when stale.

## The 1–4–3–1 Skill model

```text
1  ordinary VibeTether entry Skill
4  maximum optional Hot Skills
3  maximum candidates in a task shortlist
1  active primary Provider for a step
```

The catalog may be large. The shortlist stays small. Provider content is loaded only after selection. A large Provider can run through a worker handoff instead of entering the main Agent context.

## Install from this source tree

Requirements: Node.js 20 or newer and Git for worktree-aware projects.

```sh
npm install -g .
vibetether global install --agent both --yes
```

The global installation is only a dispatcher and entry Skill. It stores no project goal, Truth, Experience, or runtime state. Each project pins the VibeTether version it expects.

After a `v1.0.0-rc.3` tag is published, the portable acquisition form is:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/tags/v1.0.0-rc.3 \
  vibetether init --project . --agent both
```

## Initialize a project

Guided setup in an interactive terminal:

```sh
vibetether init --project . --agent both
```

The CLI asks only for missing goal and success evidence, shows the reviewed Contract decision, and writes nothing when the user declines. In a non-interactive shell, use `--dry-run` or the fully specified `--yes` form below.

Deterministic automation:

```sh
vibetether init --project . --agent both \
  --goal "Preserve the approved customer workflow" \
  --success-evidence "Focused and completion checks pass" \
  --confirmed --yes
```

Use `--control-mode team` for a Git-tracked Contract, `local` for a machine-local Contract shared by this clone's worktrees, or `hybrid` for a tracked Contract with external runtime. Team and hybrid are the portable choices.

## Small project footprint

A normal tracked Contract contains seven files:

```text
.vibetether/
  project.json
  intent.md
  TRUTH.md
  experience.json
  skills.lock.json
  routes.json
  vt.mjs
```

The host receives one small managed block and two focused entry Skills:

```text
AGENTS.md                              # Codex, when enabled
.agents/skills/vibe-tether/             # normal adaptive entry
.agents/skills/vibe-tether-deep/        # explicit deep Start Card / Permit gate
CLAUDE.md                              # Claude, when enabled
.claude/skills/vibe-tether/
.claude/skills/vibe-tether-deep/
```

The project does not contain runtime checkpoints, route history, Provider catalogs, or generated capability boards. These live in the operating system's state and cache directories.

Hard budgets enforced by tests and `doctor`:

- tracked Contract: at most 25 KB;
- each VibeTether entry Skill: at most 8 KB;
- managed host block: at most 1 KB;
- Context Capsule: at most 4 KB;
- current worktree projection: at most 8 KB;
- Skill shortlist: at most three;
- recalled Experience entries: at most three.

## Normal Agent loop

Read a validated, compact context before using historical state:

```sh
vibetether context --boundary task-entry --json
```

For ordinary use, give VibeTether the task in natural language; it classifies the likely phase and capability, applies deterministic safety gates, and selects one Provider from the cold catalog:

```sh
vibetether step start \
  --task "Fix the failing callback without changing the public API" \
  --slice "Fix one failing callback path" \
  --success-evidence "The focused regression command passes" \
  --signal bug-fix \
  --code-write --json
```

Finish with fresh command evidence:

```sh
vibetether step finish \
  --evidence-command-json '["npm","test","--","callback.test.js"]' \
  --truth-decision no-material-change --json
```

Check the actual completion boundary:

```sh
vibetether doctor --boundary completion --json
```

Assertion text may be recorded as a note, but it cannot satisfy implementation, verification, review, diagnosis, or release evidence gates.

### Explicit deep mode

When the user asks for deep mode or wants facts and assumptions checked before implementation, use the separate gate:

```sh
vibetether deep prepare --project . \
  --task "Review the migration facts before coding" \
  --slice "Implement only the user-approved migration slice" \
  --success-evidence "The focused migration checks pass" \
  --fact "The current format is version 0.6.3" \
  --decision "Confirm the exact compatibility boundary" --json

vibetether deep permit --project . --confirmed-by-user \
  --reason "The user approved this Start Card and exact slice" --json

vibetether step start --project . --deep --code-write \
  --task "Use deep mode for the approved migration" \
  --phase EXECUTE_ONE --capability implementation \
  --slice "Implement only the user-approved migration slice" \
  --success-evidence "The focused migration checks pass" --json
```

The Start Card is not permission. The Implementation Permit is expiring, worktree-scoped, authority-scoped, and consumed when the step exits. It does not grant network, credential, migration, deployment, destructive-data, or release permission.

## Truth is authority; Experience is procedure

The Truth Map contains three states:

```text
Confirmed project truth
Candidates awaiting confirmation
Declined candidates
```

Candidates never enter implementation context. Adding or editing a candidate does not change active authority. Confirmation, removal, role/scope changes, or supersession are explicit user actions.

Experience uses this lifecycle:

```text
candidate → provisional → proven → suspect → quarantined → obsolete
```

A proven path records artifact hashes, fresh evidence receipts, authority and Skill configuration digests, environment, and a review deadline. Artifact, authority, Skill, environment, evidence, or time drift automatically makes it effectively `suspect`; VibeTether does not silently delete it or let it override Truth.

## Worktrees and multiple Agents

VibeTether identifies linked worktrees by Git's common directory and private worktree Git directory, not by branch name or folder location. Project-local, sibling, global, moved, and detached worktrees are supported.

```sh
vibetether worktree attach --json
vibetether worktree list --json
vibetether worktree create --path ../project-feature --branch feature/example --json
```

Runtime state is isolated per worktree. Different worktrees can run in parallel. The same worktree allows one active writer lease. A bounded handoff transfers only the slice, authority digest, success evidence, permissions, and protected capabilities—not a parent checkpoint or conversation transcript.

## Skill catalog and continuous improvement

The standard profile includes curated cold Provider metadata and packaged Skill content from reviewed sources resolved to immutable commits and verified content digests. Search and inspect metadata without exposing unselected Provider instructions:

```sh
vibetether skills search --query "runtime debugging" --json
vibetether skills inspect --id vibetether-built-in-debugging --json
```

Import a reviewed local Provider into the content-addressed cache:

```sh
vibetether skills import \
  --id focused-debugging \
  --source ./reviewed-skill \
  --source-label internal/focused-debugging \
  --version 1.0.0 \
  --license MIT \
  --capability debugging \
  --phase DIAGNOSE \
  --trigger runtime-failure \
  --project . --json
```

External Providers start as `experimental`. They require trigger and output evaluation before beta approval and stable promotion. Two recorded project failures remove a Provider from automatic routing without deleting it. Stable Providers are still bounded by the current scope envelope, project Truth, permissions, and evidence contract.

No Provider is silently downloaded during an active step. Optional gaps use a verified built-in fallback. Explicit project or user exposure is opt-in.

## Upgrade from 0.x

Always preview:

```sh
vibetether migrate --project . --dry-run --json
```

Apply after review:

```sh
vibetether migrate --project . --control-mode team --agent both --yes --json
```

Migration is transactional and externally backed up. The RC migration corpus includes a sanitized real-installed 0.6.3 control-plane shape and the canonical 0.6.3 Truth section format; formal promotion still requires the remote cross-platform matrix and independent migration review. Legacy sources become candidates, never silently confirmed. Existing prose Truth is preserved byte-for-byte with a sidecar index. Legacy proven Experience becomes provisional. Only bounded checkpoint fields are recovered; historical self-declared PASS text is discarded. The returned migration ID supports explicit rollback.

## Honest limits

VibeTether is a control and evidence layer, not a security sandbox or semantic oracle.

It cannot guarantee that a host Agent follows instructions, that a user approves the correct direction, that a third-party Skill is universally good, or that an external service succeeds. Hashes prove byte identity, not meaning. Evidence receipts prove what command or artifact was recorded, not that every relevant test exists. A single Agent reviewing its own work is not independent review.

What this reference implementation checks deterministically is narrower: unsafe paths and symlinks fail closed; candidates do not become authority; runtime is worktree-scoped; receipts are tamper-evident; stale experience loses trusted status; Provider selection is permission-bounded; context and asset budgets are enforced; and completion boundaries are checked against current bytes.

## Documentation

- [Installation and scope](docs/installation.md)
- [Worktree runtime and handoff](docs/worktrees.md)
- [Skill broker and Provider lifecycle](docs/skills.md)
- [Truth and Experience lifecycle](docs/truth-and-experience.md)
- [0.x migration and rollback](docs/migration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Beginner and capability contract](docs/design/VIBETETHER-BEGINNER-AND-CAPABILITY-CONTRACT.md)
- [Compatibility and data contract](docs/design/VIBETETHER-COMPATIBILITY-AND-DATA-CONTRACT.md)
- [Architecture decision](docs/architecture/0001-lean-control-kernel.md)
- [Verification report](docs/verification.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Repository checks

```sh
npm ci
npm run check
npm run test:coverage
npm pack --dry-run
npm audit
```

The test suite covers project contracts, context budgets, Truth, Experience, evidence tampering, Provider evaluation and activation, CLI exit classes, migration rollback, and concurrent linked worktrees on supported Git platforms.


## Release-candidate status

This source is an **RC**, not a final 1.0 release. Local verification is recorded in the external release report generated beside the source ZIP. Declaration-only license evidence remains explicitly marked for legal review before public redistribution. The repository ships an Ubuntu/Windows, Node 20/24 CI matrix, but a configured matrix is not evidence that those remote jobs have run. Final release requires the remote matrix and independent review.
