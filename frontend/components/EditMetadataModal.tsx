'use client';

import React, { useState, useEffect } from 'react';
import { IVideo } from '../types';
import { api } from '../lib/api';
import { Edit3, X, Tag } from 'lucide-react';

interface EditMetadataModalProps {
  video: IVideo | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditMetadataModal: React.FC<EditMetadataModalProps> = ({
  video,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (video) {
      setTitle(video.title || '');
      setTags(video.tags ? video.tags.join(', ') : '');
      setNotes(video.notes || '');
    }
  }, [video]);

  if (!video) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
      await api.updateVideoMetadata(video._id, {
        title: title.trim(),
        tags: tagList,
        notes: notes.trim(),
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to update video metadata:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-border max-w-md w-full rounded-2xl p-6 shadow-2xl text-text-primary">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-accent" />
            Edit Video Details
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Tags (Comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tutorial, reference, lecture"
              className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add personal notes or annotations..."
              className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-surface-elevated hover:bg-surface-hover text-text-secondary hover:text-text-primary text-xs font-medium rounded-lg border border-border transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-xs font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
