# VibeTether Goal and Outcome Coverage Design

Status: approved
Decision owner: project user
Target: `1.0.0-rc.4` review candidate after `1.0.0-rc.3` hardening
Scope: goal completeness, outcome coverage, and layered completion verdicts
Approval basis: user-approved current-session review with the source-coverage and generated-progress amendments below

## Problem

VibeTether can currently prove that one selected slice used current authority, a valid route, fresh evidence, final project bytes, and a Success Capture disposition. It cannot prove that the selected slice represents every result required by the parent goal.

This leaves a structural false-completion path:

```text
Agent selects a convenient slice
-> Agent declares checks for that slice
-> Slice passes strict evidence gates
-> Parent goal still contains omitted requirements
-> Slice completion is reported as product completion
```

The missing control is not another longer prompt or another reviewer. It is a compact, durable, user-governed inventory of required outcomes and their acceptance contracts, plus a runtime projection showing which outcomes have actually been proven.

## Product decision

VibeTether will add a Goal and Outcome Coverage layer without becoming a project-management platform.

The design separates:

1. **Goal and Outcome Contract** — repository-scoped, human-reviewable statements of what must be true;
2. **Outcome Progress** — worktree-scoped machine state recording what current evidence proves;
3. **Layered Doctor boundaries** — independent verdicts for a slice, the goal, and release.

VibeTether remains one repository, one CLI, one installation flow, and one cooperating-agent product. No daemon, database, remote registry service, or second planning framework is introduced.

## Alternatives considered

### A. Keep outcomes in Intent prose or README checklists

This is easy to implement and easy to edit, but it cannot reliably bind a route to a requirement, distinguish omitted work from deferred work, or stop a local green result from becoming a global completion claim.

Verdict: rejected as non-enforceable.

### B. Repository Outcome Contract plus external runtime progress

The project stores stable outcome identities, authority links, dependencies, dispositions, and acceptance definitions. Evidence receipts and frequently changing progress stay in per-worktree runtime state. The CLI joins both views at context, route, and Doctor boundaries.

Verdict: selected. It is auditable, compact, recoverable, and consistent with VibeTether's existing Contract/runtime separation.

### C. Event-sourced database or remote orchestration service

This could coordinate large organizations and many agents, but would add deployment, trust, migration, availability, and beginner-UX costs before the core single-repository problem is proven.

Verdict: explicitly deferred.

## Contract model

The project manifest points to `.vibetether/outcomes.json`. Initialization creates an empty draft registry and does not invent project requirements.

The canonical shape is:

```json
{
  "schema_version": 1,
  "goal_id": "goal_product_delivery",
  "goal_revision_digest": "sha256:...",
  "coverage_status": "draft",
  "coverage_decision": null,
  "integration_worktree_id": null,
  "coverage_sources": [
    {
      "id": "source_product_requirements",
      "truth_id": "truth_product_requirements",
      "source_revision_digest": "sha256:...",
      "expected_id_count": 42,
      "expected_id_set_digest": "sha256:...",
      "mapping_path": ".vibetether/coverage/product-requirements.json",
      "mapping_revision_digest": "sha256:..."
    }
  ],
  "outcomes": [
    {
      "id": "outcome_export_contract",
      "title": "Users can export the approved report format",
      "authority_sources": ["truth:truth_product_export_contract"],
      "parent_id": null,
      "dependencies": [],
      "disposition": "required",
      "required_at": ["goal", "release"],
      "acceptance": [
        {
          "id": "export_browser_path",
          "claim": "A user can export the report through the product entry point",
          "evidence_kind": "command-or-artifact",
          "required_maturity": "functional",
          "validator": {
            "kind": "command",
            "command": ["npm", "test", "--", "export-browser-path"],
            "validator_revision": "sha256:...",
            "covers_paths": ["src/export/**"]
          }
        }
      ],
      "decision_receipt": "decision:...",
      "revision_digest": "sha256:..."
    }
  ]
}
```

The outcome schema is versioned independently from the package and Project Contract. The validator requires exactly the fields shown for the registry and each outcome, plus the decision-receipt and validator fields defined below; unknown fields fail closed. Text, list, dependency, acceptance, and total-size limits are constants audited by the release gate.

### Stable identity and revision

- `goal_id` and outcome `id` are stable logical identities.
- `goal_revision_digest` and outcome `revision_digest` identify reviewed definitions.
- Moving a source or changing acceptance does not silently create a new logical outcome.
- Changing a required outcome definition invalidates progress tied to its prior revision.

