import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { animate } from "animejs";
import { LandingPage } from "./LandingPage";
import { resolveLandingPresentation } from "@/src/lib/siteProfile";

const PUBLIC_PROFILE = resolveLandingPresentation("tree-chat.example.workers.dev", {
  publicHost: "tree-chat.example.workers.dev",
  competitionHost: "treechat.tech",
});

vi.mock("animejs", () => ({
  animate: vi.fn(() => ({ pause: vi.fn() })),
  stagger: vi.fn(() => 0),
}));

vi.mock("./NarrativeTreeScene", () => ({
  NarrativeTreeScene: () => null,
}));

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
    expect(comparison).toHaveAttribute("aria-label", "线性对话弊端的独立对照示意，不属于左侧树结构");
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

  test("marks both document roots while the landing narrative is mounted", () => {
    const { unmount } = render(<LandingPage profile={PUBLIC_PROFILE} />);

    expect(document.documentElement).toHaveClass("landing-scroll-root");
    expect(document.body).toHaveClass("landing-scroll-root");

    unmount();

    expect(document.documentElement).not.toHaveClass("landing-scroll-root");
    expect(document.body).not.toHaveClass("landing-scroll-root");
  });

  test("releases scroll snap when Page 9 enters the viewport and restores it above the tail", () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    let footerTop = window.innerHeight;
    let pendingFrame: FrameRequestCallback | undefined;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches('.landing-footer-section')) {
        return {
          ...originalGetBoundingClientRect.call(this),
          top: footerTop,
          bottom: footerTop + 1080,
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

    footerTop = window.innerHeight * 0.8;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(0));
    expect(document.documentElement).toHaveClass("landing-scroll-tail-free");
    expect(document.body).toHaveClass("landing-scroll-tail-free");

    footerTop = window.innerHeight * 0.9;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(16));
    expect(document.documentElement).not.toHaveClass("landing-scroll-tail-free");
    expect(document.body).not.toHaveClass("landing-scroll-tail-free");

    footerTop = 0;
    fireEvent.scroll(window);
    act(() => pendingFrame?.(32));
    expect(document.documentElement).toHaveClass("landing-scroll-tail-free");
    expect(document.body).toHaveClass("landing-scroll-tail-free");

    unmount();
    expect(document.documentElement).not.toHaveClass("landing-scroll-tail-free");
    expect(document.body).not.toHaveClass("landing-scroll-tail-free");
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
});
