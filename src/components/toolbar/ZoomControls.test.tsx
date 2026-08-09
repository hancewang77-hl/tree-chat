import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZoomControls } from "./ZoomControls";

describe("ZoomControls", () => {
  test("exposes a named control group and named zoom actions", async () => {
    const user = userEvent.setup();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();

    render(
      <ZoomControls
        zoom={100}
        is3DMode={false}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />,
    );

    expect(screen.getByRole("group", { name: "缩放控制" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "放大 — 靠近树冠" }));
    await user.click(screen.getByRole("button", { name: "缩小 — 俯瞰全景" }));

    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
  });
});
