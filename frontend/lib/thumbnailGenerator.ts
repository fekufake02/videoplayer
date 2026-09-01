'use client';

import { api } from './api';
import { canvasToWebP, generateBlurhashFromCanvas } from './thumbnailOptimizer';

/**
 * Creates a clean fallback canvas graphic if video decoding is completely unsupported or blocked
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

  // 2. If an active playing/loaded HTMLVideoElement is passed (e.g. Snap Frame)
  if (typeof HTMLVideoElement !== 'undefined' && videoSource instanceof HTMLVideoElement) {
    if (videoSource.videoWidth > 0 && videoSource.videoHeight > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoSource.videoWidth;
        canvas.height = videoSource.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(videoSource, 0, 0, canvas.width, canvas.height);
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

  // 4. Create an offscreen video element attached to DOM to ensure hardware frame rendering
  return new Promise((resolve) => {
    const video = document.createElement('video');
    
    // Only apply anonymous crossOrigin to remote network URLs (DO NOT apply to blob: URLs)
    const isNetworkUrl = videoUrl.startsWith('http://') || videoUrl.startsWith('https://');
    if (isNetworkUrl) {
      video.crossOrigin = 'anonymous';
    }

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.autoplay = false;

    // Attach offscreen in DOM so the browser's video decoder pipeline allocates hardware frame buffer
    video.style.position = 'fixed';
    video.style.top = '-9999px';
    video.style.left = '-9999px';
    video.style.width = '320px';
    video.style.height = '180px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';

    try {
      if (typeof document !== 'undefined' && document.body) {
        document.body.appendChild(video);
      }
    } catch {}

    let checkInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;
    let hasAttemptedSeek = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (checkInterval) clearInterval(checkInterval);

      video.removeEventListener('loadedmetadata', handleMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('error', handleError);

      try {
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
      } catch {}

      if (isBlobUrl) {
        try {
          URL.revokeObjectURL(videoUrl);
        } catch {}
      }

      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const tryCaptureFrame = (): boolean => {
      if (resolved) return true;
      if (!video.videoWidth || !video.videoHeight) return false;
      if (video.readyState < 2) return false;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return false;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Test export to make sure it's valid & untainted
        const testData = canvas.toDataURL('image/jpeg', 0.1);
        if (!testData || testData.length < 50) return false;

        // Sample pixels to verify non-transparent
        const imgData = ctx.getImageData(0, 0, Math.min(canvas.width, 16), Math.min(canvas.height, 16));
        let hasPixels = false;
        for (let i = 3; i < imgData.data.length; i += 4) {
          if (imgData.data[i] > 0) {
            hasPixels = true;
            break;
          }
        }
        if (!hasPixels) return false;

        resolved = true;
        cleanup();
        resolve(canvas);
        return true;
      } catch (err) {
        console.warn('tryCaptureFrame error:', err);
        return false;
      }
    };

    const seekToTarget = () => {
      if (hasAttemptedSeek && video.currentTime > 0) return;
      hasAttemptedSeek = true;

      const dur = video.duration;
      let seekTime = timestamp;

      if (dur && !isNaN(dur) && dur > 0) {
        if (dur >= timestamp) {
          seekTime = timestamp;
        } else if (dur > 2) {
          // Proportional fallback for short videos
          seekTime = Math.max(0.5, dur * 0.25);
        } else {
          seekTime = Math.max(0.1, dur * 0.1);
        }
      } else {
        seekTime = Math.min(5, timestamp);
      }

      try {
        video.currentTime = seekTime;
      } catch {
        tryCaptureFrame();
      }
    };

    const handleMetadata = () => {
      seekToTarget();
    };

    const handleLoadedData = () => {
      if (!hasAttemptedSeek) {
        seekToTarget();
      }
      tryCaptureFrame();
    };

    const handleCanPlay = () => {
      if (!hasAttemptedSeek) {
        seekToTarget();
      }
      tryCaptureFrame();
    };

    const handleSeeked = () => {
      if (tryCaptureFrame()) return;
      
      // Actively poll for up to 3 seconds while hardware frame buffer populates
      let pollCount = 0;
      if (checkInterval) clearInterval(checkInterval);
      checkInterval = setInterval(() => {
        pollCount++;
        if (tryCaptureFrame() || pollCount > 30) {
          if (checkInterval) clearInterval(checkInterval);
          if (!resolved && pollCount > 30) {
            // Nudge playback once to force hardware render
            video.play().then(() => {
              video.pause();
              setTimeout(() => {
                if (!tryCaptureFrame() && !resolved) {
                  resolved = true;
                  cleanup();
                  resolve(createFallbackCanvas(labelFallback));
                }
              }, 100);
            }).catch(() => {
              if (!resolved) {
                resolved = true;
                cleanup();
                resolve(createFallbackCanvas(labelFallback));
              }
            });
          }
        }
      }, 100);
    };

    const handleTimeUpdate = () => {
      if (hasAttemptedSeek && video.readyState >= 2) {
        tryCaptureFrame();
      }
    };

    const handleError = () => {
      if (resolved) return;
      console.warn('Video frame capture error event on video element');
      // If anonymous CORS failed on network URL, retry without crossOrigin
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

    // Overall 12-second safety timeout
    timeoutId = setTimeout(() => {
      if (resolved) return;
      if (!tryCaptureFrame()) {
        resolved = true;
        cleanup();
        resolve(createFallbackCanvas(labelFallback));
      }
    }, 12000);

    video.addEventListener('loadedmetadata', handleMetadata);
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
  timestamp: number = 15,
  videoId?: string
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
      videoId,
    });

    if (!uploadRes || !uploadRes.uploadUrl || !uploadRes.storageKey) {
      throw new Error('Failed to get presigned upload URL for thumbnail');
    }

    // Direct PUT upload to storage with backend proxy fallback
    try {
      const uploadResponse = await fetch(uploadRes.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/webp',
        },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error(`B2 thumbnail upload status ${uploadResponse.status}`);
      }
    } catch (err) {
      console.warn('Direct thumbnail upload failed, falling back to backend proxy upload:', err);
      const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api` : '/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('metime_auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'image/webp' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const targetAccount = (uploadRes as any).storageAccount || 'account2';

      await fetch(`${backendBase}/videos/upload/proxy?key=${encodeURIComponent(uploadRes.storageKey)}&storageAccount=${targetAccount}`, {
        method: 'PUT',
        headers,
        body: blob,
      });
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

    const result = await generateAndUploadThumbnail(source, originalFilename, timestamp, videoId);
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
