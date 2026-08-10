# Page 1 Background Image and Foreground Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Page 1's inline SVG tree with the approved PNG artwork, restore the complete Tree Chat header Logo, raise and darken the approved foreground composition, and complete the first-load reveal within two seconds.

**Architecture:** Render one decorative Next.js `<Image>` in a fixed 1672:941 Page 1 artwork coordinate system and keep the twelve accessible keyword labels in the same cover geometry. Preserve keyword positioning on outer spans and animate inner reveal spans so Anime.js cannot overwrite the coordinate transforms. Reuse the existing `BrandLogo` component, Page 1 pseudo-element scrims, and fixed 1080px landing geometry; Page 2–9 remain outside the new artwork and reveal selectors.

**Tech Stack:** Next.js 16.2.3 App Router, React 19, `next/image`, Anime.js 4.5, TypeScript, Vitest/jsdom, CSS, Chrome DevTools Protocol.

**Plan review corrections:** Asset integrity belongs in the independent `page1BackgroundAsset.test.ts` unit test. The keyword layer remains accessible (only the image is `aria-hidden`). The image and keyword layers share a 1672:941 cover geometry without forcing both into a z-index-0 stacking context. The complete `BrandLogo` keeps its canonical asset and uses a 48px Landing header mark override so it fits the compact scrolled header; its source file and intrinsic dimensions remain unchanged. Header chrome is animated through a wrapper/nav target rather than the CTA button itself. Keyword timing is `start: 250`, `stagger: 20`, `duration: 430` (last completion 900ms); content timing is `start: 650`, `stagger: 150`, `duration: 820` (last completion 1920ms).

**Execution status (2026-08-10):** All implementation, focused contracts, browser QA, and full verification steps below were completed. The three slice commits were consolidated into local commit `fad1f03` (`feat: restore Page 1 visual hierarchy`) after the final gate; no remote push was performed.

---

### Task 1: Replace the SVG tree with the canonical PNG and exact keyword coordinates

**Files:**
- Create: `public/assets/landing/page1-tree-background.png`
- Create: `src/components/landing/page1BackgroundAsset.test.ts`
- Modify: `src/components/landing/LandingPage.test.tsx:1-154`
- Modify: `src/components/landing/LandingDesktop.test.ts:91-105`
- Modify: `src/components/landing/LandingPage.tsx:3-315,686-702`
- Modify: `app/globals.css:536-709`

- [x] **Step 1: Add the RED component contract for the canonical image and label-based coordinates**

Add the crypto import and asset constants beside the existing Node imports in `LandingPage.test.tsx`:

```tsx
import { createHash } from "node:crypto";

const PAGE1_BACKGROUND_PATH = resolve(
  process.cwd(),
  "public/assets/landing/page1-tree-background.png",
);
const PAGE1_BACKGROUND_SHA256 =
  "D949942FF9641D0868C5646C62C92E5CC339EC94953260EDE92A84C11085A761";
```

Replace the old Page 1 fragment-position and inline-SVG tests with these two tests:

