# ADR 0001: Lean control kernel with repository Contract and worktree runtime

- Status: accepted
- Date: 2026-07-20

## Context

The 0.x design combined project authority, runtime state, generated routing data, installed Provider copies, and historical evidence under `.vibetether`. This made worktree continuity fragile and encouraged Agents to read large, stale files. Structurally valid but semantically obsolete Experience could remain influential. A singleton checkpoint could not safely support parallel linked worktrees.

## Decision

VibeTether 1.0 uses four scopes:

1. **User scope:** a small global dispatcher, entry Skill, Provider object cache, and local state roots.
2. **Repository scope:** a compact, reviewable Contract containing Intent, Truth, Experience metadata, routes, and Provider pins.
3. **Worktree scope:** current projection, active route, lease, evidence, activations, and journal outside the repository.
4. **Step scope:** one bounded slice, one Provider, one authority snapshot, and fresh evidence.

The Agent obtains state through a compact Context Broker. Low-impact work begins as lightweight observation and escalates one-way to a controlled session when behavior, structure, authority, permissions, risk, scope, or persistent coordination materially changes. Explicit deep work requires a Start Card and user-confirmed Implementation Permit. Raw runtime, cold Provider catalogs, unselected Skills, and unselected Experience do not enter default context. Git worktrees are related by `git-common-dir`; their private Git directories provide stable worktree identities.

Provider selection follows hard compatibility and permission filters before quality ranking. Only one primary Provider is active. Large Providers use worker mode. Authority and procedure are separate: confirmed Truth governs direction; Experience describes a previously verified method and loses trusted status when inputs drift.

## Consequences

Positive:

- small and bounded default context;
- parallel worktrees without state overwrite;
- version-pinned but globally discoverable operation;
- safe continuous expansion of the Skill catalog;
- explicit migration and rollback;
- deterministic evidence and stale-history handling.

Trade-offs:

- local runtime is not transported by Git;
- a host Agent must cooperate with the entry instructions;
- content hashes cannot prove semantic correctness;
- external Provider script execution is not sandboxed;
- team portability requires committing the repository Contract.
