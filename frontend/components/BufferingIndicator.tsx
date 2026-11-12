'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BufferedRange } from '../hooks/useBufferedSegments';
import { IChapter, IBookmark } from '../types';
import {
  getFrameIndexForTime,
  getContactSheetSpriteStyle,
  calculatePreviewClampedX,
} from '../lib/contactSheet';
import { formatTimestamp } from '../lib/collectionsManager';

interface BufferingIndicatorProps {
  bufferedRanges: BufferedRange[];
  currentTime: number;
  duration: number;
  percentBuffered: number;
  isBuffering: boolean;
  onSeek: (targetTime: number) => void;
  maxBufferAhead?: number;
  contactSheetUrl?: string | null;
  totalFrames?: number;
  cols?: number;
  rows?: number;
  chapters?: IChapter[];
  bookmarks?: IBookmark[];
  abRepeat?: {
    pointA: number | null;
    pointB: number | null;
    active: boolean;
  };
}

export const BufferingIndicator: React.FC<BufferingIndicatorProps> = ({
  bufferedRanges,
  currentTime,
  duration,
  percentBuffered: _percentBuffered,
  isBuffering: _isBuffering,
  onSeek,
  contactSheetUrl,
  totalFrames = 10,
  cols = 5,
  rows = 2,
  chapters = [],
  bookmarks = [],
  abRepeat,
}) => {
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  if (!duration || duration <= 0) return null;

  const displayTime = isScrubbing && scrubTime !== null ? scrubTime : currentTime;
  const safeDuration = duration && isFinite(duration) && duration > 0 ? duration : 0;
  const playedPercent = safeDuration > 0 ? Math.min(100, Math.max(0, (displayTime / safeDuration) * 100)) : 0;

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

  // Mouse Click & Slide Scrubbing
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

  // Touch Scrubbing
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

  // Active Chapter under hover
  const activeHoverChapter =
    hoverTime !== null
      ? chapters.find(
          (ch) =>
            hoverTime >= ch.startTime &&
            (ch.endTime === undefined || hoverTime < ch.endTime)
        )
      : null;

  return (
    <div
      className="relative w-full py-3 sm:py-2.5 group cursor-pointer select-none touch-none flex items-center"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Timeline Thumbnail Preview or Time Tooltip */}
      {hoverPosition !== null && hoverTime !== null && (() => {
        const containerWidth = progressBarRef.current?.clientWidth || 300;
        const previewWidth = 140;
        const previewHeight = 78;
        const clampedX = calculatePreviewClampedX(hoverPosition, containerWidth, previewWidth);

        if (contactSheetUrl) {
          const frameIndex = getFrameIndexForTime(hoverTime, duration, totalFrames);
          const sprite = getContactSheetSpriteStyle(frameIndex, {
            cols,
            rows,
            totalFrames,
            tileWidth: previewWidth,
            tileHeight: previewHeight,
          });

          return (
            <div
              className="absolute bottom-full mb-3 pointer-events-none transform -translate-x-1/2 transition-transform duration-75 z-40"
              style={{ left: `${clampedX}px` }}
            >
              <div className="w-[140px] h-[78px] rounded-xl overflow-hidden border border-accent/60 shadow-2xl bg-[#090A0F] relative flex flex-col justify-end">
                {/* Contact sheet sprite background */}
                <div
                  className="absolute inset-0 bg-no-repeat"
                  style={{
                    backgroundImage: `url(${contactSheetUrl})`,
                    backgroundPosition: sprite.backgroundPosition,
                    backgroundSize: sprite.backgroundSize,
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent pointer-events-none" />
                {/* Chapter name inside preview */}
                {activeHoverChapter && (
                  <div className="relative z-10 text-[9px] text-accent font-semibold px-2 truncate text-center">
                    {activeHoverChapter.title}
                  </div>
                )}
                {/* Timestamp pill */}
                <div className="relative z-10 mx-auto mb-1 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-white/10 text-white font-mono text-[10px] font-bold tabular-nums">
                  {formatTimestamp(hoverTime)}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            className="absolute bottom-full mb-2 pointer-events-none transform -translate-x-1/2 transition-transform duration-75 z-40"
            style={{ left: `${hoverPosition}px` }}
          >
            <div className="bg-[#151925]/95 backdrop-blur-md text-accent text-xs font-mono font-bold px-2.5 py-1 rounded-lg border border-accent/30 shadow-2xl whitespace-nowrap tabular-nums">
              {activeHoverChapter ? `${activeHoverChapter.title} • ` : ''}
              {formatTimestamp(hoverTime)}
            </div>
          </div>
        );
      })()}

      {/* Progress Track Bar (4px idle, 6px hover per master spec) */}
      <div
        ref={progressBarRef}
        className={`relative w-full rounded-full transition-all overflow-hidden ${
          isScrubbing ? 'h-1.5 sm:h-2 bg-white/[0.08]' : 'h-1 group-hover:h-1.5 bg-white/[0.08]'
        }`}
      >
        {/* Base Unplayed Track */}
        <div className="absolute inset-0 bg-white/[0.14] rounded-full" />

        {/* Buffered Segments (Translucent White) */}
        {bufferedRanges && bufferedRanges.length > 0 && bufferedRanges.map((range, idx) => {
          const startPercent = Math.max(0, Math.min(100, (range.start / duration) * 100));
          const endPercent = Math.max(0, Math.min(100, (range.end / duration) * 100));
          const widthPercent = Math.max(0, endPercent - startPercent);

          if (widthPercent <= 0) return null;

          return (
            <div
              key={idx}
              className="absolute top-0 bottom-0 bg-white/30 transition-all rounded-full"
              style={{
                left: `${startPercent}%`,
                width: `${widthPercent}%`,
              }}
              title={`Buffered: ${formatTimestamp(range.start)} - ${formatTimestamp(range.end)}`}
            />
          );
        })}

        {/* A-B Loop Range Highlight */}
        {abRepeat?.pointA !== null && abRepeat?.pointA !== undefined && (
          <div
            className="absolute top-0 bottom-0 bg-emerald-500/40 border-l border-r border-emerald-400 z-10"
            style={{
              left: `${(abRepeat.pointA / duration) * 100}%`,
              width: `${
                abRepeat.pointB !== null && abRepeat.pointB !== undefined
                  ? Math.max(0, ((abRepeat.pointB - abRepeat.pointA) / duration) * 100)
                  : Math.max(0, 100 - (abRepeat.pointA / duration) * 100)
              }%`,
            }}
          />
        )}

        {/* Hover ghost highlight */}
        {hoverPosition !== null && progressBarRef.current && (
          <div
            className="absolute top-0 bottom-0 bg-white/20 pointer-events-none rounded-full"
            style={{
              width: `${(hoverPosition / (progressBarRef.current.clientWidth || 1)) * 100}%`,
            }}
          />
        )}

        {/* Played Progress Bar (Accent Indigo #818CF8) */}
        <div
          className="absolute top-0 bottom-0 bg-[#818CF8] rounded-full shadow-[0_0_12px_rgba(129,140,248,0.5)]"
          style={{ width: `${playedPercent}%` }}
        />

        {/* Chapter Tick Marks */}
        {chapters.length > 1 &&
          chapters.map((ch, idx) => {
            if (ch.startTime <= 0) return null;
            const pct = (ch.startTime / duration) * 100;
            return (
              <div
                key={ch.id || idx}
                className="absolute top-0 bottom-0 w-[2px] bg-black/75 z-20 pointer-events-none"
                style={{ left: `${pct}%` }}
                title={ch.title}
              />
            );
          })}

        {/* Bookmarks Dots */}
        {bookmarks.length > 0 &&
          bookmarks.map((bm) => {
            const pct = (bm.timestamp / duration) * 100;
            return (
              <div
                key={bm.id}
                className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-400 border border-black z-25 pointer-events-none"
                style={{ left: `calc(${pct}% - 3px)` }}
                title={bm.label || `Bookmark at ${formatTimestamp(bm.timestamp)}`}
              />
            );
          })}
      </div>

      {/* Scrubber Knob Thumb */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 sm:w-3.5 sm:h-3.5 bg-[#818CF8] rounded-full shadow-[0_0_10px_rgba(129,140,248,0.8)] border-2 border-[#090A0F] transition-transform pointer-events-none z-30 ${
          isScrubbing ? 'scale-125 opacity-100' : 'opacity-100 sm:opacity-0 group-hover:opacity-100 scale-100 group-hover:scale-110'
        }`}
        style={{
          left: `calc(${playedPercent}% - 6px)`,
        }}
      />
    </div>
  );
};
