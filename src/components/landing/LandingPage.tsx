"use client";

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
  Sprout,
  Trees,
  Upload,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { NarrativeTreeScene } from "./NarrativeTreeScene";

type RevealAnimation = { pause: () => void };

const LANDING_MOTION = {
  hero: { duration: 820, ease: "out(4)" },
  reveal: { duration: 680, ease: "out(3)" },
  seed: { duration: 760, ease: "in(3)" },
  sprout: { duration: 900, ease: "out(4)" },
  chapter: { duration: 460, ease: "out(3)" },
  nav: { duration: 260, ease: "out(3)" },
} as const;

// Keep the chapter transition aligned with the visible seed-to-sprout sequence.
// The scroll is scheduled independently from anime.js so it still works when
// the animation target is unavailable (for example in a reduced-motion or
// static-rendering environment).
const SEED_AUTO_SCROLL_DELAY = 420 + LANDING_MOTION.sprout.duration;

const CHAPTERS = [
  "总览",
  "播种",
  "困境与解法",
  "树状结构",
  "树枝功能",
  "树干功能",
  "树根功能",
  "树冠回顾",
  "开放与反思",
];

const TREE_STORIES: Array<{
  chapter: string;
  kicker: string;
  title: string;
  body: string;
  accent: string;
  facts: Array<{ label: string; text: string; icon: LucideIcon }>;
}> = [
  {
    chapter: "04 / 主干",
    kicker: "One workspace, many directions",
    title: "让思考拥有空间",
    body: "Tree Chat 把每一对 prompt / response 变成树上的节点，让发散、回溯和比较都留在同一张思考地图里。",
    accent: "#b8d78b",
    facts: [
      { label: "树状结构", text: "从任意节点继续探索", icon: Network },
      { label: "2D / 3D", text: "在平面与空间之间切换", icon: Trees },
    ],
  },
  {
    chapter: "05 / 枝条",
    kicker: "Branch · Graft · Prune · Leaf",
    title: "一根枝条，四种动作",
    body: "分支追问、挂载笔记、嫁接子树、修剪枯枝，让结构跟随你的判断持续生长。",
    accent: "#d6bd86",
    facts: [
      { label: "Branch", text: "保留同一问题的多条路径", icon: GitBranch },
      { label: "Graft / Prune / Leaf", text: "重组、清理与批注", icon: Scissors },
    ],
  },
  {
    chapter: "06 / 树干",
    kicker: "Auxo · Rings",
    title: "看见一棵树的时间",
    body: "Auxo 将根任务规划为可审阅的任务树，Rings 保留工作区的变化轨迹，让复杂探索仍然可回到现场。",
    accent: "#e4a760",
    facts: [
      { label: "Auxo", text: "先规划，再逐项回答", icon: BrainCircuit },
      { label: "Rings", text: "安全撤销与重做", icon: History },
    ],
  },
  {
    chapter: "07 / 树根",
    kicker: "Nutrient · Harvest",
    title: "让资料成为根系",
    body: "上传的资料可以作为可追溯的营养来源，相关上下文进入回答；完成后再把整棵思考树收获为可携带的文件。",
    accent: "#9bc6bd",
    facts: [
      { label: "Nutrient", text: "关联本地资料与搜索", icon: Upload },
      { label: "Harvest", text: "导出 Markdown 或 JSON", icon: Download },
    ],
  },
  {
    chapter: "08 / 树冠",
    kicker: "A canopy of connected ideas",
    title: "从局部回答回到全局",
    body: "在树冠视角下，所有分支、批注、历史和资料重新汇聚成一张可回望的知识地图。",
    accent: "#d7e7a8",
    facts: [
      { label: "Canopy", text: "一眼浏览完整树结构", icon: Waves },
      { label: "Open Source", text: "MIT License · GitHub", icon: GitFork },
    ],
  },
];

