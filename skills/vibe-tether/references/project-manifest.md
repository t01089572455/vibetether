# Project Manifest

## Purpose

Use `.vibetether/project.yaml` as a machine-readable index for the project control plane. `.vibetether/TRUTH.md` is the human-readable authority list. Do not copy product specifications into either file or create a parallel documentation tree.

## Minimal Schema

```yaml
schema_version: 1
project_id: example-project

goal_source: .vibetether/intent.md
intent_contract: .vibetether/intent.md
truth_index: .vibetether/TRUTH.md
capability_board: .vibetether/capabilities.yaml
provider_lock: .vibetether/providers.lock.yaml
experience_index: .vibetether/experience-index.yaml

sources: # compatibility-only while older releases remain rollback-readable
  always:
    - AGENTS.md
    - CONTEXT.md
    - docs/product-direction.md
  conditional:
    requirements:
      - docs/prd/
    architecture:
      - docs/adr/
    ui:
      - docs/ui-spec.md
      - docs/design-system.md
    release:
      - docs/release-checklist.md
    operations:
      - docs/operations/

project_gates:
  - changing_public_api
  - changing_design_system
  - deleting_user_capabilities

verification:
  test: npm test
  build: npm run build
  ui: npm run test:e2e

harnesses:
  codex:
    enabled: true
    instruction_file: AGENTS.md
  claude:
    enabled: true
    instruction_file: CLAUDE.md

checkpoint:
  mode: local
  path: .vibetether/state/current.yaml

conflicts:
  require_user_confirmation: true
```

## Initialization

1. Create a blank, project-owned `.vibetether/TRUTH.md`; do not scan or activate repository documents.
2. Route the truth map, Intent Contract, capability board, checkpoint, provider lock, and experience index from the manifest.
3. Let the user edit the truth map or ask the Agent to search and explain candidates later.
4. Require user confirmation before a candidate becomes active truth.
5. Generate the advisory capability board and exact provider lock during explicit initialization.
6. Let `doctor` validate structure, contained paths, providers, licenses, and runtime state later.

Never rewrite or consolidate existing project documents during initialization.

## Bootstrap and Experience Index

Use `project-bootstrap` whenever a directory is greenfield or project direction is unresolved. Inspect repository facts first, then confirm user-owned goal and success evidence; do not infer either from the directory name or package metadata. The manifest's `truth_index` field identifies authority; `experience_index` identifies reusable operational paths. Keep both project-relative. Experience entries do not need duplication in legacy `sources`, and they never override confirmed truth.

When an experience entry is created or updated, preserve its stable entry ID and its artifact paths so duplicate capture can be detected by the pair of entry ID plus artifact path. The index points to artifacts; it does not replace them or become a transcript ledger.

## Managed Instruction Block

Adapters may write only a bounded block:

```markdown
<!-- vibetether:start -->
## VibeTether

Automatically apply VibeTether at task entry, consequential actions, phase transitions, resume, compaction recovery, and completion boundaries. Read `.vibetether/TRUTH.md` and only applicable confirmed sources. Candidates never guide implementation; active truth changes require user confirmation. Consult `.vibetether/capabilities.yaml`, treat provider routes as recommendations, and record the selected path. Query `.vibetether/experience-index.yaml` before repeatable operational work. If experience conflicts with truth, ask the user. After verified success, create a sanitized Proven Path candidate and ask before active indexing. Record `experience_feedback` and pass `vibetether doctor` before completion. Never persist secrets or private reasoning.
<!-- vibetether:end -->
```

Show a diff, create a backup before the first applied change, preserve user content, remain idempotent, stop on conflicting managed blocks, and remove only VibeTether-owned unchanged content during uninstall. Preserve pre-existing provider Skills.

Instruction files are behavioral guidance, not a security boundary. Use platform permissions and explicit hooks for enforcement when supported and authorized.

New product, architecture, or design authority follows the user-confirmed truth lifecycle. New reusable procedures follow the experience-index lifecycle. Do not duplicate either in compatibility `sources`, and do not create a universal VibeTether success ledger.
