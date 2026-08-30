import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// In-memory persistent data structures for local session / demo fallback
interface IVideoItem {
  _id: string;
  title: string;
  originalFilename: string;
  storageKey: string;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  blurhash?: string;
  streamUrl?: string;
  mimeType: string;
  size: number;
  duration: number;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt?: string;
  lastPosition: number;
  playCount: number;
  favorite: boolean;
  tags: string[];
  notes?: string;
}

interface ISettingsItem {
  userId: string;
  defaultPlaybackSpeed: number;
  defaultVolume: number;
  skipBackwardDuration: number;
  skipForwardDuration: number;
  autoResume: boolean;
  autoplay: boolean;
  autoLockDuration: number;
  privacyTabHidden: boolean;
  lockOnWindowBlur?: boolean;
  pauseOnTabSwitch?: boolean;
  keyboardShortcuts?: boolean;
  saveWatchHistory: boolean;
  theme: 'dark' | 'light' | 'system';
  layout: 'comfortable' | 'compact';
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'metime_vault_secret_key_32_chars_ok';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Seed sample videos for immediate out-of-the-box private library experience
const initialVideos: IVideoItem[] = [
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
    lastPlayedAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
    lastPosition: 124,
    playCount: 14,
    favorite: true,
    tags: ['Animation', '4K', 'Cinematic', 'Nature'],
    notes: 'Classic Blender Open Movie Project with surround audio.',
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
    lastPlayedAt: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
    lastPosition: 45,
    playCount: 8,
    favorite: true,
    tags: ['Sci-Fi', 'VFX', 'Cyberpunk', 'Action'],
    notes: 'High visual fidelity dystopian short film.',
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
    lastPlayedAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
    lastPosition: 320,
    playCount: 22,
    favorite: false,
    tags: ['Fantasy', 'Emotional', 'Blender'],
    notes: 'Dragon search journey through ice peaks.',
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
    lastPlayedAt: undefined,
    lastPosition: 0,
    playCount: 0,
    favorite: false,
    tags: ['Demo', 'Action', 'Trailer'],
    notes: 'Chromecast stream demo sample.',
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
    lastPlayedAt: undefined,
    lastPosition: 0,
    playCount: 1,
    favorite: false,
    tags: ['Cars', 'Rally', 'Roadtrip'],
    notes: 'Supercar rally documentary preview.',
  },
];

// Global in-memory stores
const globalVideos: Map<string, IVideoItem> = new Map(initialVideos.map((v) => [v._id, v]));
const uploadedBlobs: Map<string, { buffer: Buffer; mimeType: string }> = new Map();

let globalSettings: ISettingsItem = {
  userId: 'admin-1',
  defaultPlaybackSpeed: 1,
  defaultVolume: 1,
  skipBackwardDuration: 10,
  skipForwardDuration: 10,
  autoResume: true,
  autoplay: false,
  autoLockDuration: 15,
  privacyTabHidden: false,
  lockOnWindowBlur: false,
  pauseOnTabSwitch: true,
  keyboardShortcuts: true,
  saveWatchHistory: true,
  theme: 'dark',
  layout: 'comfortable',
};

