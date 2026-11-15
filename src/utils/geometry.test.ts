import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getConnectorEndpoints,
  hitTestShape,
  moveShapeByDelta,
  recognizeRoughStroke,
  screenToWorld,
  worldToScreen,
  zoomViewportAtPoint,
} from './geometry';
import type { BoardConnector, BoardShape, Point, ViewportState } from '../types/board';

function makeCirclePoints(cx: number, cy: number, r: number, count = 40): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function makeRectPoints(x: number, y: number, w: number, h: number): Point[] {
  const pts: Point[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) pts.push({ x: x + (w * i) / steps, y });
  for (let i = 1; i <= steps; i++) pts.push({ x: x + w, y: y + (h * i) / steps });
  for (let i = 1; i <= steps; i++) pts.push({ x: x + w - (w * i) / steps, y: y + h });
  for (let i = 1; i <= steps; i++) pts.push({ x, y: y + h - (h * i) / steps });
  return pts;
}

function makeDiamondPoints(cx: number, cy: number, rx: number, ry: number): Point[] {
  const vertices = [
    { x: cx, y: cy - ry },
    { x: cx + rx, y: cy },
    { x: cx, y: cy + ry },
    { x: cx - rx, y: cy },
    { x: cx, y: cy - ry },
  ];
  const pts: Point[] = [];
  for (let v = 0; v < 4; v++) {
    const a = vertices[v];
    const b = vertices[v + 1];
    for (let i = 0; i < 10; i++) {
      const t = i / 10;
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  pts.push(vertices[4]);
  return pts;
}

test('recognizeRoughStroke classifies straight line, circle, rectangle, and diamond accurately', () => {
  const line = recognizeRoughStroke([
    { x: 10, y: 10 },
    { x: 60, y: 35 },
    { x: 110, y: 60 },
    { x: 160, y: 85 },
  ]);
  assert.equal(line?.kind, 'line');

  const circle = recognizeRoughStroke(makeCirclePoints(200, 200, 70));
  assert.equal(circle?.kind, 'circle');

  const rect = recognizeRoughStroke(makeRectPoints(100, 100, 180, 110));
  assert.equal(rect?.kind, 'rectangle');

  const diamond = recognizeRoughStroke(makeDiamondPoints(300, 300, 90, 70));
  assert.equal(diamond?.kind, 'diamond');
});

test('screenToWorld and worldToScreen are exact inverses and zoom keeps anchor fixed', () => {
  const vp: ViewportState = { panX: 120, panY: -45, zoom: 1.5 };
  const screen = { x: 420, y: 310 };
  const world = screenToWorld(screen, vp);
  const back = worldToScreen(world, vp);
  assert.ok(Math.abs(back.x - screen.x) < 1e-9);
  assert.ok(Math.abs(back.y - screen.y) < 1e-9);

  const zoomed = zoomViewportAtPoint(vp, 2.25, screen);
  const worldAfter = screenToWorld(screen, zoomed);
  assert.ok(Math.abs(worldAfter.x - world.x) < 1e-9);
  assert.ok(Math.abs(worldAfter.y - world.y) < 1e-9);
});

test('hitTestShape and dynamic smart connectors update when shapes move', () => {
  const shapeA: BoardShape = {
    id: 'a',
    kind: 'rectangle',
    x: 100,
    y: 100,
    width: 100,
    height: 80,
    strokeColor: 'auto',
    fillColor: 'transparent',
    strokeWidth: 2,
    text: 'A',
    fontSize: 16,
    seed: 1,
  };
  const shapeB: BoardShape = {
    id: 'b',
    kind: 'circle',
    x: 340,
    y: 100,
    width: 100,
    height: 100,
    strokeColor: 'auto',
    fillColor: 'transparent',
    strokeWidth: 2,
    text: 'B',
    fontSize: 16,
    seed: 2,
  };
  const conn: BoardConnector = {
    id: 'c1',
    fromShapeId: 'a',
    toShapeId: 'b',
    strokeColor: 'auto',
    strokeWidth: 2,
  };

  assert.equal(hitTestShape({ x: 150, y: 140 }, [shapeA, shapeB])?.id, 'a');
  assert.equal(hitTestShape({ x: 390, y: 150 }, [shapeA, shapeB])?.id, 'b');
  assert.equal(hitTestShape({ x: 20, y: 20 }, [shapeA, shapeB]), null);

  const before = getConnectorEndpoints(conn, [shapeA, shapeB]);
  assert.ok(before);
  assert.ok(before.end.x > before.start.x);

  const movedB = moveShapeByDelta(shapeB, 0, 200);
  const after = getConnectorEndpoints(conn, [shapeA, movedB]);
  assert.ok(after);
  assert.ok(after.end.y > before.end.y + 150);
});

import { classifyShape, hitTestResizeHandle, rdpSimplify, resizeShapeFromHandle } from './geometry';

test('rdpSimplify and classifyShape accurately classify line, rect, diamond, and circle', () => {
  const linePts = [
    { x: 0, y: 0 },
    { x: 50, y: 2 },
    { x: 100, y: 0 },
  ];
  assert.equal(rdpSimplify(linePts, 5).length, 2);
  assert.equal(classifyShape(linePts), 'line');
  assert.equal(classifyShape(makeRectPoints(0, 0, 140, 90)), 'rect');
  assert.equal(classifyShape(makeCirclePoints(100, 100, 60)), 'circle');
  assert.equal(classifyShape(makeDiamondPoints(100, 100, 70, 50)), 'diamond');
});

test('hitTestResizeHandle and resizeShapeFromHandle resize shape while enforcing minimum size', () => {
  const rect: BoardShape = {
    id: 'r1',
    kind: 'rectangle',
    x: 100,
    y: 100,
    width: 120,
    height: 80,
    strokeColor: 'auto',
    fillColor: 'transparent',
    strokeWidth: 2,
    text: '',
    fontSize: 16,
    seed: 1,
  };
  assert.equal(hitTestResizeHandle({ x: 227, y: 187 }, rect, 1), 'se');
  const enlarged = resizeShapeFromHandle(rect, 'se', { x: 280, y: 240 });
  assert.equal(enlarged.width, 180);
  assert.equal(enlarged.height, 140);

  const clamped = resizeShapeFromHandle(rect, 'se', { x: 105, y: 105 });
  assert.equal(clamped.width, 32);
  assert.equal(clamped.height, 32);
});

test('recognizeRoughStroke discards strokes shorter than 25px total length', () => {
  const shortLine = recognizeRoughStroke([
    { x: 100, y: 100 },
    { x: 112, y: 105 },
    { x: 118, y: 108 },
  ]);
  assert.equal(shortLine, null);
});
