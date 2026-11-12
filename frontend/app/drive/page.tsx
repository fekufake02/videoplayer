'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { IDriveVideo } from '../../types';
import { Navbar } from '../../components/Navbar';
import { DriveVideoCard } from '../../components/DriveVideoCard';
import { EditMetadataModal } from '../../components/EditMetadataModal';
import { LibrarySidebar } from '../../components/LibrarySidebar';
import {
  getDriveVideosCache,
  setDriveVideosCache,
  updateSingleDriveVideoInCache,
} from '../../lib/driveState';
import {
  RefreshCw,
  ArrowUpDown,
  AlertCircle,
  Cloud,
  Check,
  LayoutGrid,
  List,
} from 'lucide-react';

export default function DriveGalleryPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const [videos, setVideos] = useState<IDriveVideo[]>(() => {
    return getDriveVideosCache() || [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = getDriveVideosCache();
    return !cached || cached.length === 0;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('recentlyAdded');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // List vs Grid view mode
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('vault_drive_view_mode');
      if (stored === 'list' || stored === 'grid') {
        setViewMode(stored);
      }
    }
  }, []);

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vault_drive_view_mode', mode);
    }
  };

  // Edit Video Modal state
  const [editingVideo, setEditingVideo] = useState<IDriveVideo | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchDriveVideos = useCallback(
    async (showLoadingSpinner = false) => {
      if (showLoadingSpinner) {
        setLoading(true);
      }
      setErrorMsg('');
      try {
        const res = await api.listDriveVideos({
          limit: 500,
          search: debouncedSearch,
          sort: sortBy,
        });

        if (res?.success) {
          const fetched = res.videos || [];
          setVideos(fetched);
          setDriveVideosCache(fetched);

          // Only trigger auto-sync on initial load if library is completely empty and no search active
          if (fetched.length === 0 && !debouncedSearch) {
            api
              .syncDriveFolder()
              .then((syncRes) => {
                if (syncRes?.videos && syncRes.videos.length > 0) {
                  setVideos(syncRes.videos);
                  setDriveVideosCache(syncRes.videos);
                }
              })
              .catch(() => {});
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch Drive videos:', err);
        setErrorMsg(err.message || 'Could not load Google Drive videos.');
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, sortBy]
  );

  // Only trigger network request when search or sort changes, or if initial cache is empty
  useEffect(() => {
    if (isAuthenticated) {
      const cached = getDriveVideosCache();
      const needsInitialFetch = !cached || cached.length === 0;
      fetchDriveVideos(needsInitialFetch);
    }
  }, [isAuthenticated, debouncedSearch, sortBy, fetchDriveVideos]);

  const handleSyncFolder = async () => {
    setIsSyncing(true);
    setErrorMsg('');
    try {
      const res = await api.syncDriveFolder();
      if (res?.success) {
        const syncedList = res.videos || [];
        setVideos(syncedList);
        setDriveVideosCache(syncedList);
        setToastMsg(`Synced ${res.syncedCount || syncedList.length} videos from Google Drive.`);
        setTimeout(() => setToastMsg(''), 4000);
      }
    } catch (err: any) {
      console.error('Failed to sync folder:', err);
      setErrorMsg(err.message || 'Failed to sync Google Drive folder.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveMetadataSuccess = (updated?: IDriveVideo) => {
    if (updated) {
      setVideos((prev) =>
        prev.map((v) => (v._id === updated._id || v.driveFileId === updated.driveFileId ? updated : v))
      );
      updateSingleDriveVideoInCache(updated);
      setToastMsg(`Updated "${updated.title}"`);
      setTimeout(() => setToastMsg(''), 3000);
    } else {
      fetchDriveVideos(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090A0F] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F] text-[#F4F5F8]">
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={(q) => setSearchQuery(q)}
        onToggleMobileMenu={() => setIsMobileDrawerOpen(true)}
      />

      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 p-3.5 bg-[#191D29] border border-emerald-500/40 text-emerald-300 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editingVideo && (
        <EditMetadataModal
          video={editingVideo}
          isDrive={true}
          onClose={() => setEditingVideo(null)}
          onSuccess={handleSaveMetadataSuccess}
        />
      )}

      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* Sidebar */}
        <LibrarySidebar
          activeSection="drive"
          onSelectSection={(sec) => {
            if (sec !== 'drive') {
              router.push('/');
            }
          }}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          isMobileDrawerOpen={isMobileDrawerOpen}
          onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
          counts={{
            drive: videos.length,
          }}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Top Header & Actions Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Cloud className="w-5 h-5 text-indigo-400" />
                <span>Google Drive Media</span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#131620] border border-white/[0.07] text-slate-400 font-mono tabular-nums">
                  {videos.length}
                </span>
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Grid / List View Mode Toggle */}
              <div className="flex items-center bg-[#131620] border border-white/[0.07] rounded-lg p-0.5">
                <button
                  onClick={() => handleViewModeChange('grid')}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-[#191D29] text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('list')}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-[#191D29] text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="List view"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Sync Button */}
              <button
                onClick={handleSyncFolder}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131620] hover:bg-[#191D29] border border-white/[0.07] text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`}
                />
                <span>{isSyncing ? 'Syncing...' : 'Sync Folder'}</span>
              </button>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1.5 bg-[#131620] border border-white/[0.07] rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
                <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent text-slate-200 outline-none cursor-pointer pr-1"
                >
                  <option value="recentlyAdded" className="bg-[#131620] text-slate-200">
                    Recently Added
                  </option>
                  <option value="nameAsc" className="bg-[#131620] text-slate-200">
                    Name A-Z
                  </option>
                  <option value="nameDesc" className="bg-[#131620] text-slate-200">
                    Name Z-A
                  </option>
                  <option value="duration" className="bg-[#131620] text-slate-200">
                    Longest Duration
                  </option>
                  <option value="size" className="bg-[#131620] text-slate-200">
                    File Size
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Videos Container */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 animate-pulse">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-video bg-[#131620] rounded-xl border border-white/[0.05]" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="bg-[#131620] border border-white/[0.07] rounded-2xl p-12 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3 text-slate-500">
                <Cloud className="w-6 h-6 text-indigo-400" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">No Drive videos found</h3>
              <p className="text-slate-400 text-xs max-w-sm mb-4">
                Click sync above or ensure your connected Google Drive folder contains supported media files.
              </p>
              <button
                onClick={handleSyncFolder}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sync Now</span>
              </button>
            </div>
          ) : viewMode === 'list' ? (
            <div className="space-y-3">
              {videos.map((video) => (
                <DriveVideoCard
                  key={video._id}
                  video={video}
                  viewMode="list"
                  onEdit={(v) => setEditingVideo(v)}
                  onFavoriteToggle={(id, isFav) => {
                    setVideos((prev) =>
                      prev.map((v) => (v._id === id ? { ...v, favorite: isFav } : v))
                    );
                    updateSingleDriveVideoInCache({ ...video, favorite: isFav });
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {videos.map((video) => (
                <DriveVideoCard
                  key={video._id}
                  video={video}
                  viewMode="grid"
                  onEdit={(v) => setEditingVideo(v)}
                  onFavoriteToggle={(id, isFav) => {
                    setVideos((prev) =>
                      prev.map((v) => (v._id === id ? { ...v, favorite: isFav } : v))
                    );
                    updateSingleDriveVideoInCache({ ...video, favorite: isFav });
                  }}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
