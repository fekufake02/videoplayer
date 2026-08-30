'use client';

import { api } from './api';
import { canvasToWebP, generateBlurhashFromCanvas } from './thumbnailOptimizer';

/**
 * Creates a clean fallback canvas graphic if video decoding is blocked by CORS
 */
function createFallbackCanvas(label: string = 'Video'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Dark modern gradient background
    const grad = ctx.createLinearGradient(0, 0, 640, 360);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 360);

    // Decorative center emblem
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(280, 120, 80, 80, 20);
    ctx.fill();

    // Play icon or initial
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(312, 145);
    ctx.lineTo(358, 160);
    ctx.lineTo(312, 175);
    ctx.closePath();
    ctx.fill();

    // Text title
    ctx.fillStyle = '#e2e8f0';
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
 * Extract frame from video at specific timestamp (default 15s to avoid black intros)
 */
export async function extractVideoFrame(
  videoSource: string | File | HTMLVideoElement | HTMLCanvasElement,
  timestamp: number = 15,
  labelFallback: string = 'Video'
): Promise<HTMLCanvasElement> {
  // If already a canvas, return immediately
  if (typeof HTMLCanvasElement !== 'undefined' && videoSource instanceof HTMLCanvasElement) {
    return videoSource;
  }

  // If already an active HTMLVideoElement
  if (typeof HTMLVideoElement !== 'undefined' && videoSource instanceof HTMLVideoElement) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoSource.videoWidth || 640;
      canvas.height = videoSource.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        ctx.drawImage(videoSource, 0, 0, canvas.width, canvas.height);
        // Test if canvas is tainted
        canvas.toDataURL('image/webp', 0.1);
        return canvas;
      }
    } catch {
      // Continue to URL / Blob method if active video is tainted
    }
  }

  // Handle File, Blob, or URL string
  const isFile = typeof videoSource !== 'string';
  let videoUrl: string;
  let isBlobUrl = false;

  if (isFile) {
    videoUrl = URL.createObjectURL(videoSource as File);
    isBlobUrl = true;
  } else {
    // If URL string, first try fetching a chunk as Blob to avoid CORS/tainting
    const sourceStr = videoSource as string;
    try {
      // Try fetching first ~5MB chunk or full blob with Range header
      const resp = await fetch(sourceStr, {
        headers: { Range: 'bytes=0-5242880' },
      });
      if (resp.ok || resp.status === 206) {
        const blob = await resp.blob();
        if (blob.size > 1000) {
          videoUrl = URL.createObjectURL(blob);
          isBlobUrl = true;
        } else {
          videoUrl = sourceStr;
        }
      } else {
        videoUrl = sourceStr;
      }
    } catch {
      videoUrl = sourceStr;
    }
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    if (!isBlobUrl) {
      video.crossOrigin = 'anonymous';
    }
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
      if (isBlobUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };

    const tryCaptureFrame = (): boolean => {
      if (resolved) return true;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0 || canvas.height === 0) return false;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Test if canvas is tainted
        canvas.toDataURL('image/webp', 0.1);
        resolved = true;
        cleanup();
        resolve(canvas);
        return true;
      } catch {
        return false;
      }
    };

    const handleSeeked = () => {
      if (!tryCaptureFrame()) {
        resolved = true;
        cleanup();
        resolve(createFallbackCanvas(labelFallback));
      }
    };

    const handleLoadedData = () => {
      // If we don't need seeking (or 0s), or as early snapshot
      if (video.currentTime === 0 && timestamp <= 1) {
        tryCaptureFrame();
      }
    };

    const handleLoadedMetadata = () => {
      const duration = video.duration || 0;
      const targetTime = duration > (timestamp + 1)
        ? timestamp
        : (duration > 2 ? duration * 0.5 : Math.max(0.1, duration * 0.2));

      try {
        video.currentTime = targetTime;
      } catch {
        // If seeking fails, attempt immediate capture
        tryCaptureFrame();
      }
    };

    const handleError = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(createFallbackCanvas(labelFallback));
    };

    // 8-second safety timeout: fallback gracefully instead of throwing
    timeoutId = setTimeout(() => {
      if (resolved) return;
      if (!tryCaptureFrame()) {
        resolved = true;
        cleanup();
        resolve(createFallbackCanvas(labelFallback));
      }
    }, 8000);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', handleSeeked);
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
  videoSource: string | File | HTMLVideoElement | HTMLCanvasElement,
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
    const blob = await canvasToWebP(canvas, 0.75);

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
 * Reprocess and update thumbnail for a single video at a specific timestamp
 */
export async function reprocessSingleVideoThumbnail(
  videoId: string,
  originalFilename: string,
  timestamp: number = 15,
  customStreamUrl?: string,
  videoElement?: HTMLVideoElement | null
): Promise<{ success: boolean; thumbnailKey?: string; blurhash?: string; error?: string }> {
  try {
    // If video element from player is passed, use it directly or streamUrl
    let source: string | HTMLVideoElement = videoElement || '';
    if (!videoElement || videoElement.readyState < 2) {
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
      // Fetch fresh stream URL if not already provided
      let streamUrl = video.streamUrl;
      if (!streamUrl) {
        const streamRes = await api.getStreamUrl(video.id);
        streamUrl = streamRes?.streamUrl;
      }

      if (!streamUrl) {
        throw new Error('Could not acquire temporary stream URL');
      }

      // Generate & upload thumbnail at designated timestamp (15s default)
      const result = await generateAndUploadThumbnail(streamUrl, video.originalFilename, timestamp);

      if (result?.thumbnailKey) {
        // Attach thumbnail key and blurhash to video record
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

    // Rate limiting delay between generations to ensure smooth client performance
    if (i < videos.length - 1) {
      await delay(250);
    }
  }

  return {
    success: successCount,
    failed: failedCount,
  };
}
