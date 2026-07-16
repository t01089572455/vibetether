# Project Truth Lifecycle

## Purpose

Use the `truth_index` declared in `.vibetether/project.yaml` as the human-readable entry list for durable project authority. The normal path is `.vibetether/TRUTH.md`. It answers which documents govern the active task; it does not copy their content and it does not make every repository document authoritative.

The project owns this file. VibeTether may create the initial blank scaffold, validate its structure, and help edit it. It must not silently discover or activate project documents.

If a legacy project already used `.vibetether/TRUTH.md` as a prose authority document before the canonical index existed, initialization preserves that document byte-for-byte, routes `truth_index` to `.vibetether/TRUTH-MAP.md`, and keeps the legacy document as confirmed authority. Always follow the manifest route rather than assuming the filename.

Do not put transient Git or task state here. Branch, HEAD, dirty files, active worktree, route instance, current phase, and exit evidence belong in `.vibetether/state/`, where VibeTether can compare them without turning implementation accidents into project authority.

## Entry States

- **Confirmed project truth** governs work in its declared role and scope.
- **Candidates awaiting confirmation** are visible proposals only. They are non-authoritative.
- **Declined candidates** record a reviewed rejection so the same document is not repeatedly proposed without new evidence.
- Host and control-plane entries identify bootstrap mechanics, not product direction.

Every entry needs a portable project-relative path, a role, and a scope. Optional source and reason fields explain provenance without duplicating normative prose.

## Read Order

At task entry or a full re-anchor:

1. read the nearest host instructions;
2. read `.vibetether/project.yaml` to locate control artifacts;
3. read the manifest-declared `truth_index`;
4. read `.vibetether/intent.md` and the current checkpoint;
5. select only confirmed entries whose role and scope apply;
6. read those original documents;
7. query only applicable experience and capability routes.

At an unchanged low-risk slice, compare the checkpoint, task scope, and known source fingerprints. Reread only changed or newly applicable confirmed sources. A changed goal, phase, scope, risk, authority, source, compaction, resume, handoff, merge, deployment, release, or publication boundary requires a full re-anchor.

## Natural-Language Workflows

### Find candidates

When the user asks the Agent to find project truth:

1. search likely instruction, product, requirements, architecture, UI, testing, operations, and release locations;
2. inspect content rather than classifying by filename alone;
3. explain the proposed role, scope, authority evidence, and any conflict;
4. add safe findings to the candidate section;
5. ask the user to confirm activation one candidate at a time.

Finding a candidate does not authorize implementation from it.

### Add a conversation-generated document

A specification, ADR, design decision, or goal document generated during an approved conversation becomes a candidate when it appears durable and governing. Explain what it would control and ask for a separate activation decision. Approval of the discussion is not implicit approval of registry activation. A later request to "continue" is not activation unless it explicitly approves the candidate path, role, scope, and any supersession; no special command phrase is required.

### Promote or decline

After explicit confirmation, move one entry from candidates to confirmed or declined without rewriting unrelated user prose. Record the confirmed role and scope. Never leave the same path in multiple states.

### Move, delete, or supersede

Before moving or deleting a confirmed source, find incoming references and ask the user to confirm the registry change. Update the document and truth entry as one recoverable operation. For supersession, identify the replacement and preserve a short provenance reason; do not keep both active when their authority conflicts.

Changes to active role, scope, order, removal, or supersession always require user confirmation. Candidate notes may be refined without changing authority.

## Authority and Conflict Rules

- Confirmed project truth outranks Agent preference and optional provider advice.
- Experience describes a previously successful procedure; it does not redefine product intent, architecture, UI direction, or current release policy.
- If confirmed truth and experience conflict, stop only the affected action, show the exact mismatch, recommend updating or retiring one durable source, and ask the user.
- If two confirmed sources conflict and declared authority does not resolve them, ask the user.
- If a confirmed directional source changes materially without explicit approval of that exact change, preserve work, record a blocked or alignment checkpoint, and ask before treating the changed direction as authoritative.
- Platform safety, permissions, and legal constraints cannot be weakened by project truth.

## Editing Safety

Preserve user prose and ordering outside the entry being changed. Reject absolute, linked, escaping, duplicate, or malformed active entries. Never write credentials, private keys, one-time codes, private reasoning, or sensitive tool output into the truth map.

After an active registry change, reconcile the route explicitly:

```bash
node .vibetether/bin/vibetether.mjs truth reconcile --project . \
  --decision applied \
  --candidate docs/approved-direction.md \
  --reason "The user confirmed this path, role, scope, and supersession."
node .vibetether/bin/vibetether.mjs doctor --project . --boundary ordinary --json
```

Use `candidate-pending` while user confirmation is outstanding and `declined` only after the path appears in the matching Truth Map section. Candidate paths may be regular files or project directories. `candidate-pending` and `declined` cannot absorb changes to confirmed authority; `applied` may re-anchor only its declared confirmed path, so additional confirmed-source or Intent changes require a separate consequential route. Reconciliation validates the current section and records the decision; it does not modify the Truth Map. Doctor validates structure, fingerprints, and path safety; it does not claim semantic understanding or user approval.
