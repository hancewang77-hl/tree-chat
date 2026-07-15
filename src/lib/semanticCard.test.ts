import { describe, expect, test } from "vitest";
import {
  createRootSemanticCard,
  isUsableSemanticCard,
  parseSemanticCard,
  semanticCardToText,
} from "./semanticCard";

describe("semantic cards", () => {
  test("解析并规范化 DeepSeek JSON 输出", () => {
    const card = parseSemanticCard(
      "```json\n{\"facts\":[\"  事实 A  \",\"事实 A\"],\"constraints\":[\"约束 B\"],\"assumptions\":[],\"decisions\":[],\"rejected\":[],\"openQuestions\":[\"待确认 C\"]}\n```",
      { generatedAt: 10, model: "deepseek-chat" },
    );

    expect(card.facts).toEqual(["事实 A"]);
    expect(card.constraints).toEqual(["约束 B"]);
    expect(card.openQuestions).toEqual(["待确认 C"]);
    expect(card.generatedAt).toBe(10);
    expect(isUsableSemanticCard(card)).toBe(true);
    expect(semanticCardToText(card)).toContain("事实：事实 A");
  });

  test("拒绝空卡片和无效 JSON", () => {
    expect(() =>
      parseSemanticCard(
        '{"facts":[],"constraints":[],"assumptions":[],"decisions":[],"rejected":[],"openQuestions":[]}',
        { generatedAt: 1, model: "deepseek-chat" },
      ),
    ).toThrow("语义卡片为空");
    expect(() =>
      parseSemanticCard("not-json", { generatedAt: 1, model: "deepseek-chat" }),
    ).toThrow("无效 JSON");
  });

  test("根节点卡片由根任务本地生成，不调用模型", () => {
    const card = createRootSemanticCard("评估租房方案", 20);

    expect(card.model).toBe("local-root-v1");
    expect(card.openQuestions).toEqual(["评估租房方案"]);
    expect(card.generatedAt).toBe(20);
  });
});
