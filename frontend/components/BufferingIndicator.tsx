'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  percentBuffered: _percentBuffered,
  isBuffering: _isBuffering,
  onSeek,
}) => {
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  const isScrubbingRef = useRef(false);
  isScrubbingRef.current = isScrubbing;

  if (!duration || duration <= 0) return null;

  // Active display time is scrubTime if user is actively dragging/sliding, otherwise currentTime
  const displayTime = isScrubbing && scrubTime !== null ? scrubTime : currentTime;
  const safeDuration = (duration && isFinite(duration) && duration > 0) ? duration : 0;
  const playedPercent = safeDuration > 0 ? Math.min(100, Math.max(0, (displayTime / safeDuration) * 100)) : 0;

  const formatTime = (secs: number) => {
    if (typeof secs !== 'number' || !isFinite(secs) || isNaN(secs) || secs < 0) {
      return '00:00';
    }
    const safeSecs = safeDuration > 0 ? Math.max(0, Math.min(safeDuration, secs)) : Math.max(0, secs);
    const hrs = Math.floor(safeSecs / 3600);
    const mins = Math.floor((safeSecs % 3600) / 60);
    const s = Math.floor(safeSecs % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getTimeFromX = useCallback(
    (clientX: number): { time: number; pos: number } => {
      if (!progressBarRef.current) return { time: 0, pos: 0 };
      const rect = progressBarRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = rect.width > 0 ? clickX / rect.width : 0;
      return {
        time: Math.max(0, Math.min(duration, ratio * duration)),
        pos: clickX,
      };
    },
    [duration]
  );

  // Desktop Mouse Hover
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isScrubbing) return;
    const { time, pos } = getTimeFromX(e.clientX);
    setHoverPosition(pos);
    setHoverTime(time);
  };

  const handleMouseLeave = () => {
    if (!isScrubbing) {
      setHoverPosition(null);
      setHoverTime(null);
    }
  };

  // Desktop Mouse Click & Slide Scrubbing
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsScrubbing(true);
    const { time, pos } = getTimeFromX(e.clientX);
    setScrubTime(time);
    setHoverPosition(pos);
    setHoverTime(time);
    onSeek(time);

    const onGlobalMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const { time: moveTime, pos: movePos } = getTimeFromX(moveEvent.clientX);
      setScrubTime(moveTime);
      setHoverPosition(movePos);
      setHoverTime(moveTime);
    };

    const onGlobalMouseUp = (upEvent: MouseEvent) => {
      const { time: finalTime } = getTimeFromX(upEvent.clientX);
      onSeek(finalTime);
      setIsScrubbing(false);
      setScrubTime(null);
      setHoverPosition(null);
      setHoverTime(null);
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    };

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);
  };

  // Mobile Touch Tap & Sliding Scrubbing
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) return;
    setIsScrubbing(true);
    const touch = e.touches[0];
    const { time, pos } = getTimeFromX(touch.clientX);
    setScrubTime(time);
    setHoverPosition(pos);
    setHoverTime(time);

    const onGlobalTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length === 0) return;
      const t = moveEvent.touches[0];
      const { time: moveTime, pos: movePos } = getTimeFromX(t.clientX);
      setScrubTime(moveTime);
      setHoverPosition(movePos);
      setHoverTime(moveTime);
    };

    const onGlobalTouchEnd = (endEvent: TouchEvent) => {
      if (endEvent.changedTouches.length > 0) {
        const t = endEvent.changedTouches[0];
        const { time: finalTime } = getTimeFromX(t.clientX);
        onSeek(finalTime);
      }
      setIsScrubbing(false);
      setScrubTime(null);
      setHoverPosition(null);
      setHoverTime(null);
      window.removeEventListener('touchmove', onGlobalTouchMove);
      window.removeEventListener('touchend', onGlobalTouchEnd);
      window.removeEventListener('touchcancel', onGlobalTouchEnd);
    };

    window.addEventListener('touchmove', onGlobalTouchMove, { passive: false });
    window.addEventListener('touchend', onGlobalTouchEnd);
    window.addEventListener('touchcancel', onGlobalTouchEnd);
  };

  return (
    <div
      className="relative w-full py-3 sm:py-2 group cursor-pointer select-none touch-none flex items-center"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Time hover / touch scrubber tooltip */}
      {(hoverPosition !== null && hoverTime !== null) && (
        <div
          className="absolute bottom-full mb-2 pointer-events-none transform -translate-x-1/2 transition-transform duration-75 z-40"
          style={{ left: `${hoverPosition}px` }}
        >
          <div className="bg-zinc-900/95 backdrop-blur-md text-amber-400 text-[11px] sm:text-xs font-mono font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg border border-amber-400/30 shadow-2xl whitespace-nowrap">
            {formatTime(hoverTime)}
          </div>
        </div>
      )}

      {/* Progress Track Bar */}
      <div
        ref={progressBarRef}
        className={`relative w-full rounded-full transition-all overflow-hidden ${
          isScrubbing ? 'h-2 sm:h-2.5 bg-zinc-800' : 'h-1.5 group-hover:h-2.5 bg-zinc-800/90'
        }`}
      >
        {/* Base Track */}
        <div className="absolute inset-0 bg-white/15 rounded-full" />

        {/* Buffered Segments (Accurate loaded buffer ranges in light translucent gray/white) */}
        {bufferedRanges && bufferedRanges.length > 0 && bufferedRanges.map((range, idx) => {
          const startPercent = Math.max(0, Math.min(100, (range.start / duration) * 100));
          const endPercent = Math.max(0, Math.min(100, (range.end / duration) * 100));
          const widthPercent = Math.max(0, endPercent - startPercent);

          if (widthPercent <= 0) return null;

          return (
            <div
              key={idx}
              className="absolute top-0 bottom-0 bg-white/40 transition-all rounded-full"
              style={{
                left: `${startPercent}%`,
                width: `${widthPercent}%`,
              }}
              title={`Buffered: ${formatTime(range.start)} - ${formatTime(range.end)}`}
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

        {/* Played Progress Bar (High-Contrast Amber) */}
        <div
          className="absolute top-0 bottom-0 bg-amber-400 rounded-full shadow-[0_0_12px_rgba(251,191,36,0.6)]"
          style={{ width: `${playedPercent}%` }}
        />
      </div>

      {/* Scrubber Knob Thumb (Always interactive and visible while sliding or on mobile) */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-amber-400 rounded-full shadow-[0_0_10px_rgba(251,191,36,0.8)] border-2 border-zinc-950 transition-transform pointer-events-none z-30 ${
          isScrubbing ? 'scale-125 opacity-100' : 'opacity-100 sm:opacity-0 group-hover:opacity-100 scale-100 group-hover:scale-110'
        }`}
        style={{
          left: `calc(${playedPercent}% - ${isScrubbing ? '7px' : '7px'})`,
        }}
      />
    </div>
  );
};
