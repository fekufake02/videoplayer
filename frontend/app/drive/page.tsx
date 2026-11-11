'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { IDriveVideo } from '../../types';
import { Navbar } from '../../components/Navbar';
import { PrivacyOverlay } from '../../components/PrivacyOverlay';
import { DriveVideoCard } from '../../components/DriveVideoCard';
import { DrivePlayerModal } from '../../components/DrivePlayerModal';
import { DriveThumbnailModal } from '../../components/DriveThumbnailModal';
import {
  HardDrive,
  RefreshCw,
  FolderSync,
  Search,
  Filter,
  ExternalLink,
  AlertCircle,
  Check,
  Link as LinkIcon,
  Sparkles,
  Info,
} from 'lucide-react';

export default function DrivePage() {
  const { isAuthenticated, isLoading, isPrivacyActive } = useAuth();
  const router = useRouter();

  const [videos, setVideos] = useState<IDriveVideo[]>([]);
  const [folderId, setFolderId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recentlyAdded');
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Modals state
  const [selectedVideoForPlay, setSelectedVideoForPlay] = useState<IDriveVideo | null>(null);
  const [selectedVideoForThumbnail, setSelectedVideoForThumbnail] = useState<IDriveVideo | null>(null);
  const [initialSnappedCanvas, setInitialSnappedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [customFolderInput, setCustomFolderInput] = useState('');

  // Redirect to login if unauthenticated
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
        search: searchQuery,
        sort: sortBy,
      });

      if (res?.success) {
        setVideos(res.videos || []);
        if (res.folderId) {
          setFolderId(res.folderId);
        }
        // If only sample videos loaded or folder not yet synced to user folder, auto-sync
        if ((!res.videos || res.videos.length <= 5) && res.folderId !== '1kRuofHNYbNz62CUy8jlsS2oJvCo5KUvM') {
          api.syncDriveFolder('1kRuofHNYbNz62CUy8jlsS2oJvCo5KUvM')
            .then((syncRes) => {
              if (syncRes?.videos && syncRes.videos.length > 0) {
                setVideos(syncRes.videos);
                setFolderId(syncRes.folderId);
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
    if (!isAuthenticated) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        api.syncDriveFolder().then(() => fetchDriveVideos()).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated, fetchDriveVideos]);

  const handleSyncFolder = async (folderOverride?: string) => {
    setIsSyncing(true);
    setErrorMsg('');
    try {
      const res = await api.syncDriveFolder(folderOverride);
      if (res?.success) {
        setToastMsg(res.message || 'Google Drive folder synced successfully.');
        setTimeout(() => setToastMsg(''), 4000);
        setShowFolderModal(false);
        await fetchDriveVideos();
      }
    } catch (err: any) {
      console.error('Failed to sync folder:', err);
      setErrorMsg(err.message || 'Failed to sync Google Drive folder.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleThumbnailUpdated = (updatedVideo: IDriveVideo) => {
    setVideos((prev) =>
      prev.map((v) => (v._id === updatedVideo._id ? updatedVideo : v))
    );
    if (selectedVideoForPlay?._id === updatedVideo._id) {
      setSelectedVideoForPlay(updatedVideo);
    }
    setToastMsg(`Updated thumbnail stored on Backblaze B2 for "${updatedVideo.title}"!`);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const openThumbnailModal = (video: IDriveVideo, canvas?: HTMLCanvasElement) => {
    setSelectedVideoForThumbnail(video);
    setInitialSnappedCanvas(canvas || null);
  };

  const b2ThumbnailCount = videos.filter((v) => Boolean(v.thumbnailKey)).length;

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-semibold text-slate-400">Loading Drive Vault...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col selection:bg-amber-400 selection:text-black">
      {/* Privacy Mode Full Blur Overlay */}
      {isPrivacyActive && <PrivacyOverlay />}

      {/* Main Global Navbar */}
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-slate-900 border border-amber-400/50 text-white rounded-xl shadow-2xl shadow-black/80 animate-fade-in text-xs font-medium">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Page Hero Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-400 text-black font-extrabold flex items-center justify-center shadow-lg shadow-amber-400/20">
                <HardDrive className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Google Drive Gallery
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Videos indexed directly from your public Google Drive folder. Play instantly and save custom thumbnails to your Backblaze B2 storage.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={() => handleSyncFolder()}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all active:scale-95 disabled:opacity-50"
              title="Rescan public Google Drive folder for new video files"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Folder'}</span>
            </button>

            <button
              onClick={() => {
                setCustomFolderInput(folderId && folderId !== 'default' ? folderId : '');
                setShowFolderModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-extrabold rounded-xl shadow-lg shadow-amber-400/20 transition-all active:scale-95"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Change Folder URL</span>
            </button>
          </div>
        </div>

        {/* Status / Metadata Strip (Clean Typography, No Pill Clutter) */}
        <div className="flex flex-wrap items-center justify-between gap-4 py-3 px-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl text-xs text-slate-400">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-semibold text-slate-200">
              {videos.length} {videos.length === 1 ? 'Video' : 'Videos'} Found
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="font-mono tabular-nums text-amber-400 font-medium">
              {b2ThumbnailCount} with B2 Custom Thumbnails
            </span>
            {folderId && folderId !== 'default' && (
              <>
                <span aria-hidden="true" className="text-slate-600 hidden md:inline">·</span>
                <span className="font-mono text-slate-400 truncate max-w-[200px] hidden md:inline">
                  Folder: {folderId}
                </span>
              </>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              <option value="recentlyAdded">Recently Added</option>
              <option value="title">Title (A-Z)</option>
              <option value="duration">Longest Duration</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="flex items-center gap-2 p-3.5 bg-rose-950/40 border border-rose-900/60 rounded-xl text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden animate-pulse">
                <div className="aspect-video bg-slate-800/60"></div>
                <div className="p-4 space-y-2.5">
                  <div className="h-4 bg-slate-800/80 rounded w-3/4"></div>
                  <div className="h-3 bg-slate-800/50 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && videos.length === 0 && (
          <div className="text-center py-16 px-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center mx-auto">
              <FolderSync className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-white">No Google Drive Videos Found</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Connect your publicly viewable Google Drive folder to automatically index its video files here.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                onClick={() => setShowFolderModal(true)}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold rounded-xl shadow-lg shadow-amber-400/20 transition-all"
              >
                Set Google Drive Folder Link
              </button>
              <button
                onClick={() => handleSyncFolder()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all"
              >
                Scan & Sync Folder Videos
              </button>
            </div>
          </div>
        )}

        {/* Video Cards Grid */}
        {!loading && videos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {videos.map((video) => (
              <DriveVideoCard
                key={video._id}
                video={video}
                onPlay={(v) => setSelectedVideoForPlay(v)}
                onChangeThumbnail={(v) => openThumbnailModal(v)}
                onThumbnailUpdated={handleThumbnailUpdated}
              />
            ))}
          </div>
        )}
      </main>

      {/* In-Page Video Player Modal */}
      <DrivePlayerModal
        video={selectedVideoForPlay}
        onClose={() => setSelectedVideoForPlay(null)}
        onOpenThumbnailModal={openThumbnailModal}
      />

      {/* Custom Backblaze B2 Thumbnail Modal */}
      <DriveThumbnailModal
        video={selectedVideoForThumbnail}
        initialCanvas={initialSnappedCanvas}
        onClose={() => {
          setSelectedVideoForThumbnail(null);
          setInitialSnappedCanvas(null);
        }}
        onThumbnailUpdated={handleThumbnailUpdated}
      />

      {/* Change Folder Link Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-400 text-black flex items-center justify-center font-bold">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Google Drive Public Folder</h3>
                <p className="text-xs text-slate-400">Paste your publicly shared folder link or folder ID</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Folder URL or ID
              </label>
              <input
                type="text"
                value={customFolderInput}
                onChange={(e) => setCustomFolderInput(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/1aBcD... or ID"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                <Info className="w-3 h-3 shrink-0" />
                <span>Ensure the Google Drive folder access is set to &quot;Anyone with the link can view&quot;.</span>
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowFolderModal(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSyncFolder(customFolderInput.trim())}
                disabled={isSyncing}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-extrabold rounded-xl shadow-lg shadow-amber-400/20 transition-all disabled:opacity-50"
              >
                {isSyncing ? 'Scanning...' : 'Sync & Load Videos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