```tsx
test("renders the canonical Page 1 PNG as the only tree artwork", () => {
  render(<LandingPage profile={PUBLIC_PROFILE} />);

  const background = document.querySelector<HTMLImageElement>(
    ".landing-hero__background[data-page1-background]",
  );
  expect(background).toBeTruthy();
  expect(background).toHaveAttribute("alt", "");
  expect(background).toHaveAttribute("sizes", "100vw");
  expect(decodeURIComponent(background?.getAttribute("src") ?? "")).toContain(
    "url=/assets/landing/page1-tree-background.png",
  );
  expect(document.querySelector(".landing-hero-tree")).toBeNull();

  const bytes = readFileSync(PAGE1_BACKGROUND_PATH);
  expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(
    PAGE1_BACKGROUND_SHA256,
  );
});

test("maps every Page 1 keyword to the approved image coordinate", () => {
  render(<LandingPage profile={PUBLIC_PROFILE} />);

  const expected = {
    灵感: ["8.07%", "13.92%", "18px", "-22px", "left"],
    问题: ["30.74%", "6.48%", "16px", "20px", "left"],
    假设: ["15.25%", "42.61%", "-18px", "-24px", "right"],
    为什么: ["7.12%", "77.79%", "20px", "20px", "left"],
    下一步: ["27.93%", "79.28%", "-18px", "24px", "right"],
    回溯: ["35.41%", "53.77%", "20px", "-20px", "left"],
    证据: ["62.98%", "20.72%", "-18px", "-22px", "right"],
    路径: ["73.03%", "38.26%", "-18px", "-22px", "right"],
    比较: ["86.48%", "9.03%", "18px", "20px", "left"],
    知识: ["93.72%", "51.43%", "-20px", "-22px", "right"],
    连接: ["87.68%", "72.79%", "18px", "20px", "left"],
    可能性: ["58.97%", "86.72%", "18px", "-24px", "left"],
  } as const;
  const fragments = [
    ...document.querySelectorAll<HTMLElement>(".landing-hero-word[data-landing-word]"),
  ];
  const actual = Object.fromEntries(
    fragments.map((fragment) => [
      fragment.dataset.landingWord,
      [
        fragment.style.getPropertyValue("--x"),
        fragment.style.getPropertyValue("--y"),
        fragment.style.getPropertyValue("--dx"),
        fragment.style.getPropertyValue("--dy"),
        fragment.dataset.anchor,
      ],
    ]),
  );

  expect(fragments).toHaveLength(12);
  expect(actual).toEqual(expected);
  expect(
    fragments.map((fragment) =>
      fragment.querySelector(".landing-hero-word__reveal")?.textContent,
    ),
  ).toEqual(Object.keys(expected));
});
```

- [x] **Step 2: Add the RED source/CSS contract for one optimized artwork layer**

Replace the old green-gradient/SVG test in `LandingDesktop.test.ts` with:

```ts
test("uses one optimized Page 1 artwork layer and no inline SVG tree", () => {
  expect(landingPage).toContain(
    'const PAGE1_BACKGROUND_SRC = "/assets/landing/page1-tree-background.png";',
  );
  expect(landingPage).toContain("preload");
  expect(landingPage).not.toContain("function LandingHeroTree");
  expect(landingPage).not.toContain("LANDING_TREE_ENDPOINTS");
  expect(css).toMatch(
    /\.landing-hero__background\s*\{[^}]*object-fit:\s*cover;[^}]*pointer-events:\s*none;[^}]*z-index:\s*0;/,
  );
  expect(css).not.toContain(".landing-hero-tree");
});
```

- [x] **Step 3: Run the focused tests and verify the intended RED failure**

Run:

```powershell
npm test -- src/components/landing/LandingPage.test.tsx src/components/landing/LandingDesktop.test.ts
```

Expected: FAIL because the PNG file and `.landing-hero__background` do not exist, the old SVG still renders, and the old keyword data lacks `dx`, `dy`, and `anchor`.

- [x] **Step 4: Copy the approved binary asset and verify its hash**

Run from `D:\tree-chat`:

```powershell
New-Item -ItemType Directory -Force -Path 'D:\tree-chat\public\assets\landing' | Out-Null
Copy-Item -LiteralPath 'C:\Users\30120\AppData\Local\Temp\codex-clipboard-10820c23-a3d7-49f1-aee1-a9aa1e48ac70.png' -Destination 'D:\tree-chat\public\assets\landing\page1-tree-background.png'
Get-FileHash 'D:\tree-chat\public\assets\landing\page1-tree-background.png' -Algorithm SHA256 | Format-List Path,Hash
```

Expected hash: `D949942FF9641D0868C5646C62C92E5CC339EC94953260EDE92A84C11085A761`.

- [x] **Step 5: Replace the old endpoint/SVG data with the approved keyword data**

Add `Image` and retain `CSSProperties` in `LandingPage.tsx`:

```tsx
import Image from "next/image";
```

Replace `BACKGROUND_FRAGMENTS`, `LANDING_TREE_ENDPOINTS`, and `LandingHeroTree` with:

