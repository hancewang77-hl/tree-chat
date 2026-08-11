import { describe, expect, test } from "vitest";
import {
  centerViewportOn,
  preserveViewportCenter,
  pointIntersectsBounds,
  viewportWorldBounds,
  worldPointToPixels,
  zoomPercentToScale,
} from "./viewport2d";

describe("2D viewport geometry", () => {
  test("maps tree world coordinates into CSS coordinates", () => {
    expect(worldPointToPixels({ x: 2, y: -3 })).toEqual({ x: 210, y: 315 });
  });

  test("uses the legacy orthographic zoom as a direct visual scale", () => {
    expect(zoomPercentToScale(105)).toBe(1);
    expect(zoomPercentToScale(210)).toBe(2);
  });

  test("centers a selected point without camera rotation state", () => {
    expect(
      centerViewportOn({ x: 300, y: 200 }, { width: 1000, height: 700 }, 1),
    ).toEqual({ x: 200, y: 150, scale: 1 });
  });

  test("preserves the visible center while zooming", () => {
    const next = preserveViewportCenter(
      { x: 100, y: 50, scale: 1 },
      { width: 1000, height: 700 },
      2,
    );
    expect(next).toEqual({ x: -300, y: -250, scale: 2 });
  });

  test("computes an overscanned world viewport for virtualization", () => {
    expect(
      viewportWorldBounds(
        { x: 100, y: 50, scale: 2 },
        { width: 1000, height: 700 },
        0.5,
      ),
    ).toEqual({ left: -300, right: 700, top: -200, bottom: 500 });
  });

  test("keeps cards whose bounds overlap the virtual viewport", () => {
    const bounds = { left: 0, right: 100, top: 0, bottom: 100 };
    expect(pointIntersectsBounds({ x: 110, y: 50 }, bounds, 12)).toBe(true);
    expect(pointIntersectsBounds({ x: 130, y: 50 }, bounds, 12)).toBe(false);
  });
});
