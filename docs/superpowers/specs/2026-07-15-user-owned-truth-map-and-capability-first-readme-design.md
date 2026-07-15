# VibeTether Control Plane, User-Owned Truth Map, and Capability-First README Design

Date: 2026-07-15
Status: approved for implementation planning
Audience: VibeTether maintainers and contributors

## 1. Executive decision

VibeTether will replace automatic project-truth discovery on a new installation with a user-owned Markdown entry point:

```text
.vibetether/TRUTH.md
```

The file is the single authoritative index of project truth sources. VibeTether may help an Agent search for candidates, explain them, and propose edits, but every newly activated project document requires explicit user confirmation. `--yes` never counts as project-truth approval.

This change extends the existing VibeTether control plane; it does not replace it. VibeTether remains responsible for coordinating host governance, the current Intent Contract, durable project truth, runtime checkpoints, capability routing, evidence gates, and reusable experience. Skill routing is one control-plane function, not the product's entire purpose.

VibeTether will use two related but separate rails:

- `.vibetether/TRUTH.md` answers **what must be true for this project**;
- `.vibetether/experience-index.yaml` answers **what has worked, under which conditions**.

The Agent reads the truth index at task entry and adaptively rereads only the applicable originals at consequential boundaries. It recalls only the most relevant Proven Path when operational conditions match. If confirmed project truth and an applicable Proven Path disagree, the Agent stops the consequential action, presents the conflict, recommends a resolution, and asks the user to decide. Platform safety, legal, and runtime constraints remain non-overridable.

The public README will lead with capabilities and the beginner problem VibeTether solves. Visual polish and a short terminal animation support that explanation; they do not replace it.

This design does not authorize implementation. Implementation starts only after this specification is reviewed and an implementation plan is approved.

## 2. Why this change is needed

VibeTether exists because strong coding Agents can still drift during long tasks:

- the project already has specifications, but the Agent stops consulting the applicable source after context grows or a phase changes;
- a vague request becomes implementation before the missing product, visual, or architectural decision is exposed;
- beginners do not know which Skill to call, while experienced users may forget to route again later;
- a successful build, deployment, authentication, local-environment, or publication path is not captured, so a later task rediscovers it and can fail again;
- an automatically discovered document is mistaken for current authority even though the user never approved that role.

VibeTether should reduce these failure modes without pretending to be a security sandbox or replacing the Agent's technical judgment. Directional ambiguity is gated. Low-risk, reversible, goal-aligned technical choices remain autonomous.

## 3. Current implementation audit

The current repository has useful foundations:

- project-local capability routing;
- work-readiness assessment;
- phase checkpoints and drift control;
- Proven Path matching and success capture;
- managed Codex and Claude bootstrap instructions;
- transactional installation and rollback;
- curated provider Skill installation.

The existing control surface already includes `AGENTS.md` and/or `CLAUDE.md`, `.vibetether/intent.md`, `.vibetether/project.yaml`, `.vibetether/capabilities.yaml`, `.vibetether/state/current.yaml`, and `.vibetether/experience-index.yaml`. The new truth map is an additional human-owned authority surface, not a replacement for intent, capability, checkpoint, or experience state.

However, project truth is currently only partially reliable.

`src/project-scan.mjs` recognizes a fixed set of conventional paths such as `CONTEXT.md`, `PRD.md`, `docs/product-direction.md`, `docs/adr/`, and a few UI and specification directories. It automatically activates discoveries and only asks when a narrow class of competing product or UI candidates is found. `src/manifest.mjs` and `src/init.mjs` then persist or refresh part of that result.

A live scan of the maintainer's `D:\python_workspace\gyws` project found `CONTEXT.md`, `docs/adr/`, and host instruction files, but missed the project's required dated specifications under `docs/superpowers/specs/`. The outer `AGENTS.md` required-reading order currently compensates behaviorally, but the VibeTether manifest itself does not represent the real governing set.

The same workspace also demonstrates the maintenance gap: its Intent Contract, manifest, capability board, provider lock, and detailed checkpoint exist, but `.vibetether/experience-index.yaml` is absent because the installed project state predates the completed experience-index lifecycle. The checkpoint records the limitation, yet no single coordinator repairs or presents the whole control-plane health. In addition, the CLI deterministically maintains a separate route handshake while the semantic checkpoint remains primarily Agent-maintained.

Therefore:

1. path-name heuristics cannot determine authority reliably;
2. current discovery can miss unconventional but governing sources;
3. current discovery can activate conventional but obsolete sources;
4. the manifest and host instructions can become two incomplete descriptions;
5. README language must not imply broader discovery guarantees than the implementation provides.

The fix is not a larger filename classifier. The fix is a visible, user-owned authority index with Agent-assisted candidate discovery.

It must be integrated with the existing control files through one orchestration protocol; otherwise VibeTether would remain a capable route resolver with an incomplete project-management loop.

## 4. Control-plane architecture

### 4.1 Product role

VibeTether is a project-local orchestration control plane for cooperating coding Agents. It does not implement every specialist method itself. It coordinates:

- what direction is authoritative;
- what the current task is trying to achieve;
- which lifecycle phase and bounded slice are active;
- which specialist Skill or fallback fits the phase;
- what evidence is required before advancing;
- what reusable operational knowledge should be recalled or captured;
- what conflict or high-risk decision must return to the user.

The control plane must still work with no optional provider installed. Optional providers improve execution methods; they do not own project authority or lifecycle state.

### 4.2 Core control surface

