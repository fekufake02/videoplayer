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
  downloadVideoOnClient,
  ClientDownloadProgress,
  ClientDownloadCorsError,
  sanitizeDownloadFilename,
} from '../../../../lib/clientDownloader';
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
  ShieldCheck,
  Download,
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

function isOfficialTrustedIframe(urlStr?: string): boolean {
  if (!urlStr) return false;
  try {
    const h = new URL(urlStr).hostname.toLowerCase();
    return /youtube\.com|youtu\.be|player\.vimeo\.com|vimeo\.com|dailymotion\.com|streamable\.com|loom\.com|drive\.google\.com|player\.twitch\.tv|tiktok\.com/i.test(h);
  } catch {
    return false;
  }
}

type PreviewStrategy = 'direct' | 'proxy-embed' | 'proxy-source' | 'proxy-noref';

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

  // Player modes
  const [activeMode, setActiveMode] = useState<'preview' | 'embed'>('preview');
  const [embedSubMode, setEmbedSubMode] = useState<'direct' | 'proxy'>('direct');
  const [embedFrameReason, setEmbedFrameReason] = useState<string>('');
  const [embedLoaded, setEmbedLoaded] = useState(false);
  const [embedKey, setEmbedKey] = useState(0);
  const [discoveredStreamUrl, setDiscoveredStreamUrl] = useState<string>('');

  // Bridge state from proxied embed player
  const [embedVideoState, setEmbedVideoState] = useState<{
    hasVideo: boolean;
    paused: boolean;
    muted: boolean;
    currentTime: number;
    duration: number;
  }>({ hasVideo: false, paused: true, muted: false, currentTime: 0, duration: 0 });

  // Direct preview player state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const embedContainerRef = useRef<HTMLDivElement | null>(null);
  const embedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const thumbnailFileInputRef = useRef<HTMLInputElement | null>(null);
  const playRecordedRef = useRef<string | null>(null);
  const retriedRefreshForIdRef = useRef<string | null>(null);
  const persistedDiscoveredRef = useRef<string | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);

  const [previewStrategyIndex, setPreviewStrategyIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Client download state (zero server streaming)
  const [downloadProgress, setDownloadProgress] = useState<ClientDownloadProgress | null>(null);
  const [isDownloadingClient, setIsDownloadingClient] = useState(false);
  const [downloadCorsFallbackUrl, setDownloadCorsFallbackUrl] = useState<string | null>(null);

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

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3800);
  }, []);

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
      setPreviewStrategyIndex(0);
      setPreviewError('');
      setDiscoveredStreamUrl('');
      setDownloadCorsFallbackUrl(null);
      setEmbedVideoState({ hasVideo: false, paused: true, muted: false, currentTime: 0, duration: 0 });

      const foundHasDirect = Boolean(found.directMediaUrl);
      const foundHasEmbed = Boolean(found.embedUrl && !isSamePageUrl(found.embedUrl, found.sourceUrl));
      if (foundHasDirect && (!foundHasEmbed || found.playbackType === 'direct')) {
        setActiveMode('preview');
      } else if (foundHasEmbed) {
        setActiveMode('embed');
      } else if (foundHasDirect) {
        setActiveMode('preview');
      } else {
        setActiveMode('embed');
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

  const effectiveDirectStream = discoveredStreamUrl || embed?.directMediaUrl || '';
  const hasSeparateEmbedUrl = Boolean(embed?.embedUrl && !isSamePageUrl(embed?.embedUrl, embed?.sourceUrl));
  const embedTargetUrl = hasSeparateEmbedUrl ? embed!.embedUrl! : embed?.sourceUrl || '';

  // Compute strategy chain for Direct Preview fallback
  const strategyList: PreviewStrategy[] = React.useMemo(() => {
    if (!effectiveDirectStream) return [];
    const looksHotlinkedOrHls = /\/get_file\/|\/hls\/|\.m3u8(\?|$)|token=|md5=|expires=/i.test(
      effectiveDirectStream
    );
    const list: PreviewStrategy[] = [];
    if (!looksHotlinkedOrHls) {
      list.push('direct');
    }
    if (embed?.embedUrl && !isSamePageUrl(embed.embedUrl, embed.sourceUrl)) {
      list.push('proxy-embed');
    }
    list.push('proxy-source');
    list.push('proxy-noref');
    if (looksHotlinkedOrHls) {
      list.push('direct');
    }
    return list;
  }, [effectiveDirectStream, embed?.embedUrl, embed?.sourceUrl]);

  const currentStrategy = strategyList[previewStrategyIndex] || null;

  const advancePreviewStrategy = useCallback(async () => {
    if (previewStrategyIndex + 1 < strategyList.length) {
      setPreviewStrategyIndex((idx) => idx + 1);
      return;
    }

    // All URL proxy strategies failed — try re-scraping fresh stream URLs once if we haven't yet
    if (embed && retriedRefreshForIdRef.current !== embed._id) {
      retriedRefreshForIdRef.current = embed._id;
      try {
        const refreshed = await api.refreshEmbedMetadata(embed._id);
        if (refreshed?.success && refreshed.embed) {
          setEmbed(refreshed.embed);
          updateSingleEmbedInCache(refreshed.embed);
          if (
            refreshed.embed.directMediaUrl &&
            refreshed.embed.directMediaUrl !== effectiveDirectStream
          ) {
            setPreviewStrategyIndex(0);
            setPreviewError('');
            return;
          }
        }
      } catch {
        // Fall through to error panel
      }
    }

    setIsBuffering(false);
    setPreviewError(
      'Direct stream could not be loaded directly (expired token or strict CDN protection). Switch to Embed Mode to play seamlessly inside the app.'
    );
  }, [previewStrategyIndex, strategyList.length, embed, effectiveDirectStream]);

  // Pre-check whether embedTargetUrl permits iframe framing when entering Embed Mode
  useEffect(() => {
    if (activeMode !== 'embed' || !embedTargetUrl) return;
    let cancelled = false;
    setEmbedLoaded(false);
    setEmbedFrameReason('');

    if (isOfficialTrustedIframe(embedTargetUrl)) {
      setEmbedSubMode('direct');
      return;
    }

    // Check server-side whether X-Frame-Options or CSP blocks direct iframe
    fetch(`/api/embed-check?url=${encodeURIComponent(embedTargetUrl)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && data.frameable === false) {
          setEmbedSubMode('proxy');
          setEmbedFrameReason(data.reason || 'X-Frame-Options');
        } else {
          setEmbedSubMode('direct');
        }
      })
      .catch(() => {
        if (!cancelled) setEmbedSubMode('direct');
      });

    return () => {
      cancelled = true;
    };
  }, [activeMode, embedTargetUrl]);

  // Listen to bridge messages from our in-app Safe Proxy Embed iframe
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'VAULT_EMBED_MEDIA_DISCOVERED' && typeof data.url === 'string') {
        const mediaUrl = data.url.trim();
        if (!mediaUrl || mediaUrl === discoveredStreamUrl) return;
        setDiscoveredStreamUrl(mediaUrl);

        // Persist newly discovered stream URL if missing so Direct Preview & Download work next time too
        if (embed && !embed.directMediaUrl && persistedDiscoveredRef.current !== mediaUrl) {
          persistedDiscoveredRef.current = mediaUrl;
          api
            .updateEmbedMetadata(embed._id, { directMediaUrl: mediaUrl })
            .then((res) => {
              if (res?.embed) {
                setEmbed(res.embed);
                updateSingleEmbedInCache(res.embed);
              }
            })
            .catch(() => {});
        }
      } else if (data.type === 'VAULT_EMBED_STATE') {
        setEmbedVideoState({
          hasVideo: true,
          paused: Boolean(data.paused),
          muted: Boolean(data.muted),
          currentTime: Number(data.currentTime) || 0,
          duration: Number(data.duration) || 0,
        });
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [embed, discoveredStreamUrl]);

  // Wire direct preview <video> / HLS engine
  useEffect(() => {
    let cancelled = false;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const videoEl = videoRef.current;
    if (!videoEl || activeMode !== 'preview' || !effectiveDirectStream || !currentStrategy) return;

    const buildSrc = (strategy: PreviewStrategy): string => {
      if (strategy === 'direct') return effectiveDirectStream;
      if (strategy === 'proxy-embed' && embed?.embedUrl) {
        return `/api/stream-proxy?url=${encodeURIComponent(effectiveDirectStream)}&ref=${encodeURIComponent(embed.embedUrl)}`;
      }
      if (strategy === 'proxy-source' && embed?.sourceUrl) {
        return `/api/stream-proxy?url=${encodeURIComponent(effectiveDirectStream)}&ref=${encodeURIComponent(embed.sourceUrl)}`;
      }
      return `/api/stream-proxy?url=${encodeURIComponent(effectiveDirectStream)}&noRef=1`;
    };

    const targetSrc = buildSrc(currentStrategy);
    setPreviewError('');
    setIsBuffering(true);

    const attachHls = (srcToLoad: string) => {
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
          hls.destroy();
          hlsRef.current = null;
          advancePreviewStrategy();
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = srcToLoad;
        videoEl.load();
      } else {
        advancePreviewStrategy();
      }
    };

    if (currentStrategy === 'direct') {
      if (/\.m3u8(\?|$)/i.test(targetSrc)) {
        attachHls(targetSrc);
      } else {
        videoEl.src = targetSrc;
        videoEl.load();
      }
    } else {
      // Probe via same-origin proxy to detect HLS (#EXTM3U) vs HTML error pages vs MP4
      (async () => {
        try {
          const probeRes = await fetch(`${targetSrc}&probe=1`);
          if (cancelled) return;
          if (probeRes.ok) {
            const probe = await probeRes.json();
            if (cancelled) return;

            if (!probe.ok || probe.looksLikeHtml || probe.status >= 400) {
              advancePreviewStrategy();
              return;
            }
            if (probe.isHls || /\.m3u8(\?|$)/i.test(effectiveDirectStream)) {
              attachHls(targetSrc);
              return;
            }
          }
        } catch {
          // Proceed with standard attachment below
        }

        if (cancelled) return;
        if (/\.m3u8(\?|$)/i.test(effectiveDirectStream)) {
          attachHls(targetSrc);
        } else {
          videoEl.src = targetSrc;
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
  }, [
    activeMode,
    effectiveDirectStream,
    currentStrategy,
    embed?.embedUrl,
    embed?.sourceUrl,
    advancePreviewStrategy,
  ]);

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

  const sendEmbedCmd = (cmd: string, delta?: number) => {
    try {
      embedIframeRef.current?.contentWindow?.postMessage({ type: 'VAULT_EMBED_CMD', cmd, delta }, '*');
    } catch {}
  };

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
    const targetEl = activeMode === 'preview' ? containerRef.current : embedContainerRef.current;
    if (!targetEl) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      targetEl.requestFullscreen?.().catch(() => {});
    }
  };

  // Pure Client-Side Download Handler (zero server involvement for file streaming)
  const handleClientDownload = async () => {
    if (!embed) return;
    const targetUrl = effectiveDirectStream;
    if (!targetUrl) {
      showToast('Play the video in Safe Proxy Embed or click Refresh first to detect its downloadable video stream.');
      return;
    }

    if (isDownloadingClient) {
      downloadAbortRef.current?.abort();
      setIsDownloadingClient(false);
      setDownloadProgress(null);
      return;
    }

    setDownloadCorsFallbackUrl(null);
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setIsDownloadingClient(true);

    try {
      const res = await downloadVideoOnClient({
        url: targetUrl,
        title: embed.title,
        signal: controller.signal,
        onProgress: (p) => setDownloadProgress(p),
      });
      showToast(`Downloaded "${res.filename}" directly in browser!`);
      setTimeout(() => setDownloadProgress(null), 3500);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        showToast('Download canceled');
        setDownloadProgress(null);
      } else if (err instanceof ClientDownloadCorsError) {
        setDownloadProgress(null);
        setDownloadCorsFallbackUrl(targetUrl);
        showToast('CDN blocked browser JS fetch — use the Direct CDN Save link below to download on client.');
      } else {
        setDownloadProgress(null);
        showToast(err?.message || 'Client download failed');
      }
    } finally {
      setIsDownloadingClient(false);
      downloadAbortRef.current = null;
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
      if (!canvas && effectiveDirectStream) {
        const refQuery = embed.sourceUrl ? `&ref=${encodeURIComponent(embed.sourceUrl)}` : '';
        const proxied = `/api/stream-proxy?url=${encodeURIComponent(effectiveDirectStream)}${refQuery}`;
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
        setPreviewStrategyIndex(0);
        setPreviewError('');
        showToast('Metadata and stream links refreshed');
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
        setPreviewStrategyIndex(0);
        setPreviewError('');
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

  const hasDirectPreview = Boolean(effectiveDirectStream);
  const officialIframe = isOfficialTrustedIframe(embedTargetUrl);
  const activeEmbedIframeSrc =
    embedSubMode === 'proxy'
      ? `/api/embed-proxy?url=${encodeURIComponent(embedTargetUrl)}&ref=${encodeURIComponent(embed.sourceUrl)}`
      : embedTargetUrl;

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F] text-[#F4F5F8]">
      <Navbar />

      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 p-3.5 bg-[#191D29] border border-indigo-500/40 text-indigo-200 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in max-w-sm">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
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
        {/* Top Breadcrumb + Mode Switcher + Dedicated Original Link */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/embeds"
            prefetch
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-[#131620] hover:bg-[#191D29] border border-white/[0.08] px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Embed Videos</span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {/* Switch between Direct Preview & Embed Mode (Embed Mode is always available as fallback) */}
            <div className="flex items-center p-0.5 bg-[#131620] border border-white/[0.08] rounded-lg text-xs">
              {hasDirectPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewStrategyIndex(0);
                    setPreviewError('');
                    setActiveMode('preview');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeMode === 'preview' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Direct Preview</span>
                </button>
              )}
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
            </div>

            {/* Dedicated Original Source link — only opens when user explicitly clicks this button */}
            <a
              href={embed.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131620] hover:bg-[#191D29] border border-white/[0.08] text-slate-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
              title="Open original page in a new tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Original Source</span>
            </a>
          </div>
        </div>

        {/* Player Stage */}
        {activeMode === 'embed' ? (
          <div
            ref={embedContainerRef}
            className={
              isFullscreen
                ? 'w-screen h-screen bg-black flex flex-col overflow-hidden select-none'
                : 'w-full bg-black rounded-xl overflow-hidden border border-white/[0.08] shadow-2xl flex flex-col select-none'
            }
          >
            {/* Bounded Iframe Viewport */}
            <div
              className={
                isFullscreen
                  ? 'relative flex-1 w-full overflow-hidden bg-black flex items-center justify-center'
                  : 'relative w-full aspect-video max-h-[75vh] overflow-hidden bg-black flex items-center justify-center'
              }
            >
              {!embedLoaded && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#090A0F]/95 gap-3 pointer-events-none">
                  <div className="w-9 h-9 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
                  <span className="text-xs font-medium text-slate-300">
                    {embedSubMode === 'proxy'
                      ? `Loading ${embed.platform} in Safe In-App Embed Proxy...`
                      : `Loading ${embed.platform} embed player...`}
                  </span>
                </div>
              )}

              <iframe
                ref={embedIframeRef}
                key={`${embed._id}-${embedSubMode}-${embedKey}`}
                src={activeEmbedIframeSrc}
                onLoad={() => setEmbedLoaded(true)}
                className="w-full h-full max-w-full max-h-full border-0 block"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                {...(embedSubMode === 'proxy' || !officialIframe
                  ? { sandbox: 'allow-scripts allow-same-origin allow-forms allow-presentation' }
                  : {})}
                title={embed.title}
              />
            </div>

            {/* Integrated Player Control Bar for Embed Mode */}
            <div className="bg-[#0C0E15] border-t border-white/[0.08] px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {/* Interactive playback controls wired directly to any HTML5 video inside Safe Proxy Embed */}
                {embedSubMode === 'proxy' && embedVideoState.hasVideo && (
                  <>
                    <button
                      type="button"
                      onClick={() => sendEmbedCmd('togglePlay')}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg font-medium cursor-pointer"
                      aria-label={embedVideoState.paused ? 'Play' : 'Pause'}
                    >
                      {embedVideoState.paused ? (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Pause className="w-3.5 h-3.5" />
                      )}
                      <span>{embedVideoState.paused ? 'Play' : 'Pause'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => sendEmbedCmd('seekBy', -10)}
                      className="p-1.5 bg-[#131620] hover:bg-[#191D29] border border-white/[0.08] text-slate-300 hover:text-white rounded-lg cursor-pointer"
                      title="Back 10s"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => sendEmbedCmd('seekBy', 10)}
                      className="p-1.5 bg-[#131620] hover:bg-[#191D29] border border-white/[0.08] text-slate-300 hover:text-white rounded-lg cursor-pointer"
                      title="Forward 10s"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => sendEmbedCmd('toggleMute')}
                      className="p-1.5 bg-[#131620] hover:bg-[#191D29] border border-white/[0.08] text-slate-300 hover:text-white rounded-lg cursor-pointer"
                      title={embedVideoState.muted ? 'Unmute' : 'Mute'}
                    >
                      {embedVideoState.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    {embedVideoState.duration > 0 && (
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums px-1">
                        {formatTime(embedVideoState.currentTime)} / {formatTime(embedVideoState.duration)}
                      </span>
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setEmbedLoaded(false);
                    setEmbedKey((k) => k + 1);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#131620] hover:bg-[#191D29] text-slate-200 border border-white/[0.08] text-[11px] font-medium cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3 text-indigo-400" />
                  <span>Reload Embed</span>
                </button>

                {/* Manual toggle between Direct Iframe and Safe Proxy Embed fallback */}
                <button
                  type="button"
                  onClick={() => {
                    setEmbedLoaded(false);
                    setEmbedSubMode((m) => (m === 'proxy' ? 'direct' : 'proxy'));
                    setEmbedKey((k) => k + 1);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                    embedSubMode === 'proxy'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-[#131620] hover:bg-[#191D29] border-white/[0.08] text-slate-300'
                  }`}
                  title={
                    embedFrameReason
                      ? `Direct iframe blocked by ${embedFrameReason}; using Safe In-App Proxy`
                      : 'Switch between direct iframe and safe in-app proxy embed'
                  }
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{embedSubMode === 'proxy' ? 'Safe Proxy Active' : 'Try Safe Proxy Fallback'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {hasDirectPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewStrategyIndex(0);
                      setPreviewError('');
                      setActiveMode('preview');
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/35 text-indigo-300 text-[11px] font-semibold cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Direct Preview Ready</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg bg-[#131620] hover:bg-[#191D29] border border-white/[0.08] text-slate-300 hover:text-white cursor-pointer"
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen embed'}
                >
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Direct Preview Player — Strictly Contained Within Player Window */
          <div
            ref={containerRef}
            className={
              isFullscreen
                ? 'relative w-screen h-screen bg-black overflow-hidden flex items-center justify-center select-none'
                : 'relative w-full aspect-video max-h-[75vh] bg-black rounded-xl overflow-hidden border border-white/[0.08] shadow-2xl group flex items-center justify-center select-none'
            }
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
                advancePreviewStrategy();
              }}
              className="w-full h-full max-w-full max-h-full object-contain cursor-pointer block"
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
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 p-4 sm:p-6 text-center">
                <div className="max-w-md bg-[#131620] border border-amber-500/30 rounded-2xl p-5 sm:p-6 space-y-3.5 shadow-2xl">
                  <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-xs text-slate-300 leading-relaxed">{previewError}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMode('embed');
                        setEmbedLoaded(false);
                      }}
                      className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Switch to Embed Mode
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMode('embed');
                        setEmbedSubMode('proxy');
                        setEmbedLoaded(false);
                        setEmbedKey((k) => k + 1);
                      }}
                      className="px-3.5 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Safe Proxy Fallback
                    </button>
                    <button
                      type="button"
                      onClick={handleRefreshMetadata}
                      disabled={isRefreshing}
                      className="px-3.5 py-2 bg-[#191D29] hover:bg-white/[0.08] border border-white/10 text-slate-200 text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      {isRefreshing ? 'Refreshing...' : 'Re-fetch Stream'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Controls Bar — overlaid inside bottom edge */}
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

        {/* Helpful Info Strip */}
        {activeMode === 'embed' && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-[#131620] border border-white/[0.06] rounded-xl text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>
                Playing <strong className="text-slate-200 font-medium">{embed.sourceDomain || embed.platform}</strong> inside Vault
                {embedSubMode === 'proxy' ? ' (Safe Proxy Fallback active)' : ' (Direct Embed)'}.
              </span>
            </span>
            {hasDirectPreview && (
              <button
                type="button"
                onClick={() => {
                  setPreviewStrategyIndex(0);
                  setPreviewError('');
                  setActiveMode('preview');
                }}
                className="text-indigo-300 hover:text-indigo-200 font-semibold whitespace-nowrap cursor-pointer"
              >
                Switch to Direct Preview →
              </button>
            )}
          </div>
        )}

        {/* Client Download Progress Banner */}
        {(downloadProgress || downloadCorsFallbackUrl) && (
          <div className="p-3.5 bg-[#131620] border border-emerald-500/30 rounded-xl space-y-2 text-xs">
            {downloadProgress ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-emerald-300 flex items-center gap-2">
                    <Download className="w-4 h-4 animate-bounce" />
                    <span>{downloadProgress.label}</span>
                  </span>
                  {isDownloadingClient && (
                    <button
                      type="button"
                      onClick={handleClientDownload}
                      className="px-2.5 py-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 text-[11px] font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-150"
                    style={{ width: `${Math.max(5, downloadProgress.percent)}%` }}
                  />
                </div>
              </>
            ) : downloadCorsFallbackUrl ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-slate-300">
                  Remote CDN restricted JS fetch CORS. Save the raw stream file directly from your browser:
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={downloadCorsFallbackUrl}
                    download={sanitizeDownloadFilename(embed.title)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-lg flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Direct CDN Save</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setDownloadCorsFallbackUrl(null)}
                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : null}
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
              {/* Pure Client-Side Download Button */}
              <button
                type="button"
                onClick={handleClientDownload}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  isDownloadingClient
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : hasDirectPreview
                      ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-300'
                      : 'bg-[#191D29] hover:bg-white/[0.08] border-white/[0.08] text-slate-300'
                }`}
                title="Download video directly in your browser (client-side)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isDownloadingClient ? 'Downloading...' : 'Download'}</span>
              </button>

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
