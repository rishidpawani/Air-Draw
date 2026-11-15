import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FingerColorController,
  GestureGuard,
  OneEuroFilter,
  classifyHandsFrame,
  classifySingleHand,
  countExtendedFingers,
  getHandGestures,
  processTwoHandsTransform,
  type NormalizedLandmark,
} from './gestureClassifier';

function makeBaseHand(): NormalizedLandmark[] {
  const pts: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  pts[0] = { x: 0.5, y: 0.8 }; // wrist
  pts[4] = { x: 0.35, y: 0.65 }; // thumb tip
  pts[5] = { x: 0.44, y: 0.58 }; // index MCP
  pts[6] = { x: 0.44, y: 0.48 }; // index PIP
  pts[8] = { x: 0.44, y: 0.35 }; // index tip extended
  pts[9] = { x: 0.5, y: 0.58 }; // middle MCP (palmSize = 0.22)
  pts[10] = { x: 0.5, y: 0.48 }; // middle PIP
  pts[12] = { x: 0.5, y: 0.56 }; // middle curled
  pts[13] = { x: 0.56, y: 0.6 }; // ring MCP
  pts[14] = { x: 0.56, y: 0.52 }; // ring PIP
  pts[16] = { x: 0.56, y: 0.68 }; // ring curled
  pts[17] = { x: 0.61, y: 0.62 }; // pinky MCP
  pts[18] = { x: 0.61, y: 0.55 }; // pinky PIP
  pts[20] = { x: 0.61, y: 0.7 }; // pinky curled
  return pts;
}

function makeOpenHand(): NormalizedLandmark[] {
  const pts = makeBaseHand();
  pts[12] = { x: 0.5, y: 0.32 }; // middle extended
  pts[16] = { x: 0.56, y: 0.36 }; // ring extended
  pts[20] = { x: 0.61, y: 0.40 }; // pinky extended
  return pts;
}

test('OneEuroFilter dampens jitter and resets cleanly', () => {
  const f = new OneEuroFilter(1.5, 0.05);
  assert.equal(f.filter(100, 0), 100);
  const jittered = f.filter(106, 16);
  assert.ok(jittered > 100 && jittered < 106);
  f.reset();
  assert.equal(f.filter(500, 1000), 500);
});

test('getHandGestures uses scale-invariant pinch detection with hysteresis', () => {
  const hand = makeBaseHand();
  // palmSize = 0.22; ratio = 0.36 -> should NOT start drawing (< 0.32 required)
  hand[4] = { x: 0.44, y: 0.35 + 0.22 * 0.36 };
  assert.equal(getHandGestures(hand).isDrawing, false);
  // With previous isDrawing=true, ratio 0.36 stays latched (< 0.40 hold threshold)
  assert.equal(getHandGestures(hand, { isDrawing: true, isGrabbing: false }).isDrawing, true);
});

test('classifySingleHand detects hover, index pinch, middle pinch, and closed fist', () => {
  const hoverHand = makeBaseHand();
  const resHover = classifySingleHand(hoverHand);
  assert.equal(resHover.gesture, 'hover');
  // Mirrored X: 1 - 0.44 = 0.56
  assert.ok(Math.abs(resHover.cursorNorm.x - 0.56) < 1e-6);

  // Thumb + Index pinch
  const pinchIndexHand = makeBaseHand();
  pinchIndexHand[4] = { x: 0.45, y: 0.36 };
  pinchIndexHand[8] = { x: 0.44, y: 0.35 };
  assert.equal(classifySingleHand(pinchIndexHand).gesture, 'pinch_index');

  // Thumb + Middle pinch
  const pinchMiddleHand = makeBaseHand();
  pinchMiddleHand[4] = { x: 0.5, y: 0.5 };
  pinchMiddleHand[12] = { x: 0.51, y: 0.51 };
  assert.equal(classifySingleHand(pinchMiddleHand).gesture, 'pinch_middle');

  // Closed fist
  const fistHand = makeBaseHand();
  fistHand[8] = { x: 0.45, y: 0.66 };
  fistHand[12] = { x: 0.5, y: 0.67 };
  fistHand[16] = { x: 0.55, y: 0.69 };
  fistHand[20] = { x: 0.6, y: 0.71 };
  assert.equal(classifySingleHand(fistHand).gesture, 'fist');
});

