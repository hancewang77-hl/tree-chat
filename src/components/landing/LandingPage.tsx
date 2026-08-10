"use client";

import { animate } from "animejs";
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
import { NarrativeTreeScene } from "./NarrativeTreeScene";

type RevealAnimation = { pause: () => void };

const LANDING_MOTION = {
  hero: { duration: 820, ease: "out(4)" },
  seed: { duration: 760, ease: "in(3)" },
  sprout: { duration: 900, ease: "out(4)" },
  chapter: { duration: 460, ease: "out(3)" },
} as const;

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
    title: "让复杂思考长成一棵树",
    titleLines: ["让复杂思考", "长成一棵树"],
    body: "把每轮提问与回答放进父子路径，把不同方案留在并列枝条。你可以沿一条路线深入，也能退回主干比较、整理，让复杂任务始终保有全貌。",
    accent: "var(--landing-moss-light)",
    facts: [
      { label: "树状结构", text: "从任意节点继续探索", icon: Network },
      { label: "2D / 3D", text: "在平面与空间之间切换", icon: Trees },
    ],
  },
  {
    chapter: "枝条",
    kicker: "Branch · Graft · Prune · Leaf",
    title: "每一根枝条，都是可继续的思路",
    titleLines: ["每一根枝条，", "都是可继续的思路"],
    body: "从当前节点展开新分支，用 Leaf 留下判断，用 Graft 调整归属，再以 Prune 清理失效路径。思路可以先发散，随后收束成可继续加工的结构。",
    accent: "var(--landing-moss-light)",
    facts: [
      { label: "Branch", text: "从同一问题展开另一条路径", icon: GitBranch },
      { label: "Graft", text: "把成熟思路接回主干", icon: GitFork },
      { label: "Prune", text: "移除不再需要的分支", icon: Scissors },
      { label: "Leaf", text: "为节点留下可回看的批注", icon: BookOpen },
    ],
  },
  {
    chapter: "树干",
    kicker: "Auxo · Rings",
    title: "让规划成为主线，让历史保留年轮",
    titleLines: ["让规划成为主线，", "让历史保留年轮"],
    body: "Auxo 先把根任务拆成可审阅的任务树，Rings 记录移动、扩展和修剪的变化。规划沿主线推进，试错也有可撤销、可重做的回路。",
    accent: "var(--landing-moss-light)",
    facts: [
      { label: "Auxo", text: "先规划，再逐项回答", icon: BrainCircuit },
      { label: "Rings", text: "安全撤销与重做", icon: History },
    ],
  },
  {
    chapter: "树根",
    kicker: "Nutrient · Harvest",
    title: "让资料扎根，让成果被收获",
    titleLines: ["让资料扎根，", "让成果被收获"],
    body: "将课程讲义、论文摘要和项目材料纳入当前上下文，再把整理后的整棵树导出为 Markdown 或 JSON。资料有归属，成果也能带走。",
    accent: "var(--landing-moss-light)",
    facts: [
      { label: "Nutrient", text: "关联本地资料与搜索", icon: Upload },
      { label: "Harvest", text: "导出 Markdown 或 JSON", icon: Download },
    ],
  },
  {
    chapter: "树冠",
    kicker: "A canopy of connected ideas",
    title: "从局部回答，回到全局知识地图",
    titleLines: ["从局部回答，", "回到全局知识地图"],
    body: "分支、批注、资料、历史与导出在树冠视角重新汇合。你可以从单个节点回到全局结构，看清问题如何展开、判断如何形成、成果如何沉淀。",
    accent: "var(--landing-moss-light)",
    facts: [
      { label: "Canopy", text: "一眼浏览完整树结构", icon: Waves },
    ],
  },
];

