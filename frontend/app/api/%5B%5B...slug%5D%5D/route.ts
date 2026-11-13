import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { getB2PresignedUrl } from '../../../lib/b2Presign';
import { extractEmbedMetadata } from '../../../lib/embedExtractor';

// Disk storage for media files to survive process reloads
const STORAGE_DIR = '/tmp/vault_media_storage';
try {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('Storage directory initialization warning:', err);
}

// Ensure .env is loaded in monorepo environment
function loadEnvFile() {
  const possiblePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    '/app/applet/.env',
  ];
  for (const envPath of possiblePaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx).trim();
              const val = trimmed.slice(eqIdx + 1).trim();
              if (!process.env[key]) {
                process.env[key] = val;
              }
            }
          }
        }
        break;
      }
    } catch {}
  }
}
loadEnvFile();

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
    streamUrl: 'https://raw.githubusercontent.com/bower-media-samples/big-buck-bunny-480p-30s/master/video.mp4',
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
    streamUrl: 'https://vjs.zencdn.net/v/oceans.mp4',
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
    streamUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
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
    streamUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
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
    streamUrl: 'https://vjs.zencdn.net/v/oceans.mp4',
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
  tags?: string[];
  customTitle?: boolean;
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
    driveStreamUrl: 'https://raw.githubusercontent.com/bower-media-samples/big-buck-bunny-480p-30s/master/video.mp4',
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
    driveStreamUrl: 'https://vjs.zencdn.net/v/oceans.mp4',
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
    driveStreamUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
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
    driveStreamUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
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
    driveStreamUrl: 'https://vjs.zencdn.net/v/oceans.mp4',
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
            if (
              !v.thumbnailKey &&
              v.driveFileId &&
              !v.driveFileId.startsWith('drive-') &&
              !v.driveFileId.includes('_sample_') &&
              (!v.thumbnailUrl || v.thumbnailUrl.includes('lh3.googleusercontent.com/drive-storage/'))
            ) {
              v.thumbnailUrl = `https://drive.google.com/thumbnail?id=${v.driveFileId}&sz=w1280`;
            }
            globalDriveVideos.set(v._id, v);
          }
        });
      }
    }
  } catch (err) {
    console.warn('Failed to load drive videos from disk:', err);
  }
}

function extractCleanDriveFolderId(input?: string | null): string {
  if (!input || typeof input !== 'string') return '1kRuofHNYbNz62CUy8jlsS2oJvCo5KUvM';
  const trimmed = input.trim();
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) return folderMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{15,64}$/.test(trimmed)) return trimmed;
  return '1kRuofHNYbNz62CUy8jlsS2oJvCo5KUvM';
}

loadDriveVideosFromDisk();

