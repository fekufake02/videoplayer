import { Response } from 'express';
import crypto from 'crypto';
import { EmbedVideo } from '../models/EmbedVideo';
import { embedService } from '../services/embedService';
import { b2Service } from '../services/b2Service';
import { AuthenticatedRequest } from '../middleware/auth';

async function hydrateEmbed(doc: any) {
  const item = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
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
}

export const listEmbeds = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(500, Math.max(1, parseInt((req.query.limit as string) || '100', 10)));
    const search = ((req.query.search as string) || '').trim();
    const sort = (req.query.sort as string) || 'recentlyAdded';
    const filter = (req.query.filter as string) || 'all';

    const query: any = {};
    if (filter === 'favorites') {
      query.favorite = true;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { platform: { $regex: search, $options: 'i' } },
        { sourceDomain: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
      ];
    }

    let sortOption: any = { createdAt: -1 };
    if (sort === 'title' || sort === 'nameAsc') sortOption = { title: 1 };
    else if (sort === 'nameDesc') sortOption = { title: -1 };
    else if (sort === 'oldest') sortOption = { createdAt: 1 };
    else if (sort === 'mostPlayed') sortOption = { playCount: -1, createdAt: -1 };
    else if (sort === 'duration') sortOption = { duration: -1 };

    const total = await EmbedVideo.countDocuments(query);
    const docs = await EmbedVideo.find(query)
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit);

    const embeds = await Promise.all(docs.map(hydrateEmbed));

    res.status(200).json({
      success: true,
      embeds,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('List embeds error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list embedded videos' },
    });
  }
};

export const createEmbed = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { url, title, tags, notes, embedUrl: customEmbedUrl } = req.body || {};
    if (!url || typeof url !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_URL', message: 'Video URL is required' },
      });
      return;
    }

    const extracted = await embedService.extractMetadata(url);

    const normalizedTags = Array.isArray(tags)
      ? tags.map((t) => String(t).trim()).filter(Boolean)
      : typeof tags === 'string'
        ? tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];

    const existing = await EmbedVideo.findOne({ sourceUrl: extracted.sourceUrl });
    if (existing) {
      if (typeof title === 'string' && title.trim()) existing.title = title.trim();
      else if (extracted.title) existing.title = extracted.title;
      if (customEmbedUrl && typeof customEmbedUrl === 'string') existing.embedUrl = customEmbedUrl.trim();
      else if (extracted.embedUrl) existing.embedUrl = extracted.embedUrl;
      if (extracted.directMediaUrl) existing.directMediaUrl = extracted.directMediaUrl;
      existing.playbackType = extracted.playbackType;
      if (!existing.thumbnailKey && extracted.thumbnailUrl) existing.thumbnailUrl = extracted.thumbnailUrl;
      if (extracted.duration > 0) existing.duration = extracted.duration;
      if (normalizedTags.length > 0) existing.tags = normalizedTags;
      if (typeof notes === 'string' && notes.trim()) existing.notes = notes.trim();
      await existing.save();

      const hydrated = await hydrateEmbed(existing);
      res.status(200).json({ success: true, embed: hydrated, updatedExisting: true });
      return;
    }

    const created = await EmbedVideo.create({
      sourceUrl: extracted.sourceUrl,
      embedUrl: typeof customEmbedUrl === 'string' && customEmbedUrl.trim()
        ? customEmbedUrl.trim()
        : extracted.embedUrl,
      directMediaUrl: extracted.directMediaUrl,
      playbackType: extracted.playbackType,
      platform: extracted.platform,
      sourceDomain: extracted.sourceDomain,
      title: typeof title === 'string' && title.trim() ? title.trim() : extracted.title,
      description: extracted.description,
      thumbnailUrl: extracted.thumbnailUrl,
      duration: extracted.duration,
      tags: normalizedTags,
      notes: typeof notes === 'string' ? notes.trim() : '',
    });

    const hydrated = await hydrateEmbed(created);
    res.status(201).json({ success: true, embed: hydrated });
  } catch (error: any) {
    console.error('Create embed error:', error);
    res.status(400).json({
      success: false,
      error: { code: 'EMBED_EXTRACT_FAILED', message: error?.message || 'Failed to embed video link' },
    });
  }
};

export const getEmbedDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const doc = await EmbedVideo.findById(req.params.id);
    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Embedded video not found' },
      });
      return;
    }
    const embed = await hydrateEmbed(doc);
    res.status(200).json({ success: true, embed });
  } catch (error) {
    console.error('Get embed details error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to load embedded video' },
    });
  }
};