### Dispositions

An outcome uses exactly one disposition:

- `candidate` — discovered or proposed, non-authoritative;
- `required` — part of the confirmed goal coverage;
- `deferred` — intentionally excluded from the current completion boundary by a user decision;
- `rejected` — reviewed and not part of the goal;
- `superseded` — replaced by one or more named outcomes.

Automatic behavior may create or update candidates and may lower progress to stale. It may not promote a candidate, defer a required outcome, reject an outcome, supersede it, weaken acceptance, or mark coverage complete without a user-grounded decision receipt.

### Coverage status

The registry uses:

- `draft` — requirements may still be missing;
- `confirmed` — the user has reviewed the outcome set for the current goal revision;
- `changed` — confirmed authority or the goal revision changed and coverage must be reconciled.

`confirmed` means the inventory is accepted as the current coverage boundary. It does not mean its outcomes are satisfied.

### Decision receipts

A directional outcome mutation stores a bounded receipt inside the registry:

```json
{
  "id": "decision-uuid",
  "action": "confirm-required",
  "target_ids": ["outcome_export_contract"],
  "prior_registry_digest": "sha256:...",
  "result_registry_digest": "sha256:...",
  "user_message_locator": "host-visible-locator",
  "reason": "The user approved this result as part of the current goal.",
  "recorded_at": "ISO-8601"
}
```

The receipt records the observable authorization basis without storing the full conversation. It is not a cryptographic proof that a host message came from a human. On hosts without a mandatory hook, the cooperation limitation remains explicit. A bare `--yes`, Agent-authored summary, or boolean such as `confirmed_by_user` cannot create a directional receipt by itself.

Coverage confirmation also records the designated integration worktree ID. Rebinding goal-level closure to another worktree is a directional mutation with its own receipt. A non-Git project uses its stable attached execution-root identity.

### Exact source-ID coverage

Coverage confirmation is not valid merely because the Outcome list looks plausible. Every declared requirements source with stable IDs records its confirmed source revision, expected ID count, and order-independent ID-set digest.

Each source ID has exactly one current disposition:

```text
mapped to one Outcome or equivalence group
duplicate of named source ID
historical
rejected
superseded by named source IDs
```

The registry does not store only a count and digest while leaving the individual dispositions implicit. Each `coverage_sources[]` entry points to a project-owned mapping sidecar through `mapping_path` and binds its reviewed bytes through `mapping_revision_digest`. The sidecar has this canonical shape:

```json
{
  "schema_version": 1,
  "source_id": "source_product_requirements",
  "source_revision_digest": "sha256:...",
  "entries": [
    {
      "source_item_id": "REQ-001",
      "disposition": "mapped",
      "outcome_ids": ["outcome_export_contract"],
      "equivalence_group": "export-user-result",
      "reason": "REQ-001 describes the same observable export result governed by this Outcome."
    },
    {
      "source_item_id": "REQ-002",
      "disposition": "duplicate_of",
      "target_source_item_ids": ["REQ-001"],
      "reason": "The later requirement repeats REQ-001 without adding a distinct user result."
    }
  ]
}
```

`disposition` is exactly one of `mapped`, `duplicate_of`, `historical`, `rejected`, or `superseded_by`. A `mapped` entry names one or more existing Outcome IDs and may name one equivalence group. `duplicate_of` and `superseded_by` name existing source item IDs in `target_source_item_ids`; `historical` and `rejected` name neither outcomes nor target IDs. Every entry includes a bounded reason. Unknown fields, duplicated `source_item_id` values, cyclic duplicate/supersession references, dangling Outcome or source-item references, and incompatible fields fail closed.

The mapping sidecar is `user-authority`: discovery may propose candidate entries, but changing a disposition, target, equivalence group, or reason requires the same user-grounded decision rules as Outcome mutations. System-generated source extraction may refresh a separate candidate file; it cannot overwrite the confirmed mapping sidecar.

The coverage audit fails on missing IDs, unknown IDs, duplicate active ownership, unresolved dispositions, count mismatch, source revision drift, or ID-set digest mismatch. Multiple raw IDs may map to one real Outcome equivalence group, but template evidence copied across IDs is not accepted as per-ID proof.

Sources without stable IDs require a project adapter or an explicitly user-reviewed manifest before coverage can be confirmed. VibeTether can prove completeness against the declared and confirmed source universe; it cannot prove that an unregistered document or an ambiguous sentence contains no additional requirement.

