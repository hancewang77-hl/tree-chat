import { describe, expect, test, vi } from "vitest";
import { compileContext } from "@/src/lib/contextCompiler";
import { getBranchTopologyForChild } from "@/src/lib/branchTopology";
import type { Project } from "@/src/types/tree";
import {
  cancelRuntimeTask,
  retryRuntimeTask,
  submitRuntimeChat,
  submitRuntimeStructure,
} from "./client";
import type { GenerationTask } from "./task";

function serverTask(
  nodeId: string,
  taskType: GenerationTask["task_type"] = "chat_generation",
  topBranchId: string | null = null,
): GenerationTask {
  return {
    task_id: `task-${nodeId}`,
    session_id: "project-1",
    node_id: nodeId,
    task_type: taskType,
    priority: taskType === "chat_generation" ? 0 : 2,
    state: "queued",
    created_at: 1_000,
    enqueue_seq: 1,
    enqueued_at: 1_001,
    started_at: null,
    first_token_at: null,
    finished_at: null,
    error: null,
    error_type: null,
    response_latency_ms: null,
    provider_request_id: null,
    input_tokens: null,
    output_tokens: null,
    prompt_cache_hit_tokens: null,
    prompt_cache_miss_tokens: null,
    provider_ttft_ms: null,
    result: null,
    timeout_limit_seconds: 120,
    elapsed_ms: null,
    retry_of_task_id: null,
    attempt: 1,
    top_branch_id: topBranchId,
    affinity_key: null,
    affinity_worker: null,
    worker_id: null,
    router_mode: null,
    routing_decision_at: null,
    decision_reason: null,
    rerouted: false,
    reroute_reason: null,
  };
}

