/**
 * Intelligent buffering strategy for video streaming
 * - Adapts buffer target based on network speed
 * - Limits buffer to prevent excessive downloading
 * - Implements smart seek behavior
 */

export interface BufferingConfig {
  minBufferTarget: number; // Minimum seconds to buffer before playing
  maxBufferTarget: number; // Maximum seconds to buffer
  maxBufferAhead: number; // Max buffer ahead of current playback (2-5 minutes)
  slowNetworkThreshold: number; // Mbps below which network is considered slow
  stuckThreshold: number; // Seconds: if no progress for this long, consider video stuck
}

const BUFFERING_PRESETS = {
  fast: {
    minBufferTarget: 3,
    maxBufferTarget: 60,
    maxBufferAhead: 300, // 5 minutes
    slowNetworkThreshold: 5,
    stuckThreshold: 10,
  },
  moderate: {
    minBufferTarget: 5,
    maxBufferTarget: 30,
    maxBufferAhead: 120, // 2 minutes
    slowNetworkThreshold: 2,
    stuckThreshold: 15,
  },
  slow: {
    minBufferTarget: 8,
    maxBufferTarget: 15,
    maxBufferAhead: 60, // 1 minute
    slowNetworkThreshold: 1,
    stuckThreshold: 20,
  },
};

export class BufferingManager {
  private config: BufferingConfig;
  private lastProgressTime: number = 0;
  private lastPosition: number = 0;

  constructor(networkSpeed: 'slow' | 'moderate' | 'fast' = 'fast') {
    this.config = BUFFERING_PRESETS[networkSpeed];
  }

  /**
   * Calculate the maximum bytes to buffer ahead
   * Prevents downloading entire video
   */
  getMaxBufferAhead(bitrate: number): number {
    // bitrate in Mbps, convert to bytes per second
    const bytesPerSecond = (bitrate * 1000000) / 8;
    return bytesPerSecond * this.config.maxBufferAhead;
  }

  /**
   * Determine if video should start playing
   */
  shouldStartPlayback(
    bufferedSeconds: number,
    videoDuration: number
  ): boolean {
    // If entire video is buffered, definitely play
    if (bufferedSeconds >= videoDuration) return true;

    // Check if minimum buffer is reached
    return bufferedSeconds >= this.config.minBufferTarget;
  }

  /**
   * Determine if video should pause due to insufficient buffer
   */
  shouldPauseForBuffering(
    bufferedSeconds: number,
    currentTime: number,
    videoDuration: number
  ): boolean {
    // If entire video is buffered, never pause
    if (bufferedSeconds >= videoDuration) return false;

    // Calculate seconds until buffer runs out
    const secondsUntilEmpty = bufferedSeconds - currentTime;

    // Pause if buffer will be depleted in less than 2 seconds
    return secondsUntilEmpty < 2;
  }

  /**
   * Check if video is stuck (no progress for too long)
   */
  isVideoStuck(currentTime: number): boolean {
    const now = Date.now();
    if (currentTime === this.lastPosition) {
      if (now - this.lastProgressTime > this.config.stuckThreshold * 1000) {
        return true;
      }
    } else {
      this.lastPosition = currentTime;
      this.lastProgressTime = now;
    }
    return false;
  }

  /**
   * Get recommended buffer target based on network
   */
  getTargetBufferDuration(): number {
    return this.config.maxBufferTarget;
  }

  /**
   * Update network speed and reconfigure buffering
   */
  updateNetworkSpeed(speed: 'slow' | 'moderate' | 'fast'): void {
    this.config = BUFFERING_PRESETS[speed];
  }
}

/**
 * Calculate bitrate from file size and duration
 */
export function estimateBitrate(
  fileSizeBytes: number,
  durationSeconds: number
): number {
  if (durationSeconds === 0) return 0;
  // bitrate in Mbps
  return (fileSizeBytes * 8) / (durationSeconds * 1000000);
}

/**
 * Check if we should abort Range request to prevent over-buffering
 */
export function shouldAbortBufferAhead(
  currentPosition: number,
  bufferEnd: number,
  maxBufferAhead: number
): boolean {
  return bufferEnd - currentPosition > maxBufferAhead;
}
