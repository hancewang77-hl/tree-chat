import { describe, expect, test, vi } from "vitest";
import {
  clamp,
  drawWrappedText,
  normalizeDuplicateKey,
  roundRect,
  truncateText,
} from "./utils";

describe("canvas and numeric utilities", () => {
  test("clamps values into the inclusive range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  test("truncates only text over the limit", () => {
    expect(truncateText("abc", 3)).toBe("abc");
    expect(truncateText("abcd", 3)).toBe("abc…");
  });

  test("normalizeDuplicateKey folds NFKC, whitespace, and case", () => {
    // Fullwidth letters fold via NFKC; the newline/tab between C and D collapses to one space.
    expect(normalizeDuplicateKey("  ＡｂＣ\n\tＤ  ")).toBe("abc d");
    expect(normalizeDuplicateKey("Foo  Bar")).toBe("foo bar");
    expect(normalizeDuplicateKey("FOO BAR")).toBe(normalizeDuplicateKey("foo   bar"));
  });

  test("roundRect follows the expected canvas path and fill/stroke flags", () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    roundRect(ctx, 10, 20, 30, 40, 5, true, false);

    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.moveTo).toHaveBeenCalledWith(15, 20);
    expect(ctx.quadraticCurveTo).toHaveBeenCalledTimes(4);
    expect(ctx.closePath).toHaveBeenCalledOnce();
    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  test("drawWrappedText wraps by measured width and respects max lines", () => {
    const fillText = vi.fn();
    const ctx = {
      measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
      fillText,
    } as unknown as CanvasRenderingContext2D;

    drawWrappedText(ctx, "abcdef", 1, 2, 25, 12, 2);

    expect(fillText).toHaveBeenCalledTimes(2);
    expect(fillText).toHaveBeenNthCalledWith(1, "ab", 1, 2);
    expect(fillText).toHaveBeenNthCalledWith(2, "c", 1, 14);
  });
});
