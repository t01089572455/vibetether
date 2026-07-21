---
name: vibe-tether-deep
description: Prepare and govern high-ambiguity or high-impact coding work before implementation. Use when the user explicitly requests deep mode, asks for facts and assumptions to be checked before work, or when product direction, public behavior, architecture, data, security, permissions, migration, or release choices require a user-approved Start Card and Implementation Permit.
---

# VibeTether Deep

Use this Skill for work that must not begin from guessed intent.

1. Run `vibetether context --task "<request>" --boundary task-entry --json`.
2. Read only applicable confirmed Truth and inspect discoverable repository facts. Do not ask the user for facts the repository or an authoritative source can answer. Do not write product code.
3. Expand the request into the smallest complete Start Card: exact task, bounded slice, approved paths, permissions, success evidence, executable success checks, verified facts, explicit assumptions, and user-owned decisions.
4. Run `vibetether deep prepare ...`. It returns exactly one `next_question`.
5. Ask only that question. State a concrete recommended answer and its impact, then wait for the user's reply. Never answer it on the user's behalf and never batch later questions into the same turn.
6. Record the normalized decision with `vibetether deep answer --question-id <ID> --selected-option "<decision the user made>" --user-message-locator "<durable user-message reference>"`. Ask the next returned question and repeat.
7. When status becomes `awaiting-final-confirmation`, show the complete resolved Start Card, including evidence verifiers and the strongest counterexample considered. Ask whether this exact card may govern implementation.
8. Only after that reply, create the machine-readable resolution and run `vibetether deep permit --confirmed-by-user --reason "<exact approval>" --resolution-json '<JSON>'`.
9. Start the controlled step with `vibetether step start --deep ...`. Its task, slice, phase, capability, scope, permissions, and success checks must match the Permit.

A Start Card is planning evidence, not permission. A decision receipt records the Agent's durable interpretation of a user message; without a mandatory host hook it is not cryptographic proof of authorship. The final confirmation is required to catch a wrong expansion before coding.

The Permit expires or is consumed when the step exits. It becomes stale when its Start Card, answer receipts, authority, control generation, worktree, task, slice, approved scope, permissions, or success checks change. It does not authorize credentials, networking, external writes, destructive data changes, migration, deployment, publication, or release unless those exact permissions were included and separately approved.