```tsx
const PAGE1_BACKGROUND_SRC = "/assets/landing/page1-tree-background.png";

const PAGE1_KEYWORDS = [
  { word: "灵感", x: 8.07, y: 13.92, dx: 18, dy: -22, anchor: "left" },
  { word: "问题", x: 30.74, y: 6.48, dx: 16, dy: 20, anchor: "left" },
  { word: "假设", x: 15.25, y: 42.61, dx: -18, dy: -24, anchor: "right" },
  { word: "为什么", x: 7.12, y: 77.79, dx: 20, dy: 20, anchor: "left" },
  { word: "下一步", x: 27.93, y: 79.28, dx: -18, dy: 24, anchor: "right" },
  { word: "回溯", x: 35.41, y: 53.77, dx: 20, dy: -20, anchor: "left" },
  { word: "证据", x: 62.98, y: 20.72, dx: -18, dy: -22, anchor: "right" },
  { word: "路径", x: 73.03, y: 38.26, dx: -18, dy: -22, anchor: "right" },
  { word: "比较", x: 86.48, y: 9.03, dx: 18, dy: 20, anchor: "left" },
  { word: "知识", x: 93.72, y: 51.43, dx: -20, dy: -22, anchor: "right" },
  { word: "连接", x: 87.68, y: 72.79, dx: 18, dy: 20, anchor: "left" },
  { word: "可能性", x: 58.97, y: 86.72, dx: 18, dy: -24, anchor: "left" },
] as const;
```

- [x] **Step 6: Render the optimized background and transform-safe keyword wrappers**

Replace the Page 1 SVG and word markup with:

```tsx
<div className="landing-hero-art" aria-hidden="true">
  <Image
    className="landing-hero__background"
    src={PAGE1_BACKGROUND_SRC}
    alt=""
    aria-hidden="true"
    fill
    preload
    sizes="100vw"
    data-page1-background="true"
  />
</div>
<div className="landing-hero-words">
  {PAGE1_KEYWORDS.map((fragment) => (
    <span
      className="landing-hero-word"
      data-anchor={fragment.anchor}
      data-landing-word={fragment.word}
      key={fragment.word}
      style={{
        "--x": `${fragment.x}%`,
        "--y": `${fragment.y}%`,
        "--dx": `${fragment.dx}px`,
        "--dy": `${fragment.dy}px`,
      } as CSSProperties}
    >
      <span className="landing-hero-word__reveal">{fragment.word}</span>
    </span>
  ))}
</div>
```

- [x] **Step 7: Replace the old tree CSS with the image and coordinate rules**

Change `.landing-hero` to use a dark fallback and remove every `.landing-hero-tree*` rule. Add:

```css
.landing-hero {
  align-items: center;
  background: var(--landing-forest-950);
  display: flex;
  justify-content: center;
  height: 1080px;
}

.landing-hero-art,
.landing-hero-words {
  aspect-ratio: 1672 / 941;
  height: max(100%, 56.28vw);
  left: 50%;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: auto;
}

.landing-hero-art {
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.landing-hero-words {
  overflow: hidden;
  pointer-events: none;
  z-index: 3;
}

.landing-hero__background {
  inset: 0;
  object-fit: cover;
  object-position: center;
  pointer-events: none;
  position: absolute;
  z-index: 0;
}

.landing-hero-word {
  left: var(--x);
  opacity: .48;
  position: absolute;
  top: var(--y);
  transform: translate(var(--dx), var(--dy));
  white-space: nowrap;
}

.landing-hero-word[data-anchor="right"] {
  transform: translate(calc(-100% + var(--dx)), var(--dy));
}

.landing-hero-word__reveal {
  display: block;
}
```

Keep `.landing-hero-words` at `overflow: hidden; pointer-events: none; z-index: 3` while it inherits the shared 1672:941 cover geometry above. Move the existing font, color, size, and text-shadow properties from `.landing-hero-words span` to `.landing-hero-word__reveal`. Delete the special-case `回溯` and `可能性` selectors because the approved `dx/dy/anchor` data replaces them.

- [x] **Step 8: Run the focused tests and verify GREEN**

Run:

```powershell
npm test -- src/components/landing/LandingPage.test.tsx src/components/landing/LandingDesktop.test.ts
```

Expected: both files pass; the component suite reports 12 canonical coordinates and no `.landing-hero-tree` DOM.

- [x] **Step 9: Consolidate the artwork slice in the final local commit**

```text
Covered by consolidated local commit `fad1f03` after the complete verification gate.
```

### Task 2: Restore the complete Logo and approved foreground hierarchy

**Files:**
- Modify: `src/components/landing/LandingPage.test.tsx`
- Modify: `src/components/landing/LandingDesktop.test.ts`
- Modify: `src/components/landing/LandingPage.tsx:669-684`
- Modify: `app/globals.css:286-360,450-500,536-620`

- [x] **Step 1: Add RED tests for the full Logo and approved visual values**

Add this component test:

