import type { AirDrawFile, BoardShape, BoardState, ThemeMode } from '../types/board';

const HIDE_TUTORIAL_KEY = 'airdraw_hide_tutorial_v1';
const AUTOSAVE_BOARD_KEY = 'airdraw_autosave_v1';

export function getHideTutorialPreference(): boolean {
  try {
    return window.localStorage.getItem(HIDE_TUTORIAL_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setHideTutorialPreference(hide: boolean): void {
  try {
    if (hide) {
      window.localStorage.setItem(HIDE_TUTORIAL_KEY, 'true');
    } else {
      window.localStorage.removeItem(HIDE_TUTORIAL_KEY);
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function serializeAirDrawFile(state: BoardState): string {
  const payload: AirDrawFile = {
    type: 'airdraw',
    version: 1,
    savedAt: new Date().toISOString(),
    theme: state.theme,
    viewport: {
      panX: state.viewport.panX,
      panY: state.viewport.panY,
      zoom: state.viewport.zoom,
    },
    shapes: state.shapes.map((s) => ({
      ...s,
      color: s.strokeColor,
    })),
    connectors: state.connectors.map((c) => ({
      ...c,
      color: c.strokeColor,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseAirDrawFile(rawText: string): AirDrawFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Invalid .airdraw file: content is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid .airdraw file: expected a JSON object.');
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.type !== 'airdraw') {
    throw new Error('Invalid .airdraw file: missing "type": "airdraw" signature.');
  }

  const theme: ThemeMode = obj.theme === 'dark' ? 'dark' : 'light';
  const rawViewport = (obj.viewport && typeof obj.viewport === 'object'
    ? obj.viewport
    : {}) as Record<string, unknown>;

  const viewport = {
    panX: typeof rawViewport.panX === 'number' && Number.isFinite(rawViewport.panX) ? rawViewport.panX : 0,
    panY: typeof rawViewport.panY === 'number' && Number.isFinite(rawViewport.panY) ? rawViewport.panY : 0,
    zoom:
      typeof rawViewport.zoom === 'number' && Number.isFinite(rawViewport.zoom) && rawViewport.zoom > 0
        ? Math.min(4, Math.max(0.2, rawViewport.zoom))
        : 1,
  };

  if (!Array.isArray(obj.shapes) || !Array.isArray(obj.connectors)) {
    throw new Error('Invalid .airdraw file: shapes and connectors arrays are required.');
  }

  const shapes: BoardShape[] = obj.shapes
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((s, idx) => {
      const resolvedColor =
        typeof s.strokeColor === 'string'
          ? s.strokeColor
          : typeof s.color === 'string'
            ? s.color
            : 'auto';
      return {
        id: typeof s.id === 'string' ? s.id : `shape_${idx}_${Date.now()}`,
        kind:
          s.kind === 'rectangle' ||
          s.kind === 'circle' ||
          s.kind === 'diamond' ||
          s.kind === 'line' ||
          s.kind === 'text' ||
          s.kind === 'freehand'
            ? s.kind
            : 'rectangle',
        x: typeof s.x === 'number' ? s.x : 0,
        y: typeof s.y === 'number' ? s.y : 0,
        width: typeof s.width === 'number' ? s.width : 120,
        height: typeof s.height === 'number' ? s.height : 80,
        points: Array.isArray(s.points)
          ? s.points
              .filter(
                (p): p is { x: number; y: number } =>
                  Boolean(
                    p &&
                      typeof p === 'object' &&
                      typeof (p as { x?: unknown }).x === 'number' &&
                      typeof (p as { y?: unknown }).y === 'number',
                  ),
              )
              .map((p) => ({ x: p.x, y: p.y }))
          : undefined,
        strokeColor: resolvedColor,
        color: resolvedColor,
        fillColor: typeof s.fillColor === 'string' ? s.fillColor : 'transparent',
        strokeWidth: typeof s.strokeWidth === 'number' ? s.strokeWidth : 2.5,
        text: typeof s.text === 'string' ? s.text : '',
        fontSize: typeof s.fontSize === 'number' ? s.fontSize : 18,
        seed: typeof s.seed === 'number' ? s.seed : idx + 1,
      };
    });

  const shapeIds = new Set(shapes.map((s) => s.id));
  const connectors = obj.connectors
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .filter(
      (c) =>
        typeof c.fromShapeId === 'string' &&
        typeof c.toShapeId === 'string' &&
        shapeIds.has(c.fromShapeId) &&
        shapeIds.has(c.toShapeId),
    )
    .map((c, idx) => {
      const resolvedColor =
        typeof c.strokeColor === 'string'
          ? c.strokeColor
          : typeof c.color === 'string'
            ? c.color
            : 'auto';
      return {
        id: typeof c.id === 'string' ? c.id : `conn_${idx}_${Date.now()}`,
        fromShapeId: c.fromShapeId as string,
        toShapeId: c.toShapeId as string,
        strokeColor: resolvedColor,
        color: resolvedColor,
        strokeWidth: typeof c.strokeWidth === 'number' ? c.strokeWidth : 2.5,
        label: typeof c.label === 'string' ? c.label : undefined,
      };
    });

  return {
    type: 'airdraw',
    version: 1,
    savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : new Date().toISOString(),
    theme,
    viewport,
    shapes,
    connectors,
  };
}

export function loadAutosavedBoard(): BoardState | null {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_BOARD_KEY);
    if (!raw) return null;
    const parsed = parseAirDrawFile(raw);
    return {
      theme: parsed.theme,
      viewport: parsed.viewport,
      shapes: parsed.shapes,
      connectors: parsed.connectors,
    };
  } catch {
    return null;
  }
}

export function saveAutosavedBoard(state: BoardState): void {
  try {
    window.localStorage.setItem(AUTOSAVE_BOARD_KEY, serializeAirDrawFile(state));
  } catch {
    // Ignore storage errors
  }
}

export function createPracticeSeedBoard(theme: ThemeMode): BoardState {
  return {
    theme,
    viewport: { panX: 0, panY: 0, zoom: 1 },
    shapes: [
      {
        id: 'practice_node_a',
        kind: 'rectangle',
        x: 240,
        y: 230,
        width: 170,
        height: 96,
        strokeColor: 'auto',
        fillColor: 'transparent',
        strokeWidth: 2.5,
        text: 'Idea A',
        fontSize: 18,
        seed: 101,
      },
      {
        id: 'practice_node_b',
        kind: 'diamond',
        x: 560,
        y: 220,
        width: 170,
        height: 116,
        strokeColor: 'auto',
        fillColor: 'transparent',
        strokeWidth: 2.5,
        text: 'Target B',
        fontSize: 18,
        seed: 202,
      },
    ],
    connectors: [],
  };
}
