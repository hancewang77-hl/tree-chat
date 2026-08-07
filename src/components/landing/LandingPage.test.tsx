import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LandingPage } from "./LandingPage";

vi.mock("animejs", () => ({
  animate: vi.fn(() => ({ pause: vi.fn() })),
  stagger: vi.fn(() => 0),
}));

vi.mock("./NarrativeTreeScene", () => ({
  NarrativeTreeScene: () => null,
}));

describe("LandingPage seed transition", () => {
  let originalDescriptor: PropertyDescriptor | undefined;
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    originalDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    vi.useRealTimers();
  });

  test("automatically scrolls to Page 3 after the seed-to-sprout sequence", () => {
    render(<LandingPage />);

    const seedButton = screen.getByRole("button", { name: "点击播下 Tree Chat 种子" });
    fireEvent.click(seedButton);

    expect(seedButton).toHaveAttribute("aria-pressed", "true");
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1319));
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByRole("status", { name: "当前章节：困境与解法" })).toBeInTheDocument();
    expect(document.getElementById("dilemma")).toBeTruthy();
  });

  test("uses an immediate, non-animated scroll when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));

    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: "点击播下 Tree Chat 种子" }));

    act(() => vi.runOnlyPendingTimers());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
});
