'use client';

import { useEffect, useState, useCallback, RefObject } from 'react';

export interface BufferedRange {
  start: number;
  end: number;
}

export interface BufferingState {
  bufferedRanges: BufferedRange[];
  totalBuffered: number;
  percentBuffered: number;
  isBuffering: boolean;
}

export const useBufferedSegments = (
  videoRef: RefObject<HTMLVideoElement | null>
): BufferingState => {
  const [bufferingState, setBufferingState] = useState<BufferingState>({
    bufferedRanges: [],
    totalBuffered: 0,
    percentBuffered: 0,
    isBuffering: false,
  });

  const updateBufferedState = useCallback(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const buffered = video.buffered;
    const duration = video.duration;

    if (!duration || isNaN(duration) || duration <= 0) return;

    const ranges: BufferedRange[] = [];
    let totalBuffered = 0;

    if (buffered && buffered.length > 0) {
      for (let i = 0; i < buffered.length; i++) {
        try {
          const start = buffered.start(i);
          const end = buffered.end(i);
          if (end >= start) {
            ranges.push({ start, end });
            totalBuffered += end - start;
          }
        } catch {
          // Ignore index out of bounds if buffered changed during loop
        }
      }
    }

    const percentBuffered = duration > 0 ? Math.min(100, (totalBuffered / duration) * 100) : 0;

    setBufferingState({
      bufferedRanges: ranges,
      totalBuffered,
      percentBuffered,
      isBuffering: video.readyState < 3 && !video.paused,
    });
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Listen to all relevant media events
    const events = [
      'progress',
      'loadedmetadata',
      'loadeddata',
      'canplay',
      'canplaythrough',
      'timeupdate',
      'seeking',
      'seeked',
      'waiting',
      'playing',
      'stalled',
      'suspend',
    ];

    events.forEach((evt) => {
      video.addEventListener(evt, updateBufferedState);
    });

    // Initial update
    updateBufferedState();

    // Regular interval poll to capture background buffer downloads
    const interval = setInterval(updateBufferedState, 600);

    return () => {
      events.forEach((evt) => {
        video.removeEventListener(evt, updateBufferedState);
      });
      clearInterval(interval);
    };
  }, [videoRef, updateBufferedState]);

  return bufferingState;
};
