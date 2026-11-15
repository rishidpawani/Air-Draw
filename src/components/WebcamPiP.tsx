import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  ChevronDown,
  ChevronUp,
  Hand,
  Loader2,
  Move,
  Pause,
  PenTool,
  ZoomIn,
} from 'lucide-react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { GestureType, HandTrackingResult, ThemeMode } from '../types/board';
import {
  classifyHandsFrame,
  type HandPinchState,
  type NormalizedLandmark,
} from '../utils/gestureClassifier';

interface WebcamPiPProps {
  theme: ThemeMode;
  enabled: boolean;
  drawPaused?: boolean;
  onToggleEnabled: () => void;
  onTrackingFrame: (result: HandTrackingResult) => void;
}

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function gestureLabel(gesture: GestureType, handsCount: number): { text: string; icon: React.ReactNode } {
  if (handsCount === 0) {
    return { text: 'Show hand to camera', icon: <Hand className="w-3.5 h-3.5" /> };
  }
  switch (gesture) {
    case 'pinch_index':
      return { text: 'Pinch: Draw / Connect', icon: <PenTool className="w-3.5 h-3.5 text-blue-500" /> };
    case 'pinch_middle':
      return { text: 'Middle Pinch: Grab', icon: <Move className="w-3.5 h-3.5 text-emerald-500" /> };
    case 'fist':
      return { text: 'Closed Fist: Pan', icon: <Hand className="w-3.5 h-3.5 text-amber-500" /> };
    case 'two_hand_zoom':
      return { text: 'Two Hands: Zoom', icon: <ZoomIn className="w-3.5 h-3.5 text-violet-500" /> };
    case 'hover':
      return { text: 'Index: Hover & Aim', icon: <Hand className="w-3.5 h-3.5 text-blue-500" /> };
    default:
      return { text: 'Tracking Ready', icon: <Hand className="w-3.5 h-3.5" /> };
  }
}

