'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../lib/api';
import { IVideo } from '../../../types';
import { Navbar } from '../../../components/Navbar';
import { VideoPlayer } from '../../../components/VideoPlayer';
import { EditMetadataModal } from '../../../components/EditMetadataModal';
import { DeleteConfirmModal } from '../../../components/DeleteConfirmModal';
import {
  Heart,
  Download,
  Edit3,
  Trash2,
  Calendar,
  HardDrive,
  Clock,
  Eye,
  Tag,
  FileText,
  AlertCircle,
  RotateCcw,
  Check,
  Sparkles,
  Camera,
  Image as ImageIcon,
  ArrowLeft,
} from 'lucide-react';
import { reprocessSingleVideoThumbnail } from '../../../lib/thumbnailGenerator';

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { isAuthenticated, isLoading } = useAuth();

  const [video, setVideo] = useState<IVideo | null>(null);
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [loadingMedia, setLoadingMedia] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const [editingVideo, setEditingVideo] = useState<IVideo | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<IVideo | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Thumbnail Sync State
  const [thumbnailTimestamp, setThumbnailTimestamp] = useState<number>(15);
  const [isSyncingThumbnail, setIsSyncingThumbnail] = useState<boolean>(false);
  const [thumbnailSuccessMsg, setThumbnailSuccessMsg] = useState<string>('');
  const [thumbnailErrorMsg, setThumbnailErrorMsg] = useState<string>('');

  const fetchVideoAndStream = async () => {
    if (!id) return;
    setLoadingMedia(true);
    setError('');

    try {
      const [detailsRes, streamRes] = await Promise.all([
        api.getVideoDetails(id),
        api.getStreamUrl(id),
      ]);

      if (detailsRes.success && streamRes.success) {
        setVideo(detailsRes.video);
        const sampleStreams = [
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
        ];
        const hashNum = (id || 'vid').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const fallback = sampleStreams[hashNum % sampleStreams.length];

        const streamUrlCandidate = streamRes.streamUrl || detailsRes.video.streamUrl;
        const resolvedStream = (streamUrlCandidate && streamUrlCandidate.trim().length > 0)
          ? streamUrlCandidate
          : fallback;
        setStreamUrl(resolvedStream);
      }
    } catch (err: any) {
      console.error('Failed to load video media:', err);
      setError(err.message || 'Failed to load video stream');
    } finally {
      setLoadingMedia(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchVideoAndStream();
    }
  }, [id, isAuthenticated]);

  const handleToggleFavorite = async () => {
    if (!video) return;
    try {
      const res = await api.toggleFavorite(video._id);
      setVideo((prev) => (prev ? { ...prev, favorite: res.favorite } : null));
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleSyncThumbnail = async (timestampSec: number = thumbnailTimestamp, captureCurrent: boolean = false) => {
    if (!video || isSyncingThumbnail) return;
    setIsSyncingThumbnail(true);
    setThumbnailSuccessMsg('');
    setThumbnailErrorMsg('');

    try {
      // Find active video player element in DOM if playing
      const videoEl = document.querySelector('video') as HTMLVideoElement | null;
      const targetTime = captureCurrent && videoEl ? Math.floor(videoEl.currentTime) : timestampSec;

      const res = await reprocessSingleVideoThumbnail(
        video._id,
        video.originalFilename,
        targetTime,
        streamUrl,
        captureCurrent ? videoEl : null
      );

      if (res.success && res.thumbnailKey) {
        const newKey = res.thumbnailKey;
        setVideo((prev) =>
          prev
            ? {
                ...prev,
                thumbnailKey: newKey,
                blurhash: res.blurhash,
                thumbnailUrl: `/api/upload-receiver?key=${encodeURIComponent(newKey)}`,
              }
            : null
        );
        setThumbnailSuccessMsg(`Thumbnail updated! (${targetTime}s)`);
        setTimeout(() => setThumbnailSuccessMsg(''), 4000);
      } else {
        setThumbnailErrorMsg(res.error || 'Failed to capture frame from video');
        setTimeout(() => setThumbnailErrorMsg(''), 5000);
      }
    } catch (err: any) {
      console.error('Sync thumbnail error:', err);
      setThumbnailErrorMsg(err.message || 'Error updating video thumbnail');
      setTimeout(() => setThumbnailErrorMsg(''), 5000);
    } finally {
      setIsSyncingThumbnail(false);
    }
  };

  const handleDownload = async () => {
    if (!video) return;
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

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6">
        {/* Top Back Navigation Breadcrumb */}
        <div className="flex items-center justify-between px-1 sm:px-0">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-amber-400 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 px-3.5 py-2 rounded-xl transition-all shadow-sm group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Library</span>
          </button>
        </div>

        {loadingMedia ? (
          <>
            <div className="relative w-full aspect-video bg-black rounded-xl sm:rounded-2xl overflow-hidden border border-zinc-800/80 shadow-2xl flex flex-col items-center justify-center select-none">
              {/* Top Bar Shell */}
              <div className="absolute top-0 left-0 right-0 p-2 sm:p-4 flex items-center justify-between pointer-events-none opacity-60">
                <div className="h-6 w-16 bg-zinc-900 rounded-lg border border-zinc-800" />
                <div className="h-4 w-32 bg-zinc-900 rounded-md border border-zinc-800" />
                <div className="flex gap-1.5">
                  <div className="h-6 w-6 bg-zinc-900 rounded-lg border border-zinc-800" />
                  <div className="h-6 w-6 bg-zinc-900 rounded-lg border border-zinc-800" />
                </div>
              </div>

              {/* Center Golden Spinner */}
              <div className="flex flex-col items-center justify-center z-10">
                <div className="w-12 h-12 sm:w-16 sm:h-16 border-3 sm:border-4 border-zinc-800 border-t-amber-400 rounded-full animate-spin shadow-2xl" />
              </div>

              {/* Bottom Timeline Shell */}
              <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-4 space-y-2 pointer-events-none opacity-50">
                <div className="h-1.5 w-full bg-zinc-800 rounded-full" />
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <div className="h-5 w-5 bg-zinc-800 rounded-md" />
                    <div className="h-5 w-5 bg-zinc-800 rounded-md" />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-5 w-10 bg-zinc-800 rounded-md" />
                  </div>
                </div>
              </div>
            </div>

            {/* Video Details Skeleton Shell */}
            <div className="glass-panel p-4 sm:p-6 rounded-xl sm:rounded-2xl space-y-4 sm:space-y-6 border border-slate-800/80 animate-pulse">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 sm:pb-6 border-b border-slate-800/80">
                <div className="space-y-2.5">
                  <div className="h-6 w-64 bg-zinc-800 rounded-md" />
                  <div className="flex items-center gap-4">
                    <div className="h-4 w-24 bg-zinc-800/60 rounded" />
                    <div className="h-4 w-20 bg-zinc-800/60 rounded" />
                    <div className="h-4 w-16 bg-zinc-800/60 rounded" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-9 w-24 bg-zinc-800 rounded-xl" />
                  <div className="h-9 w-28 bg-zinc-800 rounded-xl" />
                </div>
              </div>
            </div>
          </>
        ) : error ? (
          <div className="glass-panel p-8 sm:p-12 rounded-xl sm:rounded-2xl text-center flex flex-col items-center justify-center border border-rose-900/40">
            <AlertCircle className="w-10 h-10 text-rose-400 mb-3" />
            <h3 className="text-base font-semibold text-white mb-1">Error Loading Video</h3>
            <p className="text-xs text-slate-400 mb-4">{error}</p>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Library</span>
            </button>
          </div>
        ) : video && streamUrl ? (
          <>
            {/* Player */}
            <VideoPlayer video={video} streamUrl={streamUrl} />

            {/* Video Details & Meta Header */}
            <div className="glass-panel p-4 sm:p-6 rounded-xl sm:rounded-2xl space-y-4 sm:space-y-6 border border-slate-800">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 sm:pb-6 border-b border-slate-800">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2">
                    {video.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-mono text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      {formatDate(video.createdAt)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                      {formatSize(video.size)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      {video.playCount || 0} plays
                    </span>
                  </div>
                </div>

                {/* Toolbar Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {thumbnailSuccessMsg && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-medium rounded-xl animate-fade-in">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{thumbnailSuccessMsg}</span>
                    </div>
                  )}

                  {thumbnailErrorMsg && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-medium rounded-xl animate-fade-in">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      <span>{thumbnailErrorMsg}</span>
                    </div>
                  )}

                  <button
                    onClick={handleToggleFavorite}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-medium transition-all ${
                      video.favorite
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${video.favorite ? 'fill-current' : ''}`} />
                    <span>Favorite</span>
                  </button>

                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-xl transition-all"
                  >
                    <Download className="w-4 h-4 text-indigo-400" />
                    <span>{isDownloading ? 'Preparing...' : 'Download'}</span>
                  </button>

                  {/* Sync Thumbnail with Timestamp Dropdown & Capture Current Frame */}
                  <div
                    className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5"
                    title="Regenerate thumbnail image at chosen timestamp"
                  >
                    <button
                      type="button"
                      disabled={isSyncingThumbnail}
                      onClick={() => handleSyncThumbnail(thumbnailTimestamp, false)}
                      className={`p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-amber-400 transition-all flex items-center gap-1 ${
                        isSyncingThumbnail ? 'text-amber-400 cursor-not-allowed' : ''
                      }`}
                      title={`Sync thumbnail at ${thumbnailTimestamp}s`}
                    >
                      <RotateCcw className={`w-4 h-4 ${isSyncingThumbnail ? 'animate-spin text-amber-400' : 'text-slate-300'}`} />
                    </button>
                    <select
                      value={thumbnailTimestamp}
                      disabled={isSyncingThumbnail}
                      onChange={(e) => {
                        const newTime = Number(e.target.value);
                        setThumbnailTimestamp(newTime);
                        handleSyncThumbnail(newTime, false);
                      }}
                      className="bg-transparent text-amber-400 text-xs font-semibold py-1.5 pr-2.5 pl-1 border-l border-slate-800/80 outline-none cursor-pointer hover:text-amber-300"
                      title="Select video timestamp for thumbnail"
                    >
                      <option value="5" className="bg-slate-900 text-slate-200">5s</option>
                      <option value="10" className="bg-slate-900 text-slate-200">10s</option>
                      <option value="15" className="bg-slate-900 text-amber-400 font-bold">15s (Default)</option>
                      <option value="20" className="bg-slate-900 text-slate-200">20s</option>
                      <option value="30" className="bg-slate-900 text-slate-200">30s</option>
                      <option value="45" className="bg-slate-900 text-slate-200">45s</option>
                      <option value="60" className="bg-slate-900 text-slate-200">60s</option>
                      <option value="90" className="bg-slate-900 text-slate-200">90s</option>
                    </select>

                    <button
                      type="button"
                      disabled={isSyncingThumbnail}
                      onClick={() => handleSyncThumbnail(thumbnailTimestamp, true)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 hover:text-amber-400 border-l border-slate-800/80 transition-colors"
                      title="Capture current video frame as thumbnail"
                    >
                      <Camera className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">Snap Frame</span>
                    </button>
                  </div>

                  <button
                    onClick={() => setEditingVideo(video)}
                    className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl transition-all"
                    title="Edit Metadata"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setDeletingVideo(video)}
                    className="p-2 bg-slate-900 border border-slate-800 hover:bg-rose-950/40 hover:border-rose-900/50 text-slate-400 hover:text-rose-400 rounded-xl transition-all"
                    title="Delete Video"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tags & Notes Body */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tags */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-400" />
                    Tags
                  </h4>
                  {video.tags && video.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {video.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-medium text-indigo-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No tags added.</p>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    Personal Notes
                  </h4>
                  {video.notes ? (
                    <p className="text-xs text-slate-300 bg-slate-900/70 p-3 rounded-xl border border-slate-800/80 whitespace-pre-wrap leading-relaxed">
                      {video.notes}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No personal notes added.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </main>

      {/* Edit & Delete Modals */}
      <EditMetadataModal
        video={editingVideo}
        onClose={() => setEditingVideo(null)}
        onSuccess={fetchVideoAndStream}
      />

      <DeleteConfirmModal
        video={deletingVideo}
        onClose={() => setDeletingVideo(null)}
        onSuccess={() => router.push('/')}
      />
    </div>
  );
}
