export type ExtractedPlaybackType = 'iframe' | 'direct' | 'hybrid';

export interface ExtractedEmbedMetadata {
  sourceUrl: string;
  embedUrl?: string;
  directMediaUrl?: string;
  playbackType: ExtractedPlaybackType;
  platform: string;
  sourceDomain: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  duration: number;
}

const DIRECT_VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|mkv|m3u8|ts|m2ts|mts|flv|ogv)(\?|#|$)/i;

function isPrivateOrBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveMaybeRelativeUrl(candidate: string | undefined | null, baseUrl: string): string | undefined {
  if (!candidate) return undefined;
  const trimmed = decodeHtmlEntities(candidate).trim();
  if (!trimmed || trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) return undefined;
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return undefined;
    return resolved.toString();
  } catch {
    return undefined;
  }
}

function parseIsoDurationToSeconds(val?: string | number | null): number {
  if (typeof val === 'number' && Number.isFinite(val)) return Math.max(0, Math.round(val));
  if (!val || typeof val !== 'string') return 0;
  const numeric = Number(val);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric);
  const match = val.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match) return 0;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseFloat(match[3] || '0');
  return Math.max(0, Math.round(h * 3600 + m * 60 + s));
}

function extractMetaTag(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i'
    );
    const m1 = re1.exec(html);
    if (m1?.[1]) return decodeHtmlEntities(m1[1]);

    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      'i'
    );
    const m2 = re2.exec(html);
    if (m2?.[1]) return decodeHtmlEntities(m2[1]);
  }
  return undefined;
}

function extractTitleTag(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m?.[1] ? decodeHtmlEntities(m[1]) : undefined;
}

function extractJsonLdVideo(html: string): {
  name?: string;
  description?: string;
  thumbnailUrl?: string;
  embedUrl?: string;
  contentUrl?: string;
  duration?: number;
} | null {
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const rawJson = match[1].trim();
      if (!rawJson) continue;
      const parsed = JSON.parse(rawJson);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length > 0) {
        const node = queue.shift();
        if (!node || typeof node !== 'object') continue;
        if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
        const typeVal = Array.isArray(node['@type']) ? node['@type'].join(',') : String(node['@type'] || '');
        if (/VideoObject/i.test(typeVal)) {
          const thumb = Array.isArray(node.thumbnailUrl)
            ? node.thumbnailUrl[0]
            : typeof node.thumbnailUrl === 'object'
              ? node.thumbnailUrl?.url
              : node.thumbnailUrl;
          return {
            name: typeof node.name === 'string' ? decodeHtmlEntities(node.name) : undefined,
            description: typeof node.description === 'string' ? decodeHtmlEntities(node.description) : undefined,
            thumbnailUrl: typeof thumb === 'string' ? thumb : undefined,
            embedUrl: typeof node.embedUrl === 'string' ? node.embedUrl : undefined,
            contentUrl: typeof node.contentUrl === 'string' ? node.contentUrl : undefined,
            duration: parseIsoDurationToSeconds(node.duration),
          };
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }
  return null;
}

