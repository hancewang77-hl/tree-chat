import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function cssBlock(source: string, selector: string) {
  const start = source.indexOf(`${selector} {`);
  expect(start, `${selector} should exist`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n}", start);
  expect(end, `${selector} should have a closing brace`).toBeGreaterThan(start);
  return source.slice(start, end + 2);
}

function relativeLuminance(hex: string) {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const light = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const dark = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (light + 0.05) / (dark + 0.05);
}

describe("workbench theme contract", () => {
  const globals = read("app/globals.css");
  const themeScope = ":where(.workbench-shell, .workbench-theme-scope)";

  it("shares the approved warm-paper palette with workbench portals", () => {
    const workbench = cssBlock(globals, themeScope);
    const landing = cssBlock(globals, ".landing-page");

    expect(workbench).toContain("--bg-cream: #fbf7ed;");
    expect(workbench).toContain("--bg-paper: #e9dfcf;");
    expect(workbench).toContain("--text-charcoal: #2c2416;");
    expect(workbench).toContain("--text-muted: #62584a;");
    expect(workbench).toContain("--accent-sage: #5e6942;");
    expect(workbench).toContain("--on-primary: #fbf7f0;");
    expect(workbench).toContain("--border-warm: #c7b89d;");
    expect(workbench).toContain("--control-border: #887961;");
    expect(workbench).toContain(
      "--workbench-control-fill: rgba(255, 253, 247, 0.72);",
    );
    expect(workbench).toContain("--workbench-canvas-background:");
    expect(workbench).toContain("--workbench-panel-glass:");

    expect(landing).toContain("--landing-forest-950: #081b14;");
    expect(landing).toContain("background: var(--landing-forest-950);");
    expect(landing).not.toContain("#fbf7ed");
  });

  it("keeps a scoped dark workbench palette for the theme toggle", () => {
    const darkWorkbench = cssBlock(
      globals,
      `[data-theme="dark"] ${themeScope}`,
    );

    expect(darkWorkbench).toContain("--bg-cream: #102f22;");
    expect(darkWorkbench).toContain("--bg-paper: #173d2a;");
    expect(darkWorkbench).toContain("--accent-olive-deep: #b5c6b1;");
    expect(darkWorkbench).toContain("--on-primary: #173d2a;");
    expect(darkWorkbench).toContain("--control-border: #75965e;");
    expect(darkWorkbench).toContain("--workbench-control-fill: #2f5438;");
    expect(darkWorkbench).toContain(
      "--workbench-raised: #234b36;",
    );
    expect(darkWorkbench).toContain("--workbench-canvas-background:");
    expect(darkWorkbench).toContain("--workbench-panel-glass:");
  });

  it("routes canvas and floating panels through workbench surface tokens", () => {
    expect(read("src/components/scene/TreeScene.tsx")).toContain(
      "var(--workbench-canvas-background)",
    );

    for (const file of [
      "src/components/toolbar/TreeToolbar.tsx",
      "src/components/toolbar/ZoomControls.tsx",
      "src/components/overlays/CanopyMinimap.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("var(--workbench-panel-glass)");
      expect(source).not.toContain("rgba(216, 204, 184");
    }

    expect(read("src/components/toolbar/TreeToolbar.tsx")).toContain(
      'border: "1px solid var(--border-warm)"',
    );
  });

  it("keeps control-border tokens out of workbench chip and icon fills", () => {
    const header = read("src/components/layout/AppHeader.tsx");
    const forest = read("src/components/layout/ForestSidebar.tsx");
    const inspector = read("src/components/layout/InspectorSidebar.tsx");
    const empty = read("src/components/overlays/EmptyState.tsx");

    expect(header).toContain(
      'style={{ background: "var(--workbench-raised)" }}',
    );
    expect(forest).toContain(
      'background: "var(--workbench-raised)", color: "var(--text-muted)"',
    );
    expect(inspector.match(/var\(--workbench-raised\)/g)).toHaveLength(4);
    expect(inspector).not.toContain("rgba(232, 223, 208, 0.34)");
    expect(inspector).not.toContain("rgba(232, 223, 208, 0.72)");
    expect(empty).toContain('background: "var(--accent-olive-soft)"');
    expect(empty).not.toContain('background: "var(--border-warm)"');
  });

  it("keeps project menus and workbench hovers readable in dark mode", () => {
    const forest = read("src/components/layout/ForestSidebar.tsx");
    const zoom = read("src/components/toolbar/ZoomControls.tsx");

    expect(forest.match(/isActive \? "var\(--on-primary\)"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(forest).toContain('background: "var(--workbench-raised)"');
    expect(forest).toContain('border: "1px solid var(--control-border)"');
    expect(forest).not.toContain("rgba(251, 247, 240, 0.78)");
    expect(forest).not.toContain("rgba(244, 235, 215, 0.76)");
    expect(forest).not.toContain("#EEE5D1");
    expect(zoom).not.toContain("hover:bg-white");

    for (const file of [
      "src/components/layout/BottomComposer.tsx",
      "src/components/layout/ForestSidebar.tsx",
      "src/components/layout/InspectorSidebar.tsx",
      "src/components/overlays/SearchPalette.tsx",
      "src/components/toolbar/ZoomControls.tsx",
    ]) {
      expect(read(file), `${file} should not use light-only hover fills`).not.toContain(
        "hover:bg-white",
      );
    }
  });

  it("routes primary foregrounds and key interactive borders through role tokens", () => {
    const header = read("src/components/layout/AppHeader.tsx");
    const composer = read("src/components/layout/BottomComposer.tsx");
    const toolbar = read("src/components/toolbar/TreeToolbar.tsx");

    expect(header).not.toContain("rgba(116, 122, 85");
    expect(header.match(/var\(--control-border\)/g)?.length).toBeGreaterThanOrEqual(7);

    expect(composer).toContain("var(--workbench-control-fill)");
    expect(composer.match(/var\(--control-border\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(composer).not.toContain('border: "1px solid rgba(116, 122, 85');

    expect(toolbar).toContain('background: btn.active ? "var(--accent-sage)" : "var(--workbench-control-fill)"');
    expect(toolbar).toContain('color: btn.active ? "var(--on-primary)" : "var(--accent-olive-deep)"');
    expect(toolbar).toContain('border: "1px solid var(--control-border)"');

    for (const file of [
      "src/components/LayerNameDialog.tsx",
      "src/components/layout/AppHeader.tsx",
      "src/components/layout/BottomComposer.tsx",
      "src/components/layout/ForestSidebar.tsx",
      "src/components/layout/InspectorSidebar.tsx",
      "src/components/overlays/AuxoDialog.tsx",
      "src/components/overlays/EmptyState.tsx",
      "src/components/overlays/HarvestDialog.tsx",
      "src/components/overlays/RingsPanel.tsx",
      "src/components/toolbar/TreeToolbar.tsx",
    ]) {
      expect(read(file), `${file} should use --on-primary`).not.toContain(
        "#FBF7F0",
      );
    }
  });

  it("maintains readable text and control contrast in both themes", () => {
    const base = "#fbf7ed";
    const panel = "#e9dfcf";
    const darkBase = "#102f22";
    const darkPanel = "#173d2a";

    expect(contrastRatio("#2c2416", base)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio("#62584a", base)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#62584a", panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#5e6942", base)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#805817", base)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#fbf7f0", "#5e6942")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#887961", base)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#887961", panel)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#173d2a", "#9fbd78")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#b5c6b1", darkPanel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#b5c6b1", "#2f5438")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#b5c6b1", "#234b36")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#edf3e7", "#234b36")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#75965e", darkBase)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#75965e", darkPanel)).toBeGreaterThanOrEqual(3);
  });
});
