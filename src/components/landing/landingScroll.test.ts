import { describe, expect, test } from "vitest";
import { resolveTreeScrollState } from "./landingScroll";

const STOP_TOPS = [3240, 4320, 5400, 6480, 7560];

describe("resolveTreeScrollState", () => {
  test.each([
    [3240, 0, 0],
    [4320, 1, 0.25],
    [5400, 2, 0.5],
    [6480, 3, 0.75],
    [7560, 4, 1],
  ])(
    "maps the real stop at %i to chapter %i and progress %f",
    (scrollTop, chapter, progress) => {
      expect(resolveTreeScrollState(scrollTop, STOP_TOPS)).toEqual({ chapter, progress });
    },
  );

  test.each([
    [4319, 0],
    [5399, 1],
    [6479, 2],
    [7559, 3],
  ])("keeps %i in chapter %i until the next stop is reached", (scrollTop, chapter) => {
    expect(resolveTreeScrollState(scrollTop, STOP_TOPS).chapter).toBe(chapter);
  });

  test.each([
    [3780, 0, 0.125],
    [4860, 1, 0.375],
    [5940, 2, 0.625],
    [7020, 3, 0.875],
  ])("resolves midpoint %i within chapter %i", (scrollTop, chapter, progress) => {
    expect(resolveTreeScrollState(scrollTop, STOP_TOPS)).toEqual({ chapter, progress });
  });

  test.each([
    [3239, { chapter: 0, progress: 0 }],
    [7561, { chapter: 4, progress: 1 }],
  ])("clamps scroll position %i to the stop range", (scrollTop, expected) => {
    expect(resolveTreeScrollState(scrollTop, STOP_TOPS)).toEqual(expected);
  });

  test.each([[[]], [[3240]]])("returns a safe initial state for %j", (stopTops) => {
    expect(resolveTreeScrollState(4320, stopTops)).toEqual({ chapter: 0, progress: 0 });
  });
});
