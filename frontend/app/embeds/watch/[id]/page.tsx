'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Hls from 'hls.js';
import { useAuth } from '../../../../context/AuthContext';
import { api } from '../../../../lib/api';
import { IEmbedVideo } from '../../../../types';
import { Navbar } from '../../../../components/Navbar';
import { EmbedVideoCard } from '../../../../components/EmbedVideoCard';
import {
  getEmbedVideosCache,
  updateSingleEmbedInCache,
  removeEmbedFromCache,
} from '../../../../lib/embedState';
import { canvasToWebP, generateBlurhashFromCanvas } from '../../../../lib/thumbnailOptimizer';
import { extractRealVideoFrameCanvas } from '../../../../lib/thumbnailGenerator';
import {
  ArrowLeft,
  Tv,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  RefreshCw,
  ExternalLink,
  Camera,
  Upload,
  Heart,
  Edit3,
  Trash2,
  Check,
  AlertCircle,
  Globe,
  Layers,
  X,
} from 'lucide-react';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function isSamePageUrl(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const hostA = ua.hostname.toLowerCase().replace(/^www\./, '');
    const hostB = ub.hostname.toLowerCase().replace(/^www\./, '');
    const pathA = ua.pathname.replace(/\/+$/, '') || '/';
    const pathB = ub.pathname.replace(/\/+$/, '') || '/';
    return hostA === hostB && pathA === pathB;
  } catch {
    return a.trim().replace(/\/+$/, '') === b.trim().replace(/\/+$/, '');
  }
}

