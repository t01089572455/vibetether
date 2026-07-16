# Motion Skills and Route Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship reviewed GSAP and motion-design providers that become visible and signal-routable after VibeTether initialization, and document both the optional CLI route handshake and project-owned custom routing.

**Architecture:** Add two complete, fixed-commit provider catalogs to the existing install-time registry. `motion-design` belongs to the `extended` profile; the eight GreenSock Skills belong to the explicit `web` bundle. Define them as advisory overlays so they enrich the existing UI primary rather than taking ownership of ordinary frontend work. Keep unreviewed external Skills project-local and expose them only through the existing `customize` overlay.

**Tech Stack:** Node.js 20+, JSON provider registry, YAML capability board and local route overlay, Node test runner, Codeload portable CLI documentation.

---

**Implementation status (2026-07-15):** Tasks 1–4 and Task 5 verification
steps are complete. A real Windows initialization exposed a transient Git TLS
failure, so the implementation now retries Git and, only for a fixed public
GitHub commit after those retries are exhausted, falls back to a Codeload archive
before repeating catalog, license, and Skill-fingerprint checks. The final
release commit and remote verification remain the only outstanding lifecycle
steps.

### Task 1: Write red contracts for reviewed motion providers and precise route selection

**Files:**
- Modify: `test/provider-registry.test.mjs`
- Modify: `test/public-release.test.mjs`

- [ ] **Step 1: Add a provider-registry test that requires the two provider sources and their intended exposure**

Append a test that loads the public registry and asserts the following exact public contract:

```js
const sources = new Map(registry.sources.map((source) => [source.id, source]));
assert.equal(sources.get('lottiefiles-motion-design-skill').license, 'MIT');
assert.equal(sources.get('greensock-gsap-skills').license, 'MIT');
assert.equal(resolveCatalogSources(registry, 'extended', ['web']).some(
  (source) => source.id === 'lottiefiles-motion-design-skill',
), true);
assert.equal(resolveCatalogSources(registry, 'extended', ['web']).some(
  (source) => source.id === 'greensock-gsap-skills',
), true);
```

Also assert that `resolveExposurePlan(registry, 'extended', { bundles: ['web'], explicit_bundles: ['web'], signals: [] })` exposes `motion-design` plus all eight names: `gsap-core`, `gsap-frameworks`, `gsap-performance`, `gsap-plugins`, `gsap-react`, `gsap-scrolltrigger`, `gsap-timeline`, and `gsap-utils`.

- [ ] **Step 2: Add route-resolution assertions that distinguish motion work from ordinary frontend work**

Build a capability board for `extended` + explicit `web`, then assert:

```js
const motionDesign = resolveBoardRoute(board, {
  phase: 'DESIGN', capability: 'frontend-product-design',
  signals: ['animation'], harness: 'codex',
});
assert.equal(motionDesign.overlays.some((route) => route.skill === 'motion-design'), true);

const motionImplementation = resolveBoardRoute(board, {
  phase: 'EXECUTE_ONE', capability: 'frontend-engineering',
  signals: ['motion'], harness: 'codex',
});
assert.equal(motionImplementation.overlays.some((route) => route.skill === 'gsap-core'), true);

const ordinaryReact = resolveBoardRoute(board, {
  phase: 'EXECUTE_ONE', capability: 'frontend-engineering',
  signals: ['react'], harness: 'codex',
});
assert.equal(ordinaryReact.overlays.some((route) => route.skill.startsWith('gsap-')), false);
```

- [ ] **Step 3: Add README contract assertions for custom Skill routing and the CLI record boundary**

Require the README to include `route-handshake.yaml`, state that the handshake is written only when the portable CLI commands run, include all three route commands, name `customize`, and contain a natural-language Agent request that asks it to inspect installed project Skills and propose a route for confirmation.

- [ ] **Step 4: Run the focused tests to confirm RED**

Run:

```powershell
node --test test/provider-registry.test.mjs test/public-release.test.mjs
```

Expected: FAIL because the two catalog sources, motion routes, and README tutorial language do not exist yet.

### Task 2: Audit fixed upstream sources and add the two complete provider catalogs

**Files:**
- Create: `registry/catalogs/greensock.json`
- Create: `registry/catalogs/lottiefiles.json`
- Modify: `registry/bundles.json`
- Modify: `THIRD_PARTY_NOTICES.md`

- [ ] **Step 1: Create disposable fixed-commit source checkouts outside the repository**

Clone these exact commits into a disposable `.scratch` directory, never install from a moving branch:

```powershell
git clone https://github.com/greensock/gsap-skills.git <scratch>/gsap-skills
git -C <scratch>/gsap-skills checkout aed9cfd3277740755f6bfc1155c7aa645403b760
git clone https://github.com/lottiefiles/motion-design-skill.git <scratch>/motion-design-skill
git -C <scratch>/motion-design-skill checkout f9a8a041b85185ee4881b3471d3415e939aac772
```

