'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { IVideo } from '../types';
import { api } from '../lib/api';
import { useBufferedSegments } from '../hooks/useBufferedSegments';
import { BufferingIndicator } from './BufferingIndicator';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
  RotateCw,
  FastForward,
  Rewind,
  Minimize,
  Sliders,
  EyeOff,
  Lock,
  ArrowLeft,
  Sparkles,
  PictureInPicture,
  Gauge,
} from 'lucide-react';
import Link from 'next/link';

interface VideoPlayerProps {
  video: IVideo;
  streamUrl: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, streamUrl }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { settings, isPrivacyActive, isLocked, togglePrivacyMode, lockApp } = useAuth();
  const bufferingState = useBufferedSegments(videoRef);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration || 0);
  const [volume, setVolume] = useState(settings?.defaultVolume ?? 1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(settings?.defaultPlaybackSpeed ?? 1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [hasRecordedPlay, setHasRecordedPlay] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Double tap feedback state
  const [seekFeedback, setSeekFeedback] = useState<{
    direction: 'left' | 'right';
    timestamp: number;
  } | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPositionRef = useRef<number>(0);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  // Sync fullscreen state changes across all browser variations
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Exit HTML5 fullscreen and pause video whenever Privacy Mode or Panic Lock is activated
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

  const handleTogglePrivacy = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    togglePrivacyMode();
  };

  const handleLockApp = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    lockApp();
  };

  // Resume position initialization
  useEffect(() => {
    if (video.lastPosition && video.lastPosition > 10 && settings?.autoResume !== false) {
      setShowResumePrompt(true);
    }
  }, [video.lastPosition, settings]);

  // Handle Video Metadata Loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.playbackRate = playbackSpeed;

      if (settings?.autoResume && video.lastPosition && !showResumePrompt) {
        videoRef.current.currentTime = video.lastPosition;
      }
    }
  };

  // Always pause playback immediately on tab switch or window minimize
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Play / Pause Toggle
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    resetControlsTimeout();
  }, []);

  const handleDirectSeek = (newTime: number) => {
    const safeTime = Math.max(0, Math.min(duration || 0, newTime));
    setCurrentTime(safeTime);
    if (videoRef.current) {
      videoRef.current.currentTime = safeTime;
    }
    resetControlsTimeout();
  };

  // Skip Control (-10, +10, -30, +30)
  const skip = useCallback((seconds: number) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    resetControlsTimeout();
  }, [duration]);

  // Volume Adjustment
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
    }
    resetControlsTimeout();
  };

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      videoRef.current.volume = 0;
      setIsMuted(true);
    }
    resetControlsTimeout();
  }, [isMuted, volume]);

  // Speed Change
  const changePlaybackSpeed = (speed: number) => {
    const safeSpeed = Math.max(0.25, Math.min(4.0, parseFloat(speed.toFixed(2))));
    setPlaybackSpeed(safeSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = safeSpeed;
    }
    setShowSpeedMenu(false);
    resetControlsTimeout();
  };

  const cyclePlaybackSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    const currentIndex = speeds.findIndex((s) => Math.abs(s - playbackSpeed) < 0.05);
    const nextSpeed = currentIndex === -1 || currentIndex === speeds.length - 1 ? speeds[0] : speeds[currentIndex + 1];
    changePlaybackSpeed(nextSpeed);
  };

  const adjustSpeed = (delta: number) => {
    setPlaybackSpeed((prev) => {
      const newSpeed = Math.max(0.25, Math.min(4.0, parseFloat((prev + delta).toFixed(2))));
      if (videoRef.current) {
        videoRef.current.playbackRate = newSpeed;
      }
      return newSpeed;
    });
    resetControlsTimeout();
  };

  // Fullscreen Toggle with support for mobile safari and Android
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    ) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
      setIsFullscreen(false);
    } else {
      const el = containerRef.current as any;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
      } else if (videoRef.current && (videoRef.current as any).webkitEnterFullscreen) {
        // iOS Safari native fullscreen on video element
        (videoRef.current as any).webkitEnterFullscreen();
      }
      setIsFullscreen(true);
    }
  }, []);

  // Save Progress API Handler
  const saveProgress = useCallback(
    async (pos: number) => {
      if (Math.abs(pos - lastSavedPositionRef.current) < 3) return; // Throttled check
      lastSavedPositionRef.current = pos;
      try {
        await api.updateProgress(video._id, Math.floor(pos), Math.floor(duration));
      } catch (err) {
        console.error('Failed to save playback progress:', err);
      }
    },
    [video._id, duration]
  );

  // Time Update Handler
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);

    // Save progress periodically every ~10s
    if (Math.floor(cur) % 10 === 0) {
      saveProgress(cur);
    }

    // Record Play count after 10s of watching
    if (!hasRecordedPlay && cur >= 10) {
      setHasRecordedPlay(true);
      api.recordPlay(video._id).catch(() => {});
    }
  };

  // Auto-hide Controls after inactivity
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowSpeedMenu(false);
      }
    }, 3500);
  }, [isPlaying]);

  const handleMouseMove = () => {
    resetControlsTimeout();
  };

  // Handle Touch/Click on Video Player (with Double-Tap Detection)
  const handleVideoTouchOrClick = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const now = Date.now();
    const isTouch = 'touches' in e;
    const clientX = isTouch ? (e as React.TouchEvent).changedTouches[0].clientX : (e as React.MouseEvent).clientX;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const width = rect.width;

    const timeDiff = now - lastTapRef.current.time;
    const distDiff = Math.abs(clientX - lastTapRef.current.x);

    // Double tap within 300ms in same area
    if (timeDiff < 320 && distDiff < 60) {
      if (relativeX < width * 0.4) {
        // Double tapped LEFT: -10s
        skip(-10);
        setSeekFeedback({ direction: 'left', timestamp: now });
        setTimeout(() => setSeekFeedback(null), 700);
      } else if (relativeX > width * 0.6) {
        // Double tapped RIGHT: +10s
        skip(10);
        setSeekFeedback({ direction: 'right', timestamp: now });
        setTimeout(() => setSeekFeedback(null), 700);
      } else {
        // Double tapped center: toggle play
        togglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      // Single tap: record for potential double tap & toggle controls overlay
      lastTapRef.current = { time: now, x: clientX };
      setShowControls((prev) => !prev);
      if (!showControls) {
        resetControlsTimeout();
      }
    }
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(e.shiftKey ? -30 : -10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(e.shiftKey ? 30 : 10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume((v) => {
            const nv = Math.min(1, v + 0.1);
            if (videoRef.current) videoRef.current.volume = nv;
            return nv;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume((v) => {
            const nv = Math.max(0, v - 0.1);
            if (videoRef.current) videoRef.current.volume = nv;
            return nv;
          });
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skip, toggleMute, toggleFullscreen]);

  // Save progress on pause or unmount
  useEffect(() => {
    const v = videoRef.current;
    return () => {
      if (v) {
        api.updateProgress(video._id, Math.floor(v.currentTime), Math.floor(v.duration || 0)).catch(() => {});
      }
    };
  }, [video._id]);

  const togglePictureInPicture = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('Picture in Picture error:', e);
    }
  };

  const formatTime = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const resumePositionFormatted = formatTime(video.lastPosition || 0);

  return (
    <div
      ref={containerRef}
      id="video-player-container"
      onMouseMove={handleMouseMove}
      className={`relative w-full aspect-video bg-black rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl group flex flex-col items-center justify-center select-none ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none w-screen h-screen' : ''
      }`}
    >
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        src={streamUrl}
        crossOrigin="anonymous"
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onWaiting={() => setIsWaiting(true)}
        onSeeking={() => setIsWaiting(true)}
        onLoadStart={() => setIsWaiting(true)}
        onLoadedData={() => setIsWaiting(false)}
        onCanPlay={() => setIsWaiting(false)}
        onCanPlayThrough={() => setIsWaiting(false)}
        onPlaying={() => {
          setIsWaiting(false);
          setIsPlaying(true);
        }}
        onSeeked={() => setIsWaiting(false)}
        onPause={() => {
          setIsPlaying(false);
          setIsWaiting(false);
          if (videoRef.current) saveProgress(videoRef.current.currentTime);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setIsWaiting(false);
          if (videoRef.current) saveProgress(videoRef.current.duration);
        }}
        onError={() => setIsWaiting(false)}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
      />

      {/* Invisible Touch Layer over the video for tap & double-tap gestures */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={handleVideoTouchOrClick}
      />

      {/* Double Tap Seek Feedback Ripple Animations */}
      {seekFeedback && (
        <div className="absolute inset-0 z-25 pointer-events-none flex items-center justify-between px-8 sm:px-16">
          {seekFeedback.direction === 'left' && (
            <div className="flex flex-col items-center gap-1 bg-black/70 backdrop-blur-md px-5 py-4 rounded-2xl border border-white/20 text-amber-400 animate-pulse shadow-2xl">
              <RotateCcw className="w-8 h-8 animate-spin-once" />
              <span className="text-sm font-extrabold font-mono tracking-wide">-10s</span>
            </div>
          )}
          <div className="flex-1" />
          {seekFeedback.direction === 'right' && (
            <div className="flex flex-col items-center gap-1 bg-black/70 backdrop-blur-md px-5 py-4 rounded-2xl border border-white/20 text-amber-400 animate-pulse shadow-2xl">
              <RotateCw className="w-8 h-8 animate-spin-once" />
              <span className="text-sm font-extrabold font-mono tracking-wide">+10s</span>
            </div>
          )}
        </div>
      )}

      {/* Center Loading Spinner */}
      {isWaiting && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-white/20 border-t-amber-400 rounded-full animate-spin shadow-2xl" />
        </div>
      )}

      {/* Resume Playback Prompt Banner */}
      {showResumePrompt && (
        <div className="absolute top-4 left-4 right-4 sm:top-6 sm:left-6 sm:right-6 z-30 glass-panel bg-zinc-950/95 p-3 sm:p-4 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-2 shadow-2xl animate-fade-in">
          <div className="flex items-center gap-2 sm:gap-3">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
            <span className="text-xs sm:text-sm font-medium text-white">
              Resume from <span className="font-mono text-amber-300 font-bold">{resumePositionFormatted}</span>?
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (videoRef.current) videoRef.current.currentTime = video.lastPosition;
                setShowResumePrompt(false);
              }}
              className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black text-xs font-extrabold rounded-lg shadow-md active:scale-95"
            >
              Resume
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowResumePrompt(false);
              }}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/70 transition-opacity duration-300 flex flex-col justify-between p-3 sm:p-5 z-20 pointer-events-none ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Header Row */}
        <div className="flex items-center justify-between pointer-events-auto gap-2">
          <Link
            href="/"
            onClick={(e) => e.stopPropagation()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 flex items-center gap-1.5 text-xs font-semibold backdrop-blur-md active:scale-95 shadow-md shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Library</span>
          </Link>

          <h3 className="font-semibold text-xs sm:text-sm text-white line-clamp-1 max-w-[200px] sm:max-w-md text-center px-2">
            {video.title}
          </h3>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePrivacy();
              }}
              title="Privacy Mode (P)"
              className="w-9 h-9 sm:w-9 sm:h-9 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 backdrop-blur-md flex items-center justify-center active:scale-95 shadow-md"
            >
              <EyeOff className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLockApp();
              }}
              title="Panic Lock (Ctrl+Shift+L)"
              className="w-9 h-9 sm:w-9 sm:h-9 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-amber-400 border border-zinc-800 backdrop-blur-md flex items-center justify-center active:scale-95 shadow-md"
            >
              <Lock className="w-4 h-4" />
            </button>
            {/* Top Quick Fullscreen button for mobile ease */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              title="Toggle Fullscreen"
              className="w-9 h-9 sm:w-9 sm:h-9 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-amber-400 border border-zinc-800 backdrop-blur-md flex items-center justify-center active:scale-95 shadow-md sm:hidden"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Center Control Cluster with Large Play/Pause & Thumb Skip Buttons */}
        <div className="self-center flex items-center justify-center gap-6 sm:gap-10 pointer-events-auto my-auto">
          {/* Skip -10s button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              skip(-10);
            }}
            title="Rewind 10 seconds"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-white flex items-center justify-center shadow-xl active:scale-90 transition-transform backdrop-blur-md cursor-pointer"
          >
            <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* Large Center Play / Pause Button */}
          {!isWaiting && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              className="w-14 h-14 sm:w-18 sm:h-18 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 hover:bg-amber-300 transition-all backdrop-blur-md cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-current" />
              ) : (
                <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current translate-x-0.5" />
              )}
            </button>
          )}

          {/* Skip +10s button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              skip(10);
            }}
            title="Forward 10 seconds"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-white flex items-center justify-center shadow-xl active:scale-90 transition-transform backdrop-blur-md cursor-pointer"
          >
            <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Bottom Control Bar */}
        <div
          className="space-y-2 sm:space-y-2.5 pointer-events-auto bg-zinc-950/60 sm:bg-transparent p-2 sm:p-0 rounded-2xl backdrop-blur-sm sm:backdrop-blur-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* YouTube Style Scrubber Bar with Touch Drag Support */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-mono text-[11px] sm:text-xs text-slate-300 min-w-[36px] sm:min-w-[42px] text-right font-medium">
              {formatTime(currentTime)}
            </span>
            <div className="flex-1">
              <BufferingIndicator
                bufferedRanges={bufferingState.bufferedRanges}
                currentTime={currentTime}
                duration={duration || 100}
                percentBuffered={bufferingState.percentBuffered}
                isBuffering={bufferingState.isBuffering}
                onSeek={handleDirectSeek}
                maxBufferAhead={120}
              />
            </div>
            <span className="font-mono text-[11px] sm:text-xs text-slate-400 min-w-[36px] sm:min-w-[42px] font-medium">
              {formatTime(duration)}
            </span>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between gap-1 sm:gap-3 pt-0.5">
            {/* Left Controls: Play/Pause, Skip, Volume */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-slate-200 hover:text-white hover:bg-zinc-800/60 active:scale-95 transition-all"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              {/* Volume / Mute Button & Slider */}
              <div className="flex items-center gap-1.5 group/vol">
                <button
                  onClick={toggleMute}
                  className="w-9 h-9 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-zinc-800/60 active:scale-95"
                  title="Mute / Unmute"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-14 sm:w-20 h-1.5 hidden sm:block accent-amber-400 cursor-pointer"
                  title="Volume slider"
                />
              </div>
            </div>

            {/* Right Controls: Speed Selector, PiP, Fullscreen */}
            <div className="flex items-center gap-1 sm:gap-2 relative">
              {/* Playback Speed Quick Control */}
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu((prev) => !prev)}
                  className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-xs font-mono font-bold flex items-center gap-1 shadow-sm active:scale-95"
                  title="Change Playback Speed"
                >
                  <Gauge className="w-3.5 h-3.5 text-amber-400 hidden xs:inline" />
                  <span>{playbackSpeed.toFixed(1)}x</span>
                </button>

                {/* Speed Dropdown Menu */}
                {showSpeedMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-zinc-900/95 border border-zinc-700 rounded-xl p-1.5 shadow-2xl backdrop-blur-md flex flex-col gap-1 min-w-[110px] z-50 animate-fade-in">
                    <div className="text-[10px] uppercase font-bold text-zinc-400 px-2 py-1 border-b border-zinc-800">
                      Playback Speed
                    </div>
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((s) => (
                      <button
                        key={s}
                        onClick={() => changePlaybackSpeed(s)}
                        className={`px-3 py-1 text-xs text-left font-mono rounded-lg transition-colors flex items-center justify-between ${
                          Math.abs(s - playbackSpeed) < 0.05
                            ? 'bg-amber-400 text-black font-extrabold'
                            : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        <span>{s.toFixed(2)}x</span>
                        {s === 1.0 && <span className="text-[10px] opacity-70">Normal</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Picture-in-Picture Button */}
              <button
                onClick={togglePictureInPicture}
                title="Picture in Picture (Floating window)"
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-xl hidden sm:flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800/60 active:scale-95"
              >
                <PictureInPicture className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Large, Prominent Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)'}
                className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-amber-400/20 hover:bg-amber-400 text-amber-300 hover:text-black border border-amber-400/40 flex items-center justify-center active:scale-95 transition-all shadow-md cursor-pointer ml-1"
              >
                {isFullscreen ? (
                  <Minimize className="w-5 h-5" />
                ) : (
                  <Maximize className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

