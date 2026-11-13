import { IEmbedVideo } from '../types';

const EMBED_CACHE_KEY = 'vault_embeds_cache_v1';
let memoryCache: IEmbedVideo[] | null = null;

export function getEmbedVideosCache(): IEmbedVideo[] | null {
  if (memoryCache && memoryCache.length > 0) return memoryCache;
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(EMBED_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          memoryCache = parsed;
          return parsed;
        }
      }
    } catch {}
  }
  return null;
}

export function setEmbedVideosCache(videos: IEmbedVideo[]): void {
  memoryCache = videos;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(EMBED_CACHE_KEY, JSON.stringify(videos));
    } catch {}
  }
}

export function updateSingleEmbedInCache(updated: IEmbedVideo): void {
  const existing = getEmbedVideosCache();
  if (!existing) {
    setEmbedVideosCache([updated]);
    return;
  }
  const idx = existing.findIndex((v) => v._id === updated._id);
  const next = idx >= 0
    ? existing.map((v, i) => (i === idx ? updated : v))
    : [updated, ...existing];
  setEmbedVideosCache(next);
}

export function removeEmbedFromCache(id: string): void {
  const existing = getEmbedVideosCache();
  if (!existing) return;
  setEmbedVideosCache(existing.filter((v) => v._id !== id));
}
