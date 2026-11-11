'use client';

import React, { useState, useEffect, useRef } from 'react';
import { IDriveVideo } from '../types';
import { useBufferedSegments } from '../hooks/useBufferedSegments';
import { BufferingIndicator } from './BufferingIndicator';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Camera,
  Image as ImageIcon,
  ExternalLink,
  RotateCcw,
  RefreshCw,
  HardDrive,
  Sparkles,
  Gauge,
} from 'lucide-react';

interface DrivePlayerModalProps {
  video: IDriveVideo | null;
  onClose: () => void;
  onOpenThumbnailModal: (video: IDriveVideo, initialCanvas?: HTMLCanvasElement) => void;
}

export const DrivePlayerModal: React.FC<DrivePlayerModalProps> = ({
  video,
  onClose,
  onOpenThumbnailModal,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerMode, setPlayerMode] = useState<'html5' | 'embed'>('html5');
  const [streamError, setStreamError] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [snapSuccess, setSnapSuccess] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intelligent partial buffer observer (prevents excessive downloading)
  const bufferingState = useBufferedSegments(videoRef);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' && playerMode === 'html5') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight' && videoRef.current) {
        e.preventDefault();
        videoRef.current.currentTime = Math.min(duration || 1000, videoRef.current.currentTime + 10);
      } else if (e.key === 'ArrowLeft' && videoRef.current) {
        e.preventDefault();
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
      } else if ((e.key === 'm' || e.key === 'M') && playerMode === 'html5') {
        toggleMute();
      } else if ((e.key === 'f' || e.key === 'F')) {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, playerMode, duration, onClose]);

  // Reset state when video changes
  useEffect(() => {
    if (video) {
      setCurrentTime(0);
      setDuration(video.duration || 0);
      setIsPlaying(false);
      setStreamError(false);
      setPlayerMode('html5');
    }
  }, [video]);

  if (!video) return null;

  // Stream source: chunk-stream endpoint that forwards Range headers for optimal bandwidth
  const fileId = video.driveFileId;
  const directStreamUrl = `/api/drive/videos/${fileId}/chunk-stream`;
  const rawDriveDownloadUrl = video.driveStreamUrl || `https://drive.google.com/uc?export=download&id=${fileId}`;
  const embedPreviewUrl = `https://drive.google.com/file/d/${fileId}/preview`;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if ((!duration || duration === 0) && videoRef.current.duration) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const handleSeek = (targetTime: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
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

  // Frame snapshot function
  const handleSnapFrame = (timestamp?: number) => {
    if (!videoRef.current) return;
    setIsSnapping(true);
    try {
      const v = videoRef.current;
      if (timestamp !== undefined && Math.abs(v.currentTime - timestamp) > 0.5) {
        v.currentTime = timestamp;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.min(1280, v.videoWidth || 1280);
      canvas.height = Math.round(canvas.width * (9 / 16));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        setSnapSuccess(true);
        setTimeout(() => setSnapSuccess(false), 2000);
        onOpenThumbnailModal(video, canvas);
      }
    } catch (e) {
      console.warn('Direct frame capture restricted, launching thumbnail modal directly:', e);
      onOpenThumbnailModal(video);
    } finally {
      setIsSnapping(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fade-in">
      <div
        ref={containerRef}
        className="relative w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]"
      >
        {/* Modal Top Bar */}
        <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-4 z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"></span>
            <div className="truncate">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                {video.title}
              </h2>
              <p className="text-xs text-slate-400 font-mono truncate flex items-center gap-2">
                <span>Google Drive File: {video.driveFileId}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <Gauge className="w-3 h-3" />
                  <span>Chunk Range Streaming Active</span>
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Player Engine Switch */}
            <button
              onClick={() => setPlayerMode(playerMode === 'html5' ? 'embed' : 'html5')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all flex items-center gap-1.5 border border-slate-700"
              title="Toggle between HTML5 Chunk Player and Google Drive Embedded Preview"
            >
              <RefreshCw className="w-3 h-3" />
              <span className="hidden sm:inline">Engine: {playerMode === 'html5' ? 'HTML5 Chunk' : 'Drive Embed'}</span>
            </button>

            {/* Thumbnail Quick Trigger */}
            <button
              onClick={() => onOpenThumbnailModal(video)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-400 hover:bg-amber-300 text-black transition-all flex items-center gap-1.5 shadow-md shadow-amber-400/20"
              title="Upload or snap custom thumbnail to Backblaze B2"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Set B2 Thumbnail</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-950/40 hover:text-rose-400 text-slate-400 transition-all border border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Canvas Area */}
        <div className="relative flex-1 bg-black aspect-video min-h-[300px] flex items-center justify-center overflow-hidden">
          {playerMode === 'embed' ? (
            <iframe
              src={embedPreviewUrl}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          ) : (
            <>
              <video
                ref={videoRef}
                src={directStreamUrl}
                preload="metadata"
                className="w-full h-full object-contain"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => {
                  if (videoRef.current && videoRef.current.duration) {
                    setDuration(videoRef.current.duration);
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => {
                  console.warn('Chunk stream proxy fallback triggered, trying raw link');
                  if (videoRef.current && videoRef.current.src !== rawDriveDownloadUrl) {
                    videoRef.current.src = rawDriveDownloadUrl;
                    videoRef.current.load();
                  } else {
                    setStreamError(true);
                    setPlayerMode('embed');
                  }
                }}
                onClick={togglePlay}
                playsInline
                autoPlay
              />

              {/* Big Center Play/Pause Overlay */}
              {!isPlaying && !streamError && (
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-2xl shadow-amber-400/50 hover:scale-110 transition-all"
                >
                  <Play className="w-8 h-8 fill-black ml-1" />
                </button>
              )}
            </>
          )}
        </div>

        {/* HTML5 Controls Bar with Accurate BufferingIndicator (Chunk range buffered visualization) */}
        {playerMode === 'html5' && (
          <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex flex-col gap-2 shrink-0">
            {/* Buffering Indicator Scrub Track */}
            <BufferingIndicator
              bufferedRanges={bufferingState.bufferedRanges}
              currentTime={currentTime}
              duration={duration || 100}
              percentBuffered={bufferingState.percentBuffered}
              isBuffering={bufferingState.isBuffering}
              onSeek={handleSeek}
            />

            {/* Bottom Controls Row */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Play / Pause */}
                <button
                  onClick={togglePlay}
                  className="p-1.5 text-slate-200 hover:text-amber-400 transition-colors"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                </button>

                {/* 10s Rewind */}
                <button
                  onClick={() => handleSeek(Math.max(0, currentTime - 10))}
                  title="Rewind 10s (Left Arrow)"
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                {/* Volume & Mute */}
                <div className="flex items-center gap-2 group">
                  <button
                    onClick={toggleMute}
                    className="p-1.5 text-slate-300 hover:text-white transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400 hidden sm:block"
                  />
                </div>

                {/* Time Display */}
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                {/* Snap 20s Frame Button */}
                <button
                  onClick={() => handleSnapFrame(20)}
                  disabled={isSnapping}
                  title="Capture frame at 20 seconds and store in Backblaze B2"
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 text-xs font-semibold rounded-lg border border-amber-400/30 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Snap 20s Frame</span>
                </button>

                {/* Snap Current Frame Button */}
                <button
                  onClick={() => handleSnapFrame()}
                  disabled={isSnapping}
                  title="Capture current video frame and save to Backblaze B2"
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-all"
                >
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">
                    {snapSuccess ? 'Snapped!' : 'Snap Current'}
                  </span>
                </button>

                {/* Open in Drive */}
                <a
                  href={video.driveViewUrl || `https://drive.google.com/file/d/${video.driveFileId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-slate-400 hover:text-white transition-colors"
                  title="Open file in Google Drive"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>

                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
