import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STORAGE_DIR = '/tmp/vault_media_storage';
const VIDEOS_METADATA_FILE = path.join(STORAGE_DIR, 'videos_manifest.json');

interface IDbVideo {
  _id: string;
  title: string;
  originalFilename: string;
  storageKey: string;
  storageAccount?: string;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  blurhash?: string;
  streamUrl?: string;
  mimeType: string;
  size: number;
  duration: number;
  createdAt: string;
  updatedAt?: string;
  lastPlayedAt?: string;
  lastPosition?: number;
  playCount?: number;
  favorite?: boolean;
  tags?: string[];
  notes?: string;
}

/**
 * Fetches videos stored exclusively in the user's database:
 * 1. From real MongoDB if MONGODB_URI is provided
 * 2. Or from the persistent local database manifest (/tmp/vault_media_storage/videos_manifest.json)
 *
 * NOTE: Absolutely NO mock, sample, or fallback videos are injected.
 * Only videos that actually exist in the database are returned.
 */
async function getVideosFromDatabase(currentVideoId?: string): Promise<IDbVideo[]> {
  const dbVideos: IDbVideo[] = [];

  // 1. Attempt to query MongoDB if configured
  const mongoUri = process.env.MONGODB_URI;
  const isRealMongoUri = mongoUri && !mongoUri.includes('<cluster>') && !mongoUri.includes('<username>');

  if (isRealMongoUri) {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
      }

      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        const query: any = {};
        if (currentVideoId) {
          // Exclude current video by string or ObjectId
          try {
            query._id = { $ne: new mongoose.Types.ObjectId(currentVideoId) };
          } catch {
            query._id = { $ne: currentVideoId };
          }
        }

        const rawDocs = await mongoose.connection.db
          .collection('videos')
          .find(query)
          .toArray();

        if (rawDocs && rawDocs.length > 0) {
          return rawDocs.map((doc: any) => ({
            _id: doc._id.toString(),
            title: doc.title || doc.originalFilename || 'Untitled Video',
            originalFilename: doc.originalFilename || 'video.mp4',
            storageKey: doc.storageKey || '',
            storageAccount: doc.storageAccount,
            thumbnailKey: doc.thumbnailKey,
            thumbnailUrl: doc.thumbnailUrl || (doc.thumbnailKey ? `/api/upload-receiver?key=${encodeURIComponent(doc.thumbnailKey)}` : undefined),
            blurhash: doc.blurhash,
            streamUrl: doc.streamUrl || `/api/videos/${doc._id.toString()}/raw`,
            mimeType: doc.mimeType || 'video/mp4',
            size: doc.size || 0,
            duration: doc.duration || 0,
            createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
            lastPlayedAt: doc.lastPlayedAt ? new Date(doc.lastPlayedAt).toISOString() : undefined,
            lastPosition: doc.lastPosition || 0,
            playCount: doc.playCount || 0,
            favorite: Boolean(doc.favorite),
            tags: Array.isArray(doc.tags) ? doc.tags : [],
            notes: doc.notes || '',
          }));
        }
      }
    } catch (err: any) {
      console.warn('MongoDB query for suggestions skipped:', err.message || err);
    }
  }

  // 2. Query persistent local disk database manifest
  if (fs.existsSync(VIDEOS_METADATA_FILE)) {
    try {
      const fileData = fs.readFileSync(VIDEOS_METADATA_FILE, 'utf8');
      const list = JSON.parse(fileData);
      if (Array.isArray(list)) {
        list.forEach((v) => {
          if (v && v._id && (!currentVideoId || v._id !== currentVideoId)) {
            dbVideos.push(v);
          }
        });
      }
    } catch (err: any) {
      console.warn('Local database manifest read warning:', err.message || err);
    }
  }

  return dbVideos;
}

export async function GET(req: NextRequest) {
  try {
    const currentVideoId = req.nextUrl.searchParams.get('currentVideoId') ||
      req.nextUrl.searchParams.get('exclude') ||
      req.nextUrl.searchParams.get('id') ||
      undefined;

    // Fetch videos strictly from database
    const dbVideos = await getVideosFromDatabase(currentVideoId);

    // If the database has no other videos, return empty list (no hardcoded mock videos)
    if (!dbVideos || dbVideos.length === 0) {
      return NextResponse.json(
        {
          success: true,
          videos: [],
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      );
    }

    // Truly randomize the videos stored in DB using Fisher-Yates shuffle with Math.random()
    const shuffled = [...dbVideos];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Return 5-6 random videos from the user's DB
    const selectedVideos = shuffled.slice(0, 6);

    return NextResponse.json(
      {
        success: true,
        videos: selectedVideos,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error: any) {
    console.error('Error generating DB video suggestions:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: error.message || 'Failed to fetch suggestions from database' },
      },
      { status: 500 }
    );
  }
}
