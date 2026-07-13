# Reusable Success Capture

## Core Rule

After every verified user-level or engineering-level success, decide whether the result establishes or changes a reusable workflow. The first verified reusable path must be captured immediately even when the first attempt succeeded.

Evidence proves success. The checkpoint only records how the experience was handled.

## Trigger Classes

| Trigger | Meaning | Required disposition |
| --- | --- | --- |
| `first-proven-path` | A reusable workflow succeeds for the first time in this project or environment | `captured` |
| `recovered-path` | A failing workflow succeeds after investigation or changed conditions | `captured` |
| `changed-proven-path` | A known workflow succeeds with materially changed versions, permissions, environment, or steps | `captured` |
| `repeat-proven-path` | An unchanged documented or automated workflow succeeds again | `already-encoded` |
| `routine-non-path` | A routine result does not establish a reusable workflow | `not-reusable` |

A reusable path completes a user-level or engineering-level outcome another person or agent may need to repeat: local bootstrap, build, CI, deployment, publication, migration, rollback, authentication setup, external-service connection, incident recovery, or a real acceptance workflow. A single ordinary formatter or already-routine test invocation is not a reusable path by itself.

Do not classify a first proven path as `already-encoded` merely because the newly successful implementation exists. The first proof needs a concise durable record that says when to use it and how success was verified.

## Five Diagnostic Questions

Use these questions to determine what changed and what the record needs:

1. Did success follow failure, correction, or multiple attempts?
2. Did a non-obvious port, flag, order, permission, version, operating system, network, or environment condition matter?
3. Will the workflow recur, or would rediscovery be costly?
4. Does it cross a deployment, release, migration, data, authentication, security, permission, or external-service boundary?
5. Did it reveal missing, wrong, or stale documentation, tests, scripts, or automation?

These questions enrich the record. They do not make first success optional.

## Destination Router

| Knowledge | Durable destination |
| --- | --- |
| Deterministic behavior, compatibility, or regression | Test, script, linter, validator, or CI rule |
| Build, local environment, deployment, publication, authentication, recovery, or external service | Existing runbook or a focused `docs/operations/` document |
| Architecture or difficult-to-reverse technical decision | ADR |
| Product goal, scope, workflow, or acceptance decision | Product specification or Intent Contract |
| Repeated project-local agent convention | Project instruction or its referenced document |
| Cross-project agent method | VibeTether Skill reference plus evaluation scenario |

Use executable enforcement first when possible, then document when and why to use it. Do not create a universal success ledger. When a new durable source is created, route it from the project manifest so later re-anchors can find it.

## Minimum Proven Path

A captured path records only durable facts:

- use when;
- prerequisites and authorization boundary;
- relevant operating system, tool, and version constraints;
- safe known-good sequence;
- non-obvious ports, flag names, ordering, permission type, and environment-variable names;
- fresh success evidence;
- rollback and cleanup;
- revalidate when;
- status when the path is provisional, replaced, or obsolete.

Do not copy a complete transcript. Failed alternatives belong in the record only when they prevent a likely repeat mistake.

## Checkpoint Disposition

Keep the checkpoint small:

```yaml
experience_feedback:
  trigger: first-proven-path
  disposition: captured
  reason: First verified publication workflow for this repository.
  artifacts:
    - docs/operations/publication.md
```

Valid final dispositions are:

- `captured`: first, recovered, or changed path; at least one durable artifact exists;
- `already-encoded`: unchanged repeated path; at least one existing enforcing artifact exists;
- `not-reusable`: routine non-path; a reason exists and artifacts stay empty.

`pending` is valid only while work is in progress. A completion-like checkpoint must pass `vibetether doctor` before the agent claims completion.

## Security and Redaction

Never persist:

- passwords, tokens, private keys, recovery codes, or one-time codes;
- environment-variable values or credential-bearing command lines;
- private user data or sensitive tool output;
- raw chain-of-thought, private reasoning, or full provider responses.

Persist safe structure instead: authentication method, permission scope, protocol, host, port, flag name, fingerprint-verification method, key lifetime, cleanup rule, and placeholders such as `<ephemeral-key-path>`.

If a safe record cannot be written without exposing a secret, record the method and redaction boundary, not the secret.

## Boundary Algorithm

1. Verify the user-level or engineering-level outcome from fresh evidence.
2. Search applicable project truth, runbooks, tests, scripts, and CI for the workflow.
3. Classify the trigger.
4. Capture or update a durable source for first, recovered, or changed paths.
5. Point to existing artifacts for an unchanged repeat; create nothing new.
6. Mark a routine result `not-reusable`; create nothing new.
7. Redact sensitive data and verify every recorded artifact exists.
8. Update `experience_feedback` and run `vibetether doctor` at the completion boundary.
9. On the next similar task, read the applicable Proven Path before inventing a new route.

## Rationalization Counters

| Rationalization | Required response |
| --- | --- |
| "It worked on the first try, so there is nothing to learn." | First verified reusable workflows are exactly when a Proven Path is established. |
| "The code itself documents the path." | Code rarely records authorization, environment, verification, cleanup, or revalidation boundaries. |
| "I will document it if it fails next time." | Capture the first proof; later failure should update the record, not force rediscovery. |
| "Every success should be logged for safety." | Capture reusable paths, not routine commands or transcripts. |
| "The checkpoint proves it worked." | Fresh external evidence proves success; the checkpoint records disposition only. |
| "The credential is necessary for reproduction." | Record credential type, scope, acquisition, and cleanup, never credential material. |

## Red Flags

- claiming completion while `experience_feedback.disposition` is `pending`;
- first verified deployment, publication, migration, bootstrap, or integration without a durable artifact;
- creating a second runbook for an unchanged repeat;
- documenting a workaround as canonical without a provisional status or revalidation trigger;
- persisting secret values, private reasoning, or a full transcript.

Any red flag means stop the completion claim, repair the disposition or durable artifact, and rerun the audit.
