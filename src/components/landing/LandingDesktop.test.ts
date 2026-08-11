import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const landingPage = readFileSync(resolve(process.cwd(), "src/components/landing/LandingPage.tsx"), "utf8");
const scene = readFileSync(resolve(process.cwd(), "src/components/landing/NarrativeTreeScene.tsx"), "utf8");

describe("1920 × 1080 landing composition contract", () => {
  test("does not ship terminal-specific landing layout branches", () => {
    expect(css).not.toMatch(/@media\s*\(max-width/);
    expect(css).not.toMatch(/@media\s*\(orientation/);
    expect(landingPage).not.toContain("max-width: 900px");
    expect(landingPage).not.toContain("mobileQuery");
    expect(scene).not.toContain("CANOPY_MOBILE");
    expect(scene).not.toContain("mobile: boolean");
  });

  test("uses the fixed desktop chapter canvas", () => {
    expect(css).toMatch(/\.landing-section\s*\{[\s\S]*height:\s*1080px/);
    expect(css).toMatch(/\.landing-tree-story\s*\{[\s\S]*height:\s*5400px/);
    expect(css).toContain("data-tree-composition");
  });

  test("uses mandatory snap stops for every fixed review page", () => {
    expect(css).toMatch(/html\.landing-scroll-root\s*\{[\s\S]*scroll-snap-type:\s*y mandatory;/);
    expect(css).toMatch(/body\.landing-scroll-root\s*\{[\s\S]*scroll-snap-type:\s*y mandatory;/);
    expect(css).toMatch(/\.landing-section\s*\{[\s\S]*scroll-snap-align:\s*start;[\s\S]*scroll-snap-stop:\s*always;/);
    expect(css).toMatch(/\.landing-tree-scroll-stop\s*\{[\s\S]*scroll-snap-align:\s*start;[\s\S]*scroll-snap-stop:\s*always;/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*scroll-snap-type:\s*y mandatory;/);
  });

  test("lets native CSS own snapping and releases the Page 9 tail", () => {
    expect(landingPage).toContain('document.documentElement.classList.add("landing-scroll-root")');
    expect(landingPage).toContain('document.body.classList.add("landing-scroll-root")');
    expect(landingPage).toContain('document.documentElement.classList.remove("landing-scroll-root")');
    expect(landingPage).toContain('document.body.classList.remove("landing-scroll-root")');
    expect(landingPage).not.toContain("settleToNearestPage");
    expect(landingPage).not.toContain("window.scrollTo({ top: targetTop");
    expect(landingPage).not.toContain("programmaticScrollRef");
    expect(landingPage).not.toContain("footerRef");
    expect(landingPage).toContain("const lastTreeStopTop = treeStopTopsRef.current.at(-1)");
    expect(landingPage).toContain('classList.toggle("landing-scroll-tail-free"');
    expect(landingPage).toContain('classList.remove("landing-scroll-tail-free")');

    expect(css).toMatch(/html\.landing-scroll-root\.landing-scroll-tail-free,\s*body\.landing-scroll-root\.landing-scroll-tail-free\s*\{[\s\S]*?scroll-snap-type:\s*none;/);
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

  test("keeps the establishing tree and Page 4 copy inside the review frame", () => {
    expect(scene).toContain("position: [0, 2.2, 16]");
    expect(css).toContain(".landing-tree-copy--chapter-4 .landing-tree-copy__intro");
    expect(css).toContain("width: 410px");
    expect(css).toContain("max-width: 380px");
  });

  test("uses model-offset-aware branch and root camera keys", () => {
    expect(scene).toContain("position: [3.28, 9.01, 7.99]");
    expect(scene).toContain("target: [-0.54, 3.4, 1.37]");
    expect(scene).toContain("position: [6.6, 4.4, 7.6]");
    expect(scene).toContain("target: [0, -1.7, 0]");
  });

  test("keeps Page 3 left-weighted and Page 7 right-quarter mask aligned", () => {
    expect(css).toContain("grid-template-columns: 1152px 480px");
    expect(css).toContain("inset: 0 0 0 75%");
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
    expect(css).toMatch(/\.landing-tree-copy--chapter-8 \.landing-tree-copy__intro\s*\{[^}]*width:\s*560px;/);
    expect(css).toMatch(/\.landing-tree-copy--chapter-8 \.landing-tree-copy__intro h2\s*\{[^}]*font-size:\s*58px;/);
    expect(css).toMatch(/\.landing-footer-reflection h2\s*\{[^}]*font-size:\s*52px;/);
  });

  test("keeps Page 6 and Page 8 fact cards inside shorter desktop viewports", () => {
    expect(css).toMatch(/\.landing-tree-copy--chapter-6 \.landing-tree-facts\s*\{[^}]*bottom:\s*max\(148px,\s*calc\(1104px - 100svh\)\);/);
    expect(css).toMatch(/\.landing-tree-copy--chapter-8 \.landing-tree-facts\s*\{[^}]*bottom:\s*max\(126px,\s*calc\(1104px - 100svh\)\);/);
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
