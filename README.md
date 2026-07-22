# VibeTether 1.0.0-rc.4

> Keep a capable coding agent aligned from the first uncertain request to fresh completion evidence.

VibeTether is an installable control layer and cold Skill broker for long-running Codex and Claude Code work. It gives a project a reviewed Intent, confirmed Truth, required Outcomes, bounded worktree routes, tamper-evident evidence, and reusable Proven Paths.

This repository is a release candidate. Stage 0 proves the current CLI and installed-package contracts; it does not claim host-enforced control, a final release, or any future-stage mechanism.

## Start here: verified package

Requirements: Node.js 20 or newer and Git for worktree-aware projects.

Install the exact TGZ whose digest and archive manifest you reviewed. Do not replace it with a floating tag or an unverified directory.

<!-- stage0-command:parse install-tgz -->
```sh
npm install -g ./vibetether-1.0.0-rc.4.tgz
vibetether global install --agent both --yes
vibetether init --project . --agent both
```

The global install adds only the dispatcher and the two entry Skills. Project Intent, Truth, Outcomes, Experience, and runtime state stay project-scoped.

An immutable source commit can also run the one-time initializer. Verify the commit and downloaded archive digest first.

<!-- stage0-command:parse immutable-init -->
```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/<verified-commit> \
  vibetether init --project . --agent both
```

RC.4 is not a signed final release. Use only a TGZ or immutable commit that you have independently identified.

## Source checkout (secondary)

Use source execution for development and review, not as proof that the installed TGZ works.

<!-- stage0-command:parse source-checkout -->
```sh
npm ci --ignore-scripts --no-audit --no-fund
node ./bin/vibetether.mjs --help
```

The exact installed-package journey is a separate gate from source-tree tests.

## Initialize one project

Interactive `vibetether init --project . --agent both` asks only for missing goal and success evidence, shows the proposed Contract, and writes nothing if you decline.

For automation, preview the complete Contract first:

<!-- stage0-command:execute init-preview -->
```sh
vibetether init --project . --agent both --profile standard --control-mode team \
  --goal "Keep the verified workflow aligned." \
  --success-evidence "The declared Outcome checks pass." \
  --confirmed --dry-run --json
```

Review the preview. Apply the same command with `--yes` instead of `--dry-run` only when those words and boundaries are correct.

The tracked team Contract is intentionally small:

```text
.vibetether/
  project.json
  intent.md
  TRUTH.md
  outcomes.json
  PROGRESS.md
  experience.json
  skills.lock.json
  routes.json
  vt.mjs
```

Runtime checkpoints, route history, Provider objects, and evidence receipts live in redirected operating-system state, not in the repository.

## Choose the path by situation

### Vague project: Deep clarification

Tell the Agent: `Use vibe-tether-deep. Inspect project facts, expand this request into a bounded Start Card, ask one consequential question at a time, and do not write code until I confirm the complete interpretation.`

Deep preparation is investigation, not permission. Code-write requires the user-confirmed, scope-bound Implementation Permit, and changing authority, worktree, paths, permissions, checks, or expiry invalidates it.

### Clear local fix: Adaptive control

Tell the Agent: `Use VibeTether. Fix the callback failure without changing the public API.`

Adaptive entry reads a compact Context Capsule, investigates discoverable facts, and keeps a clear low-risk slice lightweight. It escalates when product behavior, UI, data, architecture, permissions, migration, publication, or release direction is unresolved.

### UI redesign: golden screen and dual acceptance

Provide the reference image or brief, target viewport, and constraints. Ask for one golden screen before implementation. A controlled UI route must bind the UI Outcome and keep three evidence axes distinct: golden-screen artifact acceptance, functional test acceptance, and visual acceptance. A test cannot impersonate the golden or visual decision.

The Stage 0 functional UI gate exists. Golden-screen and visual acceptance remain open until their declared artifact or user decisions are recorded.

### Compaction or resume: explicit re-entry

Invoke `vibe-tether` again after compaction, handoff, a new task, or phase change. Read only the validated public Context and generated Outcome status before acting:

<!-- stage0-command:execute reentry-status -->
```sh
vibetether context --project . --boundary task-entry --json
vibetether outcomes status --project . --json
```

Do not continue from a compressed summary alone. Stable handles can retrieve omitted public context without reading raw runtime files.

### Correction today: abandon and re-anchor

When the user changes direction during an active route, stop. Today the safe path is manual: abandon the incorrect route with a reason, update user-owned authority if needed, then re-anchor and start a new bounded route. Automatic Correction handling and a Correction Lock are future-stage work, not Stage 0 behavior.

### Proven Path: capture, confirm, recall

A verified non-routine success may create a sanitized Experience candidate. Inspect its artifacts, evidence IDs, decisive conditions, environment, and review date. User confirmation can promote it to proven; later matching signals may recall it. Artifact, Skill, authority, environment, evidence, or time drift makes it suspect and removes it from trusted recall. Truth always outranks Experience.

