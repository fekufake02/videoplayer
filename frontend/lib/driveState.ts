'use client';

import { IDriveVideo } from '../types';

const DRIVE_CACHE_KEY = 'vault_drive_videos_cache';
const DRIVE_CACHE_TIME_KEY = 'vault_drive_cache_time';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory hot cache for instant 0ms back-and-forth navigation
let inMemoryDriveCache: IDriveVideo[] | null = null;
let inMemoryCacheTime: number = 0;

export function getDriveVideosCache(): IDriveVideo[] | null {
  if (inMemoryDriveCache && inMemoryDriveCache.length > 0) {
    return inMemoryDriveCache;
  }

  if (typeof window !== 'undefined') {
    try {
      const storedTime = sessionStorage.getItem(DRIVE_CACHE_TIME_KEY);
      if (storedTime && Date.now() - parseInt(storedTime, 10) < CACHE_TTL_MS) {
        const raw = sessionStorage.getItem(DRIVE_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            inMemoryDriveCache = parsed;
            inMemoryCacheTime = parseInt(storedTime, 10);
            return parsed;
          }
        }
      }
    } catch {}
  }

  return null;
}

export function setDriveVideosCache(videos: IDriveVideo[]): void {
  if (!Array.isArray(videos)) return;
  inMemoryDriveCache = videos;
  inMemoryCacheTime = Date.now();

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(DRIVE_CACHE_KEY, JSON.stringify(videos));
      sessionStorage.setItem(DRIVE_CACHE_TIME_KEY, String(inMemoryCacheTime));
    } catch {}
  }
}

export function updateSingleDriveVideoInCache(updated: IDriveVideo): void {
  if (!updated || !updated._id) return;
  if (inMemoryDriveCache) {
    inMemoryDriveCache = inMemoryDriveCache.map((v) =>
      v._id === updated._id || v.driveFileId === updated.driveFileId ? updated : v
    );
  }
  setDriveVideosCache(inMemoryDriveCache || [updated]);
}

export function clearDriveVideosCache(): void {
  inMemoryDriveCache = null;
  inMemoryCacheTime = 0;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(DRIVE_CACHE_KEY);
      sessionStorage.removeItem(DRIVE_CACHE_TIME_KEY);
    } catch {}
  }
}
