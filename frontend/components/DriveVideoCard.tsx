'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { IDriveVideo } from '../types';
import { Play, HardDrive } from 'lucide-react';

interface DriveVideoCardProps {
  video: IDriveVideo;
  onPlay?: (video: IDriveVideo) => void;
}

export const DriveVideoCard: React.FC<DriveVideoCardProps> = ({ video, onPlay }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return 'Video';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const hasB2CustomThumbnail = Boolean(video.thumbnailKey);
  const fileExt = video.originalFilename.split('.').pop()?.toUpperCase() || 'MP4';
  const watchHref = `/drive/watch/${video._id}`;

  return (
    <Link
      href={watchHref}
      onClick={() => {
        if (onPlay) onPlay(video);
      }}
      className="group relative bg-slate-900/80 hover:bg-slate-900 border border-slate-800/90 hover:border-amber-400/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-400/5 flex flex-col"
    >
      {/* 16:9 Thumbnail Area */}
      <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
        {/* Fallback Graphic */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-black flex flex-col items-center justify-center p-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <Play className="w-5 h-5 fill-amber-400/80 ml-0.5" />
          </div>
          <span className="text-xs text-slate-500 font-medium line-clamp-1 max-w-[85%]">
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
            className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Top Floating Badge (only if B2 Custom thumbnail exists) */}
        {hasB2CustomThumbnail && (
          <div className="absolute top-2.5 left-2.5 pointer-events-none">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-tight uppercase flex items-center gap-1 backdrop-blur-md shadow-sm bg-amber-400/95 text-black border border-amber-300">
              <HardDrive className="w-2.5 h-2.5" />
              <span>B2 Cover</span>
            </span>
          </div>
        )}

        {/* Duration Badge */}
        {formatDuration(video.duration) && (
          <div className="absolute bottom-2.5 right-2.5 pointer-events-none">
            <span className="px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono tabular-nums backdrop-blur-sm">
              {formatDuration(video.duration)}
            </span>
          </div>
        )}

        {/* Hover Center Play Button */}
        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-lg shadow-amber-400/40 transform scale-90 group-hover:scale-100 transition-all">
            <Play className="w-5 h-5 fill-black ml-0.5" />
          </div>
        </div>
      </div>

      {/* Clean Metadata Details (Zero-Pill Discipline) */}
      <div className="p-3.5 flex-1 flex flex-col justify-between">
        <div>
          <h3
            title={video.title}
            className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug tracking-tight"
          >
            {video.title}
          </h3>

          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>{formatFileSize(video.size)}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>{fileExt}</span>
            {hasB2CustomThumbnail && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-amber-400/90 font-sans font-medium">B2 Synced</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};
