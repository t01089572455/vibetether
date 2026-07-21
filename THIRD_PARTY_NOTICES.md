# Third-Party Notices

VibeTether 1.0.0-rc.3 has no npm runtime dependencies. The source package **does redistribute selected, cold Provider Skill content** so a project can route to reviewed capabilities without downloading an arbitrary repository during an active task. Unselected Provider content stays outside host discovery and project context.

The packaged Provider sources are recorded in `registry/community-provenance.json` with the requested release/ref, resolved immutable commit, license evidence, and project-relative Provider paths. Full license texts available from the pinned source are retained under `registry/licenses/`. For two sources where the pinned upstream evidence available to this package is only a README or Skill declaration rather than a complete license text, VibeTether retains metadata-only declaration evidence but does **not** redistribute their Provider bytes in this archive. Those sources require a separate user-initiated import and license review. VibeTether does not fabricate missing license text.

| Source | Resolved commit | License | Pack |
| --- | --- | --- | --- |
| `mattpocock/skills` | `d574778f94cf620fcc8ce741584093bc650a61d3` | MIT | standard |
| `obra/superpowers` | `f2cbfbefebbfef77321e4c9abc9e949826bea9d7` | MIT | standard |
| `multica-ai/andrej-karpathy-skills` | `2c606141936f1eeef17fa3043a72095b4765b9c2` | MIT declaration metadata only; Provider bytes not redistributed | metadata-only |
| `anthropics/skills` | `9d2f1ae187231d8199c64b5b762e1bdf2244733d` | Apache-2.0 | extended |
| `vercel-labs/agent-skills` | `f8a72b9603728bb92a217a879b7e62e43ad76c81` | MIT declaration metadata only; Provider bytes not redistributed | metadata-only |
| `addyosmani/agent-skills` | `98967c45a42b88d6b8fb3a88b7ff6273920763d6` | MIT | production |

VibeTether does not relicense third-party content. Git and Node.js are external tools and retain their respective licenses.
