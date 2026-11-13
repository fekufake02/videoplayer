'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { IEmbedVideo } from '../types';
import { api } from '../lib/api';
import {
  Play,
  Heart,
  MoreVertical,
  Edit3,
  Trash2,
  ExternalLink,
  RefreshCw,
  Globe,
  Check,
  Link2,
} from 'lucide-react';

export interface EmbedVideoCardProps {
  video: IEmbedVideo;
  viewMode?: 'grid' | 'list';
  onEdit?: (video: IEmbedVideo) => void;
  onDelete?: (video: IEmbedVideo) => void;
  onRefresh?: (video: IEmbedVideo) => void;
  onFavoriteToggle?: (id: string, isFav: boolean) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const EmbedVideoCard: React.FC<EmbedVideoCardProps> = ({
  video,
  viewMode = 'grid',
  onEdit,
  onDelete,
  onRefresh,
  onFavoriteToggle,
}) => {
  const [isFavorite, setIsFavorite] = useState<boolean>(Boolean(video.favorite));
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(video.thumbnailUrl || null);
  const [triedProxy, setTriedProxy] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setThumbnailUrl(video.thumbnailUrl || null);
    setTriedProxy(false);
    setImageLoaded(false);
    setImageError(false);
    setIsFavorite(Boolean(video.favorite));
    setConfirmDelete(false);
  }, [video._id, video.thumbnailUrl, video.favorite]);

  useEffect(() => {
    if (!showMenu) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setConfirmDelete(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMenu(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showMenu]);

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !isFavorite;
    setIsFavorite(next);
    if (onFavoriteToggle) {
      onFavoriteToggle(video._id, next);
    } else {
      try {
        await api.updateEmbedMetadata(video._id, { favorite: next });
      } catch {
        setIsFavorite(!next);
      }
    }
  };

  const handleCopySource = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(video.sourceUrl);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2000);
    } catch {}
    setShowMenu(false);
  };

  const durationText = formatDuration(video.duration);

  return (
    <div
      id={`embed-video-card-${video._id}`}
      className={`group relative bg-[#131620] border border-white/[0.08] rounded-[14px] overflow-hidden transition-all duration-200 ${
        viewMode === 'list' ? 'flex flex-col sm:flex-row items-stretch' : 'flex flex-col'
      } hover:bg-[#191D29] hover:border-white/[0.14] select-none`}
    >
      {/* Thumbnail Preview Area */}
      <Link
        href={`/embeds/watch/${video._id}`}
        prefetch
        className={`relative ${
          viewMode === 'list' ? 'w-full sm:w-60 shrink-0 aspect-video' : 'aspect-video'
        } bg-[#090A0F] overflow-hidden flex items-center justify-center cursor-pointer`}
        aria-label={`Play ${video.title}`}
      >
        {!thumbnailUrl || imageError ? (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0E1017] via-[#131620] to-[#090A0F] flex flex-col items-center justify-center p-3 text-center">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
              <Globe className="w-5 h-5" />
            </div>
            <span className="text-[11px] text-[#73798B] font-medium line-clamp-1 max-w-[85%]">
              {video.platform || video.sourceDomain}
            </span>
          </div>
        ) : !imageLoaded ? (
          <div className="absolute inset-0 bg-[#131620] animate-pulse" />
        ) : null}

        {thumbnailUrl && !imageError && (
          <img
            src={thumbnailUrl}
            alt={video.title}
            referrerPolicy="no-referrer"
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              if (!triedProxy && thumbnailUrl.startsWith('http')) {
                setTriedProxy(true);
                setImageLoaded(false);
                setThumbnailUrl(`/api/stream-proxy?url=${encodeURIComponent(thumbnailUrl)}`);
              } else {
                setImageError(true);
              }
            }}
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-200 group-hover:scale-[1.025] ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Scrim & Hover Center Play */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30 pointer-events-none" />
        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center pointer-events-none">
          <div className="w-11 h-11 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-lg transform scale-95 group-hover:scale-100 transition-transform">
            <Play className="w-4 h-4 fill-current translate-x-0.5" />
          </div>
        </div>

        {/* Top Row: Platform Label (Left) & Favorite Button (Right) */}
        <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none z-10">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold backdrop-blur-md bg-black/65 text-slate-200 border border-white/15 truncate max-w-[130px]">
            {video.platform}
          </span>
          <button
            type="button"
            onClick={handleToggleFavorite}
            className="pointer-events-auto p-1.5 rounded-lg bg-black/60 backdrop-blur-md text-[#A1A6B5] hover:text-rose-400 transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center cursor-pointer"
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>
        </div>

        {/* Bottom-Right Duration / Mode */}
        <div className="absolute bottom-2 right-2 pointer-events-none z-10 flex items-center gap-1.5">
          {durationText && (
            <span className="px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-mono tabular-nums backdrop-blur-md border border-white/10">
              {durationText}
            </span>
          )}
        </div>
      </Link>

      {/* Card Body */}
      <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/embeds/watch/${video._id}`}
              prefetch
              className="block text-sm font-semibold text-[#F4F5FA] hover:text-indigo-300 transition-colors line-clamp-2 leading-snug"
              title={video.title}
            >
              {video.title}
            </Link>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#73798B] truncate">
              <span className="truncate">{video.sourceDomain || video.platform}</span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">
                {video.playbackType === 'direct'
                  ? 'Direct Preview'
                  : video.playbackType === 'hybrid'
                    ? 'Embed + Preview'
                    : 'Embed Mode'}
              </span>
            </div>
          </div>

          {/* Card Menu */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowMenu((prev) => !prev);
                setConfirmDelete(false);
              }}
              className="p-1.5 rounded-lg text-[#73798B] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label="Embed video actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 bottom-full mb-1 w-48 bg-[#191D29] border border-white/[0.1] rounded-xl py-1 shadow-2xl text-xs z-40 animate-fade-in text-slate-200">
                <Link
                  href={`/embeds/watch/${video._id}`}
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.06] transition-colors"
                >
                  <Play className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Play in Embed Mode</span>
                </Link>

                {onEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowMenu(false);
                      onEdit(video);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.06] text-left transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Edit Details</span>
                  </button>
                )}

                {onRefresh && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowMenu(false);
                      onRefresh(video);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.06] text-left transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Re-fetch Metadata</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopySource}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.06] text-left transition-colors cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy Original URL</span>
                </button>

                <a
                  href={video.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.06] transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  <span>Open Original Source</span>
                </a>

                {onDelete && (
                  <div className="border-t border-white/[0.07] mt-1 pt-1">
                    {!confirmDelete ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setConfirmDelete(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-rose-500/15 text-rose-400 text-left transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Embed</span>
                      </button>
                    ) : (
                      <div className="px-3 py-1.5 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowMenu(false);
                            onDelete(video);
                          }}
                          className="flex-1 py-1 px-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setConfirmDelete(false);
                          }}
                          className="py-1 px-2 bg-white/[0.08] hover:bg-white/[0.12] text-slate-300 rounded text-[11px] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer stats line — clean unboxed tabular metadata */}
        <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#73798B] tabular-nums">
          <span className="truncate">
            {copiedNotice
              ? 'Link copied'
              : video.tags && video.tags.length > 0
                ? video.tags.slice(0, 2).join(' · ')
                : new Date(video.createdAt).toLocaleDateString()}
          </span>
          <span className="shrink-0 font-mono flex items-center gap-1">
            {copiedNotice && <Check className="w-3 h-3 text-emerald-400" />}
            <span>{video.playCount || 0} plays</span>
          </span>
        </div>
      </div>
    </div>
  );
};
