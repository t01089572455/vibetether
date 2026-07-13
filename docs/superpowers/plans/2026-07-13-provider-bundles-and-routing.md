# Provider Bundles and Advisory Routing Implementation Record

**Status:** Implemented; public release remains subject to the final publish gate.

**Goal:** Turn VibeTether from a routing-policy preview into a one-command project initializer that installs complete pinned specialist Skills and gives agents an explainable capability board for autonomous selection.

## Architecture decisions

- Keep VibeTether as the only entry information router.
- Treat ordinary Skill selection as advisory. The agent may use the recommendation, an installed alternative, or the declared built-in fallback and records the material reason.
- Keep direction, architecture/public contracts, visual direction, destructive data, permissions/security/privacy, and merge/deploy/release/publication as separate user-confirmation gates.
- Install providers only during explicit initialization. Runtime routing is local and never downloads a Skill.
- Pin upstream repositories by exact commit, verify complete Skill-directory fingerprints and licenses before any project write, and install license copies with ownership metadata.
- Preserve pre-existing identical Skills without claiming uninstall ownership.
- Exclude `using-superpowers` so VibeTether does not install a competing top-level router.
- Route vague requests to model-invokable `grilling` while keeping the literal upstream `grill-me` command alias visible and marking its behavior as automatically covered.
- Run an automatic, proportional work-readiness assessment before implementation. Upstream command aliases may stay explicit, but their underlying clarification behavior must be covered automatically.

## Implemented slices

1. Added the pinned `core`, `standard`, and `extended` bundle registry and pure route resolver.
2. Added exact-commit Git staging, Windows Schannel fallback, path containment, fingerprint verification, license verification, and cleanup.
3. Added atomic complete-directory provider installation for every enabled Codex and Claude harness.
4. Added `.vibetether/capabilities.yaml`, `.vibetether/providers.lock.yaml`, license artifacts, checkpoint provider selection, and legacy project migration.
5. Added a complete Skill inventory with invocation policy, capabilities, live harness availability, signal-driven routes, expected outputs, and exit evidence.
6. Added `vibetether capabilities` plus the zero-dependency offline `resolve-route.mjs` installed with the Skill.
7. Added provider-aware doctor warnings/errors, strict lock-path validation, profile downgrade ownership, and managed-only transactional uninstall.
8. Updated the public Skill, adapters, README, security model, contribution rules, third-party notices, and static evaluation scenarios.
9. Added an exact-fingerprint, transactional upgrade path for the canonical 0.1.0 VibeTether Skill while continuing to reject modified copies.
10. Added an automatic work-readiness gate and explicit automatic-equivalence metadata for upstream command aliases (`grill-me` -> `grilling`; `grill-with-docs` -> `grilling` + `domain-modeling`).

## Verification record

- Full check: all Node tests, six static scenarios, and Skill self-validation passed.
- Real standard bootstrap: 17 curated providers available, two exact license copies, `grilling` selected for a vague request, and 124 project files unchanged across repeated initialization.
- Real extended bootstrap: 18 curated providers available, three exact license copies, and `frontend-design` selected for a user-visible UI route.
- Real temporary-project uninstall: all managed Skills and licenses removed; manifest and Intent Contract preserved; routing board and lock removed.
- Package dry-run: version `0.2.0`, 49 files, including provider registry, routing code, offline resolver, Skill resources, and third-party notices.
- Real legacy upgrade: the exact canonical 0.1.0 Skill fingerprint was replaced by the current canonical fingerprint and `doctor` remained healthy; rollback behavior is covered by an injected post-upgrade failure test.

## Known boundary

No Skill package can guarantee that every model host will invoke it before every action. Managed project instructions and broad trigger metadata make the entry route explicit for supported Codex and Claude projects. Once VibeTether is active, route resolution is inspectable and deterministic, with live provider-path availability checks.

The development host protects workspace-local `.agents` Skill folders from deletion. A workspace-local uninstall smoke test therefore stopped safely with `EPERM`; the same release candidate completed install, doctor, and transactional uninstall in an ordinary system temporary project. No bypass was added for the host protection.