test('classifyHandsFrame triggers two_hand_zoom only when both hands pinch and processTwoHandsTransform pans/zooms', () => {
  const makePinchingHand = (offsetX: number) => {
    const h = makeBaseHand().map((p) => ({ x: p.x + offsetX, y: p.y }));
    h[4] = { ...h[8] };
    return h;
  };

  // Two open hands -> stays single-hand hover on primary hand
  const openFrame = classifyHandsFrame([makeBaseHand(), makeBaseHand()], 1000);
  assert.equal(openFrame.gesture, 'hover');

  // Both hands pinching -> two_hand_zoom
  const leftPinch = makePinchingHand(0);
  const rightPinch = makePinchingHand(0.3);
  const zoomFrame = classifyHandsFrame([leftPinch, rightPinch], 1016);
  assert.equal(zoomFrame.gesture, 'two_hand_zoom');
  assert.equal(zoomFrame.detectedHands, 2);
  assert.ok(zoomFrame.twoHandDistance !== null && zoomFrame.twoHandDistance > 0.25);

  const nextVp = processTwoHandsTransform(
    { panX: 0, panY: 0, zoom: 1 },
    200,
    { x: 500, y: 400 },
    300,
    { x: 520, y: 410 },
  );
  assert.ok(Math.abs(nextVp.zoom - 1.5) < 1e-6);
});

test('GestureGuard enforces 40px edge margin, open-fingers check, 1800px/s speed gate, 110ms dwell + 18px deadzone, and pinch hysteresis', () => {
  const guard = new GestureGuard();
  const canvasW = 1200;
  const canvasH = 800;

  // Curled other fingers (base hand) with index pinched -> rejected as HOVER
  const curledPinch = makeBaseHand();
  curledPinch[4] = { ...curledPinch[8] };
  assert.equal(guard.areOtherFingersOpen(curledPinch), false);
  assert.equal(guard.update(curledPinch, 300, 300, canvasW, canvasH, 1000).state, 'HOVER');

  // Edge deadzone (< 40px) -> IDLE
  const openPinch = makeOpenHand();
  openPinch[4] = { ...openPinch[8] };
  assert.equal(guard.areOtherFingersOpen(openPinch), true);
  assert.equal(guard.update(openPinch, 20, 300, canvasW, canvasH, 1020).state, 'IDLE');

  // Fast sweep (> 1800 px/s): move 100px in 20ms = 5000 px/s -> blocked (HOVER)
  assert.equal(guard.update(openPinch, 300, 300, canvasW, canvasH, 1040).state, 'ARMING');
  guard.reset();
  const openIdle = makeOpenHand();
  assert.equal(guard.update(openIdle, 300, 300, canvasW, canvasH, 2000).state, 'HOVER');
  assert.equal(guard.update(openPinch, 420, 300, canvasW, canvasH, 2020).state, 'HOVER');

  // Slow pinch start -> ARMING during 110ms dwell and < 18px move, then START_STROKE, DRAWING, COMMIT_STROKE
  guard.reset();
  assert.equal(guard.update(openIdle, 400, 400, canvasW, canvasH, 3000).state, 'HOVER');
  const arm0 = guard.update(openPinch, 400, 400, canvasW, canvasH, 3020);
  assert.equal(arm0.state, 'ARMING');
  const armHalf = guard.update(openPinch, 405, 400, canvasW, canvasH, 3075);
  assert.equal(armHalf.state, 'ARMING');
  if (armHalf.state === 'ARMING') {
    assert.ok(armHalf.progress > 0.4 && armHalf.progress < 0.6);
  }
  // Held >= 110ms but moved < 18px -> still ARMING
  const armNotMoved = guard.update(openPinch, 410, 400, canvasW, canvasH, 3140);
  assert.equal(armNotMoved.state, 'ARMING');
  // Moved >= 18px from startPos (400, 400) -> START_STROKE
  const started = guard.update(openPinch, 422, 400, canvasW, canvasH, 3160);
  assert.equal(started.state, 'START_STROKE');
  if (started.state === 'START_STROKE') {
    assert.deepEqual(started.startPos, { x: 400, y: 400 });
  }

  // Hysteresis hold: ratio 0.34 (< 0.40) stays DRAWING even if slightly relaxed
  const relaxedHold = makeOpenHand();
  relaxedHold[4] = { x: relaxedHold[8].x, y: relaxedHold[8].y + 0.22 * 0.34 };
  assert.equal(guard.update(relaxedHold, 440, 400, canvasW, canvasH, 3180).state, 'DRAWING');

  // Released (> 0.40) -> COMMIT_STROKE
  const released = makeOpenHand();
  released[4] = { x: released[8].x, y: released[8].y + 0.22 * 0.55 };
  assert.equal(guard.update(released, 445, 400, canvasW, canvasH, 3200).state, 'COMMIT_STROKE');
});

