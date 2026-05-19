import { describe, expect, test } from "vitest";
import {
  buildNutrientContext,
  extractNutrientFromFile,
  summarizeNutrientText,
} from "./nutrients";
import type { NutrientItem } from "@/src/types/tree";

function nutrient(overrides: Partial<NutrientItem>): NutrientItem {
  return {
    id: "n-1",
    name: "notes.md",
    mimeType: "text/markdown",
    size: 32,
    kind: "text",
    createdAt: 1,
    extractionStatus: "ready",
    extractedText: "alpha beta gamma",
    excerpt: "alpha beta gamma",
    extractedCharCount: 16,
    ...overrides,
  };
}

describe("nutrients", () => {
  test("buildNutrientContext includes active ready documents and respects the character budget", () => {
    const context = buildNutrientContext(
      [
        nutrient({ id: "a", name: "a.md", extractedText: "A".repeat(16_000) }),
        nutrient({ id: "b", name: "b.md", extractedText: "B".repeat(16_000) }),
        nutrient({ id: "image", name: "photo.png", extractionStatus: "unsupported", extractedText: "" }),
      ],
      ["a", "b", "image"],
      20_000,
    );

    expect(context).toContain("Nutrients · 养分上下文");
    expect(context).toContain("a.md");
    expect(context).toContain("b.md");
    expect(context).not.toContain("photo.png");
    expect(context.length).toBeLessThanOrEqual(21_000);
  });

  test("extractNutrientFromFile marks text files ready", async () => {
    const file = new File(["hello nutrient"], "notes.txt", { type: "text/plain" });

    const item = await extractNutrientFromFile(file);

    expect(item.kind).toBe("text");
    expect(item.extractionStatus).toBe("ready");
    expect(item.extractedText).toBe("hello nutrient");
    expect(item.excerpt).toBe("hello nutrient");
  });

  test("extractNutrientFromFile preserves image metadata but does not claim AI-readable text", async () => {
    const file = new File(["fake"], "photo.png", { type: "image/png" });

    const item = await extractNutrientFromFile(file);

    expect(item.kind).toBe("image");
    expect(item.extractionStatus).toBe("unsupported");
    expect(item.extractedText).toBe("");
  });

  test("summarizeNutrientText compacts whitespace and limits excerpts", () => {
    expect(summarizeNutrientText("a\n\n  b\tc  ", 5)).toBe("a b c");
    expect(summarizeNutrientText("123456789", 5)).toBe("1234…");
  });
});
