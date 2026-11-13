'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { IEmbedVideo } from '../../types';
import { Navbar } from '../../components/Navbar';
import { LibrarySidebar } from '../../components/LibrarySidebar';
import { EmbedVideoCard } from '../../components/EmbedVideoCard';
import {
  getEmbedVideosCache,
  setEmbedVideosCache,
  updateSingleEmbedInCache,
  removeEmbedFromCache,
} from '../../lib/embedState';
import { extractRealVideoFrameCanvas } from '../../lib/thumbnailGenerator';
import { canvasToWebP, generateBlurhashFromCanvas } from '../../lib/thumbnailOptimizer';
import {
  Tv,
  Link2,
  Plus,
  RefreshCw,
  ArrowUpDown,
  AlertCircle,
  Check,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Heart,
  X,
  Edit3,
} from 'lucide-react';

export default function EmbedVideosPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const [embeds, setEmbeds] = useState<IEmbedVideo[]>(() => getEmbedVideosCache() || []);
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = getEmbedVideosCache();
    return !cached || cached.length === 0;
  });

  // Top embed input bar state
  const [linkInput, setLinkInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customTags, setCustomTags] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [isEmbedding, setIsEmbedding] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Filters, sort, search & layout state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('recentlyAdded');
  const [filterMode, setFilterMode] = useState<'all' | 'favorites'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Edit embed modal
  const [editingEmbed, setEditingEmbed] = useState<IEmbedVideo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editEmbedUrl, setEditEmbedUrl] = useState('');
  const [editDirectUrl, setEditDirectUrl] = useState('');
  const [editThumbUrl, setEditThumbUrl] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('vault_embeds_view_mode');
      if (stored === 'list' || stored === 'grid') {
        setViewMode(stored);
      }
    }
  }, []);

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vault_embeds_view_mode', mode);
    }
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  const fetchEmbeds = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      setErrorMsg('');
      try {
        const res = await api.listEmbeds({
          limit: 200,
          search: debouncedSearch,
          sort: sortBy,
          filter: filterMode,
        });
        if (res?.success) {
          const list = res.embeds || [];
          setEmbeds(list);
          if (!debouncedSearch && filterMode === 'all') {
            setEmbedVideosCache(list);
          }
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'Failed to load embedded videos.');
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, sortBy, filterMode]
  );

  useEffect(() => {
    if (isAuthenticated) {
      const cached = getEmbedVideosCache();
      fetchEmbeds(!cached || cached.length === 0);
    }
  }, [isAuthenticated, fetchEmbeds]);

  // Background frame capture if a direct stream has no image thumbnail yet
  const autoCaptureDirectThumbnail = async (embed: IEmbedVideo) => {
    if (embed.thumbnailUrl || !embed.directMediaUrl) return;
    try {
      const refSuffix = embed.sourceUrl ? `&ref=${encodeURIComponent(embed.sourceUrl)}` : '';
      const proxied = `/api/stream-proxy?url=${encodeURIComponent(embed.directMediaUrl)}${refSuffix}`;
      const canvas = await extractRealVideoFrameCanvas(proxied, 3).catch(() => null);
      if (!canvas) return;
      const [blob, blurhash] = await Promise.all([
        canvasToWebP(canvas, 0.82),
        generateBlurhashFromCanvas(canvas).catch(() => undefined),
      ]);
      const initRes = await api.initiateEmbedThumbnailUpload({
        filename: `${embed._id.slice(0, 12)}_thumb.webp`,
        mimeType: 'image/webp',
        embedId: embed._id,
      });
      if (!initRes?.uploadUrl || !initRes?.storageKey) return;
      const upRes = await fetch(initRes.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/webp' },
        body: blob,
      });
      if (!upRes.ok) return;
      const attachRes = await api.attachEmbedThumbnail(embed._id, {
        thumbnailKey: initRes.storageKey,
        blurhash,
        storageAccount: initRes.storageAccount || 'account2',
      });
      if (attachRes?.embed) {
        setEmbeds((prev) => prev.map((e) => (e._id === attachRes.embed._id ? attachRes.embed : e)));
        updateSingleEmbedInCache(attachRes.embed);
      }
    } catch {
      // Ignore silent frame auto-capture failure
    }
  };

  const handleEmbedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = linkInput.trim();
    if (!raw) {
      setErrorMsg('Please paste a video URL to embed.');
      return;
    }

    setIsEmbedding(true);
    setErrorMsg('');
    try {
      const res = await api.createEmbed({
        url: raw,
        title: customTitle.trim() || undefined,
        tags: customTags.trim() || undefined,
        notes: customNotes.trim() || undefined,
      });
      if (res?.success && res.embed) {
        setEmbeds((prev) => {
          const filtered = prev.filter((item) => item._id !== res.embed._id);
          return [res.embed, ...filtered];
        });
        updateSingleEmbedInCache(res.embed);
        setLinkInput('');
        setCustomTitle('');
        setCustomTags('');
        setCustomNotes('');
        setShowAdvanced(false);
        showToast(res.updatedExisting ? `Updated "${res.embed.title}"` : `Embedded "${res.embed.title}"`);
        autoCaptureDirectThumbnail(res.embed);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not extract or embed this video link.');
    } finally {
      setIsEmbedding(false);
    }
  };

  const handleOpenEdit = (video: IEmbedVideo) => {
    setEditingEmbed(video);
    setEditTitle(video.title || '');
    setEditTags((video.tags || []).join(', '));
    setEditNotes(video.notes || '');
    setEditEmbedUrl(video.embedUrl || '');
    setEditDirectUrl(video.directMediaUrl || '');
    setEditThumbUrl(video.thumbnailUrl || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmbed) return;
    setIsSavingEdit(true);
    try {
      const res = await api.updateEmbedMetadata(editingEmbed._id, {
        title: editTitle.trim(),
        tags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
        notes: editNotes,
        embedUrl: editEmbedUrl.trim(),
        directMediaUrl: editDirectUrl.trim(),
        thumbnailUrl: editThumbUrl.trim() || undefined,
      });
      if (res?.success && res.embed) {
        setEmbeds((prev) => prev.map((v) => (v._id === res.embed._id ? res.embed : v)));
        updateSingleEmbedInCache(res.embed);
        setEditingEmbed(null);
        showToast(`Saved "${res.embed.title}"`);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update embed details.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteEmbed = async (video: IEmbedVideo) => {
    try {
      await api.deleteEmbed(video._id);
      setEmbeds((prev) => prev.filter((v) => v._id !== video._id));
      removeEmbedFromCache(video._id);
      showToast(`Removed "${video.title}"`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete embedded video.');
    }
  };

  const handleRefreshEmbed = async (video: IEmbedVideo) => {
    try {
      const res = await api.refreshEmbedMetadata(video._id);
      if (res?.success && res.embed) {
        setEmbeds((prev) => prev.map((v) => (v._id === res.embed._id ? res.embed : v)));
        updateSingleEmbedInCache(res.embed);
        showToast(`Refreshed metadata for "${res.embed.title}"`);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to refresh metadata.');
    }
  };

  const handleFavoriteToggle = async (id: string, isFav: boolean) => {
    setEmbeds((prev) => prev.map((v) => (v._id === id ? { ...v, favorite: isFav } : v)));
    try {
      const res = await api.updateEmbedMetadata(id, { favorite: isFav });
      if (res?.embed) updateSingleEmbedInCache(res.embed);
    } catch {
      setEmbeds((prev) => prev.map((v) => (v._id === id ? { ...v, favorite: !isFav } : v)));
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

      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 p-3.5 bg-[#191D29] border border-emerald-500/40 text-emerald-300 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Edit Embed Metadata Modal */}
      {editingEmbed && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#131620] border border-white/[0.1] max-w-lg w-full rounded-2xl p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.07]">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-400" />
                <span>Edit Embedded Video</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingEmbed(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090A0F] border border-white/[0.1] rounded-lg text-xs text-white focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="tutorial, music, favorite"
                    className="w-full px-3 py-2 bg-[#090A0F] border border-white/[0.1] rounded-lg text-xs text-white focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Thumbnail URL</label>
                  <input
                    type="url"
                    value={editThumbUrl}
                    onChange={(e) => setEditThumbUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-[#090A0F] border border-white/[0.1] rounded-lg text-xs text-white focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Embed Frame URL (optional override)</label>
                <input
                  type="url"
                  value={editEmbedUrl}
                  onChange={(e) => setEditEmbedUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-[#090A0F] border border-white/[0.1] rounded-lg text-xs text-white focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Direct Preview Stream URL (optional)</label>
                <input
                  type="url"
                  value={editDirectUrl}
                  onChange={(e) => setEditDirectUrl(e.target.value)}
                  placeholder="https://.../video.mp4 or .m3u8"
                  className="w-full px-3 py-2 bg-[#090A0F] border border-white/[0.1] rounded-lg text-xs text-white focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090A0F] border border-white/[0.1] rounded-lg text-xs text-white focus:outline-none focus:border-indigo-400 resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => setEditingEmbed(null)}
                  className="px-3.5 py-2 bg-[#191D29] hover:bg-white/[0.08] text-slate-300 text-xs font-medium rounded-lg border border-white/[0.08] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        <LibrarySidebar
          activeSection="embeds"
          onSelectSection={(sec) => {
            if (sec === 'embeds') return;
            if (sec === 'drive') {
              router.push('/drive');
              return;
            }
            if (sec === 'settings') {
              router.push('/settings');
              return;
            }
            if (sec === 'home' || sec === 'vault') {
              router.push('/');
              return;
            }
            router.push(`/?section=${encodeURIComponent(sec)}`);
          }}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          isMobileDrawerOpen={isMobileDrawerOpen}
          onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
          counts={{ embeds: embeds.length }}
        />

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Top Video Link Embed Bar */}
          <section className="bg-[#131620] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  <Tv className="w-5 h-5 text-emerald-400" />
                  <span>Embed Videos</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#090A0F] border border-white/[0.08] text-slate-400 font-mono tabular-nums">
                    {embeds.length}
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Paste any video link to extract its thumbnail and details, save to MongoDB, and play in Embed or Preview mode.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className={`self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showAdvanced
                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                    : 'bg-[#090A0F] border-white/[0.08] text-slate-300 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Custom Details</span>
              </button>
            </div>

            <form onSubmit={handleEmbedSubmit} className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative flex-1">
                  <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="url"
                    required
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="Paste video URL (YouTube, Vimeo, Streamable, Drive, MP4/M3U8, or any webpage)..."
                    className="w-full h-11 pl-10 pr-4 bg-[#090A0F] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 transition-colors"
                    aria-label="Video link to embed"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isEmbedding}
                  className="h-11 px-6 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isEmbedding ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Extracting...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Embed</span>
                    </>
                  )}
                </button>
              </div>

              {showAdvanced && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 animate-fade-in">
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Optional custom title"
                    className="px-3 py-2 bg-[#090A0F] border border-white/[0.08] rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                  />
                  <input
                    type="text"
                    value={customTags}
                    onChange={(e) => setCustomTags(e.target.value)}
                    placeholder="Tags (comma-separated)"
                    className="px-3 py-2 bg-[#090A0F] border border-white/[0.08] rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                  />
                  <input
                    type="text"
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    placeholder="Optional notes"
                    className="px-3 py-2 bg-[#090A0F] border border-white/[0.08] rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              )}
            </form>
          </section>

          {/* Toolbar: Filter Tabs, Grid/List, Refresh, Sort */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
            <div className="flex items-center gap-1 p-1 bg-[#131620] border border-white/[0.07] rounded-lg">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filterMode === 'all' ? 'bg-[#191D29] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                All Embeds
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('favorites')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filterMode === 'favorites' ? 'bg-[#191D29] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${filterMode === 'favorites' ? 'fill-rose-500 text-rose-500' : ''}`} />
                <span>Favorites</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#131620] border border-white/[0.07] rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => handleViewModeChange('grid')}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'grid' ? 'bg-[#191D29] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('list')}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'list' ? 'bg-[#191D29] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="List view"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => fetchEmbeds(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131620] hover:bg-[#191D29] border border-white/[0.07] text-slate-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                <span>Refresh</span>
              </button>

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
                  <option value="mostPlayed" className="bg-[#131620] text-slate-200">Most Played</option>
                  <option value="duration" className="bg-[#131620] text-slate-200">Duration</option>
                  <option value="oldest" className="bg-[#131620] text-slate-200">Oldest First</option>
                </select>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg('')}
                className="p-1 text-rose-300 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Grid / List / Empty / Loading */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 animate-pulse">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-video bg-[#131620] rounded-xl border border-white/[0.06]" />
              ))}
            </div>
          ) : embeds.length === 0 ? (
            <div className="bg-[#131620] border border-white/[0.07] rounded-2xl p-12 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3 text-emerald-400">
                <Tv className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">
                {debouncedSearch || filterMode === 'favorites' ? 'No matching embedded videos' : 'No embedded videos yet'}
              </h3>
              <p className="text-slate-400 text-xs max-w-md">
                {debouncedSearch || filterMode === 'favorites'
                  ? 'Try clearing your search or switching back to All Embeds.'
                  : 'Paste any video URL in the box above and click Embed to save its thumbnail and metadata and play it inside your library.'}
              </p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="space-y-3">
              {embeds.map((video) => (
                <EmbedVideoCard
                  key={video._id}
                  video={video}
                  viewMode="list"
                  onEdit={handleOpenEdit}
                  onDelete={handleDeleteEmbed}
                  onRefresh={handleRefreshEmbed}
                  onFavoriteToggle={handleFavoriteToggle}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {embeds.map((video) => (
                <EmbedVideoCard
                  key={video._id}
                  video={video}
                  viewMode="grid"
                  onEdit={handleOpenEdit}
                  onDelete={handleDeleteEmbed}
                  onRefresh={handleRefreshEmbed}
                  onFavoriteToggle={handleFavoriteToggle}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