test('GestureGuard detects stationary double-pinch and waits for release before arming strokes', () => {
  const guard = new GestureGuard();
  const canvasW = 1200;
  const canvasH = 800;
  const openIdle = makeOpenHand();
  const openPinch = makeOpenHand();
  openPinch[4] = { ...openPinch[8] };

  // Hover -> Tap 1 (held 60ms in place) -> Release -> Tap 2 within 550ms & 50px -> DOUBLE_PINCH
  assert.equal(guard.update(openIdle, 500, 400, canvasW, canvasH, 1000).state, 'HOVER');
  assert.equal(guard.update(openPinch, 500, 400, canvasW, canvasH, 1020).state, 'ARMING');
  assert.equal(guard.update(openPinch, 502, 401, canvasW, canvasH, 1080).state, 'ARMING');
  assert.equal(guard.update(openIdle, 503, 401, canvasW, canvasH, 1120).state, 'HOVER');

  const secondTap = guard.update(openPinch, 506, 402, canvasW, canvasH, 1240);
  assert.equal(secondTap.state, 'DOUBLE_PINCH');
  if (secondTap.state === 'DOUBLE_PINCH') {
    assert.deepEqual(secondTap.pos, { x: 506, y: 402 });
  }

  // Keeping fingers pinched right after DOUBLE_PINCH stays HOVER (never leaks into ARMING/DRAWING)
  assert.equal(guard.update(openPinch, 530, 402, canvasW, canvasH, 1400).state, 'HOVER');

  // Releasing clears cooldown so subsequent single pinch arms normally
  assert.equal(guard.update(openIdle, 530, 402, canvasW, canvasH, 1440).state, 'HOVER');
  assert.equal(guard.update(openPinch, 530, 402, canvasW, canvasH, 1480).state, 'ARMING');
});

test('GestureGuard does not treat a completed draw stroke or slow tap (> 550ms) as double-pinch', () => {
  const guard = new GestureGuard();
  const canvasW = 1200;
  const canvasH = 800;
  const openIdle = makeOpenHand();
  const openPinch = makeOpenHand();
  openPinch[4] = { ...openPinch[8] };

  // Tap 1 released at t=1100, Tap 2 arrives at t=1750 (650ms later) -> ARMING, not DOUBLE_PINCH
  guard.update(openIdle, 500, 400, canvasW, canvasH, 1000);
  guard.update(openPinch, 500, 400, canvasW, canvasH, 1020);
  guard.update(openIdle, 500, 400, canvasW, canvasH, 1100);
  assert.equal(guard.update(openPinch, 502, 400, canvasW, canvasH, 1750).state, 'ARMING');
});

