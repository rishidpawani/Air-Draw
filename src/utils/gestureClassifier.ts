import type { GestureType, HandTrackingResult, Point, ViewportState } from '../types/board';

export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface HandPinchState {
  isDrawing: boolean;
  isGrabbing: boolean;
}

export interface FingerColorOption {
  count: 1 | 2 | 3 | 4 | 5;
  strokeColor: string;
  label: string;
  darkHex: string;
  lightHex: string;
  pose: string;
}

export const FINGER_COLOR_PALETTE: FingerColorOption[] = [
  {
    count: 1,
    strokeColor: 'auto',
    label: 'Auto Contrast',
    darkHex: '#FFFFFF',
    lightHex: '#111111',
    pose: '1 Finger',
  },
  {
    count: 2,
    strokeColor: '#00B4FF',
    label: 'Electric Blue',
    darkHex: '#00B4FF',
    lightHex: '#00B4FF',
    pose: '2 Fingers',
  },
  {
    count: 3,
    strokeColor: '#00E676',
    label: 'Neon Green',
    darkHex: '#00E676',
    lightHex: '#00E676',
    pose: '3 Fingers',
  },
  {
    count: 4,
    strokeColor: '#FFAB00',
    label: 'Vivid Amber',
    darkHex: '#FFAB00',
    lightHex: '#FFAB00',
    pose: '4 Fingers',
  },
  {
    count: 5,
    strokeColor: '#FF4081',
    label: 'Neon Pink',
    darkHex: '#FF4081',
    lightHex: '#FF4081',
    pose: '5 Fingers',
  },
];

export function getColorOptionForFingerCount(count: number): FingerColorOption | null {
  return FINGER_COLOR_PALETTE.find((c) => c.count === count) ?? null;
}

export function getColorLabel(strokeColor: string): string {
  const match = FINGER_COLOR_PALETTE.find(
    (c) => c.strokeColor.toLowerCase() === strokeColor.toLowerCase(),
  );
  return match ? match.label : strokeColor;
}

/**
 * 1. ADAPTIVE ONE-EURO FILTER (Eliminates jitter without adding lag)
 */
export class OneEuroFilter {
  minCutoff: number;
  beta: number;
  dCutoff: number;
  xPrev: number | null;
  dxPrev: number;
  tPrev: number | null;

  constructor(minCutoff = 1.2, beta = 0.04, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x: number, t: number): number {
    if (this.tPrev === null || this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }
    const dt = Math.max((t - this.tPrev) / 1000, 1 / 120);
    this.tPrev = t;
    const dx = (x - this.xPrev) / dt;
    const edx = this.dxPrev + this.alpha(this.dCutoff, dt) * (dx - this.dxPrev);
    this.dxPrev = edx;
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const filtered = this.xPrev + this.alpha(cutoff, dt) * (x - this.xPrev);
    this.xPrev = filtered;
    return filtered;
  }

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

function dist2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * 2. SCALE-INVARIANT PINCH DETECTION (Works close or far from webcam)
 * Uses hysteresis (tight 0.32 threshold to start, looser 0.40 to hold mid-stroke).
 */
export function getHandGestures(
  lm: NormalizedLandmark[],
  prev?: HandPinchState,
): HandPinchState {
  const palmSize = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.1;

  const indexPinchRatio = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / palmSize;
  const middlePinchRatio = Math.hypot(lm[4].x - lm[12].x, lm[4].y - lm[12].y) / palmSize;

  const drawThreshold = prev?.isDrawing ? 0.40 : 0.32;
  const grabThreshold = prev?.isGrabbing ? 0.40 : 0.32;

  const isDrawing = indexPinchRatio < drawThreshold;
  const isGrabbing = middlePinchRatio < grabThreshold && indexPinchRatio >= drawThreshold;

  return { isDrawing, isGrabbing };
}

export type GestureGuardResult =
  | { state: 'IDLE' }
  | { state: 'HOVER' }
  | { state: 'ARMING'; progress: number }
  | { state: 'START_STROKE'; startPos: Point }
  | { state: 'DRAWING' }
  | { state: 'COMMIT_STROKE' }
  | { state: 'DOUBLE_PINCH'; pos: Point };

/**
 * Anti-accidental-drawing Gesture Guard:
 * 110ms dwell + 18px deadzone, other-fingers-open check, 0.26/0.40 pinch hysteresis,
 * 1800 px/s speed gate, 40px edge margin, and stationary double-pinch detection for text.
 */
export class GestureGuard {
  pinchStartTime: number;
  pinchStartPos: Point | null;
  isDrawing: boolean;
  lastCursor: Point | null;
  lastTime: number;
  maxMoveDuringPinch: number;
  lastTapTime: number;
  lastTapPos: Point | null;
  waitForRelease: boolean;

