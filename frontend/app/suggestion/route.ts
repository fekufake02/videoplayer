import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STORAGE_DIR = '/tmp/vault_media_storage';
const VIDEOS_METADATA_FILE = path.join(STORAGE_DIR, 'videos_manifest.json');

const sampleStreams = [
  { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', duration: 596 },
  { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', duration: 734 },
  { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', duration: 888 },
  { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', duration: 15 },
  { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', duration: 47 },
];

const fallbackVideos = [
  {
    _id: 'vid-1',
    title: 'Big Buck Bunny (4K Ultra HD)',
    originalFilename: 'big_buck_bunny_4k.mp4',
    storageKey: 'videos/vid-1/original/big_buck_bunny.mp4',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
    mimeType: 'video/mp4',
    size: 158008374,
    duration: 596,
    createdAt: new Date(Date.now() - 3600 * 24 * 5 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3600 * 24 * 5 * 1000).toISOString(),
    lastPosition: 0,
    playCount: 14,
    favorite: true,
    tags: ['Animation', '4K', 'Cinematic', 'Nature'],
  },
  {
    _id: 'vid-2',
    title: 'Tears of Steel (Sci-Fi VFX)',
    originalFilename: 'tears_of_steel_1080p.mp4',
    storageKey: 'videos/vid-2/original/tears_of_steel.mp4',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
    mimeType: 'video/mp4',
    size: 245100920,
    duration: 734,
    createdAt: new Date(Date.now() - 3600 * 24 * 3 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3600 * 24 * 3 * 1000).toISOString(),
    lastPosition: 0,
    playCount: 8,
    favorite: true,
    tags: ['Sci-Fi', 'VFX', 'Cyberpunk', 'Action'],
  },
  {
    _id: 'vid-3',
    title: 'Sintel — The Dragon Seeker',
    originalFilename: 'sintel_trailer.mp4',
    storageKey: 'videos/vid-3/original/sintel.mp4',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=80',
    mimeType: 'video/mp4',
    size: 112450890,
    duration: 888,
    createdAt: new Date(Date.now() - 3600 * 24 * 2 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3600 * 24 * 2 * 1000).toISOString(),
    lastPosition: 0,
    playCount: 22,
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
    updatedAt: new Date(Date.now() - 3600 * 24 * 1 * 1000).toISOString(),
    lastPosition: 0,
    playCount: 0,
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
    updatedAt: new Date(Date.now() - 3600 * 18 * 1000).toISOString(),
    lastPosition: 0,
    playCount: 1,
    favorite: false,
    tags: ['Cars', 'Rally', 'Roadtrip'],
  },
];

export async function GET(req: NextRequest) {
  try {
    const currentVideoId = req.nextUrl.searchParams.get('currentVideoId') ||
      req.nextUrl.searchParams.get('exclude') ||
      req.nextUrl.searchParams.get('id');

    let allVideos = [...fallbackVideos];

    // Read saved manifest if exists
    if (fs.existsSync(VIDEOS_METADATA_FILE)) {
      try {
        const fileContent = fs.readFileSync(VIDEOS_METADATA_FILE, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allVideos = parsed;
        }
      } catch (err) {
        console.warn('Error reading manifest in suggestion route:', err);
      }
    }

    // Filter out current video
    let filtered = allVideos.filter((v) => !currentVideoId || v._id !== currentVideoId);

    // If filtered is empty or only 1 item, fallback to all except current or full list
    if (filtered.length === 0) {
      filtered = allVideos;
    }

    // Truly randomize using Fisher-Yates with Math.random() so each request is truly random
    const shuffled = [...filtered];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Take up to 6 videos
    const selected = shuffled.slice(0, 6).map((v) => {
      const hashNum = (v._id || 'vid').split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
      const sample = sampleStreams[hashNum % sampleStreams.length];
      return {
        ...v,
        streamUrl: v.streamUrl || sample.url,
        duration: v.duration && v.duration > 0 ? v.duration : sample.duration,
      };
    });

    return NextResponse.json(
      {
        success: true,
        videos: selected,
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
    console.error('Error generating suggestions:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: error.message || 'Failed to fetch suggestions' },
      },
      { status: 500 }
    );
  }
}
