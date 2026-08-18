'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { IVideo, HomeSections } from '../types';
import { Navbar } from '../components/Navbar';
import { VideoCard } from '../components/VideoCard';
import { VideoGrid } from '../components/VideoGrid';
import { UploadModal } from '../components/UploadModal';
import { EditMetadataModal } from '../components/EditMetadataModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { PlayCircle, Clock, Flame, Sparkles } from 'lucide-react';

export default function LibraryHomePage() {
  const { isAuthenticated, isLoading } = useAuth();

  const [homeSections, setHomeSections] = useState<HomeSections>({
    continueWatching: [],
    recentlyWatched: [],
    mostWatched: [],
    recentlyAdded: [],
  });

  const [gridVideos, setGridVideos] = useState<IVideo[]>([]);
  const [totalGrid, setTotalGrid] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sort, setSort] = useState<string>('recentlyAdded');
  const [filter, setFilter] = useState<string>('all');

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [editingVideo, setEditingVideo] = useState<IVideo | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<IVideo | null>(null);

  const fetchHomeData = useCallback(async () => {
    try {
      const data = await api.getLibraryHome();
      if (data.success) {
        setHomeSections({
          continueWatching: data.continueWatching || [],
          recentlyWatched: data.recentlyWatched || [],
          mostWatched: data.mostWatched || [],
          recentlyAdded: data.recentlyAdded || [],
        });
      }
    } catch (err) {
      console.error('Failed to fetch home sections:', err);
    }
  }, []);

  const fetchGridData = useCallback(async () => {
    try {
      const data = await api.listVideos({
        page,
        limit: 24,
        search: searchQuery,
        sort,
        filter,
      });
      if (data.success) {
        setGridVideos(data.videos || []);
        setTotalGrid(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch video grid:', err);
    }
  }, [page, searchQuery, sort, filter]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchHomeData();
      fetchGridData();
    }
  }, [isAuthenticated, fetchHomeData, fetchGridData]);

  const handleRefreshAll = () => {
    fetchHomeData();
    fetchGridData();
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar
        onOpenUpload={() => setIsUploadOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setPage(1);
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-8 space-y-8">
        {/* Top Tab Navigation Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 overflow-x-auto gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <button
              onClick={() => {
                setFilter('all');
                setSort('recentlyAdded');
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                filter === 'all' && sort === 'recentlyAdded'
                  ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/20 font-extrabold'
                  : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>All Videos</span>
            </button>

            <button
              onClick={() => {
                setFilter('recentlyWatched');
                setSort('recentlyWatched');
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                filter === 'recentlyWatched'
                  ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/20 font-extrabold'
                  : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Recently Viewed</span>
            </button>

            <button
              onClick={() => {
                setFilter('favorites');
                setSort('recentlyAdded');
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                filter === 'favorites'
                  ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/20 font-extrabold'
                  : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <PlayCircle className="w-4 h-4" />
              <span>Liked Videos</span>
            </button>

            <button
              onClick={() => {
                setFilter('all');
                setSort('mostWatched');
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                filter === 'all' && sort === 'mostWatched'
                  ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/20 font-extrabold'
                  : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <Flame className="w-4 h-4 text-amber-500" />
              <span>Most Watched</span>
            </button>
          </div>
        </div>

        {/* Unified Library Video Grid */}
        <VideoGrid
          videos={gridVideos}
          total={totalGrid}
          page={page}
          totalPages={totalPages}
          onPageChange={(p) => setPage(p)}
          sort={sort}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          filter={filter}
          onFilterChange={(f) => {
            setFilter(f);
            setPage(1);
          }}
          onEditVideo={(v) => setEditingVideo(v)}
          onDeleteVideo={(v) => setDeletingVideo(v)}
          title={
            searchQuery
              ? `Search Results for "${searchQuery}"`
              : filter === 'recentlyWatched'
              ? 'Recently Viewed'
              : filter === 'favorites'
              ? 'Liked Videos'
              : sort === 'mostWatched'
              ? 'Most Watched'
              : 'All Videos'
          }
        />
      </main>

      {/* Modals */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleRefreshAll}
      />

      <EditMetadataModal
        video={editingVideo}
        onClose={() => setEditingVideo(null)}
        onSuccess={handleRefreshAll}
      />

      <DeleteConfirmModal
        video={deletingVideo}
        onClose={() => setDeletingVideo(null)}
        onSuccess={handleRefreshAll}
      />
    </div>
  );
}
