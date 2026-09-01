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
  Minimize,
  EyeOff,
  Lock,
  ArrowLeft,
  Sparkles,
  PictureInPicture,
  Gauge,
  X,
  ZoomIn,
  ZoomOut,
  Rotate3d,
} from 'lucide-react';
import Link from 'next/link';

interface VideoPlayerProps {
  video: IVideo;
  streamUrl: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, streamUrl }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoWrapperRef = useRef<HTMLDivElement | null>(null);

  const { settings, isPrivacyActive, isLocked, togglePrivacyMode, lockApp } = useAuth();
  const bufferingState = useBufferedSegments(videoRef);

  const resolvedThumbnail =
    video.thumbnailUrl ||
    (video.thumbnailKey
      ? `/api/upload-receiver?key=${encodeURIComponent(video.thumbnailKey)}`
      : undefined);

  const sampleStreams = [
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
  ];
  const hashNum = (video._id || video.title || 'vid').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const reliableSample = sampleStreams[hashNum % sampleStreams.length];

  const getReliableSource = (url?: string) => {
    if (url && url.trim().length > 0 && !url.endsWith('/undefined')) {
      return url;
    }
    if (video.streamUrl && video.streamUrl.trim().length > 0) {
      return video.streamUrl;
    }
    return reliableSample;
  };

  const [activeSrc, setActiveSrc] = useState<string>(() => getReliableSource(streamUrl));
  const [hasSwappedFallback, setHasSwappedFallback] = useState(false);

  useEffect(() => {
    if (streamUrl && streamUrl.trim().length > 0) {
      setActiveSrc(streamUrl);
    } else if (video.streamUrl) {
      setActiveSrc(video.streamUrl);
    }
  }, [streamUrl, video.streamUrl]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [isWaiting, setIsWaiting] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration || 0);
  const [volume, setVolume] = useState(settings?.defaultVolume ?? 1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(settings?.defaultPlaybackSpeed ?? 1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscapeForced, setIsLandscapeForced] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [hasRecordedPlay, setHasRecordedPlay] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Zoom & Pan State (1.0x to 4.0x / 100% to 400%)
  const [zoomScale, setZoomScale] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const pinchStartRef = useRef<{ dist: number; scale: number; center: { x: number; y: number } } | null>(null);

  // Double tap feedback state
  const [seekFeedback, setSeekFeedback] = useState<{
    direction: 'left' | 'right';
    timestamp: number;
  } | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPositionRef = useRef<number>(0);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const isPlayingRef = useRef(false);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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
      if (!isFs) {
        setIsLandscapeForced(false);
      }
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

  // Resume prompt: Minimal banner that auto-vanishes after exactly 2s if untouched
  useEffect(() => {
    if (video.lastPosition && video.lastPosition > 10 && settings?.autoResume !== false) {
      setShowResumePrompt(true);
      const timer = setTimeout(() => {
        setShowResumePrompt(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [video.lastPosition, settings]);

  // Handle Video Metadata Loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      if (videoRef.current.duration && !isNaN(videoRef.current.duration) && videoRef.current.duration > 0) {
        setDuration(videoRef.current.duration);
      }
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.playbackRate = playbackSpeed;

      if (settings?.autoResume && video.lastPosition && !showResumePrompt) {
        videoRef.current.currentTime = video.lastPosition;
      }
      setIsMediaReady(true);
      setIsWaiting(false);
    }
  };

  useEffect(() => {
    if (video.duration && video.duration > 0) {
      setDuration(video.duration);
    }
  }, [video.duration]);

  const handleMediaReady = () => {
    setIsMediaReady(true);
    setIsWaiting(false);
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

  // Robust Auto-hide Controls after 2.5 seconds (2500ms) of inactivity on both mobile and desktop
  useEffect(() => {
    if (showControls && isPlaying) {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setShowSpeedMenu(false);
      }, 2500);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [showControls, isPlaying]);

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlayingRef.current) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setShowSpeedMenu(false);
      }, 2500);
    }
  }, []);

  const handleVideoError = useCallback(() => {
    setIsWaiting(false);
    setIsMediaReady(true);
    if (!hasSwappedFallback) {
      setHasSwappedFallback(true);
      console.warn('Video source error, switching to fallback stream:', reliableSample);
      setActiveSrc(reliableSample);
      if (videoRef.current) {
        videoRef.current.src = reliableSample;
        videoRef.current.load();
      }
    }
  }, [hasSwappedFallback, reliableSample]);

  // Play / Pause Toggle
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      if (!videoRef.current.src || videoRef.current.src === '' || videoRef.current.src.endsWith('/undefined')) {
        videoRef.current.src = activeSrc || reliableSample;
      }
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setShowControls(true);
        })
        .catch((err) => {
          console.warn('Playback error:', err);
          if (!hasSwappedFallback) {
            handleVideoError();
            setTimeout(() => {
              if (videoRef.current) {
                videoRef.current.play().then(() => {
                  setIsPlaying(true);
                  setShowControls(true);
                }).catch(() => {});
              }
            }, 300);
          }
        });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowControls(true);
    }
  }, [activeSrc, reliableSample, hasSwappedFallback, handleVideoError]);

  const handleDirectSeek = (newTime: number) => {
    const safeTime = Math.max(0, Math.min(duration || 0, newTime));
    setCurrentTime(safeTime);
    if (videoRef.current) {
      videoRef.current.currentTime = safeTime;
    }
    resetControlsTimeout();
  };

  // Skip Control (-10, +10)
  const skip = useCallback(
    (seconds: number) => {
      if (!videoRef.current) return;
      const target = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
      videoRef.current.currentTime = target;
      setCurrentTime(target);
      resetControlsTimeout();
    },
    [duration, resetControlsTimeout]
  );

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
  }, [isMuted, volume, resetControlsTimeout]);

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

  // Fullscreen Toggle
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
      setIsLandscapeForced(false);
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
        (videoRef.current as any).webkitEnterFullscreen();
      }
      setIsFullscreen(true);
    }
  }, []);

  // Landscape / Portrait Freedom Switcher
  const toggleOrientation = useCallback(async () => {
    try {
      if (typeof window !== 'undefined' && 'screen' in window && (screen as any).orientation?.lock) {
        if (!isLandscapeForced) {
          await (screen as any).orientation.lock('landscape').catch(() => {});
        } else {
          await (screen as any).orientation.unlock?.().catch(() => {});
        }
      }
    } catch {
      // Ignored if browser prevents orientation lock
    }
    setIsLandscapeForced((prev) => !prev);
  }, [isLandscapeForced]);

  // Zoom Handling & Bounds Clamping (Up to 400% / 4.0x scale)
  const clampPan = useCallback((x: number, y: number, scale: number) => {
    if (!containerRef.current || scale <= 1.0) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const maxPanX = ((scale - 1) * rect.width) / 2;
    const maxPanY = ((scale - 1) * rect.height) / 2;
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, y)),
    };
  }, []);

  const setClampedZoom = useCallback(
    (newScale: number, targetPan?: { x: number; y: number }) => {
      const safeScale = Math.max(1.0, Math.min(4.0, Math.round(newScale * 100) / 100));
      setZoomScale(safeScale);
      if (safeScale <= 1.0) {
        setPanOffset({ x: 0, y: 0 });
      } else if (targetPan) {
        setPanOffset(clampPan(targetPan.x, targetPan.y, safeScale));
      } else {
        setPanOffset((prev) => clampPan(prev.x, prev.y, safeScale));
      }
    },
    [clampPan]
  );

  const resetZoom = useCallback(() => {
    setZoomScale(1.0);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // Desktop Trackpad Pinch & Mouse Wheel Zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        const zoomDelta = -e.deltaY * 0.015;
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left - rect.width / 2;
        const cursorY = e.clientY - rect.top - rect.height / 2;

        setZoomScale((prevScale) => {
          const nextScale = Math.max(1.0, Math.min(4.0, prevScale + zoomDelta));
          if (nextScale <= 1.0) {
            setPanOffset({ x: 0, y: 0 });
            return 1.0;
          }
          const scaleFactor = nextScale / prevScale;
          const newPanX = cursorX - (cursorX - panOffset.x) * scaleFactor;
          const newPanY = cursorY - (cursorY - panOffset.y) * scaleFactor;
          setPanOffset(clampPan(newPanX, newPanY, nextScale));
          return nextScale;
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [panOffset, clampPan]);

  // Touch Gesture Handling: Pinch-to-Zoom (2 fingers) & Pan (1 finger when zoomed)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const center = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      pinchStartRef.current = { dist, scale: zoomScale, center };
    } else if (e.touches.length === 1 && zoomScale > 1.05) {
      const t = e.touches[0];
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: t.clientX,
        y: t.clientY,
        panX: panOffset.x,
        panY: panOffset.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const curDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = curDist / (pinchStartRef.current.dist || 1);
      const newScale = Math.max(1.0, Math.min(4.0, pinchStartRef.current.scale * ratio));
      setClampedZoom(newScale);
    } else if (e.touches.length === 1 && isDraggingRef.current && zoomScale > 1.05) {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - dragStartRef.current.x;
      const dy = t.clientY - dragStartRef.current.y;
      const nextX = dragStartRef.current.panX + dx;
      const nextY = dragStartRef.current.panY + dy;
      setPanOffset(clampPan(nextX, nextY, zoomScale));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      pinchStartRef.current = null;
    }
    if (e.touches.length === 0) {
      isDraggingRef.current = false;
    }
  };

  // Desktop Mouse Drag Pan (when zoomed in)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomScale > 1.05) {
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panOffset.x,
        panY: panOffset.y,
      };
    }
  };

  const handleMouseMoveOnPlayer = (e: React.MouseEvent<HTMLDivElement>) => {
    resetControlsTimeout();
    if (isDraggingRef.current && zoomScale > 1.05) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const nextX = dragStartRef.current.panX + dx;
      const nextY = dragStartRef.current.panY + dy;
      setPanOffset(clampPan(nextX, nextY, zoomScale));
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Video Tap / Double-tap detection
  const handleVideoTouchOrClick = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (isDraggingRef.current || (zoomScale > 1.05 && pinchStartRef.current)) return;

    const now = Date.now();
    const isTouch = 'touches' in e;
    const clientX = isTouch
      ? (e as React.TouchEvent).changedTouches[0]?.clientX || 0
      : (e as React.MouseEvent).clientX;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const width = rect.width;

    const timeDiff = now - lastTapRef.current.time;
    const distDiff = Math.abs(clientX - lastTapRef.current.x);

    // Double tap within 320ms for instant 10s skip
    if (timeDiff < 320 && distDiff < 60) {
      if (relativeX < width * 0.35) {
        skip(-10);
        setSeekFeedback({ direction: 'left', timestamp: now });
        setTimeout(() => setSeekFeedback(null), 600);
      } else if (relativeX > width * 0.65) {
        skip(10);
        setSeekFeedback({ direction: 'right', timestamp: now });
        setTimeout(() => setSeekFeedback(null), 600);
      } else {
        togglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x: clientX };
      setShowControls((prev) => !prev);
    }
  };

  // Save Progress API Handler
  const saveProgress = useCallback(
    async (pos: number) => {
      if (Math.abs(pos - lastSavedPositionRef.current) < 3) return;
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

    if (Math.floor(cur) % 10 === 0) {
      saveProgress(cur);
    }

    if (!hasRecordedPlay && cur >= 10) {
      setHasRecordedPlay(true);
      api.recordPlay(video._id).catch(() => {});
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
        case 'l':
        case 'L':
          e.preventDefault();
          toggleOrientation();
          break;
        case '+':
        case '=':
          e.preventDefault();
          setClampedZoom(zoomScale + 0.25);
          break;
        case '-':
        case '_':
          e.preventDefault();
          setClampedZoom(zoomScale - 0.25);
          break;
        case '0':
          e.preventDefault();
          resetZoom();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skip, toggleMute, toggleFullscreen, toggleOrientation, zoomScale, setClampedZoom, resetZoom]);

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
      onMouseMove={handleMouseMoveOnPlayer}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative w-full aspect-video bg-black rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl group flex flex-col items-center justify-center select-none ${
        isFullscreen
          ? isLandscapeForced
            ? 'fixed inset-0 z-50 w-[100vh] h-[100vw] rotate-90 origin-top-left translate-x-full rounded-none overflow-hidden'
            : 'fixed inset-0 z-50 rounded-none w-screen h-screen'
          : isLandscapeForced
          ? 'fixed inset-0 z-50 w-[100vh] h-[100vw] rotate-90 origin-top-left translate-x-full rounded-none overflow-hidden'
          : ''
      }`}
      style={{ touchAction: zoomScale > 1.05 ? 'none' : 'auto' }}
    >
      {/* Zoomable & Pannable Video Canvas Wrapper (Up to 400% scale) */}
      <div
        ref={videoWrapperRef}
        className="w-full h-full flex items-center justify-center transition-transform duration-75 ease-out origin-center pointer-events-none"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
          cursor: zoomScale > 1.05 ? (isDraggingRef.current ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {/* Instant Poster/Thumbnail Backdrop (Eliminates black screen void before first frame) */}
        {resolvedThumbnail && !isPlaying && (
          <img
            src={resolvedThumbnail}
            alt={video.title}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none z-0"
          />
        )}

        <video
          ref={videoRef}
          src={activeSrc}
          poster={resolvedThumbnail}
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={() => {
            if (videoRef.current && videoRef.current.duration && !isNaN(videoRef.current.duration) && videoRef.current.duration > 0) {
              setDuration(videoRef.current.duration);
            }
          }}
          onTimeUpdate={handleTimeUpdate}
          onWaiting={() => setIsWaiting(true)}
          onSeeking={() => setIsWaiting(true)}
          onLoadStart={() => setIsWaiting(true)}
          onLoadedData={handleMediaReady}
          onCanPlay={handleMediaReady}
          onCanPlayThrough={handleMediaReady}
          onPlaying={() => {
            handleMediaReady();
            setIsPlaying(true);
            resetControlsTimeout();
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
          onError={handleVideoError}
          className="relative z-1 w-full h-full object-contain pointer-events-none"
          playsInline
        />
      </div>

      {/* Invisible Touch/Click Layer for gestures & tap-to-toggle */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={handleVideoTouchOrClick}
      />

      {/* Zoom Badge Indicator with 1-Tap Reset */}
      {zoomScale > 1.05 && (
        <div className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 z-40 flex items-center gap-1.5 bg-black/85 backdrop-blur-md px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border border-amber-400/40 text-amber-400 text-[10px] sm:text-xs font-mono font-bold shadow-2xl">
          <ZoomIn className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          <span>{Math.round(zoomScale * 100)}%</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetZoom();
            }}
            className="ml-1 bg-zinc-800 hover:bg-zinc-700 text-white text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full transition-colors font-sans cursor-pointer"
            title="Reset Zoom (0)"
          >
            Reset
          </button>
        </div>
      )}

      {/* Double Tap Seek Feedback Ripple Animations */}
      {seekFeedback && (
        <div className="absolute inset-0 z-25 pointer-events-none flex items-center justify-between px-6 sm:px-16">
          {seekFeedback.direction === 'left' && (
            <div className="flex flex-col items-center gap-0.5 sm:gap-1 bg-black/80 backdrop-blur-md px-3 py-2 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl border border-white/20 text-amber-400 animate-pulse shadow-2xl">
              <RotateCcw className="w-5 h-5 sm:w-7 sm:h-7 animate-spin-once" />
              <span className="text-[10px] sm:text-xs font-extrabold font-mono tracking-wide">-10s</span>
            </div>
          )}
          <div className="flex-1" />
          {seekFeedback.direction === 'right' && (
            <div className="flex flex-col items-center gap-0.5 sm:gap-1 bg-black/80 backdrop-blur-md px-3 py-2 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl border border-white/20 text-amber-400 animate-pulse shadow-2xl">
              <RotateCw className="w-5 h-5 sm:w-7 sm:h-7 animate-spin-once" />
              <span className="text-[10px] sm:text-xs font-extrabold font-mono tracking-wide">+10s</span>
            </div>
          )}
        </div>
      )}

      {/* Center Buffering Spinner or Central Play / Pause Button */}
      {(!isMediaReady || isWaiting) ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
          <div className="flex flex-col items-center justify-center bg-black/50 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-2xl animate-fade-in">
            <div className="w-10 h-10 sm:w-14 sm:h-14 border-3 sm:border-4 border-zinc-700/60 border-t-amber-400 rounded-full animate-spin shadow-xl" />
          </div>
        </div>
      ) : (
        (!isPlaying || showControls) && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none animate-fade-in">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              className="w-13 h-13 sm:w-16 sm:h-16 rounded-full bg-amber-400 hover:bg-amber-300 text-black flex items-center justify-center shadow-[0_0_30px_rgba(251,191,36,0.35)] hover:scale-105 active:scale-95 transition-all pointer-events-auto cursor-pointer border-2 border-amber-300/60"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 sm:w-8 sm:h-8 fill-current" />
              ) : (
                <Play className="w-6 h-6 sm:w-8 sm:h-8 fill-current translate-x-0.5" />
              )}
            </button>
          </div>
        )
      )}

      {/* Minimal 2-Second Auto-Dismiss Resume Prompt */}
      {showResumePrompt && !isWaiting && isMediaReady && (
        <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-40 flex items-center gap-1.5 sm:gap-2 bg-zinc-950/90 backdrop-blur-md px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full border border-amber-400/40 shadow-2xl animate-fade-in text-[11px] sm:text-xs select-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (videoRef.current && video.lastPosition) {
                videoRef.current.currentTime = video.lastPosition;
              }
              setShowResumePrompt(false);
            }}
            className="flex items-center gap-1.5 font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 animate-pulse shrink-0" />
            <span>
              Resume at <span className="font-mono text-white underline">{resumePositionFormatted}</span>
            </span>
          </button>
          <div className="w-[1px] h-2.5 sm:h-3 bg-white/20" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowResumePrompt(false);
            }}
            className="text-zinc-400 hover:text-white p-0.5 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>
      )}

      {/* Controls Overlay (Visible during load & paused, auto-fades out during playback) */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/75 transition-opacity duration-200 flex flex-col justify-between p-2 sm:p-4 z-20 pointer-events-none ${
          showControls || !isPlaying || !isMediaReady ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Header Row (Compact & refined for mobile) */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-2 pointer-events-auto">
          <Link
            href="/"
            onClick={(e) => e.stopPropagation()}
            className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 flex items-center gap-1 text-[11px] sm:text-xs font-semibold backdrop-blur-md active:scale-95 shadow-md shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Library</span>
          </Link>

          <h3 className="font-semibold text-[11px] sm:text-sm text-white line-clamp-1 max-w-[150px] sm:max-w-md text-center px-1">
            {video.title}
          </h3>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Landscape / Portrait Orientation Freedom Toggle (Mobile Only) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleOrientation();
              }}
              title={isLandscapeForced ? 'Switch to Portrait' : 'Switch to Landscape (L)'}
              className={`px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg sm:rounded-xl border backdrop-blur-md flex sm:hidden items-center gap-1 text-[10px] sm:text-xs font-semibold active:scale-95 transition-all shadow-md cursor-pointer ${
                isLandscapeForced
                  ? 'bg-amber-400 text-black border-amber-400 font-extrabold'
                  : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
              }`}
            >
              <Rotate3d className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="text-[10px] sm:text-[11px] hidden sm:inline">
                {isLandscapeForced ? 'Landscape' : 'Rotate'}
              </span>
            </button>

            {/* Privacy Mode (Desktop / Tablet) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePrivacy();
              }}
              title="Privacy Mode (P)"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 backdrop-blur-md flex items-center justify-center active:scale-95 shadow-md hidden sm:flex cursor-pointer"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>

            {/* Panic Lock (Desktop / Tablet) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLockApp();
              }}
              title="Panic Lock"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-amber-400 border border-zinc-800 backdrop-blur-md flex items-center justify-center active:scale-95 shadow-md hidden sm:flex cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-amber-400 border border-zinc-800 backdrop-blur-md flex items-center justify-center active:scale-95 shadow-md cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              ) : (
                <Maximize className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Empty middle area: clicks pass through to central button / gestures */}
        <div className="flex-1" />

        {/* Bottom Timeline & Clean Compact Controls Bar */}
        <div
          className="space-y-1 sm:space-y-2 pointer-events-auto bg-zinc-950/85 sm:bg-zinc-950/70 p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl backdrop-blur-md border border-white/5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scrubber Bar */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            <span className="font-mono text-[10px] sm:text-xs text-slate-300 min-w-[28px] sm:min-w-[40px] text-right font-medium">
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
            <span className="font-mono text-[10px] sm:text-xs text-slate-400 min-w-[28px] sm:min-w-[40px] font-medium">
              {formatTime(duration)}
            </span>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between gap-1 sm:gap-3">
            {/* Left Controls */}
            <div className="flex items-center gap-0.5 sm:gap-2">
              <button
                onClick={togglePlay}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center text-slate-200 hover:text-amber-400 hover:bg-zinc-800/60 active:scale-95 cursor-pointer"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                )}
              </button>

              <button
                onClick={() => skip(-10)}
                title="Rewind 10s"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-zinc-800/60 active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <button
                onClick={() => skip(10)}
                title="Forward 10s"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-zinc-800/60 active:scale-95 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {/* Volume / Mute Button & Slider */}
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleMute}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-zinc-800/60 active:scale-95 cursor-pointer"
                  title="Mute / Unmute"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-14 sm:w-18 h-1.5 hidden sm:block accent-amber-400 cursor-pointer"
                  title="Volume"
                />
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-1 sm:gap-2 relative">
              {/* Zoom Buttons (+ / - / Reset) */}
              <div className="flex items-center bg-zinc-900/90 border border-zinc-700/70 rounded-md sm:rounded-lg px-1 py-0.5 text-[10px] sm:text-xs text-zinc-300">
                <button
                  onClick={() => setClampedZoom(zoomScale - 0.25)}
                  disabled={zoomScale <= 1.0}
                  className="p-0.5 sm:p-1 hover:text-amber-400 disabled:opacity-30 active:scale-95 cursor-pointer"
                  title="Zoom Out (-)"
                >
                  <ZoomOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
                <span className="font-mono text-[9px] sm:text-[10px] font-bold px-0.5 sm:px-1 text-amber-300 min-w-[24px] sm:min-w-[28px] text-center">
                  {Math.round(zoomScale * 100)}%
                </span>
                <button
                  onClick={() => setClampedZoom(zoomScale + 0.25)}
                  disabled={zoomScale >= 4.0}
                  className="p-0.5 sm:p-1 hover:text-amber-400 disabled:opacity-30 active:scale-95 cursor-pointer"
                  title="Zoom In (+)"
                >
                  <ZoomIn className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>

              {/* Playback Speed */}
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu((prev) => !prev)}
                  className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md sm:rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-[10px] sm:text-xs font-mono font-bold flex items-center gap-1 active:scale-95 cursor-pointer"
                  title="Playback Speed"
                >
                  <Gauge className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400" />
                  <span>{playbackSpeed.toFixed(1)}x</span>
                </button>

                {showSpeedMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-zinc-900/95 border border-zinc-700 rounded-xl p-1.5 shadow-2xl backdrop-blur-md flex flex-col gap-1 min-w-[100px] z-50 animate-fade-in pointer-events-auto">
                    <div className="text-[10px] uppercase font-bold text-zinc-400 px-2 py-0.5 border-b border-zinc-800">
                      Speed
                    </div>
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                      <button
                        key={s}
                        onClick={() => changePlaybackSpeed(s)}
                        className={`px-2.5 py-1 text-xs text-left font-mono rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                          Math.abs(s - playbackSpeed) < 0.05
                            ? 'bg-amber-400 text-black font-extrabold'
                            : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        <span>{s.toFixed(2)}x</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Picture-in-Picture */}
              <button
                onClick={togglePictureInPicture}
                title="Picture in Picture"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg hidden sm:flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800/60 active:scale-95 cursor-pointer"
              >
                <PictureInPicture className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
