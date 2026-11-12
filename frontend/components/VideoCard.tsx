'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { IVideo } from '../types';
import { Play, Heart, MoreVertical, Download, Edit3, Trash2, Tag, Clock, HardDrive } from 'lucide-react';
import { api } from '../lib/api';
import { generateAndUploadThumbnail } from '../lib/thumbnailGenerator';
import { ThumbnailLoader } from './ThumbnailLoader';
import { saveLibraryState } from '../lib/libraryState';

interface VideoCardProps {
  video: IVideo;
  onEdit?: (video: IVideo) => void;
  onDelete?: (video: IVideo) => void;
  onFavoriteToggle?: (id: string, isFav: boolean) => void;
  isSelected?: boolean;
  onSelectToggle?: (id: string) => void;
  viewMode?: 'grid' | 'list';
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  onEdit,
  onDelete,
  onFavoriteToggle,
  isSelected = false,
  onSelectToggle,
  viewMode = 'grid',
}) => {
  const pathname = usePathname();
  const { settings } = useAuth();
  const shouldBlockThumbnail = (pathname === '/' || pathname === '' || pathname === '/#') && !!settings?.blockPlaceholders;

  const [isFavorite, setIsFavorite] = useState(video.favorite);
  const [showMenu, setShowMenu] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(video.thumbnailUrl || null);

  const handleMouseEnter = async () => {
    if (shouldBlockThumbnail) return;
    if (!thumbnailUrl && !video.thumbnailKey) {
      try {
        const res = await api.getStreamUrl(video._id);
        if (res?.streamUrl) {
          generateAndUploadThumbnail(res.streamUrl, video.originalFilename)
            .then((result) => {
              if (result?.thumbnailKey) {
                api.attachThumbnail(video._id, result.thumbnailKey, result.blurhash).catch(() => {});
                api.getThumbnailUrl(video._id).then((t) => {
                  if (t?.thumbnailUrl) setThumbnailUrl(t.thumbnailUrl);
                }).catch(() => {});
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error('Failed to get stream URL:', err);
      }
    } else if (video.thumbnailKey && !thumbnailUrl) {
      try {
        const res = await api.getThumbnailUrl(video._id);
        if (res?.thumbnailUrl) {
          setThumbnailUrl(res.thumbnailUrl);
        }
      } catch (err) {
        console.error('Failed to get thumbnail URL:', err);
      }
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const calculateProgress = () => {
    if (!video.duration || video.duration <= 0 || !video.lastPosition) return 0;
    return Math.min(100, Math.round((video.lastPosition / video.duration) * 100));
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await api.toggleFavorite(video._id);
      setIsFavorite(res.favorite);
      if (onFavoriteToggle) onFavoriteToggle(video._id, res.favorite);
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu(false);
    setIsDownloading(true);
    try {
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
          if (document.body.contains(a)) {
            document.body.removeChild(a);
          }
        }, 150);
      }
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const progress = calculateProgress();

  const handleCardClick = () => {
    saveLibraryState({
      scrollY: window.scrollY,
      lastClickedVideoId: video._id,
    });
  };

  return (
    <div
      id={`video-card-${video._id}`}
      className={`group relative bg-[#131620] border rounded-xl overflow-hidden transition-all duration-200 ${
        viewMode === 'list' ? 'flex flex-col sm:flex-row items-stretch' : 'flex flex-col'
      } hover:bg-[#191D29] hover:border-white/[0.14] select-none ${
        isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-white/[0.07]'
      }`}
    >
      {/* Thumbnail Container */}
      <Link
        href={`/watch/${video._id}`}
        onClick={handleCardClick}
        onMouseEnter={handleMouseEnter}
        className={`relative ${
          viewMode === 'list' ? 'w-full sm:w-56 shrink-0 aspect-video' : 'aspect-video'
        } bg-[#090A0F] overflow-hidden flex items-center justify-center cursor-pointer`}
      >
        <ThumbnailLoader
          videoId={video._id}
          src={thumbnailUrl || undefined}
          blurhash={video.blurhash}
          fallbackText={video.originalFilename}
          alt={video.title}
          blocked={shouldBlockThumbnail}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />

        {/* Hover Center Play Button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-lg transform scale-95 group-hover:scale-100 transition-transform">
            <Play className="w-4 h-4 fill-current translate-x-0.5" />
          </div>
        </div>

        {/* Top Badges: Source Badge (Left) & Favorite (Right) */}
        <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none z-10">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-400/15 text-amber-300 border border-amber-400/30 backdrop-blur-md">
            Vault
          </span>

          <div className="flex items-center gap-1">
            {onSelectToggle && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectToggle(video._id);
                }}
                className={`pointer-events-auto p-1.5 rounded-lg backdrop-blur-md transition-colors ${
                  isSelected ? 'bg-indigo-500 text-white' : 'bg-black/60 text-slate-400 hover:text-white'
                }`}
                title="Select video"
              >
                <div className={`w-3.5 h-3.5 border rounded-sm flex items-center justify-center ${isSelected ? 'border-white bg-indigo-600' : 'border-white/40'}`}>
                  {isSelected && <span className="text-[10px] font-bold text-white">✓</span>}
                </div>
              </button>
            )}

            <button
              onClick={handleToggleFavorite}
              className="pointer-events-auto p-1.5 rounded-lg bg-black/60 backdrop-blur-md text-slate-300 hover:text-rose-400 transition-colors"
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Duration Badge Bottom-Right */}
        <div className="absolute bottom-2 right-2 pointer-events-none z-10">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-slate-200 bg-black/80 backdrop-blur-md border border-white/10 tabular-nums">
            {formatDuration(video.duration)}
          </span>
        </div>

        {/* Bottom Playback Progress Bar */}
        {progress > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10 z-10">
            <div
              className="h-full bg-indigo-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </Link>

      {/* Card Content Body */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-1.5 mb-1.5">
            <Link
              href={`/watch/${video._id}`}
              onClick={handleCardClick}
              className="font-medium text-xs sm:text-sm text-slate-100 line-clamp-2 hover:text-indigo-400 transition-colors leading-snug"
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
                }}
                className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-white/[0.06] transition-colors"
                title="Options"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {/* Context Menu Dropdown */}
              {showMenu && (
                <div
                  onMouseLeave={() => setShowMenu(false)}
                  className="absolute right-0 top-6 z-30 w-36 bg-[#191D29] border border-white/[0.08] rounded-xl py-1 shadow-2xl text-xs text-slate-200"
                >
                  {onEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onEdit(video);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Edit Details</span>
                    </button>
                  )}
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full px-3 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>{isDownloading ? 'Preparing...' : 'Download'}</span>
                  </button>
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onDelete(video);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-rose-950/40 text-rose-400 flex items-center gap-2 border-t border-white/[0.06]"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Delete Video</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {video.tags && video.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {video.tags.slice(0, 2).map((tag, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 bg-[#090A0F] border border-white/[0.06] rounded text-[10px] text-slate-400 flex items-center gap-0.5"
                >
                  <Tag className="w-2.5 h-2.5 text-indigo-400" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Metadata Footer */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2.5 pt-2 border-t border-white/[0.05] tabular-nums">
          <span>{progress > 0 ? `${progress}% watched` : 'Unwatched'}</span>
          <div className="flex items-center gap-2">
            {video.size ? <span>{formatFileSize(video.size)}</span> : null}
            <span>{video.playCount || 0} plays</span>
          </div>
        </div>
      </div>
    </div>
  );
};
