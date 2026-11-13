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
    <section className="mt-8 pt-6 border-t border-white/[0.08] w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Suggested Videos
            </h3>
            <p className="text-xs text-slate-400">
              Discover other videos from your vault
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchSuggestions(true)}
          disabled={isRefreshing || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-indigo-300 bg-[#131620] hover:bg-[#191D29] border border-white/[0.08] hover:border-indigo-500/30 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          title="Shuffle suggestions"
        >
          <Shuffle className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          <span>Shuffle</span>
        </button>
      </div>

      {/* Grid of Suggestions */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="bg-[#131620] border border-white/[0.07] rounded-2xl overflow-hidden animate-pulse flex flex-col"
            >
              <div className="aspect-video bg-white/[0.04] w-full" />
              <div className="p-3.5 space-y-2 flex-1">
                <div className="h-4 bg-white/[0.06] rounded w-3/4" />
                <div className="h-3 bg-white/[0.04] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="py-8 px-4 text-center bg-[#131620] border border-white/[0.07] rounded-2xl flex flex-col items-center justify-center gap-3">
          <p className="text-xs text-slate-400">
            Click shuffle to draw random video suggestions from your vault.
          </p>
          <button
            type="button"
            onClick={() => fetchSuggestions(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 rounded-xl transition-all cursor-pointer"
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
              className="group bg-[#131620] hover:bg-[#191D29] border border-white/[0.08] hover:border-white/[0.16] rounded-2xl overflow-hidden transition-all duration-200 flex flex-col shadow-sm hover:shadow-xl hover:shadow-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {/* Media Thumbnail Container */}
              <div className="relative aspect-video bg-[#090A0F] overflow-hidden flex items-center justify-center">
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
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[11px] font-mono font-medium text-slate-200 border border-white/10 flex items-center gap-1 z-10 tabular-nums">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{formatDuration(item.duration)}</span>
                  </div>
                )}

                {/* Hover Play Button Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                  <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 fill-current translate-x-0.5" />
                  </div>
                </div>
              </div>

              {/* Video Info */}
              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-2 leading-snug">
                    {item.title}
                  </h4>

                  {/* Clean Metadata without pills */}
                  <div className="mt-1.5 flex items-center flex-wrap gap-1.5 text-xs text-slate-400">
                    {item.playCount !== undefined && item.playCount > 0 ? (
                      <>
                        <span>{item.playCount} {item.playCount === 1 ? 'play' : 'plays'}</span>
                        <span className="text-slate-600">·</span>
                      </>
                    ) : null}
                    {item.tags && item.tags.length > 0 ? (
                      <span className="text-slate-400 truncate max-w-[180px]">
                        #{item.tags[0]}
                      </span>
                    ) : (
                      <span className="text-slate-500 font-mono text-[11px] truncate max-w-[180px]">
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
