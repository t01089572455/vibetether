# Project Manifest

## Purpose

Use `.vibetether/project.yaml` as a routing index for existing project truth. Do not copy product specifications into it or create a parallel documentation tree.

## Minimal Schema

```yaml
schema_version: 1
project_id: example-project

goal_source: docs/product-direction.md
intent_contract: docs/intent-contract.md
capability_board: .vibetether/capabilities.yaml
provider_lock: .vibetether/providers.lock.yaml

sources:
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

1. Discover existing project instructions, context, product direction, PRDs, ADRs, UI specifications, tests, and release documents.
2. Classify candidates by role and attach provenance and confidence.
3. Auto-map only unambiguous high-confidence sources.
4. Report duplicate, missing, stale, and conflicting candidates.
5. Ask about ambiguities that can change direction.
6. Write the manifest and lightweight Intent Contract after confirmation.
7. Generate the advisory capability board and exact provider lock during explicit initialization.
8. Let `doctor` detect moved, deleted, or drifting sources, providers, and licenses later.

Never rewrite or consolidate existing project documents during initialization.

## Managed Instruction Block

Adapters may write only a bounded block:

```markdown
<!-- vibetether:start -->
## VibeTether

Run the lightweight preflight before consequential actions. Consult `.vibetether/capabilities.yaml`, treat optional provider routes as recommendations, and record the selected path. Perform a full re-anchor through `.vibetether/project.yaml` when a trigger fires. Do not bypass unresolved direction, authority conflicts, or project gates.
<!-- vibetether:end -->
```

Show a diff, create a backup before the first applied change, preserve user content, remain idempotent, stop on conflicting managed blocks, and remove only VibeTether-owned unchanged content during uninstall. Preserve pre-existing provider Skills.

Instruction files are behavioral guidance, not a security boundary. Use platform permissions and explicit hooks for enforcement when supported and authorized.
