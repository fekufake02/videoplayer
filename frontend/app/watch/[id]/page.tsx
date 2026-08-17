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
} from 'lucide-react';

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
        setStreamUrl(streamRes.streamUrl);
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 space-y-6">
        {loadingMedia ? (
          <div className="w-full aspect-video bg-slate-900 rounded-2xl flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-slate-400">Loading private stream...</span>
            </div>
          </div>
        ) : error ? (
          <div className="glass-panel p-12 rounded-2xl text-center flex flex-col items-center justify-center border border-rose-900/40">
            <AlertCircle className="w-10 h-10 text-rose-400 mb-3" />
            <h3 className="text-base font-semibold text-white mb-1">Error Loading Video</h3>
            <p className="text-xs text-slate-400 mb-4">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
            >
              Return to Library
            </button>
          </div>
        ) : video && streamUrl ? (
          <>
            {/* Player */}
            <VideoPlayer video={video} streamUrl={streamUrl} />

            {/* Video Details & Meta Header */}
            <div className="glass-panel p-6 rounded-2xl space-y-6 border border-slate-800">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-slate-800">
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
                    {video.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
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
                <div className="flex items-center gap-2">
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