function detectKnownPlatform(parsedUrl: URL): {
  platform: string;
  embedUrl?: string;
  thumbnailUrl?: string;
  directMediaUrl?: string;
  oEmbedEndpoint?: string;
  defaultTitle?: string;
} {
  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const full = parsedUrl.toString();

  // Direct video / stream URL
  if (DIRECT_VIDEO_EXT_RE.test(parsedUrl.pathname)) {
    const filename = decodeURIComponent(parsedUrl.pathname.split('/').pop() || 'Direct Video')
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    return {
      platform: 'Direct Stream',
      directMediaUrl: full,
      defaultTitle: filename || 'Direct Video Stream',
    };
  }

  // YouTube
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
    let vidId = parsedUrl.searchParams.get('v') || '';
    if (!vidId && host === 'youtu.be') {
      vidId = parsedUrl.pathname.replace(/^\/+/, '').split('/')[0];
    }
    if (!vidId) {
      const m = parsedUrl.pathname.match(/\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{6,})/);
      if (m?.[1]) vidId = m[1];
    }
    if (vidId) {
      return {
        platform: 'YouTube',
        embedUrl: `https://www.youtube.com/embed/${vidId}?autoplay=1&rel=0`,
        thumbnailUrl: `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
        oEmbedEndpoint: `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&format=json`,
        defaultTitle: `YouTube Video (${vidId})`,
      };
    }
  }

  // Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = parsedUrl.pathname.match(/\/(?:video\/)?(\d{5,})/);
    if (m?.[1]) {
      return {
        platform: 'Vimeo',
        embedUrl: `https://player.vimeo.com/video/${m[1]}?autoplay=1`,
        oEmbedEndpoint: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${m[1]}`)}`,
        defaultTitle: `Vimeo Video (${m[1]})`,
      };
    }
  }

  // Dailymotion
  if (host === 'dailymotion.com' || host === 'dai.ly') {
    const m = parsedUrl.pathname.match(/(?:\/video\/|\/embed\/video\/|^\/)([a-zA-Z0-9]+)/);
    if (m?.[1]) {
      return {
        platform: 'Dailymotion',
        embedUrl: `https://www.dailymotion.com/embed/video/${m[1]}?autoplay=1`,
        thumbnailUrl: `https://www.dailymotion.com/thumbnail/video/${m[1]}`,
        oEmbedEndpoint: `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(full)}&format=json`,
        defaultTitle: `Dailymotion Video (${m[1]})`,
      };
    }
  }

  // Streamable
  if (host === 'streamable.com') {
    const m = parsedUrl.pathname.match(/\/(?:e\/|o\/)?([a-zA-Z0-9]{4,})/);
    if (m?.[1]) {
      return {
        platform: 'Streamable',
        embedUrl: `https://streamable.com/e/${m[1]}?autoplay=1`,
        oEmbedEndpoint: `https://api.streamable.com/oembed.json?url=${encodeURIComponent(full)}`,
        defaultTitle: `Streamable Video (${m[1]})`,
      };
    }
  }

  // Loom
  if (host === 'loom.com') {
    const m = parsedUrl.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]{10,})/);
    if (m?.[1]) {
      return {
        platform: 'Loom',
        embedUrl: `https://www.loom.com/embed/${m[1]}`,
        oEmbedEndpoint: `https://www.loom.com/v1/oembed?url=${encodeURIComponent(full)}`,
        defaultTitle: `Loom Recording`,
      };
    }
  }

  // Google Drive
  if (host === 'drive.google.com') {
    const m = parsedUrl.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/) || [null, parsedUrl.searchParams.get('id') || ''];
    if (m[1]) {
      return {
        platform: 'Google Drive',
        embedUrl: `https://drive.google.com/file/d/${m[1]}/preview`,
        thumbnailUrl: `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1280`,
        defaultTitle: `Google Drive Video`,
      };
    }
  }

  // Twitch
  if (host === 'twitch.tv' || host === 'clips.twitch.tv') {
    const vod = parsedUrl.pathname.match(/\/videos\/(\d+)/);
    if (vod?.[1]) {
      return {
        platform: 'Twitch',
        embedUrl: `https://player.twitch.tv/?video=${vod[1]}&autoplay=true`,
        defaultTitle: `Twitch VOD (${vod[1]})`,
      };
    }
    return { platform: 'Twitch' };
  }

  // Rumble
  if (host === 'rumble.com') {
    return {
      platform: 'Rumble',
      oEmbedEndpoint: `https://rumble.com/api/Media/oembed.json?url=${encodeURIComponent(full)}`,
    };
  }

  // TikTok
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const m = parsedUrl.pathname.match(/\/video\/(\d+)/);
    return {
      platform: 'TikTok',
      embedUrl: m?.[1] ? `https://www.tiktok.com/embed/v2/${m[1]}` : undefined,
      oEmbedEndpoint: `https://www.tiktok.com/oembed?url=${encodeURIComponent(full)}`,
    };
  }

  // Known web / social / media portals -> capitalize hostname nicely
  const rootLabel = host.split('.').slice(-2, -1)[0] || host;
  const formattedPlatform = rootLabel.charAt(0).toUpperCase() + rootLabel.slice(1);
  return { platform: formattedPlatform };
}

