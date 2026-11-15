import React, { useState } from 'react';
import { Sparkles, Play, X } from 'lucide-react';
import type { ThemeMode } from '../types/board';

interface GestureTutorialModalProps {
  isOpen: boolean;
  theme: ThemeMode;
  dontShowAgain: boolean;
  onDontShowAgainChange: (checked: boolean) => void;
  onStartDrawing: () => void;
  onStartPracticeMode: () => void;
  onClose: () => void;
}

interface GestureCardSpec {
  id: string;
  number: string;
  title: string;
  handPose: string;
  mouseFallback: string;
  description: string;
  renderSvg: (isDark: boolean) => React.ReactNode;
}

const GESTURE_CARDS: GestureCardSpec[] = [
  {
    id: 'hover',
    number: '01',
    title: 'Hover & Aim',
    handPose: 'Index finger extended',
    mouseFallback: 'Move pointer',
    description: 'Point your index finger toward the camera to glide the glowing virtual cursor smoothly across the board.',
    renderSvg: (isDark) => {
      const ink = isDark ? '#f8fafc' : '#121212';
      const muted = isDark ? '#475569' : '#cbd5e1';
      return (
        <svg viewBox="0 0 180 96" className="w-full h-24" aria-hidden="true">
          <g opacity="0.55">
            <circle cx="24" cy="20" r="1.2" fill={muted} />
            <circle cx="60" cy="20" r="1.2" fill={muted} />
            <circle cx="96" cy="20" r="1.2" fill={muted} />
            <circle cx="132" cy="20" r="1.2" fill={muted} />
            <circle cx="24" cy="48" r="1.2" fill={muted} />
            <circle cx="60" cy="48" r="1.2" fill={muted} />
            <circle cx="96" cy="48" r="1.2" fill={muted} />
            <circle cx="132" cy="48" r="1.2" fill={muted} />
            <circle cx="24" cy="76" r="1.2" fill={muted} />
            <circle cx="60" cy="76" r="1.2" fill={muted} />
            <circle cx="96" cy="76" r="1.2" fill={muted} />
            <circle cx="132" cy="76" r="1.2" fill={muted} />
          </g>
          {/* Glowing Cursor */}
          <g className="anim-hover-cursor" transform="translate(88, 38)">
            <circle cx="0" cy="0" r="11" fill="#2563eb" opacity="0.22" className="anim-cursor-pulse" />
            <circle cx="0" cy="0" r="6" fill="none" stroke="#2563eb" strokeWidth="1.8" />
            <circle cx="0" cy="0" r="2.3" fill="#2563eb" />
          </g>
          {/* Hand with index extended */}
          <g className="anim-hover-hand" transform="translate(46, 44)">
            <path
              d="M12 36 L12 18 C12 15 16 15 16 18 L16 26 L20 26 L20 6 C20 3 25 3 25 6 L25 25 L29 25 C29 22 33 22 33 25 L33 27 L36 27 C36 25 40 25 40 28 L40 38 C40 43 34 46 27 46 L18 46 C14 46 12 42 12 36 Z"
              fill={isDark ? '#1e293b' : '#ffffff'}
              stroke={ink}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <circle cx="22.5" cy="5.5" r="2" fill="#2563eb" />
          </g>
        </svg>
      );
    },
  },
  {
    id: 'draw',
    number: '02',
    title: 'Draw & Snap',
    handPose: 'Thumb + Index pinch',
    mouseFallback: 'Click & drag stroke',
    description: 'Pinch thumb and index finger to sketch a rough shape—release to snap cleanly into a Rectangle, Circle, Diamond, or Line.',
    renderSvg: (isDark) => {
      const ink = isDark ? '#f8fafc' : '#121212';
      return (
        <svg viewBox="0 0 180 96" className="w-full h-24" aria-hidden="true">
          {/* Rough hand-drawn path that fades as clean shape snaps */}
          <path
            d="M 52 24 L 128 22 L 131 70 L 50 72 Z"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="anim-rough-stroke"
          />
          {/* Snapped crisp rectangle */}
          <rect
            x="52"
            y="22"
            width="78"
            height="48"
            rx="6"
            fill="none"
            stroke={ink}
            strokeWidth="2.4"
            className="anim-clean-shape"
          />
          {/* Pinching fingers */}
          <g className="anim-pinch-draw" transform="translate(46, 20)">
            <path
              d="M8 22 C8 14 14 8 20 12 L24 16 L19 21 C15 19 14 23 14 27 L14 34 L8 34 Z"
              fill={isDark ? '#1e293b' : '#ffffff'}
              stroke={ink}
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle cx="21" cy="14" r="3" fill="#2563eb" />
          </g>
        </svg>
      );
    },
  },
  {
    id: 'connect',
    number: '03',
    title: 'Smart Connectors',
    handPose: 'Pinch Shape A → Shape B',
    mouseFallback: 'Drag shape to shape',
    description: 'Pinch inside Shape A and release inside Shape B to forge a dynamic arrow that stays anchored when shapes move.',
    renderSvg: (isDark) => {
      const ink = isDark ? '#f8fafc' : '#121212';
      return (
        <svg viewBox="0 0 180 96" className="w-full h-24" aria-hidden="true">
          <rect
            x="22"
            y="28"
            width="42"
            height="36"
            rx="6"
            fill={isDark ? '#1e293b' : '#f8fafc'}
            stroke={ink}
            strokeWidth="2"
          />
          <circle
            cx="138"
            cy="46"
            r="20"
            fill={isDark ? '#1e293b' : '#f8fafc'}
            stroke={ink}
            strokeWidth="2"
          />
          <path
            d="M 64 46 L 116 46"
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.4"
            strokeLinecap="round"
            className="anim-connector-line"
          />
          <path
            d="M 109 40 L 118 46 L 109 52"
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="anim-connector-head"
          />
          <g className="anim-connector-pinch" transform="translate(82, 42)">
            <circle cx="0" cy="4" r="4" fill="#2563eb" />
            <circle cx="0" cy="4" r="8" fill="#2563eb" opacity="0.22" />
          </g>
        </svg>
      );
    },
  },
  {
    id: 'grab',
    number: '04',
    title: 'Grab & Move',
    handPose: 'Middle Finger + Thumb pinch',
    mouseFallback: 'Select & drag shape',
    description: 'Pinch your middle finger and thumb over any shape to reposition it—connected arrows follow automatically.',
    renderSvg: (isDark) => {
      const ink = isDark ? '#f8fafc' : '#121212';
      return (
        <svg viewBox="0 0 180 96" className="w-full h-24" aria-hidden="true">
          <rect
            x="18"
            y="28"
            width="34"
            height="28"
            rx="5"
            fill="none"
            stroke={ink}
            strokeWidth="2"
          />
          <path
            d="M 52 42 L 88 42"
            fill="none"
            stroke="#059669"
            strokeWidth="2"
            strokeDasharray="3 3"
          />
          <g className="anim-grab-shape">
            <polygon
              points="106,24 128,42 106,60 84,42"
              fill={isDark ? '#1e293b' : '#ffffff'}
              stroke="#059669"
              strokeWidth="2.2"
            />
            <circle cx="106" cy="42" r="3.5" fill="#059669" />
          </g>
        </svg>
      );
    },
  },
  {
    id: 'panzoom',
    number: '05',
    title: 'Infinite Pan & Zoom',
    handPose: 'Closed fist / Two-hand spread',
    mouseFallback: 'Space+drag / Wheel',
    description: 'Make a closed fist to pan the infinite grid, or spread two hands apart to zoom smoothly in and out.',
    renderSvg: (isDark) => {
      const ink = isDark ? '#f8fafc' : '#121212';
      const muted = isDark ? '#475569' : '#cbd5e1';
      return (
        <svg viewBox="0 0 180 96" className="w-full h-24" aria-hidden="true">
          <g className="anim-pan-grid">
            <rect x="40" y="20" width="100" height="56" rx="6" fill="none" stroke={muted} strokeWidth="1.4" strokeDasharray="4 4" />
            <circle cx="72" cy="48" r="10" fill="none" stroke={ink} strokeWidth="1.8" />
            <rect x="96" y="38" width="22" height="20" rx="3" fill="none" stroke={ink} strokeWidth="1.8" />
          </g>
          {/* Left & Right hand spread indicators */}
          <g className="anim-two-hand-left" transform="translate(36, 42)">
            <rect x="0" y="0" width="14" height="16" rx="5" fill={isDark ? '#1e293b' : '#ffffff'} stroke="#d97706" strokeWidth="1.8" />
            <path d="M-4 8 L-10 8 M-7 5 L-10 8 L-7 11" fill="none" stroke="#d97706" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <g className="anim-two-hand-right" transform="translate(130, 42)">
            <rect x="0" y="0" width="14" height="16" rx="5" fill={isDark ? '#1e293b' : '#ffffff'} stroke="#d97706" strokeWidth="1.8" />
            <path d="M18 8 L24 8 M21 5 L24 8 L21 11" fill="none" stroke="#d97706" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        </svg>
      );
    },
  },
  {
    id: 'type',
    number: '06',
    title: 'Type Anywhere',
    handPose: 'Double-pinch shape or canvas',
    mouseFallback: 'Double-click anywhere',
    description: 'Double-click or double-pinch inside any shape to type centered labels, or on empty space for floating notes.',
    renderSvg: (isDark) => {
      const ink = isDark ? '#f8fafc' : '#121212';
      return (
        <svg viewBox="0 0 180 96" className="w-full h-24" aria-hidden="true">
          <rect
            x="40"
            y="22"
            width="100"
            height="52"
            rx="8"
            fill={isDark ? '#1e293b' : '#f8fafc'}
            stroke={ink}
            strokeWidth="2"
          />
          <circle
            cx="90"
            cy="48"
            r="14"
            fill="none"
            stroke="#2563eb"
            strokeWidth="1.8"
            className="anim-double-tap-ring"
          />
          <g className="anim-type-text">
            <text
              x="90"
              y="52"
              textAnchor="middle"
              fill={ink}
              fontSize="15"
              fontWeight="600"
              fontFamily="Patrick Hand, Caveat, cursive, sans-serif"
            >
              Concept
            </text>
            <line
              x1="122"
              y1="39"
              x2="122"
              y2="56"
              stroke="#2563eb"
              strokeWidth="2"
              className="anim-caret-blink"
            />
          </g>
        </svg>
      );
    },
  },
  {
    id: 'colors',
    number: '07',
    title: 'Finger-Count Color Switch',
    handPose: 'Left Hand 1–5 fingers (or 350ms 1-hand hold)',
    mouseFallback: 'Click 1–5 swatch pills',
    description:
      'Hold up 1 to 5 fingers on your Left Hand while drawing—or hold 1–5 fingers steady for 350ms with one hand—to switch between Auto Contrast, Electric Blue, Neon Green, Vivid Amber, and Neon Pink.',
    renderSvg: (isDark) => {
      const ink = isDark ? '#FFFFFF' : '#111111';
      const swatchItems = [
        { n: '1', fill: isDark ? '#FFFFFF' : '#111111', cls: 'anim-swatch-1', x: 30 },
        { n: '2', fill: '#00B4FF', cls: 'anim-swatch-2', x: 64 },
        { n: '3', fill: '#00E676', cls: 'anim-swatch-3', x: 98 },
        { n: '4', fill: '#FFAB00', cls: 'anim-swatch-4', x: 132 },
        { n: '5', fill: '#FF4081', cls: 'anim-swatch-5', x: 166 },
      ];
      return (
        <svg viewBox="0 0 280 96" className="w-full h-24" aria-hidden="true">
          {/* Animated 1-5 Swatch Pills */}
          {swatchItems.map((s) => (
            <g key={s.n} transform={`translate(${s.x}, 40)`}>
              <g className={s.cls}>
                <circle cx="0" cy="0" r="10.5" fill={s.fill} stroke={ink} strokeOpacity="0.28" strokeWidth="1.4" />
                <text
                  x="0"
                  y="23"
                  textAnchor="middle"
                  fill={ink}
                  fontSize="11"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  {s.n}
                </text>
              </g>
            </g>
          ))}

          {/* Live Cursor & Shape Preview cycling through active colors */}
          <g transform="translate(230, 44)">
            <circle
              cx="0"
              cy="0"
              r="20"
              fill="none"
              strokeWidth="2.6"
              className="anim-color-cycle-stroke"
            />
            <circle cx="0" cy="0" r="5" className="anim-color-cycle-fill" />
            <text
              x="0"
              y="35"
              textAnchor="middle"
              fill={ink}
              fontSize="12"
              fontFamily="Patrick Hand, cursive, sans-serif"
            >
              Active Glow
            </text>
          </g>
        </svg>
      );
    },
  },
];

