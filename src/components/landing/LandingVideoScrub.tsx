"use client";

import { useEffect, useRef, useState } from "react";

// Seedance 2.5 生成的整段纵向转场视频，用于替代落地页 page 4–8 的
// 3D 代码渲染树。视频静止、静音，只随滚动 scrubbing：滚轮向下，
// currentTime 单调递增（正放）；滚轮向上，currentTime 单调递减（倒放）。
//
// 原片为 4K60 且关键帧稀疏（GOP≈30 帧），逐帧 seek 会卡顿，因此已用
// ffmpeg 重编码为 1080p60 全关键帧（每帧可独立解码）的
// tree-transition-1080p-intra.mp4，原文件 备用网页转场.mp4 保留。
export const TREE_VIDEO_SRC = "/videos/tree-transition-1080p-intra.mp4";

// 视频为 60fps（实测 605 帧 / 10.08s）。参考帧用「秒.帧」(SS.FF) 记法。
export const TREE_VIDEO_FPS = 60;

// 五个 sticky 停靠点（page 4–8）各自对应的参考帧（全局帧号）：
// 00.15 · 03.15 · 05.08 · 08.15 · 10.02
export const VIDEO_CHAPTER_FRAMES = [
  0 * TREE_VIDEO_FPS + 15,
  3 * TREE_VIDEO_FPS + 15,
  5 * TREE_VIDEO_FPS + 8,
  8 * TREE_VIDEO_FPS + 15,
  10 * TREE_VIDEO_FPS + 2,
];

// 换算成秒，供 video.currentTime 直接使用。
export const VIDEO_CHAPTER_TIMES = VIDEO_CHAPTER_FRAMES.map(
  (frame) => frame / TREE_VIDEO_FPS,
);

// 把整段滚动进度 [0, 1] 分段线性映射到五个参考帧时刻。五个停靠点在
// 滚动距离上等距，因此 chapter 切换瞬间（progress = 0 / 0.25 / 0.5 /
// 0.75 / 1）恰好落在对应参考帧上，中间段按比例插值。
export function progressToVideoTime(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  const scaled = clamped * (VIDEO_CHAPTER_TIMES.length - 1);
  const segment = Math.min(VIDEO_CHAPTER_TIMES.length - 2, Math.floor(scaled));
  const local = scaled - segment;
  const from = VIDEO_CHAPTER_TIMES[segment];
  const to = VIDEO_CHAPTER_TIMES[segment + 1];
  return from + (to - from) * local;
}

// prefers-reduced-motion 下不做连续 scrubbing，只吸附到最近的章节参考帧。
export function nearestChapterTime(progress: number): number {
  const index = Math.round(
    Math.min(1, Math.max(0, progress)) * (VIDEO_CHAPTER_TIMES.length - 1),
  );
  return VIDEO_CHAPTER_TIMES[index];
}

// 平滑参数：
// - seek 限频 25 次/秒，给解码器留出完成上一次 seek 的时间；
// - 阻尼收敛（每帧向目标走 30% 的剩余距离），滚动急停时不会硬跳；
// - 误差小于 1 帧时直接精确锚定，保证停靠点的参考帧分毫不差。
const SEEK_INTERVAL_MS = 40;
const DAMPING = 0.3;
const MIN_SEEK_STEP = 1 / TREE_VIDEO_FPS;

type RenderRequestRef = { current: (() => void) | null };

// 翻页动画控制：LandingPage 在翻页期间直接驱动视频时间，与页面滚动
// 共用同一缓动曲线，视频落点精确停在五个参考帧上。
export type TreeFlipControl = {
  begin: () => void;
  apply: (time: number) => void;
  end: () => void;
  getCurrentTime: () => number;
};

export function LandingVideoScrub({
  progressRef,
  requestRenderRef,
  flipRef,
  reducedMotion,
}: {
  progressRef: { current: number };
  requestRenderRef: RenderRequestRef;
  flipRef: { current: TreeFlipControl | null };
  reducedMotion: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const targetTimeRef = useRef(VIDEO_CHAPTER_TIMES[0]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId = 0;
    let lastSeekAt = 0;
    let applied = Number.isFinite(video.currentTime)
      ? video.currentTime
      : VIDEO_CHAPTER_TIMES[0];

    const seekTo = (time: number) => {
      const current = videoRef.current;
      if (!current) return;
      const cap =
        Number.isFinite(current.duration) && current.duration > 0
          ? Math.min(time, current.duration)
          : time;
      if (Math.abs(current.currentTime - cap) > 1e-3) {
        current.currentTime = cap;
      }
    };

    // 翻页动画期间由 LandingPage 直接驱动视频时间：跳过阻尼跟随，
    // 页面滚动与视频过渡共用同一缓动曲线，落点精确停在参考帧上。
    let flipActive = false;
    flipRef.current = {
      begin: () => {
        flipActive = true;
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      },
      apply: (time: number) => {
        targetTimeRef.current = time;
        applied = time;
        seekTo(time);
      },
      end: () => {
        flipActive = false;
      },
      getCurrentTime: () => applied,
    };

    // 阻尼跟随循环：持续向 targetTimeRef 收敛，停稳后精确锚定并退出。
    const tick = () => {
      rafId = 0;
      const target = targetTimeRef.current;
      const diff = target - applied;
      if (Math.abs(diff) < MIN_SEEK_STEP) {
        applied = target;
        seekTo(target);
        return;
      }
      const now = performance.now();
      if (now - lastSeekAt >= SEEK_INTERVAL_MS) {
        lastSeekAt = now;
        applied += diff * DAMPING;
        seekTo(applied);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    const requestRender = () => {
      const progress = progressRef.current;
      const target = reducedMotion
        ? nearestChapterTime(progress)
        : progressToVideoTime(progress);
      targetTimeRef.current = target;
      if (flipActive || reducedMotion) {
        // 吸附/翻页期间：直接 seek 到滚动位置对应的视频时间（跳过阻尼），
        // 与浏览器原生平滑滚动的缓动曲线完全同步。
        applied = target;
        seekTo(target);
        return;
      }
      if (!rafId) rafId = window.requestAnimationFrame(tick);
    };
    requestRenderRef.current = requestRender;

    // 元数据就绪后直接锚定首帧参考位置，避免大视频预加载期间黑屏。
    const handleLoadedMetadata = () => {
      applied = targetTimeRef.current;
      seekTo(applied);
      if (!reducedMotion && !flipActive && !rafId) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      if (requestRenderRef.current === requestRender) {
        requestRenderRef.current = null;
      }
      flipRef.current = null;
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [progressRef, requestRenderRef, flipRef, reducedMotion]);

  const fallback = (
    <div
      className="landing-tree-webgl-fallback"
      role="img"
      aria-label="Tree Chat 转场视频的静态备选背景"
    >
      <span className="landing-tree-webgl-fallback__canopy" aria-hidden="true" />
      <span className="landing-tree-webgl-fallback__trunk" aria-hidden="true" />
      <span className="landing-tree-webgl-fallback__roots" aria-hidden="true" />
    </div>
  );

  return (
    <div className="landing-tree-canvas landing-tree-video-shell">
      {failed ? (
        fallback
      ) : (
        <video
          ref={videoRef}
          className="landing-tree-video"
          src={TREE_VIDEO_SRC}
          preload="auto"
          muted
          playsInline
          disablePictureInPicture
          tabIndex={-1}
          aria-hidden="true"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
