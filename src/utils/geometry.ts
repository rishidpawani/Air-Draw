import type { BoardConnector, BoardShape, Point, ShapeKind, ViewportState } from '../types/board';

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function screenToWorld(screenPoint: Point, viewport: ViewportState): Point {
  return {
    x: (screenPoint.x - viewport.panX) / viewport.zoom,
    y: (screenPoint.y - viewport.panY) / viewport.zoom,
  };
}

export function worldToScreen(worldPoint: Point, viewport: ViewportState): Point {
  return {
    x: worldPoint.x * viewport.zoom + viewport.panX,
    y: worldPoint.y * viewport.zoom + viewport.panY,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(4, Math.max(0.2, zoom));
}

export function zoomViewportAtPoint(
  viewport: ViewportState,
  targetZoom: number,
  screenAnchor: Point,
): ViewportState {
  const nextZoom = clampZoom(targetZoom);
  const worldBefore = screenToWorld(screenAnchor, viewport);
  return {
    zoom: nextZoom,
    panX: screenAnchor.x - worldBefore.x * nextZoom,
    panY: screenAnchor.y - worldBefore.y * nextZoom,
  };
}

/**
 * Resample a polyline into N equidistant points so drawing speed
 * does not skew geometric shape fitting.
 */
export function resamplePoints(points: Point[], targetCount = 48): Point[] {
  if (points.length <= 1) return points.slice();
  const totalLen = pathLength(points);
  if (totalLen < 1e-3) return [points[0]];

  const step = totalLen / (targetCount - 1);
  const resampled: Point[] = [points[0]];
  let accumulated = 0;
  let prev = points[0];

  for (let i = 1; i < points.length; i++) {
    let curr = points[i];
    let segLen = distance(prev, curr);
    while (accumulated + segLen >= step && resampled.length < targetCount) {
      const ratio = (step - accumulated) / segLen;
      const nx = prev.x + ratio * (curr.x - prev.x);
      const ny = prev.y + ratio * (curr.y - prev.y);
      const interpolated = { x: nx, y: ny };
      resampled.push(interpolated);
      prev = interpolated;
      segLen = distance(prev, curr);
      accumulated = 0;
    }
    accumulated += segLen;
    prev = curr;
  }

  while (resampled.length < targetCount) {
    resampled.push(points[points.length - 1]);
  }
  return resampled;
}

export function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += distance(points[i - 1], points[i]);
  }
  return len;
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * 3. ACCURATE RECTANGLE vs CIRCLE vs LINE RECOGNIZER (Shoelace Area + Corner Count)
 */
export function rdpSimplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];
  const lineLen = Math.hypot(end.x - start.x, end.y - start.y);

  for (let i = 1; i < points.length - 1; i++) {
    const dist =
      lineLen < 1e-3
        ? Math.hypot(points[i].x - start.x, points[i].y - start.y)
        : Math.abs(
            (end.y - start.y) * points[i].x -
              (end.x - start.x) * points[i].y +
              end.x * start.y -
              end.y * start.x,
          ) / lineLen;
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, index + 1), epsilon);
    const right = rdpSimplify(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [start, end];
}

