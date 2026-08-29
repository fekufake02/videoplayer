'use client';

import React from 'react';
import { BufferedRange } from '../hooks/useBufferedSegments';

interface BufferingIndicatorProps {
  bufferedRanges: BufferedRange[];
  currentTime: number;
  duration: number;
  percentBuffered: number;
  isBuffering: boolean;
}

export const BufferingIndicator: React.FC<BufferingIndicatorProps> = ({
  bufferedRanges,
  currentTime,
  duration,
  percentBuffered,
  isBuffering,
}) => {
  if (!duration || duration === 0) return null;

  return (
    <div className="relative w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden group">
      {/* Buffered segments (light gray like YouTube) */}
      {bufferedRanges.map((range, idx) => {
        const startPercent = (range.start / duration) * 100;
        const widthPercent = ((range.end - range.start) / duration) * 100;

        return (
          <div
            key={idx}
            className="absolute h-full bg-zinc-600 transition-all"
            style={{
              left: `${startPercent}%`,
              width: `${widthPercent}%`,
            }}
          />
        );
      })}

      {/* Loading indicator on hover */}
      {isBuffering && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/20 to-transparent animate-pulse" />
      )}

      {/* Tooltip showing buffer percentage on hover */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="bg-zinc-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap border border-zinc-700">
          {Math.round(percentBuffered)}% buffered
        </div>
      </div>
    </div>
  );
};
