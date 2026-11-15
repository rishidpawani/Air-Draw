import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BottomLeftControls } from './components/BottomLeftControls';
import { GestureTutorialModal } from './components/GestureTutorialModal';
import { PracticeBanner } from './components/PracticeBanner';
import { TopToolbar } from './components/TopToolbar';
import { WebcamPiP } from './components/WebcamPiP';
import type {
  BoardConnector,
  BoardShape,
  BoardState,
  CursorVisualState,
  GestureType,
  HandTrackingResult,
  Point,
  PracticeProgress,
  ThemeMode,
  ToolMode,
  ViewportState,
} from './types/board';
import {
  getEditingShapeScreenRect,
  renderBoardCanvas,
  resolveStrokeColor,
} from './utils/canvasRenderer';
import {
  distance,
  hitTestResizeHandle,
  hitTestShape,
  moveShapeByDelta,
  recognizeRoughStroke,
  resizeShapeFromHandle,
  screenToWorld,
  zoomViewportAtPoint,
  type ResizeCorner,
} from './utils/geometry';
import {
  FingerColorController,
  GestureGuard,
  OneEuroFilter,
  processTwoHandsTransform,
} from './utils/gestureClassifier';
import {
  createPracticeSeedBoard,
  getHideTutorialPreference,
  loadAutosavedBoard,
  parseAirDrawFile,
  saveAutosavedBoard,
  serializeAirDrawFile,
  setHideTutorialPreference,
} from './utils/storage';

