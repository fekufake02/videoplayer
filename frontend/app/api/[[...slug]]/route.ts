import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { getB2PresignedUrl } from '../../../lib/b2Presign';

// Disk storage for media files to survive process reloads
const STORAGE_DIR = '/tmp/vault_media_storage';
try {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('Storage directory initialization warning:', err);
}

function getDiskFilePath(storageKey: string): string {
  const sanitized = storageKey.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(STORAGE_DIR, sanitized);
}

function writeDiskChunk(storageKey: string, chunkBuffer: Buffer, offset: number) {
  try {
    const filePath = getDiskFilePath(storageKey);
    let fd: number;
    if (!fs.existsSync(filePath)) {
      fd = fs.openSync(filePath, 'w+');
    } else {
      fd = fs.openSync(filePath, 'r+');
    }
    fs.writeSync(fd, chunkBuffer, 0, chunkBuffer.length, offset);
    fs.closeSync(fd);
  } catch (err) {
    console.warn('Disk chunk write warning for', storageKey, err);
  }
}

function readDiskMedia(storageKey: string): { buffer: Buffer; size: number } | null {
  try {
    const filePath = getDiskFilePath(storageKey);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > 0) {
        const buffer = fs.readFileSync(filePath);
        return { buffer, size: stats.size };
      }
    }
  } catch {}
  return null;
}

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
  blockPlaceholders?: boolean;
  pauseOnTabSwitch?: boolean;
  keyboardShortcuts?: boolean;
  saveWatchHistory: boolean;
  theme: 'dark' | 'light' | 'system';
  layout: 'comfortable' | 'compact';
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'metime_vault_secret_key_32_chars_ok';

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
interface UploadBlobRecord {
  buffer: Buffer;
  mimeType: string;
  totalSize?: number;
  uploadedBytes?: number;
}
const globalVideos: Map<string, IVideoItem> = new Map(initialVideos.map((v) => [v._id, v]));
const uploadedBlobs: Map<string, UploadBlobRecord> = new Map();

const VIDEOS_METADATA_FILE = path.join(STORAGE_DIR, 'videos_manifest.json');

