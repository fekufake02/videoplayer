import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { z } from 'zod';
import { DriveVideo } from '../models/DriveVideo';
import { driveService } from '../services/driveService';
import { b2Service } from '../services/b2Service';
import { AuthenticatedRequest } from '../middleware/auth';

/**
 * List all Google Drive videos from the database
 */
export const listDriveVideos = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(1000, Math.max(1, parseInt((req.query.limit as string) || '500', 10)));
    const search = ((req.query.search as string) || '').trim();
    const sort = (req.query.sort as string) || 'recentlyAdded';

    let count = await DriveVideo.countDocuments();

    // Auto-sync on first visit if database is empty
    if (count === 0) {
      await driveService.syncFolder();
      count = await DriveVideo.countDocuments();
    }

    const query: any = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { originalFilename: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
      ];
    }

    let sortOption: any = { createdAt: -1 };
    if (sort === 'title') sortOption = { title: 1 };
    else if (sort === 'oldest') sortOption = { createdAt: 1 };
    else if (sort === 'duration') sortOption = { duration: -1 };

    const total = await DriveVideo.countDocuments(query);
    const videos = await DriveVideo.find(query)
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit);

    // Refresh B2 presigned URLs if needed
    const resolvedVideos = await Promise.all(
      videos.map(async (v) => {
        const item = v.toObject();
        if (item.thumbnailKey) {
          try {
            const b2Url = await b2Service.getPresignedThumbnailUrl(
              item.thumbnailKey,
              item.thumbnailStorageAccount || 'account2',
              7200
            );
            if (b2Url) item.thumbnailUrl = b2Url;
          } catch {}
        }
        return item;
      })
    );

    res.status(200).json({
      success: true,
      videos: resolvedVideos,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      folderId: driveService.getConfiguredFolderId() || 'default',
    });
  } catch (error) {
    console.error('List Drive videos error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list Drive videos' },
    });
  }
};

/**
 * Trigger sync of public Google Drive folder
 */
export const syncDriveFolder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const folderUrl = req.body?.folderUrl || req.body?.folderId;
    const result = await driveService.syncFolder(folderUrl);

    res.status(200).json({
      success: true,
      message: `Synced ${result.syncedCount} videos from Google Drive folder (${result.newCount} new).`,
      folderId: result.folderId,
      syncedCount: result.syncedCount,
      newCount: result.newCount,
      videos: result.videos,
    });
  } catch (error) {
    console.error('Sync Drive folder error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to sync Google Drive folder' },
    });
  }
};

/**
 * Get details for a single Drive video
 */
export const getDriveVideoDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    let video = await DriveVideo.findById(id);
    if (!video) {
      video = await DriveVideo.findOne({ driveFileId: id });
    }

    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Drive video not found' },
      });
      return;
    }

    const item = video.toObject();
    if (item.thumbnailKey) {
      try {
        const b2Url = await b2Service.getPresignedThumbnailUrl(
          item.thumbnailKey,
          item.thumbnailStorageAccount || 'account2',
          7200
        );
        if (b2Url) item.thumbnailUrl = b2Url;
      } catch {}
    }

    res.status(200).json({
      success: true,
      video: item,
    });
  } catch (error) {
    console.error('Get Drive video details error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch Drive video details' },
    });
  }
};

/**
 * Initiate B2 presigned upload URL for a Google Drive video thumbnail
 */
export const initiateDriveThumbnailUpload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { filename, mimeType, driveFileId } = req.body || {};
    const safeFilename = filename || 'thumbnail.webp';
    const safeMime = mimeType || 'image/webp';
    const targetFileId = driveFileId || crypto.randomBytes(6).toString('hex');
    const randomUuid = crypto.randomUUID();

    const rawExt = path.extname(safeFilename) || '.webp';
    const safeExt = rawExt.replace(/[^a-zA-Z0-9.]/g, '');
    const storageKey = `thumbnails/drive/${targetFileId}/${randomUuid}${safeExt}`;
    const targetAccount = 'account2';

    const uploadUrl = await b2Service.getPresignedUploadUrl(storageKey, safeMime, 900, targetAccount);

    res.status(200).json({
      success: true,
      uploadUrl,
      storageKey,
      storageAccount: targetAccount,
      driveFileId: targetFileId,
    });
  } catch (error) {
    console.error('Initiate Drive thumbnail upload error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to initiate B2 thumbnail upload' },
    });
  }
};

/**
 * Attach custom B2 thumbnail to a Google Drive video
 */
export const attachDriveThumbnail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { thumbnailKey, blurhash, storageAccount } = req.body || {};

    if (!thumbnailKey) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Missing thumbnailKey' },
      });
      return;
    }

    let video = await DriveVideo.findById(id);
    if (!video) {
      video = await DriveVideo.findOne({ driveFileId: id });
    }

    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Drive video not found' },
      });
      return;
    }

    const accountToUse = storageAccount || 'account2';
    video.thumbnailKey = thumbnailKey;
    video.thumbnailStorageAccount = accountToUse;
    if (blurhash) video.blurhash = blurhash;

    const b2ThumbnailUrl = await b2Service.getPresignedThumbnailUrl(thumbnailKey, accountToUse, 7200);
    video.thumbnailUrl = b2ThumbnailUrl;

    await video.save();

    res.status(200).json({
      success: true,
      video,
      thumbnailUrl: b2ThumbnailUrl,
    });
  } catch (error) {
    console.error('Attach Drive thumbnail error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to attach custom thumbnail' },
    });
  }
};

/**
 * Get playable stream URL and embed preview for a Drive video
 */
export const getDriveStreamUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    let video = await DriveVideo.findById(id);
    if (!video) {
      video = await DriveVideo.findOne({ driveFileId: id });
    }

    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Drive video not found' },
      });
      return;
    }

    const fileId = video.driveFileId;
    const directStreamUrl = video.driveStreamUrl || `https://drive.google.com/uc?export=download&id=${fileId}`;
    const embedPreviewUrl = `https://drive.google.com/file/d/${fileId}/preview`;

    res.status(200).json({
      success: true,
      driveFileId: fileId,
      streamUrl: directStreamUrl,
      chunkStreamUrl: `/api/drive/videos/${fileId}/chunk-stream`,
      embedPreviewUrl,
      thumbnailUrl: video.thumbnailUrl,
      title: video.title,
    });
  } catch (error) {
    console.error('Get Drive stream URL error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get Drive stream URL' },
    });
  }
};

/**
 * Stream Drive video chunk with HTTP Range request forwarding
 * Enables smooth playback, rapid seeks, and prevents downloading the entire video at once
 */
export const streamDriveVideoChunk = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    let video = await DriveVideo.findById(id);
    if (!video) {
      video = await DriveVideo.findOne({ driveFileId: id });
    }

    const fileId = video?.driveFileId || id;
    const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const driveRes = await fetch(driveUrl, { headers });

    res.status(driveRes.status);
    driveRes.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (['content-range', 'content-length', 'content-type', 'accept-ranges'].includes(lower)) {
        res.setHeader(key, val);
      }
    });

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (!driveRes.body) {
      res.end();
      return;
    }

    const reader = driveRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        break;
      }
      res.write(Buffer.from(value));
    }
  } catch (error) {
    console.error('Stream Drive video chunk error:', error);
    res.status(500).end();
  }
};
