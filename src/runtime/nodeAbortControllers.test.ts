import { describe, expect, test } from "vitest";
import { NodeAbortControllerStore } from "./nodeAbortControllers";

describe("NodeAbortControllerStore", () => {
  test("starting a second node does not abort the first node", () => {
    const store = new NodeAbortControllerStore();
    const controllerA = store.create("node-a");
    const controllerB = store.create("node-b");

    expect(controllerA.signal.aborted).toBe(false);
    expect(controllerB.signal.aborted).toBe(false);
    expect(store.has("node-a")).toBe(true);
    expect(store.has("node-b")).toBe(true);
  });

  test("stop and finish affect only the addressed node", () => {
    const store = new NodeAbortControllerStore();
    const controllerA = store.create("node-a");
    const controllerB = store.create("node-b");

    expect(store.abort("node-b")).toBe(true);
    expect(controllerA.signal.aborted).toBe(false);
    expect(controllerB.signal.aborted).toBe(true);

    store.finish("node-a", controllerA);
    expect(store.has("node-a")).toBe(false);
    expect(store.has("node-b")).toBe(true);
  });
});