// Token utilities
function generateAuthToken(userId: string, username: string): string {
  const payload = `${userId}:${username}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64');
}

function verifyAuthToken(token: string): { userId: string; username: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) return null;
    const [userId, username, timestampStr, hmac] = parts;
    const payload = `${userId}:${username}:${timestampStr}`;
    const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    if (hmac !== expectedHmac) return null;

    const timestamp = parseInt(timestampStr, 10);
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > maxAge) return null;

    return { userId, username };
  } catch (e) {
    return null;
  }
}

function checkRequestAuth(req: NextRequest): { userId: string; username: string } | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    return verifyAuthToken(token);
  }
  return null;
}

// Router dispatcher
export async function GET(
  req: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  const slug = params?.slug || [];
  const path = slug.join('/');

  // 1. Health check
  if (path === 'health' || path === '') {
    return new NextResponse('OK', { status: 200 });
  }

  // 2. Auth: /api/auth/me
  if (path === 'auth/me') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json({
        success: true,
        authenticated: false,
      });
    }
    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: userAuth.userId,
        username: userAuth.username,
      },
      settings: globalSettings,
    });
  }

  // 3. User Settings: /api/settings
  if (path === 'settings') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }
    return NextResponse.json({
      success: true,
      settings: globalSettings,
    });
  }

  // 4. Library Home: /api/library/home
  if (path === 'library/home') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const allVideos = Array.from(globalVideos.values());

    const recentlyAdded = [...allVideos]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);

    const mostWatched = [...allVideos]
      .filter((v) => v.playCount > 0)
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 12);

    let continueWatching: IVideoItem[] = [];
    let recentlyWatched: IVideoItem[] = [];

    if (globalSettings.saveWatchHistory) {
      continueWatching = [...allVideos]
        .filter((v) => v.lastPosition > 10 && v.lastPlayedAt)
        .sort((a, b) => new Date(b.lastPlayedAt || 0).getTime() - new Date(a.lastPlayedAt || 0).getTime())
        .slice(0, 12);

      recentlyWatched = [...allVideos]
        .filter((v) => !!v.lastPlayedAt)
        .sort((a, b) => new Date(b.lastPlayedAt || 0).getTime() - new Date(a.lastPlayedAt || 0).getTime())
        .slice(0, 12);
    }

    return NextResponse.json({
      success: true,
      continueWatching,
      recentlyWatched,
      mostWatched,
      recentlyAdded,
    });
  }

  // 5. Video Listing: /api/videos
  if (path === 'videos') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '24', 10)));
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const tag = (searchParams.get('tag') || '').trim().toLowerCase();
    const sort = searchParams.get('sort') || 'recentlyAdded';
    const filter = searchParams.get('filter') || 'all';

    let filtered = Array.from(globalVideos.values());

    if (search) {
      filtered = filtered.filter(
        (v) =>
          v.title.toLowerCase().includes(search) ||
          v.originalFilename.toLowerCase().includes(search) ||
          v.tags.some((t) => t.toLowerCase().includes(search)) ||
          (v.notes && v.notes.toLowerCase().includes(search))
      );
    }

    if (tag) {
      filtered = filtered.filter((v) =>
        v.tags.some((t) => t.toLowerCase() === tag)
      );
    }

    if (filter === 'favorites') {
      filtered = filtered.filter((v) => v.favorite);
    } else if (filter === 'recentlyWatched') {
      filtered = filtered.filter((v) => !!v.lastPlayedAt);
    } else if (filter === 'unwatched') {
      filtered = filtered.filter((v) => v.lastPosition === 0 && v.playCount === 0);
    } else if (filter === 'completed') {
      filtered = filtered.filter((v) => v.duration > 0 && v.lastPosition >= v.duration - 10);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'nameAsc':
          return a.title.localeCompare(b.title);
        case 'nameDesc':
          return b.title.localeCompare(a.title);
        case 'recentlyWatched':
          return new Date(b.lastPlayedAt || 0).getTime() - new Date(a.lastPlayedAt || 0).getTime();
        case 'mostWatched':
          return b.playCount - a.playCount;
        case 'longest':
          return b.duration - a.duration;
        case 'shortest':
          return a.duration - b.duration;
        case 'recentlyAdded':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    const total = filtered.length;
    const skip = (page - 1) * limit;
    const paginatedVideos = filtered.slice(skip, skip + limit);

    return NextResponse.json({
      success: true,
      videos: paginatedVideos,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  }

  // 6. Single Video Stream URL: /api/videos/:id/stream-url
  if (slug.length === 3 && slug[0] === 'videos' && slug[2] === 'stream-url') {
    const videoId = slug[1];
    const video = globalVideos.get(videoId);
    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    const streamUrl = video.streamUrl || `/api/videos/${videoId}/raw`;
    return NextResponse.json({
      success: true,
      streamUrl,
      thumbnailUrl: video.thumbnailUrl,
    });
  }

  // 6.1 Single Video Thumbnail URL: /api/videos/:id/thumbnail-url
  if (slug.length === 3 && slug[0] === 'videos' && slug[2] === 'thumbnail-url') {
    const videoId = slug[1];
    const video = globalVideos.get(videoId);
    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    const thumbnailUrl = video.thumbnailUrl || (video.thumbnailKey ? `/api/upload-receiver?key=${encodeURIComponent(video.thumbnailKey)}` : undefined);
    return NextResponse.json({
      success: true,
      thumbnailUrl: thumbnailUrl || '',
    });
  }

  // 7. Single Video Download URL: /api/videos/:id/download-url
  if (slug.length === 3 && slug[0] === 'videos' && slug[2] === 'download-url') {
    const videoId = slug[1];
    const video = globalVideos.get(videoId);
    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    const downloadUrl = video.streamUrl || `/api/videos/${videoId}/raw`;
    return NextResponse.json({
      success: true,
      downloadUrl,
    });
  }

  // 8. Single Video Raw Stream Handler: /api/videos/:id/raw
  if (slug.length === 3 && slug[0] === 'videos' && slug[2] === 'raw') {
    const videoId = slug[1];
    const video = globalVideos.get(videoId);
    if (!video) {
      return new NextResponse('Video not found', { status: 404 });
    }

    const uploaded = uploadedBlobs.get(video.storageKey);
    if (uploaded) {
      return new NextResponse(new Uint8Array(uploaded.buffer), {
        headers: {
          'Content-Type': uploaded.mimeType,
          'Content-Length': uploaded.buffer.length.toString(),
          'Accept-Ranges': 'bytes',
        },
      });
    }

    if (video.streamUrl) {
      return NextResponse.redirect(video.streamUrl);
    }

    return new NextResponse('Media content not stored', { status: 404 });
  }

  // 8.1 Upload receiver GET handler for uploaded thumbnails and videos: /api/upload-receiver?key=...
  if (path === 'upload-receiver') {
    const key = req.nextUrl.searchParams.get('key');
    if (!key) {
      return new NextResponse('Missing key param', { status: 400 });
    }
    const uploaded = uploadedBlobs.get(key);
    if (uploaded) {
      return new NextResponse(new Uint8Array(uploaded.buffer), {
        headers: {
          'Content-Type': uploaded.mimeType,
          'Content-Length': uploaded.buffer.length.toString(),
        },
      });
    }
    return new NextResponse('Resource not found', { status: 404 });
  }

  // 9. Single Video Details: /api/videos/:id
  if (slug.length === 2 && slug[0] === 'videos') {
    const videoId = slug[1];
    const video = globalVideos.get(videoId);
    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      video,
    });
  }

  return NextResponse.json(
    { success: false, error: { message: `Route not found: ${path}` } },
    { status: 404 }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  const slug = params?.slug || [];
  const path = slug.join('/');

  // 1. Auth: /api/auth/login
  if (path === 'auth/login') {
    try {
      const body = await req.json();
      const password = body.password;

      if (!password || password !== ADMIN_PASSWORD) {
        return NextResponse.json(
          { success: false, error: { message: 'Invalid authentication password.' } },
          { status: 401 }
        );
      }

      const token = generateAuthToken('admin-1', 'admin');

      return NextResponse.json({
        success: true,
        token,
        user: {
          id: 'admin-1',
          username: 'admin',
        },
        settings: globalSettings,
      });
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: { message: 'Invalid request format.' } },
        { status: 400 }
      );
    }
  }

  // 2. Auth: /api/auth/logout
  if (path === 'auth/logout') {
    return NextResponse.json({
      success: true,
      message: 'Logged out successfully.',
    });
  }

  // 3. Initiate Upload: /api/videos/upload/initiate
  if (path === 'videos/upload/initiate') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    try {
      const body = await req.json();
      const videoId = 'vid-' + crypto.randomBytes(4).toString('hex');
      const filename = body.filename || 'video.mp4';
      const isImage = (body.mimeType || '').toLowerCase().startsWith('image/');
      const storageKey = isImage ? `thumbnails/${videoId}/${filename}` : `videos/${videoId}/${filename}`;

      // Upload directly to local API upload endpoint
      const uploadUrl = `/api/upload-receiver?key=${encodeURIComponent(storageKey)}`;

      return NextResponse.json({
        success: true,
        uploadUrl,
        storageKey,
        videoId,
      });
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: { message: 'Failed to initiate upload.' } },
        { status: 500 }
      );
    }
  }

  // 3.1 Initiate Thumbnail Upload: /api/thumbnails/upload/initiate
  if (path === 'thumbnails/upload/initiate') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    try {
      const body = await req.json();
      const thumbId = 'thumb-' + crypto.randomBytes(4).toString('hex');
      const filename = body.filename || 'thumbnail.webp';
      const storageKey = `thumbnails/${thumbId}/${filename}`;
      const uploadUrl = `/api/upload-receiver?key=${encodeURIComponent(storageKey)}`;

      return NextResponse.json({
        success: true,
        uploadUrl,
        storageKey,
        videoId: thumbId,
      });
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: { message: 'Failed to initiate thumbnail upload.' } },
        { status: 500 }
      );
    }
  }

  // 4. Complete Upload: /api/videos/upload/complete
  if (path === 'videos/upload/complete') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    try {
      const body = await req.json();
      const videoId = 'vid-' + crypto.randomBytes(4).toString('hex');

      const newVideo: IVideoItem = {
        _id: videoId,
        title: body.title || body.originalFilename || 'Untitled Video',
        originalFilename: body.originalFilename || 'video.mp4',
        storageKey: body.storageKey || `videos/${videoId}/original.mp4`,
        thumbnailKey: body.thumbnailKey,
        blurhash: body.blurhash,
        thumbnailUrl: body.thumbnailKey
          ? `/api/upload-receiver?key=${encodeURIComponent(body.thumbnailKey)}`
          : undefined,
        mimeType: body.mimeType || 'video/mp4',
        size: body.size || 1024 * 1024,
        duration: body.duration || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastPosition: 0,
        playCount: 0,
        favorite: false,
        tags: body.tags || [],
        notes: body.notes || '',
      };

      globalVideos.set(videoId, newVideo);

      return NextResponse.json({
        success: true,
        video: newVideo,
      });
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: { message: 'Failed to register video metadata.' } },
        { status: 500 }
      );
    }
  }

  // 5. Record Video Play: /api/videos/:id/play
  if (slug.length === 3 && slug[0] === 'videos' && slug[2] === 'play') {
    const videoId = slug[1];
    const video = globalVideos.get(videoId);
    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    if (globalSettings.saveWatchHistory) {
      video.playCount += 1;
      video.lastPlayedAt = new Date().toISOString();
    }

    return NextResponse.json({
      success: true,
      playCount: video.playCount,
    });
  }

  // 6. Toggle Favorite: /api/videos/:id/favorite
  if (slug.length === 3 && slug[0] === 'videos' && slug[2] === 'favorite') {
    const videoId = slug[1];
    const video = globalVideos.get(videoId);
    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    video.favorite = !video.favorite;
    return NextResponse.json({
      success: true,
      favorite: video.favorite,
    });
  }

  // 7. Attach Thumbnail: /api/videos/:id/thumbnail
  if (slug.length === 3 && slug[0] === 'videos' && slug[2] === 'thumbnail') {
    const videoId = slug[1];
    const video = globalVideos.get(videoId);
    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    const body = await req.json();
    video.thumbnailKey = body.thumbnailKey;
    if (body.blurhash) {
      video.blurhash = body.blurhash;
    }
    video.thumbnailUrl = `/api/upload-receiver?key=${encodeURIComponent(body.thumbnailKey)}`;

    return NextResponse.json({
      success: true,
      video,
    });
  }

  // 8. Clear Watch History: /api/settings/clear-history
  if (path === 'settings/clear-history') {
    Array.from(globalVideos.values()).forEach((v) => {
      v.lastPosition = 0;
      v.lastPlayedAt = undefined;
      v.playCount = 0;
    });
    return NextResponse.json({
      success: true,
      message: 'Watch history cleared successfully.',
    });
  }

  // 9. Batch generate thumbnails: /api/thumbnails/batch-generate
  if (path === 'thumbnails/batch-generate') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    try {
      const body = await req.json();
      const videoIds: string[] = body.videoIds || [];
      const queueList = videoIds.map((id) => {
        const v = globalVideos.get(id);
        return {
          videoId: id,
          title: v?.title || id,
          hasThumbnail: !!(v?.thumbnailUrl || v?.thumbnailKey),
          streamUrl: v?.streamUrl,
          status: v?.thumbnailUrl ? 'ready' : 'queued_client_render',
        };
      });

      return NextResponse.json({
        success: true,
        message: 'Batch thumbnail queue created.',
        results: {
          total: queueList.length,
          items: queueList,
        },
      });
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: { message: 'Failed to process batch thumbnail request' } },
        { status: 400 }
      );
    }
  }

  return NextResponse.json(
    { success: false, error: { message: `Route not found: ${path}` } },
    { status: 404 }
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  const slug = params?.slug || [];
  const path = slug.join('/');

  // 1. Update Settings: /api/settings
  if (path === 'settings') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const body = await req.json();
    globalSettings = {
      ...globalSettings,
      ...body,
    };

    return NextResponse.json({
      success: true,
      settings: globalSettings,
    });
  }

  // 2. Update Playback Progress: /api/videos/:id/progress
  if (slug.length === 3 && slug[0] === 'videos' && slug[2] === 'progress') {
    const videoId = slug[1];
    const video = globalVideos.get(videoId);
    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    const body = await req.json();
    if (typeof body.position === 'number') {
      video.lastPosition = body.position;
    }
    if (typeof body.duration === 'number' && body.duration > 0) {
      video.duration = body.duration;
    }
    if (globalSettings.saveWatchHistory) {
      video.lastPlayedAt = new Date().toISOString();
    }

    return NextResponse.json({
      success: true,
      lastPosition: video.lastPosition,
    });
  }

  // 3. Update Video Metadata: /api/videos/:id
  if (slug.length === 2 && slug[0] === 'videos') {
    const videoId = slug[1];
    const video = globalVideos.get(videoId);
    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    const body = await req.json();
    if (body.title !== undefined) video.title = body.title;
    if (body.tags !== undefined) video.tags = body.tags;
    if (body.notes !== undefined) video.notes = body.notes;
    if (body.favorite !== undefined) video.favorite = body.favorite;
    video.updatedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      video,
    });
  }

  return NextResponse.json(
    { success: false, error: { message: `Route not found: ${path}` } },
    { status: 404 }
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  const slug = params?.slug || [];

  // Delete Video: /api/videos/:id
  if (slug.length === 2 && slug[0] === 'videos') {
    const videoId = slug[1];
    if (!globalVideos.has(videoId)) {
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    globalVideos.delete(videoId);
    return NextResponse.json({
      success: true,
      message: 'Video and storage objects permanently deleted.',
    });
  }

  return NextResponse.json(
    { success: false, error: { message: 'Route not found' } },
    { status: 404 }
  );
}

// Handler for direct browser uploads (PUT /api/upload-receiver?key=...)
export async function PUT(
  req: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  const slug = params?.slug || [];
  const path = slug.join('/');

  if (path === 'upload-receiver') {
    const key = req.nextUrl.searchParams.get('key');
    if (!key) {
      return new NextResponse('Missing key param', { status: 400 });
    }

    try {
      const buffer = Buffer.from(await req.arrayBuffer());
      const mimeType = req.headers.get('content-type') || 'video/mp4';
      uploadedBlobs.set(key, { buffer, mimeType });
      return new NextResponse('OK', { status: 200 });
    } catch (e: any) {
      return new NextResponse('Upload error', { status: 500 });
    }
  }

  return new NextResponse('Not found', { status: 404 });
}