  constructor() {
    this.pinchStartTime = 0;
    this.pinchStartPos = null;
    this.isDrawing = false;
    this.lastCursor = null;
    this.lastTime = 0;
    this.maxMoveDuringPinch = 0;
    this.lastTapTime = 0;
    this.lastTapPos = null;
    this.waitForRelease = false;
  }

  /** Checks that Middle, Ring, and Pinky are extended (prevents fist/sideways false pinches) */
  areOtherFingersOpen(lm: NormalizedLandmark[]): boolean {
    if (lm.length < 21) return false;
    const wrist = lm[0];
    const isExtended = (tip: number, pip: number) =>
      Math.hypot(lm[tip].x - wrist.x, lm[tip].y - wrist.y) >
      Math.hypot(lm[pip].x - wrist.x, lm[pip].y - wrist.y) * 1.08;

    return isExtended(12, 10) && isExtended(16, 14) && isExtended(20, 18);
  }

  update(
    lm: NormalizedLandmark[],
    cursorX: number,
    cursorY: number,
    canvasW: number,
    canvasH: number,
    now = performance.now(),
  ): GestureGuardResult {
    // 1. Edge Deadzone (ignore hands entering/exiting frame)
    const margin = 40;
    if (
      cursorX < margin ||
      cursorX > canvasW - margin ||
      cursorY < margin ||
      cursorY > canvasH - margin
    ) {
      this.reset();
      this.lastTapTime = 0;
      this.lastTapPos = null;
      this.waitForRelease = false;
      return { state: 'IDLE' };
    }

    // 2. Speed Check (ignore fast hand sweeps)
    let speed = 0;
    if (this.lastCursor && this.lastTime) {
      const dt = Math.max((now - this.lastTime) / 1000, 0.001);
      speed = Math.hypot(cursorX - this.lastCursor.x, cursorY - this.lastCursor.y) / dt;
    }
    this.lastCursor = { x: cursorX, y: cursorY };
    this.lastTime = now;

    // 3. Scale-invariant pinch ratio
    const palmSize = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.1;
    const pinchRatio = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / palmSize;
    const openHand = this.areOtherFingersOpen(lm);

    // Wait for full pinch release after a DOUBLE_PINCH trigger so it never leaks into a stroke
    if (this.waitForRelease) {
      if (pinchRatio < 0.40) {
        return { state: 'HOVER' };
      }
      this.waitForRelease = false;
    }

    // Hysteresis: strict 0.26 to initiate, relaxed 0.40 to maintain
    const rawPinch = this.isDrawing
      ? pinchRatio < 0.40
      : pinchRatio < 0.26 && openHand && speed < 1800;

    if (!rawPinch) {
      if (this.isDrawing) {
        this.reset();
        this.lastTapTime = 0;
        this.lastTapPos = null;
        return { state: 'COMMIT_STROKE' };
      }
      // Stationary/quick pinch released before drawing -> record as Tap 1 for double-pinch
      if (this.pinchStartTime && this.pinchStartPos) {
        const tapDuration = now - this.pinchStartTime;
        if (tapDuration <= 450 && this.maxMoveDuringPinch <= 28) {
          this.lastTapTime = now;
          this.lastTapPos = { ...this.pinchStartPos };
        }
      }
      this.reset();
      return { state: 'HOVER' };
    }

    // 4. Double-pinch check or Dwell Timer (110ms) + Movement Deadzone (18px)
    if (!this.pinchStartTime || !this.pinchStartPos) {
      if (
        this.lastTapTime > 0 &&
        this.lastTapPos &&
        now - this.lastTapTime <= 550 &&
        Math.hypot(cursorX - this.lastTapPos.x, cursorY - this.lastTapPos.y) <= 50
      ) {
        this.lastTapTime = 0;
        this.lastTapPos = null;
        this.reset();
        this.waitForRelease = true;
        return { state: 'DOUBLE_PINCH', pos: { x: cursorX, y: cursorY } };
      }

      this.pinchStartTime = now;
      this.pinchStartPos = { x: cursorX, y: cursorY };
      this.maxMoveDuringPinch = 0;
      return { state: 'ARMING', progress: 0 };
    }

    const heldMs = now - this.pinchStartTime;
    const movedPx = Math.hypot(cursorX - this.pinchStartPos.x, cursorY - this.pinchStartPos.y);
    this.maxMoveDuringPinch = Math.max(this.maxMoveDuringPinch, movedPx);

    if (!this.isDrawing) {
      if (heldMs >= 110 && movedPx >= 18) {
        this.isDrawing = true;
        this.lastTapTime = 0;
        this.lastTapPos = null;
        return { state: 'START_STROKE', startPos: this.pinchStartPos };
      }
      return { state: 'ARMING', progress: Math.min(1, heldMs / 110) };
    }

    return { state: 'DRAWING' };
  }

