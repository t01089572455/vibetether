# Proven Path Capture and Recall

A workflow that succeeds once can contain more operational value than a long
generic checklist. VibeTether makes that value durable without saving a private
transcript.

## The Success Capture Gate

After every verified user-level or engineering-level success, the agent must
classify the result:

- `captured`: the user confirmed a reusable workflow and it was indexed;
- `already-encoded`: an unchanged documented path worked again, so no duplicate
  is created;
- `not-reusable`: the result was too local or trivial to preserve, with a reason.

A reusable first success becomes a `first-proven-path` candidate, even when it
worked on the first attempt. Prior failure is not required. A recovered path or
a path whose decisive conditions changed proposes an update. The Agent presents
the sanitized candidate; active indexing requires user confirmation. A deferred
decision remains pending and cannot pass a completion-like `doctor` gate.

## What deserves capture

Capture a verified path when repeating discovery would waste meaningful time,
especially for:

- build or packaging commands;
- local environment, version, port, permission, or system setup;
- CI, deployment, release, or publish workflows;
- migrations, authentication, or external-service integration;
- Windows lock recovery or other platform-specific sequencing;
- a first verified user journey whose setup is not obvious.

The decisive condition can be a parameter, command order, pinned version,
permission, host state, network endpoint, or verification step. Capture only
what another agent needs to reproduce and revalidate the path.

## Where it lives

`.vibetether/experience-index.yaml` contains safe metadata and artifact pointers.
The durable body belongs in its natural project source:

- deterministic behavior in tests and validators;
- operations in `docs/operations/` runbooks;
- architecture in ADRs;
- product behavior in specifications;
- local environment constraints in the project setup guide.

The checkpoint records the disposition and artifact paths. A completion-like
state with a pending disposition fails
`node .vibetether/bin/vibetether.mjs doctor --project . --boundary completion`.

Confirmed project truth and experience have different jobs: truth says what the
project requires; experience says how a procedure previously worked. If they
conflict, the Agent stops the affected action, recommends which durable source to
update, and asks the user. It never lets an old runbook override current direction.

## Recall before rediscovery

At task entry and relevant phase boundaries, route resolution can return
`applicable_experience`: matching metadata, status, artifact paths, and
revalidation needs. The agent reads only the selected artifact before inventing
a new operational path. It does not inject every runbook into every prompt.

A changed environment, provisional path, or stale prerequisite requires fresh
verification. If no path matches, the agent records that honestly rather than
fabricating experience.

## Safety boundary

Never capture credentials, passwords, tokens, private keys, one-time codes,
private reasoning, private transcripts, or sensitive tool output. Sanitize
examples and keep authentication mechanics separate from secrets. A Proven Path
explains how to reproduce and verify a workflow, not who authorized it or what a
secret value was.
