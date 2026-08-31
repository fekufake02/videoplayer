'use client';

import React from 'react';
import { useUpload } from '../context/UploadContext';
import {
  UploadCloud,
  Pause,
  Play,
  RotateCcw,
  Maximize2,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
} from 'lucide-react';

export const UploadDock: React.FC = () => {
  const {
    tasks,
    isModalOpen,
    openUploadModal,
    activeUploadsCount,
    overallProgress,
    overallSpeed,
    pauseAll,
    resumeAll,
    retryAllFailed,
    clearCompleted,
  } = useUpload();

  // If modal is open or there are no tasks at all, hide the floating dock
  if (isModalOpen || tasks.length === 0) {
    return null;
  }

  const formatSpeed = (bytesPerSec: number): string => {
    if (bytesPerSec <= 0) return '';
    if (bytesPerSec >= 1024 * 1024) {
      return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${Math.round(bytesPerSec / 1024)} KB/s`;
  };

  const formatEta = (seconds: number): string => {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '';
    if (seconds < 60) return `${seconds}s left`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s left`;
  };

  const uploadingCount = tasks.filter((t) => t.status === 'uploading').length;
  const pausedCount = tasks.filter((t) => t.status === 'paused').length;
  const errorCount = tasks.filter((t) => t.status === 'error').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const retryingCount = tasks.filter((t) => t.status === 'retrying').length;

  // Compute maximum ETA among active tasks
  const maxEta = Math.max(
    0,
    ...tasks.filter((t) => t.status === 'uploading').map((t) => t.etaSeconds || 0)
  );

  const speedText = formatSpeed(overallSpeed);
  const etaText = formatEta(maxEta);

  const allCompleted = completedCount === tasks.length;

  return (
    <div
      id="upload-dock-container"
      className="fixed bottom-5 right-5 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl text-white max-w-md">
        {/* Status Icon */}
        <div className="relative shrink-0">
          {allCompleted ? (
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          ) : errorCount > 0 && uploadingCount === 0 ? (
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              {uploadingCount > 0 || retryingCount > 0 ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <UploadCloud className="w-5 h-5" />
              )}
            </div>
          )}
        </div>

        {/* Text & Progress */}
        <button
          onClick={openUploadModal}
          className="flex-1 text-left min-w-[170px] max-w-[220px] focus:outline-none"
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-zinc-200 truncate">
              {allCompleted
                ? 'All uploads completed'
                : uploadingCount > 0
                ? `Uploading (${completedCount + 1}/${tasks.length})`
                : pausedCount > 0
                ? `${pausedCount} paused`
                : errorCount > 0
                ? `${errorCount} failed`
                : 'Queued'}
            </span>
            <span className="font-mono text-indigo-400 text-[11px] ml-1">
              {overallProgress}%
            </span>
          </div>

          <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${
                allCompleted
                  ? 'bg-emerald-500'
                  : errorCount > 0 && uploadingCount === 0
                  ? 'bg-rose-500'
                  : 'bg-indigo-500'
              }`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1 font-mono">
            <span>{speedText || (allCompleted ? 'Saved to vault' : 'Resumable')}</span>
            <span>{etaText}</span>
          </div>
        </button>

        {/* Quick Actions */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-800 shrink-0">
          {uploadingCount > 0 ? (
            <button
              onClick={pauseAll}
              title="Pause all uploads"
              className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <Pause className="w-4 h-4" />
            </button>
          ) : pausedCount > 0 ? (
            <button
              onClick={resumeAll}
              title="Resume all paused"
              className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <Play className="w-4 h-4" />
            </button>
          ) : null}

          {errorCount > 0 && (
            <button
              onClick={retryAllFailed}
              title="Retry failed uploads"
              className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {allCompleted ? (
            <button
              onClick={clearCompleted}
              title="Dismiss"
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={openUploadModal}
              title="Open full upload manager"
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