  reset(): void {
    this.pinchStartTime = 0;
    this.pinchStartPos = null;
    this.isDrawing = false;
    this.maxMoveDuringPinch = 0;
  }
}

/**
 * Counts extended fingers (0-5) using landmark distances from the wrist (lm[0]).
 */
export function countExtendedFingers(lm: NormalizedLandmark[]): number {
  if (!lm || lm.length < 21) return 0;
  const wrist = lm[0];
  const palmSize = dist2D(wrist, lm[9]) || 0.1;

  const isFingerExtended = (tip: number, pip: number) =>
    dist2D(lm[tip], wrist) > dist2D(lm[pip], wrist) * 1.08;

  const thumbOutFromWrist = dist2D(lm[4], wrist) > dist2D(lm[3], wrist) * 1.04;
  const thumbAwayFromPalm =
    dist2D(lm[4], lm[17]) > dist2D(lm[2], lm[17]) * 1.12 &&
    dist2D(lm[4], lm[5]) > palmSize * 0.34;
  const thumbExtended = thumbOutFromWrist && thumbAwayFromPalm;

  let count = 0;
  if (thumbExtended) count += 1;
  if (isFingerExtended(8, 6)) count += 1;
  if (isFingerExtended(12, 10)) count += 1;
  if (isFingerExtended(16, 14)) count += 1;
  if (isFingerExtended(20, 18)) count += 1;
  return count;
}

export interface FingerColorSwitchEvent {
  strokeColor: string;
  label: string;
  count: 1 | 2 | 3 | 4 | 5;
  via: 'left-hand' | 'hold';
}

/**
 * Switches active stroke color via Left Hand (2 hands) or 350ms steady hold (1 hand, locked while pinching).
 */
export class FingerColorController {
  candidateCount: number | null = null;
  holdStartMs = 0;
  triggeredForHold = false;
  lastLeftCount: number | null = null;

  update(
    fingerCount: number | null,
    opts: {
      hasLeftColorHand: boolean;
      isPinchLocked: boolean;
      activeColor: string;
      now?: number;
    },
  ): FingerColorSwitchEvent | null {
    const now = opts.now ?? performance.now();

    if (opts.hasLeftColorHand) {
      // Reset single-hand hold timer while two hands are active
      this.candidateCount = null;
      this.holdStartMs = 0;
      this.triggeredForHold = false;

      if (fingerCount === null || fingerCount < 1 || fingerCount > 5) {
        this.lastLeftCount = null;
        return null;
      }
      if (this.lastLeftCount === fingerCount) {
        return null;
      }
      this.lastLeftCount = fingerCount;
      const option = getColorOptionForFingerCount(fingerCount);
      if (!option || option.strokeColor === opts.activeColor) {
        return null;
      }
      return {
        strokeColor: option.strokeColor,
        label: option.label,
        count: option.count,
        via: 'left-hand',
      };
    }

    this.lastLeftCount = null;

    if (opts.isPinchLocked || fingerCount === null || fingerCount < 1 || fingerCount > 5) {
      this.candidateCount = null;
      this.holdStartMs = 0;
      this.triggeredForHold = false;
      return null;
    }

    if (this.candidateCount !== fingerCount) {
      this.candidateCount = fingerCount;
      this.holdStartMs = now;
      this.triggeredForHold = false;
      return null;
    }

    if (!this.triggeredForHold && now - this.holdStartMs >= 350) {
      this.triggeredForHold = true;
      const option = getColorOptionForFingerCount(fingerCount);
      if (!option || option.strokeColor === opts.activeColor) {
        return null;
      }
      return {
        strokeColor: option.strokeColor,
        label: option.label,
        count: option.count,
        via: 'hold',
      };
    }

    return null;
  }

