'use client';

import React, { useState } from 'react';
import { IDriveVideo } from '../types';
import {
  Play,
  Image as ImageIcon,
  ExternalLink,
  HardDrive,
  Check,
  Copy,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { generateAndUploadDriveThumbnail } from '../lib/thumbnailGenerator';

interface DriveVideoCardProps {
  video: IDriveVideo;
  onPlay: (video: IDriveVideo) => void;
  onChangeThumbnail: (video: IDriveVideo) => void;
  onThumbnailUpdated?: (video: IDriveVideo) => void;
}

export const DriveVideoCard: React.FC<DriveVideoCardProps> = ({
  video,
  onPlay,
  onChangeThumbnail,
  onThumbnailUpdated,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isGenerating20s, setIsGenerating20s] = useState(false);
  const [currentThumbUrl, setCurrentThumbUrl] = useState<string | undefined>(video.thumbnailUrl);

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return 'Drive Stream';
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

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const driveUrl = video.driveViewUrl || `https://drive.google.com/file/d/${video.driveFileId}/view`;
    navigator.clipboard.writeText(driveUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleQuick20sGeneration = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsGenerating20s(true);
    try {
      const streamUrl = `/api/drive/videos/${video.driveFileId}/chunk-stream`;
      const res = await generateAndUploadDriveThumbnail(
        streamUrl,
        video.originalFilename,
        video.driveFileId,
        20
      );
      if (res?.thumbnailUrl || res?.thumbnailKey) {
        const updated = {
          ...video,
          thumbnailKey: res.thumbnailKey,
          thumbnailUrl: res.thumbnailUrl || currentThumbUrl,
        };
        if (res.thumbnailUrl) {
          setCurrentThumbUrl(res.thumbnailUrl);
        }
        if (onThumbnailUpdated) {
          onThumbnailUpdated(updated);
        }
      }
    } catch (err) {
      console.warn('Quick 20s thumbnail generation warning, opening modal instead:', err);
      onChangeThumbnail(video);
    } finally {
      setIsGenerating20s(false);
    }
  };

  const hasB2CustomThumbnail = Boolean(video.thumbnailKey);

  return (
    <div
      onClick={() => onPlay(video)}
      className="group relative bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40 flex flex-col"
    >
      {/* 16:9 Thumbnail Area */}
      <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
        {/* Fallback Graphic */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-950 flex flex-col items-center justify-center p-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <Play className="w-5 h-5 fill-amber-400/80 ml-0.5" />
          </div>
          <span className="text-xs text-slate-400 font-medium line-clamp-1 max-w-[80%]">
            {video.title}
          </span>
        </div>

        {/* Thumbnail Image */}
        {currentThumbUrl && !imageError && (
          <img
            src={currentThumbUrl}
            alt={video.title}
            referrerPolicy="no-referrer"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Top Floating Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
          {/* Storage Badge */}
          <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-tight uppercase flex items-center gap-1 backdrop-blur-md shadow-sm ${
              hasB2CustomThumbnail
                ? 'bg-amber-400/90 text-black border border-amber-300'
                : 'bg-slate-900/80 text-slate-300 border border-slate-700'
            }`}
          >
            {hasB2CustomThumbnail ? (
              <>
                <HardDrive className="w-2.5 h-2.5" />
                <span>B2 Custom</span>
              </>
            ) : (
              <span>Drive Preview</span>
            )}
          </span>

          {/* Duration Badge if present */}
          {formatDuration(video.duration) && (
            <span className="px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-mono tabular-nums">
              {formatDuration(video.duration)}
            </span>
          )}
        </div>

        {/* Hover Center Play Button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-lg shadow-amber-400/40 transform scale-90 group-hover:scale-100 transition-all">
            <Play className="w-5 h-5 fill-black ml-0.5" />
          </div>
        </div>
      </div>

      {/* Content & Actions */}
      <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
        <div>
          <h3
            title={video.title}
            className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug"
          >
            {video.title}
          </h3>

          {/* Clean Unboxed Metadata (Zero Pill Rule) */}
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400 font-mono tabular-nums">
            <span>{formatFileSize(video.size)}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>{video.originalFilename.split('.').pop()?.toUpperCase() || 'VIDEO'}</span>
            {hasB2CustomThumbnail ? (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-amber-400 font-sans font-medium">B2 Synced</span>
              </>
            ) : (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-500 font-sans">Default 20s ready</span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
          {/* Quick 20s B2 Cover or Change Thumbnail */}
          {!hasB2CustomThumbnail ? (
            <button
              onClick={handleQuick20sGeneration}
              disabled={isGenerating20s}
              title="Auto-extract frame at 20 seconds and store in Backblaze B2"
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 text-xs font-semibold rounded-xl border border-amber-400/30 transition-all active:scale-95 disabled:opacity-50"
            >
              {isGenerating20s ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{isGenerating20s ? 'Saving B2...' : 'Set 20s Cover'}</span>
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChangeThumbnail(video);
              }}
              title="Edit custom Backblaze B2 thumbnail"
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700/60 transition-all active:scale-95"
            >
              <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
              <span>Change Cover</span>
            </button>
          )}

          <button
            onClick={handleCopyLink}
            title={copiedLink ? 'Drive link copied!' : 'Copy Drive public link'}
            className="p-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl border border-slate-700/60 transition-all"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <a
            href={video.driveViewUrl || `https://drive.google.com/file/d/${video.driveFileId}/view`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open in Google Drive"
            className="p-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-amber-400 rounded-xl border border-slate-700/60 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
