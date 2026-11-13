'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import { api } from '../../../../lib/api';
import { IDriveVideo } from '../../../../types';
import { Navbar } from '../../../../components/Navbar';
import { DriveVideoCard } from '../../../../components/DriveVideoCard';
import Hls from 'hls.js';
let mpegts: any = null;
if (typeof window !== 'undefined') {
  try {
    mpegts = require('mpegts.js');
  } catch {}
}
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Camera,
  Check,
  ExternalLink,
  ArrowLeft,
  Calendar,
  HardDrive,
  Eye,
  Heart,
  Download,
  AlertCircle,
  Film,
  PictureInPicture,
  Cloud,
  Layers,
  Settings as SettingsIcon,
  Upload,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useBufferedSegments } from '../../../../hooks/useBufferedSegments';
import { BufferingIndicator } from '../../../../components/BufferingIndicator';
import { usePip } from '../../../../context/PipContext';
import { getCachedContactSheet, generateContactSheet } from '../../../../lib/contactSheetGenerator';
import { PlayerSettingsMenu, AspectRatioOption, AudioPreset } from '../../../../components/PlayerSettingsMenu';
import { updateSingleDriveVideoInCache } from '../../../../lib/driveState';
import { SharedVideoCard } from '../../../../components/SharedVideoCard';
import { IVideo } from '../../../../types';
import {
  saveDrivePlaybackProgress,
  getDrivePlaybackProgress,
  getNextVideoInQueue,
  getPrevVideoInQueue,
} from '../../../../lib/collectionsManager';

type DrivePlaybackPreference = 'auto' | 'native' | 'embed';

