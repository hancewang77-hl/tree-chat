import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("LayerNameDialog", () => {
  test("renders nothing while closed", () => {
    const { container } = renderDialog({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  test("shows the current layer and the controlled input value", () => {
    renderDialog();

    expect(
      screen.getByRole("heading", { name: "命名当前平面" }),
    ).toBeInTheDocument();
    expect(screen.getByText("当前平面：z = 2")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("输入平面名称");
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

  test("pressing Enter in the input does not submit (current behavior)", async () => {
    // PRODUCT BUG (pinned): the dialog has no form element and no onKeyDown
    // handler, so Enter neither confirms nor cancels — the user must click
    // 确定 with the mouse. If Enter-to-submit is added, update this test.
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByPlaceholderText("输入平面名称"), "{Enter}");

    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });
});
