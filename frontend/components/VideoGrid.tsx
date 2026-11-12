'use client';

import React, { useState } from 'react';
import { IVideo } from '../types';
import { VideoCard } from './VideoCard';
import {
  SlidersHorizontal,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Film,
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  Trash2,
  Heart,
  Plus,
} from 'lucide-react';

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
  onOpenUpload?: () => void;
  onBatchDelete?: (ids: string[]) => void;
  onBatchFavorite?: (ids: string[]) => void;
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
  onOpenUpload,
  onBatchDelete,
  onBatchFavorite,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isMultiSelectActive, setIsMultiSelectActive] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleSelectToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === videos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(videos.map((v) => v._id));
    }
  };

  return (
    <section className="space-y-4 sm:space-y-6">
      {/* Header Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>{title}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#131620] border border-white/[0.07] text-slate-400 font-mono tabular-nums">
              {total}
            </span>
          </h2>
        </div>

        {/* Toolbar Actions: Multi-select, View Mode, Filter, Sort */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Multi-Select Toggle Button */}
          <button
            onClick={() => {
              setIsMultiSelectActive((prev) => !prev);
              if (isMultiSelectActive) setSelectedIds([]);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              isMultiSelectActive
                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                : 'bg-[#131620] border-white/[0.07] text-slate-300 hover:bg-[#191D29]'
            }`}
            title="Toggle bulk multi-selection mode"
          >
            {isMultiSelectActive ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Select</span>
          </button>

          {/* Grid / List View Toggle */}
          <div className="hidden sm:flex items-center bg-[#131620] border border-white/[0.07] rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-[#191D29] text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-[#191D29] text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#131620] border border-white/[0.07] rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              className="bg-transparent text-slate-200 outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-[#131620] text-slate-200">All Videos</option>
              <option value="favorites" className="bg-[#131620] text-slate-200">Favorites</option>
              <option value="recentlyWatched" className="bg-[#131620] text-slate-200">Recently Watched</option>
              <option value="unwatched" className="bg-[#131620] text-slate-200">Unwatched</option>
              <option value="completed" className="bg-[#131620] text-slate-200">Completed</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#131620] border border-white/[0.07] rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value)}
              className="bg-transparent text-slate-200 outline-none cursor-pointer pr-1"
            >
              <option value="recentlyAdded" className="bg-[#131620] text-slate-200">Recently Added</option>
              <option value="oldest" className="bg-[#131620] text-slate-200">Oldest First</option>
              <option value="nameAsc" className="bg-[#131620] text-slate-200">Name A-Z</option>
              <option value="nameDesc" className="bg-[#131620] text-slate-200">Name Z-A</option>
              <option value="recentlyWatched" className="bg-[#131620] text-slate-200">Recently Watched</option>
              <option value="mostWatched" className="bg-[#131620] text-slate-200">Most Watched</option>
              <option value="longest" className="bg-[#131620] text-slate-200">Longest Duration</option>
              <option value="shortest" className="bg-[#131620] text-slate-200">Shortest Duration</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Context Action Toolbar (Appears when multi-select is active) */}
      {isMultiSelectActive && (
        <div className="flex items-center justify-between p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-xs animate-fade-in select-none">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="px-2.5 py-1 bg-white/[0.08] hover:bg-white/[0.12] rounded-lg text-slate-200 font-medium transition-colors"
            >
              {selectedIds.length === videos.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-slate-300 font-mono">
              {selectedIds.length} of {videos.length} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onBatchFavorite && selectedIds.length > 0 && (
              <button
                onClick={() => onBatchFavorite(selectedIds)}
                className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg transition-colors"
              >
                <Heart className="w-3.5 h-3.5 fill-current" />
                <span>Favorite</span>
              </button>
            )}
            {onBatchDelete && selectedIds.length > 0 && (
              <button
                onClick={() => onBatchDelete(selectedIds)}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-950/40 hover:bg-red-900/50 text-red-300 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid or List Content */}
      {videos.length === 0 ? (
        <div className="bg-[#131620] border border-white/[0.07] rounded-2xl p-12 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3 text-slate-500">
            <Film className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-white mb-1">No videos found</h3>
          <p className="text-slate-400 text-xs max-w-sm mb-4">
            Try adjusting your search criteria or upload a new video to your private library.
          </p>
          {onOpenUpload && (
            <button
              onClick={onOpenUpload}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Upload Video</span>
            </button>
          )}
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-3">
          {videos.map((video) => (
            <VideoCard
              key={video._id}
              video={video}
              onEdit={onEditVideo}
              onDelete={onDeleteVideo}
              isSelected={selectedIds.includes(video._id)}
              onSelectToggle={isMultiSelectActive ? handleSelectToggle : undefined}
              viewMode="list"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {videos.map((video) => (
            <VideoCard
              key={video._id}
              video={video}
              onEdit={onEditVideo}
              onDelete={onDeleteVideo}
              isSelected={selectedIds.includes(video._id)}
              onSelectToggle={isMultiSelectActive ? handleSelectToggle : undefined}
              viewMode="grid"
            />
          ))}
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 bg-[#131620] border border-white/[0.07] hover:bg-[#191D29] disabled:opacity-40 text-slate-300 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-400 px-2 tabular-nums">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 bg-[#131620] border border-white/[0.07] hover:bg-[#191D29] disabled:opacity-40 text-slate-300 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
};
