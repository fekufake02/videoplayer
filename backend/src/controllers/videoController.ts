import { Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import path from 'path';
import { Video } from '../models/Video';
import { Settings } from '../models/Settings';
import { b2Service, StorageAccount } from '../services/b2Service';
import { AuthenticatedRequest } from '../middleware/auth';

const initiateUploadSchema = z.object({
  title: z.string().optional(),
  filename: z.string().min(1, 'Filename is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  size: z.number().positive('File size must be positive').optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const completeUploadSchema = z.object({
  title: z.string().min(1),
  originalFilename: z.string().min(1),
  storageKey: z.string().min(1),
  thumbnailKey: z.string().optional(),
  blurhash: z.string().optional(),
  mimeType: z.string().min(1),
  size: z.number().positive(),
  duration: z.number().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const updateMetadataSchema = z.object({
  title: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  favorite: z.boolean().optional(),
});

export const listVideos = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '24', 10)));
    const skip = (page - 1) * limit;

    const search = (req.query.search as string || '').trim();
    const tag = (req.query.tag as string || '').trim();
    const sort = (req.query.sort as string || 'recentlyAdded');
    const filter = (req.query.filter as string || 'all');

    const query: any = {};

    // Search query matching title, originalFilename, tags, or notes
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { title: searchRegex },
        { originalFilename: searchRegex },
        { tags: searchRegex },
        { notes: searchRegex },
      ];
    }

    if (tag) {
      query.tags = tag;
    }

    // Filter condition
    if (filter === 'favorites') {
      query.favorite = true;
    } else if (filter === 'recentlyWatched') {
      query.lastPlayedAt = { $exists: true, $ne: null };
    } else if (filter === 'unwatched') {
      query.lastPosition = { $eq: 0 };
    } else if (filter === 'completed') {
      query.$expr = {
        $and: [
          { $gt: ['$duration', 0] },
          { $gte: ['$lastPosition', { $subtract: ['$duration', 10] }] },
        ],
      };
    }

    // Sorting strategy
    let sortOption: any = { createdAt: -1 };
    switch (sort) {
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'nameAsc':
        sortOption = { title: 1 };
        break;
      case 'nameDesc':
        sortOption = { title: -1 };
        break;
      case 'recentlyWatched':
        sortOption = { lastPlayedAt: -1 };
        break;
      case 'mostWatched':
        sortOption = { playCount: -1, lastPlayedAt: -1 };
        break;
      case 'longest':
        sortOption = { duration: -1 };
        break;
      case 'shortest':
        sortOption = { duration: 1 };
        break;
      case 'recentlyAdded':
      default:
        sortOption = { createdAt: -1 };
        break;
    }

    const [rawVideos, total] = await Promise.all([
      Video.find(query).sort(sortOption).skip(skip).limit(limit),
      Video.countDocuments(query),
    ]);

    const videos = await Promise.all(
      rawVideos.map(async (v) => {
        const obj = v.toObject();
        if (v.thumbnailKey) {
          try {
            (obj as any).thumbnailUrl = await b2Service.getPresignedStreamUrl(
              v.thumbnailKey,
              3600,
              v.storageAccount || 'account2'
            );
          } catch (e) {}
        }
        return obj;
      })
    );

    res.status(200).json({
      success: true,
      videos,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('List videos error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve video library.' },
    });
  }
};

export const getLibraryHome = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const userSettings = await Settings.findOne({ userId });
    const saveWatchHistory = userSettings ? userSettings.saveWatchHistory : true;

    const limit = 12;

    const [recentlyAdded, mostWatched] = await Promise.all([
      Video.find().sort({ createdAt: -1 }).limit(limit),
      Video.find({ playCount: { $gt: 0 } })
        .sort({ playCount: -1, lastPlayedAt: -1 })
        .limit(limit),
    ]);

    let continueWatching: any[] = [];
    let recentlyWatched: any[] = [];

    if (saveWatchHistory) {
      [continueWatching, recentlyWatched] = await Promise.all([
        Video.find({
          lastPosition: { $gt: 10 },
          lastPlayedAt: { $exists: true, $ne: null },
          $expr: {
            $or: [
              { $eq: ['$duration', 0] },
              { $lt: ['$lastPosition', { $subtract: ['$duration', 15] }] },
            ],
          },
        })
          .sort({ lastPlayedAt: -1 })
          .limit(limit),

        Video.find({ lastPlayedAt: { $exists: true, $ne: null } })
          .sort({ lastPlayedAt: -1 })
          .limit(limit),
      ]);
    }

    res.status(200).json({
      success: true,
      continueWatching,
      recentlyWatched,
      mostWatched,
      recentlyAdded,
    });
  } catch (error) {
    console.error('Get library home error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve library homepage sections.' },
    });
  }
};