| Artifact | Single responsibility | Ownership | Maintenance contract |
| --- | --- | --- | --- |
| `AGENTS.md` and/or `CLAUDE.md` | Enter VibeTether and define host/repository governance by scope | mixed | VibeTether atomically maintains only its bounded marked block; user content is preserved |
| `.vibetether/TRUTH.md` | Human-readable registry of confirmed, pending, and declined durable project sources | project-owned | Agent may add candidates; active additions, removals, role changes, and scope changes require user confirmation |
| `.vibetether/intent.md` | Current approved goal, boundaries, non-goals, success evidence, and unresolved direction | project-owned semantic state | `bootstrap` or the Agent proposes changes; directional changes require user confirmation |
| `.vibetether/project.yaml` | Machine-readable control-plane topology, host configuration, gates, and pointers | VibeTether-managed manifest | `init`, upgrade, and repair maintain structural fields atomically; it does not duplicate project prose |
| `.vibetether/capabilities.yaml` | Derived capability, scenario, provider, fallback, output, and evidence board | VibeTether-generated | regenerated from reviewed registries, selected profile, provider lock, and supported project overlay contract |
| `.vibetether/state/current.yaml` | Semantic runtime checkpoint for goal, phase, slice, evidence, risk, decisions, and next action | Agent-maintained runtime state | updated at entry, re-anchor, phase/slice changes, conflicts, handoff, and completion; bookkeeping does not require repeated user approval |
| `.vibetether/experience-index.yaml` | Metadata and artifact pointers for confirmed reusable operational paths | project-owned durable index | Agent proposes candidate capture after verified success; active entries require user disposition and remain mechanically validated |

Supporting control files have narrower roles:

| Artifact | Purpose | Maintenance contract |
| --- | --- | --- |
| `.vibetether/state/route-handshake.yaml` | Deterministic current phase route, selection, status, and bounded evidence | written only by `vibetether route`, `route complete`, and `route abandon` |
| `.vibetether/routes.local.yaml` | Project-specific live routing overlay | user-owned; never regenerated or silently normalized |
| `.vibetether/providers.lock.yaml` | Immutable provider identity, source, integrity, exposure, and license state | generated and repaired during explicit install or upgrade |
| `.vibetether/licenses/` and `.vibetether/providers/` | Reviewed provider artifacts and license evidence | transactional installer-owned cache; not project truth |
| Natural project documents | Product specs, ADRs, UI contracts, runbooks, tests, and plans | authored by the user or applicable specialist Skill under approved direction |

### 4.3 One manifest, no duplicate authority

`.vibetether/project.yaml` remains the machine entry point. It locates the rest of the control plane:

```yaml
schema_version: 1
intent_contract: .vibetether/intent.md
truth_index: .vibetether/TRUTH.md
capability_board: .vibetether/capabilities.yaml
experience_index: .vibetether/experience-index.yaml
checkpoint:
  mode: local
  path: .vibetether/state/current.yaml
```

During the compatibility window, legacy `sources` remain physically present for rollback, but the new resolver treats `truth_index` as authoritative. Keeping schema version 1 for that window lets the previous release read its preserved fields during rollback. A later separately designed migration may remove legacy fields and increment the schema.

### 4.4 Integrated task-entry protocol

At task entry, compaction recovery, resume, or handoff, the VibeTether entry Skill performs one coordinated read:

1. read the nearest applicable host instructions, including root and nested scope;
2. read `.vibetether/project.yaml` to locate the control plane;
3. read `.vibetether/TRUTH.md` and select the confirmed sources applicable to the task;
4. read `.vibetether/intent.md` for the current approved goal and success evidence;
5. read `.vibetether/state/current.yaml` and reconcile it with the request and working tree;
6. reread the applicable confirmed source originals;
7. resolve conflicts and run work readiness;
8. consult `.vibetether/capabilities.yaml` and the live local overlay to select the current phase route;
9. query `.vibetether/experience-index.yaml` only when current signals make experience relevant;
10. write a fresh semantic checkpoint and start the deterministic route handshake before consequential work.

If the Intent Contract and confirmed project truth conflict, the Agent uses the conflict protocol rather than assuming the newer-looking file wins.

### 4.5 Maintenance ownership modes

“Automatic maintenance” has three explicit meanings:

1. **CLI deterministic:** the running VibeTether command validates and atomically writes machine-owned state such as manifests, capability boards, provider locks, and route handshakes.
2. **Agent automatic:** managed host instructions require the cooperating Agent to inspect triggers, update runtime state, and propose durable changes without waiting for the user to remember the VibeTether command.
3. **User-confirmed semantic:** the Agent may prepare the exact patch, but a project direction, truth-source activation, structural decision, visual direction, destructive action, release, or active Proven Path requires user confirmation.

VibeTether has no background daemon. “Automatic” never means that files change while no CLI or cooperating Agent is running. The README and diagnostics must preserve this boundary.

### 4.6 Maintenance trigger matrix

| Trigger | Automatic coordination | User confirmation boundary |
| --- | --- | --- |
| New install or upgrade | create/repair manifest, blank truth map, intent scaffold, capability board, checkpoint, experience index, provider state, and managed host blocks | installation choices authorize managed infrastructure, not project truth |
| New task or resume | read and reconcile control plane; refresh checkpoint and route | ask only for unresolved directional or high-risk decisions |
| Goal, scope, or success criteria change | propose Intent Contract update and mark prior checkpoint stale | confirm semantic direction before activation |
| New spec, ADR, UI contract, rule, or runbook appears | inspect it, classify it, and add a truth-map candidate when relevant | confirm before active truth registration |
| Confirmed document changes content | mark fingerprint stale and reread before dependent action | confirm only if the change itself alters governed direction or contract |
| Confirmed document moves, disappears, changes role, or is superseded | propose a truth-map lifecycle patch and block only dependent consequential work | confirm registry change |
| Phase or bounded slice changes | update semantic checkpoint; complete/abandon prior route; start next route | confirm only when the phase crosses an existing directional or high-risk gate |
| Verified reusable success | classify, redact, deduplicate, and propose the natural artifact plus experience entry | confirm active capture disposition |
| Routine non-reusable success | record `not-reusable` with a concise reason | no extra question when classification is unambiguous and non-directional |
| Truth, intent, observed evidence, or experience conflicts | stop affected action, cite both sides, recommend one decision | user resolves the conflict |
| Completion, merge, deploy, release, or publication | full re-anchor, evidence gate, success-capture gate, route disposition, and `doctor` | release/publication/destructive authorization remains explicit |

