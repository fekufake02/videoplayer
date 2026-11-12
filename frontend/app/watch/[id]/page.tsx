'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../lib/api';
import { IVideo } from '../../../types';
import dynamic from 'next/dynamic';
import { Navbar } from '../../../components/Navbar';
const VideoPlayer = dynamic(() => import('../../../components/VideoPlayer').then((mod) => mod.VideoPlayer), {
  ssr: false,
});
import { EditMetadataModal } from '../../../components/EditMetadataModal';
import { DeleteConfirmModal } from '../../../components/DeleteConfirmModal';
import { VideoSuggestions } from '../../../components/VideoSuggestions';
import {
  Heart,
  Download,
  Edit3,
  Trash2,
  Calendar,
  HardDrive,
  Eye,
  Tag,
  FileText,
  AlertCircle,
  RotateCcw,
  Check,
  Camera,
  ArrowLeft,
  FolderLock,
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
      const videoEl = document.querySelector('video') as HTMLVideoElement | null;
      const targetTime = captureCurrent && videoEl ? Math.floor(videoEl.currentTime) : timestampSec;

      const res = await reprocessSingleVideoThumbnail(
        video._id,
        video.originalFilename,
        targetTime,
        streamUrl,
        videoEl
      );

      if (res.success && res.thumbnailKey) {
        const newKey = res.thumbnailKey;
        setVideo((prev) =>
          prev
            ? {
                ...prev,
                thumbnailKey: newKey,
                blurhash: res.blurhash,
                thumbnailUrl: res.thumbnailUrl || prev?.thumbnailUrl,
              }
            : null
        );
        setThumbnailSuccessMsg(`Thumbnail updated at ${targetTime}s!`);
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
      <div className="min-h-screen flex items-center justify-center bg-[#090A0F]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F] text-[#F4F5F8] font-sans">
      <Navbar />

      <main className="flex-1 max-w-[1500px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Top Header Row with Breadcrumb */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-[#131620] hover:bg-[#191D29] border border-white/[0.07] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Library</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-400/15 text-amber-300 border border-amber-400/30">
              Vault Storage (B2)
            </span>
          </div>
        </div>

        {loadingMedia ? (
          <div className="w-full aspect-video bg-[#131620] rounded-xl overflow-hidden border border-white/[0.07] shadow-2xl flex items-center justify-center animate-pulse">
            <div className="w-10 h-10 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-[#131620] border border-white/[0.07] p-8 sm:p-12 rounded-xl text-center flex flex-col items-center justify-center shadow-xl">
            <AlertCircle className="w-10 h-10 text-rose-400 mb-3" />
            <h3 className="text-sm font-semibold text-white mb-1">Error Loading Video</h3>
            <p className="text-xs text-slate-400 mb-4">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg cursor-pointer inline-flex items-center gap-2 transition-all shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Library</span>
            </button>
          </div>
        ) : video && streamUrl ? (
          <>
            {/* Cinematic Video Player */}
            <VideoPlayer video={video} streamUrl={streamUrl} />

            {/* Video Details & Meta Header */}
            <div className="bg-[#131620] border border-white/[0.07] p-4 sm:p-6 rounded-xl space-y-4 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-white/[0.07]">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2">
                    {video.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 tabular-nums">
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

                {/* Toolbar Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {thumbnailSuccessMsg && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-medium rounded-lg animate-fade-in">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{thumbnailSuccessMsg}</span>
                    </div>
                  )}

                  {thumbnailErrorMsg && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-medium rounded-lg animate-fade-in">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      <span>{thumbnailErrorMsg}</span>
                    </div>
                  )}

                  {/* Favorite Button */}
                  <button
                    onClick={handleToggleFavorite}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      video.favorite
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                        : 'bg-[#191D29] border-white/[0.07] text-slate-300 hover:bg-white/[0.08]'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${video.favorite ? 'fill-current' : ''}`} />
                    <span>Favorite</span>
                  </button>

                  {/* Download Button */}
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#191D29] border border-white/[0.07] hover:bg-white/[0.08] text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{isDownloading ? 'Preparing...' : 'Download'}</span>
                  </button>

                  {/* Sync Thumbnail with Timestamp Picker */}
                  <div
                    className="flex items-center bg-[#191D29] border border-white/[0.07] rounded-lg p-0.5"
                    title="Regenerate thumbnail image at chosen timestamp"
                  >
                    <button
                      type="button"
                      disabled={isSyncingThumbnail}
                      onClick={() => handleSyncThumbnail(thumbnailTimestamp, false)}
                      className={`p-1.5 hover:bg-white/[0.08] rounded-md text-slate-300 hover:text-indigo-300 transition-colors flex items-center gap-1 ${
                        isSyncingThumbnail ? 'text-indigo-400 cursor-not-allowed' : ''
                      }`}
                      title={`Sync thumbnail at ${thumbnailTimestamp}s`}
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${isSyncingThumbnail ? 'animate-spin text-indigo-400' : 'text-slate-300'}`} />
                    </button>
                    <select
                      value={thumbnailTimestamp}
                      disabled={isSyncingThumbnail}
                      onChange={(e) => {
                        const newTime = Number(e.target.value);
                        setThumbnailTimestamp(newTime);
                        handleSyncThumbnail(newTime, false);
                      }}
                      className="bg-transparent text-indigo-300 text-xs font-medium py-1 pr-2 pl-1 border-l border-white/[0.07] outline-none cursor-pointer"
                      title="Select video timestamp for thumbnail"
                    >
                      <option value="5" className="bg-[#191D29] text-slate-200">5s</option>
                      <option value="10" className="bg-[#191D29] text-slate-200">10s</option>
                      <option value="15" className="bg-[#191D29] text-indigo-300 font-bold">15s (Default)</option>
                      <option value="20" className="bg-[#191D29] text-slate-200">20s</option>
                      <option value="30" className="bg-[#191D29] text-slate-200">30s</option>
                      <option value="45" className="bg-[#191D29] text-slate-200">45s</option>
                      <option value="60" className="bg-[#191D29] text-slate-200">60s</option>
                    </select>

                    <button
                      type="button"
                      disabled={isSyncingThumbnail}
                      onClick={() => handleSyncThumbnail(thumbnailTimestamp, true)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-300 hover:text-white border-l border-white/[0.07] transition-colors cursor-pointer"
                      title="Capture current video frame as thumbnail"
                    >
                      <Camera className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="hidden sm:inline">Snap</span>
                    </button>
                  </div>

                  {/* Edit Metadata */}
                  <button
                    onClick={() => setEditingVideo(video)}
                    className="p-2 bg-[#191D29] border border-white/[0.07] hover:bg-white/[0.08] text-slate-300 rounded-lg transition-colors cursor-pointer"
                    title="Edit Metadata"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setDeletingVideo(video)}
                    className="p-2 bg-[#191D29] border border-white/[0.07] hover:bg-rose-950/40 hover:border-rose-800/40 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                    title="Delete Video"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Tags & Personal Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <h4 className="font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Tags</span>
                  </h4>
                  {video.tags && video.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {video.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-[#090A0F] border border-white/[0.06] rounded text-[11px] font-medium text-indigo-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">No tags specified.</p>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Personal Notes</span>
                  </h4>
                  {video.notes ? (
                    <p className="text-slate-300 bg-[#090A0F] p-3 rounded-lg border border-white/[0.06] whitespace-pre-wrap leading-relaxed">
                      {video.notes}
                    </p>
                  ) : (
                    <p className="text-slate-500 italic">No personal notes added.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Suggested Videos Below Player */}
            <VideoSuggestions currentVideoId={video._id} />
          </>
        ) : null}
      </main>

      {/* Modals */}
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
