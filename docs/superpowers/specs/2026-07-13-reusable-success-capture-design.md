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

Run the Success Salience Gate when any of these signals is observed:

- an action succeeds after one or more failed attempts;
- a non-default port, flag, command order, version, operating-system setting, or permission made the difference;
- the successful path depends on a hidden or fragile environmental condition;
- the result is likely to recur and would be expensive to rediscover;
- the success changes an operational runbook, verification strategy, or known-good command;
- the user calls the success noteworthy;
- the task is about to transition to `REVIEW`, `NEXT`, handoff, or `SHIP`.

Routine, self-evident, one-off successes should be classified without creating a new document.

## Disposition Contract

The checkpoint carries an `experience_feedback` object:

```yaml
experience_feedback:
  status: pending
  trigger: ""
  disposition: ""
  summary: ""
  evidence: []
  critical_conditions: []
  destination: ""
  revalidate_when: []
  redactions: []
```

Before a completion-like state passes audit, `status` must be `complete` and `disposition` must be one of:

- `captured`: reusable knowledge was written to the correct durable source; `destination`, evidence, and revalidation conditions are present.
- `already-encoded`: the knowledge is already enforced by a test, script, validator, or existing authoritative document; the enforcing artifact is named.
- `not-reusable`: the success is routine or one-off; a concise reason is present and no new document is created.

The model determines the disposition. The validator checks that the decision exists, is internally consistent, and does not remain `pending` at completion. It cannot prove that the model's semantic judgment is correct, so pressure evaluations test likely rationalizations.

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
3. When a success trigger fires, extract the outcome, critical enabling conditions, safe reproduction sequence, evidence, failed alternative only when useful, safety boundary, and revalidation trigger.
4. Redact credentials, private keys, one-time codes, private user data, raw chain-of-thought, and sensitive tool output.
5. Choose the disposition and durable destination.
6. Update the durable source when `captured`, or cite the existing enforcing artifact when `already-encoded`.
7. Complete `experience_feedback` in the checkpoint.
8. Run `vibetether doctor`; do not claim completion if the completion audit fails.

## Managed Instruction Contract

The bounded VibeTether block in `AGENTS.md` and `CLAUDE.md` will mention the completion audit in compact form. It will not duplicate the full protocol. The installed Skill routes to the heavy success-capture reference.

This improves automatic triggering while preserving user-owned instructions and keeping the mechanism visible to both harnesses.

## Compatibility

- New initialization writes the new checkpoint fields with `status: pending`.
- Existing checkpoints remain readable. Re-running initialization or repair may add missing VibeTether-owned fields without overwriting user content.
- `doctor` reports an actionable upgrade condition for legacy checkpoints and enforces the gate only when a completion-like phase or verdict is claimed.
- Ordinary in-progress phases are not blocked merely because experience feedback is pending.

## Security and Privacy

Never persist private keys, tokens, one-time codes, credential values, private chain-of-thought, full provider responses, or sensitive user data. Store placeholders and safe facts such as protocol, host, port, flag names, fingerprint verification method, and key-deletion requirements.

A secret-pattern scan is part of release verification. Documentation examples use placeholders and must not include the key material or one-time code from the source task.

## Evaluation Strategy

The RED baseline adds failing contracts before the Skill changes. The scenarios cover combined pressure:

1. A release finally succeeds after blocked SSH port 22, explicit identity selection, and port 443 fallback; the user is waiting and the key is temporary. The agent must capture the reusable safe path and cleanup without storing secrets.
2. A routine formatting command succeeds once. The agent must use `not-reusable` and avoid documentation noise.
3. A cross-platform fingerprint regression is fixed and guarded by a test. The agent must select `already-encoded` and point to the test or CI rule.
4. A success transcript contains a token or one-time code. The persisted record must use redaction and safe placeholders.

After implementation, static evals, Skill contract tests, checkpoint/doctor tests, full repository tests, package inspection, diff review, and a secret scan must pass.

## First Proven Path

The public repository will add `docs/operations/github-publishing.md`. It will document the verified general path: use an ephemeral read/write deploy key, explicitly select it, fall back from blocked SSH port 22 to `ssh.github.com:443`, verify remote refs and CI, account for Git line-ending normalization when hashing provider content, and delete temporary local and remote credentials after publication. It will include no real credential material.

## Success Criteria

- An agent cannot silently complete without an explicit experience disposition that passes audit.
- Recovered, non-default success routes to a safe durable artifact.
- Routine success does not create a document.
- Already-enforced knowledge points to its executable guard.
- Later re-anchor logic consults relevant proven paths.
- Codex and Claude installations receive the same portable behavior.
