'use client';

import { api } from './api';
import { canvasToWebP, generateBlurhashFromCanvas } from './thumbnailOptimizer';

/**
 * Creates a clean fallback canvas graphic if video decoding is blocked
 */
function createFallbackCanvas(label: string = 'Video'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Dark modern gradient background
    const grad = ctx.createLinearGradient(0, 0, 640, 360);
    grad.addColorStop(0, '#090d16');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 360);

    // Decorative center emblem
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(280, 120, 80, 80, 20);
    ctx.fill();

    // Play icon
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(312, 145);
    ctx.lineTo(358, 160);
    ctx.lineTo(312, 175);
    ctx.closePath();
    ctx.fill();

    // Text title
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const displayLabel = label.length > 30 ? label.slice(0, 28) + '...' : label;
    ctx.fillText(displayLabel, 320, 240);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('My Vault Media', 320, 270);
  }
  return canvas;
}

/**
 * Extract frame from video at specific timestamp (default 15s)
 * Supports: HTMLCanvasElement, HTMLVideoElement, File/Blob, or URL string
 */
export async function extractVideoFrame(
  videoSource: string | File | Blob | HTMLVideoElement | HTMLCanvasElement,
  timestamp: number = 15,
  labelFallback: string = 'Video'
): Promise<HTMLCanvasElement> {
  // 1. If already an HTMLCanvasElement, return directly
  if (typeof HTMLCanvasElement !== 'undefined' && videoSource instanceof HTMLCanvasElement) {
    return videoSource;
  }

  // 2. If an active playing HTMLVideoElement is passed (Snap Frame)
  if (typeof HTMLVideoElement !== 'undefined' && videoSource instanceof HTMLVideoElement) {
    if (videoSource.videoWidth > 0 && videoSource.videoHeight > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoSource.videoWidth;
        canvas.height = videoSource.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(videoSource, 0, 0, canvas.width, canvas.height);
          // Verify canvas is readable and untainted
          canvas.toDataURL('image/jpeg', 0.1);
          return canvas;
        }
      } catch (e) {
        console.warn('Direct HTMLVideoElement draw tainted or unavailable, falling back to seek URL:', e);
      }
    }
  }

  // 3. Resolve video source URL
  let isBlobUrl = false;
  let videoUrl: string = '';

  if (typeof videoSource !== 'string') {
    if (typeof File !== 'undefined' && videoSource instanceof File) {
      videoUrl = URL.createObjectURL(videoSource);
      isBlobUrl = true;
    } else if (typeof Blob !== 'undefined' && videoSource instanceof Blob) {
      videoUrl = URL.createObjectURL(videoSource);
      isBlobUrl = true;
    } else if (typeof HTMLVideoElement !== 'undefined' && videoSource instanceof HTMLVideoElement) {
      videoUrl = videoSource.currentSrc || videoSource.src;
    }
  } else {
    videoUrl = videoSource;
  }

  if (!videoUrl) {
    return createFallbackCanvas(labelFallback);
  }

  // 4. Create an offscreen video element to seek and capture the exact frame
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.autoplay = false;

    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;
    let hasSeeked = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('error', handleError);
      if (isBlobUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const tryCaptureFrame = (): boolean => {
      if (resolved) return true;
      try {
        if (!video.videoWidth || !video.videoHeight) return false;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return false;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Test export to make sure it's valid & untainted
        canvas.toDataURL('image/jpeg', 0.1);

        resolved = true;
        cleanup();
        resolve(canvas);
        return true;
      } catch (err) {
        console.warn('tryCaptureFrame error:', err);
        return false;
      }
    };

    const handleSeeked = () => {
      if (tryCaptureFrame()) return;
      // Allow video decoder a frame tick
      setTimeout(() => {
        if (!tryCaptureFrame() && !resolved) {
          resolved = true;
          cleanup();
          resolve(createFallbackCanvas(labelFallback));
        }
      }, 50);
    };

    const handleTimeUpdate = () => {
      if (hasSeeked && video.readyState >= 2) {
        tryCaptureFrame();
      }
    };

    const handleCanPlay = () => {
      if (hasSeeked && video.readyState >= 2) {
        tryCaptureFrame();
      }
    };

    const handleLoadedData = () => {
      if (video.readyState >= 2 && !hasSeeked && timestamp <= 0.5) {
        tryCaptureFrame();
      }
    };

    const handleLoadedMetadata = () => {
      const duration = video.duration || 0;
      let targetTime = timestamp;

      if (duration > 0) {
        if (targetTime > duration) {
          targetTime = Math.max(0.1, duration - 0.5);
        } else if (targetTime <= 0) {
          targetTime = Math.min(1, duration * 0.1);
        }
      }

      hasSeeked = true;
      try {
        video.currentTime = targetTime;
      } catch {
        tryCaptureFrame();
      }
    };

    const handleError = () => {
      if (resolved) return;
      console.warn('Video frame capture error event on video element');
      // If anonymous CORS failed, try without crossOrigin as fallback
      if (video.crossOrigin) {
        video.removeAttribute('crossorigin');
        video.src = videoUrl;
        video.load();
        return;
      }
      resolved = true;
      cleanup();
      resolve(createFallbackCanvas(labelFallback));
    };

    // Safety timeout: 10s
    timeoutId = setTimeout(() => {
      if (resolved) return;
      if (!tryCaptureFrame()) {
        resolved = true;
        cleanup();
        resolve(createFallbackCanvas(labelFallback));
      }
    }, 10000);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('error', handleError);

    video.src = videoUrl;
    video.load();
  });
}

