import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LandingPage } from "./LandingPage";

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

  test("automatically scrolls to Page 3 after the seed-to-sprout sequence", () => {
    render(<LandingPage />);

    const seedButton = screen.getByRole("button", { name: "点击播下 Tree Chat 种子" });
    fireEvent.click(seedButton);

    expect(seedButton).toHaveAttribute("aria-pressed", "true");
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1319));
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

    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: "点击播下 Tree Chat 种子" }));

    act(() => vi.runOnlyPendingTimers());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  test("stages a mature tree silhouette in the planted seed sequence", () => {
    render(<LandingPage />);

    const matureTree = document.querySelector(".landing-seed-tree");
    expect(matureTree).toBeTruthy();
    expect(matureTree?.querySelector(".landing-seed-tree__trunk")).toBeTruthy();
    expect(matureTree?.querySelector(".landing-seed-tree__canopy")).toBeTruthy();
    expect(matureTree?.querySelector(".landing-seed-tree__root")).toBeTruthy();
  });

  test("renders Page 3 as a three-level tree without rejoining branches", () => {
    render(<LandingPage />);

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
    render(<LandingPage />);

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

  test("marks both document roots while the landing narrative is mounted", () => {
    const { unmount } = render(<LandingPage />);

    expect(document.documentElement).toHaveClass("landing-scroll-root");
    expect(document.body).toHaveClass("landing-scroll-root");

    unmount();

    expect(document.documentElement).not.toHaveClass("landing-scroll-root");
    expect(document.body).not.toHaveClass("landing-scroll-root");
  });
});
