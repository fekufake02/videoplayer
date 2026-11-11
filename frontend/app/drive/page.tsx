'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { IDriveVideo } from '../../types';
import { Navbar } from '../../components/Navbar';
import { DriveVideoCard } from '../../components/DriveVideoCard';
import {
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  Film,
} from 'lucide-react';

export default function DriveGalleryPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const [videos, setVideos] = useState<IDriveVideo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string>('');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('recentlyAdded');

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
        limit: 500, // Fetch all drive videos
        search: searchQuery,
        sort: sortBy,
      });

      if (res?.success) {
        setVideos(res.videos || []);
        // If empty on first load, auto-sync once
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

  // Auto-sync whenever user returns to the tab (e.g. after uploading new videos in Google Drive)
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
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Toast Alert */}
        {toastMsg && (
          <div className="fixed bottom-6 right-6 z-50 p-4 bg-slate-900 border border-emerald-500/50 text-emerald-300 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-semibold animate-bounce">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Clean Header: Heading on Top, No Description, No Change URL Button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <span>Drive Videos</span>
              {!loading && (
                <span className="text-xs font-normal text-slate-400 font-mono px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800">
                  {videos.length} videos
                </span>
              )}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncFolder}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 hover:bg-slate-850 text-xs font-semibold text-slate-200 transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Drive'}</span>
            </button>
          </div>
        </div>

        {/* Search & Sort Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search drive videos..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-900/80 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400/60 cursor-pointer"
            >
              <option value="recentlyAdded">Recently Added</option>
              <option value="title">Title (A - Z)</option>
              <option value="duration">Longest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Video Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden animate-pulse flex flex-col"
              >
                <div className="aspect-video w-full bg-slate-850" />
                <div className="p-3.5 space-y-2">
                  <div className="h-4 bg-slate-800 rounded w-4/5" />
                  <div className="h-3 bg-slate-800/60 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center justify-center bg-slate-900/30 border border-slate-800/60 rounded-3xl p-8">
            <Film className="w-12 h-12 text-slate-600 mb-3" />
            <h3 className="text-base font-bold text-white mb-1">No Drive Videos Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-4">
              {searchQuery
                ? `No videos match "${searchQuery}". Try a different keyword.`
                : 'No videos found in your configured Google Drive folder.'}
            </p>
            <button
              onClick={handleSyncFolder}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync Now</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {videos.map((video) => (
              <DriveVideoCard
                key={video._id}
                video={video}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
