'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { IDriveVideo } from '../types';
import { Play, Heart, MoreVertical, ExternalLink, Download, Cloud } from 'lucide-react';

interface DriveVideoCardProps {
  video: IDriveVideo;
  onPlay?: (video: IDriveVideo) => void;
  onFavoriteToggle?: (id: string, isFav: boolean) => void;
}

export const DriveVideoCard: React.FC<DriveVideoCardProps> = ({ video, onPlay, onFavoriteToggle }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isFavorite, setIsFavorite] = useState(Boolean(video.favorite));
  const [showMenu, setShowMenu] = useState(false);

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !isFavorite;
    setIsFavorite(next);
    if (onFavoriteToggle) onFavoriteToggle(video._id, next);
  };

  const watchHref = `/drive/watch/${video._id}`;

  return (
    <div
      id={`drive-video-card-${video._id}`}
      className="group relative bg-[#131620] border border-white/[0.07] rounded-xl overflow-hidden transition-all duration-200 flex flex-col hover:bg-[#191D29] hover:border-white/[0.14] select-none"
    >
      {/* Thumbnail Container */}
      <Link
        href={watchHref}
        onClick={() => {
          if (onPlay) onPlay(video);
        }}
        className="relative aspect-video bg-[#090A0F] overflow-hidden flex items-center justify-center cursor-pointer"
      >
        {/* Fallback Graphic */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0E1017] via-[#131620] to-[#090A0F] flex flex-col items-center justify-center p-3 text-center">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
            <Cloud className="w-5 h-5 text-indigo-400" />
          </div>
          <span className="text-[11px] text-slate-500 font-medium line-clamp-1 max-w-[85%]">
            {video.title}
          </span>
        </div>

        {/* Thumbnail Image */}
        {video.thumbnailUrl && !imageError && (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            referrerPolicy="no-referrer"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Hover Center Play Button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-lg transform scale-95 group-hover:scale-100 transition-transform">
            <Play className="w-4 h-4 fill-current translate-x-0.5" />
          </div>
        </div>

        {/* Top Badges: Drive Source Badge (Left) & Favorite (Right) */}
        <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none z-10">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 backdrop-blur-md">
            Drive
          </span>

          <button
            onClick={handleToggleFavorite}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className="pointer-events-auto p-1.5 rounded-lg bg-black/60 backdrop-blur-md text-slate-300 hover:text-rose-400 transition-colors"
          >
            <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>
        </div>

        {/* Duration Badge Bottom-Right */}
        <div className="absolute bottom-2 right-2 pointer-events-none z-10">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-slate-200 bg-black/80 backdrop-blur-md border border-white/10 tabular-nums">
            {formatDuration(video.duration)}
          </span>
        </div>
      </Link>

      {/* Card Content Body */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-1.5 mb-1.5">
            <Link
              href={watchHref}
              onClick={() => {
                if (onPlay) onPlay(video);
              }}
              className="font-medium text-xs sm:text-sm text-slate-100 line-clamp-2 hover:text-indigo-400 transition-colors leading-snug"
              title={video.title}
            >
              {video.title}
            </Link>

            {/* Context Actions */}
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

              {/* Menu Dropdown */}
              {showMenu && (
                <div
                  onMouseLeave={() => setShowMenu(false)}
                  className="absolute right-0 top-6 z-30 w-40 bg-[#191D29] border border-white/[0.08] rounded-xl py-1 shadow-2xl text-xs text-slate-200"
                >
                  <a
                    href={video.driveViewUrl || `https://drive.google.com/file/d/${video.driveFileId}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    <span>Open in Drive</span>
                  </a>
                  <a
                    href={`/api/drive/videos/${video.driveFileId}/chunk-stream`}
                    download={video.originalFilename || 'video.mp4'}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2 border-t border-white/[0.06]"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Download Stream</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Metadata Footer */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2.5 pt-2 border-t border-white/[0.05] tabular-nums">
          <span>Synced File</span>
          <span>{formatFileSize(video.size)}</span>
        </div>
      </div>
    </div>
  );
};
