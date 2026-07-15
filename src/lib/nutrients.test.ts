import { describe, expect, test } from "vitest";
import {
  buildNutrientContext,
  chunkNutrientText,
  extractNutrientFromFile,
  selectRelevantNutrientChunks,
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

  test("资料分块编号稳定，相关性选择不再只取文件开头", () => {
    const item = nutrient({
      id: "long",
      name: "long.md",
      extractedText: `${"A".repeat(1590)}\n\n目标片段：租房通勤时间是 25 分钟。`,
    });

    const chunks = chunkNutrientText(item);
    const selected = selectRelevantNutrientChunks(
      [item],
      ["long"],
      "请分析租房通勤时间",
      500,
      2,
    );

    expect(chunks.map((chunk) => chunk.chunkId)).toEqual(["chunk-001", "chunk-002"]);
    expect(selected).toHaveLength(1);
    expect(selected[0].chunkId).toBe("chunk-002");
    expect(selected[0].text).toContain("25 分钟");
  });

  test("未启用或不可读资料不会进入相关片段", () => {
    const disabled = nutrient({ id: "disabled", extractedText: "关键词" });
    const unsupported = nutrient({
      id: "unsupported",
      extractionStatus: "unsupported",
      extractedText: "关键词",
    });

    expect(
      selectRelevantNutrientChunks([disabled, unsupported], ["unsupported"], "关键词"),
    ).toEqual([]);
  });
});