export function classifyShape(pts: Point[]): 'line' | 'rect' | 'diamond' | 'circle' | null {
  if (pts.length < 2) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let pathLen = 0;

  for (let i = 0; i < pts.length; i++) {
    minX = Math.min(minX, pts[i].x);
    minY = Math.min(minY, pts[i].y);
    maxX = Math.max(maxX, pts[i].x);
    maxY = Math.max(maxY, pts[i].y);
    if (i > 0) {
      pathLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
  }

  const w = maxX - minX;
  const h = maxY - minY;
  const diag = Math.hypot(w, h);
  if (diag < 14 || pathLen < 1e-3) return null;

  const direct = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y);

  // A. Straight Line
  if (direct / pathLen > 0.90) return 'line';

  // Must be roughly closed
  if (direct > diag * 0.42) return null;

  // B. Polygon Area (Shoelace formula) vs Bounding Box Area
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  const fillRatio = Math.abs(area / 2) / (w * h || 1);

  // C. Count sharp corners using RDP simplification
  const simplified = rdpSimplify(pts, diag * 0.045);
  let sharpCorners = 0;
  for (let i = 1; i < simplified.length - 1; i++) {
    const v1 = { x: simplified[i].x - simplified[i - 1].x, y: simplified[i].y - simplified[i - 1].y };
    const v2 = { x: simplified[i + 1].x - simplified[i].x, y: simplified[i + 1].y - simplified[i].y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
    if (angle > 50 && angle < 135) sharpCorners++;
  }

  // Distinguish Diamond (4 corners with ~0.50 Shoelace fillRatio & L1 fit) vs Rectangle
  if (sharpCorners >= 3 && fillRatio < 0.64) {
    const cx = minX + w / 2;
    const cy = minY + h / 2;
    const rx = Math.max(w / 2, 12);
    const ry = Math.max(h / 2, 12);
    const evalPts = resamplePoints(pts, 32);
    let l1Err = 0;
    let linfErr = 0;
    for (const p of evalPts) {
      const nx = Math.abs(p.x - cx) / rx;
      const ny = Math.abs(p.y - cy) / ry;
      l1Err += Math.abs(nx + ny - 1);
      linfErr += Math.abs(Math.max(nx, ny) - 1);
    }
    if (l1Err < linfErr) return 'diamond';
  }

  // Rectangles have >= 3 corners OR fill > 79% of their bounding box
  if (sharpCorners >= 3 || fillRatio > 0.79) return 'rect';
  return 'circle';
}

export interface RecognizedStrokeResult {
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Point[];
}

/**
 * Classifies a rough hand-drawn or mouse-drawn stroke into a clean geometric shape:
 * Straight Line, Circle/Ellipse, Diamond, Rectangle, or Freehand fallback.
 */
export function recognizeRoughStroke(rawPoints: Point[]): RecognizedStrokeResult | null {
  if (rawPoints.length < 2) return null;
  if (pathLength(rawPoints) < 25) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of rawPoints) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const diag = Math.hypot(width, height);
  if (diag < 14) return null;

  const safeW = Math.max(width, 24);
  const safeH = Math.max(height, 24);
  const classified = classifyShape(rawPoints);

  if (classified === 'line') {
    const first = rawPoints[0];
    const last = rawPoints[rawPoints.length - 1];
    return {
      kind: 'line',
      x: Math.min(first.x, last.x),
      y: Math.min(first.y, last.y),
      width: Math.abs(last.x - first.x),
      height: Math.abs(last.y - first.y),
      points: [
        { x: first.x, y: first.y },
        { x: last.x, y: last.y },
      ],
    };
  }

  if (classified === 'rect' || classified === 'circle' || classified === 'diamond') {
    return {
      kind: classified === 'rect' ? 'rectangle' : classified,
      x: minX,
      y: minY,
      width: safeW,
      height: safeH,
    };
  }

  // Fallback: keep as smooth freehand stroke if user drew an open expressive curve
  return {
    kind: 'freehand',
    x: minX,
    y: minY,
    width: safeW,
    height: safeH,
    points: rawPoints.map((p) => ({ x: p.x, y: p.y })),
  };
}

export function getShapeBounds(shape: BoardShape): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (shape.kind === 'line' && shape.points && shape.points.length >= 2) {
    const [a, b] = shape.points;
    return {
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
    };
  }
  return {
    minX: shape.x,
    minY: shape.y,
    maxX: shape.x + shape.width,
    maxY: shape.y + shape.height,
  };
}

export function getShapeCenter(shape: BoardShape): Point {
  const b = getShapeBounds(shape);
  return {
    x: (b.minX + b.maxX) / 2,
    y: (b.minY + b.maxY) / 2,
  };
}

export function hitTestShape(worldPoint: Point, shapes: BoardShape[], padding = 8): BoardShape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.kind === 'line' && s.points && s.points.length >= 2) {
      const dist = pointToSegmentDistance(worldPoint, s.points[0], s.points[1]);
      if (dist <= padding + 6) return s;
      continue;
    }

    if (s.kind === 'freehand' && s.points && s.points.length >= 2) {
      for (let j = 1; j < s.points.length; j++) {
        if (pointToSegmentDistance(worldPoint, s.points[j - 1], s.points[j]) <= padding + 6) {
          return s;
        }
      }
      continue;
    }

    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    const rx = Math.max(s.width / 2, 12) + padding;
    const ry = Math.max(s.height / 2, 12) + padding;

    if (s.kind === 'circle') {
      const norm = Math.hypot((worldPoint.x - cx) / rx, (worldPoint.y - cy) / ry);
      if (norm <= 1) return s;
      continue;
    }

    if (s.kind === 'diamond') {
      const norm = Math.abs(worldPoint.x - cx) / rx + Math.abs(worldPoint.y - cy) / ry;
      if (norm <= 1) return s;
      continue;
    }

    // Rectangle or Text box
    if (
      worldPoint.x >= s.x - padding &&
      worldPoint.x <= s.x + s.width + padding &&
      worldPoint.y >= s.y - padding &&
      worldPoint.y <= s.y + s.height + padding
    ) {
      return s;
    }
  }
  return null;
}

