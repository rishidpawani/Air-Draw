import type {
  BoardConnector,
  BoardShape,
  CursorVisualState,
  GestureType,
  Point,
  ThemeMode,
  ViewportState,
} from '../types/board';
import { getConnectorEndpoints, getShapeBounds, worldToScreen } from './geometry';

export function resolveStrokeColor(strokeColor: string, theme: ThemeMode): string {
  if (strokeColor === 'auto') {
    return theme === 'dark' ? '#FFFFFF' : '#111111';
  }
  return strokeColor;
}

function seededOffset(seed: number, step: number, amplitude = 1.1): number {
  const x = Math.sin(seed * 9301 + step * 49297 + 233) * 10000;
  return (x - Math.floor(x) - 0.5) * 2 * amplitude;
}

function drawSketchyLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
) {
  const mx = (x1 + x2) / 2 + seededOffset(seed, 1, 1.3);
  const my = (y1 + y2) / 2 + seededOffset(seed, 2, 1.3);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();

  // Subtle second pass for Excalidraw hand-crafted ink warmth
  ctx.save();
  ctx.globalAlpha *= 0.35;
  ctx.beginPath();
  ctx.moveTo(x1 + seededOffset(seed, 3, 0.9), y1 + seededOffset(seed, 4, 0.9));
  ctx.quadraticCurveTo(
    mx + seededOffset(seed, 5, 1.1),
    my + seededOffset(seed, 6, 1.1),
    x2 + seededOffset(seed, 7, 0.9),
    y2 + seededOffset(seed, 8, 0.9),
  );
  ctx.stroke();
  ctx.restore();
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function drawCenteredShapeText(
  ctx: CanvasRenderingContext2D,
  shape: BoardShape,
  color: string,
) {
  if (!shape.text.trim()) return;

  const padding = shape.kind === 'diamond' ? 28 : 14;
  const maxTextWidth = Math.max(40, shape.width - padding * 2);
  const fontSize = Math.round((shape.fontSize || 18) * 1.15);
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `500 ${fontSize}px "Patrick Hand", "Caveat", cursive, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const paragraphs = shape.text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(' ');
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
  }

  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const startY = cy - totalHeight / 2 + lineHeight / 2;

  lines.forEach((line, idx) => {
    ctx.fillText(line, cx, startY + idx * lineHeight);
  });
  ctx.restore();
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  size = 11,
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - size * Math.cos(angle - Math.PI / 6.5),
    to.y - size * Math.sin(angle - Math.PI / 6.5),
  );
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - size * Math.cos(angle + Math.PI / 6.5),
    to.y - size * Math.sin(angle + Math.PI / 6.5),
  );
  ctx.stroke();
}

export interface RenderCanvasParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  theme: ThemeMode;
  viewport: ViewportState;
  shapes: BoardShape[];
  connectors: BoardConnector[];
  selectedShapeId: string | null;
  editingShapeId: string | null;
  hoveredShapeId: string | null;
  activeStrokePoints: Point[] | null;
  activeDraftShape: BoardShape | null;
  activeConnectorPreview: { fromShapeId: string; toPoint: Point; snapShapeId: string | null } | null;
  virtualCursorScreen: Point | null;
  activeGesture: GestureType;
  cursorVisual?: CursorVisualState;
  strokeColor: string;
}

export function renderBoardCanvas(params: RenderCanvasParams) {
  const {
    ctx,
    width,
    height,
    dpr,
    theme,
    viewport,
    shapes,
    connectors,
    selectedShapeId,
    editingShapeId,
    hoveredShapeId,
    activeStrokePoints,
    activeDraftShape,
    activeConnectorPreview,
    virtualCursorScreen,
    activeGesture,
    cursorVisual,
    strokeColor,
  } = params;

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#000000' : '#ffffff';
  const gridDotColor = isDark ? '#161618' : 'rgba(17, 17, 17, 0.11)';
  const accentColor = '#00B4FF';

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 1. Canvas Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // 2. Infinite Dot Grid in World Coordinates (fast pattern tile)
  const baseSpacing = 28;
  let step = baseSpacing * viewport.zoom;
  while (step < 16) step *= 2;
  while (step > 56) step /= 2;

  const tileSize = Math.max(8, Math.round(step));
  const offsetX = ((viewport.panX % tileSize) + tileSize) % tileSize;
  const offsetY = ((viewport.panY % tileSize) + tileSize) % tileSize;

  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = tileSize;
  patternCanvas.height = tileSize;
  const pCtx = patternCanvas.getContext('2d');
  if (pCtx) {
    pCtx.fillStyle = gridDotColor;
    pCtx.beginPath();
    pCtx.arc(1.5, 1.5, isDark ? 1.35 : 1.15, 0, Math.PI * 2);
    pCtx.fill();
    const pattern = ctx.createPattern(patternCanvas, 'repeat');
    if (pattern) {
      ctx.save();
      ctx.translate(offsetX - 1.5, offsetY - 1.5);
      ctx.fillStyle = pattern;
      ctx.fillRect(-offsetX + 1.5, -offsetY + 1.5, width + tileSize, height + tileSize);
      ctx.restore();
    }
  }

  // 3. Apply World Transform
  ctx.save();
  ctx.translate(viewport.panX, viewport.panY);
  ctx.scale(viewport.zoom, viewport.zoom);

  // 4. Draw Connectors
  for (const conn of connectors) {
    const endpoints = getConnectorEndpoints(conn, shapes);
    if (!endpoints) continue;

    const color = resolveStrokeColor(conn.strokeColor, theme);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = conn.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(endpoints.start.x, endpoints.start.y);
    ctx.lineTo(endpoints.end.x, endpoints.end.y);
    ctx.stroke();

    drawArrowhead(ctx, endpoints.start, endpoints.end, 12);
    ctx.restore();
  }

  // 5. Active Connector Drag Preview
  if (activeConnectorPreview) {
    const fromShape = shapes.find((s) => s.id === activeConnectorPreview.fromShapeId);
    if (fromShape) {
      const snapShape = activeConnectorPreview.snapShapeId
        ? shapes.find((s) => s.id === activeConnectorPreview.snapShapeId)
        : null;
      const startCenter = {
        x: fromShape.x + fromShape.width / 2,
        y: fromShape.y + fromShape.height / 2,
      };
      const endTarget = snapShape
        ? { x: snapShape.x + snapShape.width / 2, y: snapShape.y + snapShape.height / 2 }
        : activeConnectorPreview.toPoint;

      const dummyEndpoints = getConnectorEndpoints(
        {
          id: 'preview',
          fromShapeId: fromShape.id,
          toShapeId: snapShape ? snapShape.id : fromShape.id,
          strokeColor: accentColor,
          strokeWidth: 2.5,
        },
        shapes,
      );

      const startPt = snapShape && dummyEndpoints ? dummyEndpoints.start : startCenter;
      const endPt = snapShape && dummyEndpoints ? dummyEndpoints.end : endTarget;

      ctx.save();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(startPt.x, startPt.y);
      ctx.lineTo(endPt.x, endPt.y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawArrowhead(ctx, startPt, endPt, 12);
      ctx.restore();
    }
  }

  // 6. Render Shapes (plus activeDraftShape if drawing with explicit shape tool)
  const renderList = activeDraftShape ? [...shapes, activeDraftShape] : shapes;
  for (const shape of renderList) {
    const color = resolveStrokeColor(shape.strokeColor, theme);
    const isSnapTarget = activeConnectorPreview?.snapShapeId === shape.id;
    const isHovered = hoveredShapeId === shape.id;

    ctx.save();
    ctx.strokeStyle = isSnapTarget ? accentColor : color;
    ctx.lineWidth = isSnapTarget ? shape.strokeWidth + 1 : shape.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (shape.fillColor && shape.fillColor !== 'transparent') {
      ctx.fillStyle = shape.fillColor;
    }

    if (shape.kind === 'rectangle') {
      drawRoundedRectPath(ctx, shape.x, shape.y, shape.width, shape.height, 8);
      if (shape.fillColor !== 'transparent') ctx.fill();
      ctx.stroke();

      // Subtle second ink pass
      ctx.save();
      ctx.globalAlpha = 0.25;
      drawRoundedRectPath(
        ctx,
        shape.x + seededOffset(shape.seed, 1, 0.8),
        shape.y + seededOffset(shape.seed, 2, 0.8),
        shape.width,
        shape.height,
        8,
      );
      ctx.stroke();
      ctx.restore();
    } else if (shape.kind === 'circle') {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const rx = Math.max(4, shape.width / 2);
      const ry = Math.max(4, shape.height / 2);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (shape.fillColor !== 'transparent') ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(
        cx + seededOffset(shape.seed, 3, 0.9),
        cy + seededOffset(shape.seed, 4, 0.9),
        rx,
        ry,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    } else if (shape.kind === 'diamond') {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const top = { x: cx, y: shape.y };
      const right = { x: shape.x + shape.width, y: cy };
      const bottom = { x: cx, y: shape.y + shape.height };
      const left = { x: shape.x, y: cy };

      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(right.x, right.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.lineTo(left.x, left.y);
      ctx.closePath();
      if (shape.fillColor !== 'transparent') ctx.fill();
      ctx.stroke();
    } else if (shape.kind === 'line' && shape.points && shape.points.length >= 2) {
      drawSketchyLine(
        ctx,
        shape.points[0].x,
        shape.points[0].y,
        shape.points[1].x,
        shape.points[1].y,
        shape.seed,
      );
    } else if (shape.kind === 'freehand' && shape.points && shape.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length - 1; i++) {
        const midX = (shape.points[i].x + shape.points[i + 1].x) / 2;
        const midY = (shape.points[i].y + shape.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(shape.points[i].x, shape.points[i].y, midX, midY);
      }
      const last = shape.points[shape.points.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }

    // Hover outline hint
    if (isHovered && shape.id !== selectedShapeId && shape.kind !== 'text') {
      const b = getShapeBounds(shape);
      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(96, 165, 250, 0.55)' : 'rgba(37, 99, 235, 0.45)';
      ctx.lineWidth = 1.5 / viewport.zoom;
      ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
      ctx.strokeRect(b.minX - 6, b.minY - 6, b.maxX - b.minX + 12, b.maxY - b.minY + 12);
      ctx.restore();
    }

    // Centered Text (skip if currently inline editing this shape)
    if (shape.id !== editingShapeId) {
      drawCenteredShapeText(ctx, shape, color);
    }

    // Selection Outline
    if (shape.id === selectedShapeId && shape.id !== editingShapeId) {
      const b = getShapeBounds(shape);
      const pad = 7;
      ctx.save();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5 / viewport.zoom;
      ctx.strokeRect(
        b.minX - pad,
        b.minY - pad,
        b.maxX - b.minX + pad * 2,
        b.maxY - b.minY + pad * 2,
      );

      // Corner handles
      const handleSize = 7 / viewport.zoom;
      const corners = [
        { x: b.minX - pad, y: b.minY - pad },
        { x: b.maxX + pad, y: b.minY - pad },
        { x: b.maxX + pad, y: b.maxY + pad },
        { x: b.minX - pad, y: b.maxY + pad },
      ];
      ctx.fillStyle = isDark ? '#000000' : '#ffffff';
      for (const c of corners) {
        ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  // 7. Live Rough Stroke Before Snap
  if (activeStrokePoints && activeStrokePoints.length >= 2) {
    ctx.save();
    ctx.strokeStyle = resolveStrokeColor(strokeColor, theme);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(activeStrokePoints[0].x, activeStrokePoints[0].y);
    for (let i = 1; i < activeStrokePoints.length; i++) {
      ctx.lineTo(activeStrokePoints[i].x, activeStrokePoints[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore(); // End world transform

  // 8. Virtual Hand Cursor Overlay (Screen Space) with Glowing Active-Color Ring
  if (virtualCursorScreen) {
    ctx.save();
    const { x, y } = virtualCursorScreen;
    const mode = cursorVisual?.mode ?? (activeGesture === 'pinch_index' ? 'drawing' : 'hover');
    const progress = Math.max(0, Math.min(1, cursorVisual?.progress ?? 0));
    const activeGlowColor = resolveStrokeColor(strokeColor, theme);

    if (mode === 'drawing') {
      // Glowing outer halo matching active stroke color + solid green center dot
      ctx.save();
      ctx.shadowColor = activeGlowColor;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = activeGlowColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#16a34a';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? '#FFFFFF' : '#111111';
      ctx.lineWidth = 1.25;
      ctx.stroke();
    } else if (mode === 'arming') {
      // Thin glowing active-color base ring + filling progress arc during 110ms hold
      ctx.save();
      ctx.shadowColor = activeGlowColor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(17, 17, 17, 0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.strokeStyle = activeGlowColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = activeGlowColor;
      ctx.fill();
    } else {
      // Glowing hover ring matching active color (or grab/pan/zoom/paused indicator)
      const cursorColor =
        mode === 'grab'
          ? '#00E676'
          : mode === 'pan' || mode === 'paused'
            ? '#FFAB00'
            : mode === 'zoom'
              ? '#FF4081'
              : activeGlowColor;

      ctx.save();
      ctx.shadowColor = cursorColor;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(x, y, 11.5, 0, Math.PI * 2);
      ctx.strokeStyle = cursorColor;
      ctx.lineWidth = 1.75;
      if (mode === 'paused') {
        ctx.setLineDash([3, 3]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = cursorColor;
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
}

export function getEditingShapeScreenRect(
  shape: BoardShape,
  viewport: ViewportState,
): { left: number; top: number; width: number; height: number } {
  const topLeft = worldToScreen({ x: shape.x, y: shape.y }, viewport);
  return {
    left: topLeft.x,
    top: topLeft.y,
    width: Math.max(120, shape.width * viewport.zoom),
    height: Math.max(44, shape.height * viewport.zoom),
  };
}
