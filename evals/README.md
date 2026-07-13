# VibeTether Preview Evaluations

The preview suite checks whether VibeTether's deterministic control contract routes known drift pressures to the expected preflight and gate. It covers context compaction, document conflicts, safe reversible preparation while a direction gate is pending, structural technical decisions, and multi-screen UI propagation.

Run it with:

```sh
npm run eval
```

Each fixture declares the input state, pressure, applicable truth sources, isolated routing signal, expected preflight class, expected gate, prohibited action, and required evidence. The runner validates those declarations against the stable control-kernel routing table.

## Honesty boundary

This is a schema and policy consistency suite. It does not run an autonomous coding agent, measure drift reduction, compare models, simulate a genuinely long context, or prove that a host will automatically invoke the Skill. These checks are not independent agent forward tests and cannot justify a `1.0.0` claim.

The public `0.1.0` release is therefore a preview. Independent baseline-versus-Skill pressure tests must report model and host versions, scenario artifacts, compliance, rationalizations, overhead, failures, and limitations before stronger claims are made.
