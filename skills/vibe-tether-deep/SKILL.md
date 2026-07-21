---
name: vibe-tether-deep
description: Prepare and govern high-ambiguity or high-impact coding work before implementation. Use when the user explicitly requests deep mode, asks for facts and assumptions to be checked before work, or when product direction, public behavior, architecture, data, security, permissions, migration, or release choices require a user-approved Start Card and Implementation Permit.
---

# VibeTether Deep

Use this Skill only for work that needs an explicit user-confirmed start gate.

1. Run `vibetether context --task "<request>" --boundary task-entry --json`.
2. Investigate discoverable facts without writing product code.
3. Prepare a Start Card with `vibetether deep prepare`, naming the bounded slice, success evidence, facts, assumptions, and decisions still owned by the user.
4. Show the Start Card and recommended decisions to the user. Do not start implementation.
5. After explicit user confirmation, run `vibetether deep permit --confirmed-by-user --reason "<what the user approved>"`.
6. Start the controlled step with `vibetether step start --deep ...`. The step must match the permitted slice.
7. The permit expires or is consumed when the step exits, and becomes stale when authority, control generation, or worktree identity changes.

A Start Card is planning evidence, not permission. An Implementation Permit authorizes only its exact slice and does not authorize deployment, migration, credential access, destructive data changes, or release unless those permissions were separately approved.