### 4.7 Document lifecycle coordinator

VibeTether does not become a general-purpose document editor. It coordinates document lifecycle around project authority:

```text
observed -> candidate -> confirmed -> changed/moved -> superseded/declined
```

The Agent detects lifecycle signals from repository search, Git status or rename evidence, links from confirmed sources, outputs declared by routed Skills, approved conversation artifacts, route evidence artifacts, and failed path resolution. It then proposes the smallest registry or durable-document patch.

The coordinator must not:

- rewrite a specification merely because its fingerprint changed;
- promote a generated plan or provider output automatically;
- treat a newly created file as current truth because its name looks conventional;
- duplicate the same decision across the truth map, Intent Contract, checkpoint, and experience index;
- create a second “latest” document to hide a conflict.

Each fact has one natural home. Other control files store pointers, fingerprints, current applicability, or runtime disposition rather than copying the source text.

## 5. Goals

1. Make VibeTether a coherent project control plane rather than a collection of independent routing files.
2. Give every project one obvious, human-readable entry point for confirmed truth, pending candidates, and declined candidates.
3. Prevent newly discovered documents from silently becoming authority.
4. Let beginners manage the index through ordinary conversation instead of learning a scanning command or schema editor first.
5. Preserve autonomous repository investigation and technical decision-making where direction is already clear.
6. Make intent, state, truth, routing, evidence, and experience updates occur at explicit lifecycle triggers.
7. Make relevant truth rereading recur throughout a long task, not only on the first prompt.
8. Recall reusable operational success without treating it as normative product direction.
9. Surface truth-versus-experience conflicts before consequential action and return the decision to the user.
10. Preserve existing installations losslessly during migration.
11. Explain these capabilities accurately and attractively in the README.

## 6. Non-goals

- No automatic semantic classification of every repository document.
- No silent truth activation based on filename, directory, confidence score, or `--yes`.
- No mandatory full-document reload before every small edit or command.
- No background daemon or host-specific enforcement hook in this release.
- No guarantee that a model semantically understood a document.
- No claim that VibeTether prevents all drift, forces compliance, or has measured net Token savings.
- No merger of project truth and Proven Paths into one authority list.
- No automatic installation of arbitrary Skills named by a truth document.
- No redesign of lower-level Skills that VibeTether routes to.
- No background file watcher, daemon, or claim that semantic files update without a running cooperating Agent.
- No automatic rewriting of product specifications, ADRs, UI contracts, or runbooks merely to keep documents “synchronized.”

## 7. Authority model

### 7.1 Layers

VibeTether recognizes these layers without attempting to override the host platform's own instruction precedence:

| Layer | Purpose | Examples | VibeTether treatment |
| --- | --- | --- | --- |
| Platform constraints | Safety, legal, runtime, and tool restrictions | sandbox rules, credential rules | non-overridable |
| Host bootstrap and governance | Tell Codex, Claude, or another host how to enter VibeTether and obey repository scope | root/nested `AGENTS.md`, `CLAUDE.md` | read by scope; not product truth |
| Confirmed normative truth | Define intended product and system behavior | direction, requirements, ADRs, contracts, UI design | governing input |
| Confirmed operational truth | Define controlled delivery and environment requirements | release policy, migration runbook, permissions | governing for matching operation |
| Observed evidence | Describe current implementation or runtime behavior | code, tests, logs, deployed state | evidence; cannot silently override intent |
| Reference and history | Explain background or superseded choices | old PRDs, research, archived designs | context only unless promoted |
| Proven Paths | Describe a workflow that succeeded under recorded conditions | Windows install recovery, release command | reusable evidence; not product authority |

### 7.2 Conflict principles

- Platform safety, legal, and runtime constraints always win.
- A current explicit user decision may resolve a project-level conflict, provided it does not violate a higher platform constraint.
- Conflicts among confirmed governing sources are not resolved by filename, recency, list order, or Agent preference. The Agent presents the conflict and asks the user.
- Observed implementation differences are reported as specification gaps, not used to rewrite intent silently.
- A Proven Path never silently overrides confirmed project truth. A conflict returns to the user-decision protocol in section 14.

## 8. `.vibetether/TRUTH.md`

### 8.1 Ownership

`.vibetether/TRUTH.md` is project-owned. VibeTether creates the initial scaffold but must not silently regenerate, reorder, normalize, or overwrite user edits.

The installed Skill may propose a patch after repository investigation. Applying a candidate proposal is allowed because it is non-authoritative. Moving a candidate into the confirmed section, changing the governing role or scope of a confirmed entry, or removing a confirmed entry requires explicit user confirmation.

### 8.2 Canonical version-one form

