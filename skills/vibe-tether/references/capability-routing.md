# Capability Routing

## Generated Capability Board

Treat `.vibetether/capabilities.yaml` as the project-local, advisory routing index. It lists every built-in capability, every installed Skill with invocation policy and availability, and the installed profile's community routes. Read it at task entry, phase changes, resume, compaction recovery, and before consequential actions.

The board answers five questions without taking control away from the agent:

1. Does the current signal set benefit from a specialist Skill?
2. Which installed Skill is the best fit for the current phase and capability?
3. Which alternative remains available if the preferred route cannot run?
4. What built-in fallback keeps work safe without downloading anything?
5. Which outputs and exit evidence are required before moving on?

Recommendations are advisory. Select the recommended Skill when it fits, otherwise select an installed alternative or fallback and record the material reason. High-risk confirmation gates remain mandatory and are independent of ordinary provider selection.

## Automatic Readiness Before Provider Selection

The board's `readiness_gate` is automatic even though specialist recommendations remain advisory. At task entry and every re-anchor boundary, classify all readiness dimensions before implementation. Investigate discoverable facts autonomously; route unresolved direction to requirements clarification, document conflicts to document alignment, missing design decisions to product or UI design, and missing slices or evidence to planning. Implementation may start only at `READY_FOR_IMPLEMENT_ONE`.

Upstream command metadata may prevent the host from implicitly invoking a literal alias. This does not remove the underlying capability. `grill-me` is automatically covered by model-invokable `grilling`; `grill-with-docs` is automatically covered by `grilling` plus the non-overlapping `domain-modeling` provider.

## Contract

Route by capability rather than provider name:

```yaml
capability: requirements_clarification
inputs:
  - unresolved_questions
  - intent_contract
  - applicable_sources
must_return:
  - clarified_decisions
  - remaining_ambiguities
  - approval_status
exit_gate:
  - no_unresolved_directional_ambiguity
```

Every provider decision records capability, phase, recommended provider, selected provider or fallback, version or source when invoked, selection reason, invocation status, expected output, and exit evidence.

## Phase Map

| Observed state | Relevant capability | Exit evidence |
| --- | --- | --- |
| Goal, user, scope, or success unclear | Requirements clarification | Approved Intent Contract |
| Project sources conflict | Document alignment | Conflict resolved in durable truth |
| Direction exists; solution does not | Product or UX design | Approved design and non-goals |
| Approved design needs slices | Implementation planning | Files, tests, evidence, and stop conditions |
| New behavior or defect | TDD implementation | RED, GREEN, REFACTOR evidence |
| Unexpected behavior | Systematic diagnosis | Reproduction, root cause, regression proof |
| User-visible interface | UI product design and frontend engineering | Approved golden screen plus functional evidence |
| Running interface | Browser verification | Tasks, states, console/network, desktop/narrow evidence |
| Implementation claims readiness | Code or security review | Findings resolved or explicitly accepted |
| Merge or release is proposed | Completion and release verification | Fresh full gate evidence |

## Provider Selection

1. Honor an explicitly named applicable provider when it does not conflict with project truth or a high-risk gate.
2. Recommend one primary workflow provider per phase.
3. Add only non-overlapping domain providers.
4. Prefer installed, approved, compatible, evaluated, and pinned providers.
5. Treat equivalent providers as alternatives, not a stack.
6. Keep project truth above provider instructions.
7. Use a minimal built-in safe path for absent optional providers.
8. Stop for absent mandatory security, migration, UI-validation, or release capability.

Resolve matching routes by phase and capability, require every `signals.all` item, require at least one `signals.any` item when present, then sort by descending priority. Prefer the first available match for the current harness. If the highest-priority recommendation is unavailable, use the next matching installed route; otherwise use its declared fallback. Record the choice rather than pretending the preferred Skill ran.

Do not select by stars alone. Popularity is a discovery signal. Evaluate behavior, maintenance, license, compatibility, context cost, and trigger collision.

## Installation Boundary

Resolve and install providers during an auditable initialization, update, or repair operation. Record source, immutable version, license, integrity, supported harnesses, capabilities, dependencies, conflicts, and evaluation status.

Never silently download a new provider during an active coding task. For an optional missing provider, use the declared fallback and continue. Propose a repair plan when a mandatory safety or release capability is missing.

## UI Provider Roles

Do not conflate:

- product and UX framing;
- aesthetic direction;
- design-system intelligence;
- frontend engineering;
- browser or visual validation;
- accessibility and performance audit.

Use one aesthetic director. Existing design systems take precedence. Product applications and marketing surfaces may require different providers.
