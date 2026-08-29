'use client';

import { api } from './api';
import { canvasToWebP, generateBlurhashFromCanvas } from './thumbnailOptimizer';

/**
 * Extract frame from video at specific timestamp
 */
export async function extractVideoFrame(
  videoSource: string | File,
  timestamp: number = 0.5
): Promise<HTMLCanvasElement> {
  const isFile = typeof videoSource !== 'string';
  const videoUrl = isFile ? URL.createObjectURL(videoSource) : videoSource;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const handleLoadedMetadata = () => {
      video.currentTime = Math.min(timestamp, video.duration * 0.9);
    };

    const handleSeeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cleanup();
        reject(new Error('Canvas context failed'));
        return;
      }

      ctx.drawImage(video, 0, 0);
      cleanup();
      resolve(canvas);
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Video loading failed'));
    };

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      if (isFile) {
        URL.revokeObjectURL(videoUrl);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    video.src = videoUrl;
  });
}

export interface ThumbnailGenerationResult {
  thumbnailKey: string;
  blurhash?: string;
}

/**
 * Generate and upload thumbnail for a video
 */
export async function generateAndUploadThumbnail(
  videoSource: string | File,
  originalFilename: string,
  timestamp: number = 1
): Promise<ThumbnailGenerationResult | null> {
  try {
    // Extract frame from video
    const canvas = await extractVideoFrame(videoSource, timestamp);

    // Generate blurhash for LQIP (instant 0ms placeholder)
    let blurhash: string | undefined;
    try {
      blurhash = await generateBlurhashFromCanvas(canvas);
    } catch {
      // Blurhash generation is optional
    }

    // Compress to WebP (<20KB)
    const blob = await canvasToWebP(canvas, 0.7);

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

    if (!uploadRes || !uploadRes.uploadUrl) {
      throw new Error('Failed to get presigned upload URL for thumbnail');
    }

    // Direct PUT upload to B2 / storage
    const uploadResponse = await fetch(uploadRes.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/webp',
      },
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Thumbnail upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    return {
      thumbnailKey: uploadRes.storageKey,
      blurhash,
    };
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    return null;
  }
}

/**
 * Batch generate thumbnails for multiple videos
 * Used for migrating existing videos (200+ collection)
 */
export async function batchGenerateThumbnails(
  videos: Array<{
    id: string;
    streamUrl?: string;
    originalFilename: string;
    title?: string;
  }>,
  onProgress?: (current: number, total: number, currentTitle?: string, isSuccess?: boolean) => void
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

      // Generate & upload thumbnail
      const result = await generateAndUploadThumbnail(streamUrl, video.originalFilename);

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
