'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { IVideo } from '../types';
import { api } from '../lib/api';
import { ThumbnailLoader } from './ThumbnailLoader';
import { Play, Sparkles, Shuffle, Clock, RefreshCw } from 'lucide-react';

interface VideoSuggestionsProps {
  currentVideoId: string;
}

export const VideoSuggestions: React.FC<VideoSuggestionsProps> = ({ currentVideoId }) => {
  const [suggestions, setSuggestions] = useState<IVideo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchSuggestions = async (isManualShuffle = false) => {
    if (isManualShuffle) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await api.getSuggestions(currentVideoId);
      if (res && res.success && Array.isArray(res.videos)) {
        setSuggestions(res.videos);
      }
    } catch (err) {
      console.warn('Failed to load video suggestions:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (currentVideoId) {
      fetchSuggestions();
    }
  }, [currentVideoId]);

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <section className="mt-8 pt-6 border-t border-zinc-800/80 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Suggested Videos
            </h3>
            <p className="text-xs text-zinc-400">
              Discover other videos from your vault
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchSuggestions(true)}
          disabled={isRefreshing || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-amber-400 bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-800 hover:border-amber-400/30 rounded-xl transition-all disabled:opacity-50"
          title="Shuffle suggestions"
        >
          <Shuffle className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
          <span>Shuffle</span>
        </button>
      </div>

      {/* Grid of Suggestions */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="bg-zinc-900/40 border border-zinc-850 rounded-2xl overflow-hidden animate-pulse flex flex-col"
            >
              <div className="aspect-video bg-zinc-800/50 w-full" />
              <div className="p-3.5 space-y-2 flex-1">
                <div className="h-4 bg-zinc-800/60 rounded w-3/4" />
                <div className="h-3 bg-zinc-800/40 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="py-8 px-4 text-center bg-zinc-900/30 border border-zinc-850/80 rounded-2xl flex flex-col items-center justify-center gap-3">
          <p className="text-xs text-zinc-400">
            Click shuffle to draw random video suggestions from your vault.
          </p>
          <button
            type="button"
            onClick={() => fetchSuggestions(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20 rounded-xl transition-all"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Shuffle Suggestions</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suggestions.map((item) => (
            <Link
              key={item._id}
              href={`/watch/${item._id}`}
              className="group bg-zinc-900/50 hover:bg-zinc-900/90 border border-zinc-850 hover:border-zinc-700/80 rounded-2xl overflow-hidden transition-all duration-200 flex flex-col shadow-sm hover:shadow-xl hover:shadow-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              {/* Media Thumbnail Container */}
              <div className="relative aspect-video bg-zinc-950 overflow-hidden flex items-center justify-center">
                <ThumbnailLoader
                  videoId={item._id}
                  src={item.thumbnailUrl}
                  blurhash={item.blurhash}
                  fallbackText={item.originalFilename}
                  alt={item.title}
                  className="group-hover:scale-105 transition-transform duration-500"
                />

                {/* Duration Badge */}
                {item.duration > 0 && (
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[11px] font-mono font-medium text-zinc-300 border border-white/10 flex items-center gap-1 z-10">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    <span>{formatDuration(item.duration)}</span>
                  </div>
                )}

                {/* Hover Play Button Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                  <div className="w-10 h-10 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 fill-current translate-x-0.5" />
                  </div>
                </div>
              </div>

              {/* Video Info */}
              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-100 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">
                    {item.title}
                  </h4>

                  {/* Clean Metadata without pills */}
                  <div className="mt-1.5 flex items-center flex-wrap gap-1.5 text-xs text-zinc-400">
                    {item.playCount !== undefined && item.playCount > 0 ? (
                      <>
                        <span>{item.playCount} {item.playCount === 1 ? 'play' : 'plays'}</span>
                        <span className="text-zinc-600">·</span>
                      </>
                    ) : null}
                    {item.tags && item.tags.length > 0 ? (
                      <span className="text-zinc-400 truncate max-w-[180px]">
                        #{item.tags[0]}
                      </span>
                    ) : (
                      <span className="text-zinc-500 font-mono text-[11px] truncate max-w-[180px]">
                        {item.originalFilename}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
};
