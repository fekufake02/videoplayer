'use client';

import React, { useState, useRef } from 'react';
import { api } from '../lib/api';
import { UploadCloud, X, FileVideo, CheckCircle2, AlertCircle } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState('');
  const [error, setError] = useState('');

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const startTimeRef = useRef<number>(0);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      if (!title) {
        // Strip extension from filename for default title
        const nameWithoutExt = selected.name.substring(0, selected.name.lastIndexOf('.')) || selected.name;
        setTitle(nameWithoutExt);
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleStartUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setIsUploading(true);
    setError('');
    setProgress(0);
    setUploadedBytes(0);
    setTotalBytes(file.size);

    try {
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);

      // Step 1: Initiate upload with backend to get presigned B2 upload URL
      const initRes = await api.initiateUpload({
        title: title.trim(),
        filename: file.name,
        mimeType: file.type || 'video/mp4',
        size: file.size,
        tags: tagList,
        notes: notes.trim(),
      });

      const { uploadUrl, storageKey } = initRes;

      // Step 2: Upload directly to Backblaze B2 with XMLHttpRequest to track progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        startTimeRef.current = Date.now();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setProgress(percent);
            setUploadedBytes(event.loaded);
            setTotalBytes(event.total);

            // Calculate Speed
            const elapsedTimeInSeconds = (Date.now() - startTimeRef.current) / 1000;
            if (elapsedTimeInSeconds > 0) {
              const bytesPerSec = event.loaded / elapsedTimeInSeconds;
              setUploadSpeed(`${formatSize(bytesPerSec)}/s`);
            }
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`B2 Upload failed with HTTP status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during B2 upload.'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload cancelled.'));
        });

        xhr.open('PUT', uploadUrl, true);
        xhr.send(file);
      });

      // Step 3: Tell Express backend upload completed to create MongoDB document
      await api.completeUpload({
        title: title.trim(),
        originalFilename: file.name,
        storageKey,
        mimeType: file.type || 'video/mp4',
        size: file.size,
        tags: tagList,
        notes: notes.trim(),
      });

      setIsUploading(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Upload process failed:', err);
      setError(err.message || 'Upload failed');
      setIsUploading(false);
    }
  };

  const handleCancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
    }
    setIsUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel max-w-lg w-full rounded-2xl p-6 shadow-2xl border border-slate-800">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-indigo-400" />
            Upload Video
          </h3>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 mb-4 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleStartUpload} className="space-y-4">
          {/* File Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Video File
            </label>
            <div className="relative border-2 border-dashed border-slate-700/80 hover:border-indigo-500/60 rounded-xl p-6 text-center bg-slate-900/60 transition-all">
              <input
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <FileVideo className="w-8 h-8 mx-auto mb-2 text-indigo-400" />
              {file ? (
                <div className="text-xs text-slate-200">
                  <span className="font-semibold text-indigo-300 block line-clamp-1">{file.name}</span>
                  <span className="text-slate-400">{formatSize(file.size)}</span>
                </div>
              ) : (
                <div className="text-xs text-slate-400">
                  <span className="text-indigo-400 font-medium">Click to choose</span> or drag and drop video
                  <span className="block text-[10px] text-slate-500 mt-1">MP4, WebM, MOV, MKV</span>
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Title</label>
            <input
              type="text"
              required
              placeholder="e.g. My Private Course Lesson 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isUploading}
              className="w-full px-3.5 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Tags (Comma-separated)</label>
            <input
              type="text"
              placeholder="e.g. tutorial, course, personal"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={isUploading}
              className="w-full px-3.5 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Notes (Optional)</label>
            <textarea
              rows={2}
              placeholder="Add personal notes or description..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isUploading}
              className="w-full px-3.5 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Upload Progress Status Bar */}
          {isUploading && (
            <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-white">
                <span>Uploading to Backblaze B2...</span>
                <span className="font-mono text-indigo-400">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>{formatSize(uploadedBytes)} / {formatSize(totalBytes)}</span>
                <span>{uploadSpeed}</span>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {isUploading ? (
              <button
                type="button"
                onClick={handleCancelUpload}
                className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold rounded-xl border border-rose-500/30 transition-all"
              >
                Cancel Upload
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!file || !title.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition-all"
                >
                  Start Upload
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
