# GitHub Publishing Proven Path

Status: proven  
Trigger: `first-proven-path`, later updated by recovered and changed path evidence

## Use When

Publish this repository from an environment where normal SSH port 22 may be unavailable and the publishing identity is an explicitly authorized, short-lived repository deploy key.

This runbook records the verified method, not a credential. Obtain publication authorization before pushing, changing repository keys, or publishing a release.

## Prerequisites

- A clean, reviewed release commit.
- A GitHub repository deploy key with the minimum required write scope.
- The matching private key stored temporarily outside the repository at `<ephemeral-key-path>`.
- The GitHub SSH host key verified and stored in a temporary known-hosts file.
- Fresh local tests and package checks.

Never place the private key, one-time code, token, or credential-bearing command output in this repository or runbook.

## Known-Good Transport

Direct SSH port 22 can be blocked by the local network. Use GitHub's SSH endpoint on port 443:

```text
ssh://git@ssh.github.com:443/<owner>/<repository>.git
```

Select the authorized identity explicitly. A temporary SSH configuration may use:

```text
Host github-publish
  HostName ssh.github.com
  Port 443
  User git
  IdentityFile <ephemeral-key-path>
  IdentitiesOnly yes
  UserKnownHostsFile <temporary-known-hosts-path>
```

Alternatively, use the equivalent `ssh -i <ephemeral-key-path>` transport configuration without printing the private key or environment contents.

## Publication Sequence

1. Confirm the intended local commit and target remote refs.
2. Verify the temporary key fingerprint against the authorized GitHub deploy-key entry.
3. Test authentication over `ssh.github.com:443` with the explicit identity and strict host verification.
4. Push the reviewed branch first.
5. Push the same reviewed commit to the intended release branch only under the existing publication authorization.
6. Read the remote ref and confirm it equals the local commit.
7. Wait for the GitHub CI workflow and verify every supported operating-system and Node.js matrix job.
8. Remove the temporary private key, public-key copy, and temporary known-hosts file.
9. Remove the temporary GitHub deploy key when its publication purpose is complete.

Do not treat a local `git push` exit code alone as verified delivery. The remote ref and CI result are separate evidence.

## Cross-Platform Fingerprint Stability

Provider fingerprints must be independent of a contributor's Git line-ending configuration. Controlled provider Git reads use:

```text
git -c core.autocrlf=false ...
```

The regression is also encoded in the provider tests. If provider content, hashing logic, Git version behavior, or checkout normalization changes, rerun the Windows and Ubuntu CI matrix before publication.

## Failure Interpretation

- Port 22 connection closure: retrying the same route is not progress; use the verified port 443 endpoint.
- Public deploy key exists but no matching local private key: the fingerprint is not an authentication credential; create a newly authorized ephemeral pair rather than reconstructing or guessing secret material.
- Authentication uses an unintended identity: enforce `IdentitiesOnly` and explicit `IdentityFile`/`-i` selection.
- Remote ref matches but CI fails: publication occurred, but release verification did not pass; diagnose and publish a new reviewed commit rather than rewriting evidence.
- Provider fingerprint differs only on Windows: check line-ending normalization before changing the declared provider content.

## Rollback and Cleanup

A Git push is an external write. Do not force-push, delete remote history, or roll back automatically. Preserve the published commit, report the mismatch, and obtain explicit authorization for a corrective publication strategy.

Credential cleanup is mandatory even after failure. Confirm that no temporary private key, public-key copy, known-hosts file, credential environment variable, or temporary deploy key remains.

## Revalidate When

- GitHub changes its SSH endpoints or deploy-key behavior;
- the network policy changes;
- the repository changes its branch protection or CI matrix;
- the release workflow changes identity or permission scope;
- Git checkout or provider fingerprint logic changes;
- the runbook has not been exercised in the current environment.
