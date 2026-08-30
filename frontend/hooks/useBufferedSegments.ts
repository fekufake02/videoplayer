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
  videoRef: RefObject<HTMLVideoElement>
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

    if (!duration || duration === 0) return;

    const ranges: BufferedRange[] = [];
    let totalBuffered = 0;

    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      ranges.push({ start, end });
      totalBuffered += end - start;
    }

    const percentBuffered = (totalBuffered / duration) * 100;

    setBufferingState({
      bufferedRanges: ranges,
      totalBuffered,
      percentBuffered,
      isBuffering: video.readyState < 3 && !video.paused,
    });
  }, [videoRef]);

  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    video.addEventListener('progress', updateBufferedState);
    video.addEventListener('loadedmetadata', updateBufferedState);
    video.addEventListener('loadeddata', updateBufferedState);
    video.addEventListener('timeupdate', updateBufferedState);
    video.addEventListener('seeked', updateBufferedState);

    return () => {
      video.removeEventListener('progress', updateBufferedState);
      video.removeEventListener('loadedmetadata', updateBufferedState);
      video.removeEventListener('loadeddata', updateBufferedState);
      video.removeEventListener('timeupdate', updateBufferedState);
      video.removeEventListener('seeked', updateBufferedState);
    };
  }, [videoRef, updateBufferedState]);

  return bufferingState;
};