  reset(): void {
    this.candidateCount = null;
    this.holdStartMs = 0;
    this.triggeredForHold = false;
    this.lastLeftCount = null;
  }
}

/**
 * Classifies a single hand's 21 MediaPipe landmarks into a discrete gesture
 * and mirrored normalized cursor coordinate [0..1].
 */
export function classifySingleHand(
  landmarks: NormalizedLandmark[],
  prevPinch?: HandPinchState,
): {
  gesture: Exclude<GestureType, 'two_hand_zoom'>;
  cursorNorm: Point;
  palmCenterNorm: Point;
  pinchState: HandPinchState;
} {
  if (landmarks.length < 21) {
    return {
      gesture: 'idle',
      cursorNorm: { x: 0.5, y: 0.5 },
      palmCenterNorm: { x: 0.5, y: 0.5 },
      pinchState: { isDrawing: false, isGrabbing: false },
    };
  }

  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const indexMcp = landmarks[5];
  const indexPip = landmarks[6];
  const indexTip = landmarks[8];
  const middleMcp = landmarks[9];
  const middlePip = landmarks[10];
  const middleTip = landmarks[12];
  const ringMcp = landmarks[13];
  const ringTip = landmarks[16];
  const pinkyMcp = landmarks[17];
  const pinkyTip = landmarks[20];

  // Mirror X for natural webcam interaction
  const cursorNorm: Point = {
    x: Math.max(0, Math.min(1, 1 - indexTip.x)),
    y: Math.max(0, Math.min(1, indexTip.y)),
  };

  const palmCenterNorm: Point = {
    x: Math.max(0, Math.min(1, 1 - (wrist.x + middleMcp.x) / 2)),
    y: Math.max(0, Math.min(1, (wrist.y + middleMcp.y) / 2)),
  };

  const pinchState = getHandGestures(landmarks, prevPinch);

  // Thumb + Index pinch -> Draw & Snap / Smart Connector
  if (pinchState.isDrawing) {
    const pinchPoint: Point = {
      x: Math.max(0, Math.min(1, 1 - (thumbTip.x + indexTip.x) / 2)),
      y: Math.max(0, Math.min(1, (thumbTip.y + indexTip.y) / 2)),
    };
    return { gesture: 'pinch_index', cursorNorm: pinchPoint, palmCenterNorm, pinchState };
  }

  // Middle finger + Thumb pinch -> Grab & Move
  if (pinchState.isGrabbing) {
    const grabPoint: Point = {
      x: Math.max(0, Math.min(1, 1 - (thumbTip.x + middleTip.x) / 2)),
      y: Math.max(0, Math.min(1, (thumbTip.y + middleTip.y) / 2)),
    };
    return { gesture: 'pinch_middle', cursorNorm: grabPoint, palmCenterNorm, pinchState };
  }

  const indexExtended = dist2D(indexTip, wrist) > dist2D(indexPip, wrist) * 1.08;
  const middleCurled = dist2D(middleTip, wrist) < dist2D(middlePip, wrist) * 1.06;
  const ringCurled = dist2D(ringTip, wrist) < dist2D(ringMcp, wrist) * 1.2;
  const pinkyCurled = dist2D(pinkyTip, wrist) < dist2D(pinkyMcp, wrist) * 1.2;
  const indexCurled = dist2D(indexTip, wrist) < dist2D(indexMcp, wrist) * 1.22;

  // Closed fist: all 4 fingers curled toward palm/wrist
  if (indexCurled && middleCurled && ringCurled && pinkyCurled) {
    return { gesture: 'fist', cursorNorm: palmCenterNorm, palmCenterNorm, pinchState };
  }

  // Index extended -> Hover / Aim
  if (indexExtended) {
    return { gesture: 'hover', cursorNorm, palmCenterNorm, pinchState };
  }

  return { gesture: 'hover', cursorNorm, palmCenterNorm, pinchState };
}

/**
 * Combines 0, 1, or 2 detected hands into a unified tracking frame.
 * Two-hand zoom & pan activates when both hands are pinching (g1.isDrawing && g2.isDrawing).
 */
export function classifyHandsFrame(
  hands: NormalizedLandmark[][],
  timestamp: number,
  prevPinches?: [HandPinchState?, HandPinchState?],
): HandTrackingResult & { pinchStates?: [HandPinchState?, HandPinchState?] } {
  if (!hands || hands.length === 0) {
    return {
      detectedHands: 0,
      gesture: 'idle',
      cursorNorm: null,
      primaryLandmarks: null,
      colorFingerCount: null,
      hasLeftColorHand: false,
      twoHandDistance: null,
      twoHandMidpointNorm: null,
      timestamp,
      pinchStates: [undefined, undefined],
    };
  }

  if (hands.length >= 2) {
    const h1 = hands[0];
    const h2 = hands[1];
    const g1 = getHandGestures(h1, prevPinches?.[0]);
    const g2 = getHandGestures(h2, prevPinches?.[1]);

    // Both hands pinching -> Smooth Two-Hand Zoom & Pan
    if (g1.isDrawing && g2.isDrawing) {
      const p1: Point = {
        x: Math.max(0, Math.min(1, 1 - h1[8].x)),
        y: Math.max(0, Math.min(1, h1[8].y)),
      };
      const p2: Point = {
        x: Math.max(0, Math.min(1, 1 - h2[8].x)),
        y: Math.max(0, Math.min(1, h2[8].y)),
      };
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const mid: Point = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };

      return {
        detectedHands: hands.length,
        gesture: 'two_hand_zoom',
        cursorNorm: mid,
        primaryLandmarks: h1,
        colorFingerCount: null,
        hasLeftColorHand: false,
        twoHandDistance: dist,
        twoHandMidpointNorm: mid,
        timestamp,
        pinchStates: [g1, g2],
      };
    }

    // Leftmost hand in mirrored coordinates serves as Left Hand color switcher; rightmost hand drives cursor/drawing
    const h1MirroredX = 1 - (h1[9]?.x ?? 0.5);
    const h2MirroredX = 1 - (h2[9]?.x ?? 0.5);
    const h1IsLeft = h1MirroredX <= h2MirroredX;
    const leftHand = h1IsLeft ? h1 : h2;
    const rightHand = h1IsLeft ? h2 : h1;
    const rightPrevPinch = h1IsLeft ? prevPinches?.[1] : prevPinches?.[0];
    const leftPinch = h1IsLeft ? g1 : g2;

    const singlePrimary = classifySingleHand(rightHand, rightPrevPinch);
    const leftCount = countExtendedFingers(leftHand);

    return {
      detectedHands: hands.length,
      gesture: singlePrimary.gesture,
      cursorNorm: singlePrimary.cursorNorm,
      primaryLandmarks: rightHand,
      colorFingerCount: leftCount,
      hasLeftColorHand: true,
      twoHandDistance: null,
      twoHandMidpointNorm: null,
      timestamp,
      pinchStates: h1IsLeft ? [leftPinch, singlePrimary.pinchState] : [singlePrimary.pinchState, leftPinch],
    };
  }

