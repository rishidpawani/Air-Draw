import React from 'react';
import { Minus, Plus, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import type { ThemeMode } from '../types/board';

interface BottomLeftControlsProps {
  theme: ThemeMode;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onResetZoom: () => void;
}

export const BottomLeftControls: React.FC<BottomLeftControlsProps> = ({
  theme,
  zoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomOut,
  onZoomIn,
  onResetZoom,
}) => {
  const isDark = theme === 'dark';
  const baseBox = isDark
    ? 'bg-[#0A0A0C]/95 border-[#1F1F24] text-neutral-100'
    : 'bg-white/95 border-neutral-200 text-[#111111]';
  const btnHover = isDark
    ? 'hover:bg-[#161618] disabled:text-neutral-600'
    : 'hover:bg-neutral-100 disabled:text-neutral-300';

  return (
    <div className="fixed bottom-3 left-3 z-30 flex items-center gap-2">
      {/* Undo / Redo */}
      <div className={`flex items-center rounded-xl border shadow-sm backdrop-blur-md p-1 ${baseBox}`}>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className={`p-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed ${btnHover}`}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          className={`p-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed ${btnHover}`}
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Zoom Controls */}
      <div className={`flex items-center rounded-xl border shadow-sm backdrop-blur-md p-1 ${baseBox}`}>
        <button
          type="button"
          onClick={onZoomOut}
          aria-label="Zoom out"
          title="Zoom out"
          className={`p-2 rounded-lg transition-colors cursor-pointer ${btnHover}`}
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onResetZoom}
          aria-label="Reset zoom to 100%"
          title="Reset viewport"
          className={`px-2.5 py-1.5 text-xs font-mono-tabular font-medium rounded-lg transition-colors cursor-pointer ${btnHover}`}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Zoom in"
          title="Zoom in"
          className={`p-2 rounded-lg transition-colors cursor-pointer ${btnHover}`}
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onResetZoom}
          aria-label="Recenter canvas"
          title="Recenter canvas"
          className={`p-2 rounded-lg transition-colors cursor-pointer ${btnHover}`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
