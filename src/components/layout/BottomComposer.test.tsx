import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TreeProvider } from "@/src/state/TreeContext";
import { testNutrient, testProject } from "@/src/test/fixtures/tree";
import type { Project } from "@/src/types/tree";
import { BottomComposer } from "./BottomComposer";

/**
 * Seeds localStorage so the real TreeProvider hydrates a known workspace on
 * mount (schema v2). RTL's render() flushes the hydration effect inside act,
 * so post-render queries already see the hydrated UI.
 */
function seedWorkspace(project: Project, selectedNodeId: string, selectedLayer = 0) {
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

/** One ready+active nutrient and one failed nutrient (newest first in the chip row). */
function nutrientProject(): Project {
  return testProject({
    id: "p1",
    nutrients: {
      "n-ready": testNutrient({
        id: "n-ready",
        name: "notes.md",
        createdAt: 2,
        extractedText: "alpha beta gamma", // 16 chars → "MD · 16字"
      }),
      "n-failed": testNutrient({
        id: "n-failed",
        name: "broken.docx",
        createdAt: 1,
        extractionStatus: "failed",
        excerpt: "无法转换该文件",
      }),
    },
    activeNutrientIds: ["n-ready"],
  });
}

const AI_PLACEHOLDER_L0 = "在 z = 0 层继续延伸你的思考... (Enter 发送)";
const NOTE_PLACEHOLDER = "记录一个想法或笔记... (Enter 保存)";

function renderComposer({
  isAiTyping = false,
  isContextPreparing = false,
}: { isAiTyping?: boolean; isContextPreparing?: boolean } = {}) {
  const onSend = vi.fn();
  const onAddLeaf = vi.fn();
  const onStop = vi.fn();
  render(
    <TreeProvider>
      <BottomComposer
        onSend={onSend}
        onAddLeaf={onAddLeaf}
        isAiTyping={isAiTyping}
        isContextPreparing={isContextPreparing}
        onStop={onStop}
      />
    </TreeProvider>,
  );
  return { onSend, onAddLeaf, onStop };
}

describe("BottomComposer", () => {
  it("starts in AI mode with the layer-aware placeholder and a disabled seed button", () => {
    renderComposer();

    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", AI_PLACEHOLDER_L0);
    expect(screen.getByTitle("播种 · Plant")).toBeDisabled(); // nothing typed yet
    expect(screen.getByRole("button", { name: "AI 分支" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "笔记" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "养分" })).toBeInTheDocument();
  });

  it("shows the hydrated selected layer in the AI placeholder", async () => {
    seedWorkspace(testProject({ id: "p1" }), "root", 2);
    renderComposer();

    expect(
      await screen.findByPlaceholderText("在 z = 2 层继续延伸你的思考... (Enter 发送)"),
    ).toBeInTheDocument();
  });

  it("clicking 笔记 broadcasts composer-mode note and switches to note mode", async () => {
    const user = userEvent.setup();
    const modeSpy = vi.fn<(event: Event) => void>();
    window.addEventListener("composer-mode", modeSpy);
    try {
      renderComposer();

      await user.click(screen.getByRole("button", { name: "笔记" }));
      expect(modeSpy).toHaveBeenCalledTimes(1);
      expect((modeSpy.mock.calls[0][0] as CustomEvent).detail).toBe("note");
      expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", NOTE_PLACEHOLDER);
      expect(screen.getByTitle("保存 · Keep")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "AI 分支" }));
      expect((modeSpy.mock.calls[1][0] as CustomEvent).detail).toBe("ai");
      expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", AI_PLACEHOLDER_L0);
    } finally {
      window.removeEventListener("composer-mode", modeSpy);
    }
  });

  it("switches mode when an external composer-mode event arrives", () => {
    renderComposer();

    act(() => {
      window.dispatchEvent(new CustomEvent("composer-mode", { detail: "note" }));
    });
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", NOTE_PLACEHOLDER);

    act(() => {
      window.dispatchEvent(new CustomEvent("composer-mode", { detail: "ai" }));
    });
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", AI_PLACEHOLDER_L0);
  });

  it("submits via onSend on Enter and clears the textarea", async () => {
    const user = userEvent.setup();
    const { onSend, onAddLeaf } = renderComposer();
    const textarea = screen.getByRole("textbox");

    await user.type(textarea, "扩展这个想法{Enter}");

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("扩展这个想法");
    expect(onAddLeaf).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("");
  });

  it("Shift+Enter inserts a newline instead of submitting", async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer();
    const textarea = screen.getByRole("textbox");

    await user.type(textarea, "第一行{Shift>}{Enter}{/Shift}第二行");
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("第一行\n第二行");

    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("第一行\n第二行");
  });

  it("does not submit whitespace-only text", async () => {
    const user = userEvent.setup();
    const { onSend, onAddLeaf } = renderComposer();
    const textarea = screen.getByRole("textbox");

    await user.type(textarea, "   {Enter}");

    expect(onSend).not.toHaveBeenCalled();
    expect(onAddLeaf).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("   "); // Enter is prevented, no newline appended
  });

  it("saves via onAddLeaf on Enter in note mode", async () => {
    const user = userEvent.setup();
    const { onSend, onAddLeaf } = renderComposer();

    await user.click(screen.getByRole("button", { name: "笔记" }));
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "一条笔记{Enter}");

    expect(onAddLeaf).toHaveBeenCalledTimes(1);
    expect(onAddLeaf).toHaveBeenCalledWith("一条笔记");
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("");
  });

  it("turns the send button into a stop button while the AI is typing", async () => {
    const user = userEvent.setup();
    const { onSend, onStop } = renderComposer({ isAiTyping: true });
    const textarea = screen.getByRole("textbox");

    expect(textarea).toHaveAttribute("placeholder", "AI 正在生成回答，可点击停止...");
    const stop = screen.getByTitle("停止生成");
    expect(stop).toBeEnabled();

    // Enter is swallowed while typing: no submit, text preserved.
    await user.type(textarea, "追问{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("追问");

    await user.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("blocks AI submit while context is preparing, but note mode still saves", async () => {
    const user = userEvent.setup();
    const { onSend, onAddLeaf } = renderComposer({ isContextPreparing: true });
    const textarea = screen.getByRole("textbox");

    expect(textarea).toHaveAttribute(
      "placeholder",
      "正在整理当前节点的模型上下文，请稍候...",
    );

    await user.type(textarea, "问题");
    expect(screen.getByTitle("模型上下文整理中")).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();

    // Note mode ignores the AI context gate.
    await user.click(screen.getByRole("button", { name: "笔记" }));
    await user.type(textarea, "{Enter}");
    expect(onAddLeaf).toHaveBeenCalledTimes(1);
    expect(onAddLeaf).toHaveBeenCalledWith("问题");
  });

  it("focuses the textarea when a composer-focus event arrives", async () => {
    renderComposer();
    const textarea = screen.getByRole("textbox");
    expect(textarea).not.toHaveFocus();

    act(() => {
      window.dispatchEvent(new CustomEvent("composer-focus"));
    });

    // Focus happens after a 50ms delay inside the component.
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it("renders nutrient chips and toggles active state through the reducer", async () => {
    const user = userEvent.setup();
    seedWorkspace(nutrientProject(), "root");
    renderComposer();

    // Ready + active chip: filled dot, char count, enabled toggle.
    const readyToggle = await screen.findByRole("button", { name: "● notes.md" });
    expect(readyToggle).toBeEnabled();
    expect(screen.getByText("MD · 16字")).toBeInTheDocument();

    // Failed chip: hollow dot, failure label, toggle disabled.
    expect(screen.getByRole("button", { name: "○ broken.docx" })).toBeDisabled();
    expect(screen.getByText("转换失败")).toBeInTheDocument();

    // Clicking the chip toggles TOGGLE_NUTRIENT_ACTIVE off.
    await user.click(readyToggle);
    expect(await screen.findByRole("button", { name: "○ notes.md" })).toBeInTheDocument();
  });

  it("removes a nutrient chip via its 移除养分 button", async () => {
    const user = userEvent.setup();
    seedWorkspace(nutrientProject(), "root");
    renderComposer();

    // The chip container carries the excerpt as its title.
    const chip = await screen.findByTitle("alpha beta gamma");
    await user.click(within(chip).getByTitle("移除养分"));

    await waitFor(() =>
      expect(screen.queryByText(/notes\.md/)).not.toBeInTheDocument(),
    );
    // The other chip is untouched.
    expect(screen.getByText(/broken\.docx/)).toBeInTheDocument();
  });
});
