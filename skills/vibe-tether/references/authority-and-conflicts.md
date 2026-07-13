# Authority and Conflicts

## Source Classes

Use four distinct source classes:

1. **Platform constraints:** safety, permissions, runtime, and legal limits.
2. **Normative project truth:** approved goals, constitutions, product contracts, ADRs, UI contracts, and active specifications.
3. **Observed truth:** current code, tests, runtime output, screenshots, APIs, and data behavior.
4. **Advisory context:** temporary preferences, external references, community patterns, popularity, and agent suggestions.

Observed truth explains what exists. Normative truth defines what should exist. Do not let an implementation accident silently redefine intent.

## Default Precedence

1. Platform constraints.
2. The user's current explicit and informed decision.
3. Approved product or Intent Contract.
4. Project constitution or primary instructions.
5. Accepted architecture and design decisions.
6. Active approved specifications and task plans.
7. Observed implementation and runtime evidence.
8. Advisory context.

Use project-declared precedence when present, but never weaken platform constraints or silently let a lower source override a higher one.

## Decision Ownership

| Decision | Owner | Agent behavior |
| --- | --- | --- |
| Product direction, scope, capability, workflow, UI direction | User | Ask on any material ambiguity |
| Local reversible implementation detail | Agent | Investigate, decide, record important assumptions |
| Architecture, public contract, data, security, dependency, irreversible refactor | Shared gate | Investigate, recommend, explain impact, ask |

## Conflict Protocol

1. Express the conflict as two comparable statements.
2. Cite each source, date or version, scope, and authority class.
3. Explain the affected capabilities, files, contracts, and verification.
4. Recommend preserve, override, or narrow-scope resolution.
5. Ask the user to confirm the direction explicitly.
6. Update the correct durable source after confirmation.
7. Write a new checkpoint before implementation resumes.

Do not continue while chat and project truth remain inconsistent. Do not create a new "latest" document to hide the unresolved conflict.

While awaiting direction, continue only separable, reversible preparation that does not encode the disputed direction, cross a gate, or create an external side effect. Do not turn a direction gate into unnecessary idleness when safe investigation or scaffolding remains authorized.

## Question Format

Ask only after inspecting available code and documents. Use:

```text
Conflict or ambiguity:
Applicable evidence:
Impact if unresolved:
Recommended decision:
Confirmation needed:
```

Direction questions interrupt immediately. Local technical questions do not interrupt. Structural technical questions include an investigated recommendation.

## External References

Classify every important reference:

- exact reproduction;
- structural reference;
- interaction reference;
- design-language reference;
- capability rewrite;
- inspiration only;
- reject or defer.

Record what to adopt, what not to copy, intentional differences, license constraints, and acceptance evidence. A product name, screenshot, or popularity count is not a reference contract.
