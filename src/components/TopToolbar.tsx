import React, { useRef } from 'react';
import {
  ArrowRight,
  Circle,
  Diamond,
  FolderOpen,
  Hand,
  HelpCircle,
  Minus,
  Moon,
  MousePointer,
  Pause,
  PenTool,
  Play,
  Save,
  Square,
  Sun,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import type { ThemeMode, ToolMode } from '../types/board';
import { FINGER_COLOR_PALETTE } from '../utils/gestureClassifier';

interface TopToolbarProps {
  theme: ThemeMode;
  activeTool: ToolMode;
  strokeColor: string;
  canUndo: boolean;
  cameraDrawPaused: boolean;
  onSelectTool: (tool: ToolMode) => void;
  onSelectStrokeColor: (color: string) => void;
  onUndo: () => void;
  onToggleCameraDrawPaused: () => void;
  onToggleTheme: () => void;
  onSaveFile: () => void;
  onOpenFile: (file: File) => void;
  onClearBoard: () => void;
  onOpenGuide: () => void;
}

const TOOL_ITEMS: { id: ToolMode; label: string; icon: React.ReactNode; shortcut: string }[] = [
  { id: 'smart', label: 'Smart Draw & Snap', icon: <PenTool className="w-4 h-4" />, shortcut: '1' },
  { id: 'select', label: 'Select & Grab', icon: <MousePointer className="w-4 h-4" />, shortcut: '2' },
  { id: 'rectangle', label: 'Rectangle', icon: <Square className="w-4 h-4" />, shortcut: '3' },
  { id: 'circle', label: 'Circle', icon: <Circle className="w-4 h-4" />, shortcut: '4' },
  { id: 'diamond', label: 'Diamond', icon: <Diamond className="w-4 h-4" />, shortcut: '5' },
  { id: 'line', label: 'Straight Line', icon: <Minus className="w-4 h-4" />, shortcut: '6' },
  { id: 'connector', label: 'Smart Connector', icon: <ArrowRight className="w-4 h-4" />, shortcut: '7' },
  { id: 'text', label: 'Text', icon: <Type className="w-4 h-4" />, shortcut: '8' },
  { id: 'pan', label: 'Pan Canvas', icon: <Hand className="w-4 h-4" />, shortcut: '9' },
];

export const TopToolbar: React.FC<TopToolbarProps> = ({
  theme,
  activeTool,
  strokeColor,
  canUndo,
  cameraDrawPaused,
  onSelectTool,
  onSelectStrokeColor,
  onUndo,
  onToggleCameraDrawPaused,
  onToggleTheme,
  onSaveFile,
  onOpenFile,
  onClearBoard,
  onOpenGuide,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDark = theme === 'dark';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onOpenFile(file);
    }
    e.target.value = '';
  };

  return (
    <header
      className={`fixed top-3 left-3 right-3 z-30 flex items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl border shadow-sm backdrop-blur-md transition-colors overflow-x-auto ${
        isDark
          ? 'bg-[#0A0A0C]/95 border-[#1F1F24] text-neutral-100'
          : 'bg-white/95 border-neutral-200 text-[#111111]'
      }`}
    >
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-display text-2xl font-bold tracking-tight leading-none whitespace-nowrap">
          AirDraw
        </span>
      </div>

      {/* Zone 2: Center Tool Palette + 1-5 Color Swatch Pills */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          role="toolbar"
          aria-label="Drawing tools"
          className={`flex items-center gap-0.5 p-1 rounded-lg border ${
            isDark ? 'bg-[#000000] border-[#1F1F24]' : 'bg-neutral-100/80 border-neutral-200/80'
          }`}
        >
          {TOOL_ITEMS.map((item) => {
            const active = activeTool === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTool(item.id)}
                title={`${item.label} (${item.shortcut})`}
                aria-label={item.label}
                aria-pressed={active}
                className={`p-2 rounded-md transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isDark
                      ? 'text-neutral-300 hover:text-white hover:bg-[#161618]'
                      : 'text-neutral-600 hover:text-[#111111] hover:bg-white'
                }`}
              >
                {item.icon}
              </button>
            );
          })}
        </div>

        {/* 1-5 Finger-Count Color Swatch Pills */}
        <div
          className={`hidden md:flex items-center gap-1 p-1 rounded-lg border ${
            isDark ? 'bg-[#000000] border-[#1F1F24]' : 'bg-neutral-100/80 border-neutral-200/80'
          }`}
          role="group"
          aria-label="Stroke ink color"
        >
          {FINGER_COLOR_PALETTE.map((swatch) => {
            const selected = strokeColor.toLowerCase() === swatch.strokeColor.toLowerCase();
            const bg = isDark ? swatch.darkHex : swatch.lightHex;
            return (
              <button
                key={swatch.strokeColor}
                type="button"
                onClick={() => onSelectStrokeColor(swatch.strokeColor)}
                aria-label={`${swatch.count}: ${swatch.label}`}
                aria-pressed={selected}
                title={`${swatch.pose}: ${swatch.label}`}
                className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-md border text-[11px] font-mono-tabular font-semibold transition-all cursor-pointer shrink-0 ${
                  selected
                    ? isDark
                      ? 'bg-[#161618] border-neutral-400 text-white shadow-xs'
                      : 'bg-white border-neutral-900 text-[#111111] shadow-xs'
                    : isDark
                      ? 'border-transparent text-neutral-400 hover:bg-[#161618] hover:text-neutral-200'
                      : 'border-transparent text-neutral-600 hover:bg-white/80 hover:text-[#111111]'
                }`}
              >
                <span
                  className={`w-3 h-3 rounded-full border shrink-0 ${
                    isDark ? 'border-white/25' : 'border-black/15'
                  }`}
                  style={{
                    backgroundColor: bg,
                    boxShadow: selected ? `0 0 8px ${bg}` : undefined,
                  }}
                />
                <span>{swatch.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Zone 3: Quick Undo, Pause Camera Drawing, Theme Toggle, .airdraw File Save/Open, Guide */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
            canUndo
              ? isDark
                ? 'border-[#1F1F24] text-neutral-200 hover:bg-[#161618] cursor-pointer'
                : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100 cursor-pointer'
              : isDark
                ? 'border-[#1F1F24] text-neutral-600 cursor-not-allowed'
                : 'border-neutral-200/70 text-neutral-300 cursor-not-allowed'
          }`}
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Undo</span>
        </button>

        <button
          type="button"
          onClick={onToggleCameraDrawPaused}
          aria-pressed={cameraDrawPaused}
          aria-label={cameraDrawPaused ? 'Resume camera drawing' : 'Pause camera drawing'}
          title={cameraDrawPaused ? 'Resume gesture drawing' : 'Pause gesture drawing (keep hover/pan)'}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            cameraDrawPaused
              ? 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/25'
              : isDark
                ? 'border-[#1F1F24] text-neutral-200 hover:bg-[#161618]'
                : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'
          }`}
        >
          {cameraDrawPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          <span>{cameraDrawPaused ? 'Draw Paused' : 'Pause Draw'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to Light Mode canvas' : 'Switch to Dark Mode canvas'}
          title={isDark ? 'Switch to Light Mode (#ffffff)' : 'Switch to AMOLED Dark Mode (#000000)'}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            isDark
              ? 'border-[#1F1F24] bg-[#161618] text-neutral-100 hover:bg-[#1F1F24]'
              : 'border-neutral-200 bg-neutral-100/80 text-neutral-800 hover:bg-neutral-200/70'
          }`}
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-neutral-700" />}
          <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
        </button>

        <button
          type="button"
          onClick={onSaveFile}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            isDark
              ? 'border-[#1F1F24] text-neutral-200 hover:bg-[#161618]'
              : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'
          }`}
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save (.airdraw)</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            isDark
              ? 'border-[#1F1F24] text-neutral-200 hover:bg-[#161618]'
              : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Open (.airdraw)</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".airdraw,.json"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Open .airdraw file"
        />

        <button
          type="button"
          onClick={onClearBoard}
          aria-label="Clear canvas"
          title="Clear canvas"
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
            isDark
              ? 'border-[#1F1F24] text-neutral-300 hover:text-red-400 hover:bg-[#161618]'
              : 'border-neutral-200 text-neutral-600 hover:text-red-600 hover:bg-neutral-100'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onOpenGuide}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>? Guide</span>
        </button>
      </div>
    </header>
  );
};
