'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { generateAndUploadThumbnail } from '../lib/thumbnailGenerator';

export type UploadStatus = 'pending' | 'uploading' | 'paused' | 'retrying' | 'completed' | 'error';

export interface UploadTask {
  id: string;
  file: File;
  title: string;
  tags?: string[];
  notes?: string;
  status: UploadStatus;
  progress: number; // 0 - 100
  uploadedBytes: number;
  totalBytes: number;
  speed: number; // bytes per second
  etaSeconds: number;
  retryCount: number;
  maxRetries: number;
  retryTimerSeconds?: number;
  error?: string;
  storageKey?: string;
  uploadUrl?: string;
  thumbnailKey?: string;
  blurhash?: string;
  chunkSize: number;
  currentChunkIndex: number;
  totalChunks: number;
  createdAt: number;
}

interface UploadContextType {
  tasks: UploadTask[];
  isModalOpen: boolean;
  activeUploadsCount: number;
  overallProgress: number;
  overallSpeed: number;
  totalQueueBytes: number;
  uploadedQueueBytes: number;
  openUploadModal: () => void;
  closeUploadModal: () => void;
  addFiles: (files: FileList | File[]) => void;
  pauseUpload: (id: string) => void;
  resumeUpload: (id: string) => void;
  retryUpload: (id: string) => void;
  cancelUpload: (id: string) => void;
  updateItemTitle: (id: string, title: string) => void;
  pauseAll: () => void;
  resumeAll: () => void;
  retryAllFailed: () => void;
  clearCompleted: () => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB chunk size for high resilience & fast progress updates
const MAX_AUTO_RETRIES = 4;
const CONCURRENT_UPLOADS = 2; // Up to 2 concurrent files uploading simultaneously

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Active XHR & control references per task id
  const xhrMap = useRef<Map<string, XMLHttpRequest>>(new Map());
  const retryTimeoutMap = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const thumbnailPromiseMap = useRef<Map<string, Promise<{ thumbnailKey: string; blurhash?: string } | null>>>(new Map());
  const speedSamplesMap = useRef<Map<string, Array<{ time: number; bytes: number }>>>(new Map());
  const isPausedByUser = useRef<Map<string, boolean>>(new Map());

  const openUploadModal = useCallback(() => setIsModalOpen(true), []);
  const closeUploadModal = useCallback(() => setIsModalOpen(false), []);

