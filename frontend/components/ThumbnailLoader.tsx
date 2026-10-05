'use client';

import React, { useState, useEffect } from 'react';
import { Play, EyeOff } from 'lucide-react';
import { api } from '../lib/api';

interface ThumbnailLoaderProps {
  src?: string;
  videoId?: string;
  blurhash?: string;
  fallbackText?: string;
  alt?: string;
  className?: string;
  blocked?: boolean;
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
  onLoad,
}) => {
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(src);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [retryAttempted, setRetryAttempted] = useState(false);

  // Reset loaded/error/retry states whenever src or videoId updates
  useEffect(() => {
    setCurrentSrc(src);
    setLoaded(false);
    setError(false);
    setRetryAttempted(false);
  }, [src, videoId]);

  // If thumbnail URL is not initially present but videoId is available, proactively fetch it
  useEffect(() => {
    let isMounted = true;
    if (!src && videoId && !retryAttempted) {
      setRetryAttempted(true);
      api
        .getThumbnailUrl(videoId)
        .then((res) => {
          if (isMounted && res?.thumbnailUrl) {
            setCurrentSrc(res.thumbnailUrl);
            setError(false);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [src, videoId, retryAttempted]);

  const handleLoad = () => {
    setLoaded(true);
    setError(false);
    onLoad?.();
  };

  const handleError = async () => {
    // If the image fails to load and we haven't retried yet, fetch fresh presigned URL from backend
    if (!retryAttempted && videoId) {
      setRetryAttempted(true);
      try {
        const fresh = await api.getThumbnailUrl(videoId);
        if (fresh?.thumbnailUrl && fresh.thumbnailUrl !== currentSrc) {
          setCurrentSrc(fresh.thumbnailUrl);
          setLoaded(false);
          setError(false);
          return;
        }
      } catch {
        // Fall through to error state
      }
    }
    setError(true);
  };

  return (
    <div className={`relative w-full h-full bg-zinc-950 overflow-hidden ${className}`}>
      {blocked ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center bg-zinc-950/95 border border-zinc-800/80">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-lg shadow-black/50">
            <EyeOff className="w-5 h-5 text-amber-400" />
          </div>
          <span className="text-[11px] font-mono font-medium text-zinc-400">
            Thumbnail Hidden
          </span>
          <span className="text-[10px] text-zinc-600">
            Privacy shield active
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
              src={currentSrc}
              alt={alt}
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={handleLoad}
              onError={handleError}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                loaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}

          {/* Fallback: Show filename or play icon */}
          {(error || !currentSrc) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
                <Play className="w-4 h-4 fill-current translate-x-0.5" />
              </div>
              {fallbackText && (
                <span className="text-[11px] text-zinc-500 font-mono truncate max-w-[180px]">
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