export interface ThumbnailGenerationResult {
  thumbnailKey: string;
  blurhash?: string;
}

/**
 * Generate and upload thumbnail for a video (15s timestamp default)
 */
export async function generateAndUploadThumbnail(
  videoSource: string | File | Blob | HTMLVideoElement | HTMLCanvasElement,
  originalFilename: string,
  timestamp: number = 15
): Promise<ThumbnailGenerationResult | null> {
  try {
    // Extract frame from video with safe fallback
    const canvas = await extractVideoFrame(videoSource, timestamp, originalFilename);

    // Generate blurhash for LQIP (instant 0ms placeholder)
    let blurhash: string | undefined;
    try {
      blurhash = await generateBlurhashFromCanvas(canvas);
    } catch {
      // Blurhash generation is optional
    }

    // Compress to WebP (<20KB)
    const blob = await canvasToWebP(canvas, 0.8);

    // Clean sanitized filename
    const safeBaseName = (originalFilename || 'video')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 32);

    // Get presigned upload URL
    const uploadRes = await api.initiateThumbnailUpload({
      filename: `${safeBaseName}_thumb.webp`,
      mimeType: 'image/webp',
      size: blob.size,
    });

    if (!uploadRes || !uploadRes.uploadUrl || !uploadRes.storageKey) {
      throw new Error('Failed to get presigned upload URL for thumbnail');
    }

    // Direct PUT upload to storage or Next.js receiver
    const uploadResponse = await fetch(uploadRes.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/webp',
      },
      body: blob,
    });

    if (!uploadResponse.ok) {
      console.warn(`Thumbnail PUT upload returned ${uploadResponse.status}, proceeding with storage key`);
    }

    return {
      thumbnailKey: uploadRes.storageKey,
      blurhash,
    };
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return null;
  }
}

/**
 * Reprocess and update thumbnail for a single video at a specific timestamp or from live frame
 */
export async function reprocessSingleVideoThumbnail(
  videoId: string,
  originalFilename: string,
  timestamp: number = 15,
  customStreamUrl?: string,
  videoElement?: HTMLVideoElement | null
): Promise<{ success: boolean; thumbnailKey?: string; blurhash?: string; error?: string }> {
  try {
    let source: string | File | Blob | HTMLVideoElement | HTMLCanvasElement;

    // If active video element is provided (for Snap Frame)
    if (videoElement && videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
      try {
        const snapCanvas = document.createElement('canvas');
        snapCanvas.width = videoElement.videoWidth;
        snapCanvas.height = videoElement.videoHeight;
        const ctx = snapCanvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(videoElement, 0, 0, snapCanvas.width, snapCanvas.height);
          snapCanvas.toDataURL('image/jpeg', 0.5);
          source = snapCanvas;
        } else {
          source = customStreamUrl || '';
        }
      } catch (taintErr) {
        console.warn('Direct canvas draw tainted, falling back to stream URL seeking:', taintErr);
        source = customStreamUrl || '';
      }
    } else {
      let streamUrl = customStreamUrl;
      if (!streamUrl) {
        const streamRes = await api.getStreamUrl(videoId, true);
        if (!streamRes.success || !streamRes.streamUrl) {
          throw new Error('Could not acquire temporary stream URL');
        }
        streamUrl = streamRes.streamUrl;
      }
      source = streamUrl;
    }

    const result = await generateAndUploadThumbnail(source, originalFilename, timestamp);
    if (!result?.thumbnailKey) {
      throw new Error('Thumbnail upload could not be completed.');
    }

    await api.attachThumbnail(videoId, result.thumbnailKey, result.blurhash);
    return {
      success: true,
      thumbnailKey: result.thumbnailKey,
      blurhash: result.blurhash,
    };
  } catch (err: any) {
    console.error('Failed to reprocess single thumbnail:', err);
    return {
      success: false,
      error: err.message || 'Failed to generate thumbnail',
    };
  }
}

/**
 * Batch generate thumbnails for multiple videos
 */
export async function batchGenerateThumbnails(
  videos: Array<{
    id: string;
    streamUrl?: string;
    originalFilename: string;
    title?: string;
  }>,
  onProgress?: (current: number, total: number, currentTitle?: string, isSuccess?: boolean) => void,
  timestamp: number = 15
): Promise<{ success: number; failed: number }> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const displayTitle = video.title || video.originalFilename || `Video ${i + 1}`;

    try {
      let streamUrl = video.streamUrl;
      if (!streamUrl) {
        const streamRes = await api.getStreamUrl(video.id);
        streamUrl = streamRes?.streamUrl;
      }

      if (!streamUrl) {
        throw new Error('Could not acquire temporary stream URL');
      }

      const result = await generateAndUploadThumbnail(streamUrl, video.originalFilename, timestamp);

      if (result?.thumbnailKey) {
        await api.attachThumbnail(video.id, result.thumbnailKey, result.blurhash);
        successCount++;
        if (onProgress) {
          onProgress(i + 1, videos.length, displayTitle, true);
        }
      } else {
        failedCount++;
        if (onProgress) {
          onProgress(i + 1, videos.length, displayTitle, false);
        }
      }
    } catch (error) {
      console.error(`Failed to generate thumbnail for video ${video.id}:`, error);
      failedCount++;
      if (onProgress) {
        onProgress(i + 1, videos.length, displayTitle, false);
      }
    }

    if (i < videos.length - 1) {
      await delay(200);
    }
  }

  return {
    success: successCount,
    failed: failedCount,
  };
}