  const formatDefaultTitle = (filename: string): string => {
    return filename
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const newTasks: UploadTask[] = fileArray.map((file) => {
      const id = 'task-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now();
      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      return {
        id,
        file,
        title: formatDefaultTitle(file.name),
        status: 'pending',
        progress: 0,
        uploadedBytes: 0,
        totalBytes: file.size,
        speed: 0,
        etaSeconds: 0,
        retryCount: 0,
        maxRetries: MAX_AUTO_RETRIES,
        chunkSize: CHUNK_SIZE,
        currentChunkIndex: 0,
        totalChunks,
        createdAt: Date.now(),
      };
    });

    setTasks((prev) => [...prev, ...newTasks]);
  }, []);

  const updateItemTitle = useCallback((id: string, title: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    );
  }, []);

  const calculateSpeedAndEta = (taskId: string, currentBytes: number, totalBytes: number) => {
    const now = Date.now();
    let samples = speedSamplesMap.current.get(taskId) || [];
    samples.push({ time: now, bytes: currentBytes });

    // Keep samples from last 4 seconds
    samples = samples.filter((s) => now - s.time <= 4000);
    speedSamplesMap.current.set(taskId, samples);

    if (samples.length < 2) return { speed: 0, etaSeconds: 0 };

    const first = samples[0];
    const last = samples[samples.length - 1];
    const durationSec = (last.time - first.time) / 1000;
    const bytesDiff = last.bytes - first.bytes;

    if (durationSec <= 0 || bytesDiff <= 0) return { speed: 0, etaSeconds: 0 };

    const speed = Math.round(bytesDiff / durationSec);
    const remainingBytes = Math.max(0, totalBytes - currentBytes);
    const etaSeconds = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;

    return { speed, etaSeconds };
  };

  /**
   * Helper to accurately detect video duration from file metadata in browser
   */
  const extractVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        let isResolved = false;

        const cleanup = () => {
          if (isResolved) return;
          isResolved = true;
          tempVideo.removeAttribute('src');
          tempVideo.load();
          try {
            URL.revokeObjectURL(url);
          } catch {}
        };

        tempVideo.onloadedmetadata = () => {
          const d = tempVideo.duration;
          cleanup();
          if (d && !isNaN(d) && isFinite(d) && d > 0) {
            resolve(Math.round(d));
          } else {
            resolve(0);
          }
        };

        tempVideo.onerror = () => {
          cleanup();
          resolve(0);
        };

        setTimeout(() => {
          cleanup();
          resolve(0);
        }, 5000);

        tempVideo.src = url;
      } catch {
        resolve(0);
      }
    });
  };

  /**
   * Uploads the full video file in a single, smooth, continuous stream
   */
  const uploadSingleFile = async (
    task: UploadTask,
    storageKey: string,
    uploadUrl: string
  ): Promise<void> => {
    const { file, totalBytes, id } = task;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrMap.current.set(id, xhr);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const currentUploaded = e.loaded;
          const progress = Math.min(99, Math.round((currentUploaded / totalBytes) * 100));
          const { speed, etaSeconds } = calculateSpeedAndEta(id, currentUploaded, totalBytes);

          setTasks((prev) =>
            prev.map((t) =>
              t.id === id && t.status === 'uploading'
                ? {
                    ...t,
                    uploadedBytes: currentUploaded,
                    progress,
                    speed,
                    etaSeconds,
                  }
                : t
            )
          );
        }
      };

      xhr.onload = () => {
        xhrMap.current.delete(id);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Server returned HTTP ${xhr.status} on file upload`));
        }
      };

      xhr.onerror = () => {
        xhrMap.current.delete(id);
        reject(new Error('Network error during file upload transmission'));
      };

      xhr.onabort = () => {
        xhrMap.current.delete(id);
        reject(new Error('UPLOAD_ABORTED_BY_USER'));
      };

      const targetUrl = uploadUrl || `/api/upload-receiver?key=${encodeURIComponent(storageKey)}`;
      xhr.open('PUT', targetUrl, true);
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
      xhr.send(file);
    });
  };

  /**
   * Main worker for processing an upload task
   */
  const processUploadTask = async (task: UploadTask) => {
    const taskId = task.id;
    try {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: 'uploading', error: undefined, retryTimerSeconds: undefined }
            : t
        )
      );

      // Step 1: Initiate or verify upload session
      let storageKey = task.storageKey;
      let uploadUrl = task.uploadUrl;

      if (!storageKey || !uploadUrl) {
        const initRes = await api.initiateUpload({
          title: task.title,
          filename: task.file.name,
          mimeType: task.file.type || 'video/mp4',
          size: task.file.size,
        });

        if (!initRes || !initRes.storageKey) {
          throw new Error('Failed to obtain storage allocation');
        }

        storageKey = initRes.storageKey;
        uploadUrl = initRes.uploadUrl;

        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, storageKey, uploadUrl } : t
          )
        );
      }

      // Step 2: Upload file smoothly in a single continuous stream
      await uploadSingleFile(task, storageKey, uploadUrl);

      // Step 3: Generate and upload thumbnail after video upload finishes
      let thumbnailKey: string | undefined = task.thumbnailKey;
      let blurhash: string | undefined = task.blurhash;

      try {
        const generated = await generateAndUploadThumbnail(task.file, task.file.name, 15);
        if (generated?.thumbnailKey) {
          thumbnailKey = generated.thumbnailKey;
          blurhash = generated.blurhash;
        }
      } catch (e) {
        console.warn('Thumbnail attachment error:', e);
      }

      // Extract video duration from metadata if available
      let detectedDuration: number | undefined;
      try {
        const d = await extractVideoDuration(task.file);
        if (d > 0) detectedDuration = d;
      } catch {}

      await api.completeUpload({
        title: task.title.trim() || task.file.name,
        originalFilename: task.file.name,
        storageKey,
        thumbnailKey,
        blurhash,
        mimeType: task.file.type || 'video/mp4',
        size: task.file.size,
        duration: detectedDuration,
      });

      // Mark complete
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: 'completed',
                progress: 100,
                uploadedBytes: t.totalBytes,
                speed: 0,
                etaSeconds: 0,
                thumbnailKey,
                blurhash,
              }
            : t
        )
      );

      // Trigger global refresh events
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vault-media-uploaded', { detail: { storageKey } }));
      }
    } catch (err: any) {
      if (err.message === 'UPLOAD_ABORTED_BY_USER' || isPausedByUser.current.get(taskId)) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: 'paused', speed: 0 } : t))
        );
        return;
      }

      console.error(`Upload error on task ${task.title}:`, err);

      // Handle Automatic Retry with Exponential Backoff
      const currentTask = tasks.find((t) => t.id === taskId) || task;
      const currentRetries = currentTask.retryCount || 0;

      if (currentRetries < MAX_AUTO_RETRIES) {
        const nextRetry = currentRetries + 1;
        const delaySeconds = Math.min(Math.pow(2, nextRetry), 16); // 2s, 4s, 8s, 16s

        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: 'retrying',
                  retryCount: nextRetry,
                  retryTimerSeconds: delaySeconds,
                  speed: 0,
                  error: `Network glitch. Auto-retrying from position (${nextRetry}/${MAX_AUTO_RETRIES})...`,
                }
              : t
          )
        );

        // Countdown timer for user feedback
        let countdown = delaySeconds;
        const intervalId = setInterval(() => {
          countdown -= 1;
          if (countdown > 0) {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId ? { ...t, retryTimerSeconds: countdown } : t
              )
            );
          } else {
            clearInterval(intervalId);
          }
        }, 1000);

        const timeout = setTimeout(() => {
          clearInterval(intervalId);
          retryTimeoutMap.current.delete(taskId);
          setTasks((prev) => {
            const found = prev.find((t) => t.id === taskId);
            if (found && found.status === 'retrying') {
              processUploadTask(found);
            }
            return prev;
          });
        }, delaySeconds * 1000);

        retryTimeoutMap.current.set(taskId, timeout);
      } else {
        // Exceeded automatic retries - show clear manual Try Again button
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: 'error',
                  speed: 0,
                  error: err.message || 'Upload failed. Click Try Again to resume from current position.',
                }
              : t
          )
        );
      }
    }
  };

  /**
   * Queue scheduler: continuously checks if pending tasks can be started
   */
  useEffect(() => {
    const activeTasks = tasks.filter((t) => t.status === 'uploading');
    if (activeTasks.length < CONCURRENT_UPLOADS) {
      const pendingTask = tasks.find((t) => t.status === 'pending');
      if (pendingTask) {
        processUploadTask(pendingTask);
      }
    }
  }, [tasks]);

  const pauseUpload = useCallback((id: string) => {
    isPausedByUser.current.set(id, true);
    const xhr = xhrMap.current.get(id);
    if (xhr) {
      xhr.abort();
    }
    const timeout = retryTimeoutMap.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      retryTimeoutMap.current.delete(id);
    }
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'paused', speed: 0, retryTimerSeconds: undefined } : t))
    );
  }, []);

  const resumeUpload = useCallback((id: string) => {
    isPausedByUser.current.set(id, false);
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'pending', error: undefined } : t))
    );
  }, []);

  const retryUpload = useCallback((id: string) => {
    isPausedByUser.current.set(id, false);
    const timeout = retryTimeoutMap.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      retryTimeoutMap.current.delete(id);
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: 'pending', retryCount: 0, error: undefined, retryTimerSeconds: undefined }
          : t
      )
    );
  }, []);

  const cancelUpload = useCallback((id: string) => {
    isPausedByUser.current.set(id, true);
    const xhr = xhrMap.current.get(id);
    if (xhr) {
      xhr.abort();
    }
    const timeout = retryTimeoutMap.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      retryTimeoutMap.current.delete(id);
    }
    thumbnailPromiseMap.current.delete(id);
    speedSamplesMap.current.delete(id);

    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pauseAll = useCallback(() => {
    tasks.forEach((t) => {
      if (t.status === 'uploading' || t.status === 'pending' || t.status === 'retrying') {
        pauseUpload(t.id);
      }
    });
  }, [tasks, pauseUpload]);

  const resumeAll = useCallback(() => {
    tasks.forEach((t) => {
      if (t.status === 'paused') {
        resumeUpload(t.id);
      }
    });
  }, [tasks, resumeUpload]);

  const retryAllFailed = useCallback(() => {
    tasks.forEach((t) => {
      if (t.status === 'error') {
        retryUpload(t.id);
      }
    });
  }, [tasks, retryUpload]);

  const clearCompleted = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status !== 'completed'));
  }, []);

  // Aggregated calculations
  const activeUploadsCount = tasks.filter(
    (t) => t.status === 'uploading' || t.status === 'retrying' || t.status === 'pending'
  ).length;

  const totalQueueBytes = tasks.reduce((acc, t) => acc + t.totalBytes, 0);
  const uploadedQueueBytes = tasks.reduce((acc, t) => acc + t.uploadedBytes, 0);
  const overallProgress =
    totalQueueBytes > 0 ? Math.round((uploadedQueueBytes / totalQueueBytes) * 100) : 0;
  const overallSpeed = tasks
    .filter((t) => t.status === 'uploading')
    .reduce((acc, t) => acc + (t.speed || 0), 0);

  return (
    <UploadContext.Provider
      value={{
        tasks,
        isModalOpen,
        activeUploadsCount,
        overallProgress,
        overallSpeed,
        totalQueueBytes,
        uploadedQueueBytes,
        openUploadModal,
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
      }}
    >
      {children}
    </UploadContext.Provider>
  );
};

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};
