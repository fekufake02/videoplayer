'use client';

import React from 'react';
import { IVideo } from '../types';
import { VideoCard } from './VideoCard';
import { SlidersHorizontal, ArrowUpDown, ChevronLeft, ChevronRight, Film } from 'lucide-react';

interface VideoGridProps {
  videos: IVideo[];
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  sort: string;
  onSortChange: (newSort: string) => void;
  filter: string;
  onFilterChange: (newFilter: string) => void;
  onEditVideo?: (video: IVideo) => void;
  onDeleteVideo?: (video: IVideo) => void;
  title?: string;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  videos,
  total,
  page,
  totalPages,
  onPageChange,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  onEditVideo,
  onDeleteVideo,
  title = 'All Videos',
}) => {
  return (
    <section className="space-y-6">
      {/* Header Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>{title}</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 font-mono">
              {total}
            </span>
          </h2>
        </div>

        {/* Filters & Sorting */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              className="bg-transparent text-slate-200 outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-slate-900 text-slate-200">All Videos</option>
              <option value="favorites" className="bg-slate-900 text-slate-200">Favorites</option>
              <option value="recentlyWatched" className="bg-slate-900 text-slate-200">Recently Watched</option>
              <option value="unwatched" className="bg-slate-900 text-slate-200">Unwatched</option>
              <option value="completed" className="bg-slate-900 text-slate-200">Completed</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value)}
              className="bg-transparent text-slate-200 outline-none cursor-pointer pr-1"
            >
              <option value="recentlyAdded" className="bg-slate-900 text-slate-200">Recently Added</option>
              <option value="oldest" className="bg-slate-900 text-slate-200">Oldest First</option>
              <option value="nameAsc" className="bg-slate-900 text-slate-200">Name A-Z</option>
              <option value="nameDesc" className="bg-slate-900 text-slate-200">Name Z-A</option>
              <option value="recentlyWatched" className="bg-slate-900 text-slate-200">Recently Watched</option>
              <option value="mostWatched" className="bg-slate-900 text-slate-200">Most Watched</option>
              <option value="longest" className="bg-slate-900 text-slate-200">Longest Duration</option>
              <option value="shortest" className="bg-slate-900 text-slate-200">Shortest Duration</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid Content */}
      {videos.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-500">
            <Film className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-200 mb-1">No videos found</h3>
          <p className="text-slate-400 text-xs max-w-sm">
            Try adjusting your search criteria or upload a new video to your private library.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {videos.map((video) => (
            <VideoCard
              key={video._id}
              video={video}
              onEdit={onEditVideo}
              onDelete={onDeleteVideo}
            />
          ))}
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-6">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-xl transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-xl transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
};
