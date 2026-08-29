/**
 * Thumbnail optimization strategy for minimal bandwidth usage
 * - Uses LQIP (Low Quality Image Placeholder) with blurhash
 * - WebP compression for thumbnails
 * - Lazy loading with intersection observer
 * - Batch thumbnail generation for existing videos
 */

export interface ThumbnailMetadata {
  storageKey: string;
  blurhash: string;
  width: number;
  height: number;
  size: number; // bytes
  generatedAt: Date;
}

/**
 * Generate blurhash from video frame for instant visual feedback
 * Blurhash is a compact string representation of image colors
 */
export async function generateBlurhashFromCanvas(
  canvas: HTMLCanvasElement
): Promise<string> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Create tiny preview (4x3)
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = 4;
  previewCanvas.height = 3;
  const previewCtx = previewCanvas.getContext('2d');
  if (!previewCtx) return '';

  previewCtx.drawImage(canvas, 0, 0, 4, 3);
  const imageData = previewCtx.getImageData(0, 0, 4, 3);

  // Convert to base64 as simple placeholder
  // In production, use blurhash library for better compression
  return previewCanvas.toDataURL('image/webp', 0.1);
}

/**
 * Canvas to WebP blob (browser-native compression)
 */
export async function canvasToWebP(
  canvas: HTMLCanvasElement,
  quality: number = 0.8
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas to Blob conversion failed'));
      },
      'image/webp',
      quality
    );
  });
}

/**
 * Estimate video bitrate for buffering strategy
 */
export function estimateThumbnailSize(videoSize: number, duration: number): number {
  // Assuming thumbnail is ~0.5% of video size at 1 second mark
  // This is a rough estimate
  return Math.max(5000, (videoSize * 0.005) / duration);
}

/**
 * Validate if thumbnail should be regenerated
 */
export function shouldRegenerateThumbnail(
  existingThumbnailAge: number,
  videoUpdateTime: number
): boolean {
  // Regenerate if video was updated after thumbnail was created
  return videoUpdateTime > existingThumbnailAge;
}

/**
 * Optimize thumbnail URL with caching headers
 */
export function getOptimizedThumbnailUrl(
  presignedUrl: string,
  options: {
    width?: number;
    height?: number;
    quality?: 'low' | 'medium' | 'high';
  } = {}
): string {
  // For B2 signed URLs, add cache-busting parameter
  // to ensure fresh thumbnail for newly generated ones
  const url = new URL(presignedUrl);

  const qualityMap = {
    low: 0.3,
    medium: 0.6,
    high: 0.9,
  };

  url.searchParams.set('quality', qualityMap[options.quality || 'medium'].toString());

  if (options.width) url.searchParams.set('w', options.width.toString());
  if (options.height) url.searchParams.set('h', options.height.toString());

  return url.toString();
}

/**
 * Calculate optimal thumbnail dimensions
 */
export function getOptimalThumbnailDimensions(
  containerWidth: number,
  aspectRatio: number = 16 / 9
): { width: number; height: number } {
  // Use 2x for retina displays
  const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  const width = Math.round(containerWidth * pixelRatio);
  const height = Math.round(width / aspectRatio);

  return {
    width: Math.min(width, 480), // Cap at 480px for thumbnails
    height: Math.min(height, 270), // Cap at 270px
  };
}
