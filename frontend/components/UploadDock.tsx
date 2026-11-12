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
      className="fixed bottom-5 right-5 z-40 animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5 bg-surface-elevated/95 backdrop-blur-md border border-border rounded-xl shadow-2xl text-text-primary max-w-md">
        {/* Status Icon */}
        <div className="relative shrink-0">
          {allCompleted ? (
            <div className="w-8 h-8 rounded-lg bg-success/15 border border-success/30 flex items-center justify-center text-success">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          ) : errorCount > 0 && uploadingCount === 0 ? (
            <div className="w-8 h-8 rounded-lg bg-danger/15 border border-danger/30 flex items-center justify-center text-danger">
              <AlertTriangle className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              {uploadingCount > 0 || retryingCount > 0 ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
            </div>
          )}
        </div>

        {/* Text & Progress */}
        <button
          onClick={openUploadModal}
          className="flex-1 text-left min-w-[170px] max-w-[220px] focus:outline-none cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-text-primary truncate">
              {allCompleted
                ? 'All uploads complete'
                : uploadingCount > 0
                ? `Uploading (${completedCount + 1}/${tasks.length})`
                : pausedCount > 0
                ? `${pausedCount} paused`
                : errorCount > 0
                ? `${errorCount} failed`
                : 'Queued'}
            </span>
            <span className="font-mono text-accent text-[11px] ml-1 tabular-nums">
              {overallProgress}%
            </span>
          </div>

          <div className="w-full h-1 bg-surface rounded-full mt-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${
                allCompleted
                  ? 'bg-success'
                  : errorCount > 0 && uploadingCount === 0
                  ? 'bg-danger'
                  : 'bg-accent'
              }`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-text-muted mt-1 font-mono tabular-nums">
            <span>{speedText || (allCompleted ? 'Saved to vault' : 'Resumable')}</span>
            <span>{etaText}</span>
          </div>
        </button>

        {/* Quick Actions */}
        <div className="flex items-center gap-1 pl-2 border-l border-border shrink-0">
          {uploadingCount > 0 ? (
            <button
              onClick={pauseAll}
              title="Pause all uploads"
              className="p-1.5 text-text-muted hover:text-warning hover:bg-surface rounded-md transition-colors"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          ) : pausedCount > 0 ? (
            <button
              onClick={resumeAll}
              title="Resume all paused"
              className="p-1.5 text-text-muted hover:text-success hover:bg-surface rounded-md transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          ) : null}

          {errorCount > 0 && (
            <button
              onClick={retryAllFailed}
              title="Retry failed uploads"
              className="p-1.5 text-danger hover:bg-danger/10 rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {allCompleted ? (
            <button
              onClick={clearCompleted}
              title="Dismiss"
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={openUploadModal}
              title="Open full upload manager"
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface rounded-md transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