export class EmbedService {
  async extractMetadata(rawUrl: string): Promise<ExtractedEmbedMetadata> {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) {
      throw new Error('Please enter a video URL.');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      throw new Error('Invalid URL format. Please include https:// or http://');
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS URLs are supported.');
    }

    if (isPrivateOrBlockedHost(parsedUrl.hostname)) {
      throw new Error('Local or private network URLs are not permitted.');
    }

    const sourceUrl = parsedUrl.toString();
    const sourceDomain = parsedUrl.hostname.replace(/^www\./i, '');
    const known = detectKnownPlatform(parsedUrl);

    let title = known.defaultTitle || '';
    let description = '';
    let thumbnailUrl = known.thumbnailUrl;
    let embedUrl = known.embedUrl;
    let directMediaUrl = known.directMediaUrl;
    let duration = 0;

    // 1. Try oEmbed endpoint if available
    if (known.oEmbedEndpoint) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const oResp = await fetch(known.oEmbedEndpoint, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; MediaVault/1.0)',
          },
        });
        clearTimeout(timer);
        if (oResp.ok) {
          const oData: any = await oResp.json();
          if (oData.title && typeof oData.title === 'string') title = oData.title.trim();
          if (oData.thumbnail_url && typeof oData.thumbnail_url === 'string') {
            thumbnailUrl = oData.thumbnail_url;
          }
          if (typeof oData.duration === 'number') {
            duration = Math.max(0, Math.round(oData.duration));
          }
          if (!embedUrl && typeof oData.html === 'string') {
            const iframeSrc = /<iframe[^>]+src=["']([^"']+)["']/i.exec(oData.html)?.[1];
            if (iframeSrc) {
              embedUrl = resolveMaybeRelativeUrl(iframeSrc, sourceUrl);
            }
          }
        }
      } catch {
        // Fall through to HTML scraping
      }
    }

    // 2. Scrape HTML page metadata & playable stream hints if not a direct binary file
    if (!DIRECT_VIDEO_EXT_RE.test(parsedUrl.pathname)) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7500);
        const resp = await fetch(sourceUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        clearTimeout(timer);

        const ctype = (resp.headers.get('content-type') || '').toLowerCase();
        if (ctype.startsWith('video/') || ctype.includes('mpegurl') || ctype.includes('mp2t')) {
          directMediaUrl = resp.url || sourceUrl;
        } else if (resp.ok && (ctype.includes('text/html') || ctype.includes('application/xhtml') || !ctype)) {
          const html = (await resp.text()).slice(0, 500_000);
          const jsonLd = extractJsonLdVideo(html);

          const metaTitle =
            extractMetaTag(html, ['og:title', 'twitter:title']) ||
            jsonLd?.name ||
            extractTitleTag(html);
          if (metaTitle && (!title || title.startsWith(`${known.platform} Video`))) {
            title = metaTitle;
          }

          const metaDesc =
            extractMetaTag(html, ['og:description', 'twitter:description', 'description']) ||
            jsonLd?.description ||
            '';
          if (metaDesc && !description) description = metaDesc;

          const metaThumb =
            extractMetaTag(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) ||
            jsonLd?.thumbnailUrl ||
            /<video[^>]+poster=["']([^"']+)["']/i.exec(html)?.[1];
          const resolvedThumb = resolveMaybeRelativeUrl(metaThumb, resp.url || sourceUrl);
          if (resolvedThumb && !thumbnailUrl) {
            thumbnailUrl = resolvedThumb;
          }

          if (!duration) {
            const metaDur = extractMetaTag(html, ['og:video:duration', 'video:duration']);
            duration = parseIsoDurationToSeconds(metaDur) || jsonLd?.duration || 0;
          }

          // Extract direct media stream URL (like link downloaders do for preview)
          const ogVideo = extractMetaTag(html, ['og:video:secure_url', 'og:video', 'og:video:url']);
          const ogVideoType = (extractMetaTag(html, ['og:video:type']) || '').toLowerCase();
          if (ogVideo) {
            const resolvedOgVideo = resolveMaybeRelativeUrl(ogVideo, resp.url || sourceUrl);
            if (resolvedOgVideo) {
              if (
                DIRECT_VIDEO_EXT_RE.test(resolvedOgVideo) ||
                ogVideoType.startsWith('video/') ||
                ogVideoType.includes('mpegurl')
              ) {
                if (!directMediaUrl) directMediaUrl = resolvedOgVideo;
              } else if (!embedUrl) {
                embedUrl = resolvedOgVideo;
              }
            }
          }

          if (!directMediaUrl && jsonLd?.contentUrl) {
            directMediaUrl = resolveMaybeRelativeUrl(jsonLd.contentUrl, resp.url || sourceUrl);
          }

          if (!embedUrl && jsonLd?.embedUrl) {
            embedUrl = resolveMaybeRelativeUrl(jsonLd.embedUrl, resp.url || sourceUrl);
          }

          if (!embedUrl) {
            const twitterPlayer = extractMetaTag(html, ['twitter:player']);
            if (twitterPlayer) {
              embedUrl = resolveMaybeRelativeUrl(twitterPlayer, resp.url || sourceUrl);
            }
          }

          // Look for explicit <video><source src="..."> or direct mp4/m3u8 links in HTML body
          if (!directMediaUrl) {
            const videoSrcMatch =
              /<(?:video|source)[^>]+src=["']([^"']+\.(?:mp4|webm|m3u8|mov)[^"']*)["']/i.exec(html) ||
              /["'](https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8|webm)(?:\?[^"'\s<>]*)?)["']/i.exec(html);
            if (videoSrcMatch?.[1]) {
              const cleaned = videoSrcMatch[1].replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
              directMediaUrl = resolveMaybeRelativeUrl(cleaned, resp.url || sourceUrl);
            }
          }

          // Look for embedded iframe player in HTML if still missing embedUrl
          if (!embedUrl) {
            const iframeMatch = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/i.exec(html);
            if (iframeMatch?.[1]) {
              const candidateIframe = resolveMaybeRelativeUrl(iframeMatch[1], resp.url || sourceUrl);
              if (candidateIframe && !/googletagmanager|doubleclick|googlesyndication|facebook\.com\/tr/i.test(candidateIframe)) {
                embedUrl = candidateIframe;
              }
            }
          }
        }
      } catch {
        // Scraping failed or timed out; continue gracefully with platform defaults
      }
    }

    if (!title) {
      const pathTail = decodeURIComponent(parsedUrl.pathname.split('/').filter(Boolean).pop() || '')
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      title = pathTail || `${known.platform} Video (${sourceDomain})`;
    }

    const effectiveEmbedUrl = embedUrl || (!directMediaUrl ? sourceUrl : undefined);
    let playbackType: ExtractedPlaybackType = 'iframe';
    if (effectiveEmbedUrl && directMediaUrl) {
      playbackType = 'hybrid';
    } else if (directMediaUrl && !embedUrl) {
      playbackType = 'direct';
    }

    return {
      sourceUrl,
      embedUrl: effectiveEmbedUrl,
      directMediaUrl,
      playbackType,
      platform: known.platform,
      sourceDomain,
      title: title.slice(0, 220),
      description: description.slice(0, 600),
      thumbnailUrl,
      duration,
    };
  }
}

export const embedService = new EmbedService();