export default function EmbedWatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const [embed, setEmbed] = useState<IEmbedVideo | null>(() => {
    const cached = getEmbedVideosCache();
    return cached?.find((v) => v._id === id) || null;
  });
  const [recommendations, setRecommendations] = useState<IEmbedVideo[]>([]);
  const [loading, setLoading] = useState<boolean>(() => !embed);
  const [error, setError] = useState('');

  // Player mode: 'embed' (iframe from original source) | 'preview' (direct video/HLS preview)
  const [activeMode, setActiveMode] = useState<'embed' | 'preview'>('embed');
  const [embedLoaded, setEmbedLoaded] = useState(false);
  const [embedKey, setEmbedKey] = useState(0);

  // Direct preview player state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const thumbnailFileInputRef = useRef<HTMLInputElement | null>(null);
  const playRecordedRef = useRef<string | null>(null);
  const retriedFreshStreamRef = useRef<string | null>(null);

  const [useProxyForPreview, setUseProxyForPreview] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Metadata / Thumbnail UI state
  const [toastMsg, setToastMsg] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editEmbedUrl, setEditEmbedUrl] = useState('');
  const [editDirectUrl, setEditDirectUrl] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const loadEmbed = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const [detailsRes, listRes] = await Promise.all([
        api.getEmbedDetails(id).catch(() => null),
        api.listEmbeds({ limit: 50 }).catch(() => null),
      ]);

      const found = detailsRes?.embed || listRes?.embeds?.find((v) => v._id === id) || null;
      if (!found) {
        setError('Embedded video not found.');
        return;
      }
      setEmbed(found);
      updateSingleEmbedInCache(found);
      setUseProxyForPreview(false);
      setPreviewError('');

      const foundHasEmbedPlayer = Boolean(found.embedUrl && !isSamePageUrl(found.embedUrl, found.sourceUrl));
      const foundHasDirect = Boolean(found.directMediaUrl);
      if (foundHasDirect && (!foundHasEmbedPlayer || found.playbackType === 'direct')) {
        setActiveMode('preview');
      } else if (foundHasEmbedPlayer) {
        setActiveMode('embed');
      } else {
        setActiveMode('preview');
      }

      if (listRes?.embeds) {
        const others = listRes.embeds.filter((v) => v._id !== found._id);
        for (let i = others.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [others[i], others[j]] = [others[j], others[i]];
        }
        setRecommendations(others.slice(0, 8));
      }

      if (playRecordedRef.current !== found._id) {
        playRecordedRef.current = found._id;
        api.recordEmbedPlay(found._id).then((pRes) => {
          if (pRes?.success && typeof pRes.playCount === 'number') {
            setEmbed((prev) => (prev ? { ...prev, playCount: pRes.playCount } : prev));
          }
        }).catch(() => {});
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load embedded video.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isAuthenticated) {
      loadEmbed();
    }
  }, [isAuthenticated, loadEmbed]);

  // Wire direct preview <video> / HLS engine when activeMode === 'preview'
  useEffect(() => {
    let cancelled = false;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const videoEl = videoRef.current;
    if (!videoEl || activeMode !== 'preview' || !embed?.directMediaUrl) return;

    const rawStream = embed.directMediaUrl;
    const refQuery = embed.sourceUrl ? `&ref=${encodeURIComponent(embed.sourceUrl)}` : '';
    const proxiedSrc = `/api/stream-proxy?url=${encodeURIComponent(rawStream)}${refQuery}`;
    const looksLikeGetFileOrHotlink = /\/get_file\/|\/hls\/|mpegurl/i.test(rawStream);

    if (!useProxyForPreview && looksLikeGetFileOrHotlink) {
      setUseProxyForPreview(true);
      return;
    }

    setPreviewError('');
    setIsBuffering(true);

    const attachHls = (srcToLoad: string, isAlreadyProxied: boolean) => {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });
        hlsRef.current = hls;
        hls.loadSource(srcToLoad);
        hls.attachMedia(videoEl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          setIsBuffering(false);
          videoEl.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (cancelled || !data.fatal) return;
          if (!isAlreadyProxied) {
            setUseProxyForPreview(true);
          } else {
            setPreviewError('Could not load direct HLS stream in preview mode. Remote host may have expired or blocked this stream.');
            setIsBuffering(false);
          }
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = srcToLoad;
        videoEl.load();
      } else {
        setPreviewError('HLS playback is not supported in this browser.');
        setIsBuffering(false);
      }
    };

    if (!useProxyForPreview) {
      const isObviousHls = /\.m3u8(\?|$)/i.test(rawStream);
      if (isObviousHls) {
        attachHls(rawStream, false);
      } else {
        videoEl.src = rawStream;
        videoEl.load();
      }
    } else {
      // Probe via same-origin proxy (forwards Referer + inspects actual #EXTM3U vs MP4 content)
      (async () => {
        try {
          const probeRes = await fetch(
            `/api/stream-proxy?probe=1&url=${encodeURIComponent(rawStream)}${refQuery}`
          );
          if (cancelled) return;
          if (probeRes.ok) {
            const probe = await probeRes.json();
            if (cancelled) return;

            // If upstream token expired (403/404/410), refresh extracted stream URL once automatically
            if (!probe.ok && (probe.status === 403 || probe.status === 404 || probe.status === 410)) {
              if (retriedFreshStreamRef.current !== embed._id) {
                retriedFreshStreamRef.current = embed._id;
                const refreshed = await api.refreshEmbedMetadata(embed._id).catch(() => null);
                if (!cancelled && refreshed?.success && refreshed.embed?.directMediaUrl) {
                  setEmbed(refreshed.embed);
                  updateSingleEmbedInCache(refreshed.embed);
                  return;
                }
              }
              setPreviewError('Remote stream token expired or blocked by upstream host. Try refreshing metadata or opening the original source.');
              setIsBuffering(false);
              return;
            }

            if (probe.isHls || /\.m3u8(\?|$)/i.test(rawStream)) {
              attachHls(proxiedSrc, true);
              return;
            }
          }
        } catch {
          // Fall back to direct proxied <video> attachment below
        }

        if (cancelled) return;
        if (/\.m3u8(\?|$)/i.test(rawStream)) {
          attachHls(proxiedSrc, true);
        } else {
          videoEl.src = proxiedSrc;
          videoEl.load();
        }
      })();
    }

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeMode, embed?._id, embed?.directMediaUrl, embed?.sourceUrl, useProxyForPreview]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (activeMode !== 'preview') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const v = videoRef.current;
      if (!v) return;
      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - 5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - 10);
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        v.muted = !v.muted;
        setIsMuted(v.muted);
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          containerRef.current?.requestFullscreen?.().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMode]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  const skipSeconds = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const target = Math.max(0, Math.min(v.duration || duration || 0, v.currentTime + delta));
    v.currentTime = target;
    setCurrentTime(target);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
    setCurrentTime(val);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const cycleSpeed = () => {
    const speeds = [0.75, 1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen?.().catch(() => {});
    }
  };

  const saveThumbnailBlob = async (blob: Blob, blurhash?: string) => {
    if (!embed) return;
    const initRes = await api.initiateEmbedThumbnailUpload({
      filename: `${embed._id.slice(0, 12)}_thumb.webp`,
      mimeType: blob.type || 'image/webp',
      embedId: embed._id,
    });
    if (!initRes?.uploadUrl || !initRes?.storageKey) {
      throw new Error('Failed to initialize thumbnail upload');
    }
    const up = await fetch(initRes.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'image/webp' },
      body: blob,
    });
    if (!up.ok) throw new Error('Thumbnail upload failed');
    const attach = await api.attachEmbedThumbnail(embed._id, {
      thumbnailKey: initRes.storageKey,
      blurhash,
      storageAccount: initRes.storageAccount || 'account2',
    });
    if (attach?.embed) {
      setEmbed(attach.embed);
      updateSingleEmbedInCache(attach.embed);
      showToast('Thumbnail saved!');
    }
  };

  const handleSnapFrame = async () => {
    if (!embed) return;
    setIsSnapping(true);
    try {
      let canvas: HTMLCanvasElement | null = null;
      if (activeMode === 'preview' && videoRef.current && videoRef.current.readyState >= 2) {
        const v = videoRef.current;
        const c = document.createElement('canvas');
        c.width = v.videoWidth || 640;
        c.height = v.videoHeight || 360;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          canvas = c;
        }
      }
      if (!canvas && embed.directMediaUrl) {
        const refQuery = embed.sourceUrl ? `&ref=${encodeURIComponent(embed.sourceUrl)}` : '';
        const proxied = `/api/stream-proxy?url=${encodeURIComponent(embed.directMediaUrl)}${refQuery}`;
        canvas = await extractRealVideoFrameCanvas(proxied, currentTime > 0 ? currentTime : 3);
      }
      if (!canvas) {
        showToast('Frame capture requires a direct stream preview; try Upload Thumb or Refresh Details.');
        return;
      }
      const [blob, blurhash] = await Promise.all([
        canvasToWebP(canvas, 0.85),
        generateBlurhashFromCanvas(canvas).catch(() => undefined),
      ]);
      await saveThumbnailBlob(blob, blurhash);
    } catch {
      showToast('Cross-origin frame capture blocked; upload a custom thumbnail image instead.');
    } finally {
      setIsSnapping(false);
    }
  };

  const handleUploadCustomThumb = async (file: File) => {
    setIsSnapping(true);
    try {
      await saveThumbnailBlob(file);
    } catch (err: any) {
      showToast(err?.message || 'Failed to upload thumbnail');
    } finally {
      setIsSnapping(false);
    }
  };

  const handleRefreshMetadata = async () => {
    if (!embed) return;
    setIsRefreshing(true);
    try {
      const res = await api.refreshEmbedMetadata(embed._id);
      if (res?.success && res.embed) {
        setEmbed(res.embed);
        updateSingleEmbedInCache(res.embed);
        showToast('Metadata and thumbnail refreshed');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to refresh metadata');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!embed) return;
    const next = !embed.favorite;
    setEmbed({ ...embed, favorite: next });
    try {
      const res = await api.updateEmbedMetadata(embed._id, { favorite: next });
      if (res?.embed) {
        setEmbed(res.embed);
        updateSingleEmbedInCache(res.embed);
      }
    } catch {
      setEmbed({ ...embed, favorite: !next });
    }
  };

  const handleOpenEdit = () => {
    if (!embed) return;
    setEditTitle(embed.title || '');
    setEditTags((embed.tags || []).join(', '));
    setEditNotes(embed.notes || '');
    setEditEmbedUrl(embed.embedUrl || '');
    setEditDirectUrl(embed.directMediaUrl || '');
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!embed) return;
    setIsSavingEdit(true);
    try {
      const res = await api.updateEmbedMetadata(embed._id, {
        title: editTitle.trim(),
        tags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
        notes: editNotes,
        embedUrl: editEmbedUrl.trim(),
        directMediaUrl: editDirectUrl.trim(),
      });
      if (res?.success && res.embed) {
        setEmbed(res.embed);
        updateSingleEmbedInCache(res.embed);
        setShowEditModal(false);
        showToast('Embed details saved');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to save changes');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!embed) return;
    try {
      await api.deleteEmbed(embed._id);
      removeEmbedFromCache(embed._id);
      router.push('/embeds');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete');
    }
  };

  if (isLoading || !isAuthenticated || loading) {
    return (
      <div className="min-h-screen bg-[#090A0F] flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !embed) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-[#F4F5F8] flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#131620] border border-white/[0.08] rounded-2xl p-8 text-center space-y-4">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
            <h2 className="text-base font-bold text-white">{error || 'Embed not found'}</h2>
            <Link
              href="/embeds"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Embed Videos</span>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const hasEmbedPlayer = Boolean(embed.embedUrl && !isSamePageUrl(embed.embedUrl, embed.sourceUrl));
  const iframeTarget = hasEmbedPlayer ? embed.embedUrl! : '';
  const hasDirectPreview = Boolean(embed.directMediaUrl);

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F] text-[#F4F5F8]">
      <Navbar />

      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 p-3.5 bg-[#191D29] border border-indigo-500/40 text-indigo-200 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Edit Embed Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#131620] border border-white/[0.1] max-w-lg w-full rounded-2xl p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.07]">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-400" />
                <span>Edit Embed Details</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] cursor-pointer"
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
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090A0F] border border-white/[0.1] rounded-lg text-xs text-white focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Embed Iframe URL</label>
                <input
                  type="url"
                  value={editEmbedUrl}
                  onChange={(e) => setEditEmbedUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090A0F] border border-white/[0.1] rounded-lg text-xs text-white focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Direct Stream Preview URL</label>
                <input
                  type="url"
                  value={editDirectUrl}
                  onChange={(e) => setEditDirectUrl(e.target.value)}
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
                  onClick={() => setShowEditModal(false)}
                  className="px-3.5 py-2 bg-[#191D29] text-slate-300 text-xs font-medium rounded-lg border border-white/[0.08] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
        {/* Top Breadcrumb + Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/embeds"
            prefetch
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-[#131620] hover:bg-[#191D29] border border-white/[0.08] px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Embed Videos</span>
          </Link>

          <div className="flex items-center gap-2">
            {/* Switch between Embed Mode & Direct Preview Mode */}
            <div className="flex items-center p-0.5 bg-[#131620] border border-white/[0.08] rounded-lg text-xs">
              {hasEmbedPlayer && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode('embed');
                    setEmbedLoaded(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeMode === 'embed' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>Embed Mode</span>
                </button>
              )}
              {hasDirectPreview && (
                <button
                  type="button"
                  onClick={() => setActiveMode('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeMode === 'preview' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Direct Preview</span>
                </button>
              )}
            </div>

            <a
              href={embed.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131620] hover:bg-[#191D29] border border-white/[0.08] text-slate-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Original Source</span>
            </a>
          </div>
        </div>

        {/* Player Stage */}
        {activeMode === 'embed' && hasEmbedPlayer ? (
          <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/[0.08] shadow-2xl group">
            {!embedLoaded && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#090A0F]/90 gap-3 pointer-events-none">
                <div className="w-9 h-9 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
                <span className="text-xs font-medium text-slate-400">
                  Loading {embed.platform} embed player...
                </span>
              </div>
            )}
            <iframe
              key={`${embed._id}-${embedKey}`}
              src={iframeTarget}
              onLoad={() => setEmbedLoaded(true)}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              title={embed.title}
            />
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => {
                  setEmbedLoaded(false);
                  setEmbedKey((k) => k + 1);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/80 hover:bg-black text-slate-200 hover:text-white border border-white/15 text-[11px] font-medium backdrop-blur-md cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 text-indigo-400" />
                <span>Reload Embed</span>
              </button>
              {hasDirectPreview && (
                <button
                  type="button"
                  onClick={() => setActiveMode('preview')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/80 hover:bg-black text-slate-200 hover:text-white border border-white/15 text-[11px] font-medium backdrop-blur-md cursor-pointer"
                >
                  <Play className="w-3 h-3 text-emerald-400" />
                  <span>Direct Preview</span>
                </button>
              )}
            </div>
          </div>
        ) : !hasDirectPreview ? (
          <div className="relative w-full aspect-video bg-[#0C0E15] rounded-xl overflow-hidden border border-white/[0.08] shadow-2xl flex items-center justify-center p-6 text-center">
            <div className="max-w-md space-y-3">
              <AlertCircle className="w-9 h-9 text-amber-400 mx-auto" />
              <h3 className="text-sm font-semibold text-white">No Embed Player or Direct Stream Found</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {embed.platform || embed.sourceDomain} blocked automated extraction or does not expose a standalone iframe player. You can refresh metadata, paste a direct/embed URL in Edit Details, or open the original source.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleRefreshMetadata}
                  disabled={isRefreshing}
                  className="px-3.5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  {isRefreshing ? 'Refreshing...' : 'Re-fetch Stream'}
                </button>
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  className="px-3.5 py-2 bg-[#191D29] text-slate-200 border border-white/10 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Edit URLs
                </button>
                <a
                  href={embed.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 bg-[#191D29] text-slate-200 border border-white/10 text-xs font-semibold rounded-lg"
                >
                  Open Original
                </a>
              </div>
            </div>
          </div>
        ) : (
          /* Link-Downloader Style Direct Video Preview Player */
          <div
            ref={containerRef}
            className="relative w-full aspect-video max-h-[82vh] bg-black rounded-xl overflow-hidden border border-white/[0.08] shadow-2xl group select-none"
          >
            <video
              ref={videoRef}
              poster={embed.thumbnailUrl}
              playsInline
              preload="metadata"
              onClick={togglePlay}
              onDoubleClick={toggleFullscreen}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  setDuration(videoRef.current.duration || 0);
                  setIsBuffering(false);
                }
              }}
              onTimeUpdate={() => {
                if (videoRef.current) setCurrentTime(videoRef.current.currentTime || 0);
              }}
              onPlaying={() => {
                setIsPlaying(true);
                setIsBuffering(false);
                setPreviewError('');
              }}
              onPause={() => setIsPlaying(false)}
              onWaiting={() => setIsBuffering(true)}
              onCanPlay={() => setIsBuffering(false)}
              onError={() => {
                if (!useProxyForPreview) {
                  setUseProxyForPreview(true);
                } else {
                  setIsBuffering(false);
                  setPreviewError('Stream blocked by remote host CORS/hotlink protection or expired token. Try Re-fetch Stream or open the original source.');
                }
              }}
              className="absolute inset-0 w-full h-full object-contain cursor-pointer"
            />

            {/* Centered Play Button Overlay when paused */}
            {!isPlaying && !isBuffering && !previewError && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Play video"
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-indigo-500/95 hover:bg-indigo-400 text-white flex items-center justify-center shadow-2xl ring-4 ring-white/15 transition-transform hover:scale-105">
                  <Play className="w-7 h-7 fill-current translate-x-0.5" />
                </div>
              </button>
            )}

            {isBuffering && !previewError && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 pointer-events-none">
                <div className="w-10 h-10 border-[3px] border-white/20 border-t-indigo-400 rounded-full animate-spin" />
              </div>
            )}

            {previewError && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 p-6 text-center">
                <div className="max-w-md bg-[#131620] border border-amber-500/30 rounded-2xl p-6 space-y-3">
                  <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-xs text-slate-300 leading-relaxed">{previewError}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {hasEmbedPlayer && (
                      <button
                        type="button"
                        onClick={() => setActiveMode('embed')}
                        className="px-3.5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        Switch to Embed Mode
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleRefreshMetadata}
                      disabled={isRefreshing}
                      className="px-3.5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      {isRefreshing ? 'Refreshing...' : 'Re-fetch Stream'}
                    </button>
                    <a
                      href={embed.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 bg-[#191D29] text-slate-200 border border-white/10 text-xs font-semibold rounded-lg"
                    >
                      Open Original
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Controls Bar — overlaid inside bottom edge so video stays dead-center and controls are always visible */}
            <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-4 pt-10 pb-3 space-y-2">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 accent-indigo-500 cursor-pointer"
                aria-label="Seek timeline"
              />
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-1.5 text-white hover:text-indigo-300 cursor-pointer"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>
                  <button type="button" onClick={() => skipSeconds(-10)} className="p-1.5 text-slate-300 hover:text-white cursor-pointer" title="Back 10s">
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => skipSeconds(10)} className="p-1.5 text-slate-300 hover:text-white cursor-pointer" title="Forward 10s">
                    <RotateCw className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1.5 ml-1">
                    <button type="button" onClick={toggleMute} className="p-1 text-slate-300 hover:text-white cursor-pointer" aria-label={isMuted ? 'Unmute' : 'Mute'}>
                      {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-16 hidden sm:block accent-indigo-400 cursor-pointer"
                      aria-label="Volume"
                    />
                  </div>
                  <span className="font-mono text-[11px] text-slate-300 tabular-nums ml-1 sm:ml-2">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cycleSpeed}
                    className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[11px] font-mono text-slate-200 tabular-nums cursor-pointer"
                    title="Playback speed"
                  >
                    {playbackSpeed}x
                  </button>
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-1.5 text-slate-300 hover:text-white cursor-pointer"
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Helpful info banner when an external host might block iframe embedding */}
        {activeMode === 'embed' && hasEmbedPlayer && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-[#131620] border border-white/[0.06] rounded-xl text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>
                Playing from <strong className="text-slate-200 font-medium">{embed.sourceDomain || embed.platform}</strong> in Embed Mode.
                {hasDirectPreview ? ' You can also switch to Direct Preview Mode anytime.' : ' If a site blocks iframe embedding, use Original Source.'}
              </span>
            </span>
            {hasDirectPreview && (
              <button
                type="button"
                onClick={() => setActiveMode('preview')}
                className="text-indigo-300 hover:text-indigo-200 font-semibold whitespace-nowrap cursor-pointer"
              >
                Switch to Direct Preview →
              </button>
            )}
          </div>
        )}

        {/* Details & Actions Card */}
        <section className="bg-[#131620] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                {embed.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                <span className="text-emerald-300 font-medium">{embed.platform}</span>
                <span aria-hidden="true">·</span>
                <span>{embed.sourceDomain}</span>
                {embed.duration > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{formatTime(embed.duration)}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono">{embed.playCount || 0} plays</span>
                <span aria-hidden="true">·</span>
                <span>Added {new Date(embed.createdAt).toLocaleDateString()}</span>
              </div>
              {embed.description && (
                <p className="text-xs text-slate-400 leading-relaxed pt-1 max-w-3xl">
                  {embed.description}
                </p>
              )}
              {embed.tags && embed.tags.length > 0 && (
                <div className="text-xs text-slate-400 pt-1">
                  Tags: <span className="text-slate-300">{embed.tags.join(' · ')}</span>
                </div>
              )}
              {embed.notes && (
                <div className="text-xs text-slate-300 pt-1">
                  Notes: <span className="text-slate-400">{embed.notes}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleToggleFavorite}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  embed.favorite
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-[#191D29] border-white/[0.08] text-slate-200 hover:bg-white/[0.08]'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${embed.favorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                <span>{embed.favorite ? 'Liked' : 'Like'}</span>
              </button>

              {hasDirectPreview && (
                <button
                  type="button"
                  disabled={isSnapping}
                  onClick={handleSnapFrame}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#191D29] hover:bg-white/[0.08] border border-white/[0.08] text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <Camera className={`w-3.5 h-3.5 text-indigo-400 ${isSnapping ? 'animate-pulse' : ''}`} />
                  <span>{isSnapping ? 'Capturing...' : 'Snap Frame'}</span>
                </button>
              )}

              <input
                ref={thumbnailFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadCustomThumb(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={isSnapping}
                onClick={() => thumbnailFileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#191D29] hover:bg-white/[0.08] border border-white/[0.08] text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-slate-400" />
                <span>Upload Thumb</span>
              </button>

              <button
                type="button"
                disabled={isRefreshing}
                onClick={handleRefreshMetadata}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#191D29] hover:bg-white/[0.08] border border-white/[0.08] text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={handleOpenEdit}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#191D29] hover:bg-white/[0.08] border border-white/[0.08] text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                <span>Edit</span>
              </button>

              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#191D29] hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/40 text-rose-400 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-2 bg-[#191D29] text-slate-300 text-xs rounded-lg border border-white/[0.08] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Recommended Embeds Shelf */}
        {recommendations.length > 0 && (
          <section className="space-y-3 pt-2">
            <h3 className="text-sm font-semibold text-white tracking-tight flex items-center justify-between">
              <span>More Embedded Videos</span>
              <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                {recommendations.length} saved embeds
              </span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {recommendations.map((item) => (
                <EmbedVideoCard key={item._id} video={item} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
