import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { animate, stagger } from "animejs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LandingPage } from "./LandingPage";
import { resolveLandingPresentation } from "@/src/lib/siteProfile";

const PUBLIC_PROFILE = resolveLandingPresentation("tree-chat.example.workers.dev", {
  publicHost: "tree-chat.example.workers.dev",
  competitionHost: "treechat.tech",
});

vi.mock("animejs", () => ({
  animate: vi.fn(() => ({ pause: vi.fn() })),
  stagger: vi.fn(() => () => 0),
}));

vi.mock("./LandingVideoScrub", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./LandingVideoScrub")>();
  return {
    LandingVideoScrub: () => null,
    VIDEO_CHAPTER_TIMES: actual.VIDEO_CHAPTER_TIMES,
  };
});

describe("LandingPage seed transition", () => {
  let originalDescriptor: PropertyDescriptor | undefined;
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(animate).mockImplementation(
      () => ({ pause: vi.fn() }) as unknown as ReturnType<typeof animate>,
    );
    originalDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("waits for a readable mature-tree frame before scrolling to Page 3", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const seedButton = screen.getByRole("button", { name: "点击播下 Tree Chat 种子" });
    fireEvent.click(seedButton);

    expect(seedButton).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector(".landing-seed-stage")).toHaveClass("is-planted");
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1519));
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByRole("status", { name: "当前章节：困境与解法" })).toBeInTheDocument();
    expect(document.getElementById("dilemma")).toBeTruthy();
  });

  test("uses an immediate, non-animated scroll when reduced motion is requested", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "点击播下 Tree Chat 种子" }));

    act(() => vi.runOnlyPendingTimers());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  test("stages a mature tree silhouette in the planted seed sequence", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const matureTree = document.querySelector(".landing-seed-tree");
    expect(matureTree).toBeTruthy();
    expect(matureTree?.querySelector(".landing-seed-tree__trunk")).toBeTruthy();
    expect(matureTree?.querySelector(".landing-seed-tree__canopy")).toBeTruthy();
    expect(matureTree?.querySelector(".landing-seed-tree__root")).toBeTruthy();
  });

  test("renders exactly one decorative Page 1 background image and accessible keyword layer", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const backgrounds = document.querySelectorAll<HTMLImageElement>("img[data-page1-background]");
    expect(backgrounds).toHaveLength(1);
    const background = backgrounds[0];
    expect(background).toHaveAttribute("alt", "");
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(background).toHaveAttribute("sizes", "100vw");
    expect(decodeURIComponent(background.getAttribute("src") ?? "")).toContain(
      "url=/assets/landing/page1-tree-background.png",
    );
    expect(document.querySelector(".landing-hero-tree")).toBeNull();
    expect(document.querySelector(".landing-hero-words")).not.toHaveAttribute("aria-hidden");
  });

  test("maps every Page 1 keyword by name to its exact cover coordinate tuple", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const expected: Record<string, readonly [number, number, number, number, "left" | "right"]> = {
      灵感: [8.07, 13.92, 18, -22, "left"],
      问题: [30.74, 6.48, 16, 20, "left"],
      假设: [15.25, 42.61, -18, -24, "right"],
      为什么: [7.12, 77.79, 20, 20, "left"],
      下一步: [27.93, 79.28, -18, 24, "right"],
      回溯: [35.41, 53.77, 20, -20, "left"],
      证据: [62.98, 20.72, -18, -22, "right"],
      路径: [73.03, 38.26, -18, -22, "right"],
      比较: [86.48, 9.03, 18, 20, "left"],
      知识: [93.72, 51.43, -20, -22, "right"],
      连接: [87.68, 72.79, 18, 20, "left"],
      可能性: [58.97, 86.72, 18, -24, "left"],
    };
    const words = [...document.querySelectorAll<HTMLElement>(".landing-hero-word")];
    expect(words).toHaveLength(Object.keys(expected).length);
    expect(words.map((word) => word.dataset.landingWord)).toEqual(Object.keys(expected));

    const actual = Object.fromEntries(words.map((word) => {
      const name = word.dataset.landingWord ?? "";
      const value = (property: string, unit: string) =>
        Number.parseFloat(word.style.getPropertyValue(property).replace(unit, ""));
      return [name, [
        value("--x", "%"),
        value("--y", "%"),
        value("--dx", "px"),
        value("--dy", "px"),
        word.dataset.anchor,
      ]];
    }));
    expect(actual).toEqual(expected);
    expect(words.map((word) => word.querySelector(".landing-hero-word__reveal")?.textContent)).toEqual(
      Object.keys(expected),
    );
  });

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

  test("finishes the Page 1 foreground reveal within two seconds", () => {
    vi.mocked(animate).mockClear();
    vi.mocked(stagger).mockClear();
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const calls = vi.mocked(animate).mock.calls;
    const chrome = calls.find(([target]) => String(target).includes(".landing-header__brand"));
    const words = calls.find(([target]) => target === ".landing-hero-word__reveal");
    const content = calls.find(([target]) => String(target).includes(".landing-hero__eyebrow"));

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
      /landing-header__brand|landing-header__cta-reveal|landing-hero-word__reveal|landing-hero__eyebrow/.test(
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

  test("fades the seed above the growing tree and disables it after planting", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const seedButton = screen.getByRole("button", { name: "点击播下 Tree Chat 种子" });
    fireEvent.click(seedButton);

    const seedAnimation = vi.mocked(animate).mock.calls.find(([target]) => target === seedButton);
    expect(seedAnimation?.[1]).toMatchObject({ opacity: [1, 0] });
    expect(seedButton).toBeDisabled();
  });

  test("shows three concrete Page 3 LLM prompts and retains placeholder detail", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    [
      "大语言模型是什么？",
      "大语言模型有什么优点？",
      "大语言模型有什么缺点？",
    ].forEach((prompt) => {
      expect(screen.getByText(prompt)).toBeVisible();
    });

    const placeholder = document.querySelector(".landing-linear-placeholder");
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    expect(placeholder?.querySelectorAll("span")).toHaveLength(3);
  });

  test("renders the large Chinese headlines on deliberate semantic lines", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const expectedRenderedHeadings = [
      ["seed-title", ["每一次探索，", "都从一个问题开始。"]],
      ["dilemma-title", ["思考，", "不是一条线"]],
      ["tree-story-title", ["一棵树，", "承载一次完整的思考。"]],
      ["footer-title", ["我们仍在", "生长。"]],
    ] as const;

    expectedRenderedHeadings.forEach(([id, lines]) => {
      const heading = document.getElementById(id);
      expect(heading).toHaveAccessibleName(lines.join(""));
      expect(heading?.textContent).toBe(lines.join(""));
      expect([...heading!.querySelectorAll(":scope > .landing-title-line")].map((line) => line.textContent)).toEqual(lines);
    });

    const landingSource = readFileSync(resolve(process.cwd(), "src/components/landing/LandingPage.tsx"), "utf8");
    [
      'titleLines: ["一棵树，", "承载一次完整的思考。"]',
      'titleLines: ["让思考自由生长，", "也允许它重新长对方向。"]',
      'titleLines: ["复杂思考需要支撑，", "也需要留下年轮。"]',
      'titleLines: ["从资料中汲取养分，", "把思考沉淀成知识。"]',
      'titleLines: ["从一粒种子，", "到一整片知识树冠。"]',
    ].forEach((lineContract) => expect(landingSource).toContain(lineContract));
  });

  test("renders Page 3 as a three-level tree without rejoining branches", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const map = document.querySelector<SVGSVGElement>(".landing-branch-map");
    expect(map).toBeTruthy();
    if (!map) return;

    expect(map).toHaveAttribute("aria-label", "三层树状结构：一个问题、两个分支、四个回答节点");
    expect(map).toHaveAttribute("data-tree-structure", "three-level-acyclic");
    expect(map).toHaveAttribute("data-tree-direction", "root-to-leaf");

    const comparison = document.querySelector(".landing-linear-stack");
    expect(comparison).toHaveAttribute("data-tree-role", "comparison-only");
    expect(comparison).toHaveAttribute("role", "group");
    expect(comparison).toHaveAttribute(
      "aria-label",
      "线性对话示意：大语言模型是什么、有什么优点、有什么缺点",
    );
    expect(map.contains(comparison)).toBe(false);

    const expectedNodeIds = [
      "page3-root",
      "page3-branch-a",
      "page3-branch-b",
      "page3-leaf-a1",
      "page3-leaf-a2",
      "page3-leaf-b1",
      "page3-leaf-b2",
    ];
    const expectedEdgePairs = [
      ["page3-root", "page3-branch-a"],
      ["page3-root", "page3-branch-b"],
      ["page3-branch-a", "page3-leaf-a1"],
      ["page3-branch-a", "page3-leaf-a2"],
      ["page3-branch-b", "page3-leaf-b1"],
      ["page3-branch-b", "page3-leaf-b2"],
    ] as const;
    const expectedNodeIdSet = new Set(expectedNodeIds);
    const nodeElements = [...map.querySelectorAll<SVGGElement>("[data-tree-node]")];
    const nodeIds = nodeElements.map((node) => node.getAttribute("data-tree-node"));

    expect(nodeElements).toHaveLength(expectedNodeIds.length);
    expect(new Set(nodeIds).size).toBe(expectedNodeIds.length);
    expect(nodeIds.sort()).toEqual([...expectedNodeIds].sort());
    expect(map.querySelectorAll('[data-tree-level="root"]')).toHaveLength(1);
    expect(map.querySelectorAll('[data-tree-level="branch"]')).toHaveLength(2);
    expect(map.querySelectorAll('[data-tree-level="leaf"]')).toHaveLength(4);

    const edges = [...map.querySelectorAll<SVGPathElement>("[data-tree-edge]")];
    const actualEdgePairs = edges.map((edge) => [
      edge.getAttribute("data-parent"),
      edge.getAttribute("data-child"),
    ] as const);
    const edgeKey = ([parent, child]: readonly [string | null, string | null]) => `${parent}->${child}`;

    expect(edges).toHaveLength(expectedNodeIds.length - 1);
    expect(new Set(edges.map((edge) => edge.getAttribute("data-tree-edge"))).size).toBe(edges.length);
    expect(new Set(actualEdgePairs.map(edgeKey))).toEqual(new Set(expectedEdgePairs.map(edgeKey)));
    actualEdgePairs.forEach(([parent, child]) => {
      expect(parent).not.toBeNull();
      expect(child).not.toBeNull();
      expect(expectedNodeIdSet.has(parent as string)).toBe(true);
      expect(expectedNodeIdSet.has(child as string)).toBe(true);
    });

    const indegree = new Map(expectedNodeIds.map((id) => [id, 0]));
    const adjacency = new Map<string, string[]>(expectedNodeIds.map((id) => [id, []]));
    actualEdgePairs.forEach(([parent, child]) => {
      const parentId = parent as string;
      const childId = child as string;
      indegree.set(childId, (indegree.get(childId) ?? 0) + 1);
      adjacency.get(parentId)?.push(childId);
    });
    expect(indegree.get("page3-root")).toBe(0);
    expectedNodeIds.filter((id) => id !== "page3-root").forEach((id) => {
      expect(indegree.get(id)).toBe(1);
    });

    // Kahn's traversal proves both reachability from the one root and that no
    // directed cycle can hide behind a future edge-list edit.
    const remainingIndegree = new Map(indegree);
    const queue = expectedNodeIds.filter((id) => remainingIndegree.get(id) === 0);
    expect(queue).toEqual(["page3-root"]);
    let visitedCount = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      visitedCount += 1;
      adjacency.get(current)?.forEach((child) => {
        const nextIndegree = (remainingIndegree.get(child) ?? 0) - 1;
        remainingIndegree.set(child, nextIndegree);
        if (nextIndegree === 0) queue.push(child);
      });
    }
    expect(visitedCount).toBe(expectedNodeIds.length);
  });

  test("exposes one auditable snap marker for each of the nine pages", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const markers = [...document.querySelectorAll<HTMLElement>("[data-page]")];
    expect(markers.map((marker) => marker.dataset.page)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
    expect(markers.filter((marker) => marker.matches(".landing-section"))).toHaveLength(4);
    expect(markers.filter((marker) => marker.matches(".landing-tree-scroll-stop"))).toHaveLength(5);
  });

  test("caches tree stop geometry between scroll frames and refreshes it on resize", () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    let treeStopMeasurements = 0;
    let pendingFrame: FrameRequestCallback | undefined;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".landing-tree-scroll-stop")) {
        treeStopMeasurements += 1;
      }
      return originalGetBoundingClientRect.call(this);
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrame = callback;
      return 1;
    });

    const { unmount } = render(<LandingPage profile={PUBLIC_PROFILE} />);
    expect(treeStopMeasurements).toBe(5);

    fireEvent.scroll(window);
    act(() => pendingFrame?.(0));
    expect(treeStopMeasurements).toBe(5);

    fireEvent.resize(window);
    expect(treeStopMeasurements).toBe(10);

    unmount();
    fireEvent.resize(window);
    expect(treeStopMeasurements).toBe(10);
  });

  test("marks the tree overlay moving during scroll and settles after 220ms of rest", () => {
    const stopTops = [3240, 4320, 5400, 6480, 7560];
    const stopSpan = stopTops[1] - stopTops[0];
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    let scrollTop = 0;
    let pendingFrame: FrameRequestCallback | undefined;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollTop);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".landing-tree-scroll-stop")) {
        const index = Number(this.dataset.page) - 4;
        return { ...originalGetBoundingClientRect.call(this), top: stopTops[index] - scrollTop, bottom: stopTops[index] + stopSpan - scrollTop, height: stopSpan };
      }
      if (this.matches(".landing-tree-story")) {
        return { ...originalGetBoundingClientRect.call(this), top: 0, bottom: stopSpan * 5, height: stopSpan * 5 };
      }
      return originalGetBoundingClientRect.call(this);
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrame = callback;
      return 1;
    });

    render(<LandingPage profile={PUBLIC_PROFILE} />);
    const overlay = document.querySelector<HTMLElement>(".landing-tree-overlay");
    expect(overlay).toHaveAttribute("data-tree-motion", "settled");

    scrollTop = 4320;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(0));
    expect(overlay).toHaveAttribute("data-tree-motion", "moving");
    act(() => vi.advanceTimersByTime(219));
    expect(overlay).toHaveAttribute("data-tree-motion", "moving");
    act(() => vi.advanceTimersByTime(1));
    expect(overlay).toHaveAttribute("data-tree-motion", "settled");

    scrollTop = 5400;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(16));
    expect(overlay).toHaveAttribute("data-tree-motion", "moving");
    act(() => vi.advanceTimersByTime(219));
    scrollTop = 6480;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(32));
    act(() => vi.advanceTimersByTime(1));
    expect(overlay).toHaveAttribute("data-tree-motion", "moving");
    act(() => vi.advanceTimersByTime(219));
    expect(overlay).toHaveAttribute("data-tree-motion", "settled");
  });

  test("keeps the tree overlay settled when reduced motion is requested", () => {
    const stopTops = [3240, 4320, 5400, 6480, 7560];
    const stopSpan = stopTops[1] - stopTops[0];
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
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
    let scrollTop = 0;
    let pendingFrame: FrameRequestCallback | undefined;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollTop);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".landing-tree-scroll-stop")) {
        const index = Number(this.dataset.page) - 4;
        return { ...originalGetBoundingClientRect.call(this), top: stopTops[index] - scrollTop, bottom: stopTops[index] + stopSpan - scrollTop, height: stopSpan };
      }
      if (this.matches(".landing-tree-story")) {
        return { ...originalGetBoundingClientRect.call(this), top: 0, bottom: stopSpan * 5, height: stopSpan * 5 };
      }
      return originalGetBoundingClientRect.call(this);
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrame = callback;
      return 1;
    });

    render(<LandingPage profile={PUBLIC_PROFILE} />);
    const overlay = document.querySelector<HTMLElement>(".landing-tree-overlay");
    expect(overlay).toHaveAttribute("data-tree-motion", "settled");
    scrollTop = 4320;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(0));
    expect(overlay).toHaveAttribute("data-tree-motion", "settled");
    act(() => vi.advanceTimersByTime(500));
    expect(overlay).toHaveAttribute("data-tree-motion", "settled");
  });

  test("responds to reduced-motion preference changes during tree scrolling", () => {
    const stopTops = [3240, 4320, 5400, 6480, 7560];
    const stopSpan = stopTops[1] - stopTops[0];
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const motionListeners = new Set<EventListener>();
    let prefersReducedMotion = false;
    const motionQuery = {
      get matches() {
        return prefersReducedMotion;
      },
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === "change") motionListeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === "change") motionListeners.delete(listener);
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    };
    vi.stubGlobal("matchMedia", vi.fn(() => motionQuery));
    let scrollTop = 0;
    let pendingFrame: FrameRequestCallback | undefined;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollTop);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".landing-tree-scroll-stop")) {
        const index = Number(this.dataset.page) - 4;
        return { ...originalGetBoundingClientRect.call(this), top: stopTops[index] - scrollTop, bottom: stopTops[index] + stopSpan - scrollTop, height: stopSpan };
      }
      if (this.matches(".landing-tree-story")) {
        return { ...originalGetBoundingClientRect.call(this), top: 0, bottom: stopSpan * 5, height: stopSpan * 5 };
      }
      return originalGetBoundingClientRect.call(this);
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrame = callback;
      return 1;
    });

    render(<LandingPage profile={PUBLIC_PROFILE} />);
    const overlay = document.querySelector<HTMLElement>(".landing-tree-overlay");
    expect(overlay).toHaveAttribute("data-tree-motion", "settled");

    scrollTop = 4320;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(0));
    expect(overlay).toHaveAttribute("data-tree-motion", "moving");
    act(() => vi.advanceTimersByTime(100));

    act(() => {
      prefersReducedMotion = true;
      motionListeners.forEach((listener) => listener(new Event("change")));
    });
    expect(overlay).toHaveAttribute("data-tree-motion", "settled");

    act(() => {
      prefersReducedMotion = false;
      motionListeners.forEach((listener) => listener(new Event("change")));
    });
    scrollTop = 5400;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(16));
    expect(overlay).toHaveAttribute("data-tree-motion", "moving");

    act(() => vi.advanceTimersByTime(120));
    expect(overlay).toHaveAttribute("data-tree-motion", "moving");
    act(() => vi.advanceTimersByTime(99));
    expect(overlay).toHaveAttribute("data-tree-motion", "moving");
    act(() => vi.advanceTimersByTime(1));
    expect(overlay).toHaveAttribute("data-tree-motion", "settled");
  });

  test("marks both document roots while the landing narrative is mounted", () => {
    const { unmount } = render(<LandingPage profile={PUBLIC_PROFILE} />);

    expect(document.documentElement).toHaveClass("landing-scroll-root");
    expect(document.body).toHaveClass("landing-scroll-root");

    unmount();

    expect(document.documentElement).not.toHaveClass("landing-scroll-root");
    expect(document.body).not.toHaveClass("landing-scroll-root");
  });

  test.each([1080, 900])("releases scroll snap at the final tree stop in a %ipx viewport", (viewportHeight) => {
    const stopTops = [3240, 4320, 5400, 6480, 7560];
    const stopSpan = stopTops[1] - stopTops[0];
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    let scrollTop = 0;
    let pendingFrame: FrameRequestCallback | undefined;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollTop);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(viewportHeight);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".landing-tree-scroll-stop")) {
        const stopIndex = Number(this.dataset.page) - 4;
        return {
          ...originalGetBoundingClientRect.call(this),
          top: stopTops[stopIndex] - scrollTop,
          bottom: stopTops[stopIndex] + stopSpan - scrollTop,
          height: stopSpan,
        };
      }
      if (this.matches(".landing-footer-section")) {
        const footerAbsoluteTop = stopTops.at(-1)! + stopSpan;
        return {
          ...originalGetBoundingClientRect.call(this),
          top: footerAbsoluteTop - scrollTop,
          bottom: footerAbsoluteTop + stopSpan - scrollTop,
          height: stopSpan,
        };
      }
      return originalGetBoundingClientRect.call(this);
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrame = callback;
      return 1;
    });

    const { unmount } = render(<LandingPage profile={PUBLIC_PROFILE} />);
    expect(document.documentElement).not.toHaveClass("landing-scroll-tail-free");
    expect(document.body).not.toHaveClass("landing-scroll-tail-free");

    scrollTop = stopTops.at(-1)!;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(0));
    expect(document.documentElement).toHaveClass("landing-scroll-tail-free");
    expect(document.body).toHaveClass("landing-scroll-tail-free");

    scrollTop = stopTops.at(-1)! - 2;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(16));
    expect(document.documentElement).not.toHaveClass("landing-scroll-tail-free");
    expect(document.body).not.toHaveClass("landing-scroll-tail-free");

    scrollTop = stopTops.at(-1)!;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(32));
    expect(document.documentElement).toHaveClass("landing-scroll-tail-free");
    expect(document.body).toHaveClass("landing-scroll-tail-free");

    unmount();
    expect(document.documentElement).not.toHaveClass("landing-scroll-tail-free");
    expect(document.body).not.toHaveClass("landing-scroll-tail-free");
  });

  test("snaps a quarter-segment gesture with native smooth scrolling in the JS-owned zone", () => {
    const stopTops = [3240, 4320, 5400, 6480, 7560];
    const stopSpan = stopTops[1] - stopTops[0];
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    let scrollTop = 0;
    let pendingFrame: FrameRequestCallback | undefined;
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { configurable: true, writable: true, value: scrollTo });
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollTop);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".landing-tree-scroll-stop")) {
        const stopIndex = Number(this.dataset.page) - 4;
        return {
          ...originalGetBoundingClientRect.call(this),
          top: stopTops[stopIndex] - scrollTop,
          bottom: stopTops[stopIndex] + stopSpan - scrollTop,
          height: stopSpan,
        };
      }
      if (this.matches(".landing-tree-story")) {
        return {
          ...originalGetBoundingClientRect.call(this),
          top: 0,
          bottom: stopSpan * 5,
          height: stopSpan * 5,
        };
      }
      return originalGetBoundingClientRect.call(this);
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrame = callback;
      return 1;
    });

    render(<LandingPage profile={PUBLIC_PROFILE} />);

    // 进入树叙事区后原生 snap 关闭（JS 接管）。
    scrollTop = 4450;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(0));
    expect(document.documentElement).toHaveClass("landing-scroll-flipping");

    // 未滚过 1/4（130px < 270px）：弹回 4320（浏览器原生平滑滚动）。
    act(() => vi.advanceTimersByTime(200));
    expect(scrollTo).toHaveBeenCalledWith({ top: 4320, behavior: "smooth" });

    // 原生平滑滚动到达停靠点后结束吸附跟随。
    scrollTop = 4320;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(16));

    // 向下滚过 1/4（580px ≥ 270px）：翻到 5400。
    scrollTo.mockClear();
    scrollTop = 4900;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(32));
    act(() => vi.advanceTimersByTime(200));
    expect(scrollTo).toHaveBeenCalledWith({ top: 5400, behavior: "smooth" });
    scrollTop = 5400;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(48));

    // 微小偏移（≤60px）直接跳回，不做平滑动画。
    scrollTo.mockClear();
    scrollTop = 4340;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(64));
    act(() => vi.advanceTimersByTime(200));
    expect(scrollTo).toHaveBeenCalledWith(0, 4320);

    // 恰好停在关键帧上时不吸附。
    scrollTo.mockClear();
    scrollTop = 5400;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(80));
    act(() => vi.advanceTimersByTime(200));
    expect(scrollTo).not.toHaveBeenCalled();

    // 向上滚过 1/4：翻回 4320。
    scrollTo.mockClear();
    scrollTop = 5600;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(96));
    scrollTop = 5000;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(112));
    act(() => vi.advanceTimersByTime(200));
    expect(scrollTo).toHaveBeenCalledWith({ top: 4320, behavior: "smooth" });
    scrollTop = 4320;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(128));

    // Page 9 尾巴释放区：恢复原生 snap 行为，JS 不吸附。
    scrollTo.mockClear();
    scrollTop = 7600;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(144));
    expect(document.documentElement).not.toHaveClass("landing-scroll-flipping");
    act(() => vi.advanceTimersByTime(200));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("does not retain chapter animations after their effect cleanup", () => {
    const animations: Array<{ pause: ReturnType<typeof vi.fn> }> = [];
    vi.mocked(animate).mockImplementation(() => {
      const animation = { pause: vi.fn() };
      animations.push(animation);
      return animation as unknown as ReturnType<typeof animate>;
    });
    const { unmount } = render(<LandingPage profile={PUBLIC_PROFILE} />);

    fireEvent.click(screen.getByRole("button", { name: "点击播下 Tree Chat 种子" }));
    const cleanedAnimation = animations.find((animation) => animation.pause.mock.calls.length === 1);
    expect(cleanedAnimation).toBeDefined();

    unmount();

    expect(cleanedAnimation?.pause).toHaveBeenCalledTimes(1);
  });

  test("keeps identity-bearing links out of the competition build", () => {
    render(<LandingPage profile={resolveLandingPresentation("treechat.tech", {
      publicHost: "tree-chat.example.workers.dev",
      competitionHost: "treechat.tech",
    })} />);

    expect(document.querySelector("main")).toHaveAttribute("data-site-profile", "competition");
    expect(screen.queryByRole("link", { name: /GitHub/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /MIT License/i })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("hancewang77-hl");
  });

  test("renders the concise Page 9 prospect narrative and keyword line", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const page9 = document.querySelector<HTMLElement>('[data-page="9"]');
    expect(page9).not.toBeNull();
    const page9View = within(page9!);

    expect(page9View.getByRole("heading", { level: 2, name: "我们仍在生长。" })).toBeInTheDocument();
    expect(page9View.getByText("TreeChat 把 AI 回答、人的判断与资料上下文组织成可分支、可回看、可导出的知识树。让学习、研究、治理与责任 AI，都留下清晰的依据与路径。")).toHaveClass("landing-footer-reflection__lede");
    expect(page9View.getByText("TREE-AWARE CONTEXT · LOCAL-FIRST · MARKDOWN → OBSIDIAN GRAPH")).toHaveClass("landing-footer-reflection__keywords");
    expect(page9View.getAllByRole("article")).toHaveLength(6);

    const prospectGrid = page9!.querySelector<HTMLElement>(".landing-prospect-grid");
    const prospectNotes = page9!.querySelector<HTMLElement>(".landing-prospect-notes");
    expect(prospectGrid).not.toBeNull();
    expect(prospectNotes).not.toBeNull();

    const prospectArticles = within(prospectGrid!).getAllByRole("article");
    expect(prospectArticles).toHaveLength(4);
    [
      ["LEARNING PATH", "深度学习", "沿路径深入，也能回到上层补充分支。"],
      ["RESEARCH & PLANNING", "研究与方案", "并列比较路线，保留资料与决策依据。"],
      ["PUBLIC GOVERNANCE", "公共治理", "拆解复杂预案，复盘风险与执行细节。"],
      ["RESPONSIBLE AI", "负责任智能", "AI 生成，人在比较、取舍与校正。"],
    ].forEach(([label, title, copy], index) => {
      const article = within(prospectArticles[index]);
      expect(article.getByText(label)).toBeInTheDocument();
      expect(article.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
      expect(article.getByText(copy)).toBeInTheDocument();
    });

    const noteArticles = within(prospectNotes!).getAllByRole("article");
    expect(noteArticles).toHaveLength(2);
    [
      ["SCENARIO PROOF / 场景验证", "暴雨疏散、急救学习——同一棵树承载不同复杂度的任务。"],
      ["SOCIAL RESPONSIBILITY / 社会责任", "让 AI 增强判断、组织与复盘，而不是替人决定。"],
    ].forEach(([title, copy], index) => {
      const note = within(noteArticles[index]);
      expect(note.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
      expect(note.getByText(copy)).toBeInTheDocument();
    });
  });

  test("switches Page 4–8 copy in the real scroll-driven DOM", () => {
    const stopTops = [3240, 4320, 5400, 6480, 7560];
    const stopSpan = stopTops[1] - stopTops[0];
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    let scrollTop = 0;
    let pendingFrame: FrameRequestCallback | undefined;

    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollTop);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(1080);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".landing-tree-scroll-stop")) {
        const stopIndex = Number(this.dataset.page) - 4;
        return {
          ...originalGetBoundingClientRect.call(this),
          top: stopTops[stopIndex] - scrollTop,
          bottom: stopTops[stopIndex] + stopSpan - scrollTop,
          height: stopSpan,
        };
      }
      if (this.matches(".landing-tree-story")) {
        return {
          ...originalGetBoundingClientRect.call(this),
          top: 0,
          bottom: stopSpan * 5,
          height: stopSpan * 5,
        };
      }
      return originalGetBoundingClientRect.call(this);
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrame = callback;
      return 1;
    });

    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const chapters = [
      {
        title: "一棵树，承载一次完整的思考。",
        lines: ["一棵树，", "承载一次完整的思考。"],
        body: "每轮问答成为一个节点。沿父子路径深入，在并列枝条间比较，再回到主干整理，让复杂思考始终保有全貌。",
        facts: [["非线性结构", "从任意节点继续探索，关系可以重组、回溯。"], ["树感知上下文", "AI 沿有效路径理解，只带上相关语义、笔记与资料。"]],
      },
      {
        title: "让思考自由生长，也允许它重新长对方向。",
        lines: ["让思考自由生长，", "也允许它重新长对方向。"],
        body: "从任意节点继续追问，让不同假设并行生长；用 Leaf 留下判断，用 Graft 重新归位，再以 Prune 收束无效路径。",
        facts: [["Branch", "同一个问题，长出多条路。"], ["Graft", "保留内容，重组关系。"], ["Prune", "剪掉无效路径，让主干清晰。"], ["Leaf", "留下人的判断，默认不打扰 AI。"]],
      },
      {
        title: "复杂思考需要支撑，也需要留下年轮。",
        lines: ["复杂思考需要支撑，", "也需要留下年轮。"],
        body: "Auxo 把长任务拆成任务组与原子任务，先规划，再逐项推进。Rings 保留结构变化，让每次试错都能回看、撤销、重做。",
        facts: [["Auxo", "先规划，再逐节点推进。"], ["Rings", "撤销、重做，随时回到关键节点。"]],
      },
      {
        title: "从资料中汲取养分，把思考沉淀成知识。",
        lines: ["从资料中汲取养分，", "把思考沉淀成知识。"],
        body: "Nutrient 将本地文档转成可用片段，只把与当前问题相关的内容带入上下文。Harvest 导出 Markdown 或 JSON；配合 tree-obs，父子关系还能在 Obsidian 中继续生长。",
        facts: [["Nutrient", "只把相关片段带入上下文。"], ["Harvest → tree-obs", "导出整棵思考，在 Obsidian 重建双链树。"]],
      },
      {
        title: "从一粒种子，到一整片知识树冠。",
        lines: ["从一粒种子，", "到一整片知识树冠。"],
        body: "从 Seed 到 Harvest，发散、整理、回溯、引用与迁移，都在同一套结构里完成。回到树冠，一眼看见问题如何展开、判断如何形成、成果如何延续。",
        facts: [["Canopy", "一眼浏览完整树结构。"], ["Obsidian links", "导出后继续维护双链知识树。"]],
      },
    ] as const;

    chapters.forEach((chapter, index) => {
      scrollTop = stopTops[index];
      fireEvent.scroll(window);
      act(() => pendingFrame?.(index));

      const heading = screen.getByRole("heading", { level: 2, name: chapter.title });
      expect(heading).toHaveAttribute("id", "tree-story-title");
      expect([...heading.querySelectorAll<HTMLElement>(":scope > .landing-title-line")].map((line) => line.textContent)).toEqual(chapter.lines);
      expect(screen.getByText(chapter.body)).toBeInTheDocument();
      const facts = [...document.querySelectorAll<HTMLElement>(".landing-tree-facts .landing-feature-pill")].map((pill) => [
        pill.querySelector("strong")?.textContent,
        pill.querySelector("small")?.textContent,
      ]);
      expect(facts).toEqual(chapter.facts);

      const exitHint = document.querySelector<HTMLElement>(".landing-tree-exit-hint");
      if (index === chapters.length - 1) {
        expect(exitHint).not.toBeNull();
        expect(exitHint?.textContent).toContain("继续下滑");
        expect(exitHint?.textContent).toContain("应用前景");
      } else {
        expect(exitHint).toBeNull();
      }

      if (index === chapters.length - 1) {
        expect([...document.querySelectorAll<HTMLElement>(".landing-canopy-orbit > span")].map((keyword) => keyword.textContent)).toEqual([
          "SEED", "BRANCH", "LEAF", "GRAFT", "PRUNE", "AUXO", "RINGS", "NUTRIENT", "HARVEST", "TREE-OBS",
        ]);
      }
    });
  });
});
