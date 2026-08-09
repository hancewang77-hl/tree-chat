import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { AuxoDialog } from "./AuxoDialog";

function auxoDialog(overrides: Partial<React.ComponentProps<typeof AuxoDialog>> = {}) {
  return (
    <AuxoDialog
      rootTask="Plan the competition submission"
      nutrients={[]}
      isGenerating={false}
      error={null}
      onGenerate={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />
  );
}

function AuxoDialogHost() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open Auxo</button>
      {open && auxoDialog({ onCancel: () => setOpen(false) })}
    </>
  );
}

describe("AuxoDialog modal behavior", () => {
  test("portals a fixed full-application backdrop to document.body", () => {
    render(auxoDialog());

    const dialog = screen.getByRole("dialog", { name: "Auxo · 生成基础任务树" });
    const backdrop = dialog.parentElement;
    expect(backdrop).toHaveClass("fixed", "inset-0");
    expect(backdrop?.parentElement).toBe(document.body);
  });

  test("makes the body background inert and restores it after closing", async () => {
    const user = userEvent.setup();
    const view = render(<AuxoDialogHost />);
    const opener = screen.getByRole("button", { name: "Open Auxo" });

    await user.click(opener);
    expect(view.container).toHaveAttribute("inert");
    expect(view.container).toHaveAttribute("aria-hidden", "true");

    await user.keyboard("{Escape}");

    expect(view.container).not.toHaveAttribute("inert");
    expect(view.container).not.toHaveAttribute("aria-hidden");
  });

  test("traps focus and Escape restores focus to the opener", async () => {
    const user = userEvent.setup();
    render(<AuxoDialogHost />);
    const opener = screen.getByRole("button", { name: "Open Auxo" });

    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Auxo · 生成基础任务树" });
    const closeButton = screen.getByTitle("关闭");
    const actionButtons = within(dialog).getAllByRole("button");
    const lastAction = actionButtons.at(-1);
    expect(lastAction).toBeDefined();
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastAction).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Auxo · 生成基础任务树" })).toBeNull();
    expect(opener).toHaveFocus();
  });
});
