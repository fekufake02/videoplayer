import { api } from './api';

/**
 * Generates a 480x270 WebP image Blob from a video File or video stream URL
 */
export async function generateCanvasWebpThumbnail(
  source: File | string,
  seekTime: number = 1.0
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let objectUrl: string | null = null;
    if (source instanceof File) {
      objectUrl = URL.createObjectURL(source);
      video.src = objectUrl;
    } else {
      video.src = source;
    }

    const cleanup = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 10000); // 10s safety timeout

    video.addEventListener('loadeddata', () => {
      video.currentTime = Math.min(seekTime, (video.duration || 2) / 2);
    });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        const width = 480;
        const height = 270;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          clearTimeout(timeoutId);
          cleanup();
          resolve(null);
          return;
        }

        ctx.drawImage(video, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            clearTimeout(timeoutId);
            cleanup();
            resolve(blob);
          },
          'image/webp',
          0.85
        );
      } catch (err) {
        console.warn('Canvas thumbnail capture error:', err);
        clearTimeout(timeoutId);
        cleanup();
        resolve(null);
      }
    });

    video.addEventListener('error', () => {
      clearTimeout(timeoutId);
      cleanup();
      resolve(null);
    });
  });
}

/**
 * Generates and uploads a WebP thumbnail for a video file or existing video ID to Backblaze B2
 */
export async function generateAndUploadThumbnail(
  source: File | string,
  baseFilename: string
): Promise<string | null> {
  try {
    const blob = await generateCanvasWebpThumbnail(source);
    if (!blob) return null;

    const thumbFilename = `${baseFilename.replace(/\.[^/.]+$/, '')}_thumb.webp`;
    const initRes = await api.initiateUpload({
      title: thumbFilename,
      filename: thumbFilename,
      mimeType: 'image/webp',
      size: blob.size,
    });

    const { uploadUrl, storageKey } = initRes;

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', 'image/webp');
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Thumbnail upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network error uploading thumbnail'));
      xhr.send(blob);
    });

    return storageKey;
  } catch (err) {
    console.warn('Failed to generate & upload WebP thumbnail:', err);
    return null;
  }
}
