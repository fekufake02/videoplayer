'use client';

import { api } from './api';
import { canvasToWebP, generateBlurhashFromCanvas } from './thumbnailOptimizer';

/**
 * Extract frame from video at specific timestamp
 */
export async function extractVideoFrame(
  videoUrl: string,
  timestamp: number = 0.5
): Promise<HTMLCanvasElement> {
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
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    video.src = videoUrl;
  });
}

/**
 * Generate and upload thumbnail for a video
 */
export async function generateAndUploadThumbnail(
  streamUrl: string,
  originalFilename: string,
  timestamp: number = 1
): Promise<string | null> {
  try {
    // Extract frame from video
    const canvas = await extractVideoFrame(streamUrl, timestamp);

    // Generate blurhash for LQIP
    const blurhash = await generateBlurhashFromCanvas(canvas);

    // Compress to WebP
    const blob = await canvasToWebP(canvas, 0.7);

    // Create unique thumbnail key
    const videoId = originalFilename.split('.')[0];
    const thumbnailKey = `thumbnails/${videoId}/thumbnail.webp`;

    // Get upload URL
    const uploadRes = await api.initiateUploadDirect({
      filename: 'thumbnail.webp',
      mimeType: 'image/webp',
      size: blob.size,
    });

    if (!uploadRes.uploadUrl) throw new Error('Failed to get upload URL');

    // Upload WebP thumbnail
    const uploadResponse = await fetch(uploadRes.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/webp',
      },
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    return thumbnailKey;
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    return null;
  }
}

/**
 * Batch generate thumbnails for multiple videos
 * Used for migrating existing videos
 */
export async function batchGenerateThumbnails(
  videos: Array<{
    id: string;
    streamUrl: string;
    originalFilename: string;
  }>,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    try {
      const thumbnailKey = await generateAndUploadThumbnail(
        video.streamUrl,
        video.originalFilename
      );

      if (thumbnailKey) {
        // Attach to video
        await api.attachThumbnail(video.id, thumbnailKey);
      }
    } catch (error) {
      console.error(`Failed to generate thumbnail for ${video.id}:`, error);
    }

    // Rate limiting: 500ms between generations to avoid API throttling
    if (i < videos.length - 1) {
      await delay(500);
    }

    if (onProgress) {
      onProgress(i + 1, videos.length);
    }
  }
}
