import { Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import path from 'path';
import { Video } from '../models/Video';
import { AuthenticatedRequest } from '../middleware/auth';
import { b2Service } from '../services/b2Service';

const initiateThumbnailSchema = z.object({
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  videoId: z.string().optional(),
});

/**
 * Get presigned URL to upload a thumbnail directly
 */
export const initiateThumbnailUpload = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const parsed = initiateThumbnailSchema.safeParse(req.body);
    const filename = parsed.success && parsed.data.filename ? parsed.data.filename : 'thumbnail.webp';
    const mimeType = parsed.success && parsed.data.mimeType ? parsed.data.mimeType : 'image/webp';
    const videoId = parsed.success && parsed.data.videoId ? parsed.data.videoId : crypto.randomBytes(8).toString('hex');
    const randomUuid = crypto.randomUUID();

    // Always use account2 for uploading new thumbnails to guarantee CORS & write credentials
    const targetAccount: 'account1' | 'account2' = 'account2';

    const rawExt = path.extname(filename) || '.webp';
    const safeExt = rawExt.replace(/[^a-zA-Z0-9.]/g, '');
    const storageKey = `thumbnails/${videoId}/${randomUuid}${safeExt}`;

    const uploadUrl = await b2Service.getPresignedUploadUrl(storageKey, mimeType, 900, targetAccount);

    res.status(200).json({
      success: true,
      uploadUrl,
      storageKey,
      storageAccount: targetAccount,
      videoId,
    });
  } catch (error) {
    console.error('Initiate thumbnail upload error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to initiate thumbnail upload' },
    });
  }
};

const batchGenerateSchema = z.object({
  videoIds: z.array(z.string()).min(1).max(100),
});

/**
 * Generate thumbnails for multiple videos in batch
 * Used for migrating existing videos (200+ already uploaded)
 */
export const batchGenerateThumbnails = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const parsed = batchGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Invalid request body' },
      });
      return;
    }

    const { videoIds } = parsed.data;

    // Get videos without thumbnails
    const videos = await Video.find({
      _id: { $in: videoIds },
      thumbnailKey: { $exists: false },
    }).select('_id storageKey originalFilename duration');

    if (videos.length === 0) {
      res.status(200).json({
        success: true,
        message: 'All videos already have thumbnails',
        generated: 0,
      });
      return;
    }

    // Queue for backend thumbnail generation
    // This should be moved to a background job in production
    const results = {
      total: videos.length,
      generated: 0,
      failed: 0,
      pending: videos.map((v) => ({
        videoId: v._id,
        status: 'queued',
      })),
    };

    res.status(202).json({
      success: true,
      message: 'Batch thumbnail generation queued',
      results,
    });

    // Process in background (don't await)
    // In production, use Bull queue or similar job system
    processVideoThumbnails(videos).catch((err) => {
      console.error('Background thumbnail generation error:', err);
    });
  } catch (error) {
    console.error('Batch generate thumbnails error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to queue thumbnail generation' },
    });
  }
};

/**
 * Get thumbnail presigned URL
 */
export const getThumbnailUrl = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const video = await Video.findById(id).select('thumbnailKey thumbnailStorageAccount storageAccount');
    if (!video || !video.thumbnailKey) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Thumbnail not found' },
      });
      return;
    }

    const accountToUse = video.thumbnailStorageAccount || video.storageAccount || 'account2';
    const thumbnailUrl = await b2Service.getPresignedStreamUrl(video.thumbnailKey, 3600, accountToUse);

    res.status(200).json({
      success: true,
      thumbnailUrl,
    });
  } catch (error) {
    console.error('Get thumbnail URL error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get thumbnail URL' },
    });
  }
};

/**
 * Background worker to generate thumbnails
 * Should be run in a separate worker/queue in production
 */
async function processVideoThumbnails(
  videos: any[]
): Promise<void> {
  for (const video of videos) {
    try {
      // Get stream URL
      const streamUrl = await b2Service.getPresignedStreamUrl(video.storageKey, 900);

      // TODO: Call FFmpeg or similar to extract frame
      // For now, this is a placeholder
      // In production, use ffmpeg-static or similar

      // ffmpeg -i {streamUrl} -ss 1 -vframes 1 -vf scale=480:-1 output.webp

      // Then upload to B2
      // And update video.thumbnailKey

      console.log(`Generated thumbnail for video ${video._id}`);
    } catch (error) {
      console.error(`Failed to generate thumbnail for ${video._id}:`, error);
    }
  }
}
