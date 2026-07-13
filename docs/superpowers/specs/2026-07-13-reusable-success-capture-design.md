# Reusable Success Capture Design

Date: 2026-07-13  
Status: approved direction; written-spec review pending

## Problem

Coding agents often notice failures because failures block progress. They are less reliable at noticing that a later success contains a reusable discovery. After a command finally works, the agent may report completion without preserving the non-default port, required flag, environmental condition, verification sequence, or cleanup step that made it work. The next agent then repeats the investigation.

VibeTether already requires durable decisions, reusable failures, evidence, and checkpoints. It does not yet require an explicit decision about reusable success. A sentence in the Skill is insufficient: under long context, time pressure, or a satisfying tool result, the model can still skip it.

## Goals

- Make success salience an automatic check at recovery and completion boundaries.
- Mechanically prove that the agent made a capture decision.
- Persist only reusable, non-obvious knowledge in the correct durable project source.
- Make later agents consult applicable proven paths before inventing a new route.
- Keep the mechanism portable across Codex and Claude projects.
- Prevent secrets, private reasoning, and noisy routine successes from entering documentation.

## Non-Goals

- Perfect semantic classification without model judgment.
- An append-only transcript, activity log, or second source-of-truth tree.
- Automatic commits, remote publication, or arbitrary document mutation.
- Host-specific background monitoring as a requirement for the portable Skill.
- Capturing every successful command.

## Considered Approaches

### A. Documentation reminder

Add one completion checklist item asking the agent to record useful lessons. This is easy to ship but is not inspectable and is likely to disappear under context pressure.

### B. Salience gate plus deterministic disposition — selected

The model classifies semantic salience. Managed instructions and the VibeTether Skill trigger the check. The checkpoint stores a structured disposition. `vibetether doctor` mechanically rejects a completion-like state whose disposition is missing or pending. Durable knowledge is routed to the existing authoritative artifact type.

This separates what requires judgment from what can be enforced mechanically and avoids a duplicate knowledge hierarchy.

### C. Universal success ledger

Append every success to a VibeTether-owned log. This is easy to automate but creates noise, may duplicate authoritative documents, and increases the risk of persisting secrets or transient identifiers.

## Trigger Model

Every verified user-level or engineering-level success runs the Success Capture Gate. The first question is whether the outcome establishes a reusable path, not whether it previously failed.

Classify the trigger as:

- `first-proven-path`: a reusable workflow succeeds for the first time in the current project or environment; capture it immediately even when the first attempt succeeded;
- `recovered-path`: a previously failing workflow succeeds after investigation or changed conditions; create or update its Proven Path;
- `changed-proven-path`: a previously proven workflow succeeds under materially changed versions, permissions, environment, or steps; update its artifacts;
- `repeat-proven-path`: an unchanged documented or automated workflow succeeds again; point to the existing encoding without duplicating documentation;
- `routine-non-path`: a routine, self-evident result does not establish a reusable workflow.

A reusable path completes a user-level or engineering-level outcome that another agent or person may need to repeat, such as local bootstrap, build, CI, deployment, publication, migration, rollback, external-service connection, incident recovery, or a real acceptance workflow. A single ordinary formatter or already-routine test invocation is not a reusable path by itself.

Use the following five questions to decide what the record must contain and whether an existing Proven Path changed:

- an action succeeds after one or more failed attempts;
- a non-default port, flag, command order, version, operating-system setting, or permission made the difference;
- the result is likely to recur and would be expensive to rediscover;
- the result crosses a consequential deployment, release, migration, data, authentication, security, permission, or external-service boundary;
- the result reveals that existing documentation, tests, scripts, or automation are missing, wrong, or stale.

`first-proven-path`, `recovered-path`, and `changed-proven-path` require durable capture. `repeat-proven-path` must not create a duplicate. `routine-non-path` must not create documentation noise.

## Disposition Contract

The checkpoint carries an `experience_feedback` object:

```yaml
experience_feedback:
  trigger: null
  disposition: pending
  reason: ""
  artifacts: []
```

Before a completion-like state passes audit, `disposition` must be one of:

- `captured`: a first, recovered, or changed Proven Path was written to the correct durable source; at least one artifact is named.
- `already-encoded`: an unchanged repeated path is already enforced by a test, script, validator, CI workflow, or existing authoritative document; at least one artifact is named.
- `not-reusable`: the success is routine or one-off; a concise reason is present and no new document is created.

The model determines the trigger and disposition from verified evidence and existing project artifacts. `first-proven-path` cannot be dismissed as `already-encoded` merely because the newly successful implementation itself exists; it needs a concise durable record of when and how the path was proven. The validator checks that the decision exists, is internally consistent, and does not remain `pending` at completion. It cannot prove that the model's semantic judgment is correct, so pressure evaluations test likely rationalizations.

## Durable Destination Router

| Knowledge type | Preferred durable destination |
| --- | --- |
| Deterministic behavior or regression | Test, script, linter, validator, or CI rule |
| Operational sequence or environment workaround | Existing runbook or focused `docs/operations/` document |
| Architecture or irreversible technical decision | ADR |
| Product goal, scope, workflow, or acceptance decision | Existing product specification or Intent Contract |
| Project-local agent convention used repeatedly | Managed project instruction or its referenced document |
| Cross-project agent method | VibeTether Skill reference plus evaluation scenario |

When more than one form applies, executable enforcement comes first and documentation explains when and why to use it. A new document must be added to the manifest's applicable sources so later re-anchors can discover it. VibeTether does not create a universal ledger.