const BACKGROUND_FRAGMENTS = [
  { word: "灵感", left: "8%", top: "18%" },
  { word: "问题", left: "33%", top: "11%" },
  { word: "证据", left: "58%", top: "25%" },
  { word: "比较", left: "86%", top: "15%" },
  { word: "假设", left: "16%", top: "45%" },
  { word: "回溯", left: "43%", top: "52%" },
  { word: "路径", left: "69%", top: "40%" },
  { word: "知识", left: "92%", top: "55%" },
  { word: "为什么", left: "7%", top: "76%" },
  { word: "下一步", left: "29%", top: "67%" },
  { word: "可能性", left: "57%", top: "82%" },
  { word: "连接", left: "82%", top: "72%" },
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
      <span className="landing-feature-pill__icon"><Icon size={16} strokeWidth={1.7} /></span>
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
  const [reducedMotion, setReducedMotion] = useState(false);
  const activeChapterRef = useRef(0);
  const treeChapterRef = useRef(0);
  const treeProgressRef = useRef(0);
  const requestTreeRenderRef = useRef<(() => void) | null>(null);
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

  const storyBase = TREE_STORIES[treeChapter];
  const story = treeChapter === TREE_STORIES.length - 1
    ? {
        ...storyBase,
        facts: [
          storyBase.facts[0],
          { ...profile.canopyFact, icon: GitFork },
        ],
      }
    : storyBase;

  useEffect(() => {
    // The scrolling element is normally <html>, but embedded shells and
    // WebKit-based browsers can delegate document scrolling to <body>. Keep
    // the same snap contract on both roots so every review frame (including
    // the five sticky tree stops) settles on an intentional 1080px boundary.
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
      setReducedMotion(motionQuery.matches);
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
    const initialTargets = [
      ".landing-hero__eyebrow",
      ".landing-hero__title",
      ".landing-hero__subtitle",
      ".landing-hero__actions",
      ".landing-hero__branch",
    ];
    if (reducedMotion) {
      document.querySelectorAll<HTMLElement>(initialTargets.join(",")).forEach((target) => {
        target.style.opacity = "1";
        target.style.transform = "none";
      });
      return;
    }
    const animations = initialTargets.map((selector, index) =>
      animate(selector, {
        opacity: [0, 1],
        translateY: [index === 4 ? 18 : 24, 0],
        duration: LANDING_MOTION.hero.duration,
        delay: 160 + index * 105,
        ease: LANDING_MOTION.hero.ease,
      }),
    );
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
      const storyRect = treeStoryRef.current?.getBoundingClientRect();
      if (storyRect && storyRect.top <= window.innerHeight * 0.78) {
        // Switch copy and masks only when the camera reaches the next 1080px
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
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
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
      document.documentElement.classList.remove("landing-scroll-tail-free");
      document.body.classList.remove("landing-scroll-tail-free");
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
            <BrandLogo compact decorative markOnly tone="light" />
            <span>Tree Chat</span>
          </a>
          <div className="landing-progress" role="status" aria-live="polite" aria-label={`当前章节：${CHAPTERS[activeChapter]}`}>
            <span className="landing-progress__line"><span style={{ transform: `scaleX(${(activeChapter + 1) / CHAPTERS.length})` }} /></span>
            <span className="landing-progress__label landing-progress__label--full" aria-hidden="true">{String(activeChapter + 1).padStart(2, "0")} / {CHAPTERS.length} · {CHAPTERS[activeChapter]}</span>
            <span className="landing-progress__label landing-progress__label--compact" aria-hidden="true">{String(activeChapter + 1).padStart(2, "0")}/{CHAPTERS.length}</span>
          </div>
          <a className="landing-button landing-button--header" href="/app">
            进入功能页 <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </nav>
      </header>

      <section id="top" data-page="1" className="landing-section landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__mountain" aria-hidden="true" />
        <div className="landing-hero-words" aria-hidden="true">
          {BACKGROUND_FRAGMENTS.map((fragment, index) => (
            <span key={fragment.word} style={{ left: fragment.left, top: fragment.top, opacity: 0.28 + (index % 4) * 0.13, animationDelay: `${index * 0.25}s` }}>{fragment.word}</span>
          ))}
        </div>
        <div className="landing-hero__branch" aria-hidden="true">
          <svg viewBox="0 0 1200 520" preserveAspectRatio="none">
            <defs>
              <linearGradient id="hero-branch-metal" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#eef4e7" />
                <stop offset="0.48" stopColor="#89988d" />
                <stop offset="0.7" stopColor="#e3ecdc" />
                <stop offset="1" stopColor="#53655d" />
              </linearGradient>
              <filter id="hero-branch-glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <path d="M0 505C170 490 216 370 362 361c115-8 158 74 283 29 164-59 202-270 555-340" fill="none" filter="url(#hero-branch-glow)" opacity=".94" stroke="url(#hero-branch-metal)" strokeLinecap="round" strokeWidth="8" />
            <path d="M356 364 282 227M541 388 518 208M714 320 754 142M874 238 1010 70" fill="none" stroke="url(#hero-branch-metal)" strokeLinecap="round" strokeWidth="5" />
          </svg>
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
          <NarrativeTreeScene
            progress={treeChapter / (TREE_STORIES.length - 1)}
            progressRef={treeProgressRef}
            requestRenderRef={requestTreeRenderRef}
            reducedMotion={reducedMotion}
          />
          <div className="landing-tree-vignette" aria-hidden="true" />
          <div className="landing-tree-overlay" data-tree-composition={`chapter-${treeChapter + 4}`}>
            <div ref={treeCopyRef} className={`landing-tree-copy landing-tree-copy--chapter-${treeChapter + 4}`} key={story.chapter}>
              <div className="landing-tree-copy__intro">
                <p className="landing-tree-copy__kicker" style={{ color: story.accent }}>{story.chapter} <span aria-hidden="true">·</span> {story.kicker}</p>
                <EditorialTitle id="tree-story-title" title={story.title} lines={story.titleLines} />
                <p>{story.body}</p>
              </div>
              <div className="landing-tree-facts">
                {story.facts.map((fact) => <FeaturePill key={fact.label} {...fact} />)}
              </div>
            </div>
            {treeChapter === TREE_STORIES.length - 1 && (
              <div className="landing-canopy-orbit landing-tree-canopy-orbit" aria-hidden="true">
                <div className="landing-canopy-orbit__ring landing-canopy-orbit__ring--one" />
                <div className="landing-canopy-orbit__ring landing-canopy-orbit__ring--two" />
                <div className="landing-canopy-orbit__core"><Trees size={30} strokeWidth={1.2} /></div>
                <span style={{ "--x": "-46%", "--y": "-6%" } as CSSProperties}>Branch</span>
                <span style={{ "--x": "-5%", "--y": "-51%" } as CSSProperties}>Graft</span>
                <span style={{ "--x": "33%", "--y": "-35%" } as CSSProperties}>Nutrient</span>
                <span style={{ "--x": "52%", "--y": "-4%" } as CSSProperties}>Prune</span>
                <span style={{ "--x": "35%", "--y": "35%" } as CSSProperties}>Rings</span>
                <span style={{ "--x": "4%", "--y": "51%" } as CSSProperties}>Leaf</span>
                <span style={{ "--x": "-48%", "--y": "34%" } as CSSProperties}>Harvest</span>
              </div>
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
              <EditorialTitle id="footer-title" title="让每一次提问都有位置，让每一次探索都有路径" lines={["让每一次提问都有位置，", "让每一次探索都有路径"]} />
              <p className="landing-footer-reflection__lede">Tree Chat（智构树语）面向课程学习、研究资料整理、竞赛方案推演与公共治理，把 AI 回答、用户判断和资料上下文组织成可浏览、可调整、可导出的知识树，降低回看、比较和整理成本。</p>
            </div>
            <div className="landing-prospect-content">
              <div className="landing-prospect-grid">
                <article><span>LEARNING PATH</span><h3>深度学习</h3><p>围绕一个知识点展开定义、推导、例题、易错点和个人笔记。学习者可以沿路径深入，也能回到上层补充分支，形成可复习的个人知识树。</p></article>
                <article><span>RESEARCH &amp; PLANNING</span><h3>研究与方案</h3><p>把文献观点、实验方法、需求分析与技术路线放在可比较的枝条上，结合项目资料推进论证，再以 Markdown 或 JSON 导出结果。</p></article>
                <article><span>PUBLIC GOVERNANCE</span><h3>公共治理</h3><p>围绕风险地图、预警触发、分层疏散、物资调配与临时安置拆解复杂预案，让总体目标和执行细节在同一结构中接受复盘。</p></article>
                <article><span>RESPONSIBLE AI</span><h3>负责任智能</h3><p>AI 提供内容，用户负责比较、取舍与校正。树状路径保留问题来源和人工批注，让智能工具服务于人的判断与数字素养。</p></article>
              </div>
              <div className="landing-prospect-notes">
                <article>
                  <h3>SCENARIO PROOF / 场景验证</h3>
                  <p>在“暴雨内涝居民疏散与安置”演示中，风险地图、预警触发、物资调配、过程监管和临时安置分别落在对应枝条；在“海姆立克急救法”学习中，概念、适用情形、原理、操作要领与记忆口诀形成可回溯路径。两类场景分别验证复杂方案推演与递进学习。</p>
                </article>
                <article>
                  <h3>SOCIAL RESPONSIBILITY / 社会责任</h3>
                  <p>教育数字化带来了充足内容，也把整理、辨别和复盘能力推到前台。Tree Chat 以低门槛、高可视的树状交互帮助学习者保存自己的理解路径，帮助方案制定者保留依据与分歧。项目承担的社会责任，是让 AI 增强人的判断力、知识组织能力和数字素养，并让有价值的探索沉淀为可复用成果。</p>
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