export const GestureTutorialModal: React.FC<GestureTutorialModalProps> = ({
  isOpen,
  theme,
  dontShowAgain,
  onDontShowAgainChange,
  onStartDrawing,
  onStartPracticeMode,
  onClose,
}) => {
  const [selectedCardId, setSelectedCardId] = useState<string>('draw');
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-modal-title"
    >
      <div
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          isDark
            ? 'bg-[#0A0A0C] border-[#1F1F24] text-neutral-100'
            : 'bg-white border-neutral-200 text-[#111111]'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-start justify-between gap-4 px-6 py-5 border-b ${
            isDark ? 'border-[#1F1F24]' : 'border-neutral-200'
          }`}
        >
          <div>
            <h2
              id="tutorial-modal-title"
              className="font-display text-2xl sm:text-3xl font-bold tracking-tight"
            >
              How to Control AirDraw
            </h2>
            <p
              className={`mt-1 text-sm ${
                isDark ? 'text-neutral-400' : 'text-neutral-600'
              }`}
            >
              Use webcam hand gestures or mouse and touch seamlessly. Every shape snaps cleanly on release.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close gesture guide"
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isDark
                ? 'text-neutral-400 hover:text-white hover:bg-[#161618]'
                : 'text-neutral-500 hover:text-[#111111] hover:bg-neutral-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Interactive Cards Grid */}
        <div className="overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {GESTURE_CARDS.map((card) => {
              const isSelected = selectedCardId === card.id;
              const isWide = card.id === 'colors';
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setSelectedCardId(card.id)}
                  className={`group text-left rounded-xl border p-4 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isWide ? 'sm:col-span-2 lg:col-span-3' : ''
                  } ${
                    isSelected
                      ? isDark
                        ? 'bg-[#121216] border-[#00B4FF]/80 ring-1 ring-[#00B4FF]/30'
                        : 'bg-blue-50/40 border-blue-500 ring-1 ring-blue-500/20'
                      : isDark
                        ? 'bg-[#050507] border-[#1F1F24] hover:border-neutral-700'
                        : 'bg-neutral-50/60 border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <div className="mb-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-hand text-base font-semibold tracking-tight whitespace-nowrap">
                        {card.number}. {card.title}
                      </h3>
                    </div>
                    <p
                      className={`mt-0.5 text-[11px] font-mono-tabular whitespace-nowrap ${
                        isDark ? 'text-[#00B4FF]' : 'text-blue-600'
                      }`}
                    >
                      Mouse: {card.mouseFallback}
                    </p>
                  </div>

                  {/* Animated SVG Illustration */}
                  <div
                    className={`rounded-lg border mb-3 overflow-hidden ${
                      isDark
                        ? 'bg-[#000000] border-[#1F1F24]'
                        : 'bg-white border-neutral-200/80'
                    }`}
                  >
                    {card.renderSvg(isDark)}
                  </div>

                  <p
                    className={`text-xs font-medium mb-1 ${
                      isDark ? 'text-neutral-200' : 'text-neutral-800'
                    }`}
                  >
                    {card.handPose}
                  </p>
                  <p
                    className={`text-xs leading-relaxed ${
                      isDark ? 'text-neutral-400' : 'text-neutral-600'
                    }`}
                  >
                    {card.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t ${
            isDark ? 'border-[#1F1F24] bg-[#060608]' : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          <label className="inline-flex items-center gap-2.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => onDontShowAgainChange(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-400 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className={isDark ? 'text-neutral-300' : 'text-neutral-700'}>
              Don&apos;t show again
            </span>
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onStartPracticeMode}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isDark
                  ? 'border-neutral-700 text-neutral-200 hover:bg-neutral-800'
                  : 'border-neutral-300 text-neutral-800 hover:bg-neutral-100'
              }`}
            >
              <Sparkles className="w-4 h-4 text-blue-500" />
              Try Interactive Practice Mode
            </button>

            <button
              type="button"
              onClick={onStartDrawing}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              Start Drawing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
