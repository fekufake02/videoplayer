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

  // Support both controlled props and global context open state
  const isVisible = propIsOpen !== undefined ? propIsOpen : contextIsOpen;
  const handleClose = propOnClose || closeUploadModal;

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

  const maxEta = Math.max(
    0,
    ...uploadingTasks.map((t) => t.etaSeconds || 0)
  );

  return (
    <div
      id="upload-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4"
    >
      <div
        id="upload-modal-panel"
        className="glass-panel max-w-3xl w-full rounded-2xl p-6 shadow-2xl border border-white/10 max-h-[90vh] flex flex-col bg-zinc-950/95 text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-black font-black flex items-center justify-center shadow-lg shadow-amber-400/20 text-base">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white tracking-tight">
                  Smooth Media Uploader
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
                  Smooth Stream
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Background-active • Automatic retry on network drops • Zero pauses
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              id="btn-minimize-upload"
              onClick={handleClose}
              title="Minimize to background dock"
              className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors flex items-center gap-1 text-xs"
            >
              <Minimize2 className="w-4 h-4" />
              <span className="hidden sm:inline">Minimize</span>
            </button>
            <button
              id="btn-close-upload-modal"
              onClick={handleClose}
              className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Progress Bar when items are queued */}
        {tasks.length > 0 && (
          <div className="mb-4 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 shrink-0 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <div className="flex items-center gap-2">
                <span className="text-zinc-200">
                  Total Progress ({completedTasks.length}/{tasks.length} completed)
                </span>
                {overallSpeed > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-800/40">
                    <Zap className="w-3 h-3" />
                    {formatSpeed(overallSpeed)}
                  </span>
                )}
                {maxEta > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-800/40">
                    <Clock className="w-3 h-3" />
                    {formatEta(maxEta)}
                  </span>
                )}
              </div>
              <span className="font-mono text-indigo-400 font-bold">
                {formatSize(uploadedQueueBytes)} / {formatSize(totalQueueBytes)} ({overallProgress}%)
              </span>
            </div>

            <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-amber-400 to-emerald-400 transition-all duration-200"
                style={{ width: `${overallProgress}%` }}
              />
            </div>

            {/* Batch Controls */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <div className="flex items-center gap-2">
                {uploadingTasks.length > 0 && (
                  <button
                    onClick={pauseAll}
                    className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors text-[11px]"
                  >
                    <Pause className="w-3 h-3 text-amber-400" />
                    <span>Pause All</span>
                  </button>
                )}
                {pausedTasks.length > 0 && (
                  <button
                    onClick={resumeAll}
                    className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors text-[11px]"
                  >
                    <Play className="w-3 h-3 text-emerald-400" />
                    <span>Resume All ({pausedTasks.length})</span>
                  </button>
                )}
                {errorTasks.length > 0 && (
                  <button
                    onClick={retryAllFailed}
                    className="flex items-center gap-1 px-2.5 py-1 bg-rose-950/50 hover:bg-rose-900/50 border border-rose-800/50 text-rose-300 rounded-lg transition-colors text-[11px]"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Retry All Failed ({errorTasks.length})</span>
                  </button>
                )}
              </div>

              {completedTasks.length > 0 && (
                <button
                  onClick={clearCompleted}
                  className="text-[11px] text-zinc-400 hover:text-white transition-colors"
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
          className="relative border-2 border-dashed border-zinc-800 hover:border-amber-400/60 rounded-xl p-4 text-center bg-zinc-900/40 transition-all shrink-0 mb-3 cursor-pointer group"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*"
            onChange={handleFilesSelect}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <UploadCloud className="w-7 h-7 mx-auto mb-1.5 text-amber-400 group-hover:scale-110 transition-transform" />
          <div className="text-xs text-zinc-300">
            <span className="text-amber-400 font-semibold">Select files</span> or drag & drop videos here anytime
            <span className="block text-[10px] text-zinc-500 mt-0.5">
              Supports MP4, WebM, MOV, MKV • Auto extracts frame at 15s
            </span>
          </div>
        </div>

        {/* Task Items List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 min-h-[140px] max-h-[340px]">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-zinc-500 text-xs">
              <FileVideo className="w-10 h-10 mb-2 opacity-40 text-zinc-400" />
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
                  className={`p-3 rounded-xl border transition-all text-xs ${
                    task.status === 'completed'
                      ? 'bg-emerald-950/20 border-emerald-900/40'
                      : task.status === 'error'
                      ? 'bg-rose-950/20 border-rose-900/40'
                      : task.status === 'retrying'
                      ? 'bg-amber-950/20 border-amber-900/40'
                      : task.status === 'paused'
                      ? 'bg-zinc-900/90 border-zinc-800'
                      : 'bg-zinc-900/80 border-zinc-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {task.status === 'completed' ? (
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      ) : task.status === 'error' ? (
                        <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                          <AlertCircle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                          <FileVideo className="w-4 h-4" />
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
                          className="bg-zinc-950/80 border border-zinc-800 px-2.5 py-1 rounded-lg text-white font-medium text-xs focus:outline-none focus:border-amber-400 flex-1 truncate"
                        />

                        {/* Status Badges */}
                        <div className="shrink-0 flex items-center gap-1.5">
                          {task.status === 'uploading' && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold">
                              {task.progress}%
                            </span>
                          )}
                          {task.status === 'paused' && (
                            <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-[10px] font-semibold">
                              Paused ({task.progress}%)
                            </span>
                          )}
                          {task.status === 'retrying' && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-semibold animate-pulse">
                              Auto-retrying ({task.retryTimerSeconds || 1}s)
                            </span>
                          )}
                          {task.status === 'error' && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] font-semibold">
                              Failed at {task.progress}%
                            </span>
                          )}
                          {task.status === 'completed' && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                              Ready
                            </span>
                          )}
                          {task.status === 'pending' && (
                            <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 text-[10px]">
                              Queued
                            </span>
                          )}
                        </div>
                      </div>

                      {/* File details & Metrics */}
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                        <span className="truncate max-w-[220px]">
                          {task.file.name} ({formatSize(task.totalBytes)})
                        </span>
                        <div className="flex items-center gap-2">
                          {task.status === 'uploading' && (
                            <>
                              {itemSpeed && <span className="text-emerald-400">{itemSpeed}</span>}
                              {itemEta && <span>{itemEta}</span>}
                              <span className="text-zinc-500">
                                Chunk {task.currentChunkIndex}/{task.totalChunks}
                              </span>
                            </>
                          )}
                          {task.status === 'paused' && (
                            <span className="text-zinc-400">
                              Resumes at {formatSize(task.uploadedBytes)}
                            </span>
                          )}
                          {task.status === 'retrying' && (
                            <span className="text-amber-400">
                              Resuming from byte {formatSize(task.uploadedBytes)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-150 ${
                            task.status === 'completed'
                              ? 'bg-emerald-500'
                              : task.status === 'error'
                              ? 'bg-rose-500'
                              : task.status === 'retrying'
                              ? 'bg-amber-400'
                              : task.status === 'paused'
                              ? 'bg-zinc-600'
                              : 'bg-indigo-500'
                          }`}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>

                      {/* Error / Retry message info */}
                      {task.error && (
                        <p className="text-[11px] text-rose-400 bg-rose-950/40 px-2 py-1 rounded-md border border-rose-900/40">
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
                          className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      )}

                      {task.status === 'paused' && (
                        <button
                          type="button"
                          onClick={() => resumeUpload(task.id)}
                          title="Resume upload from current position"
                          className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}

                      {task.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => retryUpload(task.id)}
                          title="Try Again (Resumes from failed position)"
                          className="flex items-center gap-1 px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-black font-bold rounded-lg text-xs transition-colors shadow-sm"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Try Again</span>
                        </button>
                      )}

                      {task.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => cancelUpload(task.id)}
                          title="Cancel / remove from queue"
                          className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
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
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-zinc-900 shrink-0">
          <span className="text-xs text-zinc-400">
            {tasks.length > 0
              ? `${tasks.length} items in vault queue`
              : 'Add videos to begin uploading'}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold rounded-xl border border-zinc-800 transition-all"
            >
              {uploadingTasks.length > 0 ? 'Minimize to Background' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