Verify the checked-out SHA, inspect both complete `LICENSE` files, confirm every exposed directory has `SKILL.md`, and run:

```powershell
node scripts/audit-provider-source.mjs --checkout <scratch>/gsap-skills --skill-root skills
node scripts/audit-provider-source.mjs --checkout <scratch>/motion-design-skill --skill-root skills
```

Record the emitted SHA-256 fingerprints verbatim. Do not copy `examples/` from GSAP; catalog installation enumerates only direct `skills/*/SKILL.md` directories.

- [ ] **Step 2: Add the GreenSock catalog with the audited fingerprints**

Create `registry/catalogs/greensock.json` as a `catalog_mode: "complete"` source with `skill_root: "skills"`, `catalog_group: "web"`, `license_path: "LICENSE"`, and full-text MIT license evidence. Include the eight audited `skills/*` entries. Mark every entry `catalog_status: "audited"`, `invocation_policy: "advisory-auto-eligible"`, and `exposure: "bundle"`.

Give `gsap-core` the `frontend-engineering` capability, route phase `EXECUTE_ONE`, priority `115`, `when_any` motion signals, and `workflow_role: "domain"`; its `use_when` must call out framework-agnostic tweens, timelines, scroll work, and reduced-motion. Mark the remaining seven Skills as cataloged and installed provider options with accurate capabilities, but use `invocation_policy: "upstream-explicit-alias"` and `auto_covered_by: ["gsap-core"]` when their dedicated route is not needed. This keeps all eight visible but avoids eight competing automatic overlays.

- [ ] **Step 3: Add the LottieFiles catalog with the audited fingerprint**

Create `registry/catalogs/lottiefiles.json` as a complete extended catalog with the same full-text MIT license evidence fields. Add `motion-design` at `skills/motion-design`, capability `frontend-product-design`, phase `DESIGN`, priority `105`, `when_any: ["animation", "motion", "motion-design", "micro-interaction", "transition", "scroll-animation"]`, and `selection: "recommend-overlay"`. Its reason and exit evidence must require deliberate timing/easing/choreography and a reduced-motion decision before implementation.

- [ ] **Step 4: Register catalogs and exposure sets**

In `registry/bundles.json`, add both catalog JSON paths. Add `lottiefiles-motion-design-skill` to the `extended.catalog_sources`, and add `greensock-gsap-skills` to `bundles.web.catalog_sources`. Do not change `core` or `standard` profile content. Extend `THIRD_PARTY_NOTICES.md` with both source repositories, exact commits, MIT, and included Skill paths.

- [ ] **Step 5: Run provider registry tests to verify GREEN**

Run:

```powershell
node --test test/provider-registry.test.mjs
```

Expected: PASS. The provider registry validates, extended + web exposes nine Skill directories, motion signals produce the two intended overlays, and `react` alone produces none.

### Task 3: Prove initialization writes an inspectable installed-and-routable board

**Files:**
- Modify: `test/provider-init.test.mjs`
- Modify: `test/provider-registry.test.mjs`

- [ ] **Step 1: Add an initialization acceptance test using cached, audited motion sources**

Build a test fixture with nine direct `skills/<name>/SKILL.md` directories and full MIT LICENSE files. Initialize a disposable project for `codex` with `profile: 'extended'`, `bundles: ['web']`, and a source registry that mirrors the production classification. Assert every expected Skill exists under `.agents/skills/`, the provider lock records both catalog source IDs and fingerprints, and `.vibetether/capabilities.yaml` contains each provider.

- [ ] **Step 2: Assert the generated board, not just the registry, contains usable routes**

Parse the generated board and assert `motion-design` is listed in `frontend-product-design.provider_options`; `gsap-core` is listed in `frontend-engineering.provider_options`; the respective overlay routes have concrete `available_in: ['codex']`; and the generated ordinary-React route remains free of a `gsap-*` overlay.

- [ ] **Step 3: Run the focused initialization tests**

Run:

```powershell
node --test test/provider-init.test.mjs test/provider-registry.test.mjs
```

Expected: PASS with no network dependency beyond the audited fixtures.

### Task 4: Make the README and routing guide operational for beginners

**Files:**
- Modify: `README.md`
- Modify: `docs/routing.md`
- Modify: `docs/providers.md`
- Modify: `test/public-release.test.mjs`

- [ ] **Step 1: Add a concise “motion specialists” explanation beside profiles and providers**

Explain that the documented full setup (`--profile extended --bundle web`) installs all nine reviewed motion Skills, caches them under `.vibetether/providers/catalog`, exposes them in the selected host Skill directory, and renders their availability plus routes into `.vibetether/capabilities.yaml`. State that installation does not mean all nine are invoked: only `motion-design` for design motion signals and `gsap-core` for implementation motion signals are automatic advisory overlays; aliases remain explicit specialists.

