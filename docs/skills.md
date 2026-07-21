# Skill broker and Provider lifecycle

## Catalog versus context

Provider cards and content-addressed objects live in the user cache. Search returns metadata only. A project lock pins approved external Provider bytes. The broker performs phase, capability, channel, host, OS, permission, pin, negative-trigger, positive-trigger, project preference, failure history, quality, and context-cost checks.

The result contains at most three candidates and one selected Provider. Activation writes a tamper-evident receipt and a scope envelope. Resources and scripts must be declared by the Provider card. Undeclared paths and symlinks are rejected.

## Trust channels

```text
experimental → beta → stable
                 ↓
              suspect → quarantined → retired
```

Imported Providers start experimental. Beta and stable promotion require recent trigger precision and recall of at least 0.8 and positive measured output gain. Project success affects ranking but cannot promote a Provider. Two project failures remove it from automatic routing and produce an optimization suggestion.

## Permissions

Provider permission requirements are hard filters. A fallback must be built in and must also satisfy host, OS, and permission constraints. Provider instructions are below platform safety, user direction, confirmed Truth, current slice, and capability contract.

## Exposure

Native host exposure is optional. The default host discovery surface contains the small `vibe-tether` adaptive entry and the explicit `vibe-tether-deep` Start Card / Permit gate; community Providers remain cold. A maximum of four project Hot Skills may be named. Modified exposed bytes are never overwritten or removed automatically.


Provider release or tag labels are provenance hints, not immutable identity. The registry records the resolved commit and normalized content digest. Declaration-only license evidence remains explicitly marked for legal review before public redistribution.