### Goal closure is not release authorization

One passing route can reach `SLICE_GREEN` without closing every required Outcome. A closed engineering goal still does not authorize a release. Ask both boundaries explicitly:

<!-- stage0-command:execute completion-boundaries -->
```sh
vibetether doctor --project . --boundary goal --json
vibetether doctor --project . --boundary release --json
```

Release requires the exact candidate bytes, applicable external evidence, review disposition, owner acceptance, and explicit release authorization. The configured CI matrix is not evidence that the jobs ran.

### Provider profiles, bundles, and custom routes

Choose `core`, `standard`, or `extended` during initialization. Add `--bundle web` and/or `--bundle production` only when those cold Provider packs are needed. Inspect routing without loading every Provider into context:

<!-- stage0-command:execute provider-routing -->
```sh
vibetether capabilities --project . --phase EXECUTE_ONE --capability implementation --code-write --json
```

The shortlist is capped at three and one Provider controls a step. Pinned content is verified before activation.

## Custom routes

Edit the tracked `.vibetether/routes.json` only after review. This bounded example selects the built-in implementation Provider for an observable project signal and adds an output and exit criterion:

```json
{
  "schema_version": 1,
  "routes": [
    {
      "id": "project-implementation",
      "phases": ["EXECUTE_ONE"],
      "capability": "implementation",
      "signals": { "all": [], "any": ["project-implementation"], "none": [] },
      "provider": "vibetether-built-in-implementation",
      "role": "primary",
      "priority": 100,
      "required_outputs": ["project_change_summary"],
      "exit_evidence": ["The project-specific focused check passes."]
    }
  ]
}
```

A route overlay may add required outputs and exit evidence; it cannot weaken platform safety, confirmed Truth, Outcome coverage, permissions, or evidence gates. Upgrade and rollback preserve user routes and Provider preferences.

## Current enforcement limits

VibeTether-controlled CLI routes enforce their declared Contract, Outcome, permission, and evidence gates. An advisory host can bypass the CLI by never invoking VibeTether; Stage 0 does not pretend otherwise.

- Raw-session Decision Memory is not implemented.
- Automatic Correction and a Correction Lock are not implemented.
- A Claim Envelope and exact-environment proof are not implemented.
- Host Enforcement hooks for Codex or Claude are not implemented.
- Failure Replay orchestration is not implemented.
- `inspect` and the operator cockpit are not implemented.
- A daemon is not implemented.
- A database is not implemented.
- Runtime Provider download is not implemented; active routes use verified cached or packaged content.
- Release automation is not implemented; no command in this README authorizes publication.

Hashes prove byte identity, not meaning. Evidence proves the command or artifact that was recorded, not that every relevant check exists. The implementing Agent's own review is not independent review.

## Future stages

- Stage 1: Correction is designed as a future stage; Stage 0 uses manual abandon and re-anchor.
- Stage 2: Decision Memory is designed and not implemented.
- Stage 3: Claim Envelope governance and stronger exact-environment evidence are designed and not implemented.
- Stage 4: Host Enforcement is designed and not implemented.
- Stage 5: Failure Replay is designed and not implemented.
- Stage 6: `inspect` and the operator cockpit are designed and not implemented.

Future examples are intentionally absent from the runnable current-command blocks above.

## Documentation

- [Installation and scope](docs/installation.md)
- [Worktree runtime and handoff](docs/worktrees.md)
- [Skill broker and Provider lifecycle](docs/skills.md)
- [Truth and Experience lifecycle](docs/truth-and-experience.md)
- [0.x migration and rollback](docs/migration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Beginner and capability contract](docs/design/VIBETETHER-BEGINNER-AND-CAPABILITY-CONTRACT.md)
- [Compatibility and data contract](docs/design/VIBETETHER-COMPATIBILITY-AND-DATA-CONTRACT.md)
- [Control capability status: implemented vs partial vs designed](docs/design/VIBETETHER-CONTROL-CAPABILITY-STATUS.md)
- [GYWS long-task failure forensics](docs/research/2026-07-22-gyws-long-task-failure-forensics.md)
- [Host enforcement and claim integrity design](docs/superpowers/specs/2026-07-22-vibetether-host-enforcement-and-claim-integrity-design.md)
- [Real-project failure replay suite](docs/superpowers/specs/2026-07-22-vibetether-real-project-failure-replay-suite.md)
- [Architecture decision](docs/architecture/0001-lean-control-kernel.md)
- [Verification boundary](docs/verification.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Release-candidate status

The generated capability status distinguishes implemented, partial-advisory, and designed behavior. Final Stage 0 evidence still requires exact candidate TGZ/ZIP identity, the authorized live v0.6.3 migration and rollback exercise, terminating Ubuntu/Windows Node 20/24 jobs, independent review, and owner acceptance. No merge to `main`, tag, publication, deployment, or release is implied.
