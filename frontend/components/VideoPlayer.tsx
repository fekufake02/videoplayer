'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { IVideo } from '../types';
import { api } from '../lib/api';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useBufferedSegments } from '../hooks/useBufferedSegments';
import { BufferingManager, estimateBitrate } from '../lib/bufferingManager';
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
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';

interface VideoPlayerProps {
  video: IVideo;
  streamUrl: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, streamUrl }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const urlRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const bufferingManagerRef = useRef<BufferingManager | null>(null);

  const { settings, isPrivacyActive, isLocked, togglePrivacyMode, lockApp } = useAuth();
  const networkStatus = useNetworkStatus();
  const bufferingState = useBufferedSegments(videoRef);

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

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration || 0);
  const [volume, setVolume] = useState(settings?.defaultVolume ?? 1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(settings?.defaultPlaybackSpeed ?? 1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [hasRecordedPlay, setHasRecordedPlay] = useState(false);
  const [networkWarning, setNetworkWarning] = useState(false);
  const [isBufferingPaused, setIsBufferingPaused] = useState(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPositionRef = useRef<number>(0);
  const lastNetworkSpeedRef = useRef<string>(networkStatus.speed);

  // Initialize buffering manager with detected network speed
  useEffect(() => {
    if (!bufferingManagerRef.current) {
      bufferingManagerRef.current = new BufferingManager(networkStatus.speed);
    } else {
      bufferingManagerRef.current.updateNetworkSpeed(networkStatus.speed);
    }
    lastNetworkSpeedRef.current = networkStatus.speed;
  }, [networkStatus.speed]);

  // Show network warning on slow connections
  useEffect(() => {
    setNetworkWarning(networkStatus.speed === 'slow');
  }, [networkStatus.speed]);

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

  // Handle buffering state - pause if buffer can't keep up
  useEffect(() => {
    if (!videoRef.current || duration === 0) return;

    const shouldPause = bufferingManagerRef.current?.shouldPauseForBuffering(
      bufferingState.totalBuffered,
      currentTime,
      duration
    );

    if (shouldPause && isPlaying && !isBufferingPaused) {
      // Only pause for buffering if video is actually playing
      videoRef.current.pause();
      setIsBufferingPaused(true);
    } else if (!shouldPause && isBufferingPaused && videoRef.current.paused) {
      // Resume when buffer is ready
      videoRef.current.play().catch(() => {});
      setIsBufferingPaused(false);
    }
  }, [bufferingState.totalBuffered, currentTime, duration, isPlaying, isBufferingPaused]);

  // Token refresh - rotate URL every 30 seconds for privacy
  useEffect(() => {
    if (!isPlaying || currentTime < 5) return; // Start after 5 seconds of playback

    urlRefreshIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.refreshStreamUrl(video._id);
        if (res?.streamUrl && videoRef.current) {
          // Update video source without interrupting playback
          const currentPos = videoRef.current.currentTime;
          const wasPlaying = !videoRef.current.paused;

          videoRef.current.src = res.streamUrl;

          if (wasPlaying) {
            videoRef.current.currentTime = currentPos;
            videoRef.current.play().catch(() => {});
          }
        }
      } catch (err) {
        console.error('Failed to refresh stream URL:', err);
      }
    }, 30000); // Refresh every 30 seconds

    return () => {
      if (urlRefreshIntervalRef.current) {
        clearInterval(urlRefreshIntervalRef.current);
      }
    };
  }, [isPlaying, video._id, currentTime]);

  // Play / Pause Toggle
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  // Time Scrubbing
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  // Skip Control (-10, +10, -30, +30)
  const skip = useCallback((seconds: number) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
  }, [duration]);

  // Volume Adjustment
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
    }
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
  }, [isMuted, volume]);

  // Speed Change
  const changePlaybackSpeed = (speed: number) => {
    const safeSpeed = Math.max(0.25, Math.min(4.0, parseFloat(speed.toFixed(2))));
    setPlaybackSpeed(safeSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = safeSpeed;
    }
  };

  const adjustSpeed = (delta: number) => {
    setPlaybackSpeed((prev) => {
      const newSpeed = Math.max(0.25, Math.min(4.0, parseFloat((prev + delta).toFixed(2))));
      if (videoRef.current) {
        videoRef.current.playbackRate = newSpeed;
      }
      return newSpeed;
    });
  };

  // Fullscreen Toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
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
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
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
      onMouseMove={handleMouseMove}
      className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl group flex flex-col items-center justify-center select-none"
    >
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        src={streamUrl}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          setIsPlaying(false);
          if (videoRef.current) saveProgress(videoRef.current.currentTime);
        }}
        onEnded={() => {
          setIsPlaying(false);
          if (videoRef.current) saveProgress(videoRef.current.duration);
        }}
        onClick={togglePlay}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
      />

      {/* Network Warning Badge */}
      {networkWarning && (
        <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-2 bg-orange-950/80 border border-orange-700 rounded-lg backdrop-blur-md animate-pulse">
          <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />
          <span className="text-xs font-medium text-orange-300">Slow network detected</span>
        </div>
      )}

      {/* Buffering Status */}
      {isBufferingPaused && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-3 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
            <span className="text-sm font-medium text-amber-300">Buffering...</span>
          </div>
        </div>
      )}

      {/* Resume Playback Prompt Banner */}
      {showResumePrompt && (
        <div className="absolute top-6 left-6 right-6 z-30 glass-panel bg-zinc-950/90 p-4 rounded-xl border border-white/10 flex items-center justify-between shadow-2xl animate-fade-in">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-medium text-white">
              Resume playback from <span className="font-mono text-amber-300">{resumePositionFormatted}</span>?
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime = video.lastPosition;
                setShowResumePrompt(false);
              }}
              className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-black text-xs font-extrabold rounded-lg shadow-md"
            >
              Resume
            </button>
            <button
              onClick={() => setShowResumePrompt(false)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Hover Controls Overlay */}
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 flex flex-col justify-between p-4 sm:p-6 pointer-events-none ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pointer-events-auto">
          <Link
            href="/"
            className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 flex items-center gap-2 text-xs font-medium backdrop-blur-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Library</span>
          </Link>

          <h3 className="font-semibold text-sm text-white line-clamp-1 max-w-md hidden sm:block">
            {video.title}
          </h3>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTogglePrivacy}
              title="Privacy Mode (P)"
              className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 backdrop-blur-md"
            >
              <EyeOff className="w-4 h-4" />
            </button>
            <button
              onClick={handleLockApp}
              title="Panic Lock (Ctrl+Shift+L)"
              className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-amber-400 border border-zinc-800 backdrop-blur-md"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Big Play Button */}
        <div className="self-center pointer-events-auto">
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-2xl hover:scale-110 hover:bg-amber-300 transition-all backdrop-blur-md"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current translate-x-0.5" />
            )}
          </button>
        </div>

        {/* Bottom Control Bar */}
        <div className="space-y-3 pointer-events-auto">
          {/* Buffering Indicator - YouTube Style Gray Progress */}
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-slate-300 w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <div className="flex-1 flex flex-col gap-1">
              {/* Progress Timeline Scrubber with Buffering Indicator */}
              <BufferingIndicator
                bufferedRanges={bufferingState.bufferedRanges}
                currentTime={currentTime}
                duration={duration || 100}
                percentBuffered={bufferingState.percentBuffered}
                isBuffering={bufferingState.isBuffering}
              />
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1.5 opacity-0 absolute pointer-events-auto"
                style={{
                  width: 'calc(100% - 24px)',
                }}
              />
            </div>
            <span className="font-mono text-xs text-slate-400 w-12">
              {formatTime(duration)}
            </span>
          </div>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* Play/Pause */}
              <button onClick={togglePlay} className="p-2 text-slate-200 hover:text-white">
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              {/* Skip Controls */}
              <button
                onClick={() => skip(-10)}
                title="Skip -10s (Left Arrow)"
                className="p-1.5 text-slate-300 hover:text-white"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => skip(10)}
                title="Skip +10s (Right Arrow)"
                className="p-1.5 text-slate-300 hover:text-white"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => skip(-30)}
                title="Skip -30s (Shift+Left)"
                className="p-1.5 text-slate-300 hover:text-white hidden sm:block"
              >
                <Rewind className="w-4 h-4" />
              </button>
              <button
                onClick={() => skip(30)}
                title="Skip +30s (Shift+Right)"
                className="p-1.5 text-slate-300 hover:text-white hidden sm:block"
              >
                <FastForward className="w-4 h-4" />
              </button>

              {/* Volume Scrubber */}
              <div className="flex items-center gap-2 ml-2">
                <button onClick={toggleMute} className="p-1.5 text-slate-300 hover:text-white">
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 sm:w-20 h-1.5"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Speed Extender (-/+ 0.1x) */}
              <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 rounded-xl px-2 py-1 text-xs text-slate-300 backdrop-blur-md">
                <Sliders className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <button
                  type="button"
                  onClick={() => adjustSpeed(-0.1)}
                  title="Decrease speed by 0.1x"
                  className="w-5 h-5 rounded-md bg-slate-800 hover:bg-indigo-600 text-white font-bold flex items-center justify-center transition-colors"
                >
                  -
                </button>
                <span className="font-mono text-xs text-indigo-300 font-bold min-w-[36px] text-center">
                  {playbackSpeed.toFixed(1)}x
                </span>
                <button
                  type="button"
                  onClick={() => adjustSpeed(0.1)}
                  title="Increase speed by 0.1x"
                  className="w-5 h-5 rounded-md bg-slate-800 hover:bg-indigo-600 text-white font-bold flex items-center justify-center transition-colors"
                >
                  +
                </button>
                <select
                  value={playbackSpeed}
                  onChange={(e) => changePlaybackSpeed(parseFloat(e.target.value))}
                  className="bg-transparent text-slate-400 hover:text-slate-200 text-[11px] font-mono outline-none cursor-pointer border-l border-slate-800 ml-1 pl-1"
                >
                  <option value={0.25} className="bg-slate-900">0.25x</option>
                  <option value={0.5} className="bg-slate-900">0.5x</option>
                  <option value={0.75} className="bg-slate-900">0.75x</option>
                  <option value={1} className="bg-slate-900">1.0x</option>
                  <option value={1.25} className="bg-slate-900">1.25x</option>
                  <option value={1.5} className="bg-slate-900">1.5x</option>
                  <option value={1.75} className="bg-slate-900">1.75x</option>
                  <option value={2} className="bg-slate-900">2.0x</option>
                  <option value={2.5} className="bg-slate-900">2.5x</option>
                  <option value={3} className="bg-slate-900">3.0x</option>
                </select>
              </div>

              {/* Picture-in-Picture Button */}
              <button
                onClick={togglePictureInPicture}
                title="Picture in Picture (Floating window)"
                className="p-2 text-zinc-300 hover:text-white"
              >
                <PictureInPicture className="w-5 h-5" />
              </button>

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                title="Toggle Fullscreen (F)"
                className="p-2 text-zinc-300 hover:text-white"
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
