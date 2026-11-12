import { ICollection, IPlaylist, IBookmark, IChapter } from '../types';

const COLLECTIONS_KEY = 'vault_collections';
const PLAYLISTS_KEY = 'vault_playlists';
const BOOKMARKS_KEY = 'vault_bookmarks';
const DRIVE_PROGRESS_KEY = 'vault_drive_progress';
const SIDEBAR_STATE_KEY = 'vault_sidebar_collapsed';

// Default starter collections so users immediately experience the feature
const DEFAULT_COLLECTIONS: ICollection[] = [
  {
    id: 'col-favorites',
    name: 'Top Highlights',
    videoIds: ['vid-1', 'vid-3', 'drive-1'],
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date().toISOString(),
    coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'col-cinematic',
    name: 'Cinematic & 4K',
    videoIds: ['vid-1', 'vid-2', 'drive-3'],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date().toISOString(),
    coverUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
  },
];

const DEFAULT_PLAYLISTS: IPlaylist[] = [
  {
    id: 'pl-demo',
    name: 'Showcase Reel',
    videoIds: ['vid-1', 'vid-2', 'vid-4'],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/* ==================== COLLECTIONS ==================== */
export function getStoredCollections(): ICollection[] {
  if (typeof window === 'undefined') return DEFAULT_COLLECTIONS;
  try {
    const raw = localStorage.getItem(COLLECTIONS_KEY);
    if (!raw) {
      localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(DEFAULT_COLLECTIONS));
      return DEFAULT_COLLECTIONS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_COLLECTIONS;
  } catch {
    return DEFAULT_COLLECTIONS;
  }
}

export function saveStoredCollections(cols: ICollection[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(cols));
    window.dispatchEvent(new CustomEvent('vault:collections-updated', { detail: cols }));
  } catch (err) {
    console.error('Failed to save collections:', err);
  }
}

export function createCollection(name: string, coverUrl?: string): ICollection {
  const cleanName = name.trim() || 'Untitled Collection';
  const newCol: ICollection = {
    id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: cleanName,
    videoIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    coverUrl,
  };
  const list = getStoredCollections();
  list.unshift(newCol);
  saveStoredCollections(list);
  return newCol;
}

export function renameCollection(id: string, newName: string): boolean {
  const clean = newName.trim();
  if (!clean) return false;
  const list = getStoredCollections();
  const target = list.find((c) => c.id === id);
  if (!target) return false;
  target.name = clean;
  target.updatedAt = new Date().toISOString();
  saveStoredCollections(list);
  return true;
}

export function deleteCollection(id: string): boolean {
  const list = getStoredCollections();
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  saveStoredCollections(next);
  return true;
}

export function addVideoToCollection(collectionId: string, videoId: string): boolean {
  const list = getStoredCollections();
  const target = list.find((c) => c.id === collectionId);
  if (!target) return false;
  if (!target.videoIds.includes(videoId)) {
    target.videoIds.push(videoId);
    target.updatedAt = new Date().toISOString();
    saveStoredCollections(list);
    return true;
  }
  return false;
}

export function removeVideoFromCollection(collectionId: string, videoId: string): boolean {
  const list = getStoredCollections();
  const target = list.find((c) => c.id === collectionId);
  if (!target) return false;
  target.videoIds = target.videoIds.filter((id) => id !== videoId);
  target.updatedAt = new Date().toISOString();
  saveStoredCollections(list);
  return true;
}

/* ==================== PLAYLISTS ==================== */
export function getStoredPlaylists(): IPlaylist[] {
  if (typeof window === 'undefined') return DEFAULT_PLAYLISTS;
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY);
    if (!raw) {
      localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(DEFAULT_PLAYLISTS));
      return DEFAULT_PLAYLISTS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_PLAYLISTS;
  } catch {
    return DEFAULT_PLAYLISTS;
  }
}

export function saveStoredPlaylists(pls: IPlaylist[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(pls));
    window.dispatchEvent(new CustomEvent('vault:playlists-updated', { detail: pls }));
  } catch (err) {
    console.error('Failed to save playlists:', err);
  }
}

