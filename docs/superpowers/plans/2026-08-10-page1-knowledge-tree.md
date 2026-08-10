# Page 1 Knowledge Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Page 1's ambiguous lower decoration with a readable trunk-and-branch knowledge tree that visually connects all twelve background concepts, while adding a light-green-to-deep-green background gradient.

**Architecture:** Keep the existing DOM keyword spans as the source of truth for text and positions. Add a decorative, `aria-hidden` inline SVG behind the hero content; its path data is deterministic and its twelve endpoint nodes are keyed to the same keyword list. Move the hero background from geometric mountain/white-branch decoration to layered CSS gradients, leaving Page 2–9 unchanged.

**Tech Stack:** Next.js/React, inline SVG, CSS gradients, Vitest, CDP browser QA.

---

### Task 1: Lock the approved visual contract with failing tests

**Files:**
- Modify: `src/components/landing/LandingPage.test.tsx`
- Modify: `src/components/landing/LandingDesktop.test.ts`

- [x] **Step 1: Add the RED DOM contract.** Assert that Page 1 renders one `.landing-hero-tree` SVG, a `.landing-hero-tree__trunk`, at least three primary branches, and exactly twelve `[data-tree-target]` connectors whose target values equal the twelve existing background words. Assert the SVG is decorative with `aria-hidden="true"`.

```tsx
const tree = document.querySelector(".landing-hero-tree");
expect(tree).toHaveAttribute("aria-hidden", "true");
expect(tree?.querySelector(".landing-hero-tree__trunk")).toBeTruthy();
expect(tree?.querySelectorAll(".landing-hero-tree__primary")).toHaveLength(3);
expect([...tree!.querySelectorAll("[data-tree-target]")]).toHaveLength(12);
```

- [x] **Step 2: Add the RED CSS contract.** Require the hero to use a light-to-deep green gradient and forbid the old mountain/metal branch selectors.

```ts
expect(css).toMatch(/\.landing-hero\s*\{[\s\S]*linear-gradient\([^;]*#(?:[0-9a-f]{6}).*#(?:[0-9a-f]{6})/i);
expect(css).not.toContain(".landing-hero__mountain");
expect(css).not.toContain("hero-branch-metal");
```

- [x] **Step 3: Run the focused tests and confirm they fail for the missing tree contract, not a test typo.**

Run: `npm test -- src/components/landing/LandingPage.test.tsx src/components/landing/LandingDesktop.test.ts`

Expected: FAIL because the new SVG and gradient contract do not exist yet.

### Task 2: Implement the deterministic Page 1 knowledge tree

**Files:**
- Modify: `src/components/landing/LandingPage.tsx`
- Modify: `app/globals.css`

- [x] **Step 1: Replace the old mountain/metal branch markup with an inline SVG.** Keep the existing `BACKGROUND_FRAGMENTS` words and map each word to a deterministic endpoint. Render one central trunk, three primary branches, secondary twig paths, twelve endpoint nodes, and restrained leaf ellipses. Use `data-tree-target={word}` on each connector and `vectorEffect="non-scaling-stroke"` for consistent line weight.

- [x] **Step 2: Keep the tree behind the title and words.** The SVG must be `aria-hidden`, pointer-transparent, positioned in the hero artwork layer, and must not change the existing heading/button DOM or keyword text.

- [x] **Step 3: Replace the old hero background with a readable gradient.** Use a muted light sage/green glow around the upper-middle area fading through forest green into deep green at the lower edges. Keep sufficient contrast for the existing cream title and keyword text; remove the geometric mountain and old white metal branch rules.

- [x] **Step 4: Run the focused tests and confirm GREEN.**

Run: `npm test -- src/components/landing/LandingPage.test.tsx src/components/landing/LandingDesktop.test.ts`

Expected: all focused tests pass.

### Task 3: Verify the visual result without affecting later pages

**Files:**
- Modify: `C:/Users/30120/.codex/visualizations/2026/08/09/019fe41b-2fb7-7381-9e51-0c91c5cfec19/landing-content-logo-qa.mjs`

- [x] **Step 1: Extend browser QA for Page 1.** At 1920×1080 and 1920×900, record the SVG node/connector counts, horizontal overflow, title visibility, and keyword bounding boxes. Fail if the title is obscured, any connector leaves the hero bounds, or any later-page assertion regresses.

- [x] **Step 2: Run the complete verification gate.**

```text
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

- [x] **Step 3: Run the CDP QA script and inspect Page 1 screenshots at both viewports.** Expected: `failures: []`, no browser errors, no horizontal overflow, all twelve words visibly associated with the tree, and Page 2–9 unchanged.

- [ ] **Step 4: Commit the implementation and plan together, then push the existing feature branch.**

```text
git add docs/superpowers/plans/2026-08-10-page1-knowledge-tree.md src/components/landing/LandingPage.tsx src/components/landing/LandingPage.test.tsx src/components/landing/LandingDesktop.test.ts app/globals.css
git commit -m "feat: connect landing keywords with a knowledge tree"
git push origin codex/competition-submission-2026
```
