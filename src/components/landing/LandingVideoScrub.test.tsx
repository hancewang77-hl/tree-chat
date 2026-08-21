import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  LandingVideoScrub,
  TREE_VIDEO_FPS,
  VIDEO_CHAPTER_FRAMES,
  VIDEO_CHAPTER_TIMES,
  nearestChapterTime,
  progressToVideoTime,
  type TreeFlipControl,
} from "./LandingVideoScrub";

function queryVideo(): HTMLVideoElement {
  const video = document.querySelector("video");
  if (!(video instanceof HTMLVideoElement)) {
    throw new Error("expected a <video> element");
  }
  return video;
}

describe("video reference frames", () => {
  test("pins the five SS.FF reference frames at the probed 60fps", () => {
    // 00.15 · 03.15 · 05.08 · 08.15 · 10.02
    expect(VIDEO_CHAPTER_FRAMES).toEqual([15, 195, 308, 495, 602]);
    expect(VIDEO_CHAPTER_TIMES).toEqual(
      VIDEO_CHAPTER_FRAMES.map((frame) => frame / TREE_VIDEO_FPS),
    );
    expect(VIDEO_CHAPTER_TIMES[0]).toBeCloseTo(0.25, 6);
    expect(VIDEO_CHAPTER_TIMES[4]).toBeCloseTo(10.0333, 3);
  });
});

describe("progressToVideoTime", () => {
  test("anchors the five sticky stops on their reference frames", () => {
    expect(progressToVideoTime(0)).toBe(VIDEO_CHAPTER_TIMES[0]);
    expect(progressToVideoTime(0.25)).toBe(VIDEO_CHAPTER_TIMES[1]);
    expect(progressToVideoTime(0.5)).toBe(VIDEO_CHAPTER_TIMES[2]);
    expect(progressToVideoTime(0.75)).toBe(VIDEO_CHAPTER_TIMES[3]);
    expect(progressToVideoTime(1)).toBe(VIDEO_CHAPTER_TIMES[4]);
  });

  test("clamps progress outside the tree span to the edge frames", () => {
    expect(progressToVideoTime(-1)).toBe(VIDEO_CHAPTER_TIMES[0]);
    expect(progressToVideoTime(2)).toBe(VIDEO_CHAPTER_TIMES[4]);
  });

  test("interpolates linearly between neighbouring reference frames", () => {
    expect(progressToVideoTime(0.125)).toBe(
      (VIDEO_CHAPTER_TIMES[0] + VIDEO_CHAPTER_TIMES[1]) / 2,
    );
    expect(progressToVideoTime(0.875)).toBe(
      (VIDEO_CHAPTER_TIMES[3] + VIDEO_CHAPTER_TIMES[4]) / 2,
    );
  });

  test("is monotonic so downward scroll always plays forward", () => {
    let previous = Number.NEGATIVE_INFINITY;
    for (let step = 0; step <= 100; step += 1) {
      const time = progressToVideoTime(step / 100);
      expect(time).toBeGreaterThanOrEqual(previous);
      previous = time;
    }
  });
});

describe("nearestChapterTime", () => {
  test("snaps to the nearest chapter reference frame", () => {
    expect(nearestChapterTime(0.05)).toBe(VIDEO_CHAPTER_TIMES[0]);
    expect(nearestChapterTime(0.4)).toBe(VIDEO_CHAPTER_TIMES[2]);
    expect(nearestChapterTime(0.6)).toBe(VIDEO_CHAPTER_TIMES[2]);
    expect(nearestChapterTime(0.7)).toBe(VIDEO_CHAPTER_TIMES[3]);
    expect(nearestChapterTime(0.95)).toBe(VIDEO_CHAPTER_TIMES[4]);
  });
});

