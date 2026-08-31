'use client';

import React, { useState, useRef, useCallback } from 'react';
import { BufferedRange } from '../hooks/useBufferedSegments';

interface BufferingIndicatorProps {
  bufferedRanges: BufferedRange[];
  currentTime: number;
  duration: number;
  percentBuffered: number;
  isBuffering: boolean;
  onSeek: (targetTime: number) => void;
  maxBufferAhead?: number;
}

export const BufferingIndicator: React.FC<BufferingIndicatorProps> = ({
  bufferedRanges,
  currentTime,
  duration,
  percentBuffered,
  isBuffering,
  onSeek,
  maxBufferAhead = 120, // default 2 minutes bandwidth ceiling
}) => {
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  if (!duration || duration <= 0) return null;

  const playedPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  const formatTime = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getTimeFromX = (clientX: number): number => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = clickX / (rect.width || 1);
    return ratio * duration;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = x / (rect.width || 1);
    setHoverPosition(x);
    setHoverTime(ratio * duration);
  };

  const handleMouseLeave = () => {
    if (!isScrubbing) {
      setHoverPosition(null);
      setHoverTime(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsScrubbing(true);
    const target = getTimeFromX(e.clientX);
    onSeek(target);

    const onGlobalMouseMove = (moveEvent: MouseEvent) => {
      const scrubTime = getTimeFromX(moveEvent.clientX);
      if (progressBarRef.current) {
        const rect = progressBarRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(moveEvent.clientX - rect.left, rect.width));
        setHoverPosition(x);
        setHoverTime(scrubTime);
      }
      onSeek(scrubTime);
    };

    const onGlobalMouseUp = () => {
      setIsScrubbing(false);
      setHoverPosition(null);
      setHoverTime(null);
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    };

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);
  };

  // Mobile Touch Scrubbing Support
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) return;
    setIsScrubbing(true);
    const touch = e.touches[0];
    const target = getTimeFromX(touch.clientX);
    onSeek(target);

    if (progressBarRef.current) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
      setHoverPosition(x);
      setHoverTime(target);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const scrubTime = getTimeFromX(touch.clientX);
    if (progressBarRef.current) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
      setHoverPosition(x);
      setHoverTime(scrubTime);
    }
    onSeek(scrubTime);
  };

  const handleTouchEnd = () => {
    setIsScrubbing(false);
    setTimeout(() => {
      setHoverPosition(null);
      setHoverTime(null);
    }, 1000);
  };

  return (
    <div
      className="relative w-full py-3.5 sm:py-2.5 group cursor-pointer select-none touch-none flex items-center"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Time hover / touch tooltip */}
      {(hoverPosition !== null && hoverTime !== null) && (
        <div
          className="absolute bottom-full mb-2.5 pointer-events-none transform -translate-x-1/2 transition-transform duration-75 z-30"
          style={{ left: `${hoverPosition}px` }}
        >
          <div className="bg-zinc-900/95 backdrop-blur-md text-amber-400 text-xs font-mono font-bold px-2.5 py-1 rounded-lg border border-white/15 shadow-2xl whitespace-nowrap">
            {formatTime(hoverTime)}
          </div>
        </div>
      )}

      {/* Progress Track Bar */}
      <div
        ref={progressBarRef}
        className={`relative w-full rounded-full transition-all overflow-hidden ${
          isScrubbing ? 'h-2.5 sm:h-2.5 bg-zinc-800' : 'h-1.5 group-hover:h-2.5 bg-zinc-800/90'
        }`}
      >
        {/* Buffered Segments (Light Gray like YouTube) */}
        {bufferedRanges.map((range, idx) => {
          const startPercent = (range.start / duration) * 100;
          const widthPercent = ((range.end - range.start) / duration) * 100;
          return (
            <div
              key={idx}
              className="absolute top-0 bottom-0 bg-zinc-500/70 transition-all rounded-full"
              style={{
                left: `${startPercent}%`,
                width: `${widthPercent}%`,
              }}
            />
          );
        })}

        {/* Hover ghost highlight */}
        {hoverPosition !== null && progressBarRef.current && (
          <div
            className="absolute top-0 bottom-0 bg-white/20 pointer-events-none rounded-full"
            style={{
              width: `${(hoverPosition / (progressBarRef.current.clientWidth || 1)) * 100}%`,
            }}
          />
        )}

        {/* Played Progress Bar (Amber) */}
        <div
          className="absolute top-0 bottom-0 bg-amber-400 rounded-full shadow-lg shadow-amber-400/50"
          style={{ width: `${playedPercent}%` }}
        />
      </div>

      {/* Scrubber Thumb Knob (Visible on hover, on mobile, or while scrubbing) */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 sm:w-3.5 sm:h-3.5 bg-amber-400 rounded-full shadow-lg shadow-amber-400/70 border-2 border-zinc-950 transition-opacity pointer-events-none ${
          isScrubbing ? 'opacity-100 scale-125' : 'opacity-90 sm:opacity-0 group-hover:opacity-100'
        }`}
        style={{
          left: `calc(${playedPercent}% - 8px)`,
        }}
      />
    </div>
  );
};

