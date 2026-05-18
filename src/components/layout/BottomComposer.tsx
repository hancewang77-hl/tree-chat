"use client";

import { useState, useEffect, useRef } from "react";
import { Send, GitBranch, StickyNote } from "lucide-react";
import { useTreeState } from "@/src/state/TreeContext";

type ComposerMode = "ai" | "note";

const SEED_PARTICLES = [
  { angle: 0, dist: 22 },
  { angle: 45, dist: 27 },
  { angle: 90, dist: 20 },
  { angle: 135, dist: 29 },
  { angle: 180, dist: 24 },
  { angle: 225, dist: 26 },
  { angle: 270, dist: 21 },
  { angle: 315, dist: 28 },
];

export function BottomComposer({
  onSend,
  onAddLeaf,
}: {
  onSend: (prompt: string) => void;
  onAddLeaf: (content: string) => void;
}) {
  const state = useTreeState();
  const [mode, setMode] = useState<ComposerMode>("ai");
  const [text, setText] = useState("");
  const [burst, setBurst] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Listen for external mode-switch and focus events (from InspectorSidebar)
  useEffect(() => {
    const handleMode = (e: Event) => setMode((e as CustomEvent).detail as ComposerMode);
    const handleFocus = () => {
      // Delay to avoid the triggering button stealing focus back
      setTimeout(() => textareaRef.current?.focus(), 50);
    };
    window.addEventListener("composer-mode", handleMode);
    window.addEventListener("composer-focus", handleFocus);
    return () => {
      window.removeEventListener("composer-mode", handleMode);
      window.removeEventListener("composer-focus", handleFocus);
    };
  }, []);

  function handleSubmit() {
    if (!text.trim()) return;
    // Seed burst animation
    setBurst(true);
    setTimeout(() => setBurst(false), 500);
    if (mode === "ai") {
      onSend(text);
    } else {
      onAddLeaf(text);
    }
    setText("");
  }

  const placeholder =
    mode === "ai"
      ? `在 z = ${state.selectedLayer} 层继续延伸你的思考... (Enter 发送)`
      : "记录一个想法或笔记... (Enter 保存)";

  return (
    <div
      className="z-20 shrink-0 animate-fade-up stagger-4"
      style={{
        background: "var(--bg-paper)",
        boxShadow: "0 -2px 20px var(--shadow-warm)",
      }}
    >
      {/* Organic soil-line top edge with root tendrils */}
      <svg
        className="block w-full soil-edge"
        viewBox="0 0 1200 28"
        preserveAspectRatio="none"
        style={{ height: 28, display: "block" }}
      >
        {/* Gentle undulating soil line */}
        <path
          d={[
            "M0 12",
            "C 60 20, 90 6, 150 14",
            "C 210 22, 240 8, 300 16",
            "C 360 24, 390 4, 450 12",
            "C 510 20, 540 10, 600 14",
            "C 660 18, 690 8, 750 15",
            "C 810 22, 840 5, 900 13",
            "C 960 21, 990 7, 1050 14",
            "C 1110 21, 1140 9, 1200 15",
            "L1200 0 L0 0 Z",
          ].join(" ")}
          fill="var(--bg-paper)"
        />
        {/* Root tendrils — animate depth on hover */}
        {[
          [80, 16, 78, 26, 0.4],
          [200, 13, 202, 24, 0.3],
          [340, 14, 338, 32, 0.25],
          [500, 16, 501, 28, 0.35],
          [660, 12, 658, 30, 0.28],
          [820, 15, 821, 25, 0.32],
          [980, 13, 979, 33, 0.22],
        ].map(([x1, y1, x2, y2, opacity], i) => (
          <g key={i} className="root-tendril">
            <path
              d={`M${x1} ${y1} Q${x1} ${(y1 as number) + (y2 as number) / 2} ${x2} ${y2}`}
              fill="none"
              stroke="var(--accent-bark)"
              strokeWidth="0.7"
              opacity={opacity as number}
            />
          </g>
        ))}
        {/* Small root hairs */}
        {[
          [78, 26, 72, 28],
          [338, 32, 332, 36],
          [501, 28, 506, 32],
          [658, 30, 664, 34],
          [979, 33, 985, 37],
        ].map(([x1, y1, x2, y2], i) => (
          <path
            key={`hair-${i}`}
            d={`M${x1} ${y1} L${x2} ${y2}`}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="0.5"
            opacity="0.2"
          />
        ))}
      </svg>

      {/* Main composer body */}
      <div className="px-4 pb-3 pt-0.5">
        <div className="flex items-end gap-2.5 max-w-full">
          {/* Mode toggle — styled as branch segments */}
          <div className="flex shrink-0 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-warm)" }}>
            <button
              onClick={() => setMode("ai")}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-all relative"
              style={{
                background: mode === "ai" ? "var(--accent-bark)" : "transparent",
                color: mode === "ai" ? "#FBF7F0" : "var(--text-muted)",
              }}
            >
              <GitBranch size={13} />
              <span className="hidden sm:inline">AI 分支</span>
              {mode === "ai" && (
                <span
                  className="absolute -top-1 right-2 w-1.5 h-1.5 rounded-full animate-pulse-warm"
                  style={{ background: "var(--accent-sage)" }}
                />
              )}
            </button>
            <button
              onClick={() => setMode("note")}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-all"
              style={{
                background: mode === "note" ? "var(--accent-sage)" : "transparent",
                color: mode === "note" ? "#FBF7F0" : "var(--text-muted)",
              }}
            >
              <StickyNote size={13} />
              <span className="hidden sm:inline">笔记</span>
            </button>
          </div>

          {/* Input — rich soil with tree-ring radial gradient */}
          <div
            className="flex flex-1 items-end rounded-2xl px-4 py-2.5 transition-all relative overflow-hidden composer-input"
            style={{
              background: [
                "radial-gradient(ellipse at 15% 85%, rgba(107, 95, 79, 0.06) 0%, transparent 55%)",
                "radial-gradient(ellipse at 18% 88%, rgba(107, 95, 79, 0.04) 0%, transparent 40%)",
                "radial-gradient(ellipse at 12% 82%, rgba(125, 155, 110, 0.04) 0%, transparent 60%)",
                "var(--bg-cream)",
              ].join(", "),
              border: "1px solid var(--border-warm)",
              boxShadow: "inset 0 2px 8px var(--shadow-warm), 0 1px 0 rgba(224, 216, 200, 0.6)",
            }}
          >
            <textarea
              ref={textareaRef}
              className="w-full resize-none bg-transparent text-[14px] leading-6 outline-none placeholder:opacity-40 relative z-[1]"
              rows={2}
              placeholder={placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              style={{ color: "var(--text-charcoal)" }}
            />
          </div>

          {/* Send — seed-shaped button with burst effect */}
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center transition-all relative"
            style={{
              background: text.trim()
                ? mode === "ai"
                  ? "var(--accent-bark)"
                  : "var(--accent-sage)"
                : "var(--border-warm)",
              color: text.trim() ? "#FBF7F0" : "var(--text-muted)",
              borderRadius: "60% 40% 50% 50% / 55% 45% 55% 45%",
              transform: text.trim() ? "scale(1.05)" : "scale(1)",
              boxShadow: text.trim()
                ? "0 2px 8px rgba(61, 46, 28, 0.25)"
                : "none",
            }}
            title={mode === "ai" ? "播种 · Plant" : "保存 · Keep"}
          >
            <Send size={14} style={{ transform: "rotate(-8deg)" }} />
            {text.trim() && (
              <span
                className="absolute -top-1.5 -right-1"
                style={{ fontSize: 10, lineHeight: 1 }}
              >
                🌱
              </span>
            )}
            {/* Seed burst particles on submit */}
            {burst && (
              <>
                {SEED_PARTICLES.map(({ angle, dist }, i) => {
                  return (
                    <span
                      key={i}
                      className="absolute seed-particle"
                      style={{
                        width: 3,
                        height: 3,
                        borderRadius: "50%",
                        background: mode === "ai" ? "var(--accent-bark)" : "var(--accent-sage)",
                        left: "50%",
                        top: "50%",
                        animation: `seed-burst 0.45s ease-out forwards`,
                        animationDelay: `${i * 0.02}s`,
                        ["--tx" as string]: `${Math.cos(angle * Math.PI / 180) * dist}px`,
                        ["--ty" as string]: `${Math.sin(angle * Math.PI / 180) * dist}px`,
                      } as React.CSSProperties}
                    />
                  );
                })}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