export function createPlaylist(name: string): IPlaylist {
  const cleanName = name.trim() || 'Untitled Playlist';
  const newPl: IPlaylist = {
    id: `pl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: cleanName,
    videoIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const list = getStoredPlaylists();
  list.unshift(newPl);
  saveStoredPlaylists(list);
  return newPl;
}

export function renamePlaylist(id: string, newName: string): boolean {
  const clean = newName.trim();
  if (!clean) return false;
  const list = getStoredPlaylists();
  const target = list.find((p) => p.id === id);
  if (!target) return false;
  target.name = clean;
  target.updatedAt = new Date().toISOString();
  saveStoredPlaylists(list);
  return true;
}

export function deletePlaylist(id: string): boolean {
  const list = getStoredPlaylists();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  saveStoredPlaylists(next);
  return true;
}

export function addVideoToPlaylist(playlistId: string, videoId: string): boolean {
  const list = getStoredPlaylists();
  const target = list.find((p) => p.id === playlistId);
  if (!target) return false;
  if (!target.videoIds.includes(videoId)) {
    target.videoIds.push(videoId);
    target.updatedAt = new Date().toISOString();
    saveStoredPlaylists(list);
    return true;
  }
  return false;
}

export function removeVideoFromPlaylist(playlistId: string, videoId: string): boolean {
  const list = getStoredPlaylists();
  const target = list.find((p) => p.id === playlistId);
  if (!target) return false;
  target.videoIds = target.videoIds.filter((id) => id !== videoId);
  target.updatedAt = new Date().toISOString();
  saveStoredPlaylists(list);
  return true;
}

export function reorderPlaylistVideos(playlistId: string, fromIndex: number, toIndex: number): boolean {
  const list = getStoredPlaylists();
  const target = list.find((p) => p.id === playlistId);
  if (!target || fromIndex < 0 || toIndex < 0 || fromIndex >= target.videoIds.length || toIndex >= target.videoIds.length) {
    return false;
  }
  const [removed] = target.videoIds.splice(fromIndex, 1);
  target.videoIds.splice(toIndex, 0, removed);
  target.updatedAt = new Date().toISOString();
  saveStoredPlaylists(list);
  return true;
}

/* ==================== BOOKMARKS ==================== */
export function getStoredBookmarks(videoId?: string): IBookmark[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    const parsed: IBookmark[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    if (videoId) {
      return parsed.filter((b) => b.videoId === videoId).sort((a, b) => a.timestamp - b.timestamp);
    }
    return parsed.sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

export function addBookmark(videoId: string, timestamp: number, label?: string): IBookmark {
  const list = getStoredBookmarks();
  const cleanSec = Math.max(0, Math.floor(timestamp));
  const newBm: IBookmark = {
    id: `bm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    videoId,
    timestamp: cleanSec,
    label: label?.trim() || `Bookmark at ${formatTimestamp(cleanSec)}`,
    createdAt: new Date().toISOString(),
  };
  list.push(newBm);
  if (typeof window !== 'undefined') {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('vault:bookmarks-updated', { detail: { videoId } }));
  }
  return newBm;
}

export function deleteBookmark(bookmarkId: string): boolean {
  const list = getStoredBookmarks();
  const next = list.filter((b) => b.id !== bookmarkId);
  if (next.length === list.length) return false;
  if (typeof window !== 'undefined') {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('vault:bookmarks-updated', { detail: {} }));
  }
  return true;
}

/* ==================== CHAPTERS ==================== */
export function getVideoChapters(videoId: string, duration: number): IChapter[] {
  if (!duration || duration <= 0) return [];
  // Provide clean, meaningful chapters based on video duration
  if (duration >= 600) {
    // 10+ min: 4 chapters
    return [
      { id: 'ch-1', title: 'Intro & Prologue', startTime: 0, endTime: Math.floor(duration * 0.25) },
      { id: 'ch-2', title: 'The Main Arc', startTime: Math.floor(duration * 0.25), endTime: Math.floor(duration * 0.6) },
      { id: 'ch-3', title: 'Climax & Reveal', startTime: Math.floor(duration * 0.6), endTime: Math.floor(duration * 0.85) },
      { id: 'ch-4', title: 'Credits & Epilogue', startTime: Math.floor(duration * 0.85), endTime: duration },
    ];
  } else if (duration >= 180) {
    // 3-10 min: 3 chapters
    return [
      { id: 'ch-1', title: 'Beginning', startTime: 0, endTime: Math.floor(duration * 0.35) },
      { id: 'ch-2', title: 'Feature Demonstration', startTime: Math.floor(duration * 0.35), endTime: Math.floor(duration * 0.75) },
      { id: 'ch-3', title: 'Closing', startTime: Math.floor(duration * 0.75), endTime: duration },
    ];
  } else if (duration >= 30) {
    // 30s-3min: 2 chapters
    return [
      { id: 'ch-1', title: 'Opening Scene', startTime: 0, endTime: Math.floor(duration * 0.5) },
      { id: 'ch-2', title: 'Finale', startTime: Math.floor(duration * 0.5), endTime: duration },
    ];
  }
  return [{ id: 'ch-1', title: 'Complete Clip', startTime: 0, endTime: duration }];
}

/* ==================== GOOGLE DRIVE PROGRESS SYNC ==================== */
export interface IDriveProgressItem {
  position: number;
  duration: number;
  updatedAt: string;
}

export function getDrivePlaybackProgress(driveId: string): IDriveProgressItem | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRIVE_PROGRESS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[driveId] || null;
  } catch {
    return null;
  }
}

export function saveDrivePlaybackProgress(driveId: string, position: number, duration: number): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(DRIVE_PROGRESS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[driveId] = {
      position: Math.floor(position),
      duration: Math.floor(duration),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRIVE_PROGRESS_KEY, JSON.stringify(map));
  } catch (err) {
    console.error('Failed to save drive playback progress:', err);
  }
}

/* ==================== QUEUE & NAVIGATION ==================== */
export function getNextVideoInQueue<T extends { _id: string }>(currentId: string, queue: T[]): T | null {
  if (!queue || queue.length === 0) return null;
  const idx = queue.findIndex((v) => v._id === currentId);
  if (idx >= 0 && idx < queue.length - 1) {
    return queue[idx + 1];
  }
  return null;
}

export function getPrevVideoInQueue<T extends { _id: string }>(currentId: string, queue: T[]): T | null {
  if (!queue || queue.length === 0) return null;
  const idx = queue.findIndex((v) => v._id === currentId);
  if (idx > 0) {
    return queue[idx - 1];
  }
  return null;
}

/* ==================== COMPLETION & UTILS ==================== */
export function isVideoCompleted(currentTime: number, duration: number, thresholdPct = 90): boolean {
  if (!duration || duration <= 0) return false;
  return (currentTime / duration) * 100 >= thresholdPct;
}

export function formatTimestamp(secs: number): string {
  if (isNaN(secs) || secs < 0) return '00:00';
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function getStoredSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SIDEBAR_STATE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setStoredSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SIDEBAR_STATE_KEY, collapsed ? 'true' : 'false');
  } catch {}
}
