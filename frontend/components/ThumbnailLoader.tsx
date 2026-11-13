'use client';

import React, { useState, useEffect } from 'react';
import { Play, EyeOff } from 'lucide-react';
import { api } from '../lib/api';
import { extractRealVideoFrameCanvas } from '../lib/thumbnailGenerator';
import { canvasToWebP, generateBlurhashFromCanvas } from '../lib/thumbnailOptimizer';

const generatedThumbCache = new Map<string, string>();
const inFlightThumbTasks = new Map<string, Promise<string | null>>();

let activeFrameTasks = 0;
const frameTaskQueue: Array<() => void> = [];

function runWithFrameSlot<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      activeFrameTasks += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeFrameTasks -= 1;
          const next = frameTaskQueue.shift();
          if (next) next();
        });
    };
    if (activeFrameTasks < 2) {
      start();
    } else {
      frameTaskQueue.push(start);
    }
  });
}

async function recoverThumbnailFromVideoStream(videoId: string): Promise<string | null> {
  const cached = generatedThumbCache.get(videoId);
  if (cached) return cached;

  const existingTask = inFlightThumbTasks.get(videoId);
  if (existingTask) return existingTask;

  const promise = runWithFrameSlot(async (): Promise<string | null> => {
    try {
      const streamRes = await api.getStreamUrl(videoId);
      if (!streamRes?.streamUrl) return null;

      const canvas = await extractRealVideoFrameCanvas(streamRes.streamUrl, 8);
      if (!canvas) return null;

      const dataUrl = canvas.toDataURL('image/webp', 0.82);
      if (dataUrl && dataUrl.length > 100) {
        generatedThumbCache.set(videoId, dataUrl);
      }

      // Persist generated thumbnail to B2/DB in background
      (async () => {
        try {
          const [blob, blurhash] = await Promise.all([
            canvasToWebP(canvas, 0.8),
            generateBlurhashFromCanvas(canvas).catch(() => undefined),
          ]);
          const initRes = await api.initiateThumbnailUpload({
            filename: `${videoId.slice(0, 12)}_thumb.webp`,
            mimeType: 'image/webp',
            size: blob.size,
            videoId,
          });
          if (initRes?.uploadUrl && initRes?.storageKey) {
            const up = await fetch(initRes.uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': 'image/webp' },
              body: blob,
            });
            if (up.ok) {
              await api.attachThumbnail(videoId, initRes.storageKey, blurhash, 'account2').catch(() => {});
            }
          }
        } catch {}
      })();

      return dataUrl || null;
    } catch {
      return null;
    } finally {
      inFlightThumbTasks.delete(videoId);
    }
  });

  inFlightThumbTasks.set(videoId, promise);
  return promise;
}

interface ThumbnailLoaderProps {
  src?: string;
  videoId?: string;
  blurhash?: string;
  fallbackText?: string;
  alt?: string;
  className?: string;
  blocked?: boolean;
  autoGenerate?: boolean;
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
}