export default function DriveWatchPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { isAuthenticated, isLoading, isPrivacyActive, isLocked, togglePrivacyMode, lockApp } = useAuth();

  const [video, setVideo] = useState<IDriveVideo | null>(null);
  const [allVideos, setAllVideos] = useState<IDriveVideo[]>([]);
  const [suggestedVideos, setSuggestedVideos] = useState<Array<{ video: any; source: 'drive' | 'vault' }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Intelligent Player Selection State
  const [playbackPreference, setPlaybackPreference] = useState<DrivePlaybackPreference>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('vault_drive_player_pref') as DrivePlaybackPreference) || 'auto';
    }
    return 'auto';
  });
  const [activePlayer, setActivePlayer] = useState<'native' | 'embed'>('native');
  const [switchToast, setSwitchToast] = useState<string>('');
  const [showSourceMenu, setShowSourceMenu] = useState(false);

  // Player state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [nativeError, setNativeError] = useState<string>('');
  const [engineMode, setEngineMode] = useState<'native' | 'hls' | 'mpegts'>('native');
  const [streamNonce, setStreamNonce] = useState<number>(0);
  const [embedLoaded, setEmbedLoaded] = useState<boolean>(false);
  const [embedKey, setEmbedKey] = useState<number>(0);

  const mpegtsPlayerRef = useRef<any>(null);
  const hlsPlayerRef = useRef<any>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const pendingPlayAfterLoadRef = useRef<boolean>(false);
  const isSeekingRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const resumeAppliedForIdRef = useRef<string | null>(null);

  // Settings Menu State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('original');
  const [skipInterval, setSkipInterval] = useState<number>(10);
  const [autoPlayNext, setAutoPlayNext] = useState<boolean>(true);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [audioPreset, setAudioPreset] = useState<AudioPreset>('normal');
  const [sleepTimer, setSleepTimer] = useState<number | 'end' | null>(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(false);

  // Thumbnail Sync State
  const [thumbnailTimestamp, setThumbnailTimestamp] = useState<number>(15);
  const [isSnapping, setIsSnapping] = useState(false);
  const [snapSuccess, setSnapSuccess] = useState('');
  const [snapError, setSnapError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const thumbnailFileInputRef = useRef<HTMLInputElement | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { bufferedRanges, percentBuffered } = useBufferedSegments(videoRef as any);
  const { startFloatingPip } = usePip();

  // Compute safe streaming source for Drive (avoids slow drive.google.com/uc redirects)
  const streamSrc = useMemo(() => {
    if (!video) return '';
    const isDirectCdn =
      video.driveStreamUrl &&
      !video.driveStreamUrl.includes('drive.google.com') &&
      !video.driveStreamUrl.includes('commondatastorage.googleapis.com') &&
      !video.driveStreamUrl.includes('media.w3.org');
    return isDirectCdn
      ? video.driveStreamUrl!
      : `/api/drive/videos/${video.driveFileId}/chunk-stream`;
  }, [video]);

  const toSafeEngineUrl = useCallback((url: string) => {
    if (!url) return url;
    if (url.startsWith('/') || url.startsWith('blob:') || url.startsWith('data:')) {
      return url;
    }
    return `/api/stream-proxy?url=${encodeURIComponent(url)}`;
  }, []);

  const detectDriveEngine = useCallback(
    (url: string): 'native' | 'hls' | 'mpegts' => {
      const lowerUrl = (url || '').toLowerCase();
      const lowerName = (video?.originalFilename || '').toLowerCase();
      const lowerMime = (video?.mimeType || '').toLowerCase();

      if (
        (/\.(m3u8)(\?|$)/.test(lowerUrl) ||
          lowerName.endsWith('.m3u8') ||
          lowerMime.includes('mpegurl')) &&
        Hls &&
        Hls.isSupported()
      ) {
        return 'hls';
      }

      if (
        (/\.(m2?ts|mts|flv)(\?|$)/.test(lowerUrl) ||
          /\.(m2?ts|mts|flv)$/.test(lowerName) ||
          lowerMime.includes('mp2t') ||
          lowerMime.includes('x-flv')) &&
        mpegts &&
        mpegts.isSupported()
      ) {
        return 'mpegts';
      }

      return 'native';
    },
    [video?.originalFilename, video?.mimeType]
  );

  const destroyStreamEngines = useCallback(() => {
    if (mpegtsPlayerRef.current) {
      try {
        mpegtsPlayerRef.current.pause();
        mpegtsPlayerRef.current.unload();
        mpegtsPlayerRef.current.detachMediaElement();
        mpegtsPlayerRef.current.destroy();
      } catch {}
      mpegtsPlayerRef.current = null;
    }
    if (hlsPlayerRef.current) {
      try {
        hlsPlayerRef.current.destroy();
      } catch {}
      hlsPlayerRef.current = null;
    }
  }, []);

  // Contact Sheet state
  const [contactSheetUrl, setContactSheetUrl] = useState<string | null>(null);

  // Reset playback state cleanly on video id navigation
  useEffect(() => {
    destroyStreamEngines();
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setDuration(0);
    setIsPlaying(false);
    setIsBuffering(false);
    setNativeError('');
    setEmbedLoaded(false);
    setEmbedKey(0);
    setStreamNonce(0);
    pendingSeekRef.current = null;
    pendingPlayAfterLoadRef.current = false;
    isSeekingRef.current = false;
    retryCountRef.current = 0;
    resumeAppliedForIdRef.current = null;
    if (id) {
      setContactSheetUrl(getCachedContactSheet(id) || null);
    } else {
      setContactSheetUrl(null);
    }
    return () => {
      destroyStreamEngines();
    };
  }, [id, destroyStreamEngines]);

  // Synchronize preferred engine & saved playback position once video loads
  useEffect(() => {
    if (!video) return;
    setEngineMode(detectDriveEngine(streamSrc));
    if (resumeAppliedForIdRef.current !== video._id) {
      resumeAppliedForIdRef.current = video._id;
      const savedProgress = getDrivePlaybackProgress(video._id) ?? getDrivePlaybackProgress(id);
      const savedPos = savedProgress?.position ?? 0;
      const knownDur = video.duration || savedProgress?.duration || 0;
      if (savedPos > 2 && (!knownDur || savedPos < knownDur - 5)) {
        pendingSeekRef.current = savedPos;
        setCurrentTime(savedPos);
      }
    }
  }, [video, id, streamSrc, detectDriveEngine]);

  useEffect(() => {
    if (id && !contactSheetUrl && duration > 0 && streamSrc) {
      const lowerName = (video?.originalFilename || '').toLowerCase();
      if (/\.(m3u8|ts|m2ts|mts|flv)$/.test(lowerName)) return;
      generateContactSheet(streamSrc, duration, id)
        .then((url) => {
          if (url) setContactSheetUrl(url);
        })
        .catch(() => {});
    }
  }, [id, duration, streamSrc, contactSheetUrl, video?.originalFilename]);

  // Exit fullscreen and pause video whenever Privacy Mode or Panic Lock is activated
  useEffect(() => {
    if (isPrivacyActive || isLocked) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  }, [isPrivacyActive, isLocked]);

  // Attach mpegts.js or hls.js for dynamic/alternate-encoded Drive streams when activePlayer === 'native'
  useEffect(() => {
    if (activePlayer !== 'native' || !streamSrc || !videoRef.current) return;
    const videoEl = videoRef.current;

    if (engineMode === 'native') {
      destroyStreamEngines();
      return;
    }

    destroyStreamEngines();
    let cancelled = false;
    const baseSafeUrl = toSafeEngineUrl(streamSrc);
    const safeUrl =
      streamNonce > 0 && baseSafeUrl.startsWith('/')
        ? `${baseSafeUrl}${baseSafeUrl.includes('?') ? '&' : '?'}r=${streamNonce}`
        : baseSafeUrl;

    const tryResumeMsePlay = (playerInstance?: any) => {
      if (!pendingPlayAfterLoadRef.current || cancelled) return;
      const playTarget = playerInstance || videoEl;
      const playPromise = playTarget.play?.();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            if (!cancelled) {
              pendingPlayAfterLoadRef.current = false;
              setIsPlaying(true);
              setIsBuffering(false);
              setNativeError('');
            }
          })
          .catch((err: any) => {
            if (err?.name === 'AbortError') return;
            if (err?.name === 'NotAllowedError' && videoEl) {
              videoEl.muted = true;
              setIsMuted(true);
              videoEl
                .play()
                .then(() => {
                  if (!cancelled) {
                    pendingPlayAfterLoadRef.current = false;
                    setIsPlaying(true);
                    setIsBuffering(false);
                  }
                })
                .catch(() => {});
            }
          });
      }
    };

    if (engineMode === 'hls' && Hls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        backBufferLength: 90,
        maxBufferLength: 30,
      });
      hls.loadSource(safeUrl);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        setNativeError('');
        setIsBuffering(false);
        if (pendingSeekRef.current !== null && isFinite(pendingSeekRef.current)) {
          try {
            videoEl.currentTime = pendingSeekRef.current;
          } catch {}
          pendingSeekRef.current = null;
        }
        tryResumeMsePlay(videoEl);
      });
      hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
        if (cancelled || !data?.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else if (playbackPreference === 'auto') {
          handleSwitchPlayer('embed', 'Switched to Google Drive Preview player');
        } else {
          setNativeError('Stream playback error. Try reloading or switching to Google Drive Preview.');
        }
      });
      hlsPlayerRef.current = hls;
    } else if (engineMode === 'mpegts' && mpegts && mpegts.isSupported()) {
      const lowerMime = (video?.mimeType || '').toLowerCase();
      const lowerName = (video?.originalFilename || '').toLowerCase();
      const lowerUrl = (streamSrc || '').toLowerCase();
      const isFlv = lowerMime.includes('flv') || lowerName.endsWith('.flv') || lowerUrl.includes('.flv');
      const isM2ts = /\.(m2ts|mts)$/.test(lowerName) || /\.(m2ts|mts)(\?|$)/.test(lowerUrl);
      const player = mpegts.createPlayer(
        {
          type: isFlv ? 'flv' : (isM2ts ? 'm2ts' : 'mpegts'),
          isLive: false,
          url: safeUrl,
          filesize: video?.size && video.size > 0 ? video.size : undefined,
          duration: video?.duration && video.duration > 0 ? Math.floor(video.duration * 1000) : undefined,
        },
        {
          enableStashBuffer: true,
          stashInitialSize: 512,
          accurateSeek: true,
          seekType: 'range',
          autoCleanupSourceBuffer: true,
          rangeLoadZeroStart: true,
          reuseRedirectedURL: true,
        }
      );
      player.attachMediaElement(videoEl);
      player.load();
      player.on(mpegts.Events.MEDIA_INFO, (info: any) => {
        if (cancelled) return;
        setIsBuffering(false);
        setNativeError('');
        if (info?.duration && isFinite(info.duration) && info.duration > 0) {
          setDuration(info.duration / 1000);
        }
        if (pendingSeekRef.current !== null && isFinite(pendingSeekRef.current)) {
          const target = pendingSeekRef.current;
          pendingSeekRef.current = null;
          try {
            player.currentTime = target;
          } catch {
            try {
              videoEl.currentTime = target;
            } catch {}
          }
        }
        tryResumeMsePlay(player);
      });
      player.on(mpegts.Events.ERROR, () => {
        if (cancelled) return;
        if (retryCountRef.current < 2) {
          retryCountRef.current += 1;
          if (currentTimeRef.current > 0.5) {
            pendingSeekRef.current = currentTimeRef.current;
          }
          pendingPlayAfterLoadRef.current = isPlaying || pendingPlayAfterLoadRef.current;
          setIsBuffering(true);
          setTimeout(() => {
            if (!cancelled) setStreamNonce((n) => n + 1);
          }, 400);
          return;
        }
        if (playbackPreference === 'auto') {
          destroyStreamEngines();
          setActivePlayer('embed');
          setSwitchToast('Switched to Google Drive Preview player for codec compatibility');
          setTimeout(() => setSwitchToast(''), 4500);
        } else {
          setIsBuffering(false);
          setNativeError('Unable to decode this stream in Native player. Try Google Drive Preview or download.');
        }
      });
      mpegtsPlayerRef.current = player;
      if (pendingPlayAfterLoadRef.current) {
        tryResumeMsePlay(player);
      }
    }

    return () => {
      cancelled = true;
      destroyStreamEngines();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayer, engineMode, streamSrc, streamNonce, destroyStreamEngines, toSafeEngineUrl]);

  // Sleep timer handler
  useEffect(() => {
    if (!sleepTimer || typeof sleepTimer !== 'number' || sleepTimer <= 0) return;
    const timer = setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      setSleepTimer(null);
    }, sleepTimer * 60 * 1000);
    return () => clearTimeout(timer);
  }, [sleepTimer]);

  const togglePictureInPicture = async () => {
    if (!videoRef.current) return;
    try {
      if (typeof document !== 'undefined' && document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      if (typeof document !== 'undefined' && document.pictureInPictureEnabled && typeof videoRef.current.requestPictureInPicture === 'function') {
        try {
          await videoRef.current.requestPictureInPicture();
          return;
        } catch (e) {
          console.warn('Native PiP not granted:', e);
        }
      }
      startFloatingPip({
        id: video?._id || id,
        title: video?.title || 'Drive Video',
        src: streamSrc || video?.driveStreamUrl || '',
        poster: video?.thumbnailUrl,
        currentTime: videoRef.current.currentTime || currentTime,
        duration: duration || video?.duration || 0,
        isPlaying: !videoRef.current.paused,
        isDrive: true,
      });
    } catch (err) {
      console.warn('PiP error:', err);
    }
  };

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (showControls && isPlaying) {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [showControls, isPlaying]);

  // Load video details and 8 blended suggestions from Drive + B2 Vault
  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [detailsRes, listRes, vaultListRes] = await Promise.all([
        api.getDriveVideoDetails(id).catch(() => null),
        api.listDriveVideos({ limit: 500 }).catch(() => null),
        api.listVideos({ limit: 40 }).catch(() => null),
      ]);

      if (detailsRes?.success && detailsRes.video) {
        setVideo(detailsRes.video);
      } else if (listRes?.success && listRes.videos) {
        const found = listRes.videos.find((v: IDriveVideo) => v._id === id || v.driveFileId === id);
        if (found) {
          setVideo(found);
        } else {
          setError('Video not found.');
        }
      } else {
        setError('Could not load Google Drive video details.');
      }

      if (listRes?.success && listRes.videos) {
        setAllVideos(listRes.videos);
      }

      // Generate 8 random suggested videos from both Google Drive and B2 Vault
      const drivePool: Array<{ video: any; source: 'drive' | 'vault' }> = (listRes?.videos || [])
        .filter((v: IDriveVideo) => v._id !== id && v.driveFileId !== id)
        .map((v: IDriveVideo) => ({ video: v, source: 'drive' as const }));

      const vaultPool: Array<{ video: any; source: 'drive' | 'vault' }> = (vaultListRes?.videos || [])
        .map((v: IVideo) => ({ video: v, source: 'vault' as const }));

      const combinedPool = [...drivePool, ...vaultPool];
      // Randomly shuffle combined items
      for (let i = combinedPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combinedPool[i], combinedPool[j]] = [combinedPool[j], combinedPool[i]];
      }
      setSuggestedVideos(combinedPool.slice(0, 8));
    } catch (err: any) {
      console.error('Failed to load drive video:', err);
      setError(err?.message || 'Failed to load video.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (isAuthenticated) {
      loadData();
    }
  }, [id, isAuthenticated, isLoading, router, loadData]);

  // Intelligent Player Switching
  const handleSwitchPlayer = useCallback(
    (targetPlayer: 'native' | 'embed', reason?: string) => {
      const savedTime = videoRef.current ? videoRef.current.currentTime : currentTimeRef.current;
      const wasPlaying = isPlaying;

      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch {}
      }
      setIsPlaying(false);
      setIsBuffering(false);
      setNativeError('');

      if (targetPlayer === 'embed') {
        destroyStreamEngines();
        setEmbedLoaded(false);
        setEmbedKey((k) => k + 1);
      } else {
        if (savedTime > 0) {
          pendingSeekRef.current = savedTime;
        }
        pendingPlayAfterLoadRef.current = wasPlaying;
      }

      setActivePlayer(targetPlayer);

      if (reason) {
        setSwitchToast(reason);
        setTimeout(() => setSwitchToast(''), 4500);
      }
    },
    [isPlaying, destroyStreamEngines]
  );

  const handlePreferenceChange = (pref: DrivePlaybackPreference) => {
    setPlaybackPreference(pref);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vault_drive_player_pref', pref);
    }
    setShowSourceMenu(false);
    retryCountRef.current = 0;

    if (pref === 'embed') {
      handleSwitchPlayer('embed', 'Switched to Google Drive Preview');
    } else if (pref === 'native') {
      setEngineMode(detectDriveEngine(streamSrc));
      handleSwitchPlayer('native', 'Switched to Native Drive Player');
    } else {
      setEngineMode(detectDriveEngine(streamSrc));
      handleSwitchPlayer('native', 'Automatic player mode active');
    }
  };

  // Unified clamped seek helper (used by scrub bar, skip buttons, and keyboard shortcuts)
  const seekToTime = useCallback(
    (time: number) => {
      const el = videoRef.current;
      const maxDur =
        el && el.duration && isFinite(el.duration) && el.duration > 0
          ? el.duration
          : duration > 0
          ? duration
          : video?.duration || 0;
      const clamped = maxDur > 0 ? Math.max(0, Math.min(time, maxDur)) : Math.max(0, time);
      setCurrentTime(clamped);
      currentTimeRef.current = clamped;
      setNativeError('');

      if (el?.error) {
        pendingSeekRef.current = clamped;
        pendingPlayAfterLoadRef.current = isPlaying;
        retryCountRef.current = 0;
        setIsBuffering(true);
        setStreamNonce((n) => n + 1);
        if (engineMode === 'native') {
          el.load();
        }
        resetControlsTimeout();
        return;
      }

      if (!el || el.readyState < 1) {
        pendingSeekRef.current = clamped;
      } else {
        pendingSeekRef.current = null;
        if (mpegtsPlayerRef.current) {
          setIsBuffering(true);
          try {
            mpegtsPlayerRef.current.currentTime = clamped;
          } catch {
            try {
              el.currentTime = clamped;
            } catch {
              pendingSeekRef.current = clamped;
            }
          }
        } else {
          try {
            el.currentTime = clamped;
          } catch {
            pendingSeekRef.current = clamped;
          }
        }
      }
      resetControlsTimeout();
    },
    [duration, video?.duration, resetControlsTimeout, isPlaying, engineMode]
  );

  const handleSkipBy = useCallback(
    (deltaSeconds: number) => {
      const base = videoRef.current?.seeking
        ? currentTimeRef.current
        : mpegtsPlayerRef.current && isFinite(mpegtsPlayerRef.current.currentTime)
        ? mpegtsPlayerRef.current.currentTime
        : videoRef.current && isFinite(videoRef.current.currentTime)
        ? videoRef.current.currentTime
        : currentTimeRef.current;
      seekToTime(base + deltaSeconds);
    },
    [seekToTime]
  );

  // Video event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);
      currentTimeRef.current = cur;
      if (isBuffering && !isSeekingRef.current) setIsBuffering(false);
      if (!videoRef.current.error && videoRef.current.readyState >= 3) {
        retryCountRef.current = 0;
      }
      if (id && Math.floor(cur) % 5 === 0) {
        saveDrivePlaybackProgress(id, cur, videoRef.current.duration || duration || 0);
      }
    }
  };

  // Stall recovery: only auto-switch if truly stalled (not actively seeking) for >12s
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (
      isBuffering &&
      isPlaying &&
      activePlayer === 'native' &&
      playbackPreference === 'auto' &&
      !isSeekingRef.current
    ) {
      timer = setTimeout(() => {
        const el = videoRef.current;
        if (
          el &&
          !el.paused &&
          !el.seeking &&
          !isSeekingRef.current &&
          el.readyState < 3 &&
          playbackPreference === 'auto'
        ) {
          handleSwitchPlayer(
            'embed',
            'Switched to Google Drive Preview player for smoother playback'
          );
        }
      }, 12000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isBuffering, isPlaying, activePlayer, playbackPreference, handleSwitchPlayer]);

  const applyPendingRestore = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (pendingSeekRef.current !== null && el.readyState >= 1) {
      const target = pendingSeekRef.current;
      pendingSeekRef.current = null;
      const maxDur = el.duration && isFinite(el.duration) ? el.duration : target;
      const clamped = Math.max(0, Math.min(target, maxDur));
      try {
        el.currentTime = clamped;
        setCurrentTime(clamped);
        currentTimeRef.current = clamped;
      } catch {}
    }
    if (pendingPlayAfterLoadRef.current) {
      pendingPlayAfterLoadRef.current = false;
      el.play()
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
        })
        .catch(() => {});
    }
  }, []);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur && isFinite(dur) ? dur : video?.duration || 0);
      videoRef.current.muted = isMuted;
      videoRef.current.volume = isMuted ? 0 : volume > 0 ? volume : 1;
      videoRef.current.playbackRate = playbackSpeed;
      try {
        (videoRef.current as any).preservesPitch = true;
      } catch {}
      setIsBuffering(false);
      setNativeError('');
      retryCountRef.current = 0;
      applyPendingRestore();
    }
  };

  const handleRetryNativeStream = useCallback(() => {
    const resumeAt = currentTimeRef.current;
    if (resumeAt > 0) pendingSeekRef.current = resumeAt;
    pendingPlayAfterLoadRef.current = true;
    retryCountRef.current = 0;
    setNativeError('');
    setIsBuffering(true);
    setStreamNonce((n) => n + 1);
    if (engineMode === 'native' && videoRef.current) {
      videoRef.current.load();
    }
  }, [engineMode]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.error || nativeError) {
      handleRetryNativeStream();
      return;
    }
    setNativeError('');
    if (el.paused) {
      if (!isMuted) {
        el.muted = false;
        el.volume = volume > 0 ? volume : 1;
      }
      pendingPlayAfterLoadRef.current = true;
      const playPromise = mpegtsPlayerRef.current ? mpegtsPlayerRef.current.play() : el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            pendingPlayAfterLoadRef.current = false;
            setIsPlaying(true);
            setIsBuffering(false);
            resetControlsTimeout();
          })
          .catch((err: any) => {
            if (err?.name === 'AbortError') return;
            if (err?.name === 'NotAllowedError') {
              el.muted = true;
              setIsMuted(true);
              el.play()
                .then(() => {
                  pendingPlayAfterLoadRef.current = false;
                  setIsPlaying(true);
                  setIsBuffering(false);
                  resetControlsTimeout();
                })
                .catch(() => {});
            }
          });
      }
    } else {
      pendingPlayAfterLoadRef.current = false;
      if (mpegtsPlayerRef.current) {
        mpegtsPlayerRef.current.pause();
      } else {
        el.pause();
      }
      setIsPlaying(false);
      setShowControls(true);
    }
  }, [isMuted, volume, nativeError, resetControlsTimeout, handleRetryNativeStream]);

  const handleNativeVideoError = useCallback(() => {
    const el = videoRef.current;
    const mediaError = el?.error;
    // Ignore benign abort errors emitted while seeking or changing source
    if (mediaError?.code === 1) {
      return;
    }

    const resumeAt = currentTimeRef.current || el?.currentTime || 0;

    // Retry transient network or chunk-seek decode errors up to 2 times before escalating
    if ((mediaError?.code === 2 || mediaError?.code === 3) && retryCountRef.current < 2 && el) {
      retryCountRef.current += 1;
      if (resumeAt > 0) pendingSeekRef.current = resumeAt;
      pendingPlayAfterLoadRef.current = isPlaying;
      setIsBuffering(true);
      setTimeout(() => {
        setStreamNonce((n) => n + 1);
      }, 350);
      return;
    }

    // If dynamic TS/FLV stream not yet using mpegts, try mpegts engine first
    const lowerName = (video?.originalFilename || '').toLowerCase();
    const lowerMime = (video?.mimeType || '').toLowerCase();
    if (
      engineMode === 'native' &&
      mpegts &&
      mpegts.isSupported() &&
      (/\.(m2?ts|mts|flv)$/.test(lowerName) || lowerMime.includes('mp2t') || lowerMime.includes('x-flv'))
    ) {
      if (resumeAt > 0) pendingSeekRef.current = resumeAt;
      pendingPlayAfterLoadRef.current = isPlaying;
      setEngineMode('mpegts');
      return;
    }

    if (playbackPreference === 'auto') {
      handleSwitchPlayer(
        'embed',
        'Switched to Google Drive Preview (Codec or range compatibility)'
      );
    } else {
      setIsPlaying(false);
      setIsBuffering(false);
      setNativeError(
        mediaError?.code === 4
          ? 'This video codec or container could not be decoded natively in this browser. Switch to Google Drive Preview or Download.'
          : 'Drive stream interrupted. Retry stream or switch to Google Drive Preview.'
      );
    }
  }, [video?.originalFilename, video?.mimeType, engineMode, playbackPreference, isPlaying, handleSwitchPlayer]);

  const handleDirectSeek = (time: number) => {
    seekToTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
  };

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    videoRef.current.muted = nextMute;
    if (!nextMute && volume === 0) {
      setVolume(0.8);
      videoRef.current.volume = 0.8;
    }
  }, [isMuted, volume]);

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Always keep latest shortcut callbacks fresh
  const keyHandlersRef = useRef({
    togglePlay,
    handleSkipBy,
    toggleFullscreen,
    toggleMute,
    skipInterval,
    activePlayer,
  });
  keyHandlersRef.current = {
    togglePlay,
    handleSkipBy,
    toggleFullscreen,
    toggleMute,
    skipInterval,
    activePlayer,
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      const h = keyHandlersRef.current;
      if (h.activePlayer !== 'native') return;

      if (e.code === 'Space') {
        e.preventDefault();
        h.togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        h.handleSkipBy(-h.skipInterval);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        h.handleSkipBy(h.skipInterval);
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        h.toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        h.toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Frame Capture / Thumbnail Sync (works in both native and embed modes)
  const handleCaptureThumbnail = async (targetTimestamp?: number) => {
    if (!video || isSnapping) return;

    setIsSnapping(true);
    setSnapSuccess('');
    setSnapError('');

    let offscreenVideo: HTMLVideoElement | null = null;
    try {
      let vidEl = videoRef.current;
      const effectiveTime =
        typeof targetTimestamp === 'number'
          ? targetTimestamp
          : vidEl && !isNaN(vidEl.currentTime) && vidEl.currentTime > 0
          ? vidEl.currentTime
          : thumbnailTimestamp || currentTime || 5;

      // In Google Drive preview/embed mode or when native video element is not ready,
      // instantiate an offscreen video element using chunk-stream to seek and snap
      if (!vidEl || activePlayer === 'embed') {
        offscreenVideo = document.createElement('video');
        offscreenVideo.crossOrigin = 'anonymous';
        offscreenVideo.muted = true;
        offscreenVideo.preload = 'auto';
        offscreenVideo.src = `/api/drive/videos/${video.driveFileId}/chunk-stream`;

        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 8000);
          offscreenVideo!.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };
          offscreenVideo!.onerror = () => {
            clearTimeout(timeout);
            resolve();
          };
        });

        offscreenVideo.currentTime = effectiveTime;
        await new Promise<void>((resolve) => {
          const seekTimeout = setTimeout(resolve, 3500);
          offscreenVideo!.onseeked = () => {
            clearTimeout(seekTimeout);
            resolve();
          };
        });

        vidEl = offscreenVideo;
      } else if (vidEl && typeof targetTimestamp === 'number' && !isNaN(targetTimestamp) && targetTimestamp >= 0) {
        const seekEl = vidEl;
        seekEl.currentTime = targetTimestamp;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            seekEl.removeEventListener('seeked', onSeeked);
            resolve();
          };
          seekEl.addEventListener('seeked', onSeeked);
          setTimeout(resolve, 1500);
        });
      }

      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 270;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');
      if (!vidEl) throw new Error('Video element not ready for frame capture');

      ctx.drawImage(vidEl, 0, 0, 480, 270);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Canvas conversion failed'));
          },
          'image/webp',
          0.82
        );
      });

      const initRes = await api.initiateDriveThumbnailUpload({
        driveFileId: video.driveFileId,
        filename: `${video.originalFilename.replace(/\.[^/.]+$/, '')}_thumb.webp`,
        mimeType: 'image/webp',
      });

      if (!initRes?.success || !initRes.uploadUrl || !initRes.storageKey) {
        throw new Error('Failed to initiate thumbnail upload.');
      }

      const upRes = await fetch(initRes.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/webp' },
        body: blob,
      });

      if (!upRes.ok) {
        throw new Error('Direct upload to storage failed.');
      }

      const completeRes = await api.completeDriveThumbnailUpload({
        id: video._id,
        driveFileId: video.driveFileId,
        storageKey: initRes.storageKey,
        storageAccount: initRes.storageAccount,
      });

      if (completeRes?.success && completeRes.thumbnailUrl) {
        const updated = { ...video, thumbnailUrl: completeRes.thumbnailUrl };
        setVideo(updated);
        updateSingleDriveVideoInCache(updated);
        setSnapSuccess(`Thumbnail captured at ${formatTime(effectiveTime)}!`);
        setTimeout(() => setSnapSuccess(''), 4500);
      }
    } catch (err: any) {
      console.error('Frame capture error:', err);
      setSnapError(err.message || 'Error capturing frame. Try custom upload below.');
      setTimeout(() => setSnapError(''), 5000);
    } finally {
      if (offscreenVideo) {
        offscreenVideo.src = '';
        offscreenVideo.remove();
      }
      setIsSnapping(false);
    }
  };

  const handleUploadCustomThumbnail = async (file: File) => {
    if (!video || !file) return;
    setIsSnapping(true);
    setSnapSuccess('');
    setSnapError('');
    try {
      const initRes = await api.initiateDriveThumbnailUpload({
        driveFileId: video.driveFileId,
        filename: `${video.originalFilename.replace(/\.[^/.]+$/, '')}_custom.webp`,
        mimeType: file.type || 'image/webp',
      });
      if (!initRes?.success || !initRes.uploadUrl || !initRes.storageKey) {
        throw new Error('Failed to initiate thumbnail upload.');
      }
      const upRes = await fetch(initRes.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/webp' },
        body: file,
      });
      if (!upRes.ok) throw new Error('Direct upload to storage failed.');
      const completeRes = await api.completeDriveThumbnailUpload({
        id: video._id,
        driveFileId: video.driveFileId,
        storageKey: initRes.storageKey,
        storageAccount: initRes.storageAccount,
      });
      if (completeRes?.success && completeRes.thumbnailUrl) {
        const updated = { ...video, thumbnailUrl: completeRes.thumbnailUrl };
        setVideo(updated);
        updateSingleDriveVideoInCache(updated);
        setSnapSuccess('Custom thumbnail uploaded!');
        setTimeout(() => setSnapSuccess(''), 4500);
      }
    } catch (err: any) {
      setSnapError(err.message || 'Error uploading custom thumbnail.');
      setTimeout(() => setSnapError(''), 5000);
    } finally {
      setIsSnapping(false);
    }
  };

  const handleDownload = async () => {
    if (!video) return;
    setIsDownloading(true);
    try {
      const a = document.createElement('a');
      a.href = `/api/drive/videos/${video.driveFileId}/chunk-stream`;
      a.download = video.originalFilename || 'video.mp4';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
      }, 150);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090A0F] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-[#F4F5F8] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-[1500px] w-full mx-auto px-4 py-8 space-y-6">
          <div className="aspect-video bg-[#131620] border border-white/[0.07] rounded-xl flex items-center justify-center animate-pulse">
            <div className="w-10 h-10 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-[#F4F5F8] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-16 text-center">
          <div className="bg-[#131620] border border-white/[0.07] rounded-2xl p-8 shadow-2xl flex flex-col items-center">
            <AlertCircle className="w-10 h-10 text-rose-400 mb-3" />
            <h2 className="text-base font-semibold text-white mb-2">Video Unavailable</h2>
            <p className="text-xs text-slate-400 mb-6">{error || 'Could not load Google Drive file.'}</p>
            <Link
              href="/drive"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Drive Media</span>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const embedSrc = `https://drive.google.com/file/d/${video.driveFileId}/preview`;
  const effectiveNativeSrc =
    streamNonce > 0 && engineMode === 'native' && streamSrc
      ? `${streamSrc}${streamSrc.includes('?') ? '&' : '?'}r=${streamNonce}`
      : streamSrc;
  const siblingVideos = allVideos.filter((v) => v._id !== video._id).slice(0, 4);
  const nextVideo = getNextVideoInQueue(video._id, allVideos);
  const prevVideo = getPrevVideoInQueue(video._id, allVideos);

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F] text-[#F4F5F8] font-sans">
      <Navbar />

      {/* Switch Player Toast Notification */}
      {switchToast && (
        <div className="fixed bottom-6 right-6 z-50 p-3.5 bg-[#191D29] border border-indigo-500/40 text-indigo-300 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>{switchToast}</span>
        </div>
      )}

      <main className="flex-1 max-w-[1500px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Top Header Row with Prefetched Fast Return */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/drive"
            prefetch
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-[#131620] hover:bg-[#191D29] border border-white/[0.07] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Drive Media</span>
          </Link>

          {/* Intelligent Player Source Selector */}
          <div className="relative">
            <button
              onClick={() => setShowSourceMenu((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131620] hover:bg-[#191D29] border border-white/[0.07] rounded-lg text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              title="Change Drive Playback Engine"
            >
              <Cloud className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                {activePlayer === 'native' ? 'Native Drive Player' : 'Google Drive Preview'}
              </span>
              <span className="text-[10px] text-slate-400">({playbackPreference})</span>
            </button>

            {showSourceMenu && (
              <div
                onMouseLeave={() => setShowSourceMenu(false)}
                className="absolute right-0 top-full mt-1.5 w-60 bg-[#191D29] border border-white/[0.08] rounded-xl py-1 shadow-2xl text-xs z-50 animate-fade-in text-slate-200"
              >
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-white/[0.05]">
                  Playback Engine
                </div>
                <button
                  onClick={() => handlePreferenceChange('auto')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.06] transition-colors ${
                    playbackPreference === 'auto' ? 'text-indigo-300 font-semibold' : ''
                  }`}
                >
                  <div>
                    <div>Automatic</div>
                    <div className="text-[10px] text-slate-400">Auto-detects codec & falls back</div>
                  </div>
                  {playbackPreference === 'auto' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                </button>
                <button
                  onClick={() => handlePreferenceChange('native')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.06] transition-colors ${
                    playbackPreference === 'native' ? 'text-indigo-300 font-semibold' : ''
                  }`}
                >
                  <div>
                    <div>Native Drive Player</div>
                    <div className="text-[10px] text-slate-400">HTTP range streaming with full controls</div>
                  </div>
                  {playbackPreference === 'native' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                </button>
                <button
                  onClick={() => handlePreferenceChange('embed')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.06] transition-colors ${
                    playbackPreference === 'embed' ? 'text-indigo-300 font-semibold' : ''
                  }`}
                >
                  <div>
                    <div>Google Drive Preview</div>
                    <div className="text-[10px] text-slate-400">Official Drive iframe preview player</div>
                  </div>
                  {playbackPreference === 'embed' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Video Player Container */}
        {activePlayer === 'embed' ? (
          /* Google Drive Embedded Preview Player */
          <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/[0.07] shadow-2xl group">
            {!embedLoaded && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#090A0F]/90 gap-3 pointer-events-none">
                <div className="w-10 h-10 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
                <span className="text-xs font-medium text-slate-400">
                  Loading Google Drive Preview...
                </span>
              </div>
            )}
            <iframe
              key={`${video.driveFileId}-${embedKey}`}
              src={embedSrc}
              onLoad={() => setEmbedLoaded(true)}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              title={video.title}
            />
            {/* Compact quick-switch & reload bar */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => {
                  setEmbedLoaded(false);
                  setEmbedKey((k) => k + 1);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/80 hover:bg-black text-slate-200 hover:text-white border border-white/10 text-[11px] font-medium backdrop-blur-md transition-colors cursor-pointer"
                title="Reload Google Drive Preview"
              >
                <RefreshCw className="w-3 h-3 text-indigo-400" />
                <span>Reload Preview</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchPlayer('native', 'Switched to Native Drive Player')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/80 hover:bg-black text-slate-200 hover:text-white border border-white/10 text-[11px] font-medium backdrop-blur-md transition-colors cursor-pointer"
                title="Switch back to Native Player"
              >
                <Cloud className="w-3 h-3 text-indigo-400" />
                <span>Native Player</span>
              </button>
            </div>
          </div>
        ) : (
          /* Native HTML5 Chunk Range Video Player */
          <div
            ref={containerRef}
            onMouseMove={resetControlsTimeout}
            className={`relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/[0.07] shadow-2xl flex flex-col justify-end group select-none ${
              aspectRatio === 'fill' ? 'object-cover' : 'object-contain'
            }`}
          >
            <video
              ref={videoRef}
              src={engineMode === 'native' ? effectiveNativeSrc : undefined}
              poster={video.thumbnailUrl}
              preload="auto"
              muted={isMuted}
              playsInline
              loop={isLooping}
              onClick={togglePlay}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onCanPlay={() => {
                isSeekingRef.current = false;
                setIsBuffering(false);
                applyPendingRestore();
              }}
              onSeeking={() => {
                isSeekingRef.current = true;
                setIsBuffering(true);
              }}
              onSeeked={() => {
                isSeekingRef.current = false;
                setIsBuffering(false);
              }}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => {
                isSeekingRef.current = false;
                retryCountRef.current = 0;
                setIsBuffering(false);
                setIsPlaying(true);
                setNativeError('');
                resetControlsTimeout();
              }}
              onPause={() => {
                setIsPlaying(false);
                setIsBuffering(false);
              }}
              onError={handleNativeVideoError}
              className={`w-full h-full cursor-pointer transition-all ${
                aspectRatio === 'fill' ? 'object-cover' : 'object-contain'
              }`}
            />

            {/* Native Playback Error / Recovery Overlay */}
            {nativeError && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6 text-center animate-fade-in">
                <div className="max-w-md w-full bg-[#131620] border border-amber-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
                  <div className="w-11 h-11 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-white">Drive Stream Playback Issue</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{nativeError}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleRetryNativeStream}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Stream</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchPlayer('embed', 'Switched to Google Drive Preview')}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#191D29] hover:bg-white/[0.08] border border-white/[0.08] text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Cloud className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Use Drive Preview</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#191D29] hover:bg-white/[0.08] border border-white/[0.08] text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Buffering Indicator */}
            {isBuffering && isPlaying && !nativeError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-30">
                <div className="w-12 h-12 border-[3px] border-white/20 border-t-indigo-400 rounded-full animate-spin shadow-xl" />
              </div>
            )}

            {/* Center Play/Pause button */}
            {!nativeError && (!isPlaying || showControls) && !(isBuffering && isPlaying) && (
              <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none animate-fade-in">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                  className="w-14 h-14 rounded-full bg-indigo-500 hover:bg-indigo-400 text-white flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all pointer-events-auto cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 fill-current translate-x-0.5" />
                  )}
                </button>
              </div>
            )}

            {/* Player Controls Bar */}
            <div
              className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 sm:p-4 space-y-2 z-40 transition-opacity duration-200 ${
                showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              {/* Timeline Progress Scrub Bar with Buffering Indicator & Contact Sheet Hover Preview */}
              <BufferingIndicator
                bufferedRanges={bufferedRanges}
                currentTime={currentTime}
                duration={duration > 0 ? duration : video?.duration || 0}
                percentBuffered={percentBuffered}
                isBuffering={isBuffering}
                onSeek={handleDirectSeek}
                contactSheetUrl={contactSheetUrl}
                videoSrc={streamSrc}
                thumbnailUrl={video?.thumbnailUrl}
              />

              {/* Control Buttons Row */}
              <div className="flex items-center justify-between text-white text-xs">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={togglePlay}
                    className="p-1 hover:text-indigo-400 transition-colors cursor-pointer"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>

                  <button
                    onClick={() => handleSkipBy(-skipInterval)}
                    title={`Rewind ${skipInterval}s`}
                    className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleSkipBy(skipInterval)}
                    title={`Forward ${skipInterval}s`}
                    className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>

                  {/* Volume Slider */}
                  <div className="flex items-center gap-1.5 group/vol">
                    <button onClick={toggleMute} className="p-1 hover:text-indigo-400 transition-colors cursor-pointer">
                      {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-14 sm:w-[72px] h-1 accent-indigo-400 bg-zinc-700 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Time Display */}
                  <div className="font-mono text-[11px] sm:text-xs text-slate-300 tabular-nums">
                    <span>{formatTime(currentTime)}</span>
                    <span className="text-zinc-600 mx-1">/</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Right Controls */}
                <div className="flex items-center gap-2 relative">
                  {/* Picture-in-Picture */}
                  <button
                    onClick={togglePictureInPicture}
                    className="p-1.5 text-slate-300 hover:text-indigo-400 transition-colors cursor-pointer"
                    title="Picture in Picture"
                  >
                    <PictureInPicture className="w-4 h-4" />
                  </button>

                  {/* Settings Trigger */}
                  <div className="relative">
                    <button
                      onClick={() => setIsSettingsOpen((prev) => !prev)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isSettingsOpen ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
                      }`}
                      title="Playback Settings"
                    >
                      <SettingsIcon className={`w-4 h-4 ${isSettingsOpen ? 'rotate-45' : ''} transition-transform`} />
                    </button>

                    <PlayerSettingsMenu
                      isOpen={isSettingsOpen}
                      onClose={() => setIsSettingsOpen(false)}
                      playbackSpeed={playbackSpeed}
                      onPlaybackSpeedChange={(spd) => changeSpeed(spd)}
                      skipInterval={skipInterval}
                      onSkipIntervalChange={(sec) => setSkipInterval(sec)}
                      autoPlayNext={autoPlayNext}
                      onAutoPlayNextToggle={() => setAutoPlayNext((prev) => !prev)}
                      isLooping={isLooping}
                      onLoopToggle={() => setIsLooping((prev) => !prev)}
                      aspectRatio={aspectRatio}
                      onAspectRatioChange={(ratio) => setAspectRatio(ratio)}
                      audioPreset={audioPreset}
                      onAudioPresetChange={(p) => setAudioPreset(p)}
                      sleepTimer={sleepTimer}
                      onSleepTimerChange={(t) => setSleepTimer(t)}
                      subtitlesEnabled={subtitlesEnabled}
                      onSubtitlesToggle={() => setSubtitlesEnabled((prev) => !prev)}
                      videoInfo={{
                        filename: video.originalFilename || video.title,
                        format: video.mimeType?.split('/')[1]?.toUpperCase() || 'MP4',
                        resolution: 'Google Drive Stream',
                        fileSize: formatFileSize(video.size),
                        duration: formatTime(duration),
                        source: 'Google Drive',
                        status: isBuffering ? 'Buffering' : isPlaying ? 'Playing' : 'Active & Synced',
                      }}
                      onTogglePictureInPicture={togglePictureInPicture}
                      onTogglePrivacyMode={togglePrivacyMode}
                      onPanicLock={lockApp}
                    />
                  </div>

                  {/* Fullscreen */}
                  <button
                    onClick={toggleFullscreen}
                    className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Fullscreen"
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Video Information & Metadata Section */}
        <div className="bg-[#131620] border border-white/[0.07] p-4 sm:p-6 rounded-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-white/[0.07]">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Google Drive
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {video.driveFileId}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {video.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 mt-2 tabular-nums">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  {formatDate(video.createdAt)}
                </span>
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                  {formatFileSize(video.size)}
                </span>
              </div>
            </div>

            {/* Action Buttons Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              {snapSuccess && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-medium rounded-lg animate-fade-in">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{snapSuccess}</span>
                </div>
              )}
              {snapError && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-medium rounded-lg animate-fade-in">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>{snapError}</span>
                </div>
              )}

              {/* Snap Frame Thumbnail Sync (Available in both Native and Embed modes) */}
              <button
                type="button"
                disabled={isSnapping}
                onClick={() => handleCaptureThumbnail()}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#191D29] hover:bg-white/[0.08] border border-white/[0.07] text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                title="Snap frame as thumbnail (works with both Native and Drive Preview)"
              >
                <Camera className={`w-3.5 h-3.5 text-indigo-400 ${isSnapping ? 'animate-pulse' : ''}`} />
                <span>{isSnapping ? 'Capturing...' : 'Snap Frame'}</span>
              </button>

              {/* Upload Custom Thumbnail Button & Hidden File Input */}
              <input
                ref={thumbnailFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadCustomThumbnail(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={isSnapping}
                onClick={() => thumbnailFileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#191D29] hover:bg-white/[0.08] border border-white/[0.07] text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                title="Upload custom image file as thumbnail"
              >
                <Upload className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Upload Thumb</span>
              </button>

              {/* Download */}
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#191D29] hover:bg-white/[0.08] border border-white/[0.07] text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isDownloading ? 'Preparing...' : 'Download'}</span>
              </button>

              {/* Open in Drive */}
              <a
                href={video.driveViewUrl || `https://drive.google.com/file/d/${video.driveFileId}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-[#191D29] hover:bg-white/[0.08] border border-white/[0.07] text-slate-200 text-xs font-medium rounded-lg transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                <span>Open in Drive</span>
              </a>
            </div>
          </div>
        </div>

        {/* Up Next / 8 Random Suggested Videos Shelf (Drive + Vault) */}
        {suggestedVideos.length > 0 && (
          <section className="space-y-3 pt-2">
            <h3 className="text-sm font-semibold text-white tracking-tight flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Recommended Videos</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                8 suggestions from Drive & Vault
              </span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {suggestedVideos.map((item) => (
                <SharedVideoCard
                  key={`${item.source}-${item.video._id}`}
                  video={item.video}
                  sourceType={item.source}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