interface HistorySnapshot {
  shapes: BoardShape[];
  connectors: BoardConnector[];
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function shouldSkipTutorialOnLoad(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1') return true;
  return getHideTutorialPreference();
}

export default function App() {
  const initialAutosave = useRef<BoardState | null>(null);
  if (initialAutosave.current === null && typeof window !== 'undefined') {
    initialAutosave.current = loadAutosavedBoard();
  }

  const [theme, setTheme] = useState<ThemeMode>(initialAutosave.current?.theme ?? 'light');
  const [viewport, setViewport] = useState<ViewportState>(
    initialAutosave.current?.viewport ?? { panX: 0, panY: 0, zoom: 1 },
  );
  const [shapes, setShapes] = useState<BoardShape[]>(initialAutosave.current?.shapes ?? []);
  const [connectors, setConnectors] = useState<BoardConnector[]>(
    initialAutosave.current?.connectors ?? [],
  );

  const [historyPast, setHistoryPast] = useState<HistorySnapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<HistorySnapshot[]>([]);

  const [activeTool, setActiveTool] = useState<ToolMode>('smart');
  const [strokeColor, setStrokeColor] = useState<string>('auto');
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  const [tutorialOpen, setTutorialOpen] = useState<boolean>(() => !shouldSkipTutorialOnLoad());
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(() => getHideTutorialPreference());
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(false);
  const [cameraDrawPaused, setCameraDrawPaused] = useState<boolean>(false);
  const [practiceMode, setPracticeMode] = useState<boolean>(false);
  const [practiceProgress, setPracticeProgress] = useState<PracticeProgress>({
    drewShape: false,
    connectedShapes: false,
    movedShape: false,
    typedText: false,
  });
  const [notice, setNotice] = useState<{ text: string; isError?: boolean } | null>(null);

  // Refs for 60Hz canvas rendering without React re-render overhead
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stateRef = useRef({
    theme,
    viewport,
    shapes,
    connectors,
    selectedShapeId,
    editingShapeId,
    strokeColor,
    activeTool,
    cameraDrawPaused,
  });
  stateRef.current = {
    theme,
    viewport,
    shapes,
    connectors,
    selectedShapeId,
    editingShapeId,
    strokeColor,
    activeTool,
    cameraDrawPaused,
  };

  const hoveredShapeIdRef = useRef<string | null>(null);
  const activeStrokeRef = useRef<Point[] | null>(null);
  const activeDraftShapeRef = useRef<BoardShape | null>(null);
  const activeConnectorRef = useRef<{
    fromShapeId: string;
    toPoint: Point;
    snapShapeId: string | null;
  } | null>(null);
  const virtualCursorRef = useRef<Point | null>(null);
  const activeGestureRef = useRef<GestureType>('idle');
  const cursorVisualRef = useRef<CursorVisualState>({ mode: 'hover', progress: 0 });
  const spacePressedRef = useRef<boolean>(false);

  // Pointer interaction state
  const pointerModeRef = useRef<
    | { type: 'none' }
    | { type: 'draw_stroke' }
    | { type: 'draw_shape'; startWorld: Point; kind: 'rectangle' | 'circle' | 'diamond' | 'line' }
    | { type: 'connect'; fromShapeId: string }
    | { type: 'drag_shape'; shapeId: string; lastWorld: Point; snapshotBefore: HistorySnapshot; moved: boolean }
    | { type: 'resize_shape'; shapeId: string; corner: ResizeCorner; initialShape: BoardShape; snapshotBefore: HistorySnapshot; resized: boolean }
    | { type: 'pan'; lastScreen: Point }
  >({ type: 'none' });

  // Hand gesture state machine refs
  const handStateRef = useRef<{
    filterX: OneEuroFilter;
    filterY: OneEuroFilter;
    gestureGuard: GestureGuard;
    colorController: FingerColorController;
    prevGesture: GestureType;
    grabShapeId: string | null;
    grabLastWorld: Point | null;
    grabSnapshotBefore: HistorySnapshot | null;
    grabMoved: boolean;
    panLastScreen: Point | null;
    prevTwoHandDist: number | null;
    prevTwoHandMid: Point | null;
    connectFromShapeId: string | null;
  }>({
    filterX: new OneEuroFilter(1.5, 0.05),
    filterY: new OneEuroFilter(1.5, 0.05),
    gestureGuard: new GestureGuard(),
    colorController: new FingerColorController(),
    prevGesture: 'idle',
    grabShapeId: null,
    grabLastWorld: null,
    grabSnapshotBefore: null,
    grabMoved: false,
    panLastScreen: null,
    prevTwoHandDist: null,
    prevTwoHandMid: null,
    connectFromShapeId: null,
  });

  const showNotice = useCallback((text: string, isError = false) => {
    setNotice({ text, isError });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Sync Tailwind .dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Persist board to localStorage on changes
  useEffect(() => {
    saveAutosavedBoard({ theme, viewport, shapes, connectors });
  }, [theme, viewport, shapes, connectors]);

  const pushHistory = useCallback((prevShapes: BoardShape[], prevConnectors: BoardConnector[]) => {
    setHistoryPast((past) => [...past.slice(-39), { shapes: prevShapes, connectors: prevConnectors }]);
    setHistoryFuture([]);
  }, []);

  const handleUndo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      setHistoryFuture((future) => [
        { shapes: stateRef.current.shapes, connectors: stateRef.current.connectors },
        ...future,
      ]);
      setShapes(previous.shapes);
      setConnectors(previous.connectors);
      setSelectedShapeId(null);
      setEditingShapeId(null);
      return past.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistoryFuture((future) => {
      if (future.length === 0) return future;
      const next = future[0];
      setHistoryPast((past) => [
        ...past,
        { shapes: stateRef.current.shapes, connectors: stateRef.current.connectors },
      ]);
      setShapes(next.shapes);
      setConnectors(next.connectors);
      setSelectedShapeId(null);
      setEditingShapeId(null);
      return future.slice(1);
    });
  }, []);

  // Begin inline text editing on existing shape or new floating text at worldPoint
  const openTextEditorAt = useCallback(
    (worldPoint: Point) => {
      const currentShapes = stateRef.current.shapes;
      const hit = hitTestShape(worldPoint, currentShapes, 4);

      if (hit && hit.kind !== 'line' && hit.kind !== 'freehand') {
        setSelectedShapeId(hit.id);
        setEditingShapeId(hit.id);
        setEditingText(hit.text);
        return;
      }

      // Create floating text box
      const newTextShape: BoardShape = {
        id: createId('text'),
        kind: 'text',
        x: worldPoint.x - 90,
        y: worldPoint.y - 22,
        width: 180,
        height: 44,
        strokeColor: stateRef.current.strokeColor,
        fillColor: 'transparent',
        strokeWidth: 2,
        text: '',
        fontSize: 19,
        seed: Math.floor(Math.random() * 10000),
      };
      pushHistory(stateRef.current.shapes, stateRef.current.connectors);
      setShapes((prev) => [...prev, newTextShape]);
      setSelectedShapeId(newTextShape.id);
      setEditingShapeId(newTextShape.id);
      setEditingText('');
    },
    [pushHistory],
  );

  useEffect(() => {
    if (editingShapeId && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editingShapeId]);

  const commitTextEdit = useCallback(() => {
    if (!editingShapeId) return;
    const trimmed = editingText.trim();
    const targetId = editingShapeId;
    const targetShape = stateRef.current.shapes.find((s) => s.id === targetId);

    if (targetShape) {
      if (targetShape.kind === 'text' && !trimmed) {
        // Remove empty floating text
        setShapes((prev) => prev.filter((s) => s.id !== targetId));
      } else if (targetShape.text !== editingText) {
        pushHistory(stateRef.current.shapes, stateRef.current.connectors);
        setShapes((prev) =>
          prev.map((s) => (s.id === targetId ? { ...s, text: editingText } : s)),
        );
        if (trimmed) {
          setPracticeProgress((p) => ({ ...p, typedText: true }));
        }
      }
    }
    setEditingShapeId(null);
  }, [editingShapeId, editingText, pushHistory]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingShapeId) {
        if (e.key === 'Escape') {
          setEditingShapeId(null);
        }
        return;
      }

      if (e.code === 'Space') {
        spacePressedRef.current = true;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedShapeId) {
        e.preventDefault();
        pushHistory(stateRef.current.shapes, stateRef.current.connectors);
        setShapes((prev) => prev.filter((s) => s.id !== selectedShapeId));
        setConnectors((prev) =>
          prev.filter(
            (c) => c.fromShapeId !== selectedShapeId && c.toShapeId !== selectedShapeId,
          ),
        );
        setSelectedShapeId(null);
        return;
      }

      const toolShortcuts: Record<string, ToolMode> = {
        '1': 'smart',
        '2': 'select',
        '3': 'rectangle',
        '4': 'circle',
        '5': 'diamond',
        '6': 'line',
        '7': 'connector',
        '8': 'text',
        '9': 'pan',
      };
      if (!e.metaKey && !e.ctrlKey && !e.altKey && toolShortcuts[e.key]) {
        setActiveTool(toolShortcuts[e.key]);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [editingShapeId, handleRedo, handleUndo, pushHistory, selectedShapeId]);

  const renderPendingRef = useRef<number | null>(null);

  const scheduleRender = useCallback(() => {
    if (renderPendingRef.current !== null) return;
    renderPendingRef.current = requestAnimationFrame(() => {
      renderPendingRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderBoardCanvas({
        ctx,
        width: rect.width,
        height: rect.height,
        dpr,
        theme: stateRef.current.theme,
        viewport: stateRef.current.viewport,
        shapes: stateRef.current.shapes,
        connectors: stateRef.current.connectors,
        selectedShapeId: stateRef.current.selectedShapeId,
        editingShapeId: stateRef.current.editingShapeId,
        hoveredShapeId: hoveredShapeIdRef.current,
        activeStrokePoints: activeStrokeRef.current,
        activeDraftShape: activeDraftShapeRef.current,
        activeConnectorPreview: activeConnectorRef.current,
        virtualCursorScreen: virtualCursorRef.current,
        activeGesture: activeGestureRef.current,
        cursorVisual: cursorVisualRef.current,
        strokeColor: stateRef.current.strokeColor,
      });
    });
  }, []);

  // Re-render canvas whenever React board state changes or window resizes
  useEffect(() => {
    scheduleRender();
  }, [theme, viewport, shapes, connectors, selectedShapeId, editingShapeId, strokeColor, scheduleRender]);

  useEffect(() => {
    const onResize = () => scheduleRender();
    window.addEventListener('resize', onResize);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) scheduleRender();
    });
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      if (renderPendingRef.current !== null) {
        cancelAnimationFrame(renderPendingRef.current);
      }
    };
  }, [scheduleRender]);

  // Finalize a rough stroke into a snapped geometric shape
  const finalizeRoughStroke = useCallback(
    (points: Point[]) => {
      const recognized = recognizeRoughStroke(points);
      if (!recognized) return;

      const newShape: BoardShape = {
        id: createId(recognized.kind),
        kind: recognized.kind,
        x: recognized.x,
        y: recognized.y,
        width: recognized.width,
        height: recognized.height,
        points: recognized.points,
        strokeColor: stateRef.current.strokeColor,
        fillColor: 'transparent',
        strokeWidth: 2.5,
        text: '',
        fontSize: 18,
        seed: Math.floor(Math.random() * 10000),
      };

      pushHistory(stateRef.current.shapes, stateRef.current.connectors);
      setShapes((prev) => [...prev, newShape]);
      setSelectedShapeId(newShape.id);
      setPracticeProgress((p) => ({ ...p, drewShape: true }));

      const labelMap: Record<string, string> = {
        rectangle: 'Snapped to Rectangle',
        circle: 'Snapped to Circle',
        diamond: 'Snapped to Diamond',
        line: 'Snapped to Straight Line',
        freehand: 'Freehand stroke added',
      };
      showNotice(labelMap[recognized.kind] ?? 'Shape added');
    },
    [pushHistory, showNotice],
  );

  const createConnectorBetween = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const alreadyExists = stateRef.current.connectors.some(
        (c) =>
          (c.fromShapeId === fromId && c.toShapeId === toId) ||
          (c.fromShapeId === toId && c.toShapeId === fromId),
      );
      if (alreadyExists) return;

      const newConn: BoardConnector = {
        id: createId('conn'),
        fromShapeId: fromId,
        toShapeId: toId,
        strokeColor: stateRef.current.strokeColor,
        strokeWidth: 2.5,
      };
      pushHistory(stateRef.current.shapes, stateRef.current.connectors);
      setConnectors((prev) => [...prev, newConn]);
      setPracticeProgress((p) => ({ ...p, connectedShapes: true }));
      showNotice('Smart connector attached');
    },
    [pushHistory, showNotice],
  );

  // Mouse / Touch Pointer Event Handlers
  const getCanvasPoint = (clientX: number, clientY: number): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingShapeId) {
      commitTextEdit();
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const screenPt = getCanvasPoint(e.clientX, e.clientY);
    const worldPt = screenToWorld(screenPt, stateRef.current.viewport);
    const tool = stateRef.current.activeTool;

    // Middle mouse or Space+click or Pan tool -> Pan
    if (e.button === 1 || spacePressedRef.current || tool === 'pan') {
      pointerModeRef.current = { type: 'pan', lastScreen: screenPt };
      return;
    }

    if (tool === 'text') {
      openTextEditorAt(worldPt);
      return;
    }

    const hit = hitTestShape(worldPt, stateRef.current.shapes);

    if (tool === 'select') {
      const currentSelected = stateRef.current.selectedShapeId
        ? stateRef.current.shapes.find((s) => s.id === stateRef.current.selectedShapeId) ?? null
        : null;
      if (currentSelected) {
        const corner = hitTestResizeHandle(worldPt, currentSelected, stateRef.current.viewport.zoom);
        if (corner) {
          pointerModeRef.current = {
            type: 'resize_shape',
            shapeId: currentSelected.id,
            corner,
            initialShape: currentSelected,
            snapshotBefore: {
              shapes: stateRef.current.shapes,
              connectors: stateRef.current.connectors,
            },
            resized: false,
          };
          return;
        }
      }
      if (hit) {
        setSelectedShapeId(hit.id);
        pointerModeRef.current = {
          type: 'drag_shape',
          shapeId: hit.id,
          lastWorld: worldPt,
          snapshotBefore: {
            shapes: stateRef.current.shapes,
            connectors: stateRef.current.connectors,
          },
          moved: false,
        };
      } else {
        setSelectedShapeId(null);
        pointerModeRef.current = { type: 'pan', lastScreen: screenPt };
      }
      return;
    }

    if (tool === 'connector') {
      if (hit) {
        pointerModeRef.current = { type: 'connect', fromShapeId: hit.id };
        activeConnectorRef.current = {
          fromShapeId: hit.id,
          toPoint: worldPt,
          snapShapeId: null,
        };
      }
      return;
    }

    if (tool === 'rectangle' || tool === 'circle' || tool === 'diamond' || tool === 'line') {
      pointerModeRef.current = { type: 'draw_shape', startWorld: worldPt, kind: tool };
      activeDraftShapeRef.current = {
        id: 'draft',
        kind: tool,
        x: worldPt.x,
        y: worldPt.y,
        width: 1,
        height: 1,
        points: tool === 'line' ? [worldPt, worldPt] : undefined,
        strokeColor: stateRef.current.strokeColor,
        fillColor: 'transparent',
        strokeWidth: 2.5,
        text: '',
        fontSize: 18,
        seed: 42,
      };
      return;
    }

    // Smart Mode: starting inside a shape starts a Smart Connector; starting outside draws & snaps!
    if (hit && hit.kind !== 'line' && hit.kind !== 'freehand') {
      setSelectedShapeId(hit.id);
      pointerModeRef.current = { type: 'connect', fromShapeId: hit.id };
      activeConnectorRef.current = {
        fromShapeId: hit.id,
        toPoint: worldPt,
        snapShapeId: null,
      };
      return;
    }

    setSelectedShapeId(null);
    pointerModeRef.current = { type: 'draw_stroke' };
    activeStrokeRef.current = [worldPt];
    scheduleRender();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const screenPt = getCanvasPoint(e.clientX, e.clientY);
    const worldPt = screenToWorld(screenPt, stateRef.current.viewport);
    const mode = pointerModeRef.current;

    if (mode.type === 'none') {
      const hovered = hitTestShape(worldPt, stateRef.current.shapes);
      const nextHoveredId = hovered?.id ?? null;
      if (hoveredShapeIdRef.current !== nextHoveredId) {
        hoveredShapeIdRef.current = nextHoveredId;
        scheduleRender();
      }
      return;
    }

    if (mode.type === 'pan') {
      const dx = screenPt.x - mode.lastScreen.x;
      const dy = screenPt.y - mode.lastScreen.y;
      mode.lastScreen = screenPt;
      setViewport((vp) => ({ ...vp, panX: vp.panX + dx, panY: vp.panY + dy }));
      return;
    }

    if (mode.type === 'drag_shape') {
      const dx = worldPt.x - mode.lastWorld.x;
      const dy = worldPt.y - mode.lastWorld.y;
      if (Math.hypot(dx, dy) > 0.2) {
        mode.moved = true;
      }
      mode.lastWorld = worldPt;
      setShapes((prev) =>
        prev.map((s) => (s.id === mode.shapeId ? moveShapeByDelta(s, dx, dy) : s)),
      );
      return;
    }

    if (mode.type === 'resize_shape') {
      mode.resized = true;
      const updated = resizeShapeFromHandle(mode.initialShape, mode.corner, worldPt);
      setShapes((prev) => prev.map((s) => (s.id === mode.shapeId ? updated : s)));
      return;
    }

    if (mode.type === 'connect') {
      const target = hitTestShape(worldPt, stateRef.current.shapes);
      const snapId =
        target &&
        target.id !== mode.fromShapeId &&
        target.kind !== 'line' &&
        target.kind !== 'freehand'
          ? target.id
          : null;
      activeConnectorRef.current = {
        fromShapeId: mode.fromShapeId,
        toPoint: worldPt,
        snapShapeId: snapId,
      };
      scheduleRender();
      return;
    }

    if (mode.type === 'draw_shape') {
      const { startWorld, kind } = mode;
      if (kind === 'line') {
        activeDraftShapeRef.current = {
          id: 'draft',
          kind: 'line',
          x: Math.min(startWorld.x, worldPt.x),
          y: Math.min(startWorld.y, worldPt.y),
          width: Math.abs(worldPt.x - startWorld.x),
          height: Math.abs(worldPt.y - startWorld.y),
          points: [startWorld, worldPt],
          strokeColor: stateRef.current.strokeColor,
          fillColor: 'transparent',
          strokeWidth: 2.5,
          text: '',
          fontSize: 18,
          seed: 42,
        };
      } else {
        activeDraftShapeRef.current = {
          id: 'draft',
          kind,
          x: Math.min(startWorld.x, worldPt.x),
          y: Math.min(startWorld.y, worldPt.y),
          width: Math.abs(worldPt.x - startWorld.x),
          height: Math.abs(worldPt.y - startWorld.y),
          strokeColor: stateRef.current.strokeColor,
          fillColor: 'transparent',
          strokeWidth: 2.5,
          text: '',
          fontSize: 18,
          seed: 42,
        };
      }
      scheduleRender();
      return;
    }

    if (mode.type === 'draw_stroke' && activeStrokeRef.current) {
      const pts = activeStrokeRef.current;
      const last = pts[pts.length - 1];
      if (!last || distance(last, worldPt) >= 3) {
        pts.push(worldPt);
        scheduleRender();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    const mode = pointerModeRef.current;
    pointerModeRef.current = { type: 'none' };

    if (mode.type === 'drag_shape') {
      if (mode.moved) {
        pushHistory(mode.snapshotBefore.shapes, mode.snapshotBefore.connectors);
        setPracticeProgress((p) => ({ ...p, movedShape: true }));
      }
      return;
    }

    if (mode.type === 'resize_shape') {
      if (mode.resized) {
        pushHistory(mode.snapshotBefore.shapes, mode.snapshotBefore.connectors);
      }
      return;
    }

    if (mode.type === 'connect') {
      const preview = activeConnectorRef.current;
      activeConnectorRef.current = null;
      if (preview?.snapShapeId) {
        createConnectorBetween(mode.fromShapeId, preview.snapShapeId);
      }
      scheduleRender();
      return;
    }

    if (mode.type === 'draw_shape') {
      const draft = activeDraftShapeRef.current;
      activeDraftShapeRef.current = null;
      if (draft && Math.hypot(draft.width, draft.height) >= 14) {
        const finalShape: BoardShape = {
          ...draft,
          id: createId(draft.kind),
          seed: Math.floor(Math.random() * 10000),
        };
        pushHistory(stateRef.current.shapes, stateRef.current.connectors);
        setShapes((prev) => [...prev, finalShape]);
        setSelectedShapeId(finalShape.id);
        setPracticeProgress((p) => ({ ...p, drewShape: true }));
      }
      scheduleRender();
      return;
    }

    if (mode.type === 'draw_stroke') {
      const stroke = activeStrokeRef.current;
      activeStrokeRef.current = null;
      if (stroke && stroke.length >= 2) {
        finalizeRoughStroke(stroke);
      }
      scheduleRender();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const screenPt = getCanvasPoint(e.clientX, e.clientY);
    const worldPt = screenToWorld(screenPt, stateRef.current.viewport);
    openTextEditorAt(worldPt);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const screenPt = getCanvasPoint(e.clientX, e.clientY);
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      const zoomFactor = e.deltaY < 0 ? 1.09 : 0.91;
      setViewport((vp) => zoomViewportAtPoint(vp, vp.zoom * zoomFactor, screenPt));
    }
  };

  // Webcam Hand Tracking Frame Handler
  const handleTrackingFrame = useCallback(
    (frame: HandTrackingResult) => {
      const canvas = canvasRef.current;
      const hs = handStateRef.current;

      const finishActiveCameraDraw = () => {
        if (hs.connectFromShapeId) {
          const preview = activeConnectorRef.current;
          activeConnectorRef.current = null;
          if (preview?.snapShapeId) {
            createConnectorBetween(hs.connectFromShapeId, preview.snapShapeId);
          }
          hs.connectFromShapeId = null;
        } else if (activeStrokeRef.current) {
          const stroke = activeStrokeRef.current;
          activeStrokeRef.current = null;
          if (stroke.length >= 2) {
            finalizeRoughStroke(stroke);
          }
        }
      };

      if (!canvas || frame.detectedHands === 0 || !frame.cursorNorm) {
        finishActiveCameraDraw();
        if (hs.prevGesture === 'pinch_middle' && hs.grabMoved && hs.grabSnapshotBefore) {
          pushHistory(hs.grabSnapshotBefore.shapes, hs.grabSnapshotBefore.connectors);
          setPracticeProgress((p) => ({ ...p, movedShape: true }));
        }
        hs.gestureGuard.reset();
        hs.colorController.reset();
        hs.grabShapeId = null;
        hs.grabMoved = false;
        hs.panLastScreen = null;
        hs.prevTwoHandDist = null;
        hs.prevTwoHandMid = null;
        hs.filterX.reset();
        hs.filterY.reset();
        hs.prevGesture = 'idle';
        virtualCursorRef.current = null;
        activeGestureRef.current = 'idle';
        cursorVisualRef.current = { mode: 'hover', progress: 0 };
        scheduleRender();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const rawScreen: Point = {
        x: frame.cursorNorm.x * rect.width,
        y: frame.cursorNorm.y * rect.height,
      };
      const screenPt: Point = {
        x: hs.filterX.filter(rawScreen.x, frame.timestamp),
        y: hs.filterY.filter(rawScreen.y, frame.timestamp),
      };
      virtualCursorRef.current = screenPt;

      const worldPt = screenToWorld(screenPt, stateRef.current.viewport);
      const prevGesture = hs.prevGesture;

      // Two-hand pinch -> Smooth Two-Hand Zoom & Pan anchored at midpoint
      if (frame.gesture === 'two_hand_zoom' && frame.twoHandDistance !== null) {
        finishActiveCameraDraw();
        hs.gestureGuard.reset();
        hs.colorController.reset();
        const currMidScreen: Point = frame.twoHandMidpointNorm
          ? {
              x: frame.twoHandMidpointNorm.x * rect.width,
              y: frame.twoHandMidpointNorm.y * rect.height,
            }
          : screenPt;

        if (hs.prevTwoHandDist !== null && hs.prevTwoHandMid !== null) {
          const prevD = hs.prevTwoHandDist;
          const prevM = hs.prevTwoHandMid;
          const currD = frame.twoHandDistance;
          setViewport((vp) => processTwoHandsTransform(vp, prevD, prevM, currD, currMidScreen));
        }
        hs.prevTwoHandDist = frame.twoHandDistance;
        hs.prevTwoHandMid = currMidScreen;
        hs.prevGesture = 'two_hand_zoom';
        activeGestureRef.current = 'two_hand_zoom';
        cursorVisualRef.current = { mode: 'zoom', progress: 0 };
        scheduleRender();
        return;
      }
      hs.prevTwoHandDist = null;
      hs.prevTwoHandMid = null;

      // Finger-Count Color Switching (Left Hand when 2 hands present OR 350ms steady 1-hand hold locked during pinch)
      const isSingleHandPinchLocked =
        frame.gesture === 'pinch_index' ||
        frame.gesture === 'pinch_middle' ||
        frame.gesture === 'fist' ||
        hs.gestureGuard.isDrawing ||
        hs.gestureGuard.pinchStartTime > 0;

      const colorEvt = hs.colorController.update(frame.colorFingerCount ?? null, {
        hasLeftColorHand: Boolean(frame.hasLeftColorHand),
        isPinchLocked: isSingleHandPinchLocked,
        activeColor: stateRef.current.strokeColor,
        now: frame.timestamp,
      });
      if (colorEvt) {
        setStrokeColor(colorEvt.strokeColor);
        stateRef.current.strokeColor = colorEvt.strokeColor;
        showNotice(
          `Color: ${colorEvt.label} (${colorEvt.count} ${colorEvt.count === 1 ? 'finger' : 'fingers'})`,
        );
      }

      // Transition OUT of pinch_middle
      if (prevGesture === 'pinch_middle' && frame.gesture !== 'pinch_middle') {
        if (hs.grabMoved && hs.grabSnapshotBefore) {
          pushHistory(hs.grabSnapshotBefore.shapes, hs.grabSnapshotBefore.connectors);
          setPracticeProgress((p) => ({ ...p, movedShape: true }));
        }
        hs.grabShapeId = null;
        hs.grabMoved = false;
        hs.grabSnapshotBefore = null;
      }

      // Transition OUT of fist
      if (prevGesture === 'fist' && frame.gesture !== 'fist') {
        hs.panLastScreen = null;
      }

      // If inline text editor is active, keep cursor visible in hover without triggering canvas strokes/pans
      if (stateRef.current.editingShapeId) {
        finishActiveCameraDraw();
        hs.gestureGuard.reset();
        activeGestureRef.current = 'hover';
        cursorVisualRef.current = { mode: 'hover', progress: 0 };
        hs.prevGesture = 'hover';
        scheduleRender();
        return;
      }

      // Priority 1: Middle pinch -> Grab & Move
      if (frame.gesture === 'pinch_middle') {
        finishActiveCameraDraw();
        hs.gestureGuard.reset();
        activeGestureRef.current = 'pinch_middle';
        cursorVisualRef.current = { mode: 'grab', progress: 0 };

        if (prevGesture !== 'pinch_middle') {
          const hit = hitTestShape(worldPt, stateRef.current.shapes);
          if (hit) {
            setSelectedShapeId(hit.id);
            hs.grabShapeId = hit.id;
            hs.grabLastWorld = worldPt;
            hs.grabMoved = false;
            hs.grabSnapshotBefore = {
              shapes: stateRef.current.shapes,
              connectors: stateRef.current.connectors,
            };
          }
        } else if (hs.grabShapeId && hs.grabLastWorld) {
          const dx = worldPt.x - hs.grabLastWorld.x;
          const dy = worldPt.y - hs.grabLastWorld.y;
          if (Math.hypot(dx, dy) > 0.3) {
            hs.grabMoved = true;
          }
          hs.grabLastWorld = worldPt;
          const targetId = hs.grabShapeId;
          setShapes((prev) =>
            prev.map((s) => (s.id === targetId ? moveShapeByDelta(s, dx, dy) : s)),
          );
        }

        hs.prevGesture = 'pinch_middle';
        scheduleRender();
        return;
      }

      // Priority 2: Closed fist -> Pan infinite canvas
      if (frame.gesture === 'fist') {
        finishActiveCameraDraw();
        hs.gestureGuard.reset();
        activeGestureRef.current = 'fist';
        cursorVisualRef.current = { mode: 'pan', progress: 0 };

        if (hs.panLastScreen) {
          const dx = screenPt.x - hs.panLastScreen.x;
          const dy = screenPt.y - hs.panLastScreen.y;
          setViewport((vp) => ({ ...vp, panX: vp.panX + dx, panY: vp.panY + dy }));
        }
        hs.panLastScreen = screenPt;
        hs.prevGesture = 'fist';
        scheduleRender();
        return;
      }

      // Priority 3: Pause Camera Drawing toggle active -> allow hover/grab/pan/zoom, block drawing
      if (stateRef.current.cameraDrawPaused) {
        finishActiveCameraDraw();
        hs.gestureGuard.reset();
        const hit = hitTestShape(worldPt, stateRef.current.shapes);
        hoveredShapeIdRef.current = hit?.id ?? null;
        activeGestureRef.current = 'hover';
        cursorVisualRef.current = { mode: 'paused', progress: 0 };
        hs.prevGesture = 'hover';
        scheduleRender();
        return;
      }

      // Priority 4: Anti-accidental-drawing GestureGuard (110ms dwell + 18px deadzone + open fingers + speed/edge gates + double-pinch)
      if (frame.primaryLandmarks) {
        const guardRes = hs.gestureGuard.update(
          frame.primaryLandmarks,
          screenPt.x,
          screenPt.y,
          rect.width,
          rect.height,
          frame.timestamp,
        );

        if (guardRes.state === 'IDLE') {
          finishActiveCameraDraw();
          hoveredShapeIdRef.current = null;
          activeGestureRef.current = 'idle';
          cursorVisualRef.current = { mode: 'hover', progress: 0 };
          hs.prevGesture = 'idle';
        } else if (guardRes.state === 'HOVER') {
          const hit = hitTestShape(worldPt, stateRef.current.shapes);
          hoveredShapeIdRef.current = hit?.id ?? null;
          activeGestureRef.current = 'hover';
          cursorVisualRef.current = { mode: 'hover', progress: 0 };
          hs.prevGesture = 'hover';
        } else if (guardRes.state === 'ARMING') {
          const hit = hitTestShape(worldPt, stateRef.current.shapes);
          hoveredShapeIdRef.current = hit?.id ?? null;
          activeGestureRef.current = 'hover';
          cursorVisualRef.current = { mode: 'arming', progress: guardRes.progress };
          hs.prevGesture = 'hover';
        } else if (guardRes.state === 'DOUBLE_PINCH') {
          finishActiveCameraDraw();
          activeGestureRef.current = 'hover';
          cursorVisualRef.current = { mode: 'hover', progress: 0 };
          hs.prevGesture = 'hover';
          const textWorld = screenToWorld(guardRes.pos, stateRef.current.viewport);
          openTextEditorAt(textWorld);
        } else if (guardRes.state === 'START_STROKE') {
          activeGestureRef.current = 'pinch_index';
          cursorVisualRef.current = { mode: 'drawing', progress: 1 };
          hs.prevGesture = 'pinch_index';

          const startWorld = screenToWorld(guardRes.startPos, stateRef.current.viewport);
          const hit = hitTestShape(startWorld, stateRef.current.shapes);
          if (hit && hit.kind !== 'line' && hit.kind !== 'freehand') {
            hs.connectFromShapeId = hit.id;
            activeConnectorRef.current = {
              fromShapeId: hit.id,
              toPoint: worldPt,
              snapShapeId: null,
            };
          } else {
            hs.connectFromShapeId = null;
            activeStrokeRef.current = [startWorld, worldPt];
          }
        } else if (guardRes.state === 'DRAWING') {
          activeGestureRef.current = 'pinch_index';
          cursorVisualRef.current = { mode: 'drawing', progress: 1 };
          hs.prevGesture = 'pinch_index';

          if (hs.connectFromShapeId) {
            const target = hitTestShape(worldPt, stateRef.current.shapes);
            const snapId =
              target &&
              target.id !== hs.connectFromShapeId &&
              target.kind !== 'line' &&
              target.kind !== 'freehand'
                ? target.id
                : null;
            activeConnectorRef.current = {
              fromShapeId: hs.connectFromShapeId,
              toPoint: worldPt,
              snapShapeId: snapId,
            };
          } else if (activeStrokeRef.current) {
            const pts = activeStrokeRef.current;
            const last = pts[pts.length - 1];
            if (!last || distance(last, worldPt) >= 3) {
              pts.push(worldPt);
            }
          }
        } else if (guardRes.state === 'COMMIT_STROKE') {
          finishActiveCameraDraw();
          activeGestureRef.current = 'hover';
          cursorVisualRef.current = { mode: 'hover', progress: 0 };
          hs.prevGesture = 'hover';
        }
      } else {
        const hit = hitTestShape(worldPt, stateRef.current.shapes);
        hoveredShapeIdRef.current = hit?.id ?? null;
        activeGestureRef.current = 'hover';
        cursorVisualRef.current = { mode: 'hover', progress: 0 };
        hs.prevGesture = 'hover';
      }

      scheduleRender();
    },
    [createConnectorBetween, finalizeRoughStroke, openTextEditorAt, pushHistory, scheduleRender, showNotice],
  );

  // .airdraw Save & Open
  const handleSaveFile = () => {
    const json = serializeAirDrawFile({ theme, viewport, shapes, connectors });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `board-${new Date().toISOString().slice(0, 10)}.airdraw`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice('Saved board (.airdraw)');
  };

  const handleOpenFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseAirDrawFile(text);
      pushHistory(shapes, connectors);
      setTheme(parsed.theme);
      setViewport(parsed.viewport);
      setShapes(parsed.shapes);
      setConnectors(parsed.connectors);
      setSelectedShapeId(null);
      setEditingShapeId(null);
      showNotice(`Loaded ${parsed.shapes.length} shapes from ${file.name}`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed to open .airdraw file.', true);
    }
  };

  const handleClearBoard = () => {
    if (shapes.length === 0 && connectors.length === 0) return;
    pushHistory(shapes, connectors);
    setShapes([]);
    setConnectors([]);
    setSelectedShapeId(null);
    setEditingShapeId(null);
    showNotice('Canvas cleared');
  };

  const handleDontShowAgainChange = (checked: boolean) => {
    setDontShowAgain(checked);
    setHideTutorialPreference(checked);
  };

  const handleStartPracticeMode = () => {
    setTutorialOpen(false);
    setPracticeMode(true);
    setPracticeProgress({
      drewShape: false,
      connectedShapes: false,
      movedShape: false,
      typedText: false,
    });
    if (shapes.length === 0) {
      const seed = createPracticeSeedBoard(theme);
      setShapes(seed.shapes);
      setConnectors(seed.connectors);
      setViewport(seed.viewport);
    }
    setActiveTool('smart');
    showNotice('Practice Mode active — try drawing, connecting, moving, and typing!');
  };

  const editingShape = editingShapeId
    ? shapes.find((s) => s.id === editingShapeId) ?? null
    : null;
  const editingRect = editingShape ? getEditingShapeScreenRect(editingShape, viewport) : null;
  const isDark = theme === 'dark';

  // Compute cursor style for canvas
  const canvasCursor =
    activeTool === 'pan'
      ? 'grab'
      : activeTool === 'select'
        ? 'default'
        : activeTool === 'text'
          ? 'text'
          : 'crosshair';

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden ${
        isDark ? 'bg-[#000000] text-white' : 'bg-white text-[#111111]'
      }`}
    >
      <TopToolbar
        theme={theme}
        activeTool={activeTool}
        strokeColor={strokeColor}
        canUndo={historyPast.length > 0}
        cameraDrawPaused={cameraDrawPaused}
        onSelectTool={setActiveTool}
        onSelectStrokeColor={setStrokeColor}
        onUndo={handleUndo}
        onToggleCameraDrawPaused={() =>
          setCameraDrawPaused((prev) => {
            const next = !prev;
            showNotice(
              next
                ? 'Camera drawing paused — hand tracking stays in hover mode'
                : 'Camera drawing resumed',
            );
            return next;
          })
        }
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onSaveFile={handleSaveFile}
        onOpenFile={handleOpenFile}
        onClearBoard={handleClearBoard}
        onOpenGuide={() => setTutorialOpen(true)}
      />

      {practiceMode && (
        <PracticeBanner
          theme={theme}
          progress={practiceProgress}
          onExit={() => setPracticeMode(false)}
        />
      )}

      {/* Main Infinite Canvas */}
      <main
        className="w-full h-full"
        data-testid="board-stage"
        data-theme={theme}
        data-tool={activeTool}
        data-shape-count={shapes.length}
        data-connector-count={connectors.length}
        data-zoom={viewport.zoom.toFixed(2)}
      >
        <canvas
          ref={canvasRef}
          data-testid="airdraw-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
          style={{ cursor: canvasCursor, touchAction: 'none' }}
          className="block w-full h-full"
        />
      </main>

      {/* Inline Centered Text Editor Overlay */}
      {editingShape && editingRect && (
        <textarea
          ref={textareaRef}
          aria-label="Shape text editor"
          value={editingText}
          onChange={(e) => setEditingText(e.target.value)}
          onBlur={commitTextEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitTextEdit();
            } else if (e.key === 'Escape') {
              setEditingShapeId(null);
            }
          }}
          placeholder="Type here..."
          style={{
            left: `${editingRect.left}px`,
            top: `${editingRect.top}px`,
            width: `${editingRect.width}px`,
            height: `${editingRect.height}px`,
            fontSize: `${Math.round(Math.max(15, (editingShape.fontSize || 18) * 1.15 * viewport.zoom))}px`,
            color: resolveStrokeColor(editingShape.strokeColor, theme),
          }}
          className={`fixed z-30 resize-none border-2 border-blue-500 rounded-lg bg-transparent text-center font-hand font-medium leading-snug focus:outline-none p-2 flex items-center justify-center ${
            isDark ? 'placeholder:text-neutral-500' : 'placeholder:text-neutral-400'
          }`}
        />
      )}

      {/* Transient Feedback Notice */}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-lg border text-xs font-medium shadow-md transition-opacity ${
            notice.isError
              ? 'bg-red-600 text-white border-red-700'
              : isDark
                ? 'bg-[#0A0A0C] text-neutral-100 border-[#1F1F24]'
                : 'bg-white text-[#111111] border-neutral-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      <BottomLeftControls
        theme={theme}
        zoom={viewport.zoom}
        canUndo={historyPast.length > 0}
        canRedo={historyFuture.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomOut={() => {
          const canvas = canvasRef.current;
          const center = canvas
            ? { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }
            : { x: 720, y: 450 };
          setViewport((vp) => zoomViewportAtPoint(vp, vp.zoom / 1.2, center));
        }}
        onZoomIn={() => {
          const canvas = canvasRef.current;
          const center = canvas
            ? { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }
            : { x: 720, y: 450 };
          setViewport((vp) => zoomViewportAtPoint(vp, vp.zoom * 1.2, center));
        }}
        onResetZoom={() => setViewport({ panX: 0, panY: 0, zoom: 1 })}
      />

      <WebcamPiP
        theme={theme}
        enabled={cameraEnabled}
        drawPaused={cameraDrawPaused}
        onToggleEnabled={() => setCameraEnabled((prev) => !prev)}
        onTrackingFrame={handleTrackingFrame}
      />

      <GestureTutorialModal
        isOpen={tutorialOpen}
        theme={theme}
        dontShowAgain={dontShowAgain}
        onDontShowAgainChange={handleDontShowAgainChange}
        onStartDrawing={() => setTutorialOpen(false)}
        onStartPracticeMode={handleStartPracticeMode}
        onClose={() => setTutorialOpen(false)}
      />
    </div>
  );
}