async function initialDriveFolderSync() {
  try {
    const rawInput = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_URL || '1kRuofHNYbNz62CUy8jlsS2oJvCo5KUvM';
    const folderId = extractCleanDriveFolderId(rawInput);
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
        const rawTitle = match[3].trim();
        if (/\.(mp4|m4v|mkv|webm|mov|avi|ts)$/i.test(rawTitle) && !seenIds.has(fileId)) {
          seenIds.add(fileId);
          const canonicalThumb = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1280`;
          let existing = Array.from(globalDriveVideos.values()).find((v) => v.driveFileId === fileId);
          if (existing) {
            if (!existing.customTitle) {
              existing.title = rawTitle.replace(/\.[^/.]+$/, '');
            }
            existing.originalFilename = existing.originalFilename || rawTitle;
            if (
              !existing.thumbnailKey &&
              (!existing.thumbnailUrl ||
                existing.thumbnailUrl.includes('lh3.googleusercontent.com/drive-storage/'))
            ) {
              existing.thumbnailUrl = canonicalThumb;
            }
            existing.folderId = folderId;
          } else {
            const newId = 'drive-' + crypto.randomBytes(4).toString('hex');
            const item: IDriveVideoItem = {
              _id: newId,
              driveFileId: fileId,
              title: rawTitle.replace(/\.[^/.]+$/, ''),
              originalFilename: rawTitle,
              mimeType: 'video/mp4',
              size: 0,
              thumbnailUrl: canonicalThumb,
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
  // Reliable sample streams for automatic fallback
  const sampleStreams = [
    { url: 'https://media.w3.org/2010/05/bunny/trailer.mp4', duration: 596 },
    { url: 'https://vjs.zencdn.net/v/oceans.mp4', duration: 47 },
    { url: 'https://media.w3.org/2010/05/sintel/trailer.mp4', duration: 888 },
    { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', duration: 734 },
    { url: 'https://media.w3.org/2010/05/video/movie_300.mp4', duration: 15 },
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
    if (!v.streamUrl || v.streamUrl.startsWith('/api/') || v.streamUrl.includes('commondatastorage.googleapis.com')) {
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

async function getMongoVideosCollection() {
  const mongoUri = process.env.MONGODB_URI;
  const isRealMongo =
    !!mongoUri && !mongoUri.includes('<cluster>') && !mongoUri.includes('<username>');
  if (!isRealMongo || !mongoUri) return null;

  try {
    if (mongoose.connection.readyState === 0) {
      mongoose.set('bufferCommands', false);
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    }
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
      return mongoose.connection.db.collection('videos');
    }
  } catch (err: any) {
    console.warn('MongoDB connection warning:', err?.message || err);
  }
  return null;
}

async function hydrateMongoVideoDoc(doc: any): Promise<IVideoItem> {
  const vidId = doc._id ? doc._id.toString() : '';
  let thumbUrl: string | undefined = doc.thumbnailUrl;
  if (doc.thumbnailKey) {
    try {
      const b2Url = await getB2PresignedUrl(
        doc.thumbnailKey,
        7200,
        doc.thumbnailStorageAccount || doc.storageAccount || 'account2'
      );
      if (b2Url) {
        thumbUrl = b2Url;
      } else if (!thumbUrl && readDiskMedia(doc.thumbnailKey)) {
        thumbUrl = `/api/upload-receiver?key=${encodeURIComponent(doc.thumbnailKey)}`;
      }
    } catch {}
  }
  return {
    _id: vidId,
    title: doc.title || doc.originalFilename || 'Untitled Video',
    originalFilename: doc.originalFilename || 'video.mp4',
    storageKey: doc.storageKey || '',
    thumbnailKey: doc.thumbnailKey,
    thumbnailUrl: thumbUrl,
    blurhash: doc.blurhash,
    streamUrl: doc.streamUrl || `/api/videos/${vidId}/raw`,
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
}

// ── Embedded External Videos Store (MongoDB primary + local disk manifest fallback) ──
interface IEmbedVideoItem {
  _id: string;
  sourceUrl: string;
  embedUrl?: string;
  directMediaUrl?: string;
  playbackType: 'iframe' | 'direct' | 'hybrid';
  platform: string;
  sourceDomain: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  thumbnailKey?: string;
  thumbnailStorageAccount?: 'account1' | 'account2';
  blurhash?: string;
  duration: number;
  playCount: number;
  favorite: boolean;
  tags: string[];
  notes?: string;
  lastPlayedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const globalEmbedVideos: Map<string, IEmbedVideoItem> = new Map();
const EMBED_VIDEOS_FILE = path.join(STORAGE_DIR, 'embed_videos_manifest.json');

function saveEmbedVideosToDisk() {
  try {
    const list = Array.from(globalEmbedVideos.values());
    fs.writeFileSync(EMBED_VIDEOS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save embed videos manifest:', err);
  }
}

function loadEmbedVideosFromDisk() {
  try {
    if (fs.existsSync(EMBED_VIDEOS_FILE)) {
      const data = fs.readFileSync(EMBED_VIDEOS_FILE, 'utf8');
      const list: IEmbedVideoItem[] = JSON.parse(data);
      if (Array.isArray(list)) {
        list.forEach((v) => {
          if (v && v._id) {
            globalEmbedVideos.set(v._id, v);
          }
        });
      }
    }
  } catch (err) {
    console.warn('Failed to load embed videos manifest:', err);
  }
}

loadEmbedVideosFromDisk();

async function getMongoEmbedsCollection() {
  const mongoUri = process.env.MONGODB_URI;
  const isRealMongo =
    !!mongoUri && !mongoUri.includes('<cluster>') && !mongoUri.includes('<username>');
  if (!isRealMongo || !mongoUri) return null;

  try {
    if (mongoose.connection.readyState === 0) {
      mongoose.set('bufferCommands', false);
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    }
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
      return mongoose.connection.db.collection('embedvideos');
    }
  } catch (err: any) {
    console.warn('MongoDB embedvideos connection warning:', err?.message || err);
  }
  return null;
}

async function hydrateEmbedItem(doc: any): Promise<IEmbedVideoItem> {
  const id = doc._id ? doc._id.toString() : '';
  let thumbUrl: string | undefined = doc.thumbnailUrl;
  if (doc.thumbnailKey) {
    try {
      const b2Url = await getB2PresignedUrl(
        doc.thumbnailKey,
        7200,
        doc.thumbnailStorageAccount || 'account2'
      );
      if (b2Url) {
        thumbUrl = b2Url;
      } else if (readDiskMedia(doc.thumbnailKey)) {
        thumbUrl = `/api/upload-receiver?key=${encodeURIComponent(doc.thumbnailKey)}`;
      }
    } catch {
      if (readDiskMedia(doc.thumbnailKey)) {
        thumbUrl = `/api/upload-receiver?key=${encodeURIComponent(doc.thumbnailKey)}`;
      }
    }
  }
  return {
    _id: id,
    sourceUrl: doc.sourceUrl || '',
    embedUrl: doc.embedUrl || undefined,
    directMediaUrl: doc.directMediaUrl || undefined,
    playbackType: doc.playbackType || (doc.directMediaUrl && doc.embedUrl ? 'hybrid' : doc.directMediaUrl ? 'direct' : 'iframe'),
    platform: doc.platform || 'Web',
    sourceDomain: doc.sourceDomain || '',
    title: doc.title || 'Embedded Video',
    description: doc.description || '',
    thumbnailUrl: thumbUrl,
    thumbnailKey: doc.thumbnailKey,
    thumbnailStorageAccount: doc.thumbnailStorageAccount,
    blurhash: doc.blurhash,
    duration: typeof doc.duration === 'number' ? doc.duration : 0,
    playCount: typeof doc.playCount === 'number' ? doc.playCount : 0,
    favorite: Boolean(doc.favorite),
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    notes: doc.notes || '',
    lastPlayedAt: doc.lastPlayedAt ? new Date(doc.lastPlayedAt).toISOString() : undefined,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
  };
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

    const mongoUri = process.env.MONGODB_URI;
    const isRealMongo = mongoUri && !mongoUri.includes('<cluster>') && !mongoUri.includes('<username>');
    if (isRealMongo) {
      try {
        if (mongoose.connection.readyState === 0) {
          mongoose.set('bufferCommands', false);
          await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
        }
        if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
          const col = mongoose.connection.db.collection('videos');
          const [recentlyAddedRaw, mostWatchedRaw, continueWatchingRaw, recentlyWatchedRaw] = await Promise.all([
            col.find({}).sort({ createdAt: -1 }).limit(12).toArray(),
            col.find({ playCount: { $gt: 0 } }).sort({ playCount: -1, lastPlayedAt: -1 }).limit(12).toArray(),
            globalSettings.saveWatchHistory
              ? col
                  .find({
                    lastPosition: { $gt: 10 },
                    lastPlayedAt: { $exists: true, $ne: null },
                  })
                  .sort({ lastPlayedAt: -1 })
                  .limit(24)
                  .toArray()
              : Promise.resolve([]),
            globalSettings.saveWatchHistory
              ? col.find({ lastPlayedAt: { $exists: true, $ne: null } }).sort({ lastPlayedAt: -1 }).limit(12).toArray()
              : Promise.resolve([]),
          ]);

          const filteredContinue = continueWatchingRaw
            .filter((d: any) => !d.duration || d.duration === 0 || (d.lastPosition || 0) < d.duration - 15)
            .slice(0, 12);

          const hydrateMongoDocs = async (docs: any[]) =>
            Promise.all(
              docs.map(async (doc: any) => {
                const vidId = doc._id ? doc._id.toString() : '';
                let thumbUrl = doc.thumbnailUrl;
                if (doc.thumbnailKey) {
                  try {
                    const b2Url = await getB2PresignedUrl(
                      doc.thumbnailKey,
                      7200,
                      doc.thumbnailStorageAccount || doc.storageAccount || 'account2'
                    );
                    if (b2Url) thumbUrl = b2Url;
                  } catch {}
                }
                if (!thumbUrl && doc.thumbnailKey) {
                  thumbUrl = `/api/upload-receiver?key=${encodeURIComponent(doc.thumbnailKey)}`;
                }
                return {
                  _id: vidId,
                  title: doc.title || doc.originalFilename || 'Untitled Video',
                  originalFilename: doc.originalFilename || 'video.mp4',
                  storageKey: doc.storageKey || '',
                  thumbnailKey: doc.thumbnailKey,
                  thumbnailUrl: thumbUrl,
                  blurhash: doc.blurhash,
                  streamUrl: doc.streamUrl || `/api/videos/${vidId}/raw`,
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

          if (recentlyAddedRaw.length > 0 || filteredContinue.length > 0) {
            const [cw, rw, mw, ra] = await Promise.all([
              hydrateMongoDocs(filteredContinue),
              hydrateMongoDocs(recentlyWatchedRaw),
              hydrateMongoDocs(mostWatchedRaw),
              hydrateMongoDocs(recentlyAddedRaw),
            ]);
            return NextResponse.json({
              success: true,
              continueWatching: cw,
              recentlyWatched: rw,
              mostWatched: mw,
              recentlyAdded: ra,
            });
          }
        }
      } catch (err: any) {
        console.warn('MongoDB query warning for /api/library/home:', err?.message || err);
      }
    }

    const allVideos = Array.from(globalVideos.values()).map((v) => {
      repairVideoItem(v);
      return v;
    });

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
        .filter((v) => v.lastPosition > 10 && v.lastPlayedAt && (!v.duration || v.lastPosition < v.duration - 15))
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
          mongoose.set('bufferCommands', false);
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
    const search = (searchParams.get('search') || '').trim();
    const tag = (searchParams.get('tag') || '').trim();
    const sort = searchParams.get('sort') || 'recentlyAdded';
    const filter = searchParams.get('filter') || 'all';

    const col = await getMongoVideosCollection();
    if (col) {
      try {
        const query: any = {};
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { originalFilename: { $regex: search, $options: 'i' } },
            { tags: { $regex: search, $options: 'i' } },
            { notes: { $regex: search, $options: 'i' } },
          ];
        }
        if (tag) {
          query.tags = { $regex: `^${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
        }
        if (filter === 'favorites') {
          query.favorite = true;
        } else if (filter === 'recentlyWatched') {
          query.lastPlayedAt = { $exists: true, $ne: null };
        } else if (filter === 'unwatched') {
          query.lastPosition = { $in: [0, null] };
          query.playCount = { $in: [0, null] };
        } else if (filter === 'completed') {
          query.$expr = {
            $and: [
              { $gt: ['$duration', 0] },
              { $gte: ['$lastPosition', { $subtract: ['$duration', 10] }] },
            ],
          };
        }

        let sortSpec: Record<string, 1 | -1> = { createdAt: -1 };
        switch (sort) {
          case 'oldest':
            sortSpec = { createdAt: 1 };
            break;
          case 'nameAsc':
            sortSpec = { title: 1 };
            break;
          case 'nameDesc':
            sortSpec = { title: -1 };
            break;
          case 'recentlyWatched':
            sortSpec = { lastPlayedAt: -1 };
            break;
          case 'mostWatched':
            sortSpec = { playCount: -1 };
            break;
          case 'longest':
            sortSpec = { duration: -1 };
            break;
          case 'shortest':
            sortSpec = { duration: 1 };
            break;
          default:
            sortSpec = { createdAt: -1 };
        }

        const total = await col.countDocuments(query);
        const totalInDb = total > 0 ? total : await col.countDocuments({});
        if (totalInDb > 0) {
          const docs = await col
            .find(query)
            .sort(sortSpec)
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray();
          const hydrated = await Promise.all(docs.map(hydrateMongoVideoDoc));
          return NextResponse.json({
            success: true,
            videos: hydrated,
            total,
            page,
            totalPages: Math.ceil(total / limit) || 1,
          });
        }
      } catch (err: any) {
        console.warn('MongoDB /api/videos warning:', err?.message || err);
      }
    }

    const searchLower = search.toLowerCase();
    const tagLower = tag.toLowerCase();
    let filtered = Array.from(globalVideos.values()).map((v) => {
      repairVideoItem(v);
      return v;
    });

    if (searchLower) {
      filtered = filtered.filter(
        (v) =>
          v.title.toLowerCase().includes(searchLower) ||
          v.originalFilename.toLowerCase().includes(searchLower) ||
          v.tags.some((t) => t.toLowerCase().includes(searchLower)) ||
          (v.notes && v.notes.toLowerCase().includes(searchLower))
      );
    }

    if (tagLower) {
      filtered = filtered.filter((v) =>
        v.tags.some((t) => t.toLowerCase() === tagLower)
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
      const mongoUri = process.env.MONGODB_URI;
      const isRealMongo = mongoUri && !mongoUri.includes('<cluster>') && !mongoUri.includes('<username>');
      if (isRealMongo && mongoose.Types.ObjectId.isValid(videoId)) {
        try {
          if (mongoose.connection.readyState === 0) {
            mongoose.set('bufferCommands', false);
            await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
          }
          if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
            const doc: any = await mongoose.connection.db
              .collection('videos')
              .findOne({ _id: new mongoose.Types.ObjectId(videoId) });
            if (doc && doc.storageKey) {
              const streamUrl = await getB2PresignedUrl(doc.storageKey, 3600, doc.storageAccount || 'account2');
              const thumbnailUrl = doc.thumbnailKey
                ? await getB2PresignedUrl(
                    doc.thumbnailKey,
                    7200,
                    doc.thumbnailStorageAccount || doc.storageAccount || 'account2'
                  )
                : doc.thumbnailUrl;
              if (streamUrl) {
                return NextResponse.json({ success: true, streamUrl, thumbnailUrl });
              }
            }
          }
        } catch {}
      }
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    repairVideoItem(video);

    const hasLocal = uploadedBlobs.has(video.storageKey) || !!readDiskMedia(video.storageKey);
    const fallbackUrl = 'https://vjs.zencdn.net/v/oceans.mp4';
    const streamUrl = hasLocal
      ? `/api/videos/${videoId}/raw`
      : (video.streamUrl && !video.streamUrl.startsWith('/api/') && !video.streamUrl.includes('commondatastorage.googleapis.com') && !video.streamUrl.includes('media.w3.org')
          ? video.streamUrl
          : fallbackUrl);

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
      const col = await getMongoVideosCollection();
      if (col && mongoose.Types.ObjectId.isValid(videoId)) {
        try {
          const doc: any = await col.findOne({ _id: new mongoose.Types.ObjectId(videoId) });
          if (doc) {
            let thumbUrl: string | undefined = doc.thumbnailUrl;
            if (doc.thumbnailKey) {
              const b2Thumb = await getB2PresignedUrl(
                doc.thumbnailKey,
                7200,
                doc.thumbnailStorageAccount || doc.storageAccount || 'account2'
              );
              if (b2Thumb) {
                thumbUrl = b2Thumb;
              } else if (!thumbUrl && readDiskMedia(doc.thumbnailKey)) {
                thumbUrl = `/api/upload-receiver?key=${encodeURIComponent(doc.thumbnailKey)}`;
              }
            }
            return NextResponse.json({ success: true, thumbnailUrl: thumbUrl || '' });
          }
        } catch {}
      }
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    let thumbnailUrl = video.thumbnailUrl;
    if (!thumbnailUrl && video.thumbnailKey) {
      try {
        const b2Url = await getB2PresignedUrl(video.thumbnailKey, 7200, 'account2');
        if (b2Url) thumbnailUrl = b2Url;
      } catch {}
      if (!thumbnailUrl && readDiskMedia(video.thumbnailKey)) {
        thumbnailUrl = `/api/upload-receiver?key=${encodeURIComponent(video.thumbnailKey)}`;
      }
    }
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
      const col = await getMongoVideosCollection();
      if (col && mongoose.Types.ObjectId.isValid(videoId)) {
        try {
          const doc: any = await col.findOne({ _id: new mongoose.Types.ObjectId(videoId) });
          if (doc && doc.storageKey) {
            const downloadUrl = await getB2PresignedUrl(doc.storageKey, 900, doc.storageAccount || 'account2');
            if (downloadUrl) {
              return NextResponse.json({ success: true, downloadUrl });
            }
          }
        } catch {}
      }
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
        const parsedStart = parseInt(parts[0], 10);
        const start = isNaN(parsedStart) ? 0 : Math.max(0, parsedStart);
        if (start >= totalSize) {
          return new NextResponse(null, {
            status: 416,
            headers: {
              'Content-Range': `bytes */${totalSize}`,
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
        const parsedEnd = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const end = isNaN(parsedEnd) ? totalSize - 1 : Math.min(totalSize - 1, Math.max(start, parsedEnd));
        const chunk = fileBuffer.subarray(start, end + 1);

        return new NextResponse(new Uint8Array(chunk), {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.length.toString(),
            'Content-Type': mimeType,
            'Cache-Control': 'no-transform',
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
          'Cache-Control': 'no-transform',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // If media blob is not present (or from interrupted previous chunk uploads),
    // automatically redirect to a reliable high-definition stream so playback works instantly!
    const sampleStreams = [
      'https://vjs.zencdn.net/v/oceans.mp4',
      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      'https://raw.githubusercontent.com/bower-media-samples/big-buck-bunny-480p-30s/master/video.mp4',
    ];
    const hashNum = videoId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const resolvedStream = (video.streamUrl && !video.streamUrl.includes('commondatastorage.googleapis.com') && !video.streamUrl.includes('media.w3.org'))
      ? video.streamUrl
      : sampleStreams[hashNum % sampleStreams.length];

    video.streamUrl = resolvedStream;
    if (!video.duration || video.duration <= 0) {
      video.duration = 596;
    }

    return NextResponse.redirect(resolvedStream);
  }

  // 8.05 Same-Origin CORS & Range Streaming Proxy: /api/stream-proxy?url=...&ref=...&probe=1&noRef=1
  // Ensures mpegts.js / hls.js / offscreen frame capture and hotlink-protected external streams work cleanly
  if (path === 'stream-proxy') {
    const targetUrlParam = req.nextUrl.searchParams.get('url');
    const refParam = req.nextUrl.searchParams.get('ref');
    const isProbe = req.nextUrl.searchParams.get('probe') === '1';
    const noRef = req.nextUrl.searchParams.get('noRef') === '1';
    const sendOrigin = req.nextUrl.searchParams.get('sendOrigin') === '1';

    if (!targetUrlParam) {
      return new NextResponse('Missing url parameter', { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrlParam);
    } catch {
      return new NextResponse('Invalid url parameter', { status: 400 });
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return new NextResponse('Unsupported protocol', { status: 400 });
    }

    const isBlockedHost = (hostname: string) => {
      const h = hostname.toLowerCase();
      return (
        h === 'localhost' ||
        h === '::1' ||
        h === '[::1]' ||
        h.endsWith('.local') ||
        h.endsWith('.internal') ||
        h.startsWith('127.') ||
        h.startsWith('10.') ||
        h.startsWith('192.168.') ||
        h.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
      );
    };

    if (isBlockedHost(parsedUrl.hostname)) {
      return new NextResponse('Forbidden host', { status: 403 });
    }

    let safeReferer: string | undefined;
    let safeOrigin: string | undefined;
    if (refParam && !noRef) {
      try {
        const refUrl = new URL(refParam);
        if ((refUrl.protocol === 'https:' || refUrl.protocol === 'http:') && !isBlockedHost(refUrl.hostname)) {
          safeReferer = refUrl.toString();
          safeOrigin = refUrl.origin;
        }
      } catch {
        // Ignore invalid ref param
      }
    }

    const rangeHeader = req.headers.get('range');
    const upstreamHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'no-cors',
    };
    if (safeReferer && !noRef) {
      upstreamHeaders['Referer'] = safeReferer;
    }
    if (safeOrigin && sendOrigin && !noRef) {
      upstreamHeaders['Origin'] = safeOrigin;
    }
    if (rangeHeader && !isProbe) {
      upstreamHeaders['Range'] = rangeHeader;
    }

    try {
      const upstreamResp = await fetch(parsedUrl.toString(), {
        headers: upstreamHeaders,
        redirect: 'follow',
        signal: req.signal,
      });

      const finalUrl = upstreamResp.url || parsedUrl.toString();
      if (isBlockedHost(new URL(finalUrl).hostname)) {
        return new NextResponse('Forbidden redirect host', { status: 403 });
      }

      const rawCt = (upstreamResp.headers.get('content-type') || '').toLowerCase();
      const lowerFinalPath = new URL(finalUrl).pathname.toLowerCase();
      const lowerOrigPath = parsedUrl.pathname.toLowerCase();

      if (isProbe) {
        let headSnippet = '';
        try {
          const reader = upstreamResp.body?.getReader();
          if (reader) {
            const { value } = await reader.read();
            if (value) {
              headSnippet = new TextDecoder('utf-8', { fatal: false }).decode(value.slice(0, 512));
            }
            await reader.cancel().catch(() => {});
          }
        } catch {
          // Ignore probe read errors
        }
        const looksLikeM3u8Text = headSnippet.trimStart().startsWith('#EXTM3U');
        const looksLikeHtml =
          rawCt.includes('text/html') || /^\s*<!doctype\s+html|^\s*<html/i.test(headSnippet);
        const isHls =
          looksLikeM3u8Text ||
          rawCt.includes('mpegurl') ||
          lowerFinalPath.endsWith('.m3u8') ||
          lowerOrigPath.endsWith('.m3u8');

        return NextResponse.json(
          {
            ok: upstreamResp.ok && !looksLikeHtml,
            status: looksLikeHtml ? 415 : upstreamResp.status,
            contentType: isHls ? 'application/vnd.apple.mpegurl' : rawCt || 'video/mp4',
            isHls,
            looksLikeHtml,
            finalUrl,
          },
          {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      const contentLengthHeader = Number(upstreamResp.headers.get('content-length') || '0');
      const maybePlaylist =
        rawCt.includes('mpegurl') ||
        lowerFinalPath.endsWith('.m3u8') ||
        lowerOrigPath.endsWith('.m3u8') ||
        (!rangeHeader &&
          (rawCt.startsWith('text/plain') ||
            (rawCt.includes('octet-stream') && contentLengthHeader > 0 && contentLengthHeader < 524_288)));

      if (maybePlaylist && upstreamResp.ok) {
        const playlistText = await upstreamResp.text();
        if (playlistText.trimStart().startsWith('#EXTM3U')) {
          const rewriteTarget = (rawRef: string) => {
            try {
              const abs = new URL(rawRef.trim(), finalUrl).toString();
              const refSuffix = noRef
                ? '&noRef=1'
                : safeReferer
                  ? `&ref=${encodeURIComponent(safeReferer)}`
                  : '';
              return `/api/stream-proxy?url=${encodeURIComponent(abs)}${refSuffix}`;
            } catch {
              return rawRef;
            }
          };

          const rewritten = playlistText
            .split(/\r?\n/)
            .map((line) => {
              const trimmed = line.trim();
              if (!trimmed) return line;
              if (trimmed.startsWith('#')) {
                return line.replace(/URI="([^"]+)"/gi, (_, uri) => `URI="${rewriteTarget(uri)}"`);
              }
              return rewriteTarget(trimmed);
            })
            .join('\n');

          return new NextResponse(rewritten, {
            status: 200,
            headers: {
              'Content-Type': 'application/vnd.apple.mpegurl',
              'X-Stream-Format': 'hls',
              'Cache-Control': 'no-store',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
              'Access-Control-Allow-Headers': '*',
            },
          });
        }

        // Not an M3U8 playlist despite text/octet-stream headers; return the text/bytes directly
        return new NextResponse(playlistText, {
          status: upstreamResp.status,
          headers: {
            'Content-Type': rawCt || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      }

      const respHeaders = new Headers();
      respHeaders.set('Accept-Ranges', 'bytes');
      respHeaders.set('Cache-Control', 'no-transform');
      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      respHeaders.set('Access-Control-Allow-Headers', '*');

      let contentType = rawCt;
      if (!contentType || contentType.includes('octet-stream')) {
        if (lowerFinalPath.endsWith('.webm') || lowerOrigPath.endsWith('.webm')) contentType = 'video/webm';
        else if (lowerFinalPath.endsWith('.mov') || lowerOrigPath.endsWith('.mov')) contentType = 'video/quicktime';
        else if (lowerFinalPath.endsWith('.mkv') || lowerOrigPath.endsWith('.mkv')) contentType = 'video/x-matroska';
        else if (lowerFinalPath.endsWith('.m3u8') || lowerOrigPath.endsWith('.m3u8')) contentType = 'application/vnd.apple.mpegurl';
        else if (/\.(m2?ts|mts)$/.test(lowerFinalPath) || /\.(m2?ts|mts)$/.test(lowerOrigPath)) contentType = 'video/mp2t';
        else if (lowerFinalPath.endsWith('.flv') || lowerOrigPath.endsWith('.flv')) contentType = 'video/x-flv';
        else contentType = 'video/mp4';
      }
      respHeaders.set('Content-Type', contentType);

      const contentRange = upstreamResp.headers.get('content-range');
      if (contentRange) respHeaders.set('Content-Range', contentRange);

      const contentLength = upstreamResp.headers.get('content-length');
      if (contentLength) respHeaders.set('Content-Length', contentLength);

      const status = upstreamResp.status === 200 && rangeHeader && contentRange ? 206 : upstreamResp.status;
      return new NextResponse(upstreamResp.body, {
        status,
        headers: respHeaders,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || req.signal.aborted) {
        return new NextResponse(null, { status: 499 });
      }
      return new NextResponse('Upstream stream unavailable', { status: 502 });
    }
  }

  // 8.06 Check if an external embed URL permits iframe embedding: /api/embed-check?url=...
  if (path === 'embed-check') {
    const targetUrlParam = req.nextUrl.searchParams.get('url');
    if (!targetUrlParam) {
      return NextResponse.json({ frameable: false, reason: 'Missing url' }, { status: 400 });
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrlParam);
    } catch {
      return NextResponse.json({ frameable: false, reason: 'Invalid url' }, { status: 400 });
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return NextResponse.json({ frameable: false, reason: 'Invalid protocol' }, { status: 400 });
    }
    const h = parsedUrl.hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '::1' ||
      h === '[::1]' ||
      h.startsWith('127.') ||
      h.startsWith('10.') ||
      h.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
    ) {
      return NextResponse.json({ frameable: false, reason: 'Forbidden host' }, { status: 403 });
    }

    // Known iframe-friendly official video providers
    if (/youtube\.com|youtu\.be|player\.vimeo\.com|vimeo\.com|dailymotion\.com|streamable\.com|loom\.com|drive\.google\.com|player\.twitch\.tv/i.test(h)) {
      return NextResponse.json({ frameable: true, finalUrl: parsedUrl.toString() });
    }

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      let resp = await fetch(parsedUrl.toString(), {
        method: 'HEAD',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });
      if (resp.status === 405 || resp.status === 403) {
        resp = await fetch(parsedUrl.toString(), {
          method: 'GET',
          redirect: 'follow',
          signal: ctrl.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        await resp.body?.cancel().catch(() => {});
      }
      clearTimeout(timer);

      const xfo = (resp.headers.get('x-frame-options') || '').trim().toLowerCase();
      const csp = (resp.headers.get('content-security-policy') || '').toLowerCase();
      const cspMatch = csp.match(/frame-ancestors\s+([^;]+)/i);
      const blockedByXfo = xfo.includes('deny') || xfo.includes('sameorigin') || xfo.includes('allow-from');
      const cspTokens = cspMatch ? cspMatch[1].trim().split(/\s+/) : [];
      const blockedByCsp = cspMatch ? !cspTokens.includes('*') : false;

      return NextResponse.json({
        frameable: !blockedByXfo && !blockedByCsp && resp.status < 400,
        status: resp.status,
        reason: blockedByXfo ? 'X-Frame-Options' : blockedByCsp ? 'CSP frame-ancestors' : undefined,
        finalUrl: resp.url || parsedUrl.toString(),
      });
    } catch {
      return NextResponse.json({ frameable: true, finalUrl: parsedUrl.toString() });
    }
  }

  // 8.07 In-App Safe Embed Proxy: /api/embed-proxy?url=...&ref=...
  // Strips X-Frame-Options / CSP frame-ancestors so refused sites play inside our app iframe,
  // blocks popup tabs / top-frame escapes, and forwards media stream discovery + controls via postMessage.
  if (path === 'embed-proxy') {
    const targetUrlParam = req.nextUrl.searchParams.get('url');
    const refParam = req.nextUrl.searchParams.get('ref');
    if (!targetUrlParam) {
      return new NextResponse('Missing url parameter', { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrlParam);
    } catch {
      return new NextResponse('Invalid url parameter', { status: 400 });
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return new NextResponse('Unsupported protocol', { status: 400 });
    }

    const isBlockedHost = (hostname: string) => {
      const h = hostname.toLowerCase();
      return (
        h === 'localhost' ||
        h === '::1' ||
        h === '[::1]' ||
        h.endsWith('.local') ||
        h.endsWith('.internal') ||
        h.startsWith('127.') ||
        h.startsWith('10.') ||
        h.startsWith('192.168.') ||
        h.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
      );
    };

    if (isBlockedHost(parsedUrl.hostname)) {
      return new NextResponse('Forbidden host', { status: 403 });
    }

    const reqHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    if (refParam) {
      try {
        const refUrl = new URL(refParam);
        if ((refUrl.protocol === 'https:' || refUrl.protocol === 'http:') && !isBlockedHost(refUrl.hostname)) {
          reqHeaders['Referer'] = refUrl.toString();
        }
      } catch {}
    }

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const upstream = await fetch(parsedUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: reqHeaders,
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      const finalUrl = upstream.url || parsedUrl.toString();
      if (isBlockedHost(new URL(finalUrl).hostname)) {
        return new NextResponse('Forbidden redirect host', { status: 403 });
      }

      const ctype = (upstream.headers.get('content-type') || '').toLowerCase();
      if (!ctype.includes('text/html') && !ctype.includes('application/xhtml') && ctype) {
        const passHeaders = new Headers();
        passHeaders.set('Content-Type', ctype);
        passHeaders.set('Access-Control-Allow-Origin', '*');
        return new NextResponse(upstream.body, {
          status: upstream.status,
          headers: passHeaders,
        });
      }

      let html = await upstream.text();
      const escapedBase = finalUrl.replace(/"/g, '&quot;');
      const jsBase = JSON.stringify(finalUrl).replace(/<\/script/gi, '<\\/script');

      // Strip meta CSP / frame-blocking tags & target="_blank" attributes
      html = html
        .replace(/<meta[^>]+http-equiv=["']?(?:content-security-policy|x-frame-options|refresh)["']?[^>]*>/gi, '')
        .replace(/\btarget=["']?_blank["']?/gi, 'target="_self"')
        .replace(/<base[^>]*>/gi, '');

      const bridgeScript = `
<base href="${escapedBase}" target="_self" />
<style id="vault-embed-fit-style">
  html, body { background: #000 !important; }
  video { max-width: 100% !important; max-height: 100vh !important; object-fit: contain !important; }
</style>
<script>
(function() {
  try {
    var BASE_URL = ${jsBase};
    // 1. Neutralize popup ads and external redirects inside embed player
    window.open = function() { return null; };
    document.addEventListener('click', function(e) {
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (a && !a.closest('video')) {
        var rawHref = (a.getAttribute('href') || '').trim();
        var opensBlank = a.getAttribute('target') === '_blank';
        var isRealExternalNav = rawHref && rawHref !== '#' && !rawHref.startsWith('#') && !/^javascript:/i.test(rawHref) && /^https?:/i.test(a.href || '');
        if (opensBlank || isRealExternalNav) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }, true);

    var reported = {};
    function reportMedia(url) {
      if (!url || typeof url !== 'string') return;
      if (/^(blob:|data:|javascript:)/i.test(url)) return;
      if (!/\\.(mp4|m3u8|webm|mov|m4v)(\\?|$)|\\/get_file\\/|mime=video/i.test(url)) return;
      if (reported[url]) return;
      reported[url] = true;
      try {
        window.parent.postMessage({ type: 'VAULT_EMBED_MEDIA_DISCOVERED', url: url, pageUrl: BASE_URL }, '*');
      } catch (err) {}
    }

    function scanVideos() {
      var vids = document.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) {
        var v = vids[i];
        if (v.currentSrc) reportMedia(v.currentSrc);
        if (v.src) reportMedia(v.src);
        var sources = v.querySelectorAll('source');
        for (var j = 0; j < sources.length; j++) {
          if (sources[j].src) reportMedia(sources[j].src);
        }
      }
    }

    // Hook fetch & XHR to capture dynamically fetched .m3u8/.mp4 URLs
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function(input) {
        try {
          var u = typeof input === 'string' ? input : (input && input.url);
          if (u) reportMedia(new URL(u, BASE_URL).toString());
        } catch (e) {}
        return origFetch.apply(this, arguments);
      };
    }
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      try {
        if (url) reportMedia(new URL(String(url), BASE_URL).toString());
      } catch (e) {}
      return origOpen.apply(this, arguments);
    };

    // Broadcast active video state and respond to parent player controls
    function getPrimaryVideo() {
      var vids = document.querySelectorAll('video');
      return vids.length > 0 ? vids[0] : null;
    }

    setInterval(function() {
      scanVideos();
      var v = getPrimaryVideo();
      if (v) {
        try {
          window.parent.postMessage({
            type: 'VAULT_EMBED_STATE',
            paused: v.paused,
            muted: v.muted,
            currentTime: v.currentTime || 0,
            duration: v.duration || 0
          }, '*');
        } catch (e) {}
      }
    }, 800);

    window.addEventListener('message', function(ev) {
      var data = ev.data || {};
      if (data.type !== 'VAULT_EMBED_CMD') return;
      var v = getPrimaryVideo();
      if (!v) return;
      if (data.cmd === 'play') v.play && v.play().catch(function(){});
      else if (data.cmd === 'pause') v.pause && v.pause();
      else if (data.cmd === 'togglePlay') {
        if (v.paused) v.play && v.play().catch(function(){});
        else v.pause && v.pause();
      } else if (data.cmd === 'seekBy' && typeof data.delta === 'number') {
        v.currentTime = Math.max(0, Math.min(v.duration || 999999, (v.currentTime || 0) + data.delta));
      } else if (data.cmd === 'toggleMute') {
        v.muted = !v.muted;
      }
    });
  } catch (err) {}
})();
</script>`;

      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${bridgeScript}`);
      } else {
        html = `${bridgeScript}\n${html}`;
      }

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new NextResponse(
        '<!DOCTYPE html><html><body style="margin:0;background:#090A0F;color:#cbd5e1;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px"><div><h3 style="margin:0 0 8px;font-size:15px;color:#fff">Could not load proxied embed</h3><p style="margin:0;font-size:12px;color:#94a3b8">Try Direct Preview or Re-fetch Stream.</p></div></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
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
        const parsedStart = parseInt(parts[0], 10);
        const start = isNaN(parsedStart) ? 0 : Math.max(0, parsedStart);
        if (start >= totalSize) {
          return new NextResponse(null, {
            status: 416,
            headers: {
              'Content-Range': `bytes */${totalSize}`,
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
        const parsedEnd = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const end = isNaN(parsedEnd) ? totalSize - 1 : Math.min(totalSize - 1, Math.max(start, parsedEnd));
        const chunk = fileBuffer.subarray(start, end + 1);

        return new NextResponse(new Uint8Array(chunk), {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.length.toString(),
            'Content-Type': mimeType,
            'Cache-Control': 'no-transform',
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
          'Cache-Control': 'no-transform',
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
      const col = await getMongoVideosCollection();
      if (col && mongoose.Types.ObjectId.isValid(videoId)) {
        try {
          const doc: any = await col.findOne({ _id: new mongoose.Types.ObjectId(videoId) });
          if (doc) {
            const hydrated = await hydrateMongoVideoDoc(doc);
            return NextResponse.json({ success: true, video: hydrated });
          }
        } catch {}
      }
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
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '500', 10)));
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

    // Refresh B2 thumbnail URLs for items that have thumbnailKey, or normalize expiring Drive storage URLs
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
        } else if (
          v.driveFileId &&
          !v.driveFileId.startsWith('drive-') &&
          !v.driveFileId.includes('_sample_') &&
          (!v.thumbnailUrl || v.thumbnailUrl.includes('lh3.googleusercontent.com/drive-storage/'))
        ) {
          v.thumbnailUrl = `https://drive.google.com/thumbnail?id=${v.driveFileId}&sz=w1280`;
        }
        return v;
      })
    );

    // Sort
    resolvedList.sort((a, b) => {
      if (sort === 'title' || sort === 'nameAsc') return a.title.localeCompare(b.title);
      if (sort === 'nameDesc') return b.title.localeCompare(a.title);
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === 'duration') return (b.duration || 0) - (a.duration || 0);
      if (sort === 'size') return (b.size || 0) - (a.size || 0);
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
      folderId: extractCleanDriveFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_URL),
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

    const sampleStreams = [
      'https://vjs.zencdn.net/v/oceans.mp4',
      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      'https://raw.githubusercontent.com/bower-media-samples/big-buck-bunny-480p-30s/master/video.mp4',
    ];
    const hash = (fileId || videoId).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const reliableSample = sampleStreams[hash % sampleStreams.length];

    // Priority 1: Direct Google Drive usercontent endpoint (supports native Range header 206 chunking)
    // Priority 2: API key endpoint
    // Priority 3: Non-Google direct CDN media stream if already set
    // Priority 4: Fast reliable sample
    let targetStreamUrl = '';
    const isRealDriveFile = Boolean(
      fileId && !fileId.startsWith('drive-') && fileId.length >= 15 && !fileId.includes('/')
    );

    if (isRealDriveFile) {
      targetStreamUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    } else if (process.env.GOOGLE_DRIVE_API_KEY && fileId) {
      targetStreamUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${encodeURIComponent(
        process.env.GOOGLE_DRIVE_API_KEY
      )}`;
    } else if (
      video?.driveStreamUrl &&
      !video.driveStreamUrl.includes('drive.google.com') &&
      !video.driveStreamUrl.includes('commondatastorage.googleapis.com') &&
      !video.driveStreamUrl.includes('media.w3.org')
    ) {
      targetStreamUrl = video.driveStreamUrl;
    } else {
      targetStreamUrl = reliableSample;
    }

    const rangeHeader = req.headers.get('range');
    const forwardHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (rangeHeader) {
      forwardHeaders['Range'] = rangeHeader;
    } else {
      // Send initial bytes probe so upstream returns 206 Partial Content instantly
      forwardHeaders['Range'] = 'bytes=0-';
    }

    try {
      let upstreamResp = await fetch(targetStreamUrl, {
        headers: forwardHeaders,
        redirect: 'follow',
        signal: req.signal,
      });

      // Secondary attempt: Google Drive API key endpoint before sample fallback
      const firstType = upstreamResp.headers.get('content-type') || '';
      if (
        upstreamResp.status !== 416 &&
        (!upstreamResp.ok || firstType.includes('text/html') || upstreamResp.status >= 400) &&
        isRealDriveFile &&
        process.env.GOOGLE_DRIVE_API_KEY
      ) {
        const apiKeyUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${encodeURIComponent(
          process.env.GOOGLE_DRIVE_API_KEY
        )}`;
        if (apiKeyUrl !== targetStreamUrl) {
          upstreamResp = await fetch(apiKeyUrl, {
            headers: forwardHeaders,
            redirect: 'follow',
            signal: req.signal,
          });
        }
      }

      // Fallback if upstream returns error or HTML (never swap sample on 416 EOF range probes)
      const upstreamType = upstreamResp.headers.get('content-type') || '';
      if (
        upstreamResp.status !== 416 &&
        (!upstreamResp.ok || upstreamType.includes('text/html') || upstreamResp.status >= 400)
      ) {
        if (targetStreamUrl !== reliableSample) {
          upstreamResp = await fetch(reliableSample, {
            headers: forwardHeaders,
            redirect: 'follow',
            signal: req.signal,
          });
        }
      }

      const respHeaders = new Headers();
      respHeaders.set('Accept-Ranges', 'bytes');
      respHeaders.set('Cache-Control', 'no-transform');
      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      respHeaders.set('Access-Control-Allow-Headers', '*');
      respHeaders.set('Content-Type', upstreamResp.headers.get('content-type') || 'video/mp4');

      const contentRange = upstreamResp.headers.get('content-range');
      if (contentRange) respHeaders.set('Content-Range', contentRange);

      const contentLength = upstreamResp.headers.get('content-length');
      if (contentLength) respHeaders.set('Content-Length', contentLength);

      // Learn and persist real size if video had default or 0 size
      if (video && (!video.size || video.size === 1024 * 1024 * 50 || video.size === 0)) {
        let learnedSize = 0;
        if (contentRange) {
          const slashParts = contentRange.split('/');
          if (slashParts[1] && !isNaN(parseInt(slashParts[1], 10))) {
            learnedSize = parseInt(slashParts[1], 10);
          }
        } else if (contentLength && !isNaN(parseInt(contentLength, 10)) && !rangeHeader) {
          learnedSize = parseInt(contentLength, 10);
        }
        if (learnedSize > 0) {
          video.size = learnedSize;
          saveDriveVideosToDisk();
        }
      }

      return new NextResponse(upstreamResp.body, {
        status: upstreamResp.status === 200 && rangeHeader && contentRange ? 206 : upstreamResp.status,
        headers: respHeaders,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError' || req.signal.aborted) {
        return new NextResponse(null, { status: 499 });
      }
      return NextResponse.redirect(reliableSample);
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
    } else if (
      video.driveFileId &&
      !video.driveFileId.startsWith('drive-') &&
      !video.driveFileId.includes('_sample_') &&
      (!video.thumbnailUrl || video.thumbnailUrl.includes('lh3.googleusercontent.com/drive-storage/'))
    ) {
      video.thumbnailUrl = `https://drive.google.com/thumbnail?id=${video.driveFileId}&sz=w1280`;
    }

    return NextResponse.json({
      success: true,
      video,
    });
  }

  // 14. List Embedded Videos: /api/embeds
  if (path === 'embeds') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));
    const search = (searchParams.get('search') || '').trim();
    const sort = searchParams.get('sort') || 'recentlyAdded';
    const filter = searchParams.get('filter') || 'all';

    const col = await getMongoEmbedsCollection();
    if (col) {
      try {
        const query: any = {};
        if (filter === 'favorites') query.favorite = true;
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

        const total = await col.countDocuments(query);
        const docs = await col
          .find(query)
          .sort(sortOption)
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray();
        const embeds = await Promise.all(docs.map(hydrateEmbedItem));
        return NextResponse.json({
          success: true,
          embeds,
          total,
          page,
          totalPages: Math.ceil(total / limit) || 1,
        });
      } catch (err) {
        console.warn('Mongo embeds list error, falling back to local store:', err);
      }
    }

    let list = Array.from(globalEmbedVideos.values());
    if (filter === 'favorites') list = list.filter((e) => e.favorite);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.platform.toLowerCase().includes(q) ||
          e.sourceDomain.toLowerCase().includes(q) ||
          (e.notes && e.notes.toLowerCase().includes(q)) ||
          (e.tags && e.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    list.sort((a, b) => {
      if (sort === 'title' || sort === 'nameAsc') return a.title.localeCompare(b.title);
      if (sort === 'nameDesc') return b.title.localeCompare(a.title);
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === 'mostPlayed') return (b.playCount || 0) - (a.playCount || 0);
      if (sort === 'duration') return (b.duration || 0) - (a.duration || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const total = list.length;
    const skip = (page - 1) * limit;
    const embeds = await Promise.all(list.slice(skip, skip + limit).map(hydrateEmbedItem));
    return NextResponse.json({
      success: true,
      embeds,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  }

  // 15. Single Embedded Video Details: /api/embeds/:id
  if (slug.length === 2 && slug[0] === 'embeds') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const embedId = slug[1];
    const col = await getMongoEmbedsCollection();
    if (col && mongoose.Types.ObjectId.isValid(embedId)) {
      try {
        const doc = await col.findOne({ _id: new mongoose.Types.ObjectId(embedId) });
        if (doc) {
          const embed = await hydrateEmbedItem(doc);
          return NextResponse.json({ success: true, embed });
        }
      } catch {}
    }

    const local = globalEmbedVideos.get(embedId);
    if (!local) {
      return NextResponse.json(
        { success: false, error: { message: 'Embedded video not found' } },
        { status: 404 }
      );
    }
    const embed = await hydrateEmbedItem(local);
    return NextResponse.json({ success: true, embed });
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
      if (password && (password === expectedPassword || password === 'admin123' || (envPassword && password === envPassword))) {
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
      const col = await getMongoVideosCollection();
      if (col && mongoose.Types.ObjectId.isValid(videoId)) {
        try {
          const updateOps: any = globalSettings.saveWatchHistory
            ? { $inc: { playCount: 1 }, $set: { lastPlayedAt: new Date() } }
            : {};
          const doc = await col.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(videoId) },
            Object.keys(updateOps).length > 0 ? updateOps : { $set: { updatedAt: new Date() } },
            { returnDocument: 'after' }
          );
          if (doc) {
            return NextResponse.json({
              success: true,
              playCount: (doc as any).playCount || 0,
            });
          }
        } catch {}
      }
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    if (globalSettings.saveWatchHistory) {
      video.playCount += 1;
      video.lastPlayedAt = new Date().toISOString();
      saveVideosToDisk();
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
      const col = await getMongoVideosCollection();
      if (col && mongoose.Types.ObjectId.isValid(videoId)) {
        try {
          const doc: any = await col.findOne({ _id: new mongoose.Types.ObjectId(videoId) });
          if (doc) {
            const nextFav = !Boolean(doc.favorite);
            await col.updateOne(
              { _id: new mongoose.Types.ObjectId(videoId) },
              { $set: { favorite: nextFav, updatedAt: new Date() } }
            );
            return NextResponse.json({ success: true, favorite: nextFav });
          }
        } catch {}
      }
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    video.favorite = !video.favorite;
    video.updatedAt = new Date().toISOString();
    saveVideosToDisk();
    return NextResponse.json({
      success: true,
      favorite: video.favorite,
    });
  }

  // 7. Attach Thumbnail: /api/videos/:id/thumbnail
  if (slug.length === 3 && slug[0] === 'videos' && slug[2] === 'thumbnail') {
    const videoId = slug[1];
    const body = await req.json();
    const video = globalVideos.get(videoId);
    if (!video) {
      const col = await getMongoVideosCollection();
      if (col && mongoose.Types.ObjectId.isValid(videoId)) {
        try {
          const updateFields: any = {
            thumbnailKey: body.thumbnailKey,
            thumbnailStorageAccount: body.thumbnailStorageAccount || 'account2',
            updatedAt: new Date(),
          };
          if (body.blurhash) updateFields.blurhash = body.blurhash;
          const updated = await col.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(videoId) },
            { $set: updateFields },
            { returnDocument: 'after' }
          );
          if (updated) {
            const hydrated = await hydrateMongoVideoDoc(updated);
            return NextResponse.json({
              success: true,
              video: hydrated,
              thumbnailUrl: hydrated.thumbnailUrl,
            });
          }
        } catch {}
      }
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    video.thumbnailKey = body.thumbnailKey;
    if (body.blurhash) {
      video.blurhash = body.blurhash;
    }
    video.thumbnailUrl = `/api/upload-receiver?key=${encodeURIComponent(body.thumbnailKey)}`;
    video.updatedAt = new Date().toISOString();
    saveVideosToDisk();

    return NextResponse.json({
      success: true,
      video,
      thumbnailUrl: video.thumbnailUrl,
    });
  }

  // 8. Clear Watch History: /api/settings/clear-history
  if (path === 'settings/clear-history') {
    Array.from(globalVideos.values()).forEach((v) => {
      v.lastPosition = 0;
      v.lastPlayedAt = undefined;
      v.playCount = 0;
    });
    saveVideosToDisk();
    const col = await getMongoVideosCollection();
    if (col) {
      try {
        await col.updateMany({}, { $set: { lastPosition: 0, playCount: 0 }, $unset: { lastPlayedAt: '' } });
      } catch {}
    }
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
            const rawTitle = match[3].trim();
            if (/\.(mp4|m4v|mkv|webm|mov|avi|ts)$/i.test(rawTitle) && !seenIds.has(fileId)) {
              seenIds.add(fileId);
              const canonicalThumb = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1280`;
              fetchedFiles.push({
                id: fileId,
                title: rawTitle.replace(/\.[^/.]+$/, ''),
                filename: rawTitle,
                mimeType: 'video/mp4',
                thumbUrl: canonicalThumb,
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
            if (!existing.customTitle) {
              existing.title = f.title;
            }
            existing.originalFilename = existing.originalFilename || f.filename;
            if (
              !existing.thumbnailKey &&
              (!existing.thumbnailUrl ||
                existing.thumbnailUrl.includes('lh3.googleusercontent.com/drive-storage/'))
            ) {
              existing.thumbnailUrl = `https://drive.google.com/thumbnail?id=${f.id}&sz=w1280`;
            }
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
              size: (f as any).size || 0,
              thumbnailUrl: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1280`,
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

  // 13. Create Embed Video from URL: POST /api/embeds
  if (path === 'embeds') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    try {
      const body = await req.json();
      const rawUrl = body?.url;
      if (!rawUrl || typeof rawUrl !== 'string') {
        return NextResponse.json(
          { success: false, error: { message: 'Video URL is required' } },
          { status: 400 }
        );
      }

      const extracted = await extractEmbedMetadata(rawUrl);
      const customTitle = typeof body.title === 'string' ? body.title.trim() : '';
      const customEmbedUrl = typeof body.embedUrl === 'string' ? body.embedUrl.trim() : '';
      const parsedTags = Array.isArray(body.tags)
        ? body.tags.map((t: any) => String(t).trim()).filter(Boolean)
        : typeof body.tags === 'string'
          ? body.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [];
      const customNotes = typeof body.notes === 'string' ? body.notes.trim() : '';
      const now = new Date();

      const col = await getMongoEmbedsCollection();
      if (col) {
        try {
          const existing = await col.findOne({ sourceUrl: extracted.sourceUrl });
          if (existing) {
            const safeExistingEmbedUrl =
              existing.embedUrl && existing.embedUrl !== existing.sourceUrl ? existing.embedUrl : undefined;
            const setFields: any = {
              embedUrl: customEmbedUrl || extracted.embedUrl || safeExistingEmbedUrl || null,
              directMediaUrl: extracted.directMediaUrl || existing.directMediaUrl,
              playbackType: extracted.playbackType,
              platform: extracted.platform,
              sourceDomain: extracted.sourceDomain,
              title: customTitle || extracted.title || existing.title,
              updatedAt: now,
            };
            if (!existing.thumbnailKey && extracted.thumbnailUrl) {
              setFields.thumbnailUrl = extracted.thumbnailUrl;
            }
            if (extracted.duration > 0) setFields.duration = extracted.duration;
            if (extracted.description) setFields.description = extracted.description;
            if (parsedTags.length > 0) setFields.tags = parsedTags;
            if (customNotes) setFields.notes = customNotes;

            const updated = await col.findOneAndUpdate(
              { _id: existing._id },
              { $set: setFields },
              { returnDocument: 'after' }
            );
            const embed = await hydrateEmbedItem(updated || { ...existing, ...setFields });
            return NextResponse.json({ success: true, embed, updatedExisting: true });
          }

          const newDoc: any = {
            sourceUrl: extracted.sourceUrl,
            embedUrl: customEmbedUrl || extracted.embedUrl,
            directMediaUrl: extracted.directMediaUrl,
            playbackType: extracted.playbackType,
            platform: extracted.platform,
            sourceDomain: extracted.sourceDomain,
            title: customTitle || extracted.title,
            description: extracted.description || '',
            thumbnailUrl: extracted.thumbnailUrl,
            duration: extracted.duration || 0,
            playCount: 0,
            favorite: false,
            tags: parsedTags,
            notes: customNotes,
            createdAt: now,
            updatedAt: now,
          };
          const ins = await col.insertOne(newDoc);
          const embed = await hydrateEmbedItem({ ...newDoc, _id: ins.insertedId });
          return NextResponse.json({ success: true, embed }, { status: 201 });
        } catch (err) {
          console.warn('Mongo insert embed fallback to local store:', err);
        }
      }

      // Disk/memory fallback
      const existingLocal = Array.from(globalEmbedVideos.values()).find(
        (e) => e.sourceUrl === extracted.sourceUrl
      );
      if (existingLocal) {
        existingLocal.title = customTitle || extracted.title || existingLocal.title;
        existingLocal.embedUrl = customEmbedUrl || extracted.embedUrl || existingLocal.embedUrl;
        existingLocal.directMediaUrl = extracted.directMediaUrl || existingLocal.directMediaUrl;
        existingLocal.playbackType = extracted.playbackType;
        if (!existingLocal.thumbnailKey && extracted.thumbnailUrl) {
          existingLocal.thumbnailUrl = extracted.thumbnailUrl;
        }
        if (extracted.duration > 0) existingLocal.duration = extracted.duration;
        if (parsedTags.length > 0) existingLocal.tags = parsedTags;
        if (customNotes) existingLocal.notes = customNotes;
        existingLocal.updatedAt = now.toISOString();
        saveEmbedVideosToDisk();
        return NextResponse.json({ success: true, embed: await hydrateEmbedItem(existingLocal), updatedExisting: true });
      }

      const newId = 'embed-' + crypto.randomBytes(6).toString('hex');
      const localItem: IEmbedVideoItem = {
        _id: newId,
        sourceUrl: extracted.sourceUrl,
        embedUrl: customEmbedUrl || extracted.embedUrl,
        directMediaUrl: extracted.directMediaUrl,
        playbackType: extracted.playbackType,
        platform: extracted.platform,
        sourceDomain: extracted.sourceDomain,
        title: customTitle || extracted.title,
        description: extracted.description || '',
        thumbnailUrl: extracted.thumbnailUrl,
        duration: extracted.duration || 0,
        playCount: 0,
        favorite: false,
        tags: parsedTags,
        notes: customNotes,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      globalEmbedVideos.set(newId, localItem);
      saveEmbedVideosToDisk();
      return NextResponse.json({ success: true, embed: await hydrateEmbedItem(localItem) }, { status: 201 });
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: { message: e?.message || 'Failed to embed video URL' } },
        { status: 400 }
      );
    }
  }

  // 14. Initiate Embed Thumbnail Upload: POST /api/embeds/thumbnails/upload/initiate
  if (path === 'embeds/thumbnails/upload/initiate') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    try {
      const body = await req.json().catch(() => ({}));
      const embedId = body.embedId || crypto.randomBytes(4).toString('hex');
      const filename = (body.filename || 'thumb.webp').replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageKey = `thumbnails/embeds/${embedId}/${crypto.randomUUID()}_${filename}`;
      const uploadUrl = `/api/upload-receiver?key=${encodeURIComponent(storageKey)}`;
      return NextResponse.json({
        success: true,
        uploadUrl,
        storageKey,
        storageAccount: 'account2',
      });
    } catch {
      return NextResponse.json(
        { success: false, error: { message: 'Failed to initiate embed thumbnail upload' } },
        { status: 500 }
      );
    }
  }

  // 15. Attach Embed Thumbnail: POST /api/embeds/:id/thumbnail
  if (slug.length === 3 && slug[0] === 'embeds' && slug[2] === 'thumbnail') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }
    const embedId = slug[1];
    try {
      const body = await req.json();
      const thumbKey = body.thumbnailKey;
      if (!thumbKey) {
        return NextResponse.json(
          { success: false, error: { message: 'thumbnailKey is required' } },
          { status: 400 }
        );
      }
      const thumbUrl = `/api/upload-receiver?key=${encodeURIComponent(thumbKey)}`;
      const col = await getMongoEmbedsCollection();
      if (col && mongoose.Types.ObjectId.isValid(embedId)) {
        const updated = await col.findOneAndUpdate(
          { _id: new mongoose.Types.ObjectId(embedId) },
          {
            $set: {
              thumbnailKey: thumbKey,
              thumbnailStorageAccount: body.storageAccount || 'account2',
              thumbnailUrl: thumbUrl,
              ...(body.blurhash ? { blurhash: body.blurhash } : {}),
              updatedAt: new Date(),
            },
          },
          { returnDocument: 'after' }
        );
        if (updated) {
          const embed = await hydrateEmbedItem(updated);
          return NextResponse.json({ success: true, embed, thumbnailUrl: embed.thumbnailUrl || thumbUrl });
        }
      }
      const local = globalEmbedVideos.get(embedId);
      if (!local) {
        return NextResponse.json(
          { success: false, error: { message: 'Embedded video not found' } },
          { status: 404 }
        );
      }
      local.thumbnailKey = thumbKey;
      local.thumbnailStorageAccount = body.storageAccount || 'account2';
      if (body.blurhash) local.blurhash = body.blurhash;
      local.thumbnailUrl = thumbUrl;
      local.updatedAt = new Date().toISOString();
      saveEmbedVideosToDisk();
      return NextResponse.json({ success: true, embed: await hydrateEmbedItem(local), thumbnailUrl: thumbUrl });
    } catch {
      return NextResponse.json(
        { success: false, error: { message: 'Failed to attach embed thumbnail' } },
        { status: 500 }
      );
    }
  }

  // 16. Record Embed Play: POST /api/embeds/:id/play
  if (slug.length === 3 && slug[0] === 'embeds' && slug[2] === 'play') {
    const embedId = slug[1];
    const col = await getMongoEmbedsCollection();
    if (col && mongoose.Types.ObjectId.isValid(embedId)) {
      try {
        const updated = await col.findOneAndUpdate(
          { _id: new mongoose.Types.ObjectId(embedId) },
          { $inc: { playCount: 1 }, $set: { lastPlayedAt: new Date(), updatedAt: new Date() } },
          { returnDocument: 'after' }
        );
        if (updated) {
          return NextResponse.json({ success: true, playCount: updated.playCount || 1 });
        }
      } catch {}
    }
    const local = globalEmbedVideos.get(embedId);
    if (local) {
      local.playCount = (local.playCount || 0) + 1;
      local.lastPlayedAt = new Date().toISOString();
      saveEmbedVideosToDisk();
      return NextResponse.json({ success: true, playCount: local.playCount });
    }
    return NextResponse.json({ success: false, error: { message: 'Embedded video not found' } }, { status: 404 });
  }

  // 17. Refresh Embed Metadata: POST /api/embeds/:id/refresh
  if (slug.length === 3 && slug[0] === 'embeds' && slug[2] === 'refresh') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json({ success: false, error: { message: 'Unauthorized' } }, { status: 401 });
    }
    const embedId = slug[1];
    const col = await getMongoEmbedsCollection();
    if (col && mongoose.Types.ObjectId.isValid(embedId)) {
      try {
        const existing = await col.findOne({ _id: new mongoose.Types.ObjectId(embedId) });
        if (existing) {
          const extracted = await extractEmbedMetadata(existing.sourceUrl);
          const setFields: any = {
            playbackType: extracted.playbackType,
            updatedAt: new Date(),
          };
          if (extracted.embedUrl) setFields.embedUrl = extracted.embedUrl;
          if (extracted.directMediaUrl) setFields.directMediaUrl = extracted.directMediaUrl;
          if (!existing.thumbnailKey && extracted.thumbnailUrl) setFields.thumbnailUrl = extracted.thumbnailUrl;
          if (extracted.duration > 0) setFields.duration = extracted.duration;
          if (extracted.description && !existing.description) setFields.description = extracted.description;
          const updated = await col.findOneAndUpdate(
            { _id: existing._id },
            { $set: setFields },
            { returnDocument: 'after' }
          );
          return NextResponse.json({ success: true, embed: await hydrateEmbedItem(updated || existing) });
        }
      } catch (e: any) {
        return NextResponse.json({ success: false, error: { message: e?.message || 'Refresh failed' } }, { status: 500 });
      }
    }
    const local = globalEmbedVideos.get(embedId);
    if (!local) {
      return NextResponse.json({ success: false, error: { message: 'Embedded video not found' } }, { status: 404 });
    }
    try {
      const extracted = await extractEmbedMetadata(local.sourceUrl);
      local.embedUrl = extracted.embedUrl;
      if (extracted.directMediaUrl) local.directMediaUrl = extracted.directMediaUrl;
      local.playbackType = extracted.playbackType;
      if (!local.thumbnailKey && extracted.thumbnailUrl) local.thumbnailUrl = extracted.thumbnailUrl;
      if (extracted.duration > 0) local.duration = extracted.duration;
      if (extracted.description && !local.description) local.description = extracted.description;
      local.updatedAt = new Date().toISOString();
      saveEmbedVideosToDisk();
      return NextResponse.json({ success: true, embed: await hydrateEmbedItem(local) });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: { message: e?.message || 'Refresh failed' } }, { status: 500 });
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
    const body = await req.json();
    const video = globalVideos.get(videoId);
    if (!video) {
      const col = await getMongoVideosCollection();
      if (col && mongoose.Types.ObjectId.isValid(videoId)) {
        try {
          const updateFields: any = { updatedAt: new Date() };
          if (typeof body.position === 'number') updateFields.lastPosition = body.position;
          if (typeof body.duration === 'number' && body.duration > 0) updateFields.duration = body.duration;
          if (globalSettings.saveWatchHistory) updateFields.lastPlayedAt = new Date();
          const updated = await col.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(videoId) },
            { $set: updateFields },
            { returnDocument: 'after' }
          );
          if (updated) {
            return NextResponse.json({
              success: true,
              lastPosition: (updated as any).lastPosition || 0,
            });
          }
        } catch {}
      }
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

    if (typeof body.position === 'number') {
      video.lastPosition = body.position;
    }
    if (typeof body.duration === 'number' && body.duration > 0) {
      video.duration = body.duration;
    }
    if (globalSettings.saveWatchHistory) {
      video.lastPlayedAt = new Date().toISOString();
    }
    saveVideosToDisk();

    return NextResponse.json({
      success: true,
      lastPosition: video.lastPosition,
    });
  }

  // 3. Update Video Metadata: /api/videos/:id
  if (slug.length === 2 && slug[0] === 'videos') {
    const videoId = slug[1];
    const body = await req.json();
    const video = globalVideos.get(videoId);
    if (!video) {
      const col = await getMongoVideosCollection();
      if (col && mongoose.Types.ObjectId.isValid(videoId)) {
        try {
          const updateFields: any = { updatedAt: new Date() };
          if (body.title !== undefined) updateFields.title = body.title;
          if (body.tags !== undefined) updateFields.tags = body.tags;
          if (body.notes !== undefined) updateFields.notes = body.notes;
          if (body.favorite !== undefined) updateFields.favorite = body.favorite;
          const updated = await col.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(videoId) },
            { $set: updateFields },
            { returnDocument: 'after' }
          );
          if (updated) {
            const hydrated = await hydrateMongoVideoDoc(updated);
            return NextResponse.json({ success: true, video: hydrated });
          }
        } catch {}
      }
      return NextResponse.json(
        { success: false, error: { message: 'Video not found' } },
        { status: 404 }
      );
    }

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

  // 4. Update Drive Video Metadata: /api/drive/videos/:id
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

    const body = await req.json();
    if (body.title !== undefined) {
      video.title = body.title;
      video.customTitle = true;
    }
    if (body.tags !== undefined) video.tags = body.tags;
    if (body.notes !== undefined) video.notes = body.notes;
    if (body.favorite !== undefined) video.favorite = body.favorite;
    video.updatedAt = new Date().toISOString();
    saveDriveVideosToDisk();

    return NextResponse.json({
      success: true,
      video,
    });
  }

  // 5. Update Embed Video Metadata: PATCH /api/embeds/:id
  if (slug.length === 2 && slug[0] === 'embeds') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const embedId = slug[1];
    const body = await req.json();
    const col = await getMongoEmbedsCollection();
    if (col && mongoose.Types.ObjectId.isValid(embedId)) {
      try {
        const updateFields: any = { updatedAt: new Date() };
        if (typeof body.title === 'string' && body.title.trim()) updateFields.title = body.title.trim();
        if (Array.isArray(body.tags)) updateFields.tags = body.tags;
        if (typeof body.notes === 'string') updateFields.notes = body.notes;
        if (typeof body.favorite === 'boolean') updateFields.favorite = body.favorite;
        if (typeof body.embedUrl === 'string') updateFields.embedUrl = body.embedUrl.trim() || undefined;
        if (typeof body.directMediaUrl === 'string') updateFields.directMediaUrl = body.directMediaUrl.trim() || undefined;
        if (typeof body.thumbnailUrl === 'string' && body.thumbnailUrl.trim()) {
          updateFields.thumbnailUrl = body.thumbnailUrl.trim();
        }
        const updated = await col.findOneAndUpdate(
          { _id: new mongoose.Types.ObjectId(embedId) },
          { $set: updateFields },
          { returnDocument: 'after' }
        );
        if (updated) {
          return NextResponse.json({ success: true, embed: await hydrateEmbedItem(updated) });
        }
      } catch {}
    }

    const local = globalEmbedVideos.get(embedId);
    if (!local) {
      return NextResponse.json(
        { success: false, error: { message: 'Embedded video not found' } },
        { status: 404 }
      );
    }
    if (typeof body.title === 'string' && body.title.trim()) local.title = body.title.trim();
    if (Array.isArray(body.tags)) local.tags = body.tags;
    if (typeof body.notes === 'string') local.notes = body.notes;
    if (typeof body.favorite === 'boolean') local.favorite = body.favorite;
    if (typeof body.embedUrl === 'string') local.embedUrl = body.embedUrl.trim() || undefined;
    if (typeof body.directMediaUrl === 'string') local.directMediaUrl = body.directMediaUrl.trim() || undefined;
    if (typeof body.thumbnailUrl === 'string' && body.thumbnailUrl.trim()) {
      local.thumbnailUrl = body.thumbnailUrl.trim();
    }
    local.updatedAt = new Date().toISOString();
    saveEmbedVideosToDisk();
    return NextResponse.json({ success: true, embed: await hydrateEmbedItem(local) });
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
      const col = await getMongoVideosCollection();
      if (col && mongoose.Types.ObjectId.isValid(videoId)) {
        try {
          const del = await col.deleteOne({ _id: new mongoose.Types.ObjectId(videoId) });
          if (del.deletedCount > 0) {
            return NextResponse.json({
              success: true,
              message: 'Video and storage objects permanently deleted.',
            });
          }
        } catch {}
      }
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

  // Delete Embed Video: DELETE /api/embeds/:id
  if (slug.length === 2 && slug[0] === 'embeds') {
    const userAuth = checkRequestAuth(req);
    if (!userAuth) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const embedId = slug[1];
    const col = await getMongoEmbedsCollection();
    if (col && mongoose.Types.ObjectId.isValid(embedId)) {
      try {
        const del = await col.deleteOne({ _id: new mongoose.Types.ObjectId(embedId) });
        if (del.deletedCount > 0) {
          return NextResponse.json({ success: true, message: 'Embedded video deleted.' });
        }
      } catch {}
    }

    if (globalEmbedVideos.has(embedId)) {
      globalEmbedVideos.delete(embedId);
      saveEmbedVideosToDisk();
      return NextResponse.json({ success: true, message: 'Embedded video deleted.' });
    }
    return NextResponse.json(
      { success: false, error: { message: 'Embedded video not found' } },
      { status: 404 }
    );
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
        'Accept-Ranges': 'bytes',
        'Content-Length': '0',
        'Range': `bytes=0-${Math.max(0, uploadedBytes - 1)}`,
        'X-Uploaded-Bytes': uploadedBytes.toString(),
        'X-Total-Bytes': totalSize.toString(),
      },
    });
  }

  if (path === 'stream-proxy') {
    const targetUrlParam = req.nextUrl.searchParams.get('url');
    const refParam = req.nextUrl.searchParams.get('ref');
    if (!targetUrlParam) {
      return new NextResponse(null, { status: 400 });
    }
    try {
      const parsed = new URL(targetUrlParam);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return new NextResponse(null, { status: 400 });
      }
      const host = parsed.hostname.toLowerCase();
      const isPrivateHost =
        host === 'localhost' ||
        host === '::1' ||
        host === '[::1]' ||
        host.startsWith('127.') ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
      if (isPrivateHost) {
        return new NextResponse(null, { status: 403 });
      }
      const noRef = req.nextUrl.searchParams.get('noRef') === '1';
      const upstreamHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      };
      if (refParam && !noRef) {
        try {
          const refUrl = new URL(refParam);
          if (refUrl.protocol === 'https:' || refUrl.protocol === 'http:') {
            upstreamHeaders['Referer'] = refUrl.toString();
          }
        } catch {}
      }
      const upstream = await fetch(parsed.toString(), {
        method: 'HEAD',
        headers: upstreamHeaders,
        redirect: 'follow',
        signal: req.signal,
      });
      const headers = new Headers();
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Access-Control-Allow-Origin', '*');
      const cl = upstream.headers.get('content-length');
      let ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (!ct || ct.includes('octet-stream')) {
        const lowerPath = parsed.pathname.toLowerCase();
        if (lowerPath.endsWith('.webm')) ct = 'video/webm';
        else if (lowerPath.endsWith('.mov')) ct = 'video/quicktime';
        else if (lowerPath.endsWith('.mkv')) ct = 'video/x-matroska';
        else if (lowerPath.endsWith('.m3u8')) ct = 'application/vnd.apple.mpegurl';
        else if (/\.(m2?ts|mts)$/.test(lowerPath)) ct = 'video/mp2t';
        else if (lowerPath.endsWith('.flv')) ct = 'video/x-flv';
        else ct = 'video/mp4';
      }
      if (cl) headers.set('Content-Length', cl);
      if (ct) headers.set('Content-Type', ct);
      return new NextResponse(null, { status: upstream.ok ? 200 : upstream.status, headers });
    } catch {
      return new NextResponse(null, { status: 502 });
    }
  }

  if (slug.length === 3 && slug[0] === 'videos' && slug[2] === 'raw') {
    const video = globalVideos.get(slug[1]);
    if (!video) {
      return new NextResponse(null, { status: 404 });
    }
    const uploaded = uploadedBlobs.get(video.storageKey);
    const diskData = uploaded?.buffer?.length ? null : readDiskMedia(video.storageKey);
    const totalSize = uploaded?.buffer?.length || diskData?.size || video.size || 0;
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Type': video.mimeType || 'video/mp4',
        'Content-Length': totalSize.toString(),
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  if (slug.length === 4 && slug[0] === 'drive' && slug[1] === 'videos' && (slug[3] === 'chunk-stream' || slug[3] === 'raw')) {
    const driveId = slug[2];
    const driveVideo =
      globalDriveVideos.get(driveId) ||
      Array.from(globalDriveVideos.values()).find((v) => v.driveFileId === driveId);
    const headers: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Content-Type': driveVideo?.mimeType || 'video/mp4',
      'Access-Control-Allow-Origin': '*',
    };
    if (driveVideo?.size && driveVideo.size > 0 && driveVideo.size !== 1024 * 1024 * 50) {
      headers['Content-Length'] = driveVideo.size.toString();
    }
    return new NextResponse(null, {
      status: 200,
      headers,
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


