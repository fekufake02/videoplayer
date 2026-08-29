import { IVideo, ISettings, HomeSections, VideoListResponse } from '../types';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api` : '/api')
  : (process.env.NEXT_PUBLIC_BACKEND_URL ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api` : 'http://127.0.0.1:3000/api');

class ApiClient {
  private streamUrlCache: Map<string, { url: string; expiry: number }> = new Map();

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('metime_auth_token');
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Include HttpOnly cookies
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('metime_auth_token');
          window.dispatchEvent(new CustomEvent('app:unauthorized'));
        }
      }
      const errorMessage = data.error?.message || 'An error occurred during API request';
      throw new Error(errorMessage);
    }

    return data;
  }

  // Auth Endpoints
  async login(password: string) {
    const res = await this.request<{ success: boolean; token?: string; user: any; settings: ISettings }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });

    if (res.token && typeof window !== 'undefined') {
      localStorage.setItem('metime_auth_token', res.token);
    }
    return res;
  }

  async logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('metime_auth_token');
    }
    return this.request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    });
  }

  async getMe() {
    return this.request<{
      success: boolean;
      authenticated: boolean;
      user?: any;
      settings?: ISettings;
    }>('/auth/me', {
      method: 'GET',
    });
  }

  // Video & Library Endpoints
  async getLibraryHome() {
    return this.request<{ success: boolean } & HomeSections>('/library/home', {
      method: 'GET',
    });
  }

  async listVideos(params: {
    page?: number;
    limit?: number;
    search?: string;
    tag?: string;
    sort?: string;
    filter?: string;
  }) {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.search) query.append('search', params.search);
    if (params.tag) query.append('tag', params.tag);
    if (params.sort) query.append('sort', params.sort);
    if (params.filter) query.append('filter', params.filter);

    return this.request<VideoListResponse>(`/videos?${query.toString()}`, {
      method: 'GET',
    });
  }

  async initiateUpload(payload: {
    title: string;
    filename: string;
    mimeType: string;
    size: number;
    tags?: string[];
    notes?: string;
  }) {
    return this.request<{
      success: boolean;
      uploadUrl: string;
      storageKey: string;
      videoId: string;
    }>('/videos/upload/initiate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Initiate upload for direct B2 thumbnail uploads
   */
  async initiateThumbnailUpload(payload: {
    filename?: string;
    mimeType?: string;
    size?: number;
    videoId?: string;
  }) {
    try {
      return await this.request<{
        success: boolean;
        uploadUrl: string;
        storageKey: string;
      }>('/thumbnails/upload/initiate', {
        method: 'POST',
        body: JSON.stringify({
          filename: payload.filename || 'thumbnail.webp',
          mimeType: payload.mimeType || 'image/webp',
          size: payload.size || 1024,
          videoId: payload.videoId,
        }),
      });
    } catch {
      return await this.request<{
        success: boolean;
        uploadUrl: string;
        storageKey: string;
      }>('/videos/upload/initiate', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Thumbnail',
          filename: payload.filename || 'thumbnail.webp',
          mimeType: payload.mimeType || 'image/webp',
          size: payload.size || 1024,
        }),
      });
    }
  }

  /**
   * Initiate upload for direct B2 thumbnail uploads (backward compatible alias)
   */
  async initiateUploadDirect(payload: {
    filename: string;
    mimeType: string;
    size: number;
  }) {
    return this.initiateThumbnailUpload(payload);
  }

  async completeUpload(payload: {
    title: string;
    originalFilename: string;
    storageKey: string;
    thumbnailKey?: string;
    mimeType: string;
    size: number;
    duration?: number;
    tags?: string[];
    notes?: string;
  }) {
    return this.request<{ success: boolean; video: IVideo }>('/videos/upload/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async attachThumbnail(id: string, thumbnailKey: string, blurhash?: string) {
    return this.request<{ success: boolean; video: IVideo }>(`/videos/${id}/thumbnail`, {
      method: 'POST',
      body: JSON.stringify({ thumbnailKey, blurhash }),
    });
  }

  /**
   * Helper to fetch all videos across all pagination pages (e.g. for batch migrations)
   */
  async getAllVideos(): Promise<IVideo[]> {
    const allVideos: IVideo[] = [];
    let page = 1;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await this.listVideos({ page, limit });
      if (res.videos && res.videos.length > 0) {
        allVideos.push(...res.videos);
        if (allVideos.length >= res.total || res.videos.length < limit) {
          hasMore = false;
        } else {
          page += 1;
        }
      } else {
        hasMore = false;
      }
    }

    return allVideos;
  }

  async getVideoDetails(id: string) {
    return this.request<{ success: boolean; video: IVideo }>(`/videos/${id}`, {
      method: 'GET',
    });
  }

  async updateVideoMetadata(
    id: string,
    payload: { title?: string; tags?: string[]; notes?: string; favorite?: boolean }
  ) {
    return this.request<{ success: boolean; video: IVideo }>(`/videos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async deleteVideo(id: string) {
    return this.request<{ success: boolean; message: string }>(`/videos/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get stream URL with caching and rotation support
   * Tokens are short-lived (5 min) and need frequent refresh
   */
  async getStreamUrl(id: string, forceRefresh: boolean = false) {
    // Check cache
    if (!forceRefresh && this.streamUrlCache.has(id)) {
      const cached = this.streamUrlCache.get(id)!;
      if (cached.expiry > Date.now()) {
        return { success: true, streamUrl: cached.url };
      }
      this.streamUrlCache.delete(id);
    }

    const res = await this.request<{ success: boolean; streamUrl: string }>(
      `/videos/${id}/stream-url`,
      { method: 'GET' }
    );

    if (res.success && res.streamUrl) {
      // Cache for 4 minutes (token expires in 5 minutes)
      this.streamUrlCache.set(id, {
        url: res.streamUrl,
        expiry: Date.now() + 4 * 60 * 1000,
      });
    }

    return res;
  }

  /**
   * Refresh stream URL for token rotation
   * Should be called every 30 seconds during playback
   */
  async refreshStreamUrl(id: string) {
    return this.getStreamUrl(id, true);
  }

  async getDownloadUrl(id: string) {
    return this.request<{ success: boolean; downloadUrl: string }>(`/videos/${id}/download-url`, {
      method: 'GET',
    });
  }

  async updateProgress(id: string, position: number, duration?: number) {
    return this.request<{ success: boolean; lastPosition: number }>(`/videos/${id}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({ position, duration }),
    });
  }

  async recordPlay(id: string) {
    return this.request<{ success: boolean; playCount: number }>(`/videos/${id}/play`, {
      method: 'POST',
    });
  }

  async toggleFavorite(id: string) {
    return this.request<{ success: boolean; favorite: boolean }>(`/videos/${id}/favorite`, {
      method: 'POST',
    });
  }

  // Settings Endpoints
  async getSettings() {
    return this.request<{ success: boolean; settings: ISettings }>('/settings', {
      method: 'GET',
    });
  }

  async updateSettings(payload: Partial<ISettings>) {
    return this.request<{ success: boolean; settings: ISettings }>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async clearWatchHistory() {
    return this.request<{ success: boolean; message: string }>('/settings/clear-history', {
      method: 'POST',
    });
  }

  /**
   * Batch generate thumbnails for existing videos
   */
  async batchGenerateThumbnails(videoIds: string[]) {
    return this.request<{
      success: boolean;
      message: string;
      results: any;
    }>('/thumbnails/batch-generate', {
      method: 'POST',
      body: JSON.stringify({ videoIds }),
    });
  }

  /**
   * Get thumbnail URL (cached separately from stream URLs)
   */
  async getThumbnailUrl(id: string) {
    return this.request<{ success: boolean; thumbnailUrl: string }>(
      `/videos/${id}/thumbnail-url`,
      { method: 'GET' }
    );
  }
}

export const api = new ApiClient();
