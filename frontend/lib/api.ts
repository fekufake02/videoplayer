import { IVideo, ISettings, HomeSections, VideoListResponse } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL
  ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api`
  : 'http://localhost:4000/api';

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Include HttpOnly cookies
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        // Trigger custom unauthorized event for AuthContext to handle
        if (typeof window !== 'undefined') {
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
    return this.request<{ success: boolean; user: any; settings: ISettings }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  async logout() {
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

  async completeUpload(payload: {
    title: string;
    originalFilename: string;
    storageKey: string;
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

  async getStreamUrl(id: string) {
    return this.request<{ success: boolean; streamUrl: string }>(`/videos/${id}/stream-url`, {
      method: 'GET',
    });
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
}

export const api = new ApiClient();
