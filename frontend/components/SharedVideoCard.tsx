'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { IVideo, IDriveVideo } from '../types';
import {
  Play,
  Heart,
  MoreVertical,
  Download,
  Edit3,
  Trash2,
  Tag,
  ExternalLink,
  CheckCircle2,
  FolderPlus,
  ListPlus,
  Eye,
  EyeOff,
  Cloud,
  FolderLock,
} from 'lucide-react';
import { api } from '../lib/api';
import { generateAndUploadThumbnail } from '../lib/thumbnailGenerator';
import { ThumbnailLoader } from './ThumbnailLoader';
import { saveLibraryState } from '../lib/libraryState';
import {
  isVideoCompleted,
  formatTimestamp,
  getDrivePlaybackProgress,
  getStoredCollections,
  addVideoToCollection,
  getStoredPlaylists,
  addVideoToPlaylist,
} from '../lib/collectionsManager';

export type AnyMediaVideo = IVideo | IDriveVideo;

export interface SharedVideoCardProps {
  video: AnyMediaVideo;
  sourceType: 'vault' | 'drive';
  onEdit?: (video: IVideo) => void;
  onDelete?: (video: AnyMediaVideo) => void;
  onFavoriteToggle?: (id: string, isFav: boolean) => void;
  isSelected?: boolean;
  onSelectToggle?: (id: string) => void;
  viewMode?: 'grid' | 'list';
  onPlay?: (video: AnyMediaVideo) => void;
  onOpenDetails?: (video: AnyMediaVideo) => void;
}