export const ThumbnailLoader: React.FC<ThumbnailLoaderProps> = ({
  src,
  videoId,
  blurhash,
  fallbackText,
  alt = 'Video thumbnail',
  className = '',
  blocked = false,
  autoGenerate = false,
  loading = 'lazy',
  onLoad,
}) => {
  const initialCached = !src && videoId ? generatedThumbCache.get(videoId) : undefined;
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(src || initialCached);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const fetchedForIdRef = React.useRef<string | null>(null);
  const retriedErrorForSrcRef = React.useRef<string | null>(null);
  const attemptedAutoGenForIdRef = React.useRef<string | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  // Synchronize whenever src or videoId updates without blanking an already-loaded image
  useEffect(() => {
    const resolvedNext = src || (videoId ? generatedThumbCache.get(videoId) : undefined);
    if (
      resolvedNext &&
      resolvedNext === currentSrc &&
      imgRef.current &&
      imgRef.current.complete &&
      imgRef.current.naturalWidth > 0
    ) {
      setLoaded(true);
      setError(false);
      return;
    }

    setCurrentSrc(resolvedNext);
    setLoaded(false);
    setError(false);
    if (resolvedNext) {
      fetchedForIdRef.current = null;
      retriedErrorForSrcRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, videoId]);

  // If thumbnail URL is not initially present but videoId is available, proactively fetch it (and recover via video frame if missing)
  useEffect(() => {
    if (src || !videoId || blocked) return;
    if (generatedThumbCache.has(videoId)) {
      setCurrentSrc(generatedThumbCache.get(videoId));
      setError(false);
      return;
    }
    if (fetchedForIdRef.current === videoId) return;
    fetchedForIdRef.current = videoId;

    let cancelled = false;
    api
      .getThumbnailUrl(videoId)
      .then(async (res) => {
        if (cancelled) return;
        if (res?.thumbnailUrl) {
          setCurrentSrc(res.thumbnailUrl);
          setError(false);
          setLoaded(false);
        } else if (autoGenerate && attemptedAutoGenForIdRef.current !== videoId) {
          attemptedAutoGenForIdRef.current = videoId;
          const recovered = await recoverThumbnailFromVideoStream(videoId);
          if (!cancelled && recovered) {
            setCurrentSrc(recovered);
            setError(false);
            setLoaded(false);
          }
        }
      })
      .catch(async () => {
        if (cancelled || !autoGenerate || attemptedAutoGenForIdRef.current === videoId) return;
        attemptedAutoGenForIdRef.current = videoId;
        const recovered = await recoverThumbnailFromVideoStream(videoId);
        if (!cancelled && recovered) {
          setCurrentSrc(recovered);
          setError(false);
          setLoaded(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src, videoId, blocked, autoGenerate]);

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
      setError(false);
    }
  }, [currentSrc]);

  const handleLoad = () => {
    setLoaded(true);
    setError(false);
    onLoad?.();
  };

  const handleError = async () => {
    // 1. If the image fails to load and we haven't retried yet for this src, fetch fresh presigned URL
    if (videoId && retriedErrorForSrcRef.current !== (currentSrc || 'empty')) {
      retriedErrorForSrcRef.current = currentSrc || 'empty';
      try {
        const fresh = await api.getThumbnailUrl(videoId);
        if (fresh?.thumbnailUrl && fresh.thumbnailUrl !== currentSrc) {
          setCurrentSrc(fresh.thumbnailUrl);
          setLoaded(false);
          setError(false);
          return;
        }
      } catch {
        // Fall through to proxy / recovery
      }
    }

    // 2. Fallback once via same-origin proxy for external image URLs blocked by CORP/referrer/CORS
    if (
      currentSrc &&
      (currentSrc.startsWith('https://') || currentSrc.startsWith('http://'))
    ) {
      const proxied = `/api/stream-proxy?url=${encodeURIComponent(currentSrc)}`;
      if (retriedErrorForSrcRef.current !== proxied) {
        retriedErrorForSrcRef.current = proxied;
        setCurrentSrc(proxied);
        setLoaded(false);
        setError(false);
        return;
      }
    }

    // 3. Final recovery: extract a real frame from the video stream if autoGenerate is enabled
    if (autoGenerate && videoId && !blocked && attemptedAutoGenForIdRef.current !== videoId) {
      attemptedAutoGenForIdRef.current = videoId;
      const recovered = await recoverThumbnailFromVideoStream(videoId);
      if (recovered) {
        setCurrentSrc(recovered);
        setLoaded(false);
        setError(false);
        return;
      }
    }

    setError(true);
  };

  return (
    <div className={`relative w-full h-full bg-zinc-950 overflow-hidden ${className}`}>
      {blocked ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center bg-zinc-950/95 border border-zinc-800/80">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-lg shadow-black/50">
            <EyeOff className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-[10px] font-mono font-medium text-zinc-400 leading-tight">
            Hidden
          </span>
        </div>
      ) : (
        <>
          {/* Blurhash placeholder (very fast, cached) */}
          {blurhash && !loaded && (
            <img
              src={blurhash}
              alt={`${alt} placeholder`}
              className="absolute inset-0 w-full h-full object-cover blur-sm"
              aria-hidden="true"
            />
          )}

          {/* Actual thumbnail image with error recovery */}
          {currentSrc && !error && (
            <img
              ref={imgRef}
              src={currentSrc}
              alt={alt}
              loading={loading}
              referrerPolicy="no-referrer"
              onLoad={handleLoad}
              onError={handleError}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                loaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}

          {/* Fallback: Show compact play icon & bounded filename */}
          {(error || !currentSrc) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
              <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
              </div>
              {fallbackText && (
                <span className="w-full max-w-full px-1 text-[10px] text-zinc-500 font-mono truncate text-center">
                  {fallbackText}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
