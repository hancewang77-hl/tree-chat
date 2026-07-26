import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TreeProvider } from "@/src/state/TreeContext";
import { testNode, testProject } from "@/src/test/fixtures/tree";
import type { Project } from "@/src/types/tree";
import type { StoredWorkspace } from "@/src/lib/storage";
import { CanopyMinimap } from "./CanopyMinimap";

const SELECTED_FILL = "var(--accent-olive-deep)";
const ROOT_FILL = "var(--accent-bark)";
const PLAIN_FILL = "var(--accent-sage)";

/** Chain root(layer 0) → b1(layer 1) → b2(layer 2). */
function minimapProject(): Project {
  const root = testNode({
    id: "root",
    kind: "root",
    prompt: "根",
    children: ["b1"],
    parentId: null,
    layer: 0,
  });
  const b1 = testNode({
    id: "b1",
    prompt: "枝一",
    children: ["b2"],
    parentId: "root",
    layer: 1,
  });
  const b2 = testNode({
    id: "b2",
    prompt: "枝二",
    children: [],
    parentId: "b1",
    layer: 2,
  });
  return testProject({
    id: "p1",
    name: "画布项目",
    rootNodeId: "root",
    nodes: { root, b1, b2 },
  });
}

function seedWorkspace(project: Project, selectedNodeId: string, selectedLayer: number) {
  localStorage.setItem(
    "tree-chat-projects",
    JSON.stringify({
      schemaVersion: 2,
      projects: { [project.id]: project },
      activeProjectId: project.id,
      selectedNodeId,
      selectedLayer,
      planeNames: { 0: "根节点层" },
    }),
  );
}

async function renderMinimap(selectedNodeId = "b1", selectedLayer = 1) {
  seedWorkspace(minimapProject(), selectedNodeId, selectedLayer);
  const view = render(
    <TreeProvider>
      <CanopyMinimap />
    </TreeProvider>,
  );
  // Wait for post-mount localStorage hydration.
  await screen.findByText("3 nodes");
  return view;
}

// Circles render in Object.values(nodes) insertion order: root, b1, b2.
function getCircles(container: HTMLElement) {
  return Array.from(container.querySelectorAll("circle"));
}

describe("CanopyMinimap", () => {
  test("renders one circle per node, one edge per parent link and a node count", async () => {
    const { container } = await renderMinimap();

    expect(getCircles(container)).toHaveLength(3);
    expect(container.querySelectorAll("line")).toHaveLength(2);
    expect(screen.getByText("3 nodes")).toBeInTheDocument();
  });

  test("distinguishes root, selected and plain nodes by fill and radius", async () => {
    const { container } = await renderMinimap("b1", 1);
    const [rootCircle, b1Circle, b2Circle] = getCircles(container);

    expect(rootCircle.getAttribute("fill")).toBe(ROOT_FILL);
    expect(rootCircle.getAttribute("r")).toBe("4");
    expect(b1Circle.getAttribute("fill")).toBe(SELECTED_FILL);
    expect(b1Circle.getAttribute("r")).toBe("3.5");
    expect(b2Circle.getAttribute("fill")).toBe(PLAIN_FILL);
    expect(b2Circle.getAttribute("r")).toBe("2.5");
  });

  test("clicking a node dispatches SUNLIGHT: selects it and jumps to its layer", async () => {
    const user = userEvent.setup();
    const { container } = await renderMinimap("b1", 1);

    await user.click(getCircles(container)[2]); // b2

    const [, b1Circle, b2Circle] = getCircles(container);
    expect(b2Circle.getAttribute("fill")).toBe(SELECTED_FILL);
    expect(b2Circle.getAttribute("r")).toBe("3.5");
    expect(b1Circle.getAttribute("fill")).toBe(PLAIN_FILL);
    expect(b1Circle.getAttribute("r")).toBe("2.5");

    // SUNLIGHT (unlike SELECT_NODE) also jumps to the node's layer; both are
    // persisted to the workspace.
    const workspace = JSON.parse(
      localStorage.getItem("tree-chat-projects") ?? "{}",
    ) as StoredWorkspace;
    expect(workspace.selectedNodeId).toBe("b2");
    expect(workspace.selectedLayer).toBe(2);
  });

  test("renders nothing without an active project", () => {
    const { container } = render(
      <TreeProvider>
        <CanopyMinimap />
      </TreeProvider>,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