export const updateEmbedMetadata = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const doc = await EmbedVideo.findById(req.params.id);
    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Embedded video not found' },
      });
      return;
    }

    const { title, tags, notes, favorite, embedUrl, directMediaUrl, thumbnailUrl } = req.body || {};
    if (typeof title === 'string' && title.trim()) doc.title = title.trim();
    if (Array.isArray(tags)) doc.tags = tags.map((t) => String(t).trim()).filter(Boolean);
    if (typeof notes === 'string') doc.notes = notes;
    if (typeof favorite === 'boolean') doc.favorite = favorite;
    if (typeof embedUrl === 'string') doc.embedUrl = embedUrl.trim() || undefined;
    if (typeof directMediaUrl === 'string') doc.directMediaUrl = directMediaUrl.trim() || undefined;
    if (typeof thumbnailUrl === 'string' && thumbnailUrl.trim()) {
      doc.thumbnailUrl = thumbnailUrl.trim();
    }

    await doc.save();
    const embed = await hydrateEmbed(doc);
    res.status(200).json({ success: true, embed });
  } catch (error) {
    console.error('Update embed error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update embedded video' },
    });
  }
};

export const deleteEmbed = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const doc = await EmbedVideo.findByIdAndDelete(req.params.id);
    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Embedded video not found' },
      });
      return;
    }
    res.status(200).json({ success: true, message: 'Embedded video deleted' });
  } catch (error) {
    console.error('Delete embed error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete embedded video' },
    });
  }
};

export const recordEmbedPlay = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const doc = await EmbedVideo.findByIdAndUpdate(
      req.params.id,
      { $inc: { playCount: 1 }, $set: { lastPlayedAt: new Date() } },
      { new: true }
    );
    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Embedded video not found' },
      });
      return;
    }
    res.status(200).json({ success: true, playCount: doc.playCount });
  } catch (error) {
    console.error('Record embed play error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to record play' },
    });
  }
};

export const refreshEmbedMetadata = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const doc = await EmbedVideo.findById(req.params.id);
    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Embedded video not found' },
      });
      return;
    }
    const extracted = await embedService.extractMetadata(doc.sourceUrl);
    if (extracted.embedUrl) doc.embedUrl = extracted.embedUrl;
    if (extracted.directMediaUrl) doc.directMediaUrl = extracted.directMediaUrl;
    doc.playbackType = extracted.playbackType;
    if (!doc.thumbnailKey && extracted.thumbnailUrl) doc.thumbnailUrl = extracted.thumbnailUrl;
    if (extracted.duration > 0) doc.duration = extracted.duration;
    if (extracted.description && !doc.description) doc.description = extracted.description;
    await doc.save();

    const embed = await hydrateEmbed(doc);
    res.status(200).json({ success: true, embed });
  } catch (error: any) {
    console.error('Refresh embed metadata error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error?.message || 'Failed to refresh metadata' },
    });
  }
};

export const initiateEmbedThumbnailUpload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { filename, mimeType, embedId } = req.body || {};
    const targetId = embedId || crypto.randomBytes(6).toString('hex');
    const storageKey = `thumbnails/embeds/${targetId}/${crypto.randomUUID()}_${(filename || 'thumb.webp').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storageAccount = 'account2' as const;
    const uploadUrl = await b2Service.getPresignedUploadUrl(
      storageKey,
      mimeType || 'image/webp',
      900,
      storageAccount
    );
    res.status(200).json({
      success: true,
      uploadUrl,
      storageKey,
      storageAccount,
    });
  } catch (error) {
    console.error('Initiate embed thumbnail upload error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to initiate thumbnail upload' },
    });
  }
};

export const attachEmbedThumbnail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { thumbnailKey, storageAccount, blurhash } = req.body || {};
    if (!thumbnailKey) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_KEY', message: 'thumbnailKey is required' },
      });
      return;
    }
    const doc = await EmbedVideo.findById(req.params.id);
    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Embedded video not found' },
      });
      return;
    }
    const targetAcc = storageAccount === 'account1' ? 'account1' : 'account2';
    doc.thumbnailKey = thumbnailKey;
    doc.thumbnailStorageAccount = targetAcc;
    if (blurhash) doc.blurhash = blurhash;
    const url = await b2Service.getPresignedThumbnailUrl(thumbnailKey, targetAcc, 7200);
    doc.thumbnailUrl = url;
    await doc.save();

    const embed = await hydrateEmbed(doc);
    res.status(200).json({ success: true, embed, thumbnailUrl: url });
  } catch (error) {
    console.error('Attach embed thumbnail error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to attach embed thumbnail' },
    });
  }
};
