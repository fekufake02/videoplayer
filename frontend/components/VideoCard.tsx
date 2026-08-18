'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { IVideo } from '../types';
import { Play, Heart, MoreVertical, Clock, Download, Edit3, Trash2, Tag } from 'lucide-react';
import { api } from '../lib/api';
import { generateAndUploadThumbnail } from '../lib/thumbnailGenerator';

interface VideoCardProps {
  video: IVideo;
  onEdit?: (video: IVideo) => void;
  onDelete?: (video: IVideo) => void;
  onFavoriteToggle?: (id: string, isFav: boolean) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  onEdit,
  onDelete,
  onFavoriteToggle,
}) => {
  const [isFavorite, setIsFavorite] = useState(video.favorite);
  const [showMenu, setShowMenu] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (!streamUrl) {
      api.getStreamUrl(video._id).then((res) => {
        if (res?.streamUrl) setStreamUrl(res.streamUrl);
      }).catch(() => {});
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
        a.download = video.originalFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const progress = calculateProgress();

  return (
    <div className="group relative glass-panel rounded-2xl overflow-hidden hover:border-indigo-500/40 transition-all duration-300 flex flex-col shadow-lg">
      {/* Thumbnail Container */}
      <Link
        href={`/watch/${video._id}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsHovered(false)}
        className="relative aspect-video bg-zinc-950 overflow-hidden flex items-center justify-center"
      >
        {/* Static B2 WebP Thumbnail */}
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : isHovered && streamUrl ? (
          <video
            src={`${streamUrl}#t=0.5`}
            preload="metadata"
            muted
            playsInline
            onLoadedData={async (e) => {
              // Auto-generate WebP thumbnail for existing videos without a thumbnailKey
              if (!video.thumbnailKey) {
                try {
                  const key = await generateAndUploadThumbnail(streamUrl, video.originalFilename);
                  if (key) {
                    await api.attachThumbnail(video._id, key);
                  }
                } catch (err) {}
              }
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:border-amber-400/50 group-hover:text-amber-400 transition-colors">
              <Play className="w-4 h-4 fill-current translate-x-0.5" />
            </div>
            <span className="text-[11px] text-zinc-500 font-mono truncate max-w-[180px]">
              {video.originalFilename}
            </span>
          </div>
        )}

        {/* Hover Dark Overlay & Center Play Button */}
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-xl group-hover:scale-110 group-hover:bg-amber-300 transition-all">
            <Play className="w-5 h-5 fill-current translate-x-0.5" />
          </div>
        </div>

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
          <button
            onClick={handleToggleFavorite}
            className="pointer-events-auto p-1.5 rounded-full bg-slate-950/60 backdrop-blur-md text-slate-300 hover:text-rose-400 transition-colors"
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>

          <span className="px-2 py-0.5 rounded-md bg-slate-950/75 backdrop-blur-md text-[11px] font-mono text-slate-300 flex items-center gap-1 border border-slate-800/80">
            <Clock className="w-3 h-3 text-slate-400" />
            {formatDuration(video.duration)}
          </span>
        </div>

        {/* Bottom Playback Progress Bar */}
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </Link>

      {/* Card Content Body */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <Link
              href={`/watch/${video._id}`}
              className="font-semibold text-sm text-slate-100 line-clamp-1 hover:text-indigo-400 transition-colors"
              title={video.title}
            >
              {video.title}
            </Link>

            {/* Context Actions */}
            <div className="flex items-center gap-1">
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit(video);
                  }}
                  title="Edit title & details"
                  className="p-1 text-zinc-400 hover:text-amber-400 rounded-lg hover:bg-zinc-800/80 transition-all"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMenu((prev) => !prev);
                }}
                className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/80 transition-all"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Menu Dropdown */}
              {showMenu && (
                <div
                  onMouseLeave={() => setShowMenu(false)}
                  className="absolute right-0 top-6 z-30 w-36 glass-panel bg-slate-900 border border-slate-800 rounded-xl py-1 shadow-2xl text-xs"
                >
                  {onEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onEdit(video);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Details
                    </button>
                  )}
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {isDownloading ? 'Preparing...' : 'Download'}
                  </button>
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onDelete(video);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-rose-950/40 text-rose-400 flex items-center gap-2 border-t border-slate-800/80"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {video.tags && video.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {video.tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-slate-900/90 border border-slate-800 rounded-md text-[10px] text-slate-400 flex items-center gap-1"
                >
                  <Tag className="w-2.5 h-2.5 text-indigo-400" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Progress % & Plays Footer */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-2.5 border-t border-slate-800/50">
          <span>{progress > 0 ? `${progress}% watched` : 'Unwatched'}</span>
          <span>{video.playCount || 0} plays</span>
        </div>
      </div>
    </div>
  );
};