```tsx
test("restores the complete Tree Chat Logo in the landing header", () => {
  render(<LandingPage profile={PUBLIC_PROFILE} />);

  const brand = document.querySelector<HTMLElement>(".landing-header__brand");
  const logo = brand?.querySelector<HTMLElement>(":scope > .brand-logo");
  expect(logo).toBeTruthy();
  expect(logo).not.toHaveClass("brand-logo--compact");
  expect(logo).not.toHaveClass("brand-logo--mark-only");
  expect(logo?.querySelector(".brand-logo__wordmark strong")).toHaveTextContent("Tree Chat");
  expect(logo?.querySelector(".brand-logo__wordmark small")).toHaveTextContent("智构树语");
  expect(brand?.querySelectorAll(":scope > span")).toHaveLength(1);
});
```

Add this source/CSS test to `LandingDesktop.test.ts`:

```ts
test("matches the approved raised and dimmed Page 1 hierarchy", () => {
  expect(css).toMatch(
    /\.landing-hero__content\s*\{[^}]*transform:\s*translateY\(-86px\);/,
  );
  expect(css).toMatch(
    /\.landing-hero::before\s*\{[^}]*linear-gradient\(180deg,[^)]*\.52[^)]*\.16[^)]*\.58[^)]*\)/,
  );
  expect(css).toMatch(
    /\.landing-hero::after\s*\{[^}]*radial-gradient\(ellipse at 50% 40%,[^)]*\.52[^)]*\.24[^)]*\.12[^)]*\.42[^)]*\)/,
  );
  expect(css).toMatch(/\.landing-hero-word\s*\{[^}]*opacity:\s*\.48;/);
  expect(css).toMatch(
    /\.landing-header__brand \.brand-logo__mark\s*\{[^}]*width:\s*48px;/,
  );
});
```

- [x] **Step 2: Run the focused tests and confirm RED**

Run:

```powershell
npm test -- src/components/landing/LandingPage.test.tsx src/components/landing/LandingDesktop.test.ts
```

Expected: FAIL because the header still renders the compact mark-only variant, the content remains at its old vertical position, and the scrims do not match the approved preview.

- [x] **Step 3: Restore the complete Logo without modifying the canonical mark asset**

Replace the two current brand children inside `.landing-header__brand` with:

```tsx
<BrandLogo className="landing-header__logo" tone="light" />
```

Remove `.landing-header__brand > span:last-child { display: none; }` and add:

```css
.landing-header__brand .brand-logo__mark {
  width: 48px;
}

.landing-header__brand .brand-logo__wordmark strong {
  font-size: 15px;
}

.landing-header__brand .brand-logo__wordmark small {
  font-size: 9px;
}
```

Do not edit `public/assets/brand/tree-chat-mark.png`, `BrandLogo.tsx`, or the attachment screenshot.

- [x] **Step 4: Apply the approved content offset and scrims**

Add the approved offset to `.landing-hero__content` while retaining the existing flex layout and text alignment:

```css
transform: translateY(-86px);
```

Replace the two Page 1 pseudo-element backgrounds with:

```css
.landing-hero::before {
  background: linear-gradient(
    180deg,
    rgba(7, 29, 20, .52) 0%,
    rgba(7, 29, 20, .16) 48%,
    rgba(4, 16, 11, .58) 100%
  );
  content: "";
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: 1;
}

.landing-hero::after {
  background: radial-gradient(
    ellipse at 50% 40%,
    rgba(4, 18, 12, .52) 0%,
    rgba(4, 18, 12, .24) 34%,
    rgba(4, 18, 12, .12) 60%,
    rgba(4, 18, 12, .42) 100%
  );
  content: "";
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: 1;
}
```

- [x] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
npm test -- src/components/landing/LandingPage.test.tsx src/components/landing/LandingDesktop.test.ts
```

Expected: both focused files pass, the Logo test finds one full `BrandLogo`, and the CSS contract records `translateY(-86px)` plus both approved masks.

- [x] **Step 6: Consolidate the hierarchy slice in the final local commit**

```text
Covered by consolidated local commit `fad1f03` after the complete verification gate.
```

### Task 3: Stage the foreground reveal and bypass it for reduced motion

**Files:**
- Modify: `src/components/landing/LandingPage.test.tsx:1-17,70-88`
- Modify: `src/components/landing/LandingPage.tsx:3,29-34,418-474`
- Modify: `app/globals.css:572-578,1731-1769`

- [x] **Step 1: Make the Anime.js mock expose stagger calls**

Change the test import and mock to:

```tsx
import { animate, stagger } from "animejs";