## Authority and beginner behavior

The exact current user request is an authority source. A clear, bounded request can ground an outcome without asking a ceremonial duplicate question, provided its meaning, scope, and acceptance are unambiguous and the decision receipt points to that request.

When ambiguity changes product direction, architecture, UI, data, security, permissions, release scope, or public behavior, Deep mode asks one recommended decision at a time before an outcome becomes required.

Repository discovery can propose candidate outcomes from confirmed Truth and reviewed discussion artifacts. Candidates do not guide implementation or count toward completion until confirmed. Unknown files and generated prose never become required outcomes automatically.

For a small local task, the Agent may use lightweight observation and finish without a full goal inventory. It may claim only the local result. A claim resembling whole-goal, project, milestone, delivery, merge, deployment, publication, or release completion requires confirmed coverage.

## Outcome progress

Progress is stored outside the repository in the existing per-worktree runtime plane. It is a projection that can be rebuilt from receipts, not a new authority source.

For each outcome it records:

```text
outcome id
outcome revision digest
state: open | in-progress | satisfied | stale | blocked
satisfied acceptance IDs
route IDs
evidence IDs
last verified worktree snapshot
missing acceptance IDs
```

Rules:

- a consequential controlled route names at least one required outcome;
- the route binds the registry digest and referenced outcome revisions at start;
- the route maps predeclared success checks to existing acceptance IDs;
- a route cannot invent a weaker acceptance claim and use it to close an outcome;
- successful evidence advances only the mapped acceptance IDs;
- all required acceptance items must be satisfied before the outcome becomes `satisfied`;
- human-decision or external-authority acceptance remains open until its matching receipt exists;
- changed authority, outcome revision, final bytes, Provider identity, environment contract, or counterevidence can downgrade progress to `stale` or `blocked`;
- one worktree cannot silently satisfy another worktree's outcome with unmerged bytes.

The primary integration worktree is the only place that may produce the final goal-level projection. A subagent, Provider, GPT Pro task, or sibling worktree may contribute routes and evidence but cannot independently declare the parent goal complete.

## Managed files and generated progress

VibeTether assigns every managed artifact one ownership class:

- `user-authority` — Intent, confirmed Truth, required Outcome definitions, directional routes, and user Provider policy;
- `system-generated` — manifest metadata, the human progress projection, generated checksums, and managed host blocks;
- `runtime-evidence` — route, lease, activation, checkpoint, evidence, handoff, and Outcome progress receipts;
- `candidate` — discovered Truth, proposed Outcomes, and reusable Experience awaiting confirmation.

Automatic maintenance never rewrites `user-authority` semantics. It may propose a candidate, refresh a verified revision, regenerate a derived view, record runtime evidence, or lower trust after drift.

The tracked `.vibetether/PROGRESS.md` is a generated, human-readable projection. It contains:

```text
goal and coverage revision
current integration target
required / open / in-progress / satisfied / stale / blocked counts
current Outcome and next missing acceptance
remaining Outcome IDs with stable handles
latest precise completion label
generation digest and regeneration command
```

`PROGRESS.md` is not authority and must not be edited manually. The canonical Outcome Contract plus verified runtime receipts regenerate it deterministically. At a successful step boundary, Outcome progress, route satisfaction, checkpoint, Success Capture, and the new progress projection are committed as one recoverable control transaction. If the projection cannot be regenerated or its digest does not match canonical state, the step cannot finish and Doctor blocks completion.

Detailed receipts stay outside Git. The compact projection is committed with the corresponding product slice so another session, machine, or integration worktree can see exact remaining work without loading the full runtime journal.

Manual changes to any managed file are classified before action: user-authority changes require reconciliation; generated-file changes are reported and safely regenerated only after ownership checks; runtime corruption is quarantined and rebuilt from receipts when possible; candidate changes remain non-authoritative.

## Acceptance maturity

Maturity is explicit and claim-specific:

- `structural` — schema, static, or contract structure is proven;
- `functional` — a real product or engineering path is proven on final bytes;
- `external` — an external authority adapter or real environment has been checked;
- `reviewed` — the required review disposition exists, with independence labeled honestly;
- `owner-accepted` — the user completed the explicitly required acceptance decision;
- `release` — release-specific evidence and authorization exist.

