'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import { api } from '../../../../lib/api';
import { IDriveVideo } from '../../../../types';
import { Navbar } from '../../../../components/Navbar';
import { DriveVideoCard } from '../../../../components/DriveVideoCard';
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
} from 'lucide-react';
import { useBufferedSegments } from '../../../../hooks/useBufferedSegments';
import { BufferingIndicator } from '../../../../components/BufferingIndicator';
import { usePip } from '../../../../context/PipContext';
import { getCachedContactSheet, generateContactSheet } from '../../../../lib/contactSheetGenerator';
import { PlayerSettingsMenu, AspectRatioOption, AudioPreset } from '../../../../components/PlayerSettingsMenu';

type DrivePlaybackPreference = 'auto' | 'native' | 'embed';

export default function DriveWatchPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { isAuthenticated, isLoading, isPrivacyActive, togglePrivacyMode, lockApp } = useAuth();

  const [video, setVideo] = useState<IDriveVideo | null>(null);
  const [allVideos, setAllVideos] = useState<IDriveVideo[]>([]);
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

  // Settings Menu State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('original');
  const [skipInterval, setSkipInterval] = useState<number>(10);
  const [autoPlayNext, setAutoPlayNext] = useState<boolean>(true);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [audioPreset, setAudioPreset] = useState<AudioPreset>('normal');
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(false);

  // Thumbnail Sync State
  const [thumbnailTimestamp, setThumbnailTimestamp] = useState<number>(15);
  const [isSnapping, setIsSnapping] = useState(false);
  const [snapSuccess, setSnapSuccess] = useState('');
  const [snapError, setSnapError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { bufferedRanges, percentBuffered } = useBufferedSegments(videoRef as any);
  const { startFloatingPip } = usePip();

  // Contact Sheet state
  const [contactSheetUrl, setContactSheetUrl] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      const cached = getCachedContactSheet(id);
      if (cached) setContactSheetUrl(cached);
    }
  }, [id]);

  useEffect(() => {
    if (id && !contactSheetUrl && duration > 0 && video?.driveStreamUrl) {
      generateContactSheet(video.driveStreamUrl, duration, id)
        .then((url) => {
          if (url) setContactSheetUrl(url);
        })
        .catch(() => {});
    }
  }, [id, duration, video?.driveStreamUrl, contactSheetUrl]);

  // Sleep timer handler
  useEffect(() => {
    if (!sleepTimer || sleepTimer <= 0) return;
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
        src: video?.driveStreamUrl || '',
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

  // Load video details
  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [detailsRes, listRes] = await Promise.all([
        api.getDriveVideoDetails(id).catch(() => null),
        api.listDriveVideos({ limit: 500 }).catch(() => null),
      ]);

      if (detailsRes?.success && detailsRes.video) {
        setVideo(detailsRes.video);
      } else if (listRes?.success && listRes.videos) {
        const found = listRes.videos.find((v) => v._id === id || v.driveFileId === id);
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
  const handleSwitchPlayer = (targetPlayer: 'native' | 'embed', reason?: string) => {
    const savedTime = videoRef.current ? videoRef.current.currentTime : currentTime;
    const wasPlaying = isPlaying;

    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
    setActivePlayer(targetPlayer);

    if (reason) {
      setSwitchToast(reason);
      setTimeout(() => setSwitchToast(''), 4500);
    }

    if (targetPlayer === 'native') {
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = savedTime;
          if (wasPlaying) {
            videoRef.current.play().catch(() => {});
          }
        }
      }, 300);
    }
  };

  const handlePreferenceChange = (pref: DrivePlaybackPreference) => {
    setPlaybackPreference(pref);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vault_drive_player_pref', pref);
    }
    setShowSourceMenu(false);

    if (pref === 'embed') {
      handleSwitchPlayer('embed', 'Manually switched to Google Drive Preview');
    } else if (pref === 'native') {
      handleSwitchPlayer('native', 'Manually switched to Native Drive Player');
    } else {
      // Auto: prefer native if not already broken
      handleSwitchPlayer('native', 'Automatic player mode active');
    }
  };

  // Video event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (isBuffering) setIsBuffering(false);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
      setIsBuffering(false);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
          resetControlsTimeout();
        })
        .catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowControls(true);
    }
  };

  const handleDirectSeek = (time: number) => {
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    resetControlsTimeout();
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

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    videoRef.current.muted = nextMute;
    if (!nextMute && volume === 0) {
      setVolume(0.8);
      videoRef.current.volume = 0.8;
    }
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - skipInterval);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + skipInterval);
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration, isMuted, volume, skipInterval]);

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

  // Frame Capture / Thumbnail Sync
  const handleCaptureThumbnail = async (targetTimestamp?: number) => {
    if (!video || isSnapping) return;
    const vidEl = videoRef.current;
    if (!vidEl) return;

    setIsSnapping(true);
    setSnapSuccess('');
    setSnapError('');

    try {
      if (typeof targetTimestamp === 'number' && !isNaN(targetTimestamp) && targetTimestamp >= 0) {
        vidEl.currentTime = targetTimestamp;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            vidEl.removeEventListener('seeked', onSeeked);
            resolve();
          };
          vidEl.addEventListener('seeked', onSeeked);
          setTimeout(resolve, 1500);
        });
      }

      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 270;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');

      ctx.drawImage(vidEl, 0, 0, 480, 270);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Canvas conversion failed'));
          },
          'image/webp',
          0.78
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
        setVideo((prev) => (prev ? { ...prev, thumbnailUrl: completeRes.thumbnailUrl } : null));
        setSnapSuccess(`Thumbnail updated at ${formatTime(vidEl.currentTime)}!`);
        setTimeout(() => setSnapSuccess(''), 4000);
      }
    } catch (err: any) {
      console.error('Frame capture error:', err);
      setSnapError(err.message || 'Error capturing frame.');
      setTimeout(() => setSnapError(''), 4000);
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

  const streamSrc = video.driveStreamUrl || `/api/drive/videos/${video.driveFileId}/chunk-stream`;
  const embedSrc = `https://drive.google.com/file/d/${video.driveFileId}/preview`;
  const siblingVideos = allVideos.filter((v) => v._id !== video._id).slice(0, 4);

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
        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => router.push('/drive')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-[#131620] hover:bg-[#191D29] border border-white/[0.07] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Drive Videos</span>
          </button>

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
          <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/[0.07] shadow-2xl">
            <iframe
              src={embedSrc}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen"
              title={video.title}
            />
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
              src={streamSrc}
              poster={video.thumbnailUrl}
              preload="metadata"
              playsInline
              loop={isLooping}
              onClick={togglePlay}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => {
                setIsBuffering(false);
                setIsPlaying(true);
                resetControlsTimeout();
              }}
              onPause={() => {
                setIsPlaying(false);
                setIsBuffering(false);
              }}
              onError={() => {
                if (playbackPreference === 'auto') {
                  handleSwitchPlayer(
                    'embed',
                    'Switched to Google Drive Preview (Codec or range compatibility)'
                  );
                }
              }}
              className={`w-full h-full cursor-pointer transition-all ${
                aspectRatio === 'fill' ? 'object-cover' : 'object-contain'
              }`}
            />

            {/* Buffering Indicator */}
            {isBuffering && isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-30">
                <div className="w-12 h-12 border-3 border-white/20 border-t-indigo-400 rounded-full animate-spin shadow-xl" />
              </div>
            )}

            {/* Center Play/Pause button */}
            {(!isPlaying || showControls) && !(isBuffering && isPlaying) && (
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
                duration={duration > 0 ? duration : 1}
                percentBuffered={percentBuffered}
                isBuffering={isBuffering}
                onSeek={handleDirectSeek}
                contactSheetUrl={contactSheetUrl}
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
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - skipInterval);
                      }
                    }}
                    title={`Rewind ${skipInterval}s`}
                    className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + skipInterval);
                      }
                    }}
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
                      className="w-14 sm:w-18 h-1 accent-indigo-400 bg-zinc-700 rounded-lg cursor-pointer"
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

              {/* Snap Frame Thumbnail Sync */}
              {activePlayer === 'native' && (
                <button
                  type="button"
                  disabled={isSnapping}
                  onClick={() => handleCaptureThumbnail()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#191D29] hover:bg-white/[0.08] border border-white/[0.07] text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  title="Snap current frame as thumbnail"
                >
                  <Camera className={`w-3.5 h-3.5 text-indigo-400 ${isSnapping ? 'animate-pulse' : ''}`} />
                  <span>{isSnapping ? 'Capturing...' : 'Snap Frame'}</span>
                </button>
              )}

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

        {/* Up Next / Sibling Videos Shelf */}
        {siblingVideos.length > 0 && (
          <section className="space-y-3 pt-2">
            <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
              <Cloud className="w-4 h-4 text-indigo-400" />
              <span>More from Google Drive</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {siblingVideos.map((sibling) => (
                <DriveVideoCard key={sibling._id} video={sibling} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