const FRAGMENT_WORDS = [
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

function BranchLogo({ compact = false }: { compact?: boolean }) {
  const id = useId().replace(/:/g, "");
  const metalGradientId = `landing-logo-metal-${id}`;

  return (
    <span className={`landing-logo ${compact ? "landing-logo--compact" : ""}`}>
      <svg viewBox="0 0 104 42" role="img" aria-label="Tree Chat branch logo">
        <defs>
          <linearGradient id={metalGradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#f5f7ed" />
            <stop offset="0.38" stopColor="#9eac9c" />
            <stop offset="0.6" stopColor="#e9eee1" />
            <stop offset="1" stopColor="#68766d" />
          </linearGradient>
        </defs>
        <path
          d="M6 31C22 30 26 20 37 19c10-1 15 8 25 5 9-2 13-15 31-17"
          fill="none"
          stroke={`url(#${metalGradientId})`}
          strokeLinecap="round"
          strokeWidth="3.4"
        />
        <path d="M35 20 25 10M57 24 52 12M75 19 78 7" fill="none" stroke="#cbd6c5" strokeLinecap="round" strokeWidth="2" />
        <path d="M23 10c-2-4 4-7 8-4-1 4-4 6-8 4ZM49 11c0-4 6-6 9-2-2 4-5 5-9 2ZM75 7c1-4 7-4 9 0-3 3-6 3-9 0Z" fill="#a9bca4" opacity=".94" />
      </svg>
      {!compact && (
        <span className="landing-logo__wordmark">
          <strong>Tree Chat</strong>
          <small>智构树语</small>
        </span>
      )}
    </span>
  );
}

function FeaturePill({ icon: Icon, label, text }: { icon: LucideIcon; label: string; text: string }) {
  return (
    <div className="landing-feature-pill" data-reveal>
      <span className="landing-feature-pill__icon"><Icon size={16} strokeWidth={1.7} /></span>
      <span><strong>{label}</strong><small>{text}</small></span>
    </div>
  );
}

export function LandingPage() {
  const [activeChapter, setActiveChapter] = useState(0);
  const [treeProgress, setTreeProgress] = useState(0);
  const [seedPlanted, setSeedPlanted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const treeStoryRef = useRef<HTMLElement | null>(null);
  const dilemmaRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const treeCopyRef = useRef<HTMLDivElement | null>(null);
  const seedRef = useRef<SVGSVGElement | null>(null);
  const sproutRef = useRef<SVGSVGElement | null>(null);
  const seedHintRef = useRef<HTMLParagraphElement | null>(null);
  const revealAnimations = useRef<RevealAnimation[]>([]);

  const treeChapter = Math.min(
    TREE_STORIES.length - 1,
    Math.max(0, Math.round(treeProgress * (TREE_STORIES.length - 1))),
  );
  const story = TREE_STORIES[treeChapter];

  useEffect(() => {
    document.documentElement.classList.add("landing-scroll-root");
    return () => document.documentElement.classList.remove("landing-scroll-root");
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileQuery = window.matchMedia("(max-width: 900px)");
    const sync = () => {
      setReducedMotion(motionQuery.matches);
      setMobile(mobileQuery.matches);
    };
    sync();
    motionQuery.addEventListener?.("change", sync);
    mobileQuery.addEventListener?.("change", sync);
    motionQuery.addListener?.(sync);
    mobileQuery.addListener?.(sync);
    return () => {
      motionQuery.removeEventListener?.("change", sync);
      mobileQuery.removeEventListener?.("change", sync);
      motionQuery.removeListener?.(sync);
      mobileQuery.removeListener?.(sync);
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
    revealAnimations.current.push(...animations);
    return () => animations.forEach((animation) => animation.pause());
  }, [reducedMotion]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((target) => target.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.target.classList.contains("is-visible")) return;
          entry.target.classList.add("is-visible");
          if (reducedMotion) return;
          const targets = Array.from(entry.target.querySelectorAll<HTMLElement>("[data-reveal]"));
          if (!targets.length) return;
          const animation = animate(targets, {
            opacity: [0, 1],
            translateY: [18, 0],
            duration: LANDING_MOTION.reveal.duration,
            delay: stagger(70),
            ease: LANDING_MOTION.reveal.ease,
          });
          revealAnimations.current.push(animation);
        });
      },
      { threshold: 0.2 },
    );
    document.querySelectorAll<HTMLElement>(".landing-section, .landing-tree-story").forEach((section) => observer.observe(section));
    return () => {
      observer.disconnect();
      revealAnimations.current.forEach((animation) => animation.pause());
      revealAnimations.current = [];
    };
  }, [reducedMotion]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header || reducedMotion) return;
    const animation = animate(header, {
      backgroundColor: scrolled ? "rgba(8, 27, 20, 0.82)" : "rgba(8, 27, 20, 0)",
      duration: LANDING_MOTION.nav.duration,
      ease: LANDING_MOTION.nav.ease,
    });
    revealAnimations.current.push(animation);
    return () => {
      animation.pause();
    };
  }, [reducedMotion, scrolled]);

  useEffect(() => {
    const copy = treeCopyRef.current;
    if (!copy || reducedMotion) return;
    const animation = animate(copy, {
      opacity: [0.12, 1],
      translateY: [16, 0],
      duration: LANDING_MOTION.chapter.duration,
      ease: LANDING_MOTION.chapter.ease,
    });
    revealAnimations.current.push(animation);
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
    revealAnimations.current.push(animation);
    return () => {
      animation.pause();
    };
  }, [reducedMotion, seedPlanted]);

  useEffect(() => {
    if (!seedPlanted) return;

    const scrollTimer = window.setTimeout(() => {
      const dilemma = dilemmaRef.current;
      if (!dilemma) return;

      // Keep the fixed chapter indicator in sync even on short landscape
      // viewports, where Page 3's tall content can make a center-distance
      // heuristic prefer the preceding seed section.
      setActiveChapter(2);
      dilemma.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }, reducedMotion ? 0 : SEED_AUTO_SCROLL_DELAY);

    return () => window.clearTimeout(scrollTimer);
  }, [reducedMotion, seedPlanted]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 28);
      const storyRect = treeStoryRef.current?.getBoundingClientRect();
      if (storyRect && storyRect.top <= window.innerHeight * 0.78) {
        const available = Math.max(1, storyRect.height - window.innerHeight);
        const progress = Math.min(1, Math.max(0, -storyRect.top / available));
        setTreeProgress(progress);
        if (storyRect.bottom <= window.innerHeight * 0.72) {
          setActiveChapter(CHAPTERS.length - 1);
        } else {
          setActiveChapter(3 + Math.min(TREE_STORIES.length - 1, Math.round(progress * (TREE_STORIES.length - 1))));
        }
      } else {
        const earlySections = Array.from(document.querySelectorAll<HTMLElement>(".landing-hero, #seed, .landing-dilemma"));
        const viewportMarker = window.innerHeight * 0.42;
        const currentIndex = earlySections.findIndex((section) => {
          const rect = section.getBoundingClientRect();
          return rect.top <= viewportMarker && rect.bottom > viewportMarker;
        });
        if (currentIndex >= 0) {
          setActiveChapter(currentIndex);
          return;
        }
        const closest = earlySections.reduce<{ index: number; distance: number } | null>((best, section, index) => {
          const rect = section.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - viewportMarker);
          return !best || distance < best.distance ? { index, distance } : best;
        }, null);
        setActiveChapter(closest?.index ?? 0);
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
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
      duration: LANDING_MOTION.seed.duration,
      ease: LANDING_MOTION.seed.ease,
    });
    revealAnimations.current.push(animation);

    if (sproutRef.current) {
      const sproutAnimation = animate(sproutRef.current, {
        opacity: [0, 1],
        translateY: [34, 0],
        scaleY: [0.18, 1],
        duration: LANDING_MOTION.sprout.duration,
        delay: 420,
        ease: LANDING_MOTION.sprout.ease,
      });
      revealAnimations.current.push(sproutAnimation);
    }
  }

  const backgroundFragments = useMemo(
    () => FRAGMENT_WORDS.map((word, index) => ({
      word,
      left: `${8 + ((index * 19) % 84)}%`,
      top: `${14 + ((index * 29) % 64)}%`,
      delay: `${index * 0.25}s`,
      opacity: 0.28 + (index % 4) * 0.13,
    })),
    [],
  );

  return (
    <main className="landing-page">
      <a className="landing-skip-link" href="#seed">跳到产品叙事</a>
      <header ref={headerRef} className={`landing-header ${scrolled ? "is-scrolled" : ""}`}>
        <nav className="landing-header__nav" aria-label="产品介绍导航">
          <a href="#top" className="landing-header__brand" aria-label="回到 Tree Chat 介绍页开头">
            <BranchLogo compact />
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

      <section id="top" className="landing-section landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__mountain" aria-hidden="true" />
        <div className="landing-hero-words" aria-hidden="true">
          {backgroundFragments.map((fragment) => (
            <span key={fragment.word} style={{ left: fragment.left, top: fragment.top, opacity: fragment.opacity, animationDelay: fragment.delay }}>{fragment.word}</span>
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
          <div className="landing-hero__meta" data-reveal>
            <span><Sprout size={15} aria-hidden="true" /> 把灵感化为种子</span>
            <span className="landing-dot" aria-hidden="true" />
            <span>让思考拥有枝叶</span>
          </div>
        </div>
      </section>

      <section id="seed" className="landing-section landing-seed-section" aria-labelledby="seed-title">
        <div className="landing-seed-forest" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <div className="landing-container landing-seed-layout">
          <div className="landing-seed-copy" data-reveal>
            <p className="landing-kicker">02 / Seed</p>
            <h2 id="seed-title">每一次探索，都从一个问题开始。</h2>
            <p>Tree Chat 把你的灵感化为种子，置于 AI 智能的温床。先把问题种下，让它在可回望的上下文里长出下一条路径。</p>
          </div>
          <div className={`landing-seed-stage ${seedPlanted ? "is-planted" : ""}`}>
            <div className="landing-soil" aria-hidden="true"><span className="landing-soil__ring landing-soil__ring--one" /><span className="landing-soil__ring landing-soil__ring--two" /></div>
            <svg ref={sproutRef} className="landing-sprout" viewBox="0 0 132 190" aria-hidden="true">
              <path className="landing-sprout__stem" d="M66 173C64 145 65 116 67 86C68 68 68 49 72 27" />
              <path className="landing-sprout__branch" d="M67 104C51 91 39 75 34 57M68 83C82 75 96 61 101 43" />
              <path className="landing-sprout__leaf" d="M35 58C20 53 15 40 20 29c14 0 24 9 15 29Z" />
              <path className="landing-sprout__leaf landing-sprout__leaf--right" d="M100 44c14-6 25-2 29 8-9 11-21 10-29-8Z" />
              <circle className="landing-sprout__bud" cx="72" cy="26" r="6" />
            </svg>
            <button type="button" className="landing-seed-button" onClick={plantSeed} aria-pressed={seedPlanted} aria-label={seedPlanted ? "种子已播下" : "点击播下 Tree Chat 种子"}>
              <svg ref={seedRef} className="landing-seed" viewBox="0 0 88 110" aria-hidden="true">
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

      <section ref={dilemmaRef} id="dilemma" className="landing-section landing-dilemma" aria-labelledby="dilemma-title">
        <div className="landing-container landing-dilemma-grid">
          <div className="landing-solution-visual" data-reveal>
            <div className="landing-kicker">03 / Dilemma &amp; Solution</div>
            <h2 id="dilemma-title">思考不是一条线。</h2>
            <svg className="landing-branch-map" viewBox="0 0 560 380" role="img" aria-label="一个问题向多个方向分支，并保留上下文关系">
              <defs><filter id="map-glow"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
              <path d="M74 188C168 188 180 98 286 98s112 90 202 90M74 188c94 0 108 94 212 94s115-94 202-94" fill="none" stroke="#9ebd77" strokeLinecap="round" strokeWidth="3" filter="url(#map-glow)" />
              <path d="M74 188C168 188 180 98 286 98s112 90 202 90M74 188c94 0 108 94 212 94s115-94 202-94" fill="none" stroke="#d8e8c0" strokeLinecap="round" strokeWidth="1.2" />
              <circle cx="74" cy="188" r="18" fill="#d6bd86" /><circle cx="286" cy="98" r="14" fill="#88a86b" /><circle cx="286" cy="282" r="14" fill="#88a86b" /><circle cx="488" cy="188" r="18" fill="#b8d6a0" />
              <text x="74" y="193" textAnchor="middle" fill="#173322" fontSize="10" fontWeight="700">Q</text><text x="488" y="193" textAnchor="middle" fill="#173322" fontSize="10" fontWeight="700">A</text>
            </svg>
            <p className="landing-solution-visual__caption">同一个问题，可以留下多条可回到现场的路径。</p>
          </div>
          <div className="landing-linear-visual" data-reveal>
            <div className="landing-linear-stack" aria-hidden="true">
              <div className="landing-linear-line"><span /><span /><span /><span /><span /></div>
              <div className="landing-chat-bubble landing-chat-bubble--muted">继续追问……</div>
              <div className="landing-chat-bubble landing-chat-bubble--muted landing-chat-bubble--short">刚才的上下文去哪了？</div>
              <div className="landing-linear-break"><Waves size={17} aria-hidden="true" /> context lost</div>
            </div>
            <div className="landing-dilemma-copy">
              <p>线性对话只能把你带向下一句。</p>
              <p>Tree Chat 让每一个分岔都留下来。</p>
            </div>
          </div>
        </div>
      </section>

      <section ref={treeStoryRef} className="landing-tree-story" aria-labelledby="tree-story-title">
        <div className="landing-tree-sticky">
          <NarrativeTreeScene
            progress={treeProgress}
            reducedMotion={reducedMotion}
            mobile={mobile}
            active={activeChapter >= 3 && activeChapter <= 7}
          />
          <div className="landing-tree-vignette" aria-hidden="true" />
          <div className="landing-container landing-tree-overlay">
            <div ref={treeCopyRef} className="landing-tree-copy" key={story.chapter}>
              <p className="landing-kicker" style={{ color: story.accent }}>{story.chapter}</p>
              <p className="landing-tree-copy__kicker">{story.kicker}</p>
              <h2 id="tree-story-title">{story.title}</h2>
              <p>{story.body}</p>
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
                <span style={{ "--x": "33%", "--y": "-35%" } as CSSProperties}>Nutrient</span>
                <span style={{ "--x": "35%", "--y": "35%" } as CSSProperties}>Rings</span>
                <span style={{ "--x": "-48%", "--y": "34%" } as CSSProperties}>Harvest</span>
              </div>
            )}
            <div className="landing-tree-stage-label" aria-hidden="true"><span>SCROLL TO GROW</span><span className="landing-tree-stage-label__rule" /></div>
          </div>
          <div className="landing-tree-progress" aria-hidden="true"><span style={{ transform: `scaleY(${treeProgress})` }} /></div>
        </div>
        <div className="landing-tree-scroll-track" aria-hidden="true">
          {TREE_STORIES.map((item) => <div key={item.chapter} className="landing-tree-scroll-stop" />)}
        </div>
        <noscript>
          <div className="landing-tree-noscript">
            <p className="landing-kicker">04–08 / Tree workspace</p>
            <h2>一棵可回望、可继续生长的思考树。</h2>
            <p>即使浏览器未启用脚本，仍可阅读 Tree Chat 的核心工作方式：</p>
            <ul>
              {TREE_STORIES.map((item) => <li key={item.chapter}><strong>{item.chapter} · {item.title}</strong><span>{item.body}</span></li>)}
            </ul>
            <a className="landing-button landing-button--primary" href="/app">进入功能主页面 <ArrowUpRight size={18} aria-hidden="true" /></a>
          </div>
        </noscript>
      </section>

      <section className="landing-section landing-footer-section" aria-labelledby="footer-title">
        <div className="landing-container">
          <div className="landing-footer-reflection" data-reveal>
            <p className="landing-kicker">09 / Reflection</p>
            <h2 id="footer-title">一棵树，也要知道自己的边界。</h2>
            <div className="landing-limitation-grid">
              <article><span>01</span><h3>需要模型连接</h3><p>回答依赖服务端配置的 DeepSeek API Key。</p></article>
              <article><span>02</span><h3>工作区在浏览器里</h3><p>项目与进度由本地浏览器存储承载。</p></article>
              <article><span>03</span><h3>状态不跨设备</h3><p>项目由浏览器 localStorage 承载，当前仓库未提供账号或云端同步。</p></article>
            </div>
          </div>
          <footer className="landing-footer" data-reveal>
            <div><BranchLogo /><p>让思考拥有枝叶。</p></div>
            <div className="landing-footer__links">
              <a href="https://github.com/hancewang77-hl/tree-chat" target="_blank" rel="noreferrer"><GitFork size={16} aria-hidden="true" /> GitHub</a>
              <a href="https://github.com/hancewang77-hl/tree-chat#license" target="_blank" rel="noreferrer"><BookOpen size={16} aria-hidden="true" /> MIT License</a>
            </div>
            <a className="landing-button landing-button--primary" href="/app">进入功能主页面 <ArrowUpRight size={18} aria-hidden="true" /></a>
          </footer>
        </div>
      </section>
    </main>
  );
}