export const initiateUpload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = initiateUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Invalid file upload parameters.' },
      });
      return;
    }

    const { filename, mimeType, title } = parsed.data;

    // Validate supported video and image MIME types
    const isImage = mimeType.toLowerCase().startsWith('image/');
    const allowedVideoPrefixes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska'];
    const isVideo = allowedVideoPrefixes.some((prefix) => mimeType.toLowerCase().startsWith(prefix));

    if (!isImage && !isVideo) {
      res.status(400).json({
        success: false,
        error: { code: 'UNSUPPORTED_FORMAT', message: 'Only standard web video formats (MP4, WebM, MOV, MKV) and image formats (WebP, JPEG, PNG) are supported.' },
      });
      return;
    }

    const rawExt = path.extname(filename) || (isImage ? '.webp' : '.mp4');
    const safeExt = rawExt.replace(/[^a-zA-Z0-9.]/g, '');
    const videoId = crypto.randomBytes(8).toString('hex');
    const randomUuid = crypto.randomUUID();

    // Storage Key layout:
    // Videos: videos/{videoId}/original/{uuid}.mp4
    // Thumbnails: thumbnails/{videoId}/{uuid}.webp
    const storageKey = isImage
      ? `thumbnails/${videoId}/${randomUuid}${safeExt}`
      : `videos/${videoId}/original/${randomUuid}${safeExt}`;

    const uploadUrl = await b2Service.getPresignedUploadUrl(storageKey, mimeType, 900, 'account2');

    res.status(200).json({
      success: true,
      uploadUrl,
      storageKey,
      videoId,
    });
  } catch (error) {
    console.error('Initiate upload error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'UPLOAD_INIT_FAILED', message: 'Failed to initiate video upload.' },
    });
  }
};

export const completeUpload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = completeUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Invalid completed upload payload.' },
      });
      return;
    }

    const { title, originalFilename, storageKey, thumbnailKey, blurhash, mimeType, size, duration, tags, notes } = parsed.data;

    // Verify file actually landed in Backblaze B2
    const exists = await b2Service.checkObjectExists(storageKey, 'account2');
    if (!exists) {
      res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: 'Uploaded video file was not found in Backblaze B2 storage.' },
      });
      return;
    }

    const video = await Video.create({
      title: title || originalFilename,
      originalFilename,
      storageKey,
      storageAccount: 'account2',
      thumbnailKey: thumbnailKey || undefined,
      blurhash: blurhash || undefined,
      mimeType,
      size,
      duration: duration || 0,
      tags: tags || [],
      notes: notes || '',
    });

    res.status(201).json({
      success: true,
      video,
    });
  } catch (error) {
    console.error('Complete upload error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'UPLOAD_COMPLETE_FAILED', message: 'Failed to register video metadata.' },
    });
  }
};

export const attachThumbnail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { thumbnailKey, blurhash } = req.body;
    if (!thumbnailKey || typeof thumbnailKey !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'thumbnailKey is required.' },
      });
      return;
    }

    const video = await Video.findById(req.params.id);
    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found.' },
      });
      return;
    }

    // Automatically delete older thumbnail from B2 storage account to save space
    if (video.thumbnailKey && video.thumbnailKey !== thumbnailKey) {
      const accountToUse = video.storageAccount || 'account1';
      console.log(`Deleting previous thumbnail (${video.thumbnailKey}) from B2 ${accountToUse}...`);
      b2Service.deleteObject(video.thumbnailKey, accountToUse).catch((err) => {
        console.warn('Failed to delete old thumbnail from B2:', err);
      });
    }

    video.thumbnailKey = thumbnailKey;
    if (blurhash && typeof blurhash === 'string') {
      video.blurhash = blurhash;
    }
    await video.save();

    res.status(200).json({
      success: true,
      video,
    });
  } catch (error) {
    console.error('Attach thumbnail error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to attach video thumbnail.' },
    });
  }
};

export const getVideoDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found.' },
      });
      return;
    }

    const obj = video.toObject();
    if (video.thumbnailKey) {
      try {
        (obj as any).thumbnailUrl = await b2Service.getPresignedStreamUrl(
          video.thumbnailKey,
          3600,
          video.storageAccount || 'account2'
        );
      } catch (e) {}
    }

    res.status(200).json({
      success: true,
      video: obj,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve video details.' },
    });
  }
};

export const updateVideoMetadata = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = updateMetadataSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Invalid metadata updates.' },
      });
      return;
    }

    const video = await Video.findById(req.params.id);
    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found.' },
      });
      return;
    }

    if (parsed.data.title !== undefined) video.title = parsed.data.title;
    if (parsed.data.tags !== undefined) video.tags = parsed.data.tags;
    if (parsed.data.notes !== undefined) video.notes = parsed.data.notes;
    if (parsed.data.favorite !== undefined) video.favorite = parsed.data.favorite;

    await video.save();

    res.status(200).json({
      success: true,
      video,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update video metadata.' },
    });
  }
};

