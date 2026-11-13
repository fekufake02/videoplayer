'use client';

import {
  DEFAULT_CONTACT_SHEET_CONFIG,
  ContactSheetConfig,
} from './contactSheet';

// Versioned cache prefix to prevent stale or corrupted placeholder entries
const CACHE_PREFIX = 'vault_contact_sheet_v4_';

// In-memory contact sheet data cache: videoId -> dataUrl
const contactSheetCache = new Map<string, string>();

// Clean up any legacy unversioned or dummy contact sheet entries in localStorage
if (typeof window !== 'undefined') {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('vault_contact_sheet_') && !key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

/**
 * Returns cached contact sheet data URL if available
 */
export function getCachedContactSheet(videoId: string): string | null {
  if (!videoId) return null;
  if (contactSheetCache.has(videoId)) {
    return contactSheetCache.get(videoId)!;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`${CACHE_PREFIX}${videoId}`);
      if (stored && stored.startsWith('data:image/')) {
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
  if (!videoId || !dataUrl) return;
  contactSheetCache.set(videoId, dataUrl);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${CACHE_PREFIX}${videoId}`, dataUrl);
    } catch {}
  }
}

function toSafePreviewVideoUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/') || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }
  if (
    rawUrl.includes('zencdn.net') ||
    rawUrl.includes('interactive-examples.mdn.mozilla.net') ||
    rawUrl.includes('githubusercontent.com')
  ) {
    return rawUrl;
  }
  return `/api/stream-proxy?url=${encodeURIComponent(rawUrl)}`;
}

function isNonNativeContainerUrl(rawUrl: string): boolean {
  const lower = rawUrl.toLowerCase();
  return /\.(m3u8|m2?ts|flv)(\?|$)/.test(lower);
}

/**
 * Generates a contact sheet grid canvas only when real video frames can be extracted.
 * Samples frames across video duration. Never draws fake dummy circles.
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

  if (!duration || !isFinite(duration) || duration <= 0) return null;

  const totalWidth = config.cols * config.tileWidth;
  const totalHeight = config.rows * config.tileHeight;

  // Create main contact sheet canvas
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Dark clean background base
  ctx.fillStyle = '#090A0F';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  const isVideoElement = typeof HTMLVideoElement !== 'undefined' && videoSource instanceof HTMLVideoElement;
  let videoUrl: string = '';

  if (isVideoElement) {
    videoUrl = (videoSource as HTMLVideoElement).currentSrc || (videoSource as HTMLVideoElement).src;
  } else if (typeof videoSource === 'string') {
    videoUrl = videoSource;
  }

  if (!videoUrl || isNonNativeContainerUrl(videoUrl)) return null;

  const safeVideoUrl = toSafePreviewVideoUrl(videoUrl);

  // Sample timestamps evenly across duration
  const sampleTimestamps: number[] = [];
  const step = duration / config.totalFrames;
  for (let i = 0; i < config.totalFrames; i++) {
    sampleTimestamps.push(Math.max(0.5, Math.min(duration - 0.5, (i + 0.5) * step)));
  }

  let offscreenVideo: HTMLVideoElement | null = null;
  try {
    offscreenVideo = document.createElement('video');
    const vidEl = offscreenVideo;
    vidEl.crossOrigin = 'anonymous';
    vidEl.muted = true;
    vidEl.playsInline = true;
    vidEl.preload = 'metadata';
    vidEl.src = safeVideoUrl;

    let successfulFrames = 0;

    await new Promise<boolean>((resolve) => {
      let currentSampleIndex = 0;
      let timeoutId: NodeJS.Timeout | null = null;

      const seekNext = () => {
        if (currentSampleIndex >= sampleTimestamps.length) {
          if (timeoutId) clearTimeout(timeoutId);
          resolve(true);
          return;
        }
        vidEl.currentTime = sampleTimestamps[currentSampleIndex];
      };

      const handleSeeked = () => {
        if (vidEl.videoWidth > 0 && vidEl.videoHeight > 0) {
          const col = currentSampleIndex % config.cols;
          const row = Math.floor(currentSampleIndex / config.cols);
          const x = col * config.tileWidth;
          const y = row * config.tileHeight;
          try {
            ctx.drawImage(
              vidEl,
              0,
              0,
              vidEl.videoWidth,
              vidEl.videoHeight,
              x,
              y,
              config.tileWidth,
              config.tileHeight
            );
            successfulFrames++;
          } catch {
            // Tainted canvas or draw failure — ignore frame
          }
        }
        currentSampleIndex++;
        seekNext();
      };

      vidEl.addEventListener('seeked', handleSeeked);
      vidEl.addEventListener('loadedmetadata', () => {
        seekNext();
      });
      vidEl.addEventListener('error', () => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(false);
      });

      // Safety timeout
      timeoutId = setTimeout(() => {
        resolve(successfulFrames > 0);
      }, 5000);

      vidEl.load();
    });

    // Only export and cache if real frames were captured
    if (successfulFrames >= 2) {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        if (videoId && dataUrl && dataUrl.length > 500) {
          setCachedContactSheet(videoId, dataUrl);
        }
        return dataUrl;
      } catch {
        return null;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (offscreenVideo) {
      try {
        offscreenVideo.pause();
        offscreenVideo.removeAttribute('src');
        offscreenVideo.load();
        offscreenVideo.remove();
      } catch {}
    }
  }
}
