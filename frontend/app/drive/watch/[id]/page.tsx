'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import { api } from '../../../../lib/api';
import { IDriveVideo } from '../../../../types';
import { Navbar } from '../../../../components/Navbar';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  Camera,
  Check,
  Copy,
  ExternalLink,
  ArrowLeft,
  HardDrive,
  RefreshCw,
  Sparkles,
  AlertCircle,
  MonitorPlay,
  Film,
} from 'lucide-react';
import { useBufferedSegments } from '../../../../hooks/useBufferedSegments';

export default function DriveWatchPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { isAuthenticated, isLoading } = useAuth();

  const [video, setVideo] = useState<IDriveVideo | null>(null);
  const [allVideos, setAllVideos] = useState<IDriveVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
  const [useGoogleEmbed, setUseGoogleEmbed] = useState(false);

  // Snapshot / cover state
  const [isSnapping, setIsSnapping] = useState(false);
  const [snapSuccess, setSnapSuccess] = useState('');
  const [snapError, setSnapError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const { bufferedRanges } = useBufferedSegments(videoRef as any);

  // Fetch current video details and sibling videos
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

  // Video event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
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
      // Ignore if user is inside an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10);
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
  }, [duration, isMuted, volume]);

  // Format seconds to mm:ss or hh:mm:ss
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
    if (!bytes || bytes <= 0) return 'Video';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // --- Single 1-Click Frame Capture Feature ---
  // Captures whatever frame is currently displayed on the player,
  // compresses to 480x270 WebP, and saves directly to Backblaze B2 account2!
  const handleSetFrameAsCover = async (seekToTime?: number) => {
    if (!video) return;
    const vidEl = videoRef.current;
    if (!vidEl) {
      setSnapError('Video element not ready.');
      return;
    }

    setIsSnapping(true);
    setSnapSuccess('');
    setSnapError('');

    try {
      // If a specific seek timestamp is requested (e.g. 20s default)
      if (typeof seekToTime === 'number' && !isNaN(seekToTime)) {
        vidEl.currentTime = seekToTime;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            vidEl.removeEventListener('seeked', onSeeked);
            resolve();
          };
          vidEl.addEventListener('seeked', onSeeked);
          setTimeout(resolve, 1500); // safety fallback
        });
      }

      // Draw current video frame to 480x270 canvas (space-optimized)
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 270;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');

      ctx.drawImage(vidEl, 0, 0, 480, 270);

      // Convert to WebP blob (<18KB)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Canvas toBlob conversion failed'));
          },
          'image/webp',
          0.78
        );
      });

      // 1. Get presigned upload URL for B2
      const initRes = await api.initiateDriveThumbnailUpload({
        driveFileId: video.driveFileId,
        filename: `${video.originalFilename.replace(/\.[^/.]+$/, '')}_thumb.webp`,
        mimeType: 'image/webp',
      });

      if (!initRes?.success || !initRes.uploadUrl || !initRes.storageKey) {
        throw new Error('Failed to initiate B2 thumbnail upload.');
      }

      // 2. Upload WebP binary directly to B2 (or proxy)
      const uploadResp = await fetch(initRes.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/webp',
        },
        body: blob,
      });

      if (!uploadResp.ok) {
        throw new Error(`B2 thumbnail upload failed (${uploadResp.status})`);
      }

      // 3. Attach thumbnail to drive video record
      const attachRes = await api.attachDriveThumbnail(video._id, {
        thumbnailKey: initRes.storageKey,
        storageAccount: initRes.storageAccount,
      });
      if (attachRes?.success) {
        setVideo((prev) => (prev ? { ...prev, ...attachRes.video } : null));
        setSnapSuccess(`Cover updated to frame (${formatTime(vidEl.currentTime)}) and saved to Backblaze B2!`);
        setTimeout(() => setSnapSuccess(''), 5000);
      } else {
        throw new Error('Failed to link cover in database.');
      }
    } catch (err: any) {
      console.error('Frame snap error:', err);
      setSnapError(err?.message || 'Could not capture video frame. Try pausing the video and snapping again.');
      setTimeout(() => setSnapError(''), 6000);
    } finally {
      setIsSnapping(false);
    }
  };

  const handleCopyLink = () => {
    if (!video) return;
    const url = video.driveViewUrl || `https://drive.google.com/file/d/${video.driveFileId}/view`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const streamSrc = video ? `/api/drive/videos/${video.driveFileId}/chunk-stream` : '';
  const embedSrc = video ? `https://drive.google.com/file/d/${video.driveFileId}/preview` : '';
  const siblingVideos = allVideos.filter((v) => v._id !== video?._id).slice(0, 8);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-[#090d16] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center text-center">
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Video Unavailable</h2>
          <p className="text-xs text-slate-400 mb-6">{error || 'This video could not be found.'}</p>
          <Link
            href="/drive"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-semibold text-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Drive Videos</span>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Top Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/drive"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-amber-400 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 px-3.5 py-2 rounded-xl transition-all shadow-sm group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Drive Videos</span>
          </Link>

          {/* Engine toggle (Clean & subtle) */}
          <button
            onClick={() => setUseGoogleEmbed(!useGoogleEmbed)}
            title="Toggle between Range Chunk Player and Google Drive Embed"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
          >
            <MonitorPlay className="w-3.5 h-3.5 text-amber-400" />
            <span>{useGoogleEmbed ? 'Use Native Range Player' : 'Use Drive Embed'}</span>
          </button>
        </div>

        {/* Video Player Container */}
        <div
          ref={containerRef}
          className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800/80 shadow-2xl flex flex-col justify-end group select-none"
        >
          {useGoogleEmbed ? (
            <iframe
              src={embedSrc}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen"
              title={video.title}
            />
          ) : (
            <>
              {/* HTML5 Range Chunk Video */}
              <video
                ref={videoRef}
                src={streamSrc}
                preload="metadata"
                playsInline
                onClick={togglePlay}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onWaiting={() => setIsBuffering(true)}
                onPlaying={() => {
                  setIsBuffering(false);
                  setIsPlaying(true);
                }}
                onPause={() => setIsPlaying(false)}
                className="w-full h-full object-contain cursor-pointer"
              />

              {/* Buffering Indicator */}
              {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-20">
                  <div className="w-12 h-12 border-3 border-slate-700 border-t-amber-400 rounded-full animate-spin shadow-2xl" />
                </div>
              )}

              {/* Big Center Play/Pause button on pause */}
              {!isPlaying && !isBuffering && (
                <div
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/25"
                >
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-2xl shadow-amber-400/30 transform hover:scale-105 active:scale-95 transition-all">
                    <Play className="w-8 h-8 fill-black translate-x-0.5" />
                  </div>
                </div>
              )}

              {/* Player Controls Bar */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 sm:p-4 space-y-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                {/* Timeline Progress Scrub Bar with Buffered Ranges */}
                <div className="relative w-full flex items-center h-4 cursor-pointer">
                  {/* Background Track */}
                  <div className="absolute inset-x-0 h-1 bg-slate-800 rounded-full overflow-hidden">
                    {/* Buffered Segments */}
                    {bufferedRanges.map((range, index) => {
                      if (!duration) return null;
                      const left = (range.start / duration) * 100;
                      const width = ((range.end - range.start) / duration) * 100;
                      return (
                        <div
                          key={index}
                          className="absolute h-full bg-slate-600/70"
                          style={{ left: `${left}%`, width: `${width}%` }}
                        />
                      );
                    })}
                    {/* Played Progress */}
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>

                  {/* Range Slider for Interaction */}
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    step="0.1"
                    value={currentTime}
                    onChange={handleSeek}
                    className="absolute inset-x-0 w-full opacity-0 h-4 cursor-pointer z-10"
                  />
                </div>

                {/* Control Buttons Row */}
                <div className="flex items-center justify-between text-white text-xs">
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* Play/Pause */}
                    <button
                      onClick={togglePlay}
                      className="p-1.5 hover:text-amber-400 transition-colors"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                    </button>

                    {/* Volume & Mute */}
                    <div className="flex items-center gap-1.5 group/vol">
                      <button onClick={toggleMute} className="p-1 hover:text-amber-400 transition-colors">
                        {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-14 sm:w-20 h-1 accent-amber-400 bg-slate-700 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Time Display */}
                    <div className="font-mono text-[11px] sm:text-xs text-slate-300 tabular-nums">
                      <span>{formatTime(currentTime)}</span>
                      <span className="text-slate-600 mx-1">/</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Right Controls: Frame Snap, Speed, Fullscreen */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* Single 1-Click Frame Snap Button */}
                    <button
                      onClick={() => handleSetFrameAsCover()}
                      disabled={isSnapping}
                      title={`Set current frame (${formatTime(currentTime)}) as video cover on Backblaze B2`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-md shadow-amber-400/20"
                    >
                      {isSnapping ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                      ) : (
                        <Camera className="w-3.5 h-3.5 text-black" />
                      )}
                      <span className="hidden sm:inline">Set Frame as Cover</span>
                      <span className="sm:hidden">Cover</span>
                    </button>

                    {/* Quick 20s Frame Button if not at 20s */}
                    {Math.abs(currentTime - 20) > 3 && duration >= 20 && (
                      <button
                        onClick={() => handleSetFrameAsCover(20)}
                        disabled={isSnapping}
                        title="Seek to 20 seconds and save that frame as cover"
                        className="hidden md:inline-flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>Snap 20s</span>
                      </button>
                    )}

                    {/* Speed Selector */}
                    <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono">
                      {[1, 1.25, 1.5, 2].map((spd) => (
                        <button
                          key={spd}
                          onClick={() => changeSpeed(spd)}
                          className={`px-1.5 py-0.5 rounded ${
                            playbackSpeed === spd
                              ? 'bg-amber-400 text-black font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>

                    {/* Fullscreen */}
                    <button
                      onClick={toggleFullscreen}
                      className="p-1.5 hover:text-amber-400 transition-colors"
                    >
                      {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Success/Error Toasts */}
        {snapSuccess && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{snapSuccess}</span>
          </div>
        )}
        {snapError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{snapError}</span>
          </div>
        )}

        {/* Clean Video Details & Action Buttons Below Player */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug">
                {video.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                <span>{formatFileSize(video.size)}</span>
                <span className="text-slate-700">·</span>
                <span>{video.originalFilename.split('.').pop()?.toUpperCase() || 'MP4'}</span>
                {video.thumbnailKey && (
                  <>
                    <span className="text-slate-700">·</span>
                    <span className="text-amber-400 flex items-center gap-1 font-sans font-medium">
                      <HardDrive className="w-3 h-3" />
                      <span>Custom B2 Cover Synced</span>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons Below Player */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              {/* Copy Link Button */}
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700/60 transition-all cursor-pointer shadow-sm"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copiedLink ? 'Link Copied' : 'Copy Drive Link'}</span>
              </button>

              {/* Open in Google Drive Button */}
              <a
                href={video.driveViewUrl || `https://drive.google.com/file/d/${video.driveFileId}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700/60 transition-all cursor-pointer shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                <span>Open in Drive</span>
              </a>
            </div>
          </div>
        </div>

        {/* More Drive Videos Suggestions */}
        {siblingVideos.length > 0 && (
          <div className="space-y-3 pt-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Film className="w-4 h-4 text-amber-400" />
              <span>More Drive Videos</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {siblingVideos.map((item) => (
                <Link
                  key={item._id}
                  href={`/drive/watch/${item._id}`}
                  className="group bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-amber-400/50 rounded-xl overflow-hidden transition-all duration-200 flex flex-col"
                >
                  <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
                    {item.thumbnailUrl && (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-9 h-9 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 fill-black ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <h3 className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors line-clamp-1">
                      {item.title}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-400 mt-1">
                      {formatFileSize(item.size)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
