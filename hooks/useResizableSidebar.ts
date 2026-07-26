"use client";

import { useEffect, useState } from "react";
import { clamp } from "@/src/lib/utils";

/**
 * Drag-to-resize state for a sidebar pinned to either window edge.
 * Width is session-only (not persisted). `side` decides how the mouse
 * position maps to a width: distance from the left edge for a left
 * sidebar, from the right edge for a right sidebar.
 */
export function useResizableSidebar(
  initialWidth = 420,
  {
    side = "right",
    minWidth = 340,
    maxWidth = 860,
  }: { side?: "left" | "right"; minWidth?: number; maxWidth?: number } = {},
) {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  useEffect(() => {
    function handleResizeMove(e: MouseEvent) {
      if (!isResizingSidebar) return;
      const newWidth =
        side === "right" ? document.body.clientWidth - e.clientX : e.clientX;
      setSidebarWidth(clamp(newWidth, minWidth, maxWidth));
    }

    function handleResizeUp() {
      setIsResizingSidebar(false);
    }

    if (isResizingSidebar) {
      window.addEventListener("mousemove", handleResizeMove);
      window.addEventListener("mouseup", handleResizeUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", handleResizeUp);
    };
  }, [isResizingSidebar, side, minWidth, maxWidth]);

  return {
    sidebarWidth,
    isResizingSidebar,
    startResizing: () => setIsResizingSidebar(true),
  } as const;
}
