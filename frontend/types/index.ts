export interface IVideo {
  _id: string;
  title: string;
  originalFilename: string;
  storageKey: string;
  thumbnailKey?: string;
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

export interface ISettings {
  userId: string;
  defaultPlaybackSpeed: number;
  defaultVolume: number;
  skipBackwardDuration: number;
  skipForwardDuration: number;
  autoResume: boolean;
  autoplay: boolean;
  autoLockDuration: number; // minutes (0 = Never)
  privacyTabHidden: boolean;
  saveWatchHistory: boolean;
  theme: 'dark' | 'light' | 'system';
  layout: 'comfortable' | 'compact';
}

export interface IUser {
  id: string;
  username: string;
}

export interface HomeSections {
  continueWatching: IVideo[];
  recentlyWatched: IVideo[];
  mostWatched: IVideo[];
  recentlyAdded: IVideo[];
}

export interface VideoListResponse {
  success: boolean;
  videos: IVideo[];
  total: number;
  page: number;
  totalPages: number;
}