```markdown
# VibeTether Project Truth Map

<!-- vibetether-truth-schema: 1 -->

This file is owned by the project. Confirm every new active truth source.
Unconfirmed candidates do not guide implementation.

## Host bootstrap

- [x] `AGENTS.md`
  - role: `agent-governance`
  - scope: `repository`
  - hosts: `codex`
  - source: `explicit-install-selection`
- [x] `CLAUDE.md`
  - role: `agent-governance`
  - scope: `repository`
  - hosts: `claude`
  - source: `explicit-install-selection`

## Control-plane pointers

- [x] `.vibetether/intent.md`
  - role: `intent-contract`
  - scope: `current-goal`
- [x] `.vibetether/capabilities.yaml`
  - role: `capability-board`
  - scope: `repository`
- [x] `.vibetether/state/current.yaml`
  - role: `runtime-checkpoint`
  - scope: `current-task`
- [x] `.vibetether/experience-index.yaml`
  - role: `experience-catalog`
  - scope: `repository`

## Confirmed project truth

<!-- Empty on a new installation. -->

## Candidates awaiting confirmation

<!-- Empty on a new installation. -->

## Declined candidates

<!-- Empty on a new installation. -->
```

Host bootstrap entries are generated only for hosts the user explicitly selected during installation. This is installation authorization, not automatic project-truth discovery. Control-plane pointers are informational infrastructure, not project documents promoted without consent. They make the entire control surface visible from the beginner-facing entry page while `.vibetether/project.yaml` remains the machine-readable topology.

### 8.3 Confirmed entry form

```markdown
- [x] `docs/product-direction.md`
  - role: `product-direction`
  - scope: `repository`
  - authority: `governing`
  - when: `product, ui, architecture`
  - reason: `User confirmed this as the current product direction.`
```

Required fields:

- repository-relative path;
- `role`.

Defaults:

- `scope`: `repository`;
- `authority`: `governing` for normative and operational roles.

Optional fields:

- `when`: task or decision classes that make the source applicable;
- `reason`: concise confirmation evidence;
- `supersedes`: another registered path;
- `confirmed_at`: ISO date;
- `confirmed_by`: normally `user`.

Version-one roles are:

- `product-direction`
- `requirements`
- `domain`
- `architecture`
- `contract`
- `ui-ux`
- `design-system`
- `data-permissions`
- `evaluation`
- `release`
- `operations`
- `agent-governance`
- `observed-evidence`
- `reference-history`
- `custom:<project-role>`

The role describes why a source matters. It does not assign precedence among conflicting confirmed sources.

### 8.4 Candidate entry form

```markdown
- [ ] `docs/superpowers/specs/2026-07-15-new-ui-design.md`
  - suggested_role: `ui-ux`
  - scope: `repository`
  - evidence: `The user approved this design in the current conversation.`
  - proposed_at: `2026-07-15`
```

A candidate may be created by the Agent after investigation or after an approved conversation is written to a durable document. Candidate status is deliberately non-authoritative. The Agent must not use candidate content to choose direction unless the user separately supplies the same content as a current instruction.

### 8.5 Declined entry form

```markdown
- `docs/archive/old-prd.md`
  - reason: `Superseded by the current product direction.`
  - reconsider_when: `Its status or content changes materially.`
  - declined_at: `2026-07-15`
```

Declined entries prevent repeated noisy suggestions. They remain contextual metadata, not authority. A materially changed file may be proposed again with an explanation of what changed.

### 8.6 Parsing and preservation

The schema marker and section names make mechanical checks possible while keeping the file readable. The parser must:

- accept ordinary Markdown prose outside canonical entries;
- preserve comments, prose, entry order, and unknown optional fields;
- reject duplicate active paths, escaped paths, malformed required fields, and ambiguous section placement;
- report the exact file and line of a malformed canonical entry;
- preserve the original file byte-for-byte when validation fails;
- never silently repair or rewrite a malformed file.

Repository-relative paths must resolve within the project root. Symlinks that escape the root, credentials, private keys, secret stores, and known sensitive files cannot be registered as truth sources.

## 9. Installation and bootstrap behavior

### 9.1 New projects

For a new project, `init`:

1. installs the selected host Skill and managed bootstrap blocks;
2. creates or preserves `.vibetether/intent.md`, `.vibetether/state/current.yaml`, and `.vibetether/experience-index.yaml`;
3. creates `.vibetether/TRUTH.md` in the blank canonical form;
4. writes `.vibetether/project.yaml` as the control-plane topology and points it to the truth map with:

   ```yaml
   truth_index: .vibetether/TRUTH.md
   ```

5. generates `.vibetether/capabilities.yaml` and the reviewed provider state selected by the installation profile;
6. validates that all declared core artifacts exist, are safe, and have compatible schemas;
7. does **not** scan repository documents, classify candidates, or activate project truth.

An empty confirmed section is valid. It means the project has not yet registered project truth; it does not mean the Agent may invent direction. Work-readiness still determines whether the current request is sufficiently clear.

Repeated `init` repairs a missing VibeTether-owned scaffold such as an absent canonical empty experience index, but it never replaces a customized project-owned file. `doctor` remains read-only: it reports the missing or stale control-plane component and gives the exact safe repair command.

### 9.2 Interactive guidance

Interactive initialization may offer a simple next step, but it does not run it automatically:

> VibeTether is ready. Your project truth list is currently empty. You can edit `.vibetether/TRUTH.md`, or tell your Agent: “Search this project for candidate truth and specification documents, explain each one, and ask me to confirm them one at a time.”

When the terminal is interactive, choices must be presented as explicit selectable options with a recommended default. Non-interactive mode prints the same next-step guidance. `--yes` accepts installation defaults only.

### 9.3 No automatic scanning command as the primary UX

The primary workflow is natural-language collaboration with the installed Skill, not a heuristic `scan` command. The Skill can use repository search, version history, document links, host instructions, and code evidence to propose candidates. It must explain why each candidate might matter and request confirmation one document at a time when activation is proposed.

## 10. Agent-assisted truth workflows

