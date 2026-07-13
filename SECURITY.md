# Security Policy

## Supported versions

The `0.2.x` preview line receives security fixes. Preview interfaces may still change, but managed-file safety, path containment, provider supply-chain behavior, dependency behavior, and sensitive-data handling are treated as security-relevant contracts.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/t01089572455/vibetether/security/advisories/new). Do not open a public issue for a vulnerability that could expose user files, credentials, repository data, or an installation path.

Include the affected version, operating system, Node.js version, reproduction steps, impact, and any suggested mitigation. Remove secrets and private repository content from the report.

## Security model

VibeTether:

- writes only inside the selected project after path and symlink checks;
- uses bounded managed blocks and preserves user-authored instruction content;
- creates a first-change backup before modifying existing managed surfaces;
- refuses malformed markers and modified installed Skill copies;
- fetches curated providers only during explicit initialization, with interactive Git credentials disabled;
- pins provider sources to exact commits and verifies complete Skill fingerprints and license hashes;
- installs upstream license copies and records source, integrity, path, and ownership in a project lock;
- excludes local runtime checkpoints from version control by default;
- does not install remote providers during an active task or from runtime routing;
- does not add telemetry, privileged hooks, MCP servers, deployment access, or external writes by default;
- does not store private chain-of-thought in manifests or checkpoints.

Project instruction files are behavioral guidance, not a permission boundary. Continue to use operating-system permissions, repository protections, secret scanning, code review, and host-native approval controls.
