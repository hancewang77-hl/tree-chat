import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "@/app/api/auxo/route";

const originalRuntimeUrl = process.env.TREECHAT_RUNTIME_URL;
const originalRuntimeModel = process.env.TREECHAT_DEEPSEEK_MODEL;

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

function validRequest() {
  return { rootTask: "制定发布计划", nutrientChunks: [], sourceUnits: [] };
}

function validEnvelope(requestBody: unknown = validRequest()) {
  return {
    sessionId: "project-1",
    rootNodeId: "root-1",
    request: requestBody,
  };
}

function runtimeTask(
  state: "queued" | "completed" | "failed" | "cancelled",
  result: string | null = null,
) {
  return {
    task_id: "task-auxo-1",
    session_id: "project-1",
    node_id: "auxo-node-1",
    task_type: "chat_generation",
    priority: 2,
    state,
    result,
    error: state === "failed" ? "provider unavailable" : null,
    error_type: state === "failed" ? "provider" : null,
  };
}

function validPlanJson() {
  return JSON.stringify({
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
  });
}

beforeEach(() => {
  process.env.TREECHAT_RUNTIME_URL = "http://runtime.test:8000";
  delete process.env.TREECHAT_DEEPSEEK_MODEL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalRuntimeUrl === undefined) delete process.env.TREECHAT_RUNTIME_URL;
  else process.env.TREECHAT_RUNTIME_URL = originalRuntimeUrl;
  if (originalRuntimeModel === undefined) delete process.env.TREECHAT_DEEPSEEK_MODEL;
  else process.env.TREECHAT_DEEPSEEK_MODEL = originalRuntimeModel;
});

describe("POST /api/auxo", () => {
  test("requires application/json and valid bounded input", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

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

    const emptyRoot = await POST(request(validEnvelope({
      rootTask: "",
      nutrientChunks: [],
      sourceUnits: [],
    })));
    expect(emptyRoot.status).toBe(400);

    const missingTopology = await POST(request(validRequest()));
    expect(missingTopology.status).toBe(400);

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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("submits a background Runtime task and returns a validated plan", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v1/tasks") && init?.method === "POST") {
        return Response.json({ task: runtimeTask("queued") }, { status: 202 });
      }
      if (url.endsWith("/v1/tasks/task-auxo-1") && init?.method === "GET") {
        return Response.json(runtimeTask("completed", validPlanJson()));
      }
      throw new Error(`Unexpected Runtime request: ${init?.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(validEnvelope()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plan).toMatchObject({
      version: 1,
      model: "deepseek-chat",
      nodes: [{ planId: "task-1", nodeRole: "task" }],
    });
    const [, createInit] = fetchMock.mock.calls[0];
    const taskBody = JSON.parse(String(createInit?.body));
    expect(taskBody).toMatchObject({
      session_id: "project-1",
      task_type: "chat_generation",
      priority: 2,
      root_node_id: "root-1",
    });
    expect(taskBody.node_id).toMatch(/^auxo-/);
    expect(taskBody.ancestor_node_ids).toEqual(["root-1", taskBody.node_id]);
    expect(taskBody.messages[0]).toMatchObject({ role: "system" });
    expect(JSON.parse(taskBody.messages[1].content)).toEqual(validRequest());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("maps invalid Runtime output to 502 without returning partial nodes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      task: runtimeTask("completed", '{"version":1,"nodes":[]}'),
    }, { status: 202 })));

    const response = await POST(request(validEnvelope()));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.plan).toBeUndefined();
    expect(body.error).toContain("没有创建任何节点");
  });

  test("rejects a Runtime plan that omits a deterministic source unit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      task: runtimeTask("completed", validPlanJson()),
    }, { status: 202 })));
    const rootTask = "1. 发布正式版本。";
    const response = await POST(request(validEnvelope({
      rootTask,
      nutrientChunks: [],
      sourceUnits: [{
        unitId: "source-001",
        kind: "root",
        text: rootTask,
        offset: 0,
        order: 1,
      }],
    })));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("SOURCE_UNIT_OMITTED");
    expect(body.plan).toBeUndefined();
  });

  test("maps a failed Runtime task to 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      task: runtimeTask("failed"),
    }, { status: 202 })));

    const response = await POST(request(validEnvelope()));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("provider unavailable");
  });
});