Projects use only applicable levels. VibeTether does not hard-code LoveBuddy's Provider, transcript, or Turing terminology into the generic kernel. Those become project-specific outcomes or acceptance items.

Lower maturity never automatically satisfies a higher one. A unit test cannot satisfy a browser claim, a browser run cannot satisfy an external production claim, and self-review cannot satisfy an independent-review requirement.

Each acceptance item predeclares either a versioned command/artifact validator, an authority adapter, or a user/reviewer decision type. Validator identity and covered product paths are part of the outcome revision. Replacing or weakening them changes that revision and requires the migration mapping described below.

## CLI and task flow

The beginner-facing CLI adds one noun, `outcomes`:

```text
vibetether outcomes status
vibetether outcomes list
vibetether outcomes propose
vibetether outcomes confirm
vibetether outcomes defer
vibetether outcomes reject
vibetether outcomes supersede
vibetether outcomes coverage confirm
```

Mutation commands produce a preview by default and require a user-grounded decision receipt to apply directional changes. Direct file edits remain supported; changed bytes trigger re-anchor and reconciliation.

Controlled execution adds bounded mappings:

```text
vibetether step start --outcome outcome_id \
  --success-check-json '{"id":"check","acceptance_ids":["acceptance_id"],...}'
```

Context returns a small coverage capsule:

```text
goal id and revision
coverage status
required / open / in-progress / satisfied / stale counts
current outcome handles
omitted count and continuation handle
next blocking decision or missing acceptance
```

It never injects the entire registry into every prompt.

## Layered completion verdicts

VibeTether separates three boundaries.

### Slice completion

`doctor --boundary slice` verifies the current route, Permit when applicable, output contract, mapped acceptance evidence, Truth reconciliation, Success Capture, and final bytes. It says nothing about unreferenced parent outcomes.

### Goal completion

`doctor --boundary goal` additionally requires:

- confirmed coverage for the current goal revision;
- an exact source-ID audit for every declared coverage source;
- no undispositioned coverage conflict;
- every outcome required at `goal` is satisfied or explicitly deferred for this goal revision;
- dependencies are satisfied;
- no required evidence is stale;
- the final projection is produced from the designated integration worktree;
- the last slice and current project bytes still match their evidence.

The verdict reports every remaining outcome ID and missing acceptance ID. It must never return success merely because the latest route is satisfied.

### Release completion

`doctor --boundary release` includes the goal gate and additionally requires outcomes and acceptance marked for release, current package/deployment evidence, and explicit release authorization. A configured CI matrix is not executed evidence.

Existing completion-like boundary names map to one of these levels for compatibility and are reported explicitly in JSON.

User-facing completion vocabulary is correspondingly precise:

- `SLICE_GREEN`
- `GOAL_ENGINEERING_CLOSED`
- `EXTERNAL_EVIDENCE_VERIFIED`
- `REVIEW_DISPOSITION_RECORDED`
- `OWNER_ACCEPTED`
- `RELEASE_READY`

No lower label is presented as a higher label.

## Test migration protection

When an acceptance check or test is replaced, the change records:

```text
old acceptance/test node
replacement positive live-path node
replacement negative or counterexample node
authority reason
affected outcome revision
```

Deleting or weakening a test without this mapping makes the affected acceptance stale. This prevents implementation and tests from silently migrating together into a new self-consistent but incomplete definition.

## Initialization, upgrade, and rollback

- Fresh initialization creates an empty draft outcome registry and performs no repository scan.
- Existing RC contracts receive the new file through an explicit upgrade preview, not an unversioned silent manifest mutation.
- Real 0.6.x migration creates a draft registry and preserves all legacy bytes; it does not infer complete goal coverage from an old checkpoint or issue list.
- Unknown legacy trackers may be proposed as candidate sources only.
- Upgrade and rollback include the registry in the existing three-way byte inventory. Post-upgrade user edits block destructive rollback and are preserved with conflict copies.
- Uninstall preserves a modified outcome registry unless the user explicitly requests Contract removal and ownership checks pass.

The Project Contract manifest advances from schema 1 to schema 2 and adds the `outcome_index` path. The outcome registry begins at schema 1. The package advances to `1.0.0-rc.4` because this is new completion behavior, not a silent RC.3 patch.

The new reader accepts schema-1 Contracts for inspection, migration planning, rollback, and an explicit upgrade. Consequential writes against schema 1 fail with an exact upgrade command. Fresh initialization writes schema 2. The final package remains a review candidate until exact-package, migration, Windows, and independent-review gates pass.