function makeHandWithFingers(count: 0 | 1 | 2 | 3 | 4 | 5, offsetX = 0): NormalizedLandmark[] {
  const pts = makeBaseHand().map((p) => ({ x: p.x + offsetX, y: p.y }));
  // Folded thumb baseline
  pts[2] = { x: 0.45 + offsetX, y: 0.72 };
  pts[3] = { x: 0.46 + offsetX, y: 0.67 };
  pts[4] = { x: 0.48 + offsetX, y: 0.65 };
  // Folded index baseline if count === 0
  if (count === 0) {
    pts[8] = { x: 0.44 + offsetX, y: 0.56 };
  }
  if (count >= 2) pts[12] = { x: 0.5 + offsetX, y: 0.32 }; // middle extended
  if (count >= 3) pts[16] = { x: 0.56 + offsetX, y: 0.36 }; // ring extended
  if (count >= 4) pts[20] = { x: 0.61 + offsetX, y: 0.40 }; // pinky extended
  if (count === 5) {
    // Spread thumb outward away from wrist (0), index MCP (5), and pinky MCP (17)
    pts[2] = { x: 0.42 + offsetX, y: 0.70 };
    pts[3] = { x: 0.36 + offsetX, y: 0.64 };
    pts[4] = { x: 0.30 + offsetX, y: 0.58 };
  }
  return pts;
}

test('countExtendedFingers detects 0 through 5 extended fingers accurately', () => {
  assert.equal(countExtendedFingers(makeHandWithFingers(0)), 0);
  assert.equal(countExtendedFingers(makeHandWithFingers(1)), 1);
  assert.equal(countExtendedFingers(makeHandWithFingers(2)), 2);
  assert.equal(countExtendedFingers(makeHandWithFingers(3)), 3);
  assert.equal(countExtendedFingers(makeHandWithFingers(4)), 4);
  assert.equal(countExtendedFingers(makeHandWithFingers(5)), 5);
});

test('FingerColorController switches via 350ms 1-hand hold (locked while pinching) or 2-hand Left Hand', () => {
  const ctrl = new FingerColorController();

  // Single-hand: < 350ms does not switch
  assert.equal(
    ctrl.update(2, { hasLeftColorHand: false, isPinchLocked: false, activeColor: 'auto', now: 1000 }),
    null,
  );
  assert.equal(
    ctrl.update(2, { hasLeftColorHand: false, isPinchLocked: false, activeColor: 'auto', now: 1300 }),
    null,
  );
  // Locked during active pinching resets hold timer
  assert.equal(
    ctrl.update(2, { hasLeftColorHand: false, isPinchLocked: true, activeColor: 'auto', now: 1400 }),
    null,
  );
  // Fresh 350ms steady hold -> Electric Blue (#00B4FF)
  assert.equal(
    ctrl.update(2, { hasLeftColorHand: false, isPinchLocked: false, activeColor: 'auto', now: 1500 }),
    null,
  );
  const switched2 = ctrl.update(2, {
    hasLeftColorHand: false,
    isPinchLocked: false,
    activeColor: 'auto',
    now: 1860,
  });
  assert.equal(switched2?.strokeColor, '#00B4FF');
  assert.equal(switched2?.count, 2);

  // Two-hand Left Hand: switches immediately even while Right Hand is pinching
  const switched5 = ctrl.update(5, {
    hasLeftColorHand: true,
    isPinchLocked: true,
    activeColor: '#00B4FF',
    now: 1900,
  });
  assert.equal(switched5?.strokeColor, '#FF4081');
  assert.equal(switched5?.via, 'left-hand');

  // Two-hand frame puts Leftmost (mirrored) hand count in colorFingerCount and keeps cursor on Right hand
  // Raw x=0.80 -> mirrored x=0.20 (Left Hand); raw x=0.25 -> mirrored x=0.75 (Right Hand)
  const leftHand3 = makeHandWithFingers(3, 0.30);
  const rightHandPinch = makeHandWithFingers(1, -0.25);
  rightHandPinch[4] = { ...rightHandPinch[8] };
  const twoHandFrame = classifyHandsFrame([leftHand3, rightHandPinch], 2000);
  assert.equal(twoHandFrame.hasLeftColorHand, true);
  assert.equal(twoHandFrame.colorFingerCount, 3);
  assert.equal(twoHandFrame.gesture, 'pinch_index');
});