/**
 * Computes exact anchor point on the perimeter of a shape along the ray
 * from the shape's center toward targetPoint.
 */
export function getShapeAnchorPoint(shape: BoardShape, targetPoint: Point): Point {
  const center = getShapeCenter(shape);
  const dx = targetPoint.x - center.x;
  const dy = targetPoint.y - center.y;
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return center;

  if (shape.kind === 'line' || shape.kind === 'freehand') {
    return center;
  }

  const hw = Math.max(shape.width / 2, 10);
  const hh = Math.max(shape.height / 2, 10);

  if (shape.kind === 'circle') {
    const scale = 1 / Math.hypot(dx / hw, dy / hh);
    return {
      x: center.x + dx * scale,
      y: center.y + dy * scale,
    };
  }

  if (shape.kind === 'diamond') {
    const scale = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return {
      x: center.x + dx * scale,
      y: center.y + dy * scale,
    };
  }

  // Rectangle / Text
  const sx = Math.abs(dx) > 1e-5 ? hw / Math.abs(dx) : Infinity;
  const sy = Math.abs(dy) > 1e-5 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  return {
    x: center.x + dx * t,
    y: center.y + dy * t,
  };
}

export function getConnectorEndpoints(
  connector: BoardConnector,
  shapes: BoardShape[],
): { start: Point; end: Point } | null {
  const from = shapes.find((s) => s.id === connector.fromShapeId);
  const to = shapes.find((s) => s.id === connector.toShapeId);
  if (!from || !to) return null;

  const fromCenter = getShapeCenter(from);
  const toCenter = getShapeCenter(to);

  return {
    start: getShapeAnchorPoint(from, toCenter),
    end: getShapeAnchorPoint(to, fromCenter),
  };
}

export function moveShapeByDelta(shape: BoardShape, dx: number, dy: number): BoardShape {
  return {
    ...shape,
    x: shape.x + dx,
    y: shape.y + dy,
    points: shape.points ? shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) : undefined,
  };
}

export type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw';

export function hitTestResizeHandle(
  worldPoint: Point,
  shape: BoardShape,
  zoom: number,
): ResizeCorner | null {
  if (shape.kind === 'line' || shape.kind === 'freehand') return null;
  const b = getShapeBounds(shape);
  const pad = 7;
  const hitRadius = 10 / Math.max(0.25, zoom);
  const corners: { id: ResizeCorner; pt: Point }[] = [
    { id: 'nw', pt: { x: b.minX - pad, y: b.minY - pad } },
    { id: 'ne', pt: { x: b.maxX + pad, y: b.minY - pad } },
    { id: 'se', pt: { x: b.maxX + pad, y: b.maxY + pad } },
    { id: 'sw', pt: { x: b.minX - pad, y: b.maxY + pad } },
  ];
  for (const c of corners) {
    if (distance(worldPoint, c.pt) <= hitRadius) return c.id;
  }
  return null;
}

export function resizeShapeFromHandle(
  initial: BoardShape,
  corner: ResizeCorner,
  worldPoint: Point,
): BoardShape {
  const minSize = 32;
  let left = initial.x;
  let top = initial.y;
  let right = initial.x + initial.width;
  let bottom = initial.y + initial.height;

  if (corner === 'nw' || corner === 'sw') {
    left = Math.min(worldPoint.x, right - minSize);
  }
  if (corner === 'ne' || corner === 'se') {
    right = Math.max(worldPoint.x, left + minSize);
  }
  if (corner === 'nw' || corner === 'ne') {
    top = Math.min(worldPoint.y, bottom - minSize);
  }
  if (corner === 'sw' || corner === 'se') {
    bottom = Math.max(worldPoint.y, top + minSize);
  }

  return {
    ...initial,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}
