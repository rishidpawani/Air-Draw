export type ThemeMode = 'light' | 'dark';

export type ToolMode =
  | 'smart'
  | 'select'
  | 'rectangle'
  | 'circle'
  | 'diamond'
  | 'line'
  | 'connector'
  | 'text'
  | 'pan';

export type ShapeKind =
  | 'rectangle'
  | 'circle'
  | 'diamond'
  | 'line'
  | 'text'
  | 'freehand';

export interface Point {
  x: number;
  y: number;
}

export interface BoardShape {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Used for 'line' (start/end in world coords) or 'freehand' points relative/world */
  points?: Point[];
  /** 'auto' adapts dynamically (#111111 in light mode, #FFFFFF in AMOLED dark mode) */
  strokeColor: string;
  /** Alias preserved in .airdraw JSON exports alongside strokeColor */
  color?: string;
  fillColor: string;
  strokeWidth: number;
  text: string;
  fontSize: number;
  /** Deterministic seed for subtle Excalidraw-style hand-drawn jitter */
  seed: number;
}

export interface BoardConnector {
  id: string;
  fromShapeId: string;
  toShapeId: string;
  strokeColor: string;
  color?: string;
  strokeWidth: number;
  label?: string;
}

export interface ViewportState {
  panX: number;
  panY: number;
  zoom: number;
}

export interface BoardState {
  theme: ThemeMode;
  viewport: ViewportState;
  shapes: BoardShape[];
  connectors: BoardConnector[];
}

export interface AirDrawFile {
  type: 'airdraw';
  version: 1;
  savedAt: string;
  theme: ThemeMode;
  viewport: ViewportState;
  shapes: BoardShape[];
  connectors: BoardConnector[];
}

export type GestureType =
  | 'idle'
  | 'hover'
  | 'pinch_index'
  | 'pinch_middle'
  | 'fist'
  | 'two_hand_zoom';

export interface HandTrackingResult {
  detectedHands: number;
  gesture: GestureType;
  /** Normalized [0..1] screen coordinates (already horizontally mirrored for natural webcam feel) */
  cursorNorm: Point | null;
  /** Primary hand's 21 MediaPipe landmarks for GestureGuard checks */
  primaryLandmarks?: { x: number; y: number; z?: number }[] | null;
  /** Finger count (0-5) detected on the single hand or Left Hand when two hands are present */
  colorFingerCount?: number | null;
  /** True when two hands are present and the Left Hand is supplying the color count */
  hasLeftColorHand?: boolean;
  /** Pinch / two-hand spread distance for zoom delta calculation */
  twoHandDistance: number | null;
  /** Midpoint of two hands in normalized [0..1] coords */
  twoHandMidpointNorm: Point | null;
  /** Timestamp in ms */
  timestamp: number;
}

export interface CursorVisualState {
  mode: 'hover' | 'arming' | 'drawing' | 'grab' | 'pan' | 'zoom' | 'paused';
  progress: number;
}

export interface PracticeProgress {
  drewShape: boolean;
  connectedShapes: boolean;
  movedShape: boolean;
  typedText: boolean;
}