export const SharedVideoCard: React.FC<SharedVideoCardProps> = ({
  video,
  sourceType,
  onEdit,
  onDelete,
  onFavoriteToggle,
  isSelected = false,
  onSelectToggle,
  viewMode = 'grid',
  onPlay,
  onOpenDetails,
}) => {
  const pathname = usePathname();
  const { settings } = useAuth();
  const shouldBlockThumbnail =
    (pathname === '/' || pathname === '' || pathname === '/#') && !!settings?.blockPlaceholders;

  const [isFavorite, setIsFavorite] = useState<boolean>(Boolean(video.favorite));
  const [showMenu, setShowMenu] = useState(false);
  const [showCollectionSubmenu, setShowCollectionSubmenu] = useState(false);
  const [showPlaylistSubmenu, setShowPlaylistSubmenu] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(video.thumbnailUrl || null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Synchronize thumbnail and favorite states when video prop changes (e.g. Recently Viewed, filtering)
  useEffect(() => {
    setThumbnailUrl(video.thumbnailUrl || null);
    setImageLoaded(false);
    setImageError(false);
    setIsFavorite(Boolean(video.favorite));
  }, [video._id, video.thumbnailUrl, video.favorite]);

  const isDrive = sourceType === 'drive';
  const watchHref = isDrive ? `/drive/watch/${video._id}` : `/watch/${video._id}`;

  // Get playback position
  let currentPos = 0;
  if ('lastPosition' in video && typeof video.lastPosition === 'number') {
    currentPos = video.lastPosition;
  } else if (isDrive) {
    const driveProg = getDrivePlaybackProgress(video._id);
    if (driveProg) currentPos = driveProg.position;
  }

  const duration = video.duration || 0;
  const isCompleted = isVideoCompleted(currentPos, duration);
  const progressPct = duration > 0 ? Math.min(100, Math.round((currentPos / duration) * 100)) : 0;

  const handleMouseEnter = async () => {
    if (shouldBlockThumbnail || isDrive) return;
    const v = video as IVideo;
    if (!thumbnailUrl && !v.thumbnailKey) {
      try {
        const res = await api.getStreamUrl(v._id);
        if (res?.streamUrl) {
          generateAndUploadThumbnail(res.streamUrl, v.originalFilename)
            .then((result) => {
              if (result?.thumbnailKey) {
                api.attachThumbnail(v._id, result.thumbnailKey, result.blurhash).catch(() => {});
                api.getThumbnailUrl(v._id).then((t) => {
                  if (t?.thumbnailUrl) setThumbnailUrl(t.thumbnailUrl);
                }).catch(() => {});
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error('Failed to get stream URL:', err);
      }
    } else if (v.thumbnailKey && !thumbnailUrl) {
      try {
        const res = await api.getThumbnailUrl(v._id);
        if (res?.thumbnailUrl) {
          setThumbnailUrl(res.thumbnailUrl);
        }
      } catch (err) {
        console.error('Failed to get thumbnail URL:', err);
      }
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !isFavorite;
    setIsFavorite(next);
    if (isDrive) {
      if (onFavoriteToggle) onFavoriteToggle(video._id, next);
    } else {
      try {
        const res = await api.toggleFavorite(video._id);
        setIsFavorite(res.favorite);
        if (onFavoriteToggle) onFavoriteToggle(video._id, res.favorite);
      } catch (err) {
        console.error('Failed to toggle favorite:', err);
      }
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu(false);
    setIsDownloading(true);
    try {
      if (isDrive) {
        const driveV = video as IDriveVideo;
        const dlUrl = driveV.driveStreamUrl || driveV.driveViewUrl;
        if (dlUrl) {
          window.open(dlUrl, '_blank');
        }
      } else {
        const res = await api.getDownloadUrl(video._id);
        if (res.downloadUrl) {
          const a = document.createElement('a');
          a.href = res.downloadUrl;
          a.download = video.originalFilename || 'video.mp4';
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            if (document.body.contains(a)) document.body.removeChild(a);
          }, 150);
        }
      }
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleAddToCollection = (colId: string, colName: string) => {
    addVideoToCollection(colId, video._id);
    setActionNotice(`Added to ${colName}`);
    setShowMenu(false);
    setShowCollectionSubmenu(false);
    setTimeout(() => setActionNotice(null), 2500);
  };

  const handleAddToPlaylist = (plId: string, plName: string) => {
    addVideoToPlaylist(plId, video._id);
    setActionNotice(`Added to ${plName}`);
    setShowMenu(false);
    setShowPlaylistSubmenu(false);
    setTimeout(() => setActionNotice(null), 2500);
  };

  const handleCardClick = () => {
    saveLibraryState({
      scrollY: window.scrollY,
      lastClickedVideoId: video._id,
    });
    if (onPlay) onPlay(video);
  };

  const collections = getStoredCollections();
  const playlists = getStoredPlaylists();

  return (
    <div
      id={`${sourceType}-video-card-${video._id}`}
      className={`group relative bg-[#131620] border rounded-[14px] overflow-hidden transition-all duration-200 ${
        viewMode === 'list' ? 'flex flex-col sm:flex-row items-stretch' : 'flex flex-col'
      } hover:bg-[#191D29] hover:border-white/[0.14] select-none ${
        isSelected ? 'border-accent ring-1 ring-accent/50' : 'border-white/[0.08]'
      }`}
    >
      {/* Thumbnail Container (16:9 Aspect Ratio) */}
      <Link
        href={watchHref}
        onClick={handleCardClick}
        onMouseEnter={handleMouseEnter}
        className={`relative ${
          viewMode === 'list' ? 'w-full sm:w-60 shrink-0 aspect-video' : 'aspect-video'
        } bg-[#090A0F] overflow-hidden flex items-center justify-center cursor-pointer`}
        aria-label={`Watch ${video.title}`}
      >
        {isDrive ? (
          <>
            {/* Drive Fallback Graphic */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0E1017] via-[#131620] to-[#090A0F] flex flex-col items-center justify-center p-3 text-center">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                <Cloud className="w-5 h-5 text-indigo-400" />
              </div>
              <span className="text-[11px] text-[#73798B] font-medium line-clamp-1 max-w-[85%]">
                {video.title}
              </span>
            </div>

            {/* Drive Thumbnail Image */}
            {video.thumbnailUrl && !imageError && (
              <img
                src={video.thumbnailUrl}
                alt={video.title}
                referrerPolicy="no-referrer"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                className={`absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.025] ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )}
          </>
        ) : (
          <ThumbnailLoader
            videoId={video._id}
            src={thumbnailUrl || undefined}
            blurhash={('blurhash' in video ? video.blurhash : undefined)}
            fallbackText={video.originalFilename}
            alt={video.title}
            blocked={shouldBlockThumbnail}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.025]"
          />
        )}

        {/* Hover Center Play Button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center pointer-events-none">
          <div className="w-11 h-11 rounded-full bg-accent text-white flex items-center justify-center shadow-lg transform scale-95 group-hover:scale-100 transition-transform">
            <Play className="w-4 h-4 fill-current translate-x-0.5" />
          </div>
        </div>

        {/* Top Badges: Source Badge (Left) & Favorite/Select (Right) */}
        <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none z-10">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold backdrop-blur-md border ${
              isDrive
                ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                : 'bg-amber-400/15 text-amber-300 border-amber-400/30'
            }`}
          >
            {isDrive ? 'Drive' : 'Vault'}
          </span>

          <div className="flex items-center gap-1">
            {onSelectToggle && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectToggle(video._id);
                }}
                className={`pointer-events-auto p-1.5 rounded-lg backdrop-blur-md transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center ${
                  isSelected ? 'bg-accent text-white' : 'bg-black/60 text-[#A1A6B5] hover:text-white'
                }`}
                aria-label="Select video"
                title="Select video"
              >
                <div
                  className={`w-3.5 h-3.5 border rounded-sm flex items-center justify-center ${
                    isSelected ? 'border-white bg-accent' : 'border-white/40'
                  }`}
                >
                  {isSelected && <span className="text-[10px] font-bold text-white">✓</span>}
                </div>
              </button>
            )}

            <button
              onClick={handleToggleFavorite}
              className="pointer-events-auto p-1.5 rounded-lg bg-black/60 backdrop-blur-md text-[#A1A6B5] hover:text-rose-400 transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Duration Badge Bottom-Right */}
        <div className="absolute bottom-2 right-2 pointer-events-none z-10 flex items-center gap-1">
          {isCompleted && (
            <span
              className="p-1 rounded bg-emerald-500/20 text-emerald-400 backdrop-blur-md border border-emerald-500/30"
              title="Completed"
            >
              <CheckCircle2 className="w-3 h-3" />
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-[#F4F5FA] bg-black/80 backdrop-blur-md border border-white/10 tabular-nums">
            {formatTimestamp(duration)}
          </span>
        </div>

        {/* Bottom Playback Progress Bar (3px height) */}
        {progressPct > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-[3px] bg-white/10 z-10">
            <div
              className={`h-full transition-all duration-300 ${isCompleted ? 'bg-emerald-400' : 'bg-accent'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </Link>

      {/* Card Content Body */}
      <div className="p-3.5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-1.5 mb-1.5">
            <Link
              href={watchHref}
              onClick={handleCardClick}
              className="font-semibold text-sm text-[#F4F5FA] line-clamp-2 hover:text-accent transition-colors leading-snug"
              title={video.title}
            >
              {video.title}
            </Link>

            {/* Menu Trigger */}
            <div className="relative shrink-0">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMenu((prev) => !prev);
                  setShowCollectionSubmenu(false);
                  setShowPlaylistSubmenu(false);
                }}
                className="p-1.5 text-[#A1A6B5] hover:text-[#F4F5FA] rounded-md hover:bg-white/[0.06] transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center focus-visible:outline-accent"
                aria-label="Video actions menu"
                title="Options"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {/* Context Menu Dropdown (180-220px wide) */}
              {showMenu && (
                <div
                  onMouseLeave={() => {
                    setShowMenu(false);
                    setShowCollectionSubmenu(false);
                    setShowPlaylistSubmenu(false);
                  }}
                  className="absolute right-0 top-7 z-40 w-48 bg-[#1D2230] border border-white/[0.09] rounded-xl py-1 shadow-2xl text-[13px] text-[#F4F5FA] animate-fade-in"
                >
                  <Link
                    href={watchHref}
                    onClick={() => setShowMenu(false)}
                    className="w-full px-3 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 text-accent" />
                    <span>{progressPct > 0 ? 'Resume Playback' : 'Play Video'}</span>
                  </Link>

                  {/* Add to Collection */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCollectionSubmenu((v) => !v);
                        setShowPlaylistSubmenu(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-white/[0.06] flex items-center justify-between gap-2.5 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                        <span>Add to Collection</span>
                      </div>
                      <span className="text-[10px] text-[#73798B]">›</span>
                    </button>
                    {showCollectionSubmenu && (
                      <div className="absolute right-full top-0 w-44 bg-[#191D29] border border-white/[0.09] rounded-xl py-1 shadow-2xl text-xs z-50">
                        {collections.length > 0 ? (
                          collections.map((col) => (
                            <button
                              key={col.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddToCollection(col.id, col.name);
                              }}
                              className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] truncate"
                            >
                              {col.name}
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-[#73798B] text-center">No collections yet</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Add to Playlist */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPlaylistSubmenu((v) => !v);
                        setShowCollectionSubmenu(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-white/[0.06] flex items-center justify-between gap-2.5 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <ListPlus className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Add to Playlist</span>
                      </div>
                      <span className="text-[10px] text-[#73798B]">›</span>
                    </button>
                    {showPlaylistSubmenu && (
                      <div className="absolute right-full top-0 w-44 bg-[#191D29] border border-white/[0.09] rounded-xl py-1 shadow-2xl text-xs z-50">
                        {playlists.length > 0 ? (
                          playlists.map((pl) => (
                            <button
                              key={pl.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddToPlaylist(pl.id, pl.name);
                              }}
                              className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] truncate"
                            >
                              {pl.name}
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-[#73798B] text-center">No playlists yet</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="my-1 border-t border-white/[0.06]" />

                  {isDrive && (video as IDriveVideo).driveViewUrl && (
                    <a
                      href={(video as IDriveVideo).driveViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Open in Drive</span>
                    </a>
                  )}

                  {!isDrive && onEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onEdit(video as IVideo);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#A1A6B5]" />
                      <span>Edit Details</span>
                    </button>
                  )}

                  {onOpenDetails && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onOpenDetails(video);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#A1A6B5]" />
                      <span>View Details</span>
                    </button>
                  )}

                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full px-3 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                  >
                    <Download className="w-3.5 h-3.5 text-[#A1A6B5]" />
                    <span>{isDownloading ? 'Preparing...' : 'Download'}</span>
                  </button>

                  {onDelete && (
                    <>
                      <div className="my-1 border-t border-white/[0.06]" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          onDelete(video);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-rose-950/40 text-rose-400 flex items-center gap-2.5"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Delete Video</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action toast confirmation badge */}
          {actionNotice && (
            <div className="mb-1.5 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] animate-fade-in flex items-center gap-1.5">
              <span>✓</span> {actionNotice}
            </div>
          )}

          {/* Tags */}
          {'tags' in video && video.tags && video.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {video.tags.slice(0, 2).map((tag, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 bg-[#090A0F] border border-white/[0.06] rounded-[6px] text-[10px] text-[#A1A6B5] flex items-center gap-0.5"
                >
                  <Tag className="w-2.5 h-2.5 text-accent" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Metadata Footer */}
        <div className="flex items-center justify-between text-xs text-[#73798B] mt-2.5 pt-2 border-t border-white/[0.05] tabular-nums">
          <span className="flex items-center gap-1">
            {isCompleted ? (
              <span className="text-emerald-400 font-medium">Completed</span>
            ) : progressPct > 0 ? (
              <span className="text-[#A1A6B5]">{progressPct}% watched</span>
            ) : (
              <span>Unwatched</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {video.size ? <span>{formatFileSize(video.size)}</span> : null}
            <span>{video.playCount || 0} plays</span>
          </div>
        </div>
      </div>
    </div>
  );
};
