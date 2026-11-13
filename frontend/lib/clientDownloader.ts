'use client';

export interface ClientDownloadProgress {
  phase: 'preparing' | 'downloading' | 'assembling' | 'done';
  percent: number;
  loadedBytes: number;
  totalBytes?: number;
  segmentsDone?: number;
  totalSegments?: number;
  label: string;
}

export class ClientDownloadCorsError extends Error {
  constructor(message = 'Remote host blocked direct browser CORS fetch.') {
    super(message);
    this.name = 'ClientDownloadCorsError';
  }
}

export function sanitizeDownloadFilename(title: string, ext = 'mp4'): string {
  const cleanBase = (title || 'video')
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  const safeBase = cleanBase || 'vault-video';
  const cleanExt = ext.replace(/^\./, '').toLowerCase() || 'mp4';
  if (safeBase.toLowerCase().endsWith(`.${cleanExt}`)) return safeBase;
  return `${safeBase}.${cleanExt}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(val >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function triggerBrowserBlobSave(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {}
  }, 4000);
}

function parseMasterPlaylistBestVariant(manifestText: string, baseUrl: string): string | null {
  const lines = manifestText.split(/\r?\n/).map((l) => l.trim());
  let bestUrl: string | null = null;
  let bestBandwidth = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
      const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
      let j = i + 1;
      while (j < lines.length && (!lines[j] || lines[j].startsWith('#'))) j++;
      if (j < lines.length && lines[j]) {
        try {
          const resolved = new URL(lines[j], baseUrl).toString();
          if (bw >= bestBandwidth) {
            bestBandwidth = bw;
            bestUrl = resolved;
          }
        } catch {}
      }
    }
  }
  return bestUrl;
}

function extractHlsSegmentUrls(manifestText: string, baseUrl: string): {
  segments: string[];
  hasFmp4Map: boolean;
} {
  const lines = manifestText.split(/\r?\n/).map((l) => l.trim());
  const segments: string[] = [];
  let hasFmp4Map = false;

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXT-X-MAP:')) {
      const uriMatch = line.match(/URI="([^"]+)"/i);
      if (uriMatch?.[1]) {
        try {
          segments.push(new URL(uriMatch[1], baseUrl).toString());
          hasFmp4Map = true;
        } catch {}
      }
      continue;
    }
    if (line.startsWith('#')) continue;
    try {
      segments.push(new URL(line, baseUrl).toString());
    } catch {}
  }

  return { segments, hasFmp4Map };
}

/**
 * Pure client-side video downloader (zero server streaming).
 * Supports direct MP4/WebM/MOV files with streaming byte progress AND client-side HLS (.m3u8) segment merging.
 */
export async function downloadVideoOnClient(params: {
  url: string;
  title: string;
  signal?: AbortSignal;
  onProgress?: (progress: ClientDownloadProgress) => void;
}): Promise<{ filename: string; bytes: number }> {
  const { url, title, signal, onProgress } = params;
  const trimmedUrl = (url || '').trim();
  if (!trimmedUrl) {
    throw new Error('No direct video stream URL is available to download.');
  }

  onProgress?.({
    phase: 'preparing',
    percent: 0,
    loadedBytes: 0,
    label: 'Connecting directly from browser...',
  });

  let resp: Response;
  try {
    resp = await fetch(trimmedUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    throw new ClientDownloadCorsError(
      'Direct client download was blocked by the remote CDN CORS policy.'
    );
  }

  if (!resp.ok) {
    throw new Error(`Remote host returned HTTP ${resp.status}`);
  }

  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  const isLikelyHls =
    /\.m3u8(\?|$)/i.test(trimmedUrl) ||
    contentType.includes('mpegurl');

  // If HLS manifest, fetch variant + merge all segments in browser memory
  if (isLikelyHls) {
    let manifestText = await resp.text();
    let manifestUrl = resp.url || trimmedUrl;

    if (!manifestText.trimStart().startsWith('#EXTM3U')) {
      throw new Error('URL did not return a valid HLS playlist.');
    }

    if (manifestText.includes('#EXT-X-STREAM-INF:')) {
      const bestVariant = parseMasterPlaylistBestVariant(manifestText, manifestUrl);
      if (bestVariant) {
        const varResp = await fetch(bestVariant, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          signal,
        });
        if (!varResp.ok) {
          throw new Error(`Failed to fetch HLS variant (${varResp.status})`);
        }
        manifestText = await varResp.text();
        manifestUrl = varResp.url || bestVariant;
      }
    }

    if (manifestText.includes('#EXT-X-KEY:')) {
      throw new Error('This stream uses encrypted HLS segments (#EXT-X-KEY) which cannot be merged directly.');
    }

    const { segments, hasFmp4Map } = extractHlsSegmentUrls(manifestText, manifestUrl);
    if (segments.length === 0) {
      throw new Error('No playable segments found inside HLS manifest.');
    }

    const buffers: Uint8Array[] = new Array(segments.length);
    let completed = 0;
    let totalBytes = 0;
    let nextIdx = 0;
    const concurrency = 4;

    const worker = async () => {
      while (true) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const idx = nextIdx++;
        if (idx >= segments.length) break;

        let segResp: Response;
        try {
          segResp = await fetch(segments[idx], {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            signal,
          });
        } catch (err: any) {
          if (err?.name === 'AbortError') throw err;
          throw new ClientDownloadCorsError('HLS segment CDN blocked browser CORS.');
        }
        if (!segResp.ok) {
          throw new Error(`Segment ${idx + 1} failed (${segResp.status})`);
        }
        const buf = new Uint8Array(await segResp.arrayBuffer());
        buffers[idx] = buf;
        completed++;
        totalBytes += buf.byteLength;
        const pct = Math.min(99, Math.round((completed / segments.length) * 100));
        onProgress?.({
          phase: 'downloading',
          percent: pct,
          loadedBytes: totalBytes,
          segmentsDone: completed,
          totalSegments: segments.length,
          label: `Downloading ${completed}/${segments.length} segments (${formatBytes(totalBytes)})`,
        });
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, segments.length) }, () => worker()));

    onProgress?.({
      phase: 'assembling',
      percent: 99,
      loadedBytes: totalBytes,
      segmentsDone: segments.length,
      totalSegments: segments.length,
      label: 'Assembling video file in browser...',
    });

    const ext = hasFmp4Map ? 'mp4' : 'ts';
    const mime = hasFmp4Map ? 'video/mp4' : 'video/mp2t';
    const blob = new Blob(buffers as unknown as BlobPart[], { type: mime });
    const filename = sanitizeDownloadFilename(title, ext);
    triggerBrowserBlobSave(blob, filename);

    onProgress?.({
      phase: 'done',
      percent: 100,
      loadedBytes: blob.size,
      totalBytes: blob.size,
      label: `Saved ${filename} (${formatBytes(blob.size)})`,
    });

    return { filename, bytes: blob.size };
  }

  // Standard MP4 / WebM / MOV stream download completely on client
  if (contentType.includes('text/html')) {
    throw new Error('The extracted link points to a webpage rather than a video file.');
  }

  const totalLength = Number(resp.headers.get('content-length') || '0') || undefined;
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  if (resp.body) {
    const reader = resp.body.getReader();
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        throw new DOMException('Aborted', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedBytes += value.byteLength;
        const pct = totalLength ? Math.min(99, Math.round((loadedBytes / totalLength) * 100)) : 0;
        onProgress?.({
          phase: 'downloading',
          percent: pct,
          loadedBytes,
          totalBytes: totalLength,
          label: totalLength
            ? `Downloading ${pct}% (${formatBytes(loadedBytes)} / ${formatBytes(totalLength)})`
            : `Downloaded ${formatBytes(loadedBytes)}...`,
        });
      }
    }
  } else {
    const buf = new Uint8Array(await resp.arrayBuffer());
    chunks.push(buf);
    loadedBytes = buf.byteLength;
  }

  let ext = 'mp4';
  if (/webm/i.test(contentType) || /\.webm(\?|$)/i.test(trimmedUrl)) ext = 'webm';
  else if (/quicktime/i.test(contentType) || /\.mov(\?|$)/i.test(trimmedUrl)) ext = 'mov';
  else if (/matroska/i.test(contentType) || /\.mkv(\?|$)/i.test(trimmedUrl)) ext = 'mkv';

  onProgress?.({
    phase: 'assembling',
    percent: 99,
    loadedBytes,
    totalBytes: loadedBytes,
    label: 'Saving file to disk...',
  });

  const blob = new Blob(chunks as unknown as BlobPart[], { type: contentType || `video/${ext}` });
  const filename = sanitizeDownloadFilename(title, ext);
  triggerBrowserBlobSave(blob, filename);

  onProgress?.({
    phase: 'done',
    percent: 100,
    loadedBytes: blob.size,
    totalBytes: blob.size,
    label: `Saved ${filename} (${formatBytes(blob.size)})`,
  });

  return { filename, bytes: blob.size };
}
