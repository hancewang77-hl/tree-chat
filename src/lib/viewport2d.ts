export const BASE_WORLD_SCALE = 105;

export type Viewport2D = {
  x: number;
  y: number;
  scale: number;
};

export type Size2D = { width: number; height: number };
export type Point2D = { x: number; y: number };
export type Bounds2D = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function zoomPercentToScale(zoom: number): number {
  return zoom / BASE_WORLD_SCALE;
}

export function worldPointToPixels(point: Point2D): Point2D {
  return {
    x: point.x * BASE_WORLD_SCALE,
    y: -point.y * BASE_WORLD_SCALE,
  };
}

export function centerViewportOn(
  point: Point2D,
  viewportSize: Size2D,
  scale: number,
): Viewport2D {
  return {
    x: viewportSize.width / 2 - point.x * scale,
    y: viewportSize.height / 2 - point.y * scale,
    scale,
  };
}

export function preserveViewportCenter(
  viewport: Viewport2D,
  viewportSize: Size2D,
  nextScale: number,
): Viewport2D {
  if (viewport.scale === 0) return { ...viewport, scale: nextScale };
  const centerX = viewportSize.width / 2;
  const centerY = viewportSize.height / 2;
  const worldCenterX = (centerX - viewport.x) / viewport.scale;
  const worldCenterY = (centerY - viewport.y) / viewport.scale;
  return {
    x: centerX - worldCenterX * nextScale,
    y: centerY - worldCenterY * nextScale,
    scale: nextScale,
  };
}

export function viewportWorldBounds(
  viewport: Viewport2D,
  viewportSize: Size2D,
  overscanScreens = 0,
): Bounds2D {
  const safeScale = Math.max(viewport.scale, 0.0001);
  const overscanX = viewportSize.width * overscanScreens;
  const overscanY = viewportSize.height * overscanScreens;
  return {
    left: (-viewport.x - overscanX) / safeScale,
    right: (viewportSize.width - viewport.x + overscanX) / safeScale,
    top: (-viewport.y - overscanY) / safeScale,
    bottom: (viewportSize.height - viewport.y + overscanY) / safeScale,
  };
}

export function pointIntersectsBounds(
  point: Point2D,
  bounds: Bounds2D,
  padding = 0,
): boolean {
  return (
    point.x >= bounds.left - padding &&
    point.x <= bounds.right + padding &&
    point.y >= bounds.top - padding &&
    point.y <= bounds.bottom + padding
  );
}
