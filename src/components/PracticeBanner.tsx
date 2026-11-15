import React from 'react';
import { CheckCircle2, Circle, X } from 'lucide-react';
import type { PracticeProgress, ThemeMode } from '../types/board';

interface PracticeBannerProps {
  theme: ThemeMode;
  progress: PracticeProgress;
  onExit: () => void;
}

export const PracticeBanner: React.FC<PracticeBannerProps> = ({ theme, progress, onExit }) => {
  const isDark = theme === 'dark';

  const tasks = [
    { key: 'drewShape', label: '1. Draw & snap a shape', done: progress.drewShape },
    { key: 'connectedShapes', label: '2. Connect two shapes', done: progress.connectedShapes },
    { key: 'movedShape', label: '3. Move a shape', done: progress.movedShape },
    { key: 'typedText', label: '4. Double-click to type', done: progress.typedText },
  ];

  const allDone = tasks.every((t) => t.done);

  return (
    <div
      role="status"
      aria-label="Interactive practice progress"
      className={`fixed top-[68px] left-1/2 -translate-x-1/2 z-20 flex flex-nowrap items-center gap-3 px-3.5 py-1.5 rounded-xl border shadow-sm transition-colors max-w-[95vw] overflow-x-auto ${
        isDark
          ? 'bg-[#0A0A0C]/95 border-[#1F1F24] text-neutral-100'
          : 'bg-white/95 border-neutral-200 text-[#111111]'
      }`}
    >
      <span className="text-xs font-semibold text-blue-500 whitespace-nowrap shrink-0">
        {allDone ? 'Practice Complete' : 'Practice Mode'}
      </span>
      <div className="flex flex-nowrap items-center gap-3 shrink-0">
        {tasks.map((task) => (
          <span
            key={task.key}
            className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${
              task.done
                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                : isDark
                  ? 'text-neutral-300'
                  : 'text-neutral-600'
            }`}
          >
            {task.done ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="w-3.5 h-3.5 opacity-45 shrink-0" />
            )}
            <span>{task.label}</span>
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onExit}
        aria-label="Exit practice mode"
        className={`ml-0.5 p-1 rounded-md transition-colors cursor-pointer shrink-0 ${
          isDark ? 'text-neutral-400 hover:bg-neutral-800' : 'text-neutral-500 hover:bg-neutral-100'
        }`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
