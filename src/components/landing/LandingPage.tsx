"use client";

import Image from "next/image";
import { animate, stagger } from "animejs";
import {
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  Download,
  GitBranch,
  GitFork,
  History,
  Network,
  Scissors,
  Trees,
  Upload,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/src/components/brand/BrandLogo";
import type { LandingPresentation } from "@/src/lib/siteProfile";
import { resolveTreeScrollState } from "./landingScroll";
import {
  LandingVideoScrub,
  VIDEO_CHAPTER_TIMES,
  type TreeFlipControl,
} from "./LandingVideoScrub";

type RevealAnimation = { pause: () => void };

const LANDING_MOTION = {
  hero: { duration: 820, ease: "out(4)" },
  seed: { duration: 760, ease: "in(3)" },
  sprout: { duration: 900, ease: "out(4)" },
  chapter: { duration: 460, ease: "out(3)" },
} as const;
const TREE_MOTION_SETTLE_DELAY = 220;

// Page 4–8 翻页式吸附：树叙事区内由 JS 全权接管吸附（区内关闭原生 snap，
// 避免浏览器中点规则与 1/4 阈值互相拉扯导致卡顿）。手势结束后按滚动
// 方向 + 阈值判定——向相邻停靠点滚过 TREE_FLIP_THRESHOLD（1/4）的距离
// 就翻到那一帧，不足则弹回当前帧。翻页交给浏览器原生平滑滚动（与
// page 1–3 的跳转手感一致），视频在吸附期间由滚动事件直接驱动、跟随
// 浏览器缓动曲线变速播放，落点精确停在五个关键帧上。
const TREE_FLIP_SETTLE_MS = 150;
const TREE_FLIP_INSTANT_PX = 60;
const TREE_FLIP_THRESHOLD = 0.25;

const SEED_MATURE_TREE_DELAY = 480;
const SEED_MATURE_TREE_DURATION = 760;
const SEED_MATURE_TREE_DWELL = 280;

// Let the resolved tree remain fully readable before leaving the chapter. The
// timer stays independent from anime.js so reduced-motion/static environments
// retain deterministic navigation.
const SEED_AUTO_SCROLL_DELAY =
  SEED_MATURE_TREE_DELAY + SEED_MATURE_TREE_DURATION + SEED_MATURE_TREE_DWELL;

const CHAPTERS = [
  "总览",
  "播种",
  "困境与解法",
  "树状结构",
  "树枝功能",
  "树干功能",
  "树根功能",
  "树冠回顾",
  "应用前景",
];

const TREE_STORIES: Array<{
  chapter: string;
  kicker: string;
  title: string;
  titleLines: readonly [string, string];
  body: string;
  accent: string;
  facts: Array<{ label: string; text: string; icon: LucideIcon }>;
}> = [
  {
    chapter: "主干",
    kicker: "One workspace, many directions",
    title: "一棵树，承载一次完整的思考。",
    titleLines: ["一棵树，", "承载一次完整的思考。"],
    body: "每轮问答成为一个节点。沿父子路径深入，在并列枝条间比较，再回到主干整理，让复杂思考始终保有全貌。",
    accent: "var(--landing-moss-light)",
    facts: [
      { label: "非线性结构", text: "从任意节点继续探索，关系可以重组、回溯。", icon: Network },
      { label: "树感知上下文", text: "AI 沿有效路径理解，只带上相关语义、笔记与资料。", icon: Trees },
    ],
  },
  {
    chapter: "枝条",
    kicker: "Branch · Graft · Prune · Leaf",
    title: "让思考自由生长，也允许它重新长对方向。",
    titleLines: ["让思考自由生长，", "也允许它重新长对方向。"],
    body: "从任意节点继续追问，让不同假设并行生长；用 Leaf 留下判断，用 Graft 重新归位，再以 Prune 收束无效路径。",
    accent: "var(--landing-moss-light)",
    facts: [
      { label: "Branch", text: "同一个问题，长出多条路。", icon: GitBranch },
      { label: "Graft", text: "保留内容，重组关系。", icon: GitFork },
      { label: "Prune", text: "剪掉无效路径，让主干清晰。", icon: Scissors },
      { label: "Leaf", text: "留下人的判断，默认不打扰 AI。", icon: BookOpen },
    ],
  },
  {
    chapter: "树干",
    kicker: "Auxo · Rings",
    title: "复杂思考需要支撑，也需要留下年轮。",
    titleLines: ["复杂思考需要支撑，", "也需要留下年轮。"],
    body: "Auxo 把长任务拆成任务组与原子任务，先规划，再逐项推进。Rings 保留结构变化，让每次试错都能回看、撤销、重做。",
    accent: "var(--landing-moss-light)",
    facts: [
      { label: "Auxo", text: "先规划，再逐节点推进。", icon: BrainCircuit },
      { label: "Rings", text: "撤销、重做，随时回到关键节点。", icon: History },
    ],
  },
  {
    chapter: "树根",
    kicker: "Nutrient · Harvest",
    title: "从资料中汲取养分，把思考沉淀成知识。",
    titleLines: ["从资料中汲取养分，", "把思考沉淀成知识。"],
    body: "Nutrient 将本地文档转成可用片段，只把与当前问题相关的内容带入上下文。Harvest 导出 Markdown 或 JSON；配合 tree-obs，父子关系还能在 Obsidian 中继续生长。",
    accent: "var(--landing-moss-light)",
    facts: [
      { label: "Nutrient", text: "只把相关片段带入上下文。", icon: Upload },
      { label: "Harvest → tree-obs", text: "导出整棵思考，在 Obsidian 重建双链树。", icon: Download },
    ],
  },
  {
    chapter: "树冠",
    kicker: "A canopy of connected ideas",
    title: "从一粒种子，到一整片知识树冠。",
    titleLines: ["从一粒种子，", "到一整片知识树冠。"],
    body: "从 Seed 到 Harvest，发散、整理、回溯、引用与迁移，都在同一套结构里完成。回到树冠，一眼看见问题如何展开、判断如何形成、成果如何延续。",
    accent: "var(--landing-moss-light)",
    facts: [
      { label: "Canopy", text: "一眼浏览完整树结构。", icon: Waves },
      { label: "Obsidian links", text: "导出后继续维护双链知识树。", icon: GitFork },
    ],
  },
];

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

// Page 3 is intentionally an arborescence, not a conversation graph with
// re-joins: one question root, two branch choices, and four terminal answers.
// Keep every edge directed from an earlier level to the next one; a leaf must
// never point back to the root or share a terminal node with another branch.
const TREE_MAP_NODES = [
  { id: "page3-root", level: "root", x: 74, y: 190, r: 18, fill: "#d6bd86", label: "Q" },
  { id: "page3-branch-a", level: "branch", x: 286, y: 100, r: 14, fill: "#88a86b", label: "B1" },
  { id: "page3-branch-b", level: "branch", x: 286, y: 280, r: 14, fill: "#88a86b", label: "B2" },
  { id: "page3-leaf-a1", level: "leaf", x: 488, y: 55, r: 12, fill: "#b8d6a0", label: "A1" },
  { id: "page3-leaf-a2", level: "leaf", x: 488, y: 145, r: 12, fill: "#b8d6a0", label: "A2" },
  { id: "page3-leaf-b1", level: "leaf", x: 488, y: 235, r: 12, fill: "#b8d6a0", label: "A3" },
  { id: "page3-leaf-b2", level: "leaf", x: 488, y: 325, r: 12, fill: "#b8d6a0", label: "A4" },
] as const;

const TREE_MAP_EDGES = [
  { id: "root-branch-a", parent: "page3-root", child: "page3-branch-a", d: "M92 190C160 190 190 100 272 100" },
  { id: "root-branch-b", parent: "page3-root", child: "page3-branch-b", d: "M92 190C160 190 190 280 272 280" },
  { id: "branch-a-leaf-1", parent: "page3-branch-a", child: "page3-leaf-a1", d: "M300 100C350 100 386 55 476 55" },
  { id: "branch-a-leaf-2", parent: "page3-branch-a", child: "page3-leaf-a2", d: "M300 100C350 100 386 145 476 145" },
  { id: "branch-b-leaf-1", parent: "page3-branch-b", child: "page3-leaf-b1", d: "M300 280C350 280 386 235 476 235" },
  { id: "branch-b-leaf-2", parent: "page3-branch-b", child: "page3-leaf-b2", d: "M300 280C350 280 386 325 476 325" },
] as const;

function FeaturePill({ icon: Icon, label, text }: { icon: LucideIcon; label: string; text: string }) {
  return (
    <div className="landing-feature-pill">
      <span className="landing-feature-pill__icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span><strong>{label}</strong><small>{text}</small></span>
    </div>
  );
}

function EditorialTitle({ id, title, lines }: { id: string; title: string; lines: readonly string[] }) {
  return (
    <h2 id={id} aria-label={title}>
      {lines.map((line) => <span key={line} className="landing-title-line" aria-hidden="true">{line}</span>)}
    </h2>
  );
}

export function LandingPage({ profile }: { profile: LandingPresentation }) {
  const [activeChapter, setActiveChapter] = useState(0);
  const [treeChapter, setTreeChapter] = useState(0);
  const [seedPlanted, setSeedPlanted] = useState(false);
  const [seedInView, setSeedInView] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [treeMotionState, setTreeMotionState] = useState<"moving" | "settled">("settled");
  const activeChapterRef = useRef(0);
  const treeChapterRef = useRef(0);
  const treeProgressRef = useRef(0);
  const previousTreeProgressRef = useRef<number | null>(null);
  const treeMotionTimerRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(reducedMotion);
  const requestTreeRenderRef = useRef<(() => void) | null>(null);
  const treeFlipRef = useRef<TreeFlipControl | null>(null);
  const treeStopTopsRef = useRef<number[]>([]);
  const scrolledRef = useRef(false);
  const treeStoryRef = useRef<HTMLElement | null>(null);
  const dilemmaRef = useRef<HTMLElement | null>(null);
  const seedStageRef = useRef<HTMLDivElement | null>(null);
  const treeCopyRef = useRef<HTMLDivElement | null>(null);
  const seedRef = useRef<HTMLButtonElement | null>(null);
  const sproutRef = useRef<SVGSVGElement | null>(null);
  const matureTreeRef = useRef<SVGSVGElement | null>(null);
  const seedHintRef = useRef<HTMLParagraphElement | null>(null);
  const seedAnimations = useRef<RevealAnimation[]>([]);

  const story = TREE_STORIES[treeChapter];

  useEffect(() => {
    // The scrolling element is normally <html>, but embedded shells and
    // WebKit-based browsers can delegate document scrolling to <body>. Keep
    // the same snap contract on both roots so every review frame (including
    // the five sticky tree stops) settles on its measured frame boundary.
    document.documentElement.classList.add("landing-scroll-root");
    document.body.classList.add("landing-scroll-root");
    return () => {
      document.documentElement.classList.remove("landing-scroll-root");
      document.body.classList.remove("landing-scroll-root");
    };
  }, []);

  useEffect(() => {
    const stage = seedStageRef.current;
    if (!stage || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setSeedInView(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const nextReducedMotion = motionQuery.matches;
      reducedMotionRef.current = nextReducedMotion;
      if (nextReducedMotion) {
        if (treeMotionTimerRef.current !== null) {
          window.clearTimeout(treeMotionTimerRef.current);
          treeMotionTimerRef.current = null;
        }
        setTreeMotionState("settled");
      }
      setReducedMotion(nextReducedMotion);
    };
    sync();
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener("change", sync);
    } else {
      motionQuery.addListener?.(sync);
    }
    return () => {
      if (motionQuery.removeEventListener) {
        motionQuery.removeEventListener("change", sync);
      } else {
        motionQuery.removeListener?.(sync);
      }
    };
  }, []);

  useEffect(() => {
    const animations = seedAnimations.current;
    return () => {
      const trackedAnimations = animations.splice(0);
      trackedAnimations.forEach((animation) => animation.pause());
    };
  }, []);

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
      animate(".landing-header__brand, .landing-progress, .landing-header__cta-reveal", {
        opacity: [0, 1],
        translateY: [14, 0],
        duration: 600,
        delay: stagger(80, { start: 0 }),
        ease: LANDING_MOTION.hero.ease,
      }),
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

  useEffect(() => {
    const copy = treeCopyRef.current;
    if (!copy || reducedMotion) return;
    // Keep the chapter mask on the stable wrapper. Moving that wrapper by even
    // a fraction of a pixel creates a visible seam against the WebGL canvas.
    const targets = copy.querySelectorAll<HTMLElement>(".landing-tree-copy__intro, .landing-tree-facts");
    const animation = animate(targets, {
      opacity: [0.12, 1],
      translateY: [16, 0],
      duration: LANDING_MOTION.chapter.duration,
      ease: LANDING_MOTION.chapter.ease,
    });
    return () => {
      animation.pause();
    };
  }, [reducedMotion, treeChapter]);

  useEffect(() => {
    const hint = seedHintRef.current;
    if (!hint || reducedMotion) return;
    const animation = animate(hint, {
      opacity: [0.2, 1],
      translateY: [8, 0],
      duration: LANDING_MOTION.chapter.duration,
      ease: LANDING_MOTION.chapter.ease,
    });
    return () => {
      animation.pause();
    };
  }, [reducedMotion, seedPlanted]);

  useEffect(() => {
    let disposed = false;
    const refreshTreeStopTops = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      treeStopTopsRef.current = Array.from(
        document.querySelectorAll<HTMLElement>(".landing-tree-scroll-stop"),
        (stop) => stop.getBoundingClientRect().top + scrollTop,
      );
    };

    refreshTreeStopTops();
    window.addEventListener("resize", refreshTreeStopTops);
    void document.fonts?.ready.then(() => {
      if (!disposed) refreshTreeStopTops();
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", refreshTreeStopTops);
    };
  }, []);

  useEffect(() => {
    if (!seedPlanted) return;

    const scrollTimer = window.setTimeout(() => {
      const dilemma = dilemmaRef.current;
      if (!dilemma) return;

      // Keep the fixed chapter indicator in sync with the explicit landing
      // transition before the scroll observer's next frame recalculates it.
      activeChapterRef.current = 2;
      setActiveChapter(2);
      dilemma.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }, reducedMotion ? 0 : SEED_AUTO_SCROLL_DELAY);

    return () => {
      window.clearTimeout(scrollTimer);
    };
  }, [reducedMotion, seedPlanted]);

  useEffect(() => {
    let frame = 0;
    let treeSnapTimer: number | null = null;
    let snapTargetTop: number | null = null;
    let scrollDirection = 0;
    let previousScrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
    const update = () => {
      frame = 0;
      const commitActiveChapter = (next: number) => {
        if (activeChapterRef.current === next) return;
        activeChapterRef.current = next;
        setActiveChapter(next);
      };
      const commitTreeChapter = (next: number) => {
        if (treeChapterRef.current === next) return;
        treeChapterRef.current = next;
        setTreeChapter(next);
      };
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      if (scrollTop !== previousScrollTop) {
        scrollDirection = scrollTop > previousScrollTop ? 1 : -1;
        previousScrollTop = scrollTop;
      }
      const snapStops = treeStopTopsRef.current;
      if (snapStops.length >= 2) {
        // 树叙事区内（两个边界停靠点之间）关闭原生 snap，由 JS 接管吸附；
        // 边界停靠点与 page 1–3 / 页脚保持原生 snap 行为。
        const inFlipZone = scrollTop > snapStops[0] && scrollTop < snapStops[snapStops.length - 1];
        document.documentElement.classList.toggle("landing-scroll-flipping", inFlipZone);
        document.body.classList.toggle("landing-scroll-flipping", inFlipZone);
        // 原生平滑滚动到达目标停靠点后结束吸附跟随。
        if (snapTargetTop !== null && Math.abs(scrollTop - snapTargetTop) <= 4) {
          snapTargetTop = null;
          treeFlipRef.current?.end();
        }
      }
      const lastTreeStopTop = treeStopTopsRef.current.at(-1);
      const releaseTail = lastTreeStopTop !== undefined && scrollTop + 1 >= lastTreeStopTop;
      document.documentElement.classList.toggle("landing-scroll-tail-free", releaseTail);
      document.body.classList.toggle("landing-scroll-tail-free", releaseTail);
      const nextScrolled = scrollTop > 28;
      if (scrolledRef.current !== nextScrolled) {
        scrolledRef.current = nextScrolled;
        setScrolled(nextScrolled);
      }
      const treeScrollState = resolveTreeScrollState(scrollTop, treeStopTopsRef.current);
      treeProgressRef.current = treeScrollState.progress;
      requestTreeRenderRef.current?.();
      const previousProgress = previousTreeProgressRef.current;
      const progressChanged = previousProgress !== null && Math.abs(treeScrollState.progress - previousProgress) > 1e-4;
      previousTreeProgressRef.current = treeScrollState.progress;
      if (progressChanged && !reducedMotionRef.current) {
        setTreeMotionState("moving");
        if (treeMotionTimerRef.current !== null) window.clearTimeout(treeMotionTimerRef.current);
        treeMotionTimerRef.current = window.setTimeout(() => {
          treeMotionTimerRef.current = null;
          setTreeMotionState("settled");
        }, TREE_MOTION_SETTLE_DELAY);
      }
      const storyRect = treeStoryRef.current?.getBoundingClientRect();
      if (storyRect && storyRect.top <= window.innerHeight * 0.78) {
        // Switch copy and masks only when the camera reaches the next measured
        // story stop. Midpoint rounding changed overlays while the camera was
        // still between two compositions, which produced visible seams.
        const nextTreeChapter = treeScrollState.chapter;
        if (storyRect.bottom <= window.innerHeight * 0.72) {
          commitActiveChapter(CHAPTERS.length - 1);
        } else {
          commitActiveChapter(3 + nextTreeChapter);
        }
        commitTreeChapter(nextTreeChapter);
      } else {
        const earlySections = Array.from(document.querySelectorAll<HTMLElement>(".landing-hero, #seed, .landing-dilemma"));
        const viewportMarker = window.innerHeight * 0.42;
        const currentIndex = earlySections.findIndex((section) => {
          const rect = section.getBoundingClientRect();
          return rect.top <= viewportMarker && rect.bottom > viewportMarker;
        });
        if (currentIndex >= 0) {
          commitActiveChapter(currentIndex);
          return;
        }
        const closest = earlySections.reduce<{ index: number; distance: number } | null>((best, section, index) => {
          const rect = section.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - viewportMarker);
          return !best || distance < best.distance ? { index, distance } : best;
        }, null);
        const nextIndex = closest?.index ?? 0;
        commitActiveChapter(nextIndex);
      }
    };
    const currentScrollTop = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;

    // 原生平滑吸附：滚动动画交给浏览器合成器（与 page 1–3 的跳转同源），
    // 视频在吸附期间由滚动事件直接驱动（跳过阻尼），跟随浏览器缓动曲线
    // 播放过渡，落点精确停在参考帧上。
    const startTreeSnap = (targetStopTop: number, targetVideoTime: number) => {
      if (reducedMotionRef.current) {
        window.scrollTo(0, targetStopTop);
        treeFlipRef.current?.apply(targetVideoTime);
        return;
      }
      const distance = targetStopTop - currentScrollTop();
      if (Math.abs(distance) < 1) {
        treeFlipRef.current?.apply(targetVideoTime);
        return;
      }
      if (Math.abs(distance) <= TREE_FLIP_INSTANT_PX) {
        window.scrollTo(0, targetStopTop);
        treeFlipRef.current?.apply(targetVideoTime);
        return;
      }
      snapTargetTop = targetStopTop;
      treeFlipRef.current?.begin();
      window.scrollTo({ top: targetStopTop, behavior: "smooth" });
    };

    // 手势结束后的翻页判定：向滚动方向越过相邻停靠点 1/4 的距离即翻页，
    // 不足则弹回当前帧。Page 9 尾巴释放区保持自由滚动，交还给原生衔接。
    const settleFlip = () => {
      const scrollTop = currentScrollTop();
      const stops = treeStopTopsRef.current;
      if (stops.length < 2) return;
      const firstStopTop = stops[0];
      const lastStopTop = stops[stops.length - 1];
      if (scrollTop <= firstStopTop || scrollTop >= lastStopTop) return;
      const segmentSpan = stops[1] - stops[0];
      // 定位当前所在的停靠段：scrollTop ∈ [stops[lowerIndex], stops[lowerIndex+1])
      let lowerIndex = 0;
      for (let index = 1; index < stops.length - 1; index += 1) {
        if (scrollTop >= stops[index]) lowerIndex = index;
      }
      const offset = scrollTop - stops[lowerIndex];
      if (offset <= 4) return; // 已停在关键帧上
      const threshold = segmentSpan * TREE_FLIP_THRESHOLD;
      let targetIndex: number;
      if (scrollDirection > 0) {
        targetIndex = offset >= threshold ? lowerIndex + 1 : lowerIndex;
      } else if (scrollDirection < 0) {
        targetIndex = offset <= segmentSpan - threshold ? lowerIndex : lowerIndex + 1;
      } else {
        targetIndex = offset < segmentSpan / 2 ? lowerIndex : lowerIndex + 1;
      }
      startTreeSnap(stops[targetIndex], VIDEO_CHAPTER_TIMES[targetIndex]);
    };
    const onScroll = (event: Event) => {
      if (!frame) frame = window.requestAnimationFrame(update);
      if (snapTargetTop !== null && event.isTrusted) {
        // 吸附动画期间用户主动滚动：取消本次吸附跟随，交还用户控制。
        snapTargetTop = null;
        treeFlipRef.current?.end();
      }
      if (treeSnapTimer !== null) window.clearTimeout(treeSnapTimer);
      treeSnapTimer = window.setTimeout(settleFlip, TREE_FLIP_SETTLE_MS);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    // The document is the scrolling element in some embedded browser shells;
    // listen there as well so the fixed chapter indicator cannot become stale.
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true });
      if (frame) window.cancelAnimationFrame(frame);
      if (treeSnapTimer !== null) window.clearTimeout(treeSnapTimer);
      if (treeMotionTimerRef.current !== null) {
        window.clearTimeout(treeMotionTimerRef.current);
        treeMotionTimerRef.current = null;
      }
      document.documentElement.classList.remove("landing-scroll-tail-free");
      document.body.classList.remove("landing-scroll-tail-free");
      document.documentElement.classList.remove("landing-scroll-flipping");
      document.body.classList.remove("landing-scroll-flipping");
    };
  }, []);

  function plantSeed() {
    if (seedPlanted) return;
    setSeedPlanted(true);
    if (reducedMotion || !seedRef.current) return;
    const animation = animate(seedRef.current, {
      translateY: [0, 92],
      scale: [1, 0.58],
      rotate: [0, 18],
      opacity: [1, 0],
      duration: LANDING_MOTION.seed.duration,
      ease: LANDING_MOTION.seed.ease,
    });
    seedAnimations.current.push(animation);

    if (sproutRef.current) {
      const sproutAnimation = animate(sproutRef.current, {
        opacity: [0, 1],
        translateY: [34, 0],
        scaleY: [0.18, 1],
        duration: LANDING_MOTION.sprout.duration,
        delay: 420,
        ease: LANDING_MOTION.sprout.ease,
      });
      seedAnimations.current.push(sproutAnimation);
    }

    if (matureTreeRef.current) {
      const matureTreeAnimation = animate(matureTreeRef.current, {
        opacity: [0, 1],
        translateY: [26, 0],
        scale: [0.72, 1],
        duration: SEED_MATURE_TREE_DURATION,
        delay: SEED_MATURE_TREE_DELAY,
        ease: "out(4)",
      });
      seedAnimations.current.push(matureTreeAnimation);
    }
  }

  return (
    <main className="landing-page" data-site-profile={profile.id}>
      <a className="landing-skip-link" href="#seed">跳到产品叙事</a>
      <header className={`landing-header ${scrolled ? "is-scrolled" : ""}`}>
        <nav className="landing-header__nav" aria-label="产品介绍导航">
          <a href="#top" className="landing-header__brand" aria-label="回到 Tree Chat 介绍页开头">
            <BrandLogo className="landing-header__logo" tone="light" />
          </a>
          <div className="landing-progress" role="status" aria-live="polite" aria-label={`当前章节：${CHAPTERS[activeChapter]}`}>
            <span className="landing-progress__line"><span style={{ transform: `scaleX(${(activeChapter + 1) / CHAPTERS.length})` }} /></span>
            <span className="landing-progress__label landing-progress__label--full" aria-hidden="true">{String(activeChapter + 1).padStart(2, "0")} / {CHAPTERS.length} · {CHAPTERS[activeChapter]}</span>
            <span className="landing-progress__label landing-progress__label--compact" aria-hidden="true">{String(activeChapter + 1).padStart(2, "0")}/{CHAPTERS.length}</span>
          </div>
          <span className="landing-header__cta-reveal">
            <a className="landing-button landing-button--header" href="/app">
              进入功能页 <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </span>
        </nav>
      </header>

      <section id="top" data-page="1" className="landing-section landing-hero" aria-labelledby="landing-title">
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
        <div className="landing-container landing-hero__content">
          <p className="landing-kicker landing-hero__eyebrow">A spatial thinking workspace</p>
          <h1 id="landing-title" className="landing-hero__title">智构树语<span>Tree Chat</span></h1>
          <p className="landing-hero__subtitle">下一代非线性 AI 知识交互系统</p>
          <div className="landing-hero__actions">
            <a className="landing-button landing-button--primary" href="/app">进入 Tree Chat <ArrowUpRight size={18} aria-hidden="true" /></a>
            <a className="landing-button landing-button--ghost" href="#seed">先了解它如何生长 <ArrowDown size={17} aria-hidden="true" /></a>
          </div>
        </div>
      </section>

      <section id="seed" data-page="2" className="landing-section landing-seed-section" aria-labelledby="seed-title">
        <div className="landing-seed-forest" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <div className={`landing-container landing-seed-layout ${seedPlanted ? "is-planted" : ""}`}>
          <div className="landing-seed-copy">
            <p className="landing-kicker">Seed / 播种</p>
            <EditorialTitle id="seed-title" title="每一次探索，都从一个问题开始。" lines={["每一次探索，", "都从一个问题开始。"]} />
            <p>Tree Chat 把你的灵感化为种子，置于 AI 智能的温床。先把问题种下，让它在可回望的上下文里长出下一条路径。</p>
          </div>
          <div ref={seedStageRef} className={`landing-seed-stage ${seedPlanted ? "is-planted" : ""} ${seedInView ? "is-in-view" : ""}`}>
            <div className="landing-soil" aria-hidden="true"><span className="landing-soil__ring landing-soil__ring--one" /><span className="landing-soil__ring landing-soil__ring--two" /></div>
            <svg ref={sproutRef} className="landing-sprout" viewBox="0 0 132 190" aria-hidden="true">
              <path className="landing-sprout__stem" d="M66 173C64 145 65 116 67 86C68 68 68 49 72 27" />
              <path className="landing-sprout__branch" d="M67 104C51 91 39 75 34 57M68 83C82 75 96 61 101 43" />
              <path className="landing-sprout__leaf" d="M35 58C20 53 15 40 20 29c14 0 24 9 15 29Z" />
              <path className="landing-sprout__leaf landing-sprout__leaf--right" d="M100 44c14-6 25-2 29 8-9 11-21 10-29-8Z" />
              <circle className="landing-sprout__bud" cx="72" cy="26" r="6" />
            </svg>
            <svg ref={matureTreeRef} className="landing-seed-tree" viewBox="0 0 440 520" aria-hidden="true">
              <defs>
                <linearGradient id="seed-tree-bark" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="#3d2920" />
                  <stop offset="0.46" stopColor="#8b6040" />
                  <stop offset="1" stopColor="#4e3024" />
                </linearGradient>
                <radialGradient id="seed-tree-leaf" cx="42%" cy="30%">
                  <stop offset="0" stopColor="#b9d883" />
                  <stop offset="0.58" stopColor="#6c9e50" />
                  <stop offset="1" stopColor="#315f37" />
                </radialGradient>
              </defs>
              <path className="landing-seed-tree__root" d="M220 472C176 470 128 481 78 495M220 472c46-2 94 9 144 23M220 474c-15 8-30 17-42 31M220 474c15 8 30 17 42 31" />
              <path className="landing-seed-tree__trunk" d="M220 474C211 425 211 361 220 305C226 266 222 226 220 184" />
              <path className="landing-seed-tree__branch" d="M220 306C174 286 137 254 99 207M220 298c45-19 82-49 120-91M220 241c-33-29-55-61-74-101M220 238c34-27 58-59 80-99M220 192c-10-20-14-41-16-67M220 192c13-20 22-40 25-63" />
              <g className="landing-seed-tree__canopy">
                <ellipse cx="220" cy="112" rx="128" ry="75" fill="url(#seed-tree-leaf)" />
                <ellipse cx="126" cy="154" rx="82" ry="64" fill="#4d8245" />
                <ellipse cx="314" cy="154" rx="84" ry="65" fill="#5f934b" />
                <ellipse cx="174" cy="88" rx="76" ry="57" fill="#7ca75a" />
                <ellipse cx="270" cy="88" rx="78" ry="58" fill="#6c9e50" />
                <ellipse cx="220" cy="61" rx="56" ry="40" fill="#9fbd78" />
                <ellipse cx="91" cy="199" rx="49" ry="34" fill="#3f743f" />
                <ellipse cx="349" cy="199" rx="51" ry="35" fill="#477d42" />
              </g>
              <path className="landing-seed-tree__twig" d="M98 207c-11-16-22-25-35-31M340 207c12-17 24-25 38-31M145 145c-15-13-25-25-32-40M294 145c15-13 26-25 33-40" />
            </svg>
            <button ref={seedRef} type="button" className="landing-seed-button" onClick={plantSeed} disabled={seedPlanted} aria-pressed={seedPlanted} aria-label={seedPlanted ? "种子已播下" : "点击播下 Tree Chat 种子"}>
              <svg className="landing-seed" viewBox="0 0 88 110" aria-hidden="true">
                <defs><radialGradient id="seed-shell" cx="34%" cy="27%"><stop offset="0" stopColor="#e9d4a0" /><stop offset="0.5" stopColor="#a9773f" /><stop offset="1" stopColor="#563a2a" /></radialGradient></defs>
                <path d="M43 7C20 12 9 34 16 57c6 22 25 38 41 42 19-15 29-37 22-59C73 22 61 11 43 7Z" fill="url(#seed-shell)" stroke="#f0ddad" strokeOpacity=".42" strokeWidth="2" />
                <path d="M46 15c-3 26-1 51 9 74" fill="none" stroke="#f9e8b5" strokeLinecap="round" strokeOpacity=".62" strokeWidth="2" />
              </svg>
              {!seedPlanted && <span className="landing-seed-button__halo" />}
            </button>
            <p ref={seedHintRef} className="landing-seed-stage__hint" role="status" aria-live="polite">{seedPlanted ? "种子已落入土壤，新的枝芽正在生长。继续向下探索它的枝叶。" : "点击 Seed 播种"}</p>
          </div>
        </div>
      </section>

      <section ref={dilemmaRef} id="dilemma" data-page="3" className="landing-section landing-dilemma" aria-labelledby="dilemma-title">
        <div className="landing-container landing-dilemma-grid">
          <div className="landing-solution-visual">
            <svg
              className="landing-branch-map"
              viewBox="0 0 560 380"
              role="img"
              aria-label="三层树状结构：一个问题、两个分支、四个回答节点"
              data-tree-structure="three-level-acyclic"
              data-tree-direction="root-to-leaf"
            >
              <title>Tree Chat 三层树状结构</title>
              <desc>左侧一个问题节点向右展开为两个分支，每个分支再连接两个独立回答节点；没有回连或环。</desc>
              <defs><filter id="map-glow"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
              {TREE_MAP_EDGES.map((edge) => (
                <path key={`${edge.id}-glow`} d={edge.d} fill="none" stroke="#9ebd77" strokeLinecap="round" strokeWidth="3" filter="url(#map-glow)" aria-hidden="true" />
              ))}
              {TREE_MAP_EDGES.map((edge) => (
                <path key={edge.id} className="landing-branch-map__edge" data-tree-edge={edge.id} data-parent={edge.parent} data-child={edge.child} d={edge.d} fill="none" stroke="#d8e8c0" strokeLinecap="round" strokeWidth="1.2" />
              ))}
              {TREE_MAP_NODES.map((node) => (
                <g key={node.id} data-tree-level={node.level} data-tree-node={node.id}>
                  <circle cx={node.x} cy={node.y} r={node.r} fill={node.fill} />
                  <text x={node.x} y={node.y + 4} textAnchor="middle" fill="#173322" fontSize="9" fontWeight="700">{node.label}</text>
                </g>
              ))}
            </svg>
          </div>
          <div className="landing-linear-visual">
            <div
              className="landing-linear-stack"
              role="group"
              aria-label="线性对话示意：大语言模型是什么、有什么优点、有什么缺点"
              data-tree-role="comparison-only"
            >
              <div className="landing-linear-line" aria-hidden="true"><span /><span /><span /><span /><span /></div>
              <div className="landing-linear-thread">
                <p className="landing-linear-thread__prompt landing-linear-thread__prompt--one"><span>01</span>大语言模型是什么？</p>
                <p className="landing-linear-thread__prompt landing-linear-thread__prompt--two"><span>02</span>大语言模型有什么优点？</p>
                <p className="landing-linear-thread__prompt landing-linear-thread__prompt--three"><span>03</span>大语言模型有什么缺点？</p>
                <div className="landing-linear-placeholder" aria-hidden="true"><span /><span /><span /></div>
              </div>
              <div className="landing-linear-break" aria-hidden="true"><Waves size={17} /></div>
            </div>
            <div className="landing-dilemma-copy">
              <p className="landing-kicker">Dilemma / Solution</p>
              <EditorialTitle id="dilemma-title" title="思考，不是一条线" lines={["思考，", "不是一条线"]} />
              <p>线性对话只能把你带向下一句。</p>
              <p>Tree Chat 让每一个分岔都留下来。</p>
            </div>
          </div>
        </div>
      </section>

      <section ref={treeStoryRef} className="landing-tree-story" aria-labelledby="tree-story-title">
        <div className="landing-tree-sticky">
          <LandingVideoScrub
            progressRef={treeProgressRef}
            requestRenderRef={requestTreeRenderRef}
            flipRef={treeFlipRef}
            reducedMotion={reducedMotion}
          />
          <div className="landing-tree-vignette" aria-hidden="true" />
          <div className="landing-tree-overlay" data-tree-composition={`chapter-${treeChapter + 4}`} data-tree-motion={reducedMotion ? "settled" : treeMotionState}>
            <div ref={treeCopyRef} className={`landing-tree-copy landing-tree-copy--chapter-${treeChapter + 4}`} key={story.chapter}>
              <div className="landing-tree-copy__rail">
                <div className="landing-tree-copy__intro">
                  <p className="landing-tree-copy__kicker" style={{ color: story.accent }}>{story.chapter} <span aria-hidden="true">·</span> {story.kicker}</p>
                  <EditorialTitle id="tree-story-title" title={story.title} lines={story.titleLines} />
                  <p>{story.body}</p>
                </div>
                <div className="landing-tree-facts">
                  {story.facts.map((fact) => <FeaturePill key={fact.label} {...fact} />)}
                </div>
              </div>
            </div>
            {treeChapter === TREE_STORIES.length - 1 && (
              <div className="landing-canopy-orbit landing-tree-canopy-orbit" aria-hidden="true">
                <div className="landing-canopy-orbit__ring landing-canopy-orbit__ring--one" />
                <div className="landing-canopy-orbit__ring landing-canopy-orbit__ring--two" />
                <div className="landing-canopy-orbit__core"><Trees size={30} strokeWidth={1.2} /></div>
                <span style={{ "--x": "-62%", "--y": "-8%" } as CSSProperties}>SEED</span>
                <span style={{ "--x": "-40%", "--y": "-52%" } as CSSProperties}>BRANCH</span>
                <span style={{ "--x": "-7%", "--y": "-69%" } as CSSProperties}>LEAF</span>
                <span style={{ "--x": "31%", "--y": "-61%" } as CSSProperties}>GRAFT</span>
                <span style={{ "--x": "61%", "--y": "-30%" } as CSSProperties}>PRUNE</span>
                <span style={{ "--x": "71%", "--y": "11%" } as CSSProperties}>AUXO</span>
                <span style={{ "--x": "48%", "--y": "48%" } as CSSProperties}>RINGS</span>
                <span style={{ "--x": "6%", "--y": "69%" } as CSSProperties}>NUTRIENT</span>
                <span style={{ "--x": "-39%", "--y": "61%" } as CSSProperties}>HARVEST</span>
                <span style={{ "--x": "-65%", "--y": "20%" } as CSSProperties}>TREE-OBS</span>
              </div>
            )}
            {treeChapter === TREE_STORIES.length - 1 && (
              <p className="landing-tree-exit-hint" aria-hidden="true">继续下滑 · 应用前景 <ArrowDown size={14} aria-hidden="true" /></p>
            )}
          </div>
        </div>
        <div className="landing-tree-scroll-track" aria-hidden="true">
          {TREE_STORIES.map((item, index) => <div key={item.chapter} data-page={String(index + 4)} className="landing-tree-scroll-stop" />)}
        </div>
        <noscript>
          <div className="landing-tree-noscript">
            <p className="landing-kicker">Tree workspace / 04–08</p>
            <h2>一棵可回望、可继续生长的思考树。</h2>
            <p>即使浏览器未启用脚本，仍可阅读 Tree Chat 的核心工作方式：</p>
            <ul>
              {TREE_STORIES.map((item) => <li key={item.chapter}><strong>{item.chapter} · {item.title}</strong><span>{item.body}</span></li>)}
            </ul>
            <a className="landing-button landing-button--primary" href="/app">进入功能工作台 <ArrowUpRight size={18} aria-hidden="true" /></a>
          </div>
        </noscript>
      </section>

      <section data-page="9" className="landing-section landing-footer-section" aria-labelledby="footer-title">
        <div className="landing-container">
          <div className="landing-footer-reflection">
            <div className="landing-footer-reflection__intro">
              <p className="landing-kicker">Prospect / 应用前景</p>
              <EditorialTitle id="footer-title" title="我们仍在生长。" lines={["我们仍在", "生长。"]} />
              <p className="landing-footer-reflection__lede">TreeChat 把 AI 回答、人的判断与资料上下文组织成可分支、可回看、可导出的知识树。让学习、研究、治理与责任 AI，都留下清晰的依据与路径。</p>
              <p className="landing-footer-reflection__keywords">TREE-AWARE CONTEXT · LOCAL-FIRST · MARKDOWN → OBSIDIAN GRAPH</p>
            </div>
            <div className="landing-prospect-content">
              <div className="landing-prospect-grid">
                <article><span>LEARNING PATH</span><h3>深度学习</h3><p>沿路径深入，也能回到上层补充分支。</p></article>
                <article><span>RESEARCH &amp; PLANNING</span><h3>研究与方案</h3><p>并列比较路线，保留资料与决策依据。</p></article>
                <article><span>PUBLIC GOVERNANCE</span><h3>公共治理</h3><p>拆解复杂预案，复盘风险与执行细节。</p></article>
                <article><span>RESPONSIBLE AI</span><h3>负责任智能</h3><p>AI 生成，人在比较、取舍与校正。</p></article>
              </div>
              <div className="landing-prospect-notes">
                <article>
                  <h3>SCENARIO PROOF / 场景验证</h3>
                  <p>暴雨疏散、急救学习——同一棵树承载不同复杂度的任务。</p>
                </article>
                <article>
                  <h3>SOCIAL RESPONSIBILITY / 社会责任</h3>
                  <p>让 AI 增强判断、组织与复盘，而不是替人决定。</p>
                </article>
              </div>
            </div>
          </div>
          <footer className="landing-footer">
            <div><BrandLogo tone="light" /><p>让思考拥有枝叶。</p></div>
            {profile.repositoryUrl && profile.licenseUrl && profile.repositoryLabel && profile.licenseLabel && (
              <div className="landing-footer__links">
                <a href={profile.repositoryUrl} target="_blank" rel="noreferrer"><GitFork size={16} aria-hidden="true" /> {profile.repositoryLabel}</a>
                <a href={profile.licenseUrl} target="_blank" rel="noreferrer"><BookOpen size={16} aria-hidden="true" /> {profile.licenseLabel}</a>
              </div>
            )}
            <a className="landing-button landing-button--primary" href="/app">进入功能工作台 <ArrowUpRight size={18} aria-hidden="true" /></a>
          </footer>
        </div>
      </section>
    </main>
  );
}