export const deleteVideo = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found.' },
      });
      return;
    }

    // Delete primary video file from B2
    if (video.storageKey) {
      await b2Service.deleteObject(video.storageKey, video.storageAccount || 'account1');
    }

    // Delete thumbnail file from B2 if present
    if (video.thumbnailKey) {
      await b2Service.deleteObject(video.thumbnailKey, video.storageAccount || 'account1');
    }

    await Video.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Video and storage objects permanently deleted.',
    });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_FAILED', message: 'Failed to delete video.' },
    });
  }
};

export const getStreamUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found.' },
      });
      return;
    }

    // Smart Storage Account Check: default to account2 for new uploads, fallback to account1 if object is legacy
    let accountToUse: StorageAccount = video.storageAccount || 'account2';
    const existsInTarget = await b2Service.checkObjectExists(video.storageKey, accountToUse);
    if (!existsInTarget) {
      const altAccount: StorageAccount = accountToUse === 'account2' ? 'account1' : 'account2';
      const existsInAlt = await b2Service.checkObjectExists(video.storageKey, altAccount);
      if (existsInAlt) {
        accountToUse = altAccount;
        video.storageAccount = altAccount;
        await video.save().catch(() => {});
      }
    }

    const streamUrl = await b2Service.getPresignedStreamUrl(video.storageKey, 900, accountToUse);
    let thumbnailUrl: string | undefined = undefined;

    if (video.thumbnailKey) {
      try {
        thumbnailUrl = await b2Service.getPresignedStreamUrl(video.thumbnailKey, 3600, accountToUse);
      } catch (e) {}
    }

    res.status(200).json({
      success: true,
      streamUrl,
      thumbnailUrl,
    });
  } catch (error) {
    console.error('Stream URL generation error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'STREAM_URL_FAILED', message: 'Failed to generate video streaming URL.' },
    });
  }
};

export const getDownloadUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found.' },
      });
      return;
    }

    const downloadUrl = await b2Service.getPresignedDownloadUrl(
      video.storageKey,
      video.originalFilename,
      900,
      video.storageAccount || 'account1'
    );

    res.status(200).json({
      success: true,
      downloadUrl,
    });
  } catch (error) {
    console.error('Download URL generation error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DOWNLOAD_URL_FAILED', message: 'Failed to generate download URL.' },
    });
  }
};

export const updateProgress = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { position, duration } = req.body;
    if (typeof position !== 'number' || position < 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Position must be a non-negative number.' },
      });
      return;
    }

    const video = await Video.findById(req.params.id);
    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found.' },
      });
      return;
    }

    const userId = req.userId!;
    const settings = await Settings.findOne({ userId });
    const saveWatchHistory = settings ? settings.saveWatchHistory : true;

    video.lastPosition = position;
    if (duration && typeof duration === 'number' && duration > 0) {
      video.duration = duration;
    }

    if (saveWatchHistory) {
      video.lastPlayedAt = new Date();
    }

    await video.save();

    res.status(200).json({
      success: true,
      lastPosition: video.lastPosition,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update playback progress.' },
    });
  }
};

export const recordPlay = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found.' },
      });
      return;
    }

    const userId = req.userId!;
    const settings = await Settings.findOne({ userId });
    const saveWatchHistory = settings ? settings.saveWatchHistory : true;

    if (saveWatchHistory) {
      video.playCount += 1;
      video.lastPlayedAt = new Date();
      await video.save();
    }

    res.status(200).json({
      success: true,
      playCount: video.playCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to record video play.' },
    });
  }
};

export const toggleFavorite = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Video not found.' },
      });
      return;
    }

    video.favorite = !video.favorite;
    await video.save();

    res.status(200).json({
      success: true,
      favorite: video.favorite,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to toggle favorite.' },
    });
  }
};

export const proxyUpload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const storageKey = req.query.key as string;
    const storageAccount = (req.query.storageAccount as StorageAccount) || 'account2';
    if (!storageKey) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Missing storageKey parameter' } });
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const buffer = Buffer.concat(chunks);

    const contentType = req.headers['content-type'] || 'application/octet-stream';
    await b2Service.uploadObjectStream(storageKey, buffer, contentType, storageAccount);

    res.status(200).json({ success: true, message: 'Upload completed via proxy' });
  } catch (error: any) {
    console.error('Proxy upload error:', error);
    res.status(500).json({ success: false, error: { code: 'PROXY_UPLOAD_FAILED', message: error.message || 'Proxy upload failed' } });
  }
};
