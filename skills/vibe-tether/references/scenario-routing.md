# Scenario Routing

Use this guide after the readiness check. Infer task signals from the user's request, the current lifecycle state, and repository evidence; then query the project capability board. Signals describe observable facts, not hidden reasoning.

The IDs below are contract-linked to `registry/scenarios.json`. The generated `.vibetether/capabilities.yaml` carries the same scenario catalog.

| Scenario ID | Situation | Route |
| --- | --- | --- |
| `vague-project` | Goal, scope, or acceptance is unclear | Route to requirements clarification with `grilling`; ask one user-owned decision at a time. |
| `document-conflict` | Durable sources disagree | Route to document alignment, apply authority order, and stop if the conflict remains. |
| `unfamiliar-codebase` | Repository entry points are unclear | Route to `codebase-design` before planning or editing. |
| `huge-effort` | Work spans many workstreams or context windows | Use VibeTether milestone and checkpoint wayfinding; advertise `wayfinder` only as a catalog alternative. |
| `prototype-choice` | A runnable experiment can answer a bounded uncertainty | Route to `prototype` with a learning goal and discard boundary. |
| `new-behavior` | An approved slice adds behavior | Keep VibeTether as primary and compose `karpathy-guidelines` as a policy overlay. |
| `bug-diagnosis` | Unexpected behavior has no proven cause | Route to `systematic-debugging` before proposing a fix. |
| `ui-direction` | Visual direction is unapproved | Create a UI Intent Contract and golden reference; use `frontend-design` only when exposed by `extended`. |
| `web-implementation` | React, Next.js, React Native, or Vercel work is active | Route to the highest-priority matching Web specialist after UI direction is approved. |
| `compaction-handoff` | Context was compacted, resumed, or handed off | Perform a full VibeTether re-anchor; upstream handoff commands remain catalog alternatives. |
| `triage-qa` | Several issues need reproduction and priority | Use the built-in evidence-first triage path; `triage` and `qa` remain catalog alternatives. |
| `architecture-improvement` | Structural friction suggests a durable change | Investigate and recommend, then obtain user confirmation before changing architecture. |
| `production-migration` | A migration or deprecation is proposed | Route to `deprecation-and-migration` and retain destructive-data confirmation gates. |
| `first-proven-path` | A reusable workflow succeeds for the first verified time | Capture a sanitized durable Proven Path immediately; do not wait for a future failure. |
| `completion` | A completion claim is imminent | Route to `verification-before-completion` and require fresh evidence. |

## How to choose

1. Identify the current phase and one capability.
2. Record only signals supported by the request, repository, or current evidence.
3. Resolve the board route for the active harness.
4. Use `primary` as the workflow recommendation, compose only compatible `overlays`, and treat `alternatives` as fallbacks rather than a stack.
5. If there is no automatic provider, use the declared VibeTether fallback. A catalog-only Skill is discoverable, not silently invokable.
6. Preserve every high-risk confirmation gate regardless of provider choice.
7. Require the route's outputs and exit evidence before changing phases.

The resolver returns `primary`, `overlays`, `alternatives`, `detected_signals`, `rationale`, `fallback`, `required_outputs`, and `exit_evidence`. Compatibility fields such as `recommendation`, `selection`, and `expected_outputs` remain available for existing integrations.