vi.mock("animejs", () => ({
  animate: vi.fn(() => ({ pause: vi.fn() })),
  stagger: vi.fn(() => () => 0),
}));
```

- [x] **Step 2: Add the RED two-second timeline test**

Add:

```tsx
test("finishes the Page 1 foreground reveal within two seconds", () => {
  vi.mocked(animate).mockClear();
  vi.mocked(stagger).mockClear();
  render(<LandingPage profile={PUBLIC_PROFILE} />);

  const calls = vi.mocked(animate).mock.calls;
  const chrome = calls.find(([target]) =>
    String(target).includes(".landing-header__brand"),
  );
  const words = calls.find(([target]) => target === ".landing-hero-word__reveal");
  const content = calls.find(([target]) =>
    String(target).includes(".landing-hero__eyebrow"),
  );

  expect(chrome?.[1]).toMatchObject({ opacity: [0, 1], translateY: [14, 0], duration: 600 });
  expect(words?.[1]).toMatchObject({ opacity: [0, 1], translateY: [10, 0], duration: 430 });
  expect(content?.[1]).toMatchObject({ opacity: [0, 1], translateY: [24, 0], duration: 820 });
  expect(stagger).toHaveBeenNthCalledWith(1, 80, { start: 0 });
  expect(stagger).toHaveBeenNthCalledWith(2, 20, { start: 250 });
  expect(stagger).toHaveBeenNthCalledWith(3, 150, { start: 650 });
  expect(250 + 20 * 11 + 430).toBe(900);
  expect(650 + 150 * 3 + 820).toBe(1920);
  expect(Math.max(900, 1920)).toBeLessThanOrEqual(2000);
  expect(calls.some(([target]) => String(target).includes("landing-hero__background"))).toBe(false);
});
```

- [x] **Step 3: Add the RED reduced-motion bypass test**

Add:

```tsx
test("shows Page 1 foreground immediately when reduced motion is requested", () => {
  vi.mocked(animate).mockClear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }));

  render(<LandingPage profile={PUBLIC_PROFILE} />);

  const heroRevealCalls = vi.mocked(animate).mock.calls.filter(([target]) =>
    /landing-header__brand|landing-hero-word__reveal|landing-hero__eyebrow/.test(
      String(target),
    ),
  );
  expect(heroRevealCalls).toHaveLength(0);
  [
    ".landing-header__brand",
    ".landing-progress",
    ".landing-header__cta-reveal",
    ".landing-hero-word__reveal",
    ".landing-hero__eyebrow",
    ".landing-hero__title",
    ".landing-hero__subtitle",
    ".landing-hero__actions",
  ].forEach((selector) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((target) => {
      expect(target.style.opacity).toBe("1");
      expect(target.style.transform).toBe("none");
    });
  });
});
```

- [x] **Step 4: Run the focused component test and verify RED**

Run:

```powershell
npm test -- src/components/landing/LandingPage.test.tsx
```

Expected: FAIL because the current effect does not animate the header, progress, or keywords; it uses numeric delays instead of three staged `stagger` calls and can briefly start during reduced motion.

- [x] **Step 5: Implement the three reveal groups**

Change the production import to:

```tsx
import { animate, stagger } from "animejs";
```

Replace the Page 1 reveal effect with:

```tsx
useEffect(() => {
  const revealSelectors = [
    ".landing-header__brand",
    ".landing-progress",
    ".landing-header__cta-reveal",
    ".landing-hero-word__reveal",
    ".landing-hero__eyebrow",
    ".landing-hero__title",
    ".landing-hero__subtitle",
    ".landing-hero__actions",
  ];
  const mediaRequestsReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion || mediaRequestsReducedMotion) {
    document
      .querySelectorAll<HTMLElement>(revealSelectors.join(","))
      .forEach((target) => {
        target.style.opacity = "1";
        target.style.transform = "none";
      });
    return;
  }

  const animations = [
    animate(
      ".landing-header__brand, .landing-progress, .landing-header__cta-reveal",
      {
        opacity: [0, 1],
        translateY: [14, 0],
        duration: 600,
        delay: stagger(80, { start: 0 }),
        ease: LANDING_MOTION.hero.ease,
      },
    ),
    animate(".landing-hero-word__reveal", {
      opacity: [0, 1],
      translateY: [10, 0],
       duration: 430,
       delay: stagger(20, { start: 250 }),
      ease: LANDING_MOTION.hero.ease,
    }),
    animate(
      ".landing-hero__eyebrow, .landing-hero__title, .landing-hero__subtitle, .landing-hero__actions",
      {
        opacity: [0, 1],
        translateY: [24, 0],
        duration: LANDING_MOTION.hero.duration,
        delay: stagger(150, { start: 650 }),
        ease: LANDING_MOTION.hero.ease,
      },
    ),
  ];

  return () => animations.forEach((animation) => animation.pause());
}, [reducedMotion]);
```

- [x] **Step 6: Extend the static and reduced-motion CSS reveal targets**

Replace the old base opacity selector list with:

```css
.landing-header__brand,
.landing-progress,
.landing-header__cta-reveal,
.landing-hero-word__reveal,
.landing-hero__eyebrow,
.landing-hero__title,
.landing-hero__subtitle,
.landing-hero__actions {
  opacity: 1;
}
```

Use the same selectors inside `@media (prefers-reduced-motion: reduce)` and keep:

```css
opacity: 1;
transform: none;
```

Do not put `.landing-hero__content` or `.landing-hero-word` in the reduced-motion transform reset. Their `-86px` composition offset and coordinate transforms must remain intact.

- [x] **Step 7: Run the focused tests and verify GREEN**

Run:

```powershell
npm test -- src/components/landing/LandingPage.test.tsx src/components/landing/LandingDesktop.test.ts
```

Expected: both files pass; the reveal test records a 1920ms latest completion and the reduced-motion test records zero Page 1 reveal animations.

- [x] **Step 8: Consolidate the reveal slice in the final local commit**

```text
Covered by consolidated local commit `fad1f03` after the complete verification gate.
```

### Task 4: Replace the old SVG browser audit with PNG, timing, Logo, and reduced-motion checks

**Files:**
- Create: `C:/Users/30120/.codex/visualizations/2026/08/10/019fea2b-e0d5-7792-9be6-2e4e5ec76578/landing-page1-background-qa.mjs`
- Read/Reuse: `C:/Users/30120/.codex/visualizations/2026/08/09/019fe41b-2fb7-7381-9e51-0c91c5cfec19/landing-content-logo-qa.mjs`

- [x] **Step 1: Copy the prior full landing audit as a new, dated QA script**

Run:

```powershell
Copy-Item -LiteralPath 'C:\Users\30120\.codex\visualizations\2026\08\09\019fe41b-2fb7-7381-9e51-0c91c5cfec19\landing-content-logo-qa.mjs' -Destination 'C:\Users\30120\.codex\visualizations\2026\08\10\019fea2b-e0d5-7792-9be6-2e4e5ec76578\landing-page1-background-qa.mjs'
```

- [x] **Step 2: Point the copied audit at the new output directory and approved coordinates**

Set:

```js
const outputDir = "C:/Users/30120/.codex/visualizations/2026/08/10/019fea2b-e0d5-7792-9be6-2e4e5ec76578";
const expectedLandingWords = {
  灵感: { x: "8.07%", y: "13.92%", anchor: "left" },
  问题: { x: "30.74%", y: "6.48%", anchor: "left" },
  假设: { x: "15.25%", y: "42.61%", anchor: "right" },
  为什么: { x: "7.12%", y: "77.79%", anchor: "left" },
  下一步: { x: "27.93%", y: "79.28%", anchor: "right" },
  回溯: { x: "35.41%", y: "53.77%", anchor: "left" },
  证据: { x: "62.98%", y: "20.72%", anchor: "right" },
  路径: { x: "73.03%", y: "38.26%", anchor: "right" },
  比较: { x: "86.48%", y: "9.03%", anchor: "left" },
  知识: { x: "93.72%", y: "51.43%", anchor: "right" },
  连接: { x: "87.68%", y: "72.79%", anchor: "left" },
  可能性: { x: "58.97%", y: "86.72%", anchor: "left" },
};
```

- [x] **Step 3: Replace the old SVG Page 1 evaluator with the PNG contract**

Use this evaluator after navigation and at the final reveal sample:

```js
const result = await evaluate(`(() => {
  const hero = document.querySelector('.landing-hero');
  const heroRect = hero?.getBoundingClientRect();
  const background = hero?.querySelector('.landing-hero__background');
  const content = hero?.querySelector('.landing-hero__content');
  const title = hero?.querySelector('#landing-title');
  const words = [...(hero?.querySelectorAll('.landing-hero-word') ?? [])].map((node) => {
    const rect = node.getBoundingClientRect();
    const reveal = node.querySelector('.landing-hero-word__reveal');
    return {
      text: node.dataset.landingWord,
      x: node.style.getPropertyValue('--x'),
      y: node.style.getPropertyValue('--y'),
      anchor: node.dataset.anchor,
      opacity: reveal ? Number(getComputedStyle(reveal).opacity) : null,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
    };
  });
  const actions = [...(hero?.querySelectorAll('.landing-hero__actions a') ?? [])];
  const logo = document.querySelector('.landing-header__brand .brand-logo');
  const matrix = content ? getComputedStyle(content).transform : 'none';
  return {
    background: background ? {
      complete: background.complete,
      naturalWidth: background.naturalWidth,
      naturalHeight: background.naturalHeight,
      opacity: Number(getComputedStyle(background).opacity),
      currentSrc: background.currentSrc,
    } : null,
    oldTreeCount: hero?.querySelectorAll('.landing-hero-tree').length ?? -1,
    words,
    contentTransform: matrix,
    titleOpacity: title ? Number(getComputedStyle(title).opacity) : null,
    actionOpacities: actions.map((node) => Number(getComputedStyle(node).opacity)),
    logo: logo ? {
      name: logo.querySelector('.brand-logo__wordmark strong')?.textContent?.trim(),
      tagline: logo.querySelector('.brand-logo__wordmark small')?.textContent?.trim(),
      markComplete: logo.querySelector('img')?.complete,
      markNaturalWidth: logo.querySelector('img')?.naturalWidth,
    } : null,
    heroRect: heroRect ? { left: heroRect.left, top: heroRect.top, right: heroRect.right, bottom: heroRect.bottom } : null,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`);