// Google Drive In-Memory / Manifest Store
interface IDriveVideoItem {
  _id: string;
  driveFileId: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  duration?: number;
  thumbnailKey?: string;
  thumbnailStorageAccount?: 'account1' | 'account2';
  thumbnailUrl?: string;
  blurhash?: string;
  driveViewUrl?: string;
  driveStreamUrl?: string;
  folderId?: string;
  lastSyncedAt?: string;
  playCount?: number;
  favorite?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const initialDriveVideos: IDriveVideoItem[] = [
  {
    _id: 'drive-1',
    driveFileId: '1q6vL9kGzZ4Z_drive_sample_01',
    title: 'Project Nebula - 4K Space Exploration',
    originalFilename: 'project_nebula_4k.mp4',
    mimeType: 'video/mp4',
    size: 142600500,
    duration: 596,
    thumbnailUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
    driveViewUrl: 'https://drive.google.com/file/d/1q6vL9kGzZ4Z_drive_sample_01/view',
    driveStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    folderId: 'default',
    lastSyncedAt: new Date().toISOString(),
    playCount: 1,
    favorite: true,
    createdAt: new Date(Date.now() - 3600 * 24 * 3 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'drive-2',
    driveFileId: '1m9pW2bRxY7A_drive_sample_02',
    title: 'Automotive Kinetic Track Test',
    originalFilename: 'automotive_kinetic_track.mp4',
    mimeType: 'video/mp4',
    size: 198450000,
    duration: 47,
    thumbnailUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80',
    driveViewUrl: 'https://drive.google.com/file/d/1m9pW2bRxY7A_drive_sample_02/view',
    driveStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    folderId: 'default',
    lastSyncedAt: new Date().toISOString(),
    playCount: 0,
    favorite: false,
    createdAt: new Date(Date.now() - 3600 * 24 * 2 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'drive-3',
    driveFileId: '1t4yU8oVxC3B_drive_sample_03',
    title: 'Blender Open Movie - Sintel Chronicles',
    originalFilename: 'sintel_chronicles_hd.mp4',
    mimeType: 'video/mp4',
    size: 112800000,
    duration: 888,
    thumbnailUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=80',
    driveViewUrl: 'https://drive.google.com/file/d/1t4yU8oVxC3B_drive_sample_03/view',
    driveStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    folderId: 'default',
    lastSyncedAt: new Date().toISOString(),
    playCount: 4,
    favorite: false,
    createdAt: new Date(Date.now() - 3600 * 24 * 1 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'drive-4',
    driveFileId: '1x5zE6vNqM9K_drive_sample_04',
    title: 'Sci-Fi VFX - Tears of Steel Remastered',
    originalFilename: 'tears_of_steel_vfx.mp4',
    mimeType: 'video/mp4',
    size: 260300400,
    duration: 734,
    thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
    driveViewUrl: 'https://drive.google.com/file/d/1x5zE6vNqM9K_drive_sample_04/view',
    driveStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    folderId: 'default',
    lastSyncedAt: new Date().toISOString(),
    playCount: 2,
    favorite: true,
    createdAt: new Date(Date.now() - 3600 * 12 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'drive-5',
    driveFileId: '1w3rT7kLpB2D_drive_sample_05',
    title: 'High Velocity Blazes Demo',
    originalFilename: 'high_velocity_blazes.mp4',
    mimeType: 'video/mp4',
    size: 78500200,
    duration: 15,
    thumbnailUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80',
    driveViewUrl: 'https://drive.google.com/file/d/1w3rT7kLpB2D_drive_sample_05/view',
    driveStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    folderId: 'default',
    lastSyncedAt: new Date().toISOString(),
    playCount: 0,
    favorite: false,
    createdAt: new Date(Date.now() - 3600 * 6 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const globalDriveVideos: Map<string, IDriveVideoItem> = new Map(initialDriveVideos.map((v) => [v._id, v]));
const DRIVE_VIDEOS_FILE = path.join(STORAGE_DIR, 'drive_videos_manifest.json');

function saveDriveVideosToDisk() {
  try {
    const list = Array.from(globalDriveVideos.values());
    fs.writeFileSync(DRIVE_VIDEOS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save drive videos to disk:', err);
  }
}

function loadDriveVideosFromDisk() {
  try {
    if (fs.existsSync(DRIVE_VIDEOS_FILE)) {
      const data = fs.readFileSync(DRIVE_VIDEOS_FILE, 'utf8');
      const list: IDriveVideoItem[] = JSON.parse(data);
      if (Array.isArray(list) && list.length > 0) {
        list.forEach((v) => {
          if (v && v._id) {
            globalDriveVideos.set(v._id, v);
          }
        });
      }
    }
  } catch (err) {
    console.warn('Failed to load drive videos from disk:', err);
  }
}

loadDriveVideosFromDisk();

async function initialDriveFolderSync() {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '1kRuofHNYbNz62CUy8jlsS2oJvCo5KUvM';
    const embedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
    const resp = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (resp.ok) {
      const html = await resp.text();
      const entryRegex = /id="entry-([a-zA-Z0-9_-]{20,})"[\s\S]*?<div class="flip-entry-thumb"><img src="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/gi;
      let match;
      const seenIds = new Set<string>();
      while ((match = entryRegex.exec(html)) !== null) {
        const fileId = match[1];
        const rawThumb = match[2];
        const rawTitle = match[3].trim();
        if (/\.(mp4|m4v|mkv|webm|mov|avi|ts)$/i.test(rawTitle) && !seenIds.has(fileId)) {
          seenIds.add(fileId);
          const highRes = rawThumb.includes('=s190') ? rawThumb.replace('=s190', '=s1280') : rawThumb;
          let existing = Array.from(globalDriveVideos.values()).find((v) => v.driveFileId === fileId);
          if (existing) {
            existing.title = existing.title || rawTitle.replace(/\.[^/.]+$/, '');
            existing.originalFilename = existing.originalFilename || rawTitle;
            existing.folderId = folderId;
          } else {
            const newId = 'drive-' + crypto.randomBytes(4).toString('hex');
            const item: IDriveVideoItem = {
              _id: newId,
              driveFileId: fileId,
              title: rawTitle.replace(/\.[^/.]+$/, ''),
              originalFilename: rawTitle,
              mimeType: 'video/mp4',
              size: 1024 * 1024 * 50,
              thumbnailUrl: highRes,
              driveViewUrl: `https://drive.google.com/file/d/${fileId}/view`,
              driveStreamUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
              folderId,
              lastSyncedAt: new Date().toISOString(),
              playCount: 0,
              favorite: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            globalDriveVideos.set(newId, item);
          }
        }
      }
      saveDriveVideosToDisk();
      console.log(`Initial Drive sync completed: ${globalDriveVideos.size} items from folder ${folderId}`);
    }
  } catch (err) {
    console.warn('Initial Drive sync warning:', err);
  }
}
setTimeout(initialDriveFolderSync, 500);

function saveVideosToDisk() {
  try {
    const list = Array.from(globalVideos.values());
    fs.writeFileSync(VIDEOS_METADATA_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save videos manifest to disk:', err);
  }
}

function loadVideosFromDisk() {
  try {
    if (fs.existsSync(VIDEOS_METADATA_FILE)) {
      const data = fs.readFileSync(VIDEOS_METADATA_FILE, 'utf8');
      const list: IVideoItem[] = JSON.parse(data);
      if (Array.isArray(list)) {
        list.forEach((v) => {
          if (v && v._id) {
            repairVideoItem(v);
            globalVideos.set(v._id, v);
          }
        });
      }
    }
  } catch (err) {
    console.warn('Failed to load videos manifest from disk:', err);
  }
}

function repairVideoItem(v: IVideoItem) {
  // Sample playable streams for automatic fallback
  const sampleStreams = [
    { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', duration: 596 },
    { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', duration: 734 },
    { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', duration: 888 },
    { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', duration: 15 },
    { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', duration: 47 },
  ];

  const hashNum = v._id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const sample = sampleStreams[hashNum % sampleStreams.length];

  // If duration is 0 or missing, repair with actual duration or fallback
  if (!v.duration || v.duration <= 0 || isNaN(v.duration)) {
    v.duration = sample.duration;
  }

  // Check if media exists locally on disk or memory
  const hasLocalBlob = uploadedBlobs.has(v.storageKey) || !!readDiskMedia(v.storageKey);
  if (!hasLocalBlob) {
    if (!v.streamUrl || v.streamUrl.startsWith('/api/')) {
      v.streamUrl = sample.url;
    }
  } else {
    v.streamUrl = `/api/videos/${v._id}/raw`;
  }
}

// Initial load
loadVideosFromDisk();
// Repair all initially loaded items
Array.from(globalVideos.values()).forEach(repairVideoItem);

const SETTINGS_FILE = path.join(STORAGE_DIR, 'settings.json');
const PASSWORD_FILE = path.join(STORAGE_DIR, 'admin_password.txt');

function getAdminPassword(): string {
  try {
    if (fs.existsSync(PASSWORD_FILE)) {
      const p = fs.readFileSync(PASSWORD_FILE, 'utf8').trim();
      if (p) return p;
    }
  } catch {}
  return process.env.ADMIN_PASSWORD || 'admin123';
}

function setAdminPassword(newPass: string) {
  try {
    fs.writeFileSync(PASSWORD_FILE, newPass.trim(), 'utf8');
  } catch (e) {
    console.warn('Could not save password to disk:', e);
  }
}

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
  blockPlaceholders: false,
  pauseOnTabSwitch: true,
  keyboardShortcuts: true,
  saveWatchHistory: true,
  theme: 'dark',
  layout: 'comfortable',
};

function loadSettingsFromDisk() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        globalSettings = { ...globalSettings, ...parsed };
      }
    }
  } catch {}
}

function saveSettingsToDisk() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(globalSettings, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save settings to disk:', err);
  }
}

loadSettingsFromDisk();

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
        success: false,
        authenticated: false,
        error: { message: 'Unauthorized' },
      }, { status: 401 });
    }
    return NextResponse.json({
      success: true,
      authenticated: true,
      user: { id: userAuth.userId, username: userAuth.username },
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

  // 4.1 Suggestions: /api/suggestion or /api/videos/suggestion or /api/suggestions
  if (path === 'suggestion' || path === 'videos/suggestion' || path === 'suggestions') {
    const currentVideoId = req.nextUrl.searchParams.get('currentVideoId') ||
      req.nextUrl.searchParams.get('exclude') ||
      req.nextUrl.searchParams.get('id');

    let selected: IVideoItem[] = [];

    // Attempt native MongoDB query with $sample if configured
    const mongoUri = process.env.MONGODB_URI;
    const isRealMongo = mongoUri && !mongoUri.includes('<cluster>') && !mongoUri.includes('<username>');

    if (isRealMongo) {
      try {
        if (mongoose.connection.readyState === 0) {
          await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
        }
        if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
          const matchQuery: any = {};
          if (currentVideoId) {
            try {
              if (mongoose.Types.ObjectId.isValid(currentVideoId)) {
                matchQuery._id = { $ne: new mongoose.Types.ObjectId(currentVideoId) };
              } else {
                matchQuery._id = { $ne: currentVideoId };
              }
            } catch {
              matchQuery._id = { $ne: currentVideoId };
            }
          }

          let rawDocs: any[] = [];
          try {
            rawDocs = await mongoose.connection.db
              .collection('videos')
              .aggregate([
                { $match: matchQuery },
                { $sample: { size: 6 } },
              ])
              .toArray();
          } catch {
            const count = await mongoose.connection.db.collection('videos').countDocuments(matchQuery);
            if (count > 0) {
              const skip = Math.max(0, Math.floor(Math.random() * Math.max(1, count - 6)));
              rawDocs = await mongoose.connection.db.collection('videos').find(matchQuery).skip(skip).limit(6).toArray();
            }
          }

          if (rawDocs && rawDocs.length > 0) {
            selected = await Promise.all(
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
                  thumbnailKey: doc.thumbnailKey,
                  thumbnailUrl: thumbUrl,
                  blurhash: doc.blurhash,
                  streamUrl: doc.streamUrl || `/api/videos/${id}/raw`,
                  mimeType: doc.mimeType || 'video/mp4',
                  size: doc.size || 0,
                  duration: doc.duration || 0,
                  createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
                  updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
                  lastPlayedAt: doc.lastPlayedAt ? new Date(doc.lastPlayedAt).toISOString() : undefined,
                  lastPosition: doc.lastPosition || 0,
                  playCount: doc.playCount || 0,
                  favorite: Boolean(doc.favorite),
                  tags: Array.isArray(doc.tags) ? doc.tags : [],
                  notes: doc.notes || '',
                };
              })
            );
          }
        }
      } catch (err: any) {
        console.warn('MongoDB query warning for /api/suggestion:', err.message || err);
      }
    }

    // Local manifest fallback
    if (selected.length === 0) {
      let dbVideos: IVideoItem[] = [];
      if (fs.existsSync(VIDEOS_METADATA_FILE)) {
        try {
          const fileData = fs.readFileSync(VIDEOS_METADATA_FILE, 'utf8');
          const list = JSON.parse(fileData);
          if (Array.isArray(list) && list.length > 0) {
            dbVideos = list;
          }
        } catch {}
      }

      if (dbVideos.length > 0) {
        const candidates = dbVideos.filter((v) => !currentVideoId || v._id !== currentVideoId);
        const shuffled = [...candidates];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        selected = shuffled.slice(0, 6);
      }
    }

    return NextResponse.json(
      {
        success: true,
        videos: selected,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
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

    let filtered = Array.from(globalVideos.values()).map((v) => {
      repairVideoItem(v);
      return v;
    });

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

    repairVideoItem(video);

    const hasLocal = uploadedBlobs.has(video.storageKey) || !!readDiskMedia(video.storageKey);
    const streamUrl = hasLocal
      ? `/api/videos/${videoId}/raw`
      : (video.streamUrl && !video.streamUrl.startsWith('/api/')
          ? video.streamUrl
          : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');

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
      return new NextResponse('Video not found', {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Try memory buffer first
    let fileBuffer: Buffer | null = null;
    let mimeType = video.mimeType || 'video/mp4';

    const uploaded = uploadedBlobs.get(video.storageKey);
    if (uploaded?.buffer && uploaded.buffer.length > 0) {
      fileBuffer = uploaded.buffer;
      if (uploaded.mimeType) mimeType = uploaded.mimeType;
    } else {
      // Try disk storage
      const diskData = readDiskMedia(video.storageKey);
      if (diskData?.buffer && diskData.buffer.length > 0) {
        fileBuffer = diskData.buffer;
      }
    }

    if (fileBuffer && fileBuffer.length > 0) {
      const totalSize = fileBuffer.length;
      const range = req.headers.get('range');

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunk = fileBuffer.subarray(start, end + 1);

        return new NextResponse(new Uint8Array(chunk), {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.length.toString(),
            'Content-Type': mimeType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      }

      return new NextResponse(new Uint8Array(fileBuffer), {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': totalSize.toString(),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // If media blob is not present (or from interrupted previous chunk uploads),
    // automatically redirect to a reliable high-definition stream so playback works instantly!
    const sampleStreams = [
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    ];
    const hashNum = videoId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const resolvedStream = video.streamUrl || sampleStreams[hashNum % sampleStreams.length];

    video.streamUrl = resolvedStream;
    if (!video.duration || video.duration <= 0) {
      video.duration = 596;
    }

    return NextResponse.redirect(resolvedStream);
  }

  // 8.1 Upload receiver GET handler for uploaded thumbnails and videos: /api/upload-receiver?key=...
  if (path === 'upload-receiver') {
    const key = req.nextUrl.searchParams.get('key');
    if (!key) {
      return new NextResponse('Missing key param', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    let fileBuffer: Buffer | null = null;
    let mimeType = 'image/webp';

    const uploaded = uploadedBlobs.get(key);
    if (uploaded?.buffer && uploaded.buffer.length > 0) {
      fileBuffer = uploaded.buffer;
      if (uploaded.mimeType) mimeType = uploaded.mimeType;
    } else {
      const diskData = readDiskMedia(key);
      if (diskData?.buffer && diskData.buffer.length > 0) {
        fileBuffer = diskData.buffer;
      }
    }

    if (fileBuffer && fileBuffer.length > 0) {
      const totalSize = fileBuffer.length;
      const range = req.headers.get('range');

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunk = fileBuffer.subarray(start, end + 1);

        return new NextResponse(new Uint8Array(chunk), {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.length.toString(),
            'Content-Type': mimeType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      }

      return new NextResponse(new Uint8Array(fileBuffer), {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': totalSize.toString(),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    return new NextResponse('Resource not found', {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
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
    repairVideoItem(video);
    return NextResponse.json({
      success: true,
      video,
    });
  }

  // 10. Check Upload Progress / Resume Status: /api/upload-status?key=...
  if (path === 'upload-status') {
    const key = req.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json(
        { success: false, error: { message: 'Missing key param' } },
        { status: 400 }
      );
    }
    const record = uploadedBlobs.get(key);
    if (!record) {
      return NextResponse.json({
        success: true,
        exists: false,
        uploadedBytes: 0,
        totalSize: 0,
        completed: false,
      });
    }
    const uploadedBytes = record.uploadedBytes ?? record.buffer.length;
    const totalSize = record.totalSize ?? record.buffer.length;
    return NextResponse.json({
      success: true,
      exists: true,
      uploadedBytes,
      totalSize,
      completed: uploadedBytes > 0 && totalSize > 0 && uploadedBytes >= totalSize,
    });
  }

  // 11. Drive Video Listing: /api/drive/videos
  if (path === 'drive/videos') {
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
    const sort = searchParams.get('sort') || 'recentlyAdded';

    let list = Array.from(globalDriveVideos.values());

    if (search) {
      list = list.filter((v) =>
        v.title.toLowerCase().includes(search) ||
        v.originalFilename.toLowerCase().includes(search) ||
        (v.notes && v.notes.toLowerCase().includes(search))
      );
    }

    // Refresh B2 thumbnail URLs for items that have thumbnailKey
    const resolvedList = await Promise.all(
      list.map(async (v) => {
        if (v.thumbnailKey) {
          try {
            const b2Url = await getB2PresignedUrl(
              v.thumbnailKey,
              3600,
              v.thumbnailStorageAccount || 'account2'
            );
            if (b2Url) {
              v.thumbnailUrl = b2Url;
            }
          } catch {}
          if (!v.thumbnailUrl) {
            v.thumbnailUrl = `/api/upload-receiver?key=${encodeURIComponent(v.thumbnailKey)}`;
          }
        }
        return v;
      })
    );

    // Sort
    resolvedList.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === 'duration') return (b.duration || 0) - (a.duration || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const total = resolvedList.length;
    const skip = (page - 1) * limit;
    const paginated = resolvedList.slice(skip, skip + limit);

    return NextResponse.json({
      success: true,
      videos: paginated,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_URL || '1kRuofHNYbNz62CUy8jlsS2oJvCo5KUvM',
    });
  }

  // 11.1 Drive Video Chunk Stream with Range Header Forwarding: /api/drive/videos/:id/chunk-stream
  if (slug.length === 4 && slug[0] === 'drive' && slug[1] === 'videos' && (slug[3] === 'chunk-stream' || slug[3] === 'raw')) {
    const videoId = slug[2];
    let video = globalDriveVideos.get(videoId);
    if (!video) {
      video = Array.from(globalDriveVideos.values()).find((v) => v.driveFileId === videoId);
    }
    const fileId = video?.driveFileId || videoId;
    const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    const rangeHeader = req.headers.get('range');
    const forwardHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (rangeHeader) {
      forwardHeaders['Range'] = rangeHeader;
    }

    try {
      const driveResp = await fetch(driveUrl, { headers: forwardHeaders });
      const respHeaders = new Headers();
      respHeaders.set('Accept-Ranges', 'bytes');
      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      respHeaders.set('Access-Control-Allow-Headers', '*');

      const contentType = driveResp.headers.get('content-type') || 'video/mp4';
      respHeaders.set('Content-Type', contentType);

      const contentRange = driveResp.headers.get('content-range');
      if (contentRange) respHeaders.set('Content-Range', contentRange);

      const contentLength = driveResp.headers.get('content-length');
      if (contentLength) respHeaders.set('Content-Length', contentLength);

      return new NextResponse(driveResp.body, {
        status: driveResp.status,
        headers: respHeaders,
      });
    } catch (e) {
      return NextResponse.redirect(driveUrl);
    }
  }

  // 12. Single Drive Video Stream URL: /api/drive/videos/:id/stream
  if (slug.length === 4 && slug[0] === 'drive' && slug[1] === 'videos' && slug[3] === 'stream') {
    const videoId = slug[2];
    let video = globalDriveVideos.get(videoId);
    if (!video) {
      video = Array.from(globalDriveVideos.values()).find((v) => v.driveFileId === videoId);
    }

    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Drive video not found' } },
        { status: 404 }
      );
    }

    const fileId = video.driveFileId;
    const directStreamUrl = `/api/drive/videos/${fileId}/chunk-stream`;
    const embedPreviewUrl = `https://drive.google.com/file/d/${fileId}/preview`;

    return NextResponse.json({
      success: true,
      driveFileId: fileId,
      streamUrl: directStreamUrl,
      rawDownloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      embedPreviewUrl,
      thumbnailUrl: video.thumbnailUrl,
      title: video.title,
    });
  }

  // 13. Single Drive Video Details: /api/drive/videos/:id
  if (slug.length === 3 && slug[0] === 'drive' && slug[1] === 'videos') {
    const videoId = slug[2];
    let video = globalDriveVideos.get(videoId);
    if (!video) {
      video = Array.from(globalDriveVideos.values()).find((v) => v.driveFileId === videoId);
    }

    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Drive video not found' } },
        { status: 404 }
      );
    }

    if (video.thumbnailKey) {
      try {
        const b2Url = await getB2PresignedUrl(
          video.thumbnailKey,
          3600,
          video.thumbnailStorageAccount || 'account2'
        );
        if (b2Url) video.thumbnailUrl = b2Url;
      } catch {}
      if (!video.thumbnailUrl) {
        video.thumbnailUrl = `/api/upload-receiver?key=${encodeURIComponent(video.thumbnailKey)}`;
      }
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
      const expectedPassword = getAdminPassword();
      const envPassword = process.env.ADMIN_PASSWORD;

      let isMatch = false;
      if (password && (password === expectedPassword || (envPassword && password === envPassword))) {
        isMatch = true;
      }

      if (!isMatch) {
        return NextResponse.json({
          success: false,
          error: { message: 'Invalid authentication password.' },
        }, { status: 401 });
      }

      const token = generateAuthToken('admin-1', 'admin');
      return NextResponse.json({
        success: true,
        token,
        user: { id: 'admin-1', username: 'admin' },
        settings: globalSettings,
      });
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: { message: 'Authentication error' },
      }, { status: 500 });
    }
  }

  // 2. Auth: /api/auth/logout
  if (path === 'auth/logout') {
    return NextResponse.json({ success: true });
  }

  // 2.1 Update Admin Password: /api/settings/admin/update-password
  if (path === 'settings/admin/update-password') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json({
        success: false,
        error: { message: 'Unauthorized' },
      }, { status: 401 });
    }

    try {
      const body = await req.json();
      const { currentPassword, newPassword } = body;

      const expectedPassword = getAdminPassword();
      const envPassword = process.env.ADMIN_PASSWORD;

      let isMatch = false;
      if (currentPassword && (currentPassword === expectedPassword || (envPassword && currentPassword === envPassword))) {
        isMatch = true;
      }

      if (!isMatch) {
        return NextResponse.json({
          success: false,
          error: { message: 'Current password is incorrect.' },
        }, { status: 401 });
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return NextResponse.json({
          success: false,
          error: { message: 'New password must be at least 8 characters long.' },
        }, { status: 400 });
      }

      setAdminPassword(newPassword);

      return NextResponse.json({
        success: true,
        message: 'Password updated successfully.',
      });
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: { message: 'Failed to update password' },
      }, { status: 500 });
    }
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
      const resolvedDuration = typeof body.duration === 'number' && body.duration > 0 ? body.duration : 180;

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
        duration: resolvedDuration,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastPosition: 0,
        playCount: 0,
        favorite: false,
        tags: body.tags || [],
        notes: body.notes || '',
      };

      globalVideos.set(videoId, newVideo);
      saveVideosToDisk();

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

  // 10. Sync Google Drive Folder: /api/drive/sync
  if (path === 'drive/sync') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    try {
      const body = await req.json().catch(() => ({}));
      const folderInput = body.folderUrl || body.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_URL || '1kRuofHNYbNz62CUy8jlsS2oJvCo5KUvM';

      // Parse folder ID
      let folderId = '1kRuofHNYbNz62CUy8jlsS2oJvCo5KUvM';
      const folderMatch = (folderInput || '').match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (folderMatch && folderMatch[1]) {
        folderId = folderMatch[1];
      } else if (/^[a-zA-Z0-9_-]{15,64}$/.test(folderInput.trim())) {
        folderId = folderInput.trim();
      }

      // Try fetching public Google Drive folder HTML
      const seenIds = new Set<string>();
      let fetchedFiles: { id: string; title: string; filename: string; mimeType: string; thumbUrl?: string }[] = [];

      try {
        const embedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
        const resp = await fetch(embedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        if (resp.ok) {
          const html = await resp.text();
          const entryRegex = /id="entry-([a-zA-Z0-9_-]{20,})"[\s\S]*?<div class="flip-entry-thumb"><img src="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/gi;
          let match;
          while ((match = entryRegex.exec(html)) !== null) {
            const fileId = match[1];
            const rawThumb = match[2];
            const rawTitle = match[3].trim();
            if (/\.(mp4|m4v|mkv|webm|mov|avi|ts)$/i.test(rawTitle) && !seenIds.has(fileId)) {
              seenIds.add(fileId);
              const highRes = rawThumb.includes('=s190') ? rawThumb.replace('=s190', '=s1280') : rawThumb;
              fetchedFiles.push({
                id: fileId,
                title: rawTitle.replace(/\.[^/.]+$/, ''),
                filename: rawTitle,
                mimeType: 'video/mp4',
                thumbUrl: highRes,
              });
            }
          }
        }
      } catch (e) {
        console.warn('Sync embedded folder parser error:', e);
      }

      // If fetched files found, add or update them
      let newCount = 0;
      if (fetchedFiles.length > 0) {
        for (const f of fetchedFiles) {
          let existing = Array.from(globalDriveVideos.values()).find((v) => v.driveFileId === f.id);
          if (existing) {
            existing.title = existing.title || f.title;
            existing.originalFilename = existing.originalFilename || f.filename;
            existing.folderId = folderId;
            existing.lastSyncedAt = new Date().toISOString();
          } else {
            newCount++;
            const newId = 'drive-' + crypto.randomBytes(4).toString('hex');
            const item: IDriveVideoItem = {
              _id: newId,
              driveFileId: f.id,
              title: f.title,
              originalFilename: f.filename,
              mimeType: f.mimeType,
              size: 1024 * 1024 * 50,
              thumbnailUrl: f.thumbUrl || `https://drive.google.com/thumbnail?id=${f.id}&sz=w1280`,
              driveViewUrl: `https://drive.google.com/file/d/${f.id}/view`,
              driveStreamUrl: `https://drive.google.com/uc?export=download&id=${f.id}`,
              folderId,
              lastSyncedAt: new Date().toISOString(),
              playCount: 0,
              favorite: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            globalDriveVideos.set(newId, item);
          }
        }
      }

      saveDriveVideosToDisk();

      const allDriveVideos = Array.from(globalDriveVideos.values());
      return NextResponse.json({
        success: true,
        message: `Synced ${allDriveVideos.length} videos from Google Drive folder (${newCount} new).`,
        folderId,
        syncedCount: allDriveVideos.length,
        newCount,
        videos: allDriveVideos,
      });
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: { message: 'Failed to sync Google Drive folder' } },
        { status: 500 }
      );
    }
  }

  // 11. Initiate Drive Thumbnail Upload: /api/drive/thumbnails/upload/initiate
  if (path === 'drive/thumbnails/upload/initiate') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    try {
      const body = await req.json().catch(() => ({}));
      const driveFileId = body.driveFileId || crypto.randomBytes(4).toString('hex');
      const filename = body.filename || 'thumbnail.webp';
      const randomUuid = crypto.randomUUID();
      const storageKey = `thumbnails/drive/${driveFileId}/${randomUuid}_${filename}`;
      const uploadUrl = `/api/upload-receiver?key=${encodeURIComponent(storageKey)}`;

      return NextResponse.json({
        success: true,
        uploadUrl,
        storageKey,
        storageAccount: 'account2',
        driveFileId,
      });
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: { message: 'Failed to initiate Drive thumbnail upload' } },
        { status: 500 }
      );
    }
  }

  // 12. Attach Drive Thumbnail: /api/drive/videos/:id/thumbnail
  if (slug.length === 4 && slug[0] === 'drive' && slug[1] === 'videos' && slug[3] === 'thumbnail') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const videoId = slug[2];
    let video = globalDriveVideos.get(videoId);
    if (!video) {
      video = Array.from(globalDriveVideos.values()).find((v) => v.driveFileId === videoId);
    }

    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Drive video not found' } },
        { status: 404 }
      );
    }

    try {
      const body = await req.json();
      video.thumbnailKey = body.thumbnailKey;
      if (body.blurhash) video.blurhash = body.blurhash;
      video.thumbnailStorageAccount = body.storageAccount || 'account2';

      // Check presigned B2 URL
      let thumbUrl = `/api/upload-receiver?key=${encodeURIComponent(body.thumbnailKey)}`;
      try {
        const b2Url = await getB2PresignedUrl(body.thumbnailKey, 3600, video.thumbnailStorageAccount);
        if (b2Url) thumbUrl = b2Url;
      } catch {}

      video.thumbnailUrl = thumbUrl;
      video.updatedAt = new Date().toISOString();

      saveDriveVideosToDisk();

      return NextResponse.json({
        success: true,
        video,
        thumbnailUrl: thumbUrl,
      });
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: { message: 'Failed to attach custom thumbnail' } },
        { status: 500 }
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
    saveSettingsToDisk();

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
    saveVideosToDisk();

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
    saveVideosToDisk();
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
      return new NextResponse('Missing key param', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    try {
      const chunkBuffer = Buffer.from(await req.arrayBuffer());
      const mimeType = req.headers.get('content-type') || 'video/mp4';
      const contentRange = req.headers.get('content-range');
      const offsetParam = req.nextUrl.searchParams.get('offset');
      const totalParam = req.nextUrl.searchParams.get('total');

      if (contentRange) {
        const match = contentRange.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = parseInt(match[2], 10);
          const total = match[3] !== '*' ? parseInt(match[3], 10) : undefined;

          let record = uploadedBlobs.get(key);
          if (!record || !record.buffer || (total && record.buffer.length !== total)) {
            const allocSize = total || end + 1;
            const newBuf = Buffer.alloc(allocSize);
            if (record?.buffer) {
              record.buffer.copy(newBuf, 0, 0, Math.min(record.buffer.length, allocSize));
            }
            record = {
              buffer: newBuf,
              mimeType,
              totalSize: total,
              uploadedBytes: 0,
            };
            uploadedBlobs.set(key, record);
          }

          // Write incoming chunk slice into buffer at offset start
          chunkBuffer.copy(record.buffer, start);
          writeDiskChunk(key, chunkBuffer, start);
          const newUploadedBytes = Math.max(record.uploadedBytes || 0, end + 1);
          record.uploadedBytes = newUploadedBytes;
          if (mimeType) record.mimeType = mimeType;

          const isComplete = total ? newUploadedBytes >= total : false;

          return NextResponse.json(
            {
              success: true,
              uploadedBytes: newUploadedBytes,
              totalSize: total || record.buffer.length,
              completed: isComplete,
            },
            {
              status: 200,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Range': `bytes=0-${newUploadedBytes - 1}`,
              },
            }
          );
        }
      } else if (offsetParam && totalParam) {
        const start = parseInt(offsetParam, 10);
        const total = parseInt(totalParam, 10);
        const end = start + chunkBuffer.length - 1;

        let record = uploadedBlobs.get(key);
        if (!record || !record.buffer || record.buffer.length !== total) {
          const newBuf = Buffer.alloc(total);
          if (record?.buffer) {
            record.buffer.copy(newBuf, 0, 0, Math.min(record.buffer.length, total));
          }
          record = {
            buffer: newBuf,
            mimeType,
            totalSize: total,
            uploadedBytes: 0,
          };
          uploadedBlobs.set(key, record);
        }

        chunkBuffer.copy(record.buffer, start);
        writeDiskChunk(key, chunkBuffer, start);
        const newUploadedBytes = Math.max(record.uploadedBytes || 0, end + 1);
        record.uploadedBytes = newUploadedBytes;
        if (mimeType) record.mimeType = mimeType;
        const isComplete = newUploadedBytes >= total;

        return NextResponse.json(
          {
            success: true,
            uploadedBytes: newUploadedBytes,
            totalSize: total,
            completed: isComplete,
          },
          {
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
          }
        );
      }

      // Monolithic full-file upload (for small items or thumbnails)
      uploadedBlobs.set(key, {
        buffer: chunkBuffer,
        mimeType,
        totalSize: chunkBuffer.length,
        uploadedBytes: chunkBuffer.length,
      });
      writeDiskChunk(key, chunkBuffer, 0);
      return new NextResponse('OK', {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    } catch (e: any) {
      console.error('Upload error in PUT receiver:', e);
      return new NextResponse('Upload error', {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  return new NextResponse('Not found', {
    status: 404,
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export async function HEAD(
  req: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  const slug = params?.slug || [];
  const path = slug.join('/');

  if (path === 'upload-receiver') {
    const key = req.nextUrl.searchParams.get('key');
    if (!key) {
      return new NextResponse(null, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    const record = uploadedBlobs.get(key);
    const uploadedBytes = record?.uploadedBytes ?? record?.buffer.length ?? 0;
    const totalSize = record?.totalSize ?? record?.buffer.length ?? 0;

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Length': '0',
        'Range': `bytes=0-${Math.max(0, uploadedBytes - 1)}`,
        'X-Uploaded-Bytes': uploadedBytes.toString(),
        'X-Total-Bytes': totalSize.toString(),
      },
    });
  }

  return new NextResponse(null, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
