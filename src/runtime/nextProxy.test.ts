import { afterEach, describe, expect, test, vi } from "vitest";
import {
  proxyLegacyChat,
  proxyLegacyStructure,
  runRuntimeTask,
} from "./nextProxy";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("legacy Next routes", () => {
  test("forward chat to the authoritative Runtime task endpoint", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) => {
        void _input;
        void _init;
        return new Response("answer", {
          headers: { "X-Task-Id": "task-server-chat" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyLegacyChat(
      jsonRequest({
        session_id: "session-1",
        node_id: "node-1",
        messages: [{ role: "user", content: "question" }],
      }),
    );
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(url).toBe("http://127.0.0.1:8000/v1/tasks");
    expect(body).toMatchObject({
      session_id: "session-1",
      node_id: "node-1",
      task_type: "chat_generation",
      priority: 0,
    });
    expect(response.headers.get("X-Task-Id")).toBe("task-server-chat");
  });

  test("forward semantic structure to the authoritative Runtime task endpoint", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) => {
        void _input;
        void _init;
        return Response.json(
          { task: { task_id: "task-server-structure" } },
          { headers: { "X-Task-Id": "task-server-structure" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await proxyLegacyStructure(
      jsonRequest({
        session_id: "session-1",
        node_id: "node-1",
        prompt: "question",
        response: "answer",
      }),
    );
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body).toMatchObject({
      session_id: "session-1",
      node_id: "node-1",
      task_type: "semantic_structure",
      priority: 2,
      prompt: "question",
      response: "answer",
    });
  });

  test("cancels a submitted non-streaming task when its caller aborts", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method} ${url}`);
      if (url.endsWith("/v1/tasks") && init?.method === "POST") {
        return Response.json({
          task: { task_id: "task-auxo", state: "queued", result: null },
        }, { status: 202 });
      }
      if (url.endsWith("/cancel") && init?.method === "POST") {
        return Response.json({
          task: { task_id: "task-auxo", state: "cancelled", result: null },
        });
      }
      return Response.json({ task_id: "task-auxo", state: "queued", result: null });
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const pending = runRuntimeTask(
      { task_type: "chat_generation" },
      controller.signal,
      { pollIntervalMs: 1 },
    );
    setTimeout(() => controller.abort(), 5);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(calls.some((call) => call.endsWith("/v1/tasks/task-auxo/cancel"))).toBe(true);
  });
});

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/legacy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