describe("LandingVideoScrub", () => {
  test("registers a render request and scrubs the video on every scroll frame", async () => {
    const progressRef = { current: 0 };
    const requestRenderRef: { current: (() => void) | null } = { current: null };
    const flipRef: { current: TreeFlipControl | null } = { current: null };

    render(
      <LandingVideoScrub
        progressRef={progressRef}
        requestRenderRef={requestRenderRef}
        flipRef={flipRef}
        reducedMotion={false}
      />,
    );

    expect(requestRenderRef.current).not.toBeNull();
    const video = queryVideo();

    progressRef.current = 0.5;
    requestRenderRef.current?.();
    await waitFor(
      () => expect(video.currentTime).toBeCloseTo(VIDEO_CHAPTER_TIMES[2], 2),
      { timeout: 3000 },
    );

    // 进度回落即倒放：currentTime 应随之减小并重新锚定。
    progressRef.current = 0.25;
    requestRenderRef.current?.();
    await waitFor(
      () => expect(video.currentTime).toBeCloseTo(VIDEO_CHAPTER_TIMES[1], 2),
      { timeout: 3000 },
    );
  });

  test("dampens the scrub instead of hard-jumping to the target frame", async () => {
    const progressRef = { current: 0 };
    const requestRenderRef: { current: (() => void) | null } = { current: null };
    const flipRef: { current: TreeFlipControl | null } = { current: null };

    render(
      <LandingVideoScrub
        progressRef={progressRef}
        requestRenderRef={requestRenderRef}
        flipRef={flipRef}
        reducedMotion={false}
      />,
    );
    const video = queryVideo();

    progressRef.current = 1;
    requestRenderRef.current?.();

    // 同步返回后不应立刻跳到目标帧：先走阻尼收敛，再精确锚定。
    expect(video.currentTime).toBeLessThan(VIDEO_CHAPTER_TIMES[4]);
    await waitFor(
      () => expect(video.currentTime).toBeCloseTo(VIDEO_CHAPTER_TIMES[4], 2),
      { timeout: 3000 },
    );
  });

  test("follows scroll directly during a snap animation and resumes damping after it ends", async () => {
    const progressRef = { current: 0 };
    const requestRenderRef: { current: (() => void) | null } = { current: null };
    const flipRef: { current: TreeFlipControl | null } = { current: null };

    render(
      <LandingVideoScrub
        progressRef={progressRef}
        requestRenderRef={requestRenderRef}
        flipRef={flipRef}
        reducedMotion={false}
      />,
    );
    expect(flipRef.current).not.toBeNull();
    const video = queryVideo();

    // 吸附期间：滚动目标直接驱动视频时间（无阻尼滞后）。
    flipRef.current?.begin();
    flipRef.current?.apply(1.5);
    expect(video.currentTime).toBe(1.5);
    progressRef.current = 0.5;
    requestRenderRef.current?.();
    expect(video.currentTime).toBeCloseTo(VIDEO_CHAPTER_TIMES[2], 3);
    expect(flipRef.current?.getCurrentTime()).toBeCloseTo(VIDEO_CHAPTER_TIMES[2], 3);

    // 吸附结束后恢复阻尼跟随并精确锚定到参考帧。
    flipRef.current?.end();
    requestRenderRef.current?.();
    await waitFor(
      () => expect(video.currentTime).toBeCloseTo(VIDEO_CHAPTER_TIMES[2], 2),
      { timeout: 3000 },
    );
  });

  test("caps the seek at the video duration once metadata is available", async () => {
    const progressRef = { current: 1 };
    const requestRenderRef: { current: (() => void) | null } = { current: null };
    const flipRef: { current: TreeFlipControl | null } = { current: null };

    render(
      <LandingVideoScrub
        progressRef={progressRef}
        requestRenderRef={requestRenderRef}
        flipRef={flipRef}
        reducedMotion={false}
      />,
    );
    const video = queryVideo();
    Object.defineProperty(video, "duration", { configurable: true, value: 8 });

    requestRenderRef.current?.();
    await waitFor(() => expect(video.currentTime).toBe(8), { timeout: 3000 });
  });

  test("snaps to chapter reference frames under reduced motion", () => {
    const progressRef = { current: 0.6 };
    const requestRenderRef: { current: (() => void) | null } = { current: null };
    const flipRef: { current: TreeFlipControl | null } = { current: null };

    render(
      <LandingVideoScrub
        progressRef={progressRef}
        requestRenderRef={requestRenderRef}
        flipRef={flipRef}
        reducedMotion
      />,
    );
    const video = queryVideo();

    requestRenderRef.current?.();
    expect(video.currentTime).toBe(nearestChapterTime(0.6));
  });

  test("falls back to the static tree when the video fails to load", () => {
    const progressRef = { current: 0 };
    const requestRenderRef: { current: (() => void) | null } = { current: null };
    const flipRef: { current: TreeFlipControl | null } = { current: null };

    render(
      <LandingVideoScrub
        progressRef={progressRef}
        requestRenderRef={requestRenderRef}
        flipRef={flipRef}
        reducedMotion={false}
      />,
    );
    fireEvent.error(queryVideo());

    expect(document.querySelector("video")).toBeNull();
    expect(document.querySelector(".landing-tree-webgl-fallback")).not.toBeNull();
  });

  test("releases the render request on unmount", () => {
    const progressRef = { current: 0 };
    const requestRenderRef: { current: (() => void) | null } = { current: null };
    const flipRef: { current: TreeFlipControl | null } = { current: null };

    const { unmount } = render(
      <LandingVideoScrub
        progressRef={progressRef}
        requestRenderRef={requestRenderRef}
        flipRef={flipRef}
        reducedMotion={false}
      />,
    );
    expect(requestRenderRef.current).not.toBeNull();

    unmount();
    expect(requestRenderRef.current).toBeNull();
  });
});
