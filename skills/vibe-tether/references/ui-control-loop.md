# UI Control Loop

## Core Rule

Treat UI direction as a product decision. Do not let an aesthetic provider remove capabilities, replace information architecture, or propagate an unapproved pattern.

## Flow

```text
UI_DISCOVER
  -> PRODUCT_UX_CONTRACT
  -> REFERENCE_INTAKE
  -> DESIGN_CONTRACT
  -> GOLDEN_SCREEN_APPROVAL
  -> IMPLEMENT_ONE_STATE
  -> RENDER_AND_COMPARE
  -> FUNCTIONAL_ACCEPTANCE + VISUAL_ACCEPTANCE
  -> LOCK_AND_PROPAGATE
```

## Product and UX Contract

Capture user, primary task, information architecture, required capabilities, key states, accessibility, responsive obligations, explicit non-goals, and capabilities visual simplification may not remove.

## Reference Intake

Inspect the current implementation, existing design system, current screenshots, and two or three strong references when available.

Classify each reference as exact reproduction, structural, hierarchy or density, typography or color, interaction, inspiration only, or incompatible. Record what to adapt, what not to copy, intentional product differences, and acceptance evidence.

Do not convert a screenshot into a literal copy without understanding its intent.

## Design Contract

Lock:

- typography and content voice;
- color and semantic state colors;
- spacing, density, radius, elevation, and surface hierarchy;
- component system;
- motion and reduced-motion behavior;
- responsive breakpoints and narrow-screen behavior;
- accessibility targets;
- anti-references and prohibited patterns.

## Golden-Screen Gate

Before broad implementation, produce two or three low-cost directions or one representative golden screen/state family. Ask the user to approve the direction. Extract and lock tokens and component rules only after approval.

Do not build the full application, parallelize page generation, or spread a visual system before this gate passes.

## Implementation Loop

Implement one screen, state family, or component slice:

```text
render
  -> capture desktop, narrow, and key states
  -> compare with contract and references
  -> annotate concrete differences
  -> repair one difference class
  -> rerender
```

Translate "it still looks wrong" into hierarchy, spacing, density, typography, color, component, motion, responsive, or reference-intent differences.

## Dual Acceptance

Functional acceptance requires user task completion, data and API behavior, loading/empty/error/success/permission/recovery states, keyboard behavior, accessibility, and console/network health.

Visual acceptance requires hierarchy, density, spacing, alignment, typography, tokens, reference intent, desktop/narrow behavior, state consistency, and capability preservation.

Functional tests cannot prove visual acceptance. Screenshots cannot prove functional acceptance.

## Provider Roles

Use an existing design system before an external aesthetic provider. Use one aesthetic director, one engineering provider, and validation capabilities as needed. Product workbenches and marketing surfaces require different aesthetic policies.

Do not activate multiple overlapping aesthetic Skills. Do not choose a provider only by popularity.

## Stop Conditions

Stop when the visual direction is unapproved, current screenshots are missing for a redesign, a reference conflicts with required capabilities, the agent proposes a full rewrite before a golden screen, visual feedback is not converted into observable differences, or visual simplification removes product behavior.

