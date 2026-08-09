import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { installCanvasMock } from "../mocks/browser";
import { installStorageMock } from "../mocks/storage";

// jsdom under vitest v4 ships without Web Storage, so provide an in-memory
// localStorage/sessionStorage before any component (or the afterEach cleanup)
// touches them.
installStorageMock();
installCanvasMock();

if (!globalThis.requestAnimationFrame) {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  );
}

if (!globalThis.cancelAnimationFrame) {
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