- [ ] **Step 2: Add an end-to-end “Bring your own Skill” tutorial**

Use these exact beginner steps:

```text
1. Install or copy one reviewed SKILL.md directory into .agents/skills/<name> and/or .claude/skills/<name>.
2. Run the portable `vibetether customize --project .` command.
3. Choose an existing phase/capability, role, and observable signal; inspect the preview and confirm it.
4. Run portable `vibetether capabilities --project .` and a signal-matched portable `vibetether route ...` command to verify the route.
```

Include a copyable Agent prompt that asks it to enumerate installed project Skills, explain each candidate's role and source, propose one smallest-scope route with phase/capability/signals/role/output/evidence, show the `routes.local.yaml` diff, and wait for user confirmation before writing. Include a manually editable YAML example using `motion-audit` as an `overlay`, explaining that local routes are re-read live but cannot weaken gates.

- [ ] **Step 3: Explain the CLI route handshake precisely**

State that automatic phase re-entry is behavioral guidance in the managed `AGENTS.md`/`CLAUDE.md` block; VibeTether has no daemon or host hook. Explain that a complete portable `route` command creates or updates `.vibetether/state/route-handshake.yaml` and synchronizes `.vibetether/state/current.yaml`; `route complete` records bounded evidence and safe project-relative artifacts; `route abandon` records a material reason. Explain that it is the latest route disposition, not a background history or proof of semantic correctness, and only exists when those commands are actually run.

- [ ] **Step 4: Update provider inventory documentation and public tests**

Add exact table rows to `docs/providers.md` for `motion-design` and the eight GSAP Skill names, their profile/bundle, exposure behaviour, source, license, and signal/routing summary. Update source-count and exposed-count assertions in `test/public-release.test.mjs` and any provider documentation totals to match the reviewed catalog size.

- [ ] **Step 5: Run documentation contracts**

Run:

```powershell
node --test test/public-release.test.mjs
```

Expected: PASS; the public README is still below the enforced line limit, contains only portable CLI commands, explains the board, custom route process, Agent-assisted route proposal, and route-handshake file accurately.

### Task 5: Verify the install path, package content, and release integrity

**Files:**
- Modify only files required by failures from prior tasks.

- [ ] **Step 1: Run complete offline verification**

Run:

```powershell
npm.cmd run check
npm.cmd pack --dry-run
```

Expected: the Node test suite, static scenarios, release-history audit, self-validation, and package listing all pass. The package listing includes both new catalogs and all public docs that mention the new install/runtime behaviour.

- [ ] **Step 2: Run a disposable production-registry initialization**

Create a fresh temporary project outside the repository and run the local CLI with:

```powershell
node bin/vibetether.mjs init --project <temp-project> --agent codex --profile extended --bundle web --yes
node bin/vibetether.mjs capabilities --project <temp-project>
node bin/vibetether.mjs route --project <temp-project> --phase DESIGN --capability frontend-product-design --signal animation --agent codex --json
```

Assert the Skill installation paths, board providers, `motion-design` overlay, and created `.vibetether/state/route-handshake.yaml`. Then close the handshake with `route complete` and assert status `satisfied` plus checkpoint synchronization.

- [ ] **Step 3: Review release scope and commit**

Run `git diff --check`, `git status --short`, and inspect the staged diff. Confirm no `.superpowers/` untracked user directory or disposable upstream checkout is staged. Commit only catalog, registry, documentation, notices, and test files:

```powershell
git add registry/catalogs/greensock.json registry/catalogs/lottiefiles.json registry/bundles.json README.md docs/routing.md docs/providers.md THIRD_PARTY_NOTICES.md test/provider-registry.test.mjs test/provider-init.test.mjs test/public-release.test.mjs
git commit -m "feat: route reviewed motion skills"
```

- [ ] **Step 4: Push and verify remote evidence**

Push the reviewed branch to `main`, confirm the remote SHA equals local `HEAD`, and inspect GitHub Actions for the pushed commit. Report the commit, CI result, exact provider pins, installation/routing evidence, and the remaining host-cooperation limitation.

## Self-review

- **Spec coverage:** Task 2 makes all nine sources install-time-reviewed and pinned; Task 3 proves they are present in the generated capability board; Task 4 gives both manual and Agent-assisted custom route tutorials and defines the route-handshake boundary; Task 5 performs package, initialization, state-writing, commit, and remote checks.
- **Placeholder scan:** no deferred implementation markers; the only variables are intentionally disposable paths for safe test directories.
- **Type consistency:** production source IDs are `greensock-gsap-skills` and `lottiefiles-motion-design-skill`; runtime Skill names are the listed `gsap-*` values and `motion-design`; the persisted handshake path is `.vibetether/state/route-handshake.yaml`.
