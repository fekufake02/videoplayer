'use client';

import React, { useState } from 'react';
import { IVideo } from '../types';
import { api } from '../lib/api';
import { Trash2, AlertTriangle } from 'lucide-react';

interface DeleteConfirmModalProps {
  video: IVideo | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  video,
  onClose,
  onSuccess,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!video) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await api.deleteVideo(video._id);
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to delete video:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel max-w-sm w-full rounded-2xl p-6 shadow-2xl border border-rose-900/40 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4 text-rose-400">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <h3 className="text-base font-bold text-white mb-2">Delete &ldquo;{video.title}&rdquo;?</h3>

        <p className="text-xs text-slate-400 mb-4">
          This action is permanent and cannot be undone. This will delete:
        </p>

        <ul className="text-left text-xs text-slate-300 bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1 mb-6">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Original video file from Backblaze B2
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Associated thumbnail
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            All playback history and metadata
          </li>
        </ul>

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};