### 10.1 Find candidates

When asked to find truth sources, the Agent:

1. performs the integrated task-entry protocol from section 4.4;
2. searches likely documentation roots and repository references;
3. inspects content rather than classifying by filename alone;
4. excludes already confirmed or unchanged declined entries;
5. reports candidate path, suggested role, scope, evidence, conflicts, and confidence limitations;
6. may add proposed entries under `Candidates awaiting confirmation`;
7. asks the user before promoting any entry.

The Agent may investigate all discoverable facts autonomously. It does not ask the user to locate files the repository can reveal.

### 10.2 Promote or reject a candidate

After explicit confirmation, the Agent moves the entry to `Confirmed project truth`, records the final role and scope, and adds concise confirmation evidence. After rejection, it moves the entry to `Declined candidates` with the user's reason or a faithful concise summary.

### 10.3 Discussion-created documents

If a conversation reaches an approved direction, requirement, architecture, UI design, release policy, or other durable decision and the Agent writes it to a project document, the Agent may immediately add that document as a candidate. Approval of the document's contents does not automatically approve its permanent role in the truth index. The Agent asks a separate concise confirmation before promotion.

### 10.4 Moves, deletions, role changes, and supersession

When a confirmed file is missing, moved, deleted, materially repurposed, or superseded, the Agent proposes an index change and asks the user before changing the active registry. Read-only investigation may continue. Consequential work that depends on the affected source pauses until the user resolves it.

Editing content inside an already confirmed source does not require re-adding the source. The project's normal product, design, code-review, or release controls govern the content change. Changing the source's registered role, scope, or authority does require confirmation.

### 10.5 Nested governance

Root and nested `AGENTS.md`, `CLAUDE.md`, and equivalent host rules are governance sources with path scope:

- a root entry applies repository-wide;
- a nested entry applies to its containing subtree;
- the most specific applicable host rule is read in addition to, not as a silent replacement for, its parent;
- a conflict that the host platform does not already resolve is surfaced to the user.

Nested rules are not automatically discovered and activated as project truth during installation. The Agent may propose them later when it encounters the relevant subtree.

## 11. Adaptive truth rereading

### 11.1 Two-level re-anchor

VibeTether uses a two-level adaptive policy.

**Lightweight anchor**

At task entry and before each safe local slice, the Agent checks:

- current goal;
- current phase;
- applicable truth roles and scopes from `.vibetether/TRUTH.md`;
- current risk class;
- whether any relevant source, candidate, or conflict changed.

**Full relevant re-anchor**

The Agent rereads the applicable original sources, not merely their index entries, at:

- task start;
- compaction, resume, or handoff;
- goal or scope change;
- phase transition;
- product, architecture, UI, data, permission, migration, or release decisions;
- truth-source addition, removal, move, or material update;
- a conflict, user correction, or repeated failure;
- before completion, merge, deployment, release, or publication.

Within one unchanged, low-risk, reversible implementation slice, the Agent does not repeatedly reload every document.

### 11.2 Applicability

Applicability is determined by:

- path scope, including nested governance;
- registered role;
- optional `when` signals;
- current task, phase, and risk;
- direct references between confirmed sources.

The Agent reads all relevant confirmed sources when multiple roles apply. It does not read the full project corpus merely because a document is registered.

### 11.3 Checkpoint evidence

The checkpoint records:

- Intent Contract fingerprint;
- truth-index fingerprint;
- applicable source paths and fingerprints;
- roles and scopes selected;
- last full relevant read time;
- current goal, phase, and risk;
- relevant unresolved candidates or conflicts;
- selected capability route and any material fallback reason;
- route-handshake status and disposition evidence;
- relevant experience match and revalidation state.

Fingerprints establish whether the referenced bytes changed. They do not prove semantic understanding.

### 11.4 Mechanical doctor checks

`vibetether doctor` can verify:

- every manifest-declared core control-plane artifact exists, resolves safely, and has a compatible schema;
- the truth index exists and parses;
- confirmed paths resolve safely;
- active paths are not duplicated;
- registered sources are not missing or changed since the recorded anchor;
- a completion-like checkpoint has a current relevant-read record;
- relevant conflicts and success-capture dispositions are resolved;
- the selected route is installed or has a declared fallback.

The human doctor report groups findings under `bootstrap`, `intent`, `truth`, `state`, `routing`, `experience`, and `providers` so a beginner can see which part of the control plane needs attention. It does not modify project-owned semantic files.

`doctor` must describe these as mechanical consistency checks, never as proof that the Agent followed or understood every instruction.

## 12. Capability routing and long-task behavior

VibeTether remains the entry Skill. At task entry and every phase boundary it:

1. runs the integrated control-plane read and reconciliation protocol;
2. re-anchors to host governance, current intent, runtime state, and relevant project truth;
3. assesses work readiness;
4. identifies the current lifecycle phase and risk;
5. recalls relevant confirmed experience when operational signals match;
6. consults `.vibetether/capabilities.yaml` plus any validated project-local routes;
7. recommends the best installed Skill, declared alternative, or fallback;
8. records the route in the semantic checkpoint and deterministic route handshake;
9. closes the route with bounded evidence before another phase starts;
10. repeats the process when the phase changes.

Starting a route must fail when its phase conflicts with the semantic checkpoint. Starting, completing, or abandoning a route atomically synchronizes the checkpoint's `provider_selection` fields with the machine-owned handshake without rewriting unrelated semantic checkpoint content. `doctor` reports a mismatch left by interruption and tells the Agent whether to reconcile, complete, or abandon the route.

Routing is advisory, not coercive. The Agent should automatically use a recommended installed Skill when it fits. If it selects an alternative, it records the material reason. VibeTether does not require the user to know that `grill-me`, `writing-plans`, TDD, UI review, deployment, or another lower-level Skill exists.

