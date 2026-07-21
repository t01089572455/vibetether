# Worktree runtime and handoff

VibeTether uses Git's common directory to identify one clone and the private worktree Git directory to identify each linked worktree. Folder name and branch name are not identities.

Runtime layout is conceptually:

```text
<state-home>/projects/<project-id>/<clone-id>/
  repository.json
  evidence/
  handoffs/
  provider-stats.json
  worktrees/<worktree-id>/
    current.json
    route.json
    lease.lock
    journal.ndjson
    evidence/
    activations/
    quarantine/
```

A project-local worktree destination must be ignored by Git. Sibling and user-global destinations do not need an ignore rule. Removing an active worktree requires explicit force; normal removal also deletes only that worktree's runtime registration.

Handoffs are digest-protected, single-accept capsules. They carry the parent route, authority and control generation, base commit, bounded slice, success evidence, permissions, and protected capabilities. Completion requires successful command or artifact evidence from the accepting worktree.


Tracked text authority uses portable line-ending normalization, so LF and CRLF checkouts of the same Git content produce the same authority digest. Git common/private directories are locators; VibeTether stores its own stable worktree UUID. Deep Start Cards and Permits are worktree-scoped and become stale when the worktree, authority, or control generation changes.
