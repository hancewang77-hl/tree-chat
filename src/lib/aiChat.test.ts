import { afterEach, describe, expect, test, vi } from "vitest";
import { requestChatCompletion, requestSemanticCard } from "./aiChat";
import { jsonResponse, streamingResponse } from "@/src/test/mocks/fetch";
import { testSemanticCard } from "@/src/test/fixtures/tree";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI chat client", () => {
  test("posts messages to the streaming chat route and reports accumulated text", async () => {
    const fetchMock = vi.fn(async () => streamingResponse(["甲", "乙"]));
    vi.stubGlobal("fetch", fetchMock);
    const snapshots: string[] = [];
    const signal = new AbortController().signal;

    const result = await requestChatCompletion(
      [{ role: "user", content: "继续" }],
      (text) => snapshots.push(text),
      signal,
    );

    expect(result).toBe("甲乙");
    expect(snapshots).toEqual(["甲", "甲乙"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "继续" }], stream: true }),
      signal,
    });
  });

  test("turns HTTP failures into user-visible errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));

    await expect(
      requestChatCompletion([{ role: "user", content: "继续" }], () => {}, new AbortController().signal),
    ).rejects.toThrow("请求失败：502 bad gateway");
  });

  test("requests and validates semantic cards", async () => {
    const semanticCard = testSemanticCard("结构化事实");
    const fetchMock = vi.fn(async () => jsonResponse({ semanticCard }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestSemanticCard("问题", "回答", 1_000)).resolves.toEqual(semanticCard);
    expect(fetchMock).toHaveBeenCalledWith("/api/structure", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "问题", response: "回答" }),
    }));
  });

  test("rejects invalid semantic-card responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ semanticCard: { facts: [] } })));

    await expect(requestSemanticCard("问题", "回答", 1_000)).rejects.toThrow("无效卡片");
  });
});
