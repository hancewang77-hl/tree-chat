import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { CAMERA_KEYS } from "./NarrativeTreeScene";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const landingPage = readFileSync(resolve(process.cwd(), "src/components/landing/LandingPage.tsx"), "utf8");
const scene = readFileSync(resolve(process.cwd(), "src/components/landing/NarrativeTreeScene.tsx"), "utf8");

function extractCssBlock(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`CSS marker not found: ${marker}`);
  }

  const openingBraceIndex = source.indexOf("{", markerIndex + marker.length);
  if (openingBraceIndex === -1) {
    throw new Error(`CSS block has no opening brace: ${marker}`);
  }

  let depth = 0;
  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openingBraceIndex + 1, index);
      }
    }
  }

  throw new Error(`CSS block is not closed: ${marker}`);
}

describe("1920 × 1080 landing composition contract", () => {
  test("does not ship terminal-specific landing layout branches", () => {
    expect(css).not.toMatch(/@media\s*\(max-width/);
    expect(css).not.toMatch(/@media\s*\(orientation/);
    expect(landingPage).not.toContain("max-width: 900px");
    expect(landingPage).not.toContain("mobileQuery");
    expect(scene).not.toContain("CANOPY_MOBILE");
    expect(scene).not.toContain("mobile: boolean");
  });

  test("keeps the desktop minimum with two-viewport stops and a one-viewport closing stop", () => {
    expect(css).toMatch(/\.landing-section\s*\{[\s\S]*height:\s*1080px/);
    expect(css).toMatch(/\.landing-tree-story\s*\{[^}]*height:\s*max\(9720px, 900svh\)/);
    expect(css).toMatch(/\.landing-tree-sticky\s*\{[^}]*height:\s*max\(1080px, 100svh\)/);
    expect(css).toMatch(/\.landing-tree-scroll-stop\s*\{[^}]*height:\s*max\(2160px, 200svh\)/);
    expect(css).toMatch(/\.landing-tree-scroll-stop:last-child\s*\{[^}]*height:\s*max\(1080px, 100svh\)/);
    expect(css).toContain("data-tree-composition");
  });

  test("uses mandatory snap stops for every fixed review page", () => {
    expect(css).toMatch(/html\.landing-scroll-root\s*\{[\s\S]*scroll-snap-type:\s*y mandatory;/);
    expect(css).toMatch(/body\.landing-scroll-root\s*\{[\s\S]*scroll-snap-type:\s*y mandatory;/);
    expect(css).toMatch(/\.landing-section\s*\{[\s\S]*scroll-snap-align:\s*start;[\s\S]*scroll-snap-stop:\s*always;/);
    expect(css).toMatch(/\.landing-tree-scroll-stop\s*\{[\s\S]*scroll-snap-align:\s*start;[\s\S]*scroll-snap-stop:\s*always;/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*scroll-snap-type:\s*y mandatory;/);
  });

  test("flips past a quarter segment like a page turn and releases the Page 9 tail", () => {
    expect(landingPage).toContain('document.documentElement.classList.add("landing-scroll-root")');
    expect(landingPage).toContain('document.body.classList.add("landing-scroll-root")');
    expect(landingPage).toContain('document.documentElement.classList.remove("landing-scroll-root")');
    expect(landingPage).toContain('document.body.classList.remove("landing-scroll-root")');
    expect(landingPage).toContain("TREE_FLIP_SETTLE_MS");
    expect(landingPage).toContain("TREE_FLIP_THRESHOLD");
    expect(landingPage).toContain("startTreeSnap");
    expect(landingPage).toContain("settleFlip");
    expect(landingPage).not.toContain("TREE_FLIP_DURATION_MS");
    expect(landingPage).not.toContain("TREE_SNAP_IDLE_MS");
    expect(landingPage).not.toContain("settleToNearestTreeStop");
    expect(landingPage).not.toContain("settleToNearestPage");
    expect(landingPage).not.toContain("window.scrollTo({ top: targetTop");
    expect(landingPage).not.toContain("programmaticScrollRef");
    expect(landingPage).not.toContain("footerRef");
    expect(landingPage).toContain("const lastTreeStopTop = treeStopTopsRef.current.at(-1)");
    expect(landingPage).toContain('classList.toggle("landing-scroll-tail-free"');
    expect(landingPage).toContain('classList.remove("landing-scroll-tail-free")');
    expect(landingPage).toContain('classList.toggle("landing-scroll-flipping"');
    expect(landingPage).toContain('classList.remove("landing-scroll-flipping")');

    expect(css).toMatch(/html\.landing-scroll-root\.landing-scroll-tail-free,\s*body\.landing-scroll-root\.landing-scroll-tail-free\s*\{[\s\S]*?scroll-snap-type:\s*none;/);
    expect(css).toMatch(/html\.landing-scroll-root\.landing-scroll-flipping,\s*body\.landing-scroll-root\.landing-scroll-flipping\s*\{[\s\S]*?scroll-snap-type:\s*none;/);
    expect(css).toMatch(/\.landing-footer-section\s*\{[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*100svh;[\s\S]*?overflow:\s*visible;[\s\S]*?scroll-snap-align:\s*none;[\s\S]*?scroll-snap-stop:\s*normal;/);
    expect(css).toMatch(/\.landing-footer-section\s*>\s*\.landing-container\s*\{[\s\S]*?min-height:\s*calc\(100svh - 200px\);/);
  });

  test("marks the nine landing pages and five sticky stops explicitly", () => {
    expect((landingPage.match(/data-page=/g) ?? [])).toHaveLength(5);
    ["1", "2", "3", "9"].forEach((page) => {
      expect(landingPage).toContain(`data-page="${page}"`);
    });
    expect(landingPage).toContain('data-page={String(index + 4)}');
  });

  test("keeps each model-offset-aware camera position paired with its target", () => {
    expect(CAMERA_KEYS).toEqual([
      { progress: 0, position: [0, 2.17, 18.88], target: [0, 2.35, 0] },
      { progress: 0.25, position: [3.97, 10.02, 9.18], target: [-0.54, 3.4, 1.37] },
      { progress: 0.5, position: [-9.05, 5.75, 8.97], target: [-0.85, 2.15, 0] },
      { progress: 0.75, position: [7.79, 5.5, 8.97], target: [0, -1.7, 0] },
      { progress: 1, position: [0, 20.4, 2.12], target: [0, 4.65, 0] },
    ]);
  });

  test("uses a clamped reading rail with chapter-side mapping", () => {
    const baseRailBlock = extractCssBlock(css, ".landing-tree-copy__rail");

    expect(baseRailBlock).toMatch(/top:\s*clamp\(96px, 10vh, 124px\);/);
    expect(baseRailBlock).toMatch(/width:\s*clamp\(640px, 38vw, 820px\);/);
    expect(baseRailBlock).toMatch(/z-index:\s*1;/);
    expect(css).toMatch(/(?:^|\})\s*\.landing-tree-copy--chapter-4 \.landing-tree-copy__rail,\s*\.landing-tree-copy--chapter-6 \.landing-tree-copy__rail,\s*\.landing-tree-copy--chapter-8 \.landing-tree-copy__rail\s*\{[^}]*left:\s*clamp\(96px, 8vw, 210px\);[^}]*\}/);
    expect(css).toMatch(/(?:^|\})\s*\.landing-tree-copy--chapter-5 \.landing-tree-copy__rail,\s*\.landing-tree-copy--chapter-7 \.landing-tree-copy__rail\s*\{[^}]*right:\s*clamp\(96px, 8vw, 210px\);[^}]*\}/);
  });

  test("balances only the Page 4, Page 6, and Page 7 editorial copy", () => {
    const genericIntroRule = css.match(/\.landing-tree-copy__intro > p:last-child\s*\{([^}]*)\}/)?.[1] ?? "";
    const genericFeatureRule = css.match(/\.landing-feature-pill small\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(genericIntroRule).not.toBe("");
    expect(genericFeatureRule).not.toBe("");
    expect(genericIntroRule).not.toContain("text-wrap");
    expect(genericFeatureRule).not.toContain("text-wrap");
    expect(css).toMatch(/\.landing-tree-copy--chapter-4 \.landing-tree-copy__intro > p:last-child,\s*\.landing-tree-copy--chapter-6 \.landing-tree-copy__intro > p:last-child,\s*\.landing-tree-copy--chapter-7 \.landing-tree-copy__intro > p:last-child,\s*\.landing-tree-copy--chapter-4 \.landing-feature-pill small,\s*\.landing-tree-copy--chapter-6 \.landing-feature-pill small,\s*\.landing-tree-copy--chapter-7 \.landing-feature-pill small\s*\{[^}]*text-wrap:\s*balance;/);
  });

  test("raises only the Page 8 orbit keyword labels with stronger contrast", () => {
    expect(css).not.toMatch(/\.landing-canopy-orbit > span\s*\{/);
    expect(css).toMatch(/\.landing-tree-canopy-orbit > span\s*\{[^}]*background:\s*rgba\(7, 23, 16, \.82\);[^}]*border:\s*1px solid rgba\(216, 232, 188, \.62\);[^}]*font-size:\s*15px;/);
  });

  test("sets every landing English text in Times New Roman first", () => {
    expect(css).toContain('--font-lora: "Times New Roman", Georgia, "Noto Serif SC", serif;');
    expect(css).toContain('--font-geist-mono: "Times New Roman", "SFMono-Regular", Consolas');
    expect(css).toContain('--font-geist-sans: "Times New Roman", Inter, ui-sans-serif');
  });

  test("uses taller-viewport-only spacing without changing the 1440 by 900 rail", () => {
    const tallerViewportBlock = extractCssBlock(css, "@media (min-height: 1100px)");
    const baseRailBlock = extractCssBlock(css, ".landing-tree-copy__rail");

    expect(tallerViewportBlock).toMatch(/\.landing-tree-copy__rail\s*\{[^}]*top:\s*clamp\(148px, 12\.5vh, 180px\);[^}]*\}/);
    expect(tallerViewportBlock).toMatch(/\.landing-footer-reflection\s*\{[^}]*transform:\s*translateY\(clamp\(48px, 7vh, 96px\)\);[^}]*\}/);
    expect(baseRailBlock).toMatch(/top:\s*clamp\(96px, 10vh, 124px\);/);
  });

  test("uses the editorial typography and static fact rhythm", () => {
    expect(css).toMatch(/\.landing-tree-copy__kicker\s*\{[^}]*font-size:\s*13px;/);
    expect(css).toMatch(/\.landing-tree-copy h2\s*\{[^}]*font-size:\s*clamp\(66px, 3\.05vw, 80px\);[^}]*max-width:\s*none;/);
    expect(css).toMatch(/\.landing-tree-copy__intro > p:last-child\s*\{[^}]*font-size:\s*18px;[^}]*line-height:\s*1\.72;[^}]*max-width:\s*42em;/);
    expect(css).toMatch(/\.landing-tree-facts\s*\{[^}]*margin-top:\s*clamp\(56px, 6vh, 72px\);[^}]*position:\s*static;/);
    expect(css).toMatch(/\.landing-tree-facts\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.landing-tree-copy--chapter-5 \.landing-tree-facts,\s*\.landing-tree-copy--chapter-7 \.landing-tree-facts\s*\{[^}]*margin-left:\s*auto;/);
    expect(css).not.toMatch(/\.landing-tree-facts\s*\{[^}]*repeat\(2/);
    expect(css).toMatch(/\.landing-feature-pill strong\s*\{[^}]*font-size:\s*17px;/);
    expect(css).toMatch(/\.landing-feature-pill small\s*\{[^}]*font-size:\s*15px;[^}]*line-height:\s*1\.6;/);
    expect(css).not.toMatch(/\.landing-tree-facts\s*\{[^}]*!important/);
  });

  test("switches mask and copy opacity between moving and settled tree motion", () => {
    expect(css).toContain('.landing-tree-overlay[data-tree-motion="settled"]');
    expect(css).toContain('.landing-tree-overlay[data-tree-motion="moving"]');
    expect(css).toMatch(/data-tree-motion="settled"[\s\S]*?\.landing-tree-copy::before[\s\S]*?opacity:\s*\.78;/);
    expect(css).toMatch(/data-tree-motion="moving"[\s\S]*?\.landing-tree-copy::before[\s\S]*?opacity:\s*0;/);
    expect(css).toMatch(/data-tree-motion="settled"[^}]*\.landing-tree-copy\s*\{[^}]*opacity:\s*1;[^}]*transition:\s*opacity 450ms ease;/);
    expect(css).toMatch(/data-tree-motion="moving"[^}]*\.landing-tree-copy\s*\{[^}]*opacity:\s*\.6;[^}]*transition:\s*opacity 180ms ease;/);
    expect(css).not.toContain("fade-out");
    expect(css).not.toMatch(/data-tree-motion="moving"[^\{]*\.landing-tree-copy::before\s*\{[^}]*animation:/);
  });

  test("disables tree copy and mask animation under reduced motion", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.landing-tree-copy,\s*\.landing-tree-copy::before\s*\{[^}]*transition:\s*none !important;[^}]*animation:\s*none !important;/);
  });

  test("keeps navigation chrome singular and Page 3 diagrammatic", () => {
    expect(landingPage).not.toContain("SCROLL TO GROW");
    expect(landingPage).not.toContain("landing-chat-bubble");
    expect(landingPage).toContain("landing-linear-thread");
    expect(css).not.toContain(".landing-tree-progress");
  });

  test("keeps the planted seed visible above the tree until its fade completes", () => {
    expect(css).toMatch(/\.landing-seed-button\s*\{[^}]*z-index:\s*4;/);
    expect(css).toMatch(/\.landing-seed-stage\.is-planted \.landing-seed-button\s*\{[^}]*pointer-events:\s*none;/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.landing-seed-stage\.is-planted \.landing-seed-button\s*\{[^}]*opacity:\s*0;/);
  });

  test("uses deterministic fragment positions and block-level editorial title lines", () => {
    expect(landingPage).not.toContain("Math.random");
    expect(landingPage).not.toContain("8 + ((index * 19) % 84)");
    expect(landingPage).not.toContain("14 + ((index * 29) % 64)");
    expect(css).toMatch(/\.landing-title-line\s*\{[^}]*display:\s*block;/);
    expect(css).toMatch(/\.landing-tree-copy \.landing-title-line\s*\{[^}]*white-space:\s*nowrap;/);
  });

  test("uses the approved Page 1 PNG through one fixed-ratio Next Image layer", () => {
    const heroRule = css.match(/\.landing-hero\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const artRule = css.match(/\.landing-hero-art\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const imageRule = css.match(/\.landing-hero__background\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(landingPage).toContain(
      'const PAGE1_BACKGROUND_SRC = "/assets/landing/page1-tree-background.png";',
    );
    expect(landingPage).toContain('import Image from "next/image";');
    expect(landingPage).toContain("preload");
    expect(landingPage).not.toContain("LANDING_TREE_ENDPOINTS");
    expect(landingPage).not.toContain("LandingHeroTree");
    expect(heroRule).toMatch(/background:\s*var\(--landing-forest-950\);/);
    expect(artRule).toMatch(/aspect-ratio:\s*1672\s*\/\s*941;/);
    expect(artRule).toMatch(/pointer-events:\s*none;/);
    expect(artRule).toMatch(/z-index:\s*0;/);
    expect(imageRule).toMatch(/object-fit:\s*cover;/);
    expect(imageRule).toMatch(/opacity:\s*1;/);
    expect(imageRule).toMatch(/pointer-events:\s*none;/);
    expect(imageRule).toMatch(/z-index:\s*0;/);
    expect(css).not.toContain("landing-hero-tree");
  });

  test("raises the Page 1 content and dims the artwork behind it", () => {
    expect(css).toMatch(/\.landing-hero__content\s*\{[\s\S]*?padding-bottom:\s*86px;/);
    expect(css).toMatch(/\.landing-hero__content\s*\{[\s\S]*?transform:\s*translateY\(-86px\);/);
    expect(css).toMatch(/\.landing-hero__content\s*\{[\s\S]*?z-index:\s*4;/);
    expect(css).toMatch(/linear-gradient\(\s*180deg,\s*rgba\(7, 29, 20, \.52\)/);
    expect(css).toMatch(/radial-gradient\(\s*ellipse at 50% 40%,\s*rgba\(4, 18, 12, \.52\)/);
    expect(css).toMatch(/\.landing-hero-word\s*\{[\s\S]*?opacity:\s*\.48;/);
    expect(css).toMatch(/\.landing-header__brand \.brand-logo__mark\s*\{[^}]*width:\s*48px;/);
    expect(css).toMatch(/\.landing-header__brand \.brand-logo__wordmark strong\s*\{[^}]*font-size:\s*15px;/);
    expect(css).toMatch(/\.landing-header__brand \.brand-logo__wordmark small\s*\{[^}]*font-size:\s*9px;/);
  });

  test("updates continuous camera progress without scroll-frame React state", () => {
    expect(landingPage).toContain("progressRef={treeProgressRef}");
    expect(landingPage).not.toContain("setTreeProgress");
    expect(scene).toContain("progressRef?.current ?? progress");
  });

  test("presents the four branch actions explicitly", () => {
    expect(landingPage).toContain('{ label: "Branch"');
    expect(landingPage).toContain('{ label: "Graft"');
    expect(landingPage).toContain('{ label: "Prune"');
    expect(landingPage).toContain('{ label: "Leaf"');
  });

  test("keeps the Page 8 and Page 9 editorial titles on their two intended lines", () => {
    expect(css).toMatch(/\.landing-tree-overlay\[data-tree-composition="chapter-8"\] \.landing-tree-canopy-orbit\s*\{[^}]*left:\s*calc\(66% \+ 16px\);/);
    expect(css).toMatch(/\.landing-tree-overlay\[data-tree-composition="chapter-8"\] \.landing-tree-canopy-orbit\s*\{[^}]*transform:\s*translate\(calc\(-50% - 46%\),\s*calc\(-50% - 6%\)\);/);
    expect(css).not.toContain(".landing-tree-copy--chapter-8 .landing-tree-canopy-orbit");
    expect(css).toMatch(/\.landing-footer-reflection h2\s*\{[^}]*font-size:\s*clamp\(60px, 2\.8vw, 72px\);/);
    expect(css).toMatch(/\.landing-footer-reflection__keywords\s*\{[^}]*font-size:\s*11px;/);
    expect(css).toMatch(/\.landing-footer-reflection__lede\s*\{[^}]*font-size:\s*17px;[^}]*line-height:\s*1\.72;/);
    expect(css).toMatch(/\.landing-prospect-grid article p\s*\{[^}]*font-size:\s*15px;[^}]*line-height:\s*1\.65;/);
    expect(css).toMatch(/\.landing-prospect-notes article p\s*\{[^}]*font-size:\s*14px;[^}]*line-height:\s*1\.7;[^}]*text-wrap:\s*balance;/);

    const reflectionLedeRule = css.match(/\.landing-footer-reflection__lede\s*\{([^}]*)\}/)?.[1] ?? "";
    const prospectGridRule = css.match(/\.landing-prospect-grid article p\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(reflectionLedeRule).not.toContain("text-wrap");
    expect(prospectGridRule).not.toContain("text-wrap");
  });

  test("keeps the compact header on one CSS-owned, contrast-safe transition", () => {
    expect(css).not.toMatch(/\.landing-header\s*\{[\s\S]*?transition:[^;]*height/);
    expect(landingPage).not.toContain("animate(header");
    expect(landingPage).not.toContain("headerRef");
    expect(css).toContain(".brand-logo--light .brand-logo__mark");
    expect(css).toContain(".landing-header.is-scrolled .brand-logo--light .brand-logo__mark");
  });

  test("keeps public identity constants out of the shared client module", () => {
    expect(landingPage).not.toContain("hancewang77-hl");
    expect(landingPage).not.toContain("Open Source");
    expect(landingPage).not.toContain("GitHub");
    expect(landingPage).not.toContain("MIT License");
  });
});
