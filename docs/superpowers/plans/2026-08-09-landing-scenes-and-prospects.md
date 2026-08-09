# Landing Scenes and Prospects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize Page 4–8 camera and copy transitions, remove competing snap behavior, make Page 9 freely reachable, and replace its limitation narrative with competition-ready application prospects.

**Architecture:** A pure helper converts actual stop offsets into one camera/copy state. Native CSS owns snapping through Page 8, a tail class releases Page 9, and the tree Canvas renders only when LandingPage requests a frame after updating progress.

**Tech Stack:** Next.js 16, React 19, TypeScript, React Three Fiber/Three.js, Vitest, Testing Library, CSS scroll snap.

---

### Task 1: Unify tree-scene scroll coordinates

**Files:**
- Create: `src/components/landing/landingScroll.ts`
- Create: `src/components/landing/landingScroll.test.ts`
- Modify: `src/components/landing/LandingPage.tsx`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, test } from "vitest";
import { resolveTreeScrollState } from "./landingScroll";

describe("resolveTreeScrollState", () => {
  const stops = [3240, 4320, 5400, 6480, 7560];

  test("maps every real stop to the same camera and copy index", () => {
    stops.forEach((scrollTop, chapter) => {
      expect(resolveTreeScrollState(scrollTop, stops)).toEqual({
        chapter,
        progress: chapter / 4,
      });
    });
  });

  test("does not depend on viewport height", () => {
    expect(resolveTreeScrollState(4320, stops)).toEqual({
      chapter: 1,
      progress: 0.25,
    });
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/components/landing/landingScroll.test.ts`

Expected: FAIL because `landingScroll.ts` does not exist.

- [ ] **Step 3: Implement the pure helper**

```ts
export type TreeScrollState = { chapter: number; progress: number };

export function resolveTreeScrollState(
  scrollTop: number,
  stopTops: number[],
): TreeScrollState {
  if (stopTops.length < 2) return { chapter: 0, progress: 0 };
  const first = stopTops[0];
  const last = stopTops.at(-1) ?? first;
  const span = Math.max(1, last - first);
  const progress = Math.min(1, Math.max(0, (scrollTop - first) / span));
  let chapter = 0;
  stopTops.forEach((top, index) => {
    if (scrollTop + 1 >= top) chapter = index;
  });
  return { chapter, progress };
}
```

- [ ] **Step 4: Wire real stop offsets into LandingPage**

Inside the existing requestAnimationFrame scroll update, collect the five `.landing-tree-scroll-stop` absolute tops, call `resolveTreeScrollState`, assign `treeProgressRef.current`, request a scene frame, and commit the returned chapter. Remove the `storyRect.height - innerHeight` calculation.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --run src/components/landing/landingScroll.test.ts src/components/landing/LandingPage.test.tsx`

Expected: both files PASS.

### Task 2: Give scrolling one owner and release Page 9

**Files:**
- Modify: `src/components/landing/LandingPage.tsx`
- Modify: `src/components/landing/LandingPage.test.tsx`
- Modify: `src/components/landing/LandingDesktop.test.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing structural tests**

Add assertions that LandingPage no longer contains `settleToNearestPage` or `window.scrollTo({ top: targetTop`, that it toggles `landing-scroll-tail-free`, and that CSS gives the tail `scroll-snap-type: none`, `height: auto`, `min-height: 100svh`, `overflow: visible`, `scroll-snap-align: none`, and `scroll-snap-stop: normal`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/components/landing/LandingDesktop.test.ts src/components/landing/LandingPage.test.tsx`

Expected: FAIL because the JavaScript snap fallback and fixed Page 9 still exist.

- [ ] **Step 3: Remove JavaScript snapping and add tail release**

Delete the effect that queries all `[data-page]` markers and calls smooth `window.scrollTo`. Add `footerRef`; during the existing rAF scroll update, enable `landing-scroll-tail-free` on `html` and `body` when the Page 9 top enters the lower portion of the viewport, and remove it when returning above Page 9. Cleanup always removes the class.

- [ ] **Step 4: Make Page 9 naturally sized**

Override the generic 1080px landing section rules for Page 9 and give its container `min-height: calc(100svh - 200px)`.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --run src/components/landing/LandingDesktop.test.ts src/components/landing/LandingPage.test.tsx`

Expected: both files PASS.

### Task 3: Align Page 4–8 copy and replace Page 9 narrative

**Files:**
- Modify: `src/components/landing/LandingPage.tsx`
- Modify: `src/components/landing/LandingPage.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing content tests**

Assert that the document contains “让复杂思考长成一棵树”, “应用前景”, “深度学习”, “研究与方案”, “公共治理”, and “负责任智能”, while “需要模型连接” and “状态不跨设备” are absent.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/components/landing/LandingPage.test.tsx`

Expected: FAIL on the prospect copy.

- [ ] **Step 3: Implement approved Page 4–8 mapping**

Update `CHAPTERS` and `TREE_STORIES` to the approved titles and bodies while preserving current icons, feature facts, camera order, and the Page 5 low-risk editorial rail.

- [ ] **Step 4: Implement Page 9 prospect composition**

Replace `.landing-limitation-grid` with a four-card `.landing-prospect-grid`, add the two documented examples, and retain the footer profile logic and `/app` CTA.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --run src/components/landing/LandingPage.test.tsx src/components/landing/LandingDesktop.test.ts`

Expected: both files PASS.

### Task 4: Demand-render the accepted tree scene

**Files:**
- Modify: `src/components/landing/NarrativeTreeScene.tsx`
- Modify: `src/components/landing/NarrativeTreeScene.test.ts`
- Modify: `src/components/landing/LandingDesktop.test.ts`

- [ ] **Step 1: Write failing source-contract tests**

Assert `frameloop="demand"`, `dpr={[1, 1.25]}`, a render-request ref, and the absence of dynamic shadows, sine-based idle sway, and secondary camera lerp.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/components/landing/NarrativeTreeScene.test.ts src/components/landing/LandingDesktop.test.ts`

Expected: FAIL on the current always-render/shadow contract.

- [ ] **Step 3: Implement frame requests**

Expose R3F `invalidate` through a mutable `requestRenderRef`; LandingPage calls it after updating `treeProgressRef`. Set `frameloop="demand"`.

- [ ] **Step 4: Remove redundant GPU work**

Copy sampled keyframes directly to the camera, remove idle sway/manual matrix updates, remove the shadow pipeline, and cap DPR at 1.25. Do not change geometry, materials, colors, or camera keys.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --run src/components/landing/NarrativeTreeScene.test.ts src/components/landing/LandingDesktop.test.ts`

Expected: both files PASS.

### Task 5: Full verification and browser acceptance

**Files:**
- Modify only if verification exposes a scoped defect.

- [ ] **Step 1: Run static verification**

Run `git diff --check`, `npm run lint`, and `npx tsc --noEmit --incremental false`; all must exit 0.

- [ ] **Step 2: Run all tests**

Run `npm test -- --run`; all tests must pass.

- [ ] **Step 3: Run the production build**

Run `npm run build`; the optimized build must emit `/`, `/app`, and the API routes.

- [ ] **Step 4: Browser QA at two desktop heights**

At 1920×1080 and 1920×900, verify Page 4–8 stop/copy alignment, one snap per gesture, Page 9 free scrolling, a fully visible bottom CTA, no 1.5-second rebound, no horizontal overflow, and no browser console errors. Capture Page 4–9 screenshots and an audit JSON.

- [ ] **Step 5: Commit and push**

```bash
git add app/globals.css src/components/landing docs/superpowers
git commit -m "fix: synchronize landing scenes and prospect story"
git push
```
