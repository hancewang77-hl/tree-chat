import { describe, expect, test } from "vitest";
import {
  ROOT_ONBOARDING_RESPONSE,
  getExportableNodeBody,
  isRootOnboardingResponse,
} from "./rootNodeContent";

describe("rootNodeContent", () => {
  test("识别根节点默认引导语", () => {
    expect(isRootOnboardingResponse(ROOT_ONBOARDING_RESPONSE)).toBe(true);
    expect(isRootOnboardingResponse(`  ${ROOT_ONBOARDING_RESPONSE}  `)).toBe(true);
    expect(isRootOnboardingResponse("用户自定义根回答")).toBe(false);
  });

  test("根节点引导语不会进入导出正文", () => {
    expect(
      getExportableNodeBody({
        kind: "root",
        prompt: "我的思维之树",
        response: ROOT_ONBOARDING_RESPONSE,
      }),
    ).toBe("");

    expect(
      getExportableNodeBody({
        kind: "root",
        prompt: "机器学习漫谈",
        response: "用户后来写下的根节点说明",
      }),
    ).toBe("用户后来写下的根节点说明");
  });

  test("分支与叶片仍导出真实正文", () => {
    expect(
      getExportableNodeBody({
        kind: "branch",
        prompt: "监督学习",
        response: "带标签的数据。",
      }),
    ).toBe("带标签的数据。");

    expect(
      getExportableNodeBody({
        kind: "leaf",
        prompt: "备忘",
        response: "叶片内容",
      }),
    ).toBe("叶片内容");
  });
});
