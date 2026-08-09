import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const createCompletion = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createCompletion } };
  },
}));

import { POST } from "@/app/api/auxo/route";

const originalApiKey = process.env.DEEPSEEK_API_KEY;

function request(body: unknown, ip: string = crypto.randomUUID()) {
  return new Request("http://localhost/api/auxo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": ip,
    },
    body: JSON.stringify(body),
  });
}

function validBody() {
  return { rootTask: "制定发布计划", nutrientChunks: [], sourceUnits: [] };
}

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = "test-key";
  createCompletion.mockReset();
});

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = originalApiKey;
});

describe("POST /api/auxo", () => {
  test("requires application/json and valid bounded input", async () => {
    const wrongType = await POST(new Request("http://localhost/api/auxo", {
      method: "POST",
      headers: { "Content-Type": "text/plain", "x-real-ip": crypto.randomUUID() },
      body: "{}",
    }));
    expect(wrongType.status).toBe(415);

    const badJson = await POST(new Request("http://localhost/api/auxo", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": crypto.randomUUID() },
      body: "not-json",
    }));
    expect(badJson.status).toBe(400);

    const emptyRoot = await POST(request({ rootTask: "", nutrientChunks: [] }));
    expect(emptyRoot.status).toBe(400);

    const oversized = await POST(new Request("http://localhost/api/auxo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "900000",
        "x-real-ip": crypto.randomUUID(),
      },
      body: "{}",
    }));
    expect(oversized.status).toBe(413);
    expect(createCompletion).not.toHaveBeenCalled();
  });

  test("uses the fixed model and returns a normalized validated plan", async () => {
    createCompletion.mockResolvedValue({
      model: "deepseek-v4-flash",
      choices: [
        {
          message: {
            content: JSON.stringify({
              version: 1,
              nodes: [
                {
                  planId: "task-1",
                  parentPlanId: "root",
                  nodeRole: "task",
                  title: "确认发布范围",
                  order: 1,
                  sourceUnitId: null,
                },
              ],
            }),
          },
        },
      ],
    });

    const response = await POST(request({ ...validBody(), model: "attacker-model" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plan).toMatchObject({
      version: 1,
      model: "deepseek-v4-flash",
      nodes: [{ planId: "task-1", nodeRole: "task" }],
    });
    expect(createCompletion).toHaveBeenCalledOnce();
    expect(createCompletion.mock.calls[0][0].model).toBe("deepseek-v4-flash");
    expect(createCompletion.mock.calls[0][0].thinking).toEqual({ type: "disabled" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("maps invalid model output to 502 without returning partial nodes", async () => {
    createCompletion.mockResolvedValue({
      model: "deepseek-v4-flash",
      choices: [{ message: { content: '{"version":1,"nodes":[]}' } }],
    });

    const response = await POST(request(validBody()));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.plan).toBeUndefined();
    expect(body.error).toContain("没有创建任何节点");
  });

  test("rejects a model plan that omits a deterministic source unit", async () => {
    createCompletion.mockResolvedValue({
      model: "deepseek-v4-flash",
      choices: [{
        message: {
          content: JSON.stringify({
            version: 1,
            nodes: [{
              planId: "task-1",
              parentPlanId: "root",
              nodeRole: "task",
              title: "发布任务",
              order: 1,
              sourceUnitId: null,
            }],
          }),
        },
      }],
    });
    const rootTask = "1. 发布正式版本。";
    const response = await POST(request({
      rootTask,
      nutrientChunks: [],
      sourceUnits: [{
        unitId: "source-001",
        kind: "root",
        text: rootTask,
        offset: 0,
        order: 1,
      }],
    }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("SOURCE_UNIT_OMITTED");
    expect(body.plan).toBeUndefined();
  });

  test("does not call the provider when the server key is absent", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const response = await POST(request(validBody()));

    expect(response.status).toBe(500);
    expect(createCompletion).not.toHaveBeenCalled();
  });
});
