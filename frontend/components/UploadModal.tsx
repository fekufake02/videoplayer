'use client';

import React, { useRef } from 'react';
import { useUpload, UploadTask } from '../context/UploadContext';
import {
  UploadCloud,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  Layers,
  X,
  Minimize2,
  Clock,
  Zap,
} from 'lucide-react';

interface UploadModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen: propIsOpen,
  onClose: propOnClose,
}) => {
  const {
    tasks,
    isModalOpen: contextIsOpen,
    closeUploadModal,
    addFiles,
    pauseUpload,
    resumeUpload,
    retryUpload,
    cancelUpload,
    updateItemTitle,
    pauseAll,
    resumeAll,
    retryAllFailed,
    clearCompleted,
    overallProgress,
    overallSpeed,
    totalQueueBytes,
    uploadedQueueBytes,
  } = useUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVisible = propIsOpen !== undefined ? propIsOpen : contextIsOpen;
  const baseClose = propOnClose || closeUploadModal;

  const handleCloseAndClear = () => {
    clearCompleted();
    baseClose();
  };

  if (!isVisible) return null;

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

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

  const uploadingTasks = tasks.filter((t) => t.status === 'uploading');
  const pausedTasks = tasks.filter((t) => t.status === 'paused');
  const errorTasks = tasks.filter((t) => t.status === 'error');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  const maxEta = Math.max(0, ...uploadingTasks.map((t) => t.etaSeconds || 0));

  return (
    <div
      id="upload-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        id="upload-modal-panel"
        className="bg-surface border border-border max-w-3xl w-full rounded-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col text-text-primary"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent shadow-sm">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary tracking-tight">
                Vault Media Uploader
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              id="btn-minimize-upload"
              onClick={baseClose}
              title="Minimize to background dock"
              className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-elevated transition-colors flex items-center gap-1 text-xs"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Dock</span>
            </button>
            <button
              id="btn-close-upload-modal"
              onClick={handleCloseAndClear}
              className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Progress Bar when items are queued */}
        {tasks.length > 0 && (
          <div className="mb-4 p-3.5 rounded-lg bg-background-secondary border border-border shrink-0 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-secondary">
                  Queue Progress ({completedTasks.length}/{tasks.length})
                </span>
                {overallSpeed > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-success bg-success/10 px-2 py-0.5 rounded border border-success/20 tabular-nums">
                    <Zap className="w-3 h-3" />
                    {formatSpeed(overallSpeed)}
                  </span>
                )}
                {maxEta > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20 tabular-nums">
                    <Clock className="w-3 h-3" />
                    {formatEta(maxEta)}
                  </span>
                )}
              </div>
              <span className="font-mono text-accent font-semibold tabular-nums">
                {formatSize(uploadedQueueBytes)} / {formatSize(totalQueueBytes)} ({overallProgress}%)
              </span>
            </div>

            <div className="w-full h-1.5 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-200"
                style={{ width: `${overallProgress}%` }}
              />
            </div>

            {/* Batch Controls */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <div className="flex items-center gap-2">
                {uploadingTasks.length > 0 && (
                  <button
                    onClick={pauseAll}
                    className="flex items-center gap-1 px-2.5 py-1 bg-surface-elevated hover:bg-surface-hover border border-border text-text-secondary rounded-lg transition-colors text-[11px]"
                  >
                    <Pause className="w-3 h-3 text-warning" />
                    <span>Pause All</span>
                  </button>
                )}
                {pausedTasks.length > 0 && (
                  <button
                    onClick={resumeAll}
                    className="flex items-center gap-1 px-2.5 py-1 bg-surface-elevated hover:bg-surface-hover border border-border text-text-secondary rounded-lg transition-colors text-[11px]"
                  >
                    <Play className="w-3 h-3 text-success" />
                    <span>Resume All ({pausedTasks.length})</span>
                  </button>
                )}
                {errorTasks.length > 0 && (
                  <button
                    onClick={retryAllFailed}
                    className="flex items-center gap-1 px-2.5 py-1 bg-danger/10 hover:bg-danger/20 border border-danger/20 text-danger rounded-lg transition-colors text-[11px]"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Retry All Failed ({errorTasks.length})</span>
                  </button>
                )}
              </div>

              {completedTasks.length > 0 && (
                <button
                  onClick={clearCompleted}
                  className="text-[11px] text-text-muted hover:text-text-primary transition-colors"
                >
                  Clear Completed ({completedTasks.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Dropzone for adding files */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="relative border border-dashed border-border hover:border-accent rounded-xl p-5 text-center bg-background-secondary/60 hover:bg-background-secondary transition-all shrink-0 mb-3 cursor-pointer group"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*"
            onChange={handleFilesSelect}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <UploadCloud className="w-7 h-7 mx-auto mb-1.5 text-accent group-hover:scale-105 transition-transform" />
          <div className="text-xs text-text-secondary">
            <span className="text-accent font-medium">Select video files</span> or drag & drop anywhere here
          </div>
        </div>

        {/* Task Items List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-[140px] max-h-[340px]">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-text-muted text-xs">
              <FileVideo className="w-8 h-8 mb-2 opacity-30 text-text-muted" />
              <span>No active uploads in queue. Drag video files above to begin.</span>
            </div>
          ) : (
            tasks.map((task: UploadTask) => {
              const itemSpeed = formatSpeed(task.speed);
              const itemEta = formatEta(task.etaSeconds);

              return (
                <div
                  key={task.id}
                  id={`upload-task-${task.id}`}
                  className={`p-3 rounded-lg border transition-all text-xs ${
                    task.status === 'completed'
                      ? 'bg-success/5 border-success/20'
                      : task.status === 'error'
                      ? 'bg-danger/5 border-danger/20'
                      : task.status === 'retrying'
                      ? 'bg-warning/5 border-warning/20'
                      : 'bg-background-secondary border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {task.status === 'completed' ? (
                        <div className="w-7 h-7 rounded-md bg-success/15 border border-success/30 flex items-center justify-center text-success">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      ) : task.status === 'error' ? (
                        <div className="w-7 h-7 rounded-md bg-danger/15 border border-danger/30 flex items-center justify-center text-danger">
                          <AlertCircle className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                          <FileVideo className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => updateItemTitle(task.id, e.target.value)}
                          disabled={task.status === 'completed'}
                          placeholder="Video title..."
                          className="bg-surface border border-border px-2.5 py-1 rounded-md text-text-primary text-xs focus:outline-none focus:border-accent flex-1 truncate"
                        />

                        {/* Status Badges */}
                        <div className="shrink-0 flex items-center gap-1.5">
                          {task.status === 'uploading' && (
                            <span className="px-2 py-0.5 rounded bg-accent/15 text-accent font-mono text-[10px] font-semibold tabular-nums">
                              {task.progress}%
                            </span>
                          )}
                          {task.status === 'paused' && (
                            <span className="px-2 py-0.5 rounded bg-surface-elevated text-text-secondary text-[10px] font-medium tabular-nums">
                              Paused ({task.progress}%)
                            </span>
                          )}
                          {task.status === 'retrying' && (
                            <span className="px-2 py-0.5 rounded bg-warning/15 border border-warning/30 text-warning text-[10px] font-medium animate-pulse tabular-nums">
                              Auto-retrying ({task.retryTimerSeconds || 1}s)
                            </span>
                          )}
                          {task.status === 'error' && (
                            <span className="px-2 py-0.5 rounded bg-danger/15 text-danger text-[10px] font-medium tabular-nums">
                              Failed at {task.progress}%
                            </span>
                          )}
                          {task.status === 'completed' && (
                            <span className="px-2 py-0.5 rounded bg-success/15 text-success text-[10px] font-medium flex items-center gap-1">
                              Complete
                            </span>
                          )}
                          {task.status === 'pending' && (
                            <span className="px-2 py-0.5 rounded bg-surface-elevated text-text-muted text-[10px]">
                              Queued
                            </span>
                          )}
                        </div>
                      </div>

                      {/* File details & Metrics */}
                      <div className="flex items-center justify-between text-[11px] text-text-muted font-mono tabular-nums">
                        <span className="truncate max-w-[220px]">
                          {task.file.name} ({formatSize(task.totalBytes)})
                        </span>
                        <div className="flex items-center gap-2">
                          {task.status === 'uploading' && (
                            <>
                              {itemSpeed && <span className="text-success">{itemSpeed}</span>}
                              {itemEta && <span>{itemEta}</span>}
                            </>
                          )}
                          {task.status === 'paused' && (
                            <span>Paused at {formatSize(task.uploadedBytes)}</span>
                          )}
                          {task.status === 'retrying' && (
                            <span className="text-warning">Retrying from {formatSize(task.uploadedBytes)}</span>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-1 bg-surface-elevated rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-150 ${
                            task.status === 'completed'
                              ? 'bg-success'
                              : task.status === 'error'
                              ? 'bg-danger'
                              : task.status === 'retrying'
                              ? 'bg-warning'
                              : task.status === 'paused'
                              ? 'bg-text-muted'
                              : 'bg-accent'
                          }`}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>

                      {/* Error / Retry message info */}
                      {task.error && (
                        <p className="text-[11px] text-danger bg-danger/10 px-2 py-1 rounded border border-danger/20">
                          {task.error}
                        </p>
                      )}
                    </div>

                    {/* Task Actions */}
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      {task.status === 'uploading' && (
                        <button
                          type="button"
                          onClick={() => pauseUpload(task.id)}
                          title="Pause upload"
                          className="p-1.5 text-text-muted hover:text-warning hover:bg-surface-elevated rounded-md transition-colors"
                        >
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {task.status === 'paused' && (
                        <button
                          type="button"
                          onClick={() => resumeUpload(task.id)}
                          title="Resume upload"
                          className="p-1.5 text-text-muted hover:text-success hover:bg-surface-elevated rounded-md transition-colors"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {task.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => retryUpload(task.id)}
                          title="Try Again"
                          className="flex items-center gap-1 px-2 py-1 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-md transition-colors shadow-sm"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      )}

                      {task.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => cancelUpload(task.id)}
                          title="Cancel"
                          className="p-1.5 text-text-muted hover:text-danger hover:bg-surface-elevated rounded-md transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 mt-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={handleCloseAndClear}
            className="px-4 py-2 bg-surface-elevated hover:bg-surface-hover text-text-secondary hover:text-text-primary text-xs font-medium rounded-lg border border-border transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
