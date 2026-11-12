'use client';

import {
  DEFAULT_CONTACT_SHEET_CONFIG,
  ContactSheetConfig,
} from './contactSheet';

// In-memory contact sheet data cache: videoId -> dataUrl
const contactSheetCache = new Map<string, string>();

/**
 * Returns cached contact sheet data URL if available
 */
export function getCachedContactSheet(videoId: string): string | null {
  if (contactSheetCache.has(videoId)) {
    return contactSheetCache.get(videoId)!;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`vault_contact_sheet_${videoId}`);
      if (stored) {
        contactSheetCache.set(videoId, stored);
        return stored;
      }
    } catch {}
  }
  return null;
}

/**
 * Saves contact sheet data URL to memory and local storage
 */
export function setCachedContactSheet(videoId: string, dataUrl: string): void {
  contactSheetCache.set(videoId, dataUrl);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`vault_contact_sheet_${videoId}`, dataUrl);
    } catch {}
  }
}

/**
 * Generates a compact contact sheet grid canvas from an active video element
 * or video stream URL. Samples 10 frames across video duration.
 */
export async function generateContactSheet(
  videoSource: HTMLVideoElement | string,
  duration: number,
  videoId?: string,
  config: ContactSheetConfig = DEFAULT_CONTACT_SHEET_CONFIG
): Promise<string | null> {
  if (videoId) {
    const existing = getCachedContactSheet(videoId);
    if (existing) return existing;
  }

  if (!duration || duration <= 0) return null;

  const totalWidth = config.cols * config.tileWidth;
  const totalHeight = config.rows * config.tileHeight;

  // Create main contact sheet canvas
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Dark placeholder base
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // If active video element is already provided and ready, we can sample frames or create a clone
  const isVideoElement = typeof HTMLVideoElement !== 'undefined' && videoSource instanceof HTMLVideoElement;
  let videoUrl: string = '';

  if (isVideoElement) {
    videoUrl = (videoSource as HTMLVideoElement).currentSrc || (videoSource as HTMLVideoElement).src;
  } else if (typeof videoSource === 'string') {
    videoUrl = videoSource;
  }

  if (!videoUrl) return null;

  // Sample timestamps: e.g. 10 frames evenly spaced at 5%, 15%, 25%, ..., 95% of duration
  const sampleTimestamps: number[] = [];
  const step = duration / config.totalFrames;
  for (let i = 0; i < config.totalFrames; i++) {
    sampleTimestamps.push(Math.max(0.5, Math.min(duration - 0.5, (i + 0.5) * step)));
  }

  try {
    // Render placeholders with timestamps while frames load
    for (let i = 0; i < config.totalFrames; i++) {
      const col = i % config.cols;
      const row = Math.floor(i / config.cols);
      const x = col * config.tileWidth;
      const y = row * config.tileHeight;

      // Dark cell background with subtle border
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + 1, y + 1, config.tileWidth - 2, config.tileHeight - 2);

      // Play icon badge
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(x + config.tileWidth / 2, y + config.tileHeight / 2 - 6, 12, 0, Math.PI * 2);
      ctx.fill();

      // Timestamp indicator text
      const timeSecs = sampleTimestamps[i];
      const mins = Math.floor(timeSecs / 60);
      const secs = Math.floor(timeSecs % 60);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, x + config.tileWidth / 2, y + config.tileHeight - 10);
    }

    // Try offscreen sequential frame extraction
    const offscreenVideo = document.createElement('video');
    offscreenVideo.crossOrigin = 'anonymous';
    offscreenVideo.muted = true;
    offscreenVideo.playsInline = true;
    offscreenVideo.preload = 'metadata';
    offscreenVideo.src = videoUrl;

    const frameResult = await new Promise<boolean>((resolve) => {
      let currentSampleIndex = 0;
      let timeoutId: NodeJS.Timeout | null = null;

      const seekNext = () => {
        if (currentSampleIndex >= sampleTimestamps.length) {
          if (timeoutId) clearTimeout(timeoutId);
          resolve(true);
          return;
        }
        offscreenVideo.currentTime = sampleTimestamps[currentSampleIndex];
      };

      const handleSeeked = () => {
        if (offscreenVideo.videoWidth > 0 && offscreenVideo.videoHeight > 0) {
          const col = currentSampleIndex % config.cols;
          const row = Math.floor(currentSampleIndex / config.cols);
          const x = col * config.tileWidth;
          const y = row * config.tileHeight;
          try {
            ctx.drawImage(offscreenVideo, 0, 0, offscreenVideo.videoWidth, offscreenVideo.videoHeight, x, y, config.tileWidth, config.tileHeight);
          } catch {}
        }
        currentSampleIndex++;
        seekNext();
      };

      offscreenVideo.addEventListener('seeked', handleSeeked);
      offscreenVideo.addEventListener('loadedmetadata', () => {
        seekNext();
      });
      offscreenVideo.addEventListener('error', () => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(false);
      });

      // Safety timeout: 4 seconds max for contact sheet generation
      timeoutId = setTimeout(() => {
        resolve(true);
      }, 4000);

      offscreenVideo.load();
    });

    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    if (videoId && dataUrl && dataUrl.length > 100) {
      setCachedContactSheet(videoId, dataUrl);
    }
    return dataUrl;
  } catch (err) {
    console.warn('Contact sheet generation failed:', err);
    return null;
  }
}