## Context and size limits

The registry is rich on disk but cold by default. Limits apply to:

- outcome count per registry generation;
- title, claim, and reason lengths;
- dependencies and acceptance items per outcome;
- Context shortlist size;
- pagination and stable handles;
- total tracked Contract budget.

Large source inventories remain in project-owned documents or generated sidecars referenced by stable IDs. VibeTether stores traceability, disposition, and acceptance definitions, not thousands of duplicated prose rows or template evidence.

## Failure and recovery behavior

- missing registry at slice boundary: warn for genuinely local work;
- missing or draft registry at goal/release boundary: block with the exact setup command;
- unknown outcome on route start: block before code write;
- candidate/deferred/rejected outcome on route start: block as non-executable;
- changed outcome revision during a route: invalidate completion and require re-anchor;
- missing dependency: keep the outcome blocked and identify the dependency;
- conflicting post-upgrade edits: preserve all versions and require merge;
- corrupt runtime progress: quarantine it and rebuild from verified receipts where possible;
- absent host hooks: state the cooperation limit; do not claim enforcement over a thread that never invokes VibeTether.

## Acceptance tests

The implementation is not accepted until black-box tests prove at least:

1. a satisfied slice cannot pass `doctor --boundary goal` while another required outcome is open;
2. an omitted requirement cannot disappear through a Context shortlist limit;
3. candidates do not govern execution or count as completed coverage;
4. deferral, rejection, supersession, coverage confirmation, and acceptance weakening require a user-grounded decision receipt;
5. a route cannot map evidence to an undeclared or differently revised acceptance item;
6. changing an outcome or its confirmed authority makes prior progress stale;
7. dependencies prevent premature satisfaction;
8. a lower evidence maturity cannot satisfy a higher requirement;
9. test replacement without a positive/negative migration mapping makes progress stale;
10. sibling-worktree evidence cannot produce final goal closure before integration;
11. real v0.6.x migration creates draft coverage without overwriting legacy assets;
12. upgrade/rollback preserves post-upgrade user changes;
13. English and Chinese beginner journeys explain the next action without requiring lifecycle vocabulary;
14. exact packed TGZ installation exercises outcome proposal, confirmation, route mapping, slice success, goal blocking, final goal closure, and release blocking.
15. verified slice completion atomically regenerates `PROGRESS.md`, and a missing, modified, stale, or unwritable projection blocks the completion claim;
16. source-ID count, digest, mapping, duplicate, and disposition errors prevent coverage confirmation and goal completion;

Natural-language longitudinal evaluations additionally cover compaction, stale plans, modified tests, missing external evidence, subagent completion reports, and a green slice with open parent outcomes. Fixed examples are regression evidence, not proof of universal routing accuracy.

## Non-goals

This design does not add:

- a remote issue tracker or project-management UI;
- automatic promotion of documents into authority;
- automatic invention of a complete product specification;
- a background daemon or mandatory host hook;
- a database or multi-tenant orchestration service;
- universal semantic correctness guarantees;
- LoveBuddy-specific IDs or acceptance vocabulary in the generic package;
- permission for a Provider, subagent, or reviewer to close the parent goal.

## Frozen RC4 delivery scope

The RC4 review candidate is limited to:

1. the versioned Outcome Contract;
2. deterministic `.vibetether/PROGRESS.md` generation and ownership checks;
3. slice, goal, and release Doctor boundaries;
4. integration-worktree and final-byte binding;
5. acceptance/test migration mapping;
6. exact source-ID coverage audit;
7. a working project-local command entry;
8. the existing exact-package, v0.6.x migration, CI-matrix, and review-branch Task 6.

UI, databases, daemons, remote project management, additional Provider ecosystems, and project-specific LoveBuddy adapters are outside RC4. The first post-RC4 integration uses anonymized LoveBuddy and gyws failure histories as longitudinal evaluation before a fixed candidate is installed into either live project.

## Design exit contract

The user-approved design authorizes implementation planning for:

- the hybrid Contract/runtime split;
- user-controlled coverage and directional dispositions;
- required outcome mapping for consequential routes;
- slice, goal, and release Doctor separation;
- generic maturity levels with project-specific acceptance;
- no expansion into a database, daemon, or project-management platform.

The implementation must remain inside the frozen RC4 delivery scope and may not claim product or release completion from the design approval itself.