export const WebcamPiP: React.FC<WebcamPiPProps> = ({
  theme,
  enabled,
  drawPaused = false,
  onToggleEnabled,
  onTrackingFrame,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );
  const [status, setStatus] = useState<'off' | 'loading' | 'active' | 'error'>('off');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentGesture, setCurrentGesture] = useState<GestureType>('idle');
  const [handsCount, setHandsCount] = useState(0);
  const [fingerCount, setFingerCount] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevPinchRef = useRef<[HandPinchState?, HandPinchState?]>([undefined, undefined]);
  const onFrameRef = useRef(onTrackingFrame);
  onFrameRef.current = onTrackingFrame;

  useEffect(() => {
    let cancelled = false;

    const cleanup = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (overlayCanvasRef.current) {
        const ctx = overlayCanvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
      prevPinchRef.current = [undefined, undefined];
      onFrameRef.current({
        detectedHands: 0,
        gesture: 'idle',
        cursorNorm: null,
        twoHandDistance: null,
        twoHandMidpointNorm: null,
        timestamp: performance.now(),
      });
    };

    if (!enabled) {
      cleanup();
      setStatus('off');
      setErrorMessage(null);
      setCurrentGesture('idle');
      setHandsCount(0);
      setFingerCount(null);
      return;
    }

    const startCameraAndTracking = async () => {
      setStatus('loading');
      setErrorMessage(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus('error');
        setErrorMessage('Camera API unavailable in this browser. Use mouse or touch.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (!landmarkerRef.current) {
          const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm',
          );
          if (cancelled) return;
          landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.55,
          });
        }

        if (cancelled) return;
        setStatus('active');

        let lastVideoTime = -1;
        const loop = () => {
          if (cancelled) return;
          const video = videoRef.current;
          const landmarker = landmarkerRef.current;

          if (video && landmarker && video.readyState >= 2) {
            if (video.currentTime !== lastVideoTime) {
              lastVideoTime = video.currentTime;
              const now = performance.now();
              const detections = landmarker.detectForVideo(video, now);
              const hands = (detections.landmarks || []) as NormalizedLandmark[][];
              const frame = classifyHandsFrame(hands, now, prevPinchRef.current);
              prevPinchRef.current = frame.pinchStates ?? [undefined, undefined];

              setCurrentGesture(frame.gesture);
              setHandsCount(frame.detectedHands);
              setFingerCount(frame.colorFingerCount ?? null);
              onFrameRef.current(frame);

              // Draw mirrored hand skeleton onto PiP overlay canvas
              const overlay = overlayCanvasRef.current;
              if (overlay) {
                const ctx = overlay.getContext('2d');
                if (ctx) {
                  ctx.clearRect(0, 0, overlay.width, overlay.height);
                  for (const hand of hands) {
                    ctx.strokeStyle = 'rgba(59, 130, 246, 0.85)';
                    ctx.lineWidth = 2;
                    for (const [a, b] of HAND_CONNECTIONS) {
                      const p1 = hand[a];
                      const p2 = hand[b];
                      if (!p1 || !p2) continue;
                      ctx.beginPath();
                      ctx.moveTo((1 - p1.x) * overlay.width, p1.y * overlay.height);
                      ctx.lineTo((1 - p2.x) * overlay.width, p2.y * overlay.height);
                      ctx.stroke();
                    }
                    for (let idx = 0; idx < hand.length; idx++) {
                      const pt = hand[idx];
                      const isTip = idx === 4 || idx === 8 || idx === 12;
                      ctx.beginPath();
                      ctx.arc(
                        (1 - pt.x) * overlay.width,
                        pt.y * overlay.height,
                        isTip ? 3.5 : 2,
                        0,
                        Math.PI * 2,
                      );
                      ctx.fillStyle = isTip ? '#60a5fa' : '#ffffff';
                      ctx.fill();
                    }
                  }
                }
              }
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera permission denied. Mouse & touch fallback remain active.'
            : 'No webcam detected or model failed to load. Use mouse or touch.';
        setStatus('error');
        setErrorMessage(msg);
        cleanup();
      }
    };

    void startCameraAndTracking();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled]);

  const isDark = theme === 'dark';
  const gestureInfo = gestureLabel(currentGesture, handsCount);

  return (
    <aside
      aria-label="Webcam hand tracking card"
      className={`fixed bottom-16 sm:bottom-3 right-3 z-30 ${
        collapsed ? 'w-auto' : 'w-64'
      } rounded-xl border shadow-lg overflow-hidden transition-colors ${
        isDark
          ? 'bg-[#0A0A0C]/95 border-[#1F1F24] text-neutral-100'
          : 'bg-white/95 border-neutral-200 text-[#111111]'
      }`}
    >
      {/* Header Bar */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 border-b ${
          isDark ? 'border-[#1F1F24]' : 'border-neutral-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onToggleEnabled}
            aria-pressed={enabled}
            aria-label={enabled ? 'Turn off camera tracking' : 'Turn on camera tracking'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              enabled
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : isDark
                  ? 'bg-[#161618] text-neutral-200 hover:bg-[#1F1F24]'
                  : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200'
            }`}
          >
            {enabled ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
            <span>{enabled ? 'Camera On' : 'Camera Off'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand webcam preview' : 'Collapse webcam preview'}
          className={`p-1 rounded-md transition-colors cursor-pointer ${
            isDark
              ? 'text-neutral-400 hover:text-white hover:bg-[#161618]'
              : 'text-neutral-500 hover:text-[#111111] hover:bg-neutral-100'
          }`}
        >
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Collapsible Video Preview Body */}
      {!collapsed && (
        <div className="p-2.5">
          <div
            className={`relative w-full aspect-4/3 rounded-lg overflow-hidden border ${
              isDark ? 'bg-[#000000] border-[#1F1F24]' : 'bg-neutral-100 border-neutral-200'
            }`}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover -scale-x-100 ${
                status === 'active' ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <canvas
              ref={overlayCanvasRef}
              width={240}
              height={180}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {status === 'off' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
                <CameraOff
                  className={`w-6 h-6 mb-1.5 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}
                />
                <p className={`text-xs font-medium ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  Hand tracking paused
                </p>
                <p className={`text-[11px] mt-0.5 ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
                  Turn Camera On for air gestures, or draw with mouse/touch.
                </p>
              </div>
            )}

            {status === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500 mb-1.5" />
                <p className={`text-xs ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  Loading hand model...
                </p>
              </div>
            )}

            {status === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
                <CameraOff className="w-5 h-5 text-amber-500 mb-1.5" />
                <p className={`text-[11px] leading-snug ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  {errorMessage}
                </p>
              </div>
            )}
          </div>

          {/* Live Gesture Readout */}
          <div
            className={`mt-2 flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs ${
              isDark ? 'bg-[#000000] border border-[#1F1F24] text-neutral-300' : 'bg-neutral-100 text-neutral-700'
            }`}
          >
            <span className="inline-flex items-center gap-1.5 font-medium truncate">
              {status === 'active' ? (
                drawPaused ? (
                  <Pause className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  gestureInfo.icon
                )
              ) : (
                <CameraOff className="w-3.5 h-3.5" />
              )}
              <span className="truncate">
                {status === 'active'
                  ? drawPaused
                    ? 'Drawing paused (hover)'
                    : gestureInfo.text
                  : status === 'loading'
                    ? 'Starting camera...'
                    : 'Mouse & touch active'}
              </span>
            </span>
            {status === 'active' && fingerCount !== null && fingerCount > 0 && (
              <span className="text-[11px] font-mono-tabular text-neutral-400 shrink-0">
                {fingerCount}F
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