  const single = classifySingleHand(hands[0], prevPinches?.[0]);
  const singleCount = countExtendedFingers(hands[0]);
  return {
    detectedHands: 1,
    gesture: single.gesture,
    cursorNorm: single.cursorNorm,
    primaryLandmarks: hands[0],
    colorFingerCount: singleCount,
    hasLeftColorHand: false,
    twoHandDistance: null,
    twoHandMidpointNorm: null,
    timestamp,
    pinchStates: [single.pinchState, undefined],
  };
}

/**
 * Pure two-hand pan + anchored zoom viewport update.
 */
export function processTwoHandsTransform(
  viewport: ViewportState,
  prevDist: number | null,
  prevMidScreen: Point | null,
  currDist: number,
  currMidScreen: Point,
): ViewportState {
  if (!prevDist || !prevMidScreen || prevDist <= 1e-4) {
    return viewport;
  }

  // Pan by midpoint delta
  const panX = viewport.panX + (currMidScreen.x - prevMidScreen.x);
  const panY = viewport.panY + (currMidScreen.y - prevMidScreen.y);

  // Zoom anchored at the midpoint between both hands
  const scaleFactor = currDist / prevDist;
  const newZoom = Math.min(4, Math.max(0.25, viewport.zoom * scaleFactor));
  const nextPanX = currMidScreen.x - (currMidScreen.x - panX) * (newZoom / viewport.zoom);
  const nextPanY = currMidScreen.y - (currMidScreen.y - panY) * (newZoom / viewport.zoom);

  return {
    panX: nextPanX,
    panY: nextPanY,
    zoom: newZoom,
  };
}

export function smoothPoint(prev: Point | null, next: Point, alpha = 0.35): Point {
  if (!prev) return next;
  return {
    x: prev.x + (next.x - prev.x) * alpha,
    y: prev.y + (next.y - prev.y) * alpha,
  };
}