Readiness must distinguish directional gaps from ordinary technical choices:

- ambiguous product intent, architecture, visual direction, destructive data changes, permissions, and release scope require user confirmation;
- low-risk, reversible, goal-aligned technical choices remain autonomous;
- discoverable facts are investigated before a question is asked;
- unresolved questions are asked one recommended decision at a time.

## 13. Proven Path experience rail

### 13.1 Separation of concerns

The truth index contains one infrastructure pointer to `.vibetether/experience-index.yaml`; it does not duplicate every experience artifact.

An experience entry describes:

- the workflow that succeeded;
- systems, environment, and versions;
- decisive but non-obvious conditions;
- verification evidence;
- known failure modes;
- applicability and revalidation conditions;
- artifact locations and sensitive-data exclusions.

Experience is evidence about execution, not authority over product direction.

### 13.2 Selective recall

Before a build, deployment, release, migration, environment setup, authentication flow, external-service operation, Windows recovery, network recovery, repeated error, or a user statement such as “this worked before,” VibeTether matches experience metadata and reads only the most relevant artifact or smallest relevant set.

Ordinary coding does not load the complete experience corpus. A weak metadata match is reported as such and requires revalidation before reuse.

### 13.3 Candidate capture and activation

After every verified user-level or engineering-level success, the Success Capture Gate evaluates reuse value. A first reusable workflow success, a recovered workflow, or a materially changed workflow produces a candidate Proven Path or candidate update. The Agent presents:

- what succeeded;
- why it is reusable;
- decisive conditions;
- proposed artifact and index placement;
- sensitive information that was excluded.

The candidate does not become an active experience-index entry until the user confirms it. An unchanged repeat deduplicates against the existing path. A materially changed path updates the existing artifact and requires renewed confirmation of the changed applicability.

The completion checkpoint records one of the existing final dispositions:

- `captured`: the user confirmed and the durable path is indexed;
- `already-encoded`: an unchanged applicable path already exists;
- `not-reusable`: the user determined that the success should not be reused, with a reason.

If the user defers the decision, the checkpoint remains pending and a completion-like state cannot pass `doctor` until the disposition is resolved.

Credentials, private keys, one-time codes, private reasoning, session cookies, access tokens, and sensitive raw tool output are never persisted.

## 14. Truth-versus-experience conflict protocol

If an applicable Proven Path conflicts with confirmed project truth, the Agent does not choose silently.

It must:

1. stop the consequential action affected by the conflict;
2. cite the confirmed truth path, role, and relevant requirement;
3. cite the Proven Path, recorded conditions, and success evidence;
4. explain the practical impact of following either side;
5. recommend one resolution with a concise reason;
6. ask the user to decide;
7. after the decision, update the correct durable source, experience applicability, or status so the resolution is not left only in chat.

Safe read-only investigation may continue while waiting. Platform safety, legal, and runtime constraints are not offered as overridable options.

The same user-decision protocol applies when two confirmed project sources conflict and no explicit authority rule already resolves them.

## 15. Backward-compatible migration

### 15.1 Existing active sources

On the first upgrade from the legacy manifest:

1. create `.vibetether/TRUTH.md` atomically;
2. migrate every existing active manifest source into `Confirmed project truth` with `source: legacy-manifest-migration`;
3. preserve path, role, scope, description, and custom metadata where representable;
4. preserve custom sources and the existing experience index;
5. set `truth_index: .vibetether/TRUTH.md`;
6. keep the old manifest `sources` data for one compatibility release as deprecated migration evidence and rollback support;
7. make the new resolver ignore legacy `sources` after successful migration so there is only one authority list;
8. warn if legacy source data is edited after migration.

Migrated active entries do not require fresh confirmation because the upgrade must not silently deactivate previously governing behavior. They are visibly marked so the user can audit them later.

### 15.2 Transaction safety

Migration writes a temporary file, validates it, and renames it atomically. Any failure leaves the prior manifest and installed Skill usable. An existing user-created `TRUTH.md` is never overwritten. A conflicting preexisting file causes a clear stop with recovery instructions.

### 15.3 Rollback

During the compatibility window, the old release can still read its preserved source list. The new release treats `TRUTH.md` as authoritative. Rollback and re-upgrade tests must prove no source loss or duplicate activation.

## 16. README information architecture

### 16.1 Product promise

The README leads with this honest positioning:

> Strong coding Agents can still drift in long tasks, forget the right Skill at the next phase, or lose a workflow that already worked. VibeTether gives them a project-local control plane for truth, intent, state, routing, evidence, and proven paths.

It may say VibeTether is designed for stronger Agents such as Fable 5 and GPT-5.6, and that its goal is to reduce long-task drift and expensive rework. It must not claim guaranteed drift prevention, semantic enforcement, or measured Token savings.

### 16.2 Page order

The English README uses this order:

1. compact product name, one-line promise, and useful badges;
2. three core values:
   - coordinate truth, current intent, state, evidence, and experience across long tasks;
   - route each phase to the right Skill without requiring Skill-name knowledge;
   - keep new project truth and reusable workflows user-confirmed;
3. the simplest reliable one-command installation;
4. a compact capability table;
5. one short terminal animation;
6. beginner-friendly natural-language examples;
7. advanced installation, profiles, providers, custom routes, verification, recovery, and honest limits.

The simplest command appears before customizable commands. Provider catalogs and exhaustive troubleshooting remain available but do not dominate the landing page.

