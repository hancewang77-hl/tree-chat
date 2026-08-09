import { describe, expect, test, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayerNameDialog } from "./LayerNameDialog";

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof LayerNameDialog>> = {},
) {
  const props = {
    isOpen: true,
    selectedLayer: 2,
    planeNameInput: "枝干层",
    onInputChange: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const view = render(<LayerNameDialog {...props} />);
  return { ...view, props };
}

function LayerNameDialogHost() {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState("Branches");

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open layer dialog</button>
      <LayerNameDialog
        isOpen={isOpen}
        selectedLayer={2}
        planeNameInput={value}
        onInputChange={setValue}
        onConfirm={() => setIsOpen(false)}
        onCancel={() => setIsOpen(false)}
      />
    </>
  );
}

describe("LayerNameDialog", () => {
  test("renders nothing while closed", () => {
    const { container } = renderDialog({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  test("shows the current layer and the controlled input value", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "命名当前平面" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("当前平面：z = 2");
    expect(
      screen.getByRole("heading", { name: "命名当前平面" }),
    ).toBeInTheDocument();
    expect(screen.getByText("当前平面：z = 2")).toBeInTheDocument();

    const input = screen.getByRole("textbox", { name: "平面名称" });
    expect(input).toHaveValue("枝干层");
    expect(input).toHaveFocus();
  });

  test("layer 0 uses the root-layer placeholder", () => {
    renderDialog({ selectedLayer: 0, planeNameInput: "" });
    expect(screen.getByPlaceholderText("根节点层")).toHaveValue("");
    expect(screen.getByText("当前平面：z = 0")).toBeInTheDocument();
  });

  test("typing forwards the next value to onInputChange", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByPlaceholderText("输入平面名称"), "叶");

    expect(props.onInputChange).toHaveBeenCalledTimes(1);
    expect(props.onInputChange).toHaveBeenCalledWith("枝干层叶");
  });

  test("确定 calls onConfirm and 取消 calls onCancel", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole("button", { name: "确定" }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  test("Enter confirms and Escape cancels from the keyboard", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByPlaceholderText("输入平面名称"), "{Enter}");
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  test("Tab and Shift+Tab keep focus inside the dialog", async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByRole("textbox");
    const [, confirmButton] = within(dialog).getAllByRole("button");

    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();

    await user.tab();
    expect(input).toHaveFocus();
  });

  test("portals a fixed full-application backdrop to document.body", () => {
    renderDialog();

    const backdrop = screen.getByRole("dialog").parentElement;
    expect(backdrop).toHaveClass("fixed", "inset-0");
    expect(backdrop?.parentElement).toBe(document.body);
  });

  test("Escape closes the dialog and restores focus to its opener", async () => {
    const user = userEvent.setup();
    render(<LayerNameDialogHost />);
    const opener = screen.getByRole("button", { name: "Open layer dialog" });

    await user.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});