describe("FastAPI runtime task submission", () => {
  test("passes compiler messages unchanged and accepts only the server task id", async () => {
    const project = branchProject();
    const compiled = compileContext({
      project,
      selectedNodeId: "b",
      prompt: "continue B",
      model: "deepseek-chat",
      compiledAt: 1,
    });
    let posted: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_input, init?: RequestInit) => {
      posted = JSON.parse(String(init?.body));
      return Response.json({ task: serverTask("node-new", "chat_generation", "b") }, { status: 202 });
    }));

    const task = await submitRuntimeChat({
      sessionId: "project-1",
      nodeId: "node-new",
      priority: 0,
      messages: compiled.messages,
      topology: getBranchTopologyForChild(
        project.nodes,
        project.rootNodeId,
        "b",
        "node-new",
      ),
      signal: new AbortController().signal,
      runtimeUrl: "http://runtime.test/",
    });

    expect(task.task_id).toBe("task-node-new");
    expect(posted).toMatchObject({
      session_id: "project-1",
      node_id: "node-new",
      task_type: "chat_generation",
      priority: 0,
      root_node_id: "root",
      ancestor_node_ids: ["root", "b", "node-new"],
      messages: compiled.messages,
    });
    expect(posted).not.toHaveProperty("task_id");
    expect(posted).not.toHaveProperty("top_branch_id");
    const payload = JSON.stringify(posted);
    expect(payload).toContain("ROOT_CONTEXT_001");
    expect(payload).toContain("BETA_294");
    expect(payload).not.toContain("ALPHA_731");
    vi.unstubAllGlobals();
  });

  test("rejects a server top_branch_id that disagrees with real topology", async () => {
    const project = branchProject();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { task: serverTask("node-new", "chat_generation", "a") },
          { status: 202 },
        ),
      ),
    );

    await expect(
      submitRuntimeChat({
        sessionId: project.id,
        nodeId: "node-new",
        priority: 0,
        messages: [{ role: "user", content: "continue B" }],
        topology: getBranchTopologyForChild(
          project.nodes,
          project.rootNodeId,
          "b",
          "node-new",
        ),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("top_branch_id 与真实树拓扑不一致");
    vi.unstubAllGlobals();
  });

  test("semantic structure submission returns a queued server task without fake TTFT", async () => {
    const task = serverTask("node-new", "semantic_structure", "b");
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
      void _input;
      void _init;
      return Response.json({ task }, { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitRuntimeStructure({
      sessionId: "project-1",
      nodeId: "node-new",
      priority: 2,
      prompt: "question",
      response: "answer",
      topology: {
        rootNodeId: "root",
        ancestorNodeIds: ["root", "b", "node-new"],
        topBranchId: "b",
      },
      signal: new AbortController().signal,
      runtimeUrl: "http://runtime.test",
    });

    expect(result).toEqual(task);
    expect(result.first_token_at).toBeNull();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).not.toHaveProperty("task_id");
    vi.unstubAllGlobals();
  });

  test("submits two compiled branches concurrently without payload cross-talk", async () => {
    const project = branchProject();
    const compiledA = compileContext({
      project,
      selectedNodeId: "a",
      prompt: "continue A",
      model: "deepseek-chat",
      compiledAt: 2,
    });
    const compiledB = compileContext({
      project,
      selectedNodeId: "b",
      prompt: "continue B",
      model: "deepseek-chat",
      compiledAt: 3,
    });
    const postedByNode = new Map<string, Record<string, unknown>>();
    vi.stubGlobal("fetch", vi.fn(async (_input, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const nodeId = String(body.node_id);
      postedByNode.set(nodeId, body);
      await Promise.resolve();
      const path = body.ancestor_node_ids as string[];
      return Response.json(
        { task: serverTask(nodeId, "chat_generation", path[1]) },
        { status: 202 },
      );
    }));

    const [taskA, taskB] = await Promise.all([
      submitRuntimeChat({
        sessionId: "project-1", nodeId: "output-a", priority: 0,
        messages: compiledA.messages,
        topology: getBranchTopologyForChild(
          project.nodes, project.rootNodeId, "a", "output-a",
        ),
        signal: new AbortController().signal,
      }),
      submitRuntimeChat({
        sessionId: "project-1", nodeId: "output-b", priority: 0,
        messages: compiledB.messages,
        topology: getBranchTopologyForChild(
          project.nodes, project.rootNodeId, "b", "output-b",
        ),
        signal: new AbortController().signal,
      }),
    ]);

    expect(taskA.task_id).toBe("task-output-a");
    expect(taskB.task_id).toBe("task-output-b");
    const payloadA = JSON.stringify(postedByNode.get("output-a"));
    const payloadB = JSON.stringify(postedByNode.get("output-b"));
    expect(payloadA).toContain("ALPHA_731");
    expect(payloadA).not.toContain("BETA_294");
    expect(payloadB).toContain("BETA_294");
    expect(payloadB).not.toContain("ALPHA_731");
    vi.unstubAllGlobals();
  });

  test("uses authoritative server endpoints for cancel and retry", async () => {
    const cancelled = { ...serverTask("node-new"), state: "cancelled" as const };
    const retried = {
      ...serverTask("node-new"),
      task_id: "task-retry",
      retry_of_task_id: cancelled.task_id,
      attempt: 2,
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return Response.json(
        { task: url.endsWith("/cancel") ? cancelled : retried },
        { status: url.endsWith("/retry") ? 202 : 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      cancelRuntimeTask("task/node", "http://runtime.test/"),
    ).resolves.toEqual(cancelled);
    await expect(
      retryRuntimeTask("task/node", "http://runtime.test/"),
    ).resolves.toEqual(retried);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://runtime.test/v1/tasks/task%2Fnode/cancel",
      "http://runtime.test/v1/tasks/task%2Fnode/retry",
    ]);
    vi.unstubAllGlobals();
  });
});

function branchProject(): Project {
  return {
    id: "project-1", name: "Branch isolation", globalContext: "ROOT_CONTEXT_001",
    rootNodeId: "root", contextTransfers: [],
    nodes: {
      root: { id: "root", kind: "root", prompt: "Root prompt", response: "", children: ["a", "b"], parentId: null, timestamp: 1, layer: 0, contextState: "valid" },
      a: { id: "a", kind: "branch", prompt: "A secret=ALPHA_731", response: "A answer", children: [], parentId: "root", timestamp: 2, layer: 1, contextState: "valid" },
      b: { id: "b", kind: "branch", prompt: "B secret=BETA_294", response: "B answer", children: [], parentId: "root", timestamp: 3, layer: 1, contextState: "valid" },
    },
    nutrients: {}, activeNutrientIds: [], createdAt: 1, updatedAt: 1,
  };
}