The primary copy-paste command remains the reviewed Codeload form, which avoids npm's Git/SSH package acquisition path and installs the complete curated setup for both supported hosts:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether init --project . --agent both --profile extended --bundle web --bundle production --yes
```

Immediately below it, the README offers the guided form for users who prefer finite prompts and recommended defaults:

```sh
npx --yes --package=https://codeload.github.com/t01089572455/vibetether/tar.gz/refs/heads/main vibetether init --project .
```

Both commands create an empty project-truth section under this design. The first command's `--yes` approves only the displayed installation choices, never a truth source.

### 16.3 Capability table

The top capability table must make these behaviors explicit:

| Capability | What the user gets |
| --- | --- |
| Project control plane | Intent, truth, state, routing, evidence, and experience are coordinated through one entry Skill |
| User-owned truth map | One visible Markdown entry point; every new active document is confirmed |
| Adaptive re-anchor | Relevant originals are reread at task, phase, risk, resume, and completion boundaries |
| Readiness and Skill routing | The Agent detects missing direction and selects an installed Skill or fallback |
| Long-task checkpoints | Goal, source, risk, route, evidence, and experience state survive phase changes |
| Proven Path recall | Matching build, deploy, auth, environment, and recovery workflows are reused selectively |
| Success capture | First reusable successes become user-confirmed durable candidates |
| Conflict escalation | Truth-versus-truth and truth-versus-experience conflicts return to the user |
| Extensibility | Projects can add Skills and routes without forking VibeTether |
| Resilient setup | Curated providers, deterministic verification, and Windows recovery are documented |

### 16.4 Control-surface table

The README retains a concise “What initialization adds” table and expands it to the complete seven-part control surface:

| Artifact | Beginner-facing explanation | Maintenance mode |
| --- | --- | --- |
| `AGENTS.md` and/or `CLAUDE.md` | Makes the host re-enter VibeTether at long-task boundaries | marked block managed automatically |
| `.vibetether/TRUTH.md` | Lists the durable project documents the user has confirmed | Agent-assisted, user-confirmed |
| `.vibetether/intent.md` | Holds the current approved goal, boundaries, and success evidence | Agent-proposed, user-confirmed direction |
| `.vibetether/project.yaml` | Connects all control-plane files and project gates | CLI-managed topology |
| `.vibetether/capabilities.yaml` | Shows scenarios, Skills, fallbacks, outputs, and evidence | generated automatically |
| `.vibetether/state/current.yaml` | Keeps the current phase and bounded slice resumable | Agent-maintained runtime checkpoint |
| `.vibetether/experience-index.yaml` | Points to confirmed workflows that have actually succeeded | Agent-assisted, user-disposed |

The README also names `.vibetether/state/route-handshake.yaml`, `.vibetether/routes.local.yaml`, and `.vibetether/providers.lock.yaml` as advanced supporting files. It clearly explains that no background daemon exists: deterministic files update when the CLI runs; semantic files update when a cooperating Agent follows the installed instructions.

### 16.5 Natural-language examples

The README includes copyable examples:

```text
Search this project for candidate truth and specification documents,
explain each one, and ask me to confirm them one at a time.
```

```text
Add the design document we just approved as a truth-map candidate.
```

```text
Check the truth map for missing, moved, stale, or overlooked documents.
```

```text
Before starting this long task, read the relevant project truth and any
matching Proven Path, then route the first phase for me.
```

Equivalent concise Chinese examples may appear in a localized section or linked Chinese guide.

### 16.6 Terminal animation

A deterministic, accessible terminal animation is stored under `docs/assets/` and kept below approximately 2 MB and 10-12 seconds. It demonstrates:

1. VibeTether loading intent, truth, checkpoint, routing, and relevant experience through one control-plane entry;
2. detecting a missing directional decision;
3. recommending a clarification Skill;
4. recalling one relevant Proven Path at a later operational phase;
5. surfacing a conflict and asking the user;
6. offering a success-capture candidate.

The animation uses no flashing content, includes meaningful alt text, and has a short text transcript immediately below it. It demonstrates a real supported flow, not a fabricated command result.

### 16.7 Community reference patterns

README structure may be inspired by these public projects without copying their prose or methodology:

- `mattpocock/skills`: fast problem-to-setup narrative;
- `obra/superpowers`: plain-language automatic workflow story;
- `github/spec-kit`: compact brand, badges, and visual entry;
- `anthropics/skills`: direct definition and minimal conceptual overhead.

These are presentation references, not normative product requirements or bundled dependencies.

## 17. Failure and safety behavior

| Condition | Required behavior |
| --- | --- |
| A core control-plane artifact is missing | `doctor` names the responsibility and safe repair; repeated `init` repairs only VibeTether-owned or canonical-empty infrastructure |
| Intent, checkpoint, and current request disagree | Re-anchor, cite the mismatch, and ask only when resolving it changes direction |
| Checkpoint phase and route handshake differ | Refuse phase advancement; reconcile, complete, or abandon before continuing |
| `TRUTH.md` is malformed | Preserve it, report exact location, stop only affected routing/activation |
| A confirmed file is missing or moved | Report it; block only dependent consequential work; ask for registry update |
| A candidate exists | Keep it non-authoritative until confirmation |
| Two confirmed sources conflict | Present both and ask the user |
| Truth and Proven Path conflict | Use section 14; never let experience silently win |
| A path escapes project root | Reject it |
| A path targets sensitive material | Reject it and explain the category without exposing content |
| A source changes after anchor | Require a relevant reread before consequential action |
| Experience match is weak or stale | Mark it for revalidation; do not present it as proven for current conditions |
| Existing project upgrades | Migrate losslessly; do not rescan or replace established authority |
| Interactive question is needed | Offer explicit choices and a recommended default |
| Non-interactive install uses `--yes` | Accept installation defaults only; never approve truth or release decisions |

## 18. Verification and acceptance matrix

### 18.1 Control-plane integration

- New install creates or safely preserves every core control artifact and `doctor` reports all seven responsibility areas healthy.
- A project missing the canonical empty experience index is repaired by repeated `init` without changing its Intent Contract, truth map, checkpoint, or custom routes.
- Task entry follows the ordered host, manifest, truth-index, intent, checkpoint, applicable-source, readiness, capability, and selective-experience protocol.
- Starting a route with a phase that differs from the semantic checkpoint fails without writing either file.
- Route start, completion, and abandonment synchronize only the checkpoint's provider-selection fields and the route handshake atomically.
- A routed Skill output that creates a potential governing document becomes a non-authoritative candidate, not silent truth.
- Runtime bookkeeping updates do not ask unnecessary questions; direction, truth activation, high-risk actions, and experience activation remain user-confirmed.
- `doctor` groups machine-readable and human-readable findings by bootstrap, intent, truth, state, routing, experience, and provider health.
- No control operation duplicates normative prose across `TRUTH.md`, `intent.md`, the manifest, checkpoint, and experience index.

### 18.2 Truth-map behavior

- A new install creates the blank canonical `TRUTH.md` and does not scan or activate repository documents.
- Manual canonical edits survive re-init byte-for-byte except when the user explicitly asks the Agent to edit them.
- Agent-assisted discovery can add candidates without activating them.
- Promotion and rejection require explicit user confirmation and produce the correct section transition.
- An unconfirmed candidate never affects readiness, routing, implementation direction, or completion evidence.
- Root and nested governance apply only to their scopes.
- A malformed entry reports a precise location and does not rewrite the file.
- Missing, escaped, symlink-escaped, duplicate, and sensitive paths fail safely.

### 18.3 Long-task control

- Task start reads bootstrap, manifest, truth index, Intent Contract, checkpoint, and relevant confirmed originals before routing.
- Compaction, resume, handoff, phase change, goal change, relevant conflict, and completion trigger a fresh relevant anchor.
- An unchanged low-risk slice does not reload the entire corpus.
- Checkpoints expose intent, truth-index, and selected-source fingerprints plus route-handshake disposition.
- `doctor` detects stale or missing mechanical evidence without claiming semantic understanding.
- Automatic routing is reevaluated at phase transitions, including clarification, planning, implementation, review, deployment, and capture phases.

### 18.4 Experience behavior

- Matching reads only the most relevant artifact or smallest relevant set.
- A first reusable verified success creates a candidate and requires confirmation before active indexing.
- An unchanged repeat produces `already-encoded` rather than a duplicate document.
- A changed workflow requires updated evidence and reconfirmation.
- Truth-versus-experience conflict stops consequential action and asks the user.
- No secret or sensitive tool output appears in captured artifacts.

### 18.5 Migration and compatibility

- Every legacy active source migrates without loss.
- Custom sources and experience entries are preserved.
- The new resolver has exactly one authority index after migration.
- Rollback and re-upgrade do not duplicate, drop, or silently reclassify sources.
- Existing customized managed blocks and Skills remain protected.

### 18.6 Installation matrix

Automated and clean-room tests cover:

- Windows and Linux;
- Node.js 20 and 24;
- Codex, Claude, and both adapters;
- core, standard, and extended profiles;
- no-provider and curated-provider paths;
- interactive choices and non-interactive `--yes`;
- repeated init, interrupted init, locked Windows Skill directory, recovery, and uninstall dry-run.

### 18.7 README checks

- the first installation command is executable and matches the current package behavior;
- all links and local assets resolve;
- the terminal animation remains within the agreed size and duration;
- the transcript matches the animation;
- capability claims map to tested behavior;
- limitations explicitly reject guaranteed compliance, guaranteed drift prevention, and measured Token-savings claims;
- the easiest path appears before customization and provider detail.

## 19. Rollout sequence

Implementation planning should split the work into independently verifiable slices:

1. control-plane topology, ownership contracts, and integration tests;
2. truth schema, parser, and blank scaffold;
3. new-install repair behavior and legacy migration;
4. installed-Skill workflows for candidate discovery, confirmation, lifecycle, and nested scope;
5. integrated task-entry, adaptive reread, and semantic checkpoint evidence;
6. atomic route-handshake and checkpoint provider-selection synchronization;
7. Proven Path candidate activation and conflict handling;
8. grouped doctor and CLI consistency checks;
9. README rewrite and deterministic animation;
10. clean-room cross-platform verification and release evidence.

Each slice must preserve the previous installed copy on failure. Public release occurs only after the full acceptance matrix passes.

## 20. Approved acceptance criteria

This design is complete when implementation proves all of the following:

1. VibeTether behaves as one coordinated control plane for host rules, truth, intent, state, routing, evidence, and experience rather than as a route lookup alone;
2. a new user can install VibeTether without accidental truth activation;
3. the user can manage project truth manually or through natural-language Agent help;
4. every newly active project document has explicit confirmation evidence;
5. existing projects migrate without losing their current behavior;
6. the Agent rereads applicable intent and truth at long-task boundaries and records mechanical evidence;
7. capability routing is reconsidered at every lifecycle phase, not just the first prompt;
8. semantic checkpoint and deterministic route state cannot drift silently;
9. Proven Paths are recalled selectively and captured only after verified success and user disposition;
10. project-truth and experience conflicts return to the user;
11. the README explains the complete control surface, easiest installation, capability set, examples, customization, and honest limits clearly;
12. no implementation or README claim exceeds what tests can demonstrate.

There are no remaining product-direction choices in this specification. Implementation details that do not change these behaviors may be decided autonomously during planning.
