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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-border max-w-sm w-full rounded-2xl p-6 shadow-2xl text-center text-text-primary">
        <div className="w-11 h-11 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center mx-auto mb-4 text-danger">
          <AlertTriangle className="w-5 h-5" />
        </div>

        <h3 className="text-sm sm:text-base font-semibold text-text-primary mb-1.5">
          Delete &ldquo;{video.title}&rdquo;?
        </h3>

        <p className="text-xs text-text-secondary mb-4">
          This action is permanent and cannot be undone. This will permanently remove:
        </p>

        <ul className="text-left text-xs text-text-secondary bg-background-secondary p-3.5 rounded-lg border border-border space-y-2 mb-6">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
            <span>Master file from cloud storage</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
            <span>Generated timeline previews & thumbnails</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
            <span>Playback bookmarks and watch statistics</span>
          </li>
        </ul>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 py-2 bg-surface-elevated hover:bg-surface-hover text-text-secondary hover:text-text-primary text-xs font-medium rounded-lg border border-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 py-2 bg-danger hover:bg-danger/90 disabled:opacity-50 text-white text-xs font-medium rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeleting ? 'Deleting...' : 'Delete Video'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
