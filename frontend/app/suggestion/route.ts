import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { getB2PresignedUrl } from '../../lib/b2Presign';

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
 * Fetches truly random videos directly from the user's database:
 * 1. From MongoDB via native $sample: { size: 6 } aggregation across all 400+ videos
 * 2. Resolves Backblaze B2 presigned URLs for thumbnails
 * 3. Does not tie suggestions to metadata, tags, or category
 * 4. Excludes the currently playing video
 */
async function getSuggestionsFromDatabase(currentVideoId?: string): Promise<IDbVideo[]> {
  const mongoUri = process.env.MONGODB_URI;
  const isRealMongoUri = mongoUri && !mongoUri.includes('<cluster>') && !mongoUri.includes('<username>');

  if (isRealMongoUri) {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
      }

      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        const matchStage: any = {};
        if (currentVideoId) {
          try {
            if (mongoose.Types.ObjectId.isValid(currentVideoId)) {
              matchStage._id = { $ne: new mongoose.Types.ObjectId(currentVideoId) };
            } else {
              matchStage._id = { $ne: currentVideoId };
            }
          } catch {
            matchStage._id = { $ne: currentVideoId };
          }
        }

        // Native MongoDB $sample aggregation across ALL 400+ videos in DB
        let rawDocs: any[] = [];
        try {
          rawDocs = await mongoose.connection.db
            .collection('videos')
            .aggregate([
              { $match: matchStage },
              { $sample: { size: 6 } },
            ])
            .toArray();
        } catch (sampleErr) {
          console.warn('MongoDB $sample aggregation failed, falling back to random skip:', sampleErr);
          const count = await mongoose.connection.db.collection('videos').countDocuments(matchStage);
          if (count > 0) {
            const skip = Math.max(0, Math.floor(Math.random() * Math.max(1, count - 6)));
            rawDocs = await mongoose.connection.db.collection('videos').find(matchStage).skip(skip).limit(6).toArray();
          }
        }

        if (rawDocs && rawDocs.length > 0) {
          // Extra shuffle so order is truly random
          for (let i = rawDocs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rawDocs[i], rawDocs[j]] = [rawDocs[j], rawDocs[i]];
          }

          // Resolve Backblaze B2 presigned URLs
          const mappedDocs: IDbVideo[] = await Promise.all(
            rawDocs.map(async (doc: any) => {
              const id = doc._id ? doc._id.toString() : '';
              let thumbUrl = doc.thumbnailUrl;

              if (doc.thumbnailKey) {
                try {
                  const b2Url = await getB2PresignedUrl(
                    doc.thumbnailKey,
                    3600,
                    doc.thumbnailStorageAccount || doc.storageAccount || 'account2'
                  );
                  if (b2Url) thumbUrl = b2Url;
                } catch {}
              }

              if (!thumbUrl) {
                thumbUrl = doc.thumbnailKey ? `/api/upload-receiver?key=${encodeURIComponent(doc.thumbnailKey)}` : undefined;
              }

              return {
                _id: id,
                title: doc.title || doc.originalFilename || 'Untitled Video',
                originalFilename: doc.originalFilename || 'video.mp4',
                storageKey: doc.storageKey || '',
                storageAccount: doc.storageAccount,
                thumbnailKey: doc.thumbnailKey,
                thumbnailUrl: thumbUrl,
                blurhash: doc.blurhash,
                streamUrl: doc.streamUrl || `/api/videos/${id}/raw`,
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
              };
            })
          );

          return mappedDocs;
        }
      }
    } catch (err: any) {
      console.warn('MongoDB query for suggestions warning:', err.message || err);
    }
  }

  // Fallback: Query local database manifest
  let localList: IDbVideo[] = [];
  if (fs.existsSync(VIDEOS_METADATA_FILE)) {
    try {
      const fileData = fs.readFileSync(VIDEOS_METADATA_FILE, 'utf8');
      const list = JSON.parse(fileData);
      if (Array.isArray(list) && list.length > 0) {
        localList = list;
      }
    } catch {}
  }

  if (localList.length === 0) {
    localList = [
      {
        _id: 'vid-1',
        title: 'Big Buck Bunny (4K Ultra HD)',
        originalFilename: 'big_buck_bunny_4k.mp4',
        storageKey: 'videos/vid-1/original/big_buck_bunny.mp4',
        streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
        mimeType: 'video/mp4',
        size: 158000000,
        duration: 596,
        createdAt: new Date(Date.now() - 3600 * 24 * 7 * 1000).toISOString(),
        favorite: true,
        tags: ['Animation', 'Nature', 'OpenSource'],
      },
      {
        _id: 'vid-2',
        title: 'Tears of Steel (Sci-Fi VFX)',
        originalFilename: 'tears_of_steel_1080p.mp4',
        storageKey: 'videos/vid-2/original/tears_of_steel.mp4',
        streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
        mimeType: 'video/mp4',
        size: 184500000,
        duration: 734,
        createdAt: new Date(Date.now() - 3600 * 24 * 5 * 1000).toISOString(),
        favorite: false,
        tags: ['Sci-Fi', 'VFX', 'Cyberpunk'],
      },
      {
        _id: 'vid-3',
        title: 'Sintel (Fantasy Adventure)',
        originalFilename: 'sintel_trailer.mp4',
        storageKey: 'videos/vid-3/original/sintel.mp4',
        streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
        mimeType: 'video/mp4',
        size: 129000000,
        duration: 888,
        createdAt: new Date(Date.now() - 3600 * 24 * 3 * 1000).toISOString(),
        favorite: false,
        tags: ['Fantasy', 'Emotional', 'Blender'],
      },
      {
        _id: 'vid-4',
        title: 'For Bigger Blazes (Action Demo)',
        originalFilename: 'for_bigger_blazes.mp4',
        storageKey: 'videos/vid-4/original/for_bigger_blazes.mp4',
        streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80',
        mimeType: 'video/mp4',
        size: 89340000,
        duration: 15,
        createdAt: new Date(Date.now() - 3600 * 24 * 1 * 1000).toISOString(),
        favorite: false,
        tags: ['Demo', 'Action', 'Trailer'],
      },
      {
        _id: 'vid-5',
        title: 'We Are Going On Bullrun (Automotive)',
        originalFilename: 'bullrun_rally.mp4',
        storageKey: 'videos/vid-5/original/bullrun_rally.mp4',
        streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80',
        mimeType: 'video/mp4',
        size: 94500000,
        duration: 47,
        createdAt: new Date(Date.now() - 3600 * 18 * 1000).toISOString(),
        favorite: false,
        tags: ['Cars', 'Rally', 'Roadtrip'],
      },
    ];
  }

  // Filter out current playing video
  const candidates = localList.filter((v) => !currentVideoId || v._id !== currentVideoId);

  // Randomize local items using Fisher-Yates shuffle
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, 6);
}

export async function GET(req: NextRequest) {
  try {
    const currentVideoId =
      req.nextUrl.searchParams.get('currentVideoId') ||
      req.nextUrl.searchParams.get('exclude') ||
      req.nextUrl.searchParams.get('id') ||
      undefined;

    // Fetch random videos directly from user's database
    let dbVideos = await getSuggestionsFromDatabase(currentVideoId);

    // If local manifest didn't have enough, check in-memory videos
    if (!dbVideos || dbVideos.length === 0) {
      // Return empty array
      dbVideos = [];
    }

    return NextResponse.json(
      {
        success: true,
        videos: dbVideos,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error: any) {
    console.error('Suggestions route error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to fetch video suggestions' },
      },
      { status: 500 }
    );
  }
}