## Runtime Flow

1. At task entry or re-anchor, read applicable manifest sources, including operational proven paths relevant to the proposed action.
2. Execute the bounded slice and collect fresh evidence.
3. Search applicable durable sources and executable guards to determine whether this is a first, recovered, changed, repeated, or routine path.
4. For a first, recovered, or changed path, extract the outcome, critical enabling conditions, safe reproduction sequence, evidence, failed alternative only when useful, safety boundary, and revalidation trigger.
5. Redact credentials, private keys, one-time codes, private user data, raw chain-of-thought, and sensitive tool output.
6. Choose the disposition and durable destination.
7. Create or update the durable source when `captured`, or cite the unchanged enforcing artifact when `already-encoded`.
8. Complete `experience_feedback` in the checkpoint.
9. Run `vibetether doctor`; do not claim completion if the completion audit fails.

## Managed Instruction Contract

The bounded VibeTether block in `AGENTS.md` and `CLAUDE.md` is the project-level activation contract. It must explicitly instruct the agent to apply VibeTether automatically at task entry, consequential actions, phase transitions, resume, compaction recovery, and completion boundaries. The user should not need to type `$vibe-tether` on every task.

The managed block will carry the compact normative rule below; the installed Skill routes to the heavy success-capture reference instead of duplicating its full protocol:

```markdown
<!-- vibetether:start -->
## VibeTether

Automatically apply the installed VibeTether Skill at task entry, before consequential actions, at phase transitions, after resume or context compaction, and before completion, handoff, the next slice, merge, release, or publication. Consult `.vibetether/project.yaml` and `.vibetether/capabilities.yaml`; project truth overrides provider advice.

After every verified user-level or engineering-level success, run the Success Capture Gate. A reusable workflow that succeeds for the first time is a `first-proven-path` and must be captured immediately, even when no failure preceded it. Recovered or materially changed paths must create or update a sanitized Proven Path; unchanged repeated paths must point to their existing encoding without duplicating documentation. Prefer tests, scripts, or validators for deterministic knowledge; use runbooks for operations, ADRs for architecture, product specifications for product decisions, and Skill references plus evaluations for cross-project methods. Record the trigger and `captured`, `already-encoded`, or `not-reusable` disposition in checkpoint `experience_feedback`, with a reason and artifact paths. Never persist credentials, private keys, one-time codes, private reasoning, or sensitive tool output. A completion-like state must pass `vibetether doctor` with no pending experience disposition.
<!-- vibetether:end -->
```

This improves automatic triggering while preserving user-owned instructions and keeping the mechanism visible to both harnesses.

The project instruction is a strong behavioral constraint, not a sandbox or cryptographic enforcement boundary. Therefore the checkpoint schema and `doctor` audit remain required: the instruction makes the agent run the gate; the mechanical audit makes skipped disposition visible and blocks a clean completion verdict.

## Compatibility

- New initialization writes `experience_feedback.disposition: pending`.
- Existing checkpoints remain readable. Re-running initialization or repair may add missing VibeTether-owned fields without overwriting user content.
- `doctor` reports an actionable upgrade condition for legacy checkpoints and enforces the gate only when a completion-like phase or verdict is claimed.
- Ordinary in-progress phases are not blocked merely because experience feedback is pending.

## Security and Privacy

Never persist private keys, tokens, one-time codes, credential values, private chain-of-thought, full provider responses, or sensitive user data. Store placeholders and safe facts such as protocol, host, port, flag names, fingerprint verification method, and key-deletion requirements.

A secret-pattern scan is part of release verification. Documentation examples use placeholders and must not include the key material or one-time code from the source task.

## Evaluation Strategy

The RED baseline adds failing contracts before the Skill changes. The scenarios cover combined pressure:

1. Automatic GitHub publication succeeds on its first verified run. The agent must classify it as `first-proven-path` and create a runbook immediately instead of waiting for a later failure.
2. A release later recovers after blocked SSH port 22, explicit identity selection, and port 443 fallback; the user is waiting and the key is temporary. The agent must update the reusable safe path and cleanup without storing secrets.
3. A routine formatting command succeeds once. The agent must use `not-reusable` and avoid documentation noise.
4. An unchanged documented release succeeds again. The agent must select `already-encoded` and avoid a duplicate runbook.
5. A cross-platform fingerprint regression is fixed and guarded by a test. The agent must update the Proven Path and point to the executable guard.
6. A success transcript contains a token or one-time code. The persisted record must use redaction and safe placeholders.

After implementation, static evals, Skill contract tests, checkpoint/doctor tests, full repository tests, package inspection, diff review, and a secret scan must pass.

## First Proven Path

The public repository will add `docs/operations/github-publishing.md`. It will document the verified general path: use an ephemeral read/write deploy key, explicitly select it, fall back from blocked SSH port 22 to `ssh.github.com:443`, verify remote refs and CI, account for Git line-ending normalization when hashing provider content, and delete temporary local and remote credentials after publication. It will include no real credential material.

## Success Criteria

- An agent cannot silently complete without an explicit experience disposition that passes audit.
- A first verified reusable workflow creates a durable Proven Path immediately, even when its first attempt succeeded.
- Recovered, non-default success routes to a safe durable artifact.
- Routine success does not create a document.
- Already-enforced knowledge points to its executable guard.
- Later re-anchor logic consults relevant proven paths.
- Codex and Claude installations receive the same portable behavior.
