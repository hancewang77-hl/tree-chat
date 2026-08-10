import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { animate } from "animejs";
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

  test("scatters the Page 1 background words across an explicit, stratified layout", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const fragments = [...document.querySelectorAll<HTMLElement>(".landing-hero-words > span")];
    expect(fragments).toHaveLength(12);
    expect(fragments.map((fragment) => ({
      left: fragment.style.left,
      top: fragment.style.top,
    }))).toEqual([
      { left: "8%", top: "18%" },
      { left: "33%", top: "11%" },
      { left: "58%", top: "25%" },
      { left: "86%", top: "15%" },
      { left: "16%", top: "45%" },
      { left: "43%", top: "52%" },
      { left: "69%", top: "40%" },
      { left: "92%", top: "55%" },
      { left: "7%", top: "76%" },
      { left: "29%", top: "67%" },
      { left: "57%", top: "82%" },
      { left: "82%", top: "72%" },
    ]);
  });

  test("exposes the Page 1 knowledge tree and anchors every background word to a branch target", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const tree = document.querySelector<HTMLElement>(".landing-hero-tree");
    expect(tree).toBeTruthy();
    expect(tree?.tagName.toLowerCase()).toBe("svg");
    expect(tree).toHaveAttribute("aria-hidden", "true");
    expect(tree?.querySelector(".landing-hero-tree__trunk")).toBeTruthy();
    expect(tree?.querySelectorAll(".landing-hero-tree__primary")).toHaveLength(3);

    const expectedTargets = [
      "灵感",
      "问题",
      "证据",
      "比较",
      "假设",
      "回溯",
      "路径",
      "知识",
      "为什么",
      "下一步",
      "可能性",
      "连接",
    ];
    const targets = [...(tree?.querySelectorAll<HTMLElement>("[data-tree-target]") ?? [])];
    const targetValues = targets.map((target) => target.dataset.treeTarget);

    expect(targets).toHaveLength(expectedTargets.length);
    expect(new Set(targetValues).size).toBe(expectedTargets.length);
    expect(new Set(targetValues)).toEqual(new Set(expectedTargets));
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
      ["tree-story-title", ["让复杂思考", "长成一棵树"]],
      ["footer-title", ["让每一次提问都有位置，", "让每一次探索都有路径"]],
    ] as const;

    expectedRenderedHeadings.forEach(([id, lines]) => {
      const heading = document.getElementById(id);
      expect(heading).toHaveAccessibleName(lines.join(""));
      expect(heading?.textContent).toBe(lines.join(""));
      expect([...heading!.querySelectorAll(":scope > .landing-title-line")].map((line) => line.textContent)).toEqual(lines);
    });

    const landingSource = readFileSync(resolve(process.cwd(), "src/components/landing/LandingPage.tsx"), "utf8");
    [
      'titleLines: ["让复杂思考", "长成一棵树"]',
      'titleLines: ["每一根枝条，", "都是可继续的思路"]',
      'titleLines: ["让规划成为主线，", "让历史保留年轮"]',
      'titleLines: ["让资料扎根，", "让成果被收获"]',
      'titleLines: ["从局部回答，", "回到全局知识地图"]',
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

  test("pairs the five tree scenes with the approved prospect narrative", () => {
    render(<LandingPage profile={PUBLIC_PROFILE} />);

    const landingSource = readFileSync(resolve(process.cwd(), "src/components/landing/LandingPage.tsx"), "utf8");
    const pageText = document.body.textContent ?? "";
    const treeStories = [
      [
        "让复杂思考长成一棵树",
        "把每轮提问与回答放进父子路径，把不同方案留在并列枝条。你可以沿一条路线深入，也能退回主干比较、整理，让复杂任务始终保有全貌。",
      ],
      [
        "每一根枝条，都是可继续的思路",
        "从当前节点展开新分支，用 Leaf 留下判断，用 Graft 调整归属，再以 Prune 清理失效路径。思路可以先发散，随后收束成可继续加工的结构。",
      ],
      [
        "让规划成为主线，让历史保留年轮",
        "Auxo 先把根任务拆成可审阅的任务树，Rings 记录移动、扩展和修剪的变化。规划沿主线推进，试错也有可撤销、可重做的回路。",
      ],
      [
        "让资料扎根，让成果被收获",
        "将课程讲义、论文摘要和项目材料纳入当前上下文，再把整理后的整棵树导出为 Markdown 或 JSON。资料有归属，成果也能带走。",
      ],
      [
        "从局部回答，回到全局知识地图",
        "分支、批注、资料、历史与导出在树冠视角重新汇合。你可以从单个节点回到全局结构，看清问题如何展开、判断如何形成、成果如何沉淀。",
      ],
    ] as const;

    treeStories.forEach(([title, body]) => {
      expect(landingSource).toContain(`title: "${title}"`);
      expect(landingSource).toContain(`body: "${body}"`);
    });
    expect(screen.getByRole("heading", { level: 2, name: treeStories[0][0] })).toBeInTheDocument();
    expect(screen.getByText(treeStories[0][1])).toBeInTheDocument();

    expect(screen.getByText("Prospect / 应用前景")).toBeInTheDocument();
    expect(screen.getByRole("heading", {
      level: 2,
      name: "让每一次提问都有位置，让每一次探索都有路径",
    })).toBeInTheDocument();
    ["深度学习", "研究与方案", "公共治理", "负责任智能"].forEach((title) => {
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", {
      level: 3,
      name: "SCENARIO PROOF / 场景验证",
    })).toBeInTheDocument();
    expect(screen.getByRole("heading", {
      level: 3,
      name: "SOCIAL RESPONSIBILITY / 社会责任",
    })).toBeInTheDocument();
    expect(pageText).toContain("暴雨内涝居民疏散与安置");
    expect(pageText).toContain("海姆立克急救法");
    expect(pageText).toContain(
      "项目承担的社会责任，是让 AI 增强人的判断力、知识组织能力和数字素养，并让有价值的探索沉淀为可复用成果。",
    );
    expect(pageText).not.toContain("开放与反思");
    expect(pageText).not.toContain("需要模型连接");
    expect(pageText).not.toContain("状态不跨设备");
    expect(document.querySelector(".landing-limitation-grid")).toBeNull();
  });
});
