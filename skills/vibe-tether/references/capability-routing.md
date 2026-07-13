# Capability Routing

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

Every provider invocation records capability, phase, provider, version or source, selection reason, expected output, and exit evidence.

## Phase Map

| Observed state | Required capability | Exit evidence |
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

1. Honor an explicitly named applicable provider.
2. Use one primary workflow provider per phase.
3. Add only non-overlapping domain providers.
4. Prefer installed, approved, compatible, evaluated, and pinned providers.
5. Treat equivalent providers as alternatives, not a stack.
6. Keep project truth above provider instructions.
7. Use a minimal built-in safe path for absent optional capabilities.
8. Stop for absent mandatory security, migration, UI-validation, or release capability.

Do not select by stars alone. Popularity is a discovery signal. Evaluate behavior, maintenance, license, compatibility, context cost, and trigger collision.

## Installation Boundary

Resolve and install providers during an auditable initialization, update, or repair operation. Record source, immutable version, license, integrity, supported harnesses, capabilities, dependencies, conflicts, and evaluation status.

Never silently download a new provider during an active coding task. Propose a repair plan when a required provider is missing.

## UI Provider Roles

Do not conflate:

- product and UX framing;
- aesthetic direction;
- design-system intelligence;
- frontend engineering;
- browser or visual validation;
- accessibility and performance audit.

Use one aesthetic director. Existing design systems take precedence. Product applications and marketing surfaces may require different providers.

