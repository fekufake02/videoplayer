'use client';

import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Pause, X, Maximize2, Volume2, VolumeX, ShieldAlert } from 'lucide-react';

export interface FloatingPipVideo {
  id: string;
  title: string;
  src: string;
  poster?: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isDrive?: boolean;
}

interface PipContextType {
  floatingVideo: FloatingPipVideo | null;
  startFloatingPip: (video: FloatingPipVideo) => void;
  closeFloatingPip: () => void;
  toggleFloatingPlay: () => void;
  exitAllPip: () => void;
}

const PipContext = createContext<PipContextType | undefined>(undefined);

export const PipProvider = ({ children }: { children: ReactNode }) => {
  const [floatingVideo, setFloatingVideo] = useState<FloatingPipVideo | null>(null);
  const miniVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const router = useRouter();

  const exitAllPip = useCallback(() => {
    // 1. Exit native browser Picture-in-Picture
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    // 2. Pause and close in-app floating mini player
    if (miniVideoRef.current) {
      miniVideoRef.current.pause();
    }
    setFloatingVideo(null);
  }, []);

  // Listen for global privacy lock event to instantly terminate all PiP instances
  useEffect(() => {
    const handlePrivacyEvent = () => {
      exitAllPip();
    };

    window.addEventListener('app:privacy-lock', handlePrivacyEvent);
    return () => window.removeEventListener('app:privacy-lock', handlePrivacyEvent);
  }, [exitAllPip]);

  const startFloatingPip = (video: FloatingPipVideo) => {
    setFloatingVideo(video);
  };

  const closeFloatingPip = () => {
    if (miniVideoRef.current) {
      miniVideoRef.current.pause();
    }
    setFloatingVideo(null);
  };

  const toggleFloatingPlay = () => {
    if (!miniVideoRef.current) return;
    if (miniVideoRef.current.paused) {
      miniVideoRef.current.play().catch(() => {});
      setFloatingVideo((prev) => (prev ? { ...prev, isPlaying: true } : null));
    } else {
      miniVideoRef.current.pause();
      setFloatingVideo((prev) => (prev ? { ...prev, isPlaying: false } : null));
    }
  };

  const handleExpandToWatch = () => {
    if (!floatingVideo) return;
    const dest = floatingVideo.isDrive
      ? `/drive/watch/${floatingVideo.id}`
      : `/watch/${floatingVideo.id}`;
    closeFloatingPip();
    router.push(dest);
  };

  return (
    <PipContext.Provider
      value={{
        floatingVideo,
        startFloatingPip,
        closeFloatingPip,
        toggleFloatingPlay,
        exitAllPip,
      }}
    >
      {children}

      {/* Floating Mini Player Widget */}
      {floatingVideo && (
        <div
          id="floating-pip-widget"
          className="fixed bottom-4 right-4 z-50 w-72 sm:w-80 rounded-2xl glass-panel shadow-2xl border border-indigo-500/30 overflow-hidden animate-fade-in select-none bg-[#131620]/95 backdrop-blur-2xl"
        >
          {/* Header bar */}
          <div className="px-3 py-2 bg-zinc-900/90 border-b border-white/5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-white truncate max-w-[170px]">
              {floatingVideo.title}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleExpandToWatch}
                title="Expand to Full Player"
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={closeFloatingPip}
                title="Close Mini Player"
                className="p-1 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Mini Video Surface */}
          <div className="relative aspect-video bg-black group">
            <video
              ref={miniVideoRef}
              src={floatingVideo.src}
              poster={floatingVideo.poster}
              preload="metadata"
              autoPlay
              playsInline
              muted={isMuted}
              onLoadedMetadata={(e) => {
                if (floatingVideo.currentTime > 0) {
                  (e.target as HTMLVideoElement).currentTime = floatingVideo.currentTime;
                }
              }}
              onPlay={() => setFloatingVideo((prev) => (prev ? { ...prev, isPlaying: true } : null))}
              onPause={() => setFloatingVideo((prev) => (prev ? { ...prev, isPlaying: false } : null))}
              className="w-full h-full object-contain"
            />

            {/* Quick overlay controls on hover */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button
                onClick={toggleFloatingPlay}
                className="w-9 h-9 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              >
                {floatingVideo.isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="w-8 h-8 rounded-full bg-zinc-900/90 text-white flex items-center justify-center border border-zinc-700 shadow-md active:scale-95 transition-transform"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </PipContext.Provider>
  );
};

export const usePip = () => {
  const context = useContext(PipContext);
  if (!context) {
    throw new Error('usePip must be used within a PipProvider');
  }
  return context;
};
