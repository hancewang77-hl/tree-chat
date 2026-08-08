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

  test("applies the snap contract to either document root", () => {
    expect(landingPage).toContain('document.documentElement.classList.add("landing-scroll-root")');
    expect(landingPage).toContain('document.body.classList.add("landing-scroll-root")');
    expect(landingPage).toContain('document.documentElement.classList.remove("landing-scroll-root")');
    expect(landingPage).toContain('document.body.classList.remove("landing-scroll-root")');
    expect(landingPage).toContain('window.addEventListener("scrollend"');
    expect(landingPage).toContain("settleToNearestPage");
    expect(landingPage).toContain('window.setTimeout(settleToNearestPage, 180)');
    expect(landingPage).toContain("programmaticScrollRef.current = true");
    expect(landingPage).toContain("if (programmaticScrollRef.current) return;");
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

  test("uses elevated branch and root camera keys for the requested review angles", () => {
    expect(scene).toContain("position: [7.4, 11.8, 7.1]");
    expect(scene).toContain("target: [2.65, 4.65, 0.25]");
    expect(scene).toContain("position: [6.6, 10.8, 7.6]");
    expect(scene).toContain("target: [0, -0.45, 0]");
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
});
