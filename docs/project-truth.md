# Project Truth and Document Lifecycle

VibeTether separates project authority from repository discovery. A filename such
as `PRD.md`, `AGENTS.md`, or `0001-architecture.md` is evidence about possible
meaning, not permission to govern implementation.

## The entry list

`.vibetether/TRUTH.md` has three project-document states:

- **Confirmed project truth** may govern work in its declared role and scope.
- **Candidates awaiting confirmation** are proposals and remain non-authoritative.
- **Declined candidates** remember reviewed rejections without making them active.

The file also points to host bootstrap and control-plane artifacts. Those entries
explain how VibeTether runs; they are not product decisions.

Initialization creates the blank list and does not scan or activate repository
documents. You can edit it directly, or ask the Agent to help in ordinary language.

## Find and activate candidates

Try:

> Search this project for candidate instruction, product, requirements,
> architecture, UI, testing, operations, and release documents. Inspect their
> content, explain each proposed role and scope, identify conflicts, and ask me to
> confirm activation one candidate at a time.

The Agent may add safe findings to the candidate section. Finding or listing a
candidate never authorizes implementation from it. Every active addition requires
user confirmation.

A specification, ADR, design decision, or goal document generated during a
conversation follows the same rule: it can become a candidate, then receives a
separate activation decision. Agreement with the conversation is not implicit
approval to change the durable truth list.

## Change an existing entry

Ask the Agent to inspect references and propose the smallest registry change:

> Move the approved UI specification to its new path, check incoming references,
> and ask me before changing active truth.

> This ADR is obsolete. Propose its replacement and supersession reason, but do not
> activate or delete anything until I confirm.

Moves, deletes, role changes, scope changes, removals, and supersession of active
entries all require user confirmation. Candidate notes may be refined without
changing authority. VibeTether preserves unrelated user prose and rejects
duplicate, absolute, escaping, linked, or malformed active entries.

## When the Agent rereads truth

A full re-anchor happens at task entry and when goal, phase, scope, risk,
authority, or a source changes; after compaction, resume, or handoff; and before a
merge, deployment, release, or publication. The Agent reads the host instructions,
manifest, truth map, intent, checkpoint, and only the confirmed sources applicable
to the active scope.

For an unchanged low-risk slice, the Agent compares the checkpoint and known
source fingerprints and rereads only affected sources. It does not load the full
documentation corpus before every local edit.

## Truth and successful experience

`.vibetether/TRUTH.md` controls what the project requires.
`.vibetether/experience-index.yaml` points to procedures that previously worked.
A runbook may help execute current truth, but it cannot override product direction,
architecture, visual direction, or current release policy.

If confirmed truth and applicable experience disagree, the Agent stops the
affected consequential action, shows both sources and their practical impact,
recommends one durable correction, and asks the user. Read-only investigation may
continue. Platform safety and permission boundaries are not overridable choices.

## What is automatic

VibeTether's CLI creates and validates the control structure. The managed
`AGENTS.md` or `CLAUDE.md` block tells a cooperating host when to re-enter it. The
Agent supplies semantic judgment: candidate discovery, applicability, conflict
explanation, selective rereading, routing, and experience proposals. The user owns
activation decisions.

This is behavioral control, not a background daemon or security sandbox. Run:

```sh
vibetether doctor --project . --json
```

Doctor validates structure, contained paths, control state, and pending
dispositions. It does not pretend to prove semantic correctness or user approval.
