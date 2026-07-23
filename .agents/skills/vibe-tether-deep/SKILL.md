---
name: vibe-tether-deep
description: Prepare and govern high-ambiguity or high-impact coding work before implementation. Use when the user explicitly requests deep mode, asks for facts and assumptions to be checked before work, or when product direction, public behavior, architecture, data, security, permissions, migration, or release choices require a user-approved Start Card and Implementation Permit.
---

# VibeTether Deep

Use Deep when coding from a guess would create expensive rework. The goal is not a larger plan; it is a user-confirmed, bounded implementation permit.

1. At task entry and after any phase or slice change, compaction or resume, handoff, repeated failure, or merge—and before a consequential decision or completion-like boundary—run `vibetether context --task "<request>" --boundary task-entry --json`.
2. Read applicable confirmed Truth and inspect discoverable facts. Do not ask the user for facts the repository or an authority can answer, and do not write product code.
3. Prepare the smallest complete Start Card: goal, exact slice, scope, permissions, facts, assumptions, user-owned decisions, success evidence, executable checks, and a counterexample challenge.
4. Ask exactly one unresolved user decision at a time, with a recommendation and impact. Wait for the answer; never choose a product, visual, architectural, security, data, or release direction on the user's behalf.
5. Show the resolved card and ask for confirmation of that exact slice. Only then create an Implementation Permit and start the matching controlled step.

The Permit binds the task, slice, Truth, worktree, permissions, Provider, and checks. It expires or becomes stale when any of them changes. It does not authorize credentials, networking, destructive data work, migration, deployment, publication, or release unless those exact permissions were separately approved.

`SLICE_GREEN` is not `GOAL_ENGINEERING_CLOSED` or `RELEASE_READY`: governed Outcomes, source coverage, integration bytes, external/review/owner evidence, and release authorization retain their own gates. The user owns Truth and Outcome decisions; a Start Card records the Agent's interpretation, not proof of user identity.

Without a mandatory host hook, VibeTether still depends on Agent cooperation. Use the managed host instructions and CLI re-entry points, but never claim the Skill can force an uninvoked Agent to stop.
