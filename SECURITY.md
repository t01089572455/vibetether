# Security Policy

## Supported version

This repository contains a 1.0.0 release candidate. Security support and final-release policy will be established only after RC cross-platform validation.

## Reporting

Report suspected vulnerabilities privately to the repository owner rather than opening a public issue containing exploit details or credentials. Include the affected command, platform, minimal reproduction, and expected safety boundary. Never attach real tokens, private keys, or user data.

## Security model

VibeTether rejects project path traversal, protected Git metadata, known credential paths, obvious secret values, and symlinked authority, runtime, Provider, and evidence paths. Project and global writes use recoverable replacement and multi-file rollback paths; fault-injection tests cover partial writes, replacement failure, and rollback conflicts. Provider objects are content-addressed and rehashed before activation. Receipts are digest-protected. External Provider permissions are hard filters.

Deep mode, Provider receipts, and permission filters are policy gates, not an operating-system sandbox. Activated Provider scripts still run with the operating-system permissions of the invoking user, but VibeTether supplies a minimal environment allowlist and invalidates the activation when its route exits. Review Provider content, provenance, license evidence, and permissions before pinning it. Sources supported only by a README license declaration remain marked for legal review before public redistribution. Network, external writes, code writes, release, migration, and destructive operations remain explicit authorization boundaries.

## Out of scope

Model prompt injection, a malicious user who controls the entire project and operating-system account, weaknesses in Git/Node/npm, and semantic errors in approved project Truth are outside the deterministic security guarantee, although VibeTether may surface conflicts and stale state.