```

- [x] **Step 4: Replace the old SVG assertions and add reveal completion checks**

Use:

```js
const actualWords = Object.fromEntries(
  result.words.map((word) => [word.text, { x: word.x, y: word.y, anchor: word.anchor }]),
);
if (!result.background?.complete) audit.failures.push(`${viewport.label}: Page 1 background did not load`);
if (result.background?.naturalWidth !== 1672 || result.background?.naturalHeight !== 941) audit.failures.push(`${viewport.label}: Page 1 background dimensions mismatch`);
if (result.background?.opacity !== 1) audit.failures.push(`${viewport.label}: Page 1 background participates in the fade`);
if (result.oldTreeCount !== 0) audit.failures.push(`${viewport.label}: old Page 1 SVG still renders`);
if (JSON.stringify(actualWords) !== JSON.stringify(expectedLandingWords)) audit.failures.push(`${viewport.label}: Page 1 keyword coordinate mismatch`);
if (result.words.some((word) => word.opacity !== 1)) audit.failures.push(`${viewport.label}: keyword reveal did not finish by 2 seconds`);
if (result.titleOpacity !== 1 || result.actionOpacities.length !== 2 || result.actionOpacities.some((value) => value !== 1)) audit.failures.push(`${viewport.label}: central Page 1 UI did not finish revealing`);
if (!result.contentTransform.includes("-86")) audit.failures.push(`${viewport.label}: approved Page 1 upward offset missing`);
if (result.logo?.name !== "Tree Chat" || result.logo?.tagline !== "智构树语" || !result.logo.markComplete || result.logo.markNaturalWidth < 1) audit.failures.push(`${viewport.label}: complete header Logo missing`);
if (result.horizontalOverflow > 1) audit.failures.push(`${viewport.label}: horizontal overflow ${result.horizontalOverflow}px`);
```

Retain the existing Page 2–9 checks, WebGL checks, browser-error capture, Page 9 CTA reachability checks, and screenshots.

- [x] **Step 5: Add a reduced-motion navigation pass**

Before the final `/app` audit, add:

```js
await command("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await command("Emulation.setDeviceMetricsOverride", {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false,
});
await command("Page.navigate", { url: `${baseUrl}/` });
await wait(250);
const reducedMotion = await evaluate(`(() => {
  const selectors = [
    '.landing-header__brand',
    '.landing-progress',
    '.landing-header__cta-reveal',
    '.landing-hero-word__reveal',
    '.landing-hero__eyebrow',
    '.landing-hero__title',
    '.landing-hero__subtitle',
    '.landing-hero__actions',
  ];
  return selectors.flatMap((selector) =>
    [...document.querySelectorAll(selector)].map((node) => ({
      selector,
      opacity: Number(getComputedStyle(node).opacity),
      transform: getComputedStyle(node).transform,
    })),
  );
})()`);
if (reducedMotion.some((target) => target.opacity !== 1 || target.transform !== "none")) {
  audit.failures.push("reduced-motion: Page 1 foreground is not immediately visible");
}
await capture("1920x1080-page1-reduced-motion");
await command("Emulation.setEmulatedMedia", { features: [] });
```

- [x] **Step 6: Run the dual-viewport and reduced-motion audit**

Start the app and headless Chrome in hidden processes, then run the audit:

```powershell
Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','dev','--','--hostname','127.0.0.1','--port','3100') -WorkingDirectory 'D:\tree-chat' -WindowStyle Hidden
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList @('--headless=new','--remote-debugging-port=9224','--user-data-dir=C:\Users\30120\AppData\Local\Temp\tree-chat-page1-cdp','http://127.0.0.1:3100') -WindowStyle Hidden
node 'C:\Users\30120\.codex\visualizations\2026\08\10\019fea2b-e0d5-7792-9be6-2e4e5ec76578\landing-page1-background-qa.mjs'
```

Expected: the script exits `0`, the JSON report contains `"failures": []`, and the output directory contains Page 1 screenshots at 1920 × 1080, 1920 × 900, and reduced motion.

- [x] **Step 7: Inspect the three Page 1 screenshots against the approved browser companion**

Check these exact conditions:

- The title, subtitle, and two CTA buttons sit about 86px above the previous centered composition.
- The two masks lower the tree and keyword brightness without erasing the twelve glow points.
- The full mark, `Tree Chat`, and `智构树语` appear together in the header.
- No keyword overlaps the title, subtitle, CTA buttons, or header.
- The 1920 × 900 crop retains the title, both CTA buttons, and all in-frame keywords without horizontal overflow.

### Task 5: Run the complete verification gate and review the final diff

**Files:**
- Verify: `public/assets/landing/page1-tree-background.png`
- Verify: `src/components/landing/LandingPage.tsx`
- Verify: `src/components/landing/LandingPage.test.tsx`
- Verify: `src/components/landing/LandingDesktop.test.ts`
- Verify: `app/globals.css`

- [x] **Step 1: Run all automated project checks with fresh output**

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

Expected: every command exits `0`; Vitest reports no failed suites, ESLint reports no errors, TypeScript emits no diagnostics, and Next.js completes the production build.

- [x] **Step 2: Recheck asset integrity and repository scope**

```powershell
Get-FileHash public/assets/landing/page1-tree-background.png -Algorithm SHA256 | Format-List Path,Hash
git status --short --branch --untracked-files=all
git diff --check
git diff --stat fb7f066..HEAD
```

Expected: the PNG hash is `D949942FF9641D0868C5646C62C92E5CC339EC94953260EDE92A84C11085A761`; `git diff --check` prints nothing; the diff contains only the plan, Page 1 source/tests/CSS, and the PNG. The untracked handoff file remains untouched unless the user separately authorizes adding it.

- [x] **Step 3: Run a standards/spec review before reporting completion**

Review the implementation against:

```text
docs/superpowers/specs/2026-08-10-page1-background-image-and-fade-design.md
AGENTS.md
CLAUDE.md
```

Confirm that Page 2–9 code paths and styles did not change, the background is absent from Anime.js targets, the Logo asset hash did not change, and the reduced-motion CSS does not reset `.landing-hero__content` or `.landing-hero-word` transforms.

- [x] **Step 4: Record verification evidence and keep the branch unpushed**

This plan records the final state: Vitest 39 files/329 tests passed; lint, TypeScript, and production build exited 0; CDP reported `failures: []` and `browserErrors: []`; screenshots are in the dated visualization directory; the PNG and Logo hashes are unchanged; commit `fad1f03` was created locally; the older handoff file remains untracked. The branch was not pushed.
