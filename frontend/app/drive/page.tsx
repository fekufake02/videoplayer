'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { IDriveVideo } from '../../types';
import { Navbar } from '../../components/Navbar';
import { DriveVideoCard } from '../../components/DriveVideoCard';
import { LibrarySidebar, LibraryNavSection } from '../../components/LibrarySidebar';
import {
  RefreshCw,
  Search,
  ArrowUpDown,
  AlertCircle,
  Cloud,
  Check,
} from 'lucide-react';

export default function DriveGalleryPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const [videos, setVideos] = useState<IDriveVideo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('recentlyAdded');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const fetchDriveVideos = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.listDriveVideos({
        limit: 500,
        search: searchQuery,
        sort: sortBy,
      });

      if (res?.success) {
        setVideos(res.videos || []);
        if (!res.videos || res.videos.length === 0) {
          api.syncDriveFolder()
            .then((syncRes) => {
              if (syncRes?.videos && syncRes.videos.length > 0) {
                setVideos(syncRes.videos);
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
  }, [searchQuery, sortBy]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDriveVideos();
    }
  }, [isAuthenticated, fetchDriveVideos]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        fetchDriveVideos();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated, fetchDriveVideos]);

  const handleSyncFolder = async () => {
    setIsSyncing(true);
    setErrorMsg('');
    try {
      const res = await api.syncDriveFolder();
      if (res?.success) {
        setToastMsg(`Synced ${res.syncedCount || res.videos?.length || 0} videos from Google Drive.`);
        setTimeout(() => setToastMsg(''), 4000);
        await fetchDriveVideos();
      }
    } catch (err: any) {
      console.error('Failed to sync folder:', err);
      setErrorMsg(err.message || 'Failed to sync Google Drive folder.');
    } finally {
      setIsSyncing(false);
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
              {/* Sync Button */}
              <button
                onClick={handleSyncFolder}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131620] hover:bg-[#191D29] border border-white/[0.07] text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
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
                  <option value="recentlyAdded" className="bg-[#131620] text-slate-200">Recently Added</option>
                  <option value="nameAsc" className="bg-[#131620] text-slate-200">Name A-Z</option>
                  <option value="nameDesc" className="bg-[#131620] text-slate-200">Name Z-A</option>
                  <option value="duration" className="bg-[#131620] text-slate-200">Longest Duration</option>
                  <option value="size" className="bg-[#131620] text-slate-200">File Size</option>
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

          {/* Videos Grid */}
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
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {videos.map((video) => (
                <DriveVideoCard
                  key={video._id}
                  video={video}
                  onFavoriteToggle={(id, isFav) => {
                    setVideos((prev) =>
                      prev.map((v) => (v._id === id ? { ...v, favorite: isFav } : v))
                    );
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
