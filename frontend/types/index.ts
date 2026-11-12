export interface IVideo {
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

export interface ISettings {
  userId: string;
  defaultPlaybackSpeed: number;
  defaultVolume: number;
  skipBackwardDuration: number;
  skipForwardDuration: number;
  autoResume: boolean;
  autoplay: boolean;
  autoLockDuration: number; // minutes (0 = Never)
  privacyTabHidden: boolean; // Lock on tab switch
  lockOnWindowBlur?: boolean; // Lock when browser loses focus
  blockPlaceholders?: boolean; // Privacy feature: block all thumbnails and placeholders
  pauseOnTabSwitch?: boolean; // Pause video when switching tabs
  keyboardShortcuts?: boolean; // Enable panic & player hotkeys
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

export interface IDriveVideo {
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

export interface DriveVideoListResponse {
  success: boolean;
  videos: IDriveVideo[];
  total: number;
  page: number;
  totalPages: number;
  folderId?: string;
}

export interface IBookmark {
  id: string;
  videoId: string;
  timestamp: number;
  label?: string;
  createdAt: string;
}

export interface IChapter {
  id: string;
  title: string;
  startTime: number;
  endTime?: number;
}

export interface ICollection {
  id: string;
  name: string;
  videoIds: string[];
  createdAt: string;
  updatedAt: string;
  coverUrl?: string;
}

export interface IPlaylist {
  id: string;
  name: string;
  videoIds: string[];
  createdAt: string;
  updatedAt: string;
}
