import { useEffect, useState } from "react";
import { clamp } from "@/src/lib/utils";

export function useResizableSidebar(initialWidth = 420) {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  useEffect(() => {
    function handleResizeMove(e: MouseEvent) {
      if (!isResizingSidebar) return;
      const newWidth = document.body.clientWidth - e.clientX;
      setSidebarWidth(clamp(newWidth, 340, 860));
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
  }, [isResizingSidebar]);

  return {
    sidebarWidth,
    isResizingSidebar,
    startResizing: () => setIsResizingSidebar(true),
  } as const;
}
