'use client';

import React, { useState, useRef } from 'react';
import { api } from '../lib/api';
import { generateAndUploadThumbnail } from '../lib/thumbnailGenerator';
import { UploadCloud, X, FileVideo, CheckCircle2, AlertCircle, Trash2, Layers } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadItem {
  id: string;
  file: File;
  title: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState('');

  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Reset state whenever upload modal is opened or closed
  React.useEffect(() => {
    if (isOpen) {
      setItems([]);
      setError('');
      setIsUploading(false);
      setCurrentIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      const newItems: UploadItem[] = selectedFiles.map((file) => {
        const nameWithoutExt =
          file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        return {
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          title: nameWithoutExt,
          progress: 0,
          status: 'pending',
        };
      });
      setItems((prev) => [...prev, ...newItems]);
      setError('');
    }
  };

  const removeItem = (id: string) => {
    if (isUploading) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItemTitle = (id: string, newTitle: string) => {
    if (isUploading) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title: newTitle } : item))
    );
  };

  const handleStartBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0 || isUploading) return;

    setIsUploading(true);
    setError('');

    let completedCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status === 'completed') {
        completedCount++;
        continue;
      }

      setCurrentIndex(i);
      setItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: 'uploading' } : it))
      );

      try {
        // Step 1: Initiate upload
        const initRes = await api.initiateUpload({
          title: item.title.trim() || item.file.name,
          filename: item.file.name,
          mimeType: item.file.type || 'video/mp4',
          size: item.file.size,
        });

        const { uploadUrl, storageKey } = initRes;

        // Step 2: Direct B2 PUT upload with progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              setItems((prev) =>
                prev.map((it, idx) =>
                  idx === i ? { ...it, progress: percent } : it
                )
              );
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`B2 Upload failed (${xhr.status})`));
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Network error during B2 upload'));
          });

          xhr.addEventListener('abort', () => {
            reject(new Error('Upload cancelled'));
          });

          xhr.open('PUT', uploadUrl, true);
          xhr.send(item.file);
        });

        // Generate WebP thumbnail locally in browser canvas (<20 KB) and upload to B2 at default 15s
        let thumbnailKey: string | undefined = undefined;
        let blurhash: string | undefined = undefined;
        try {
          const generated = await generateAndUploadThumbnail(item.file, item.file.name, 15);
          if (generated?.thumbnailKey) {
            thumbnailKey = generated.thumbnailKey;
            blurhash = generated.blurhash;
          }
        } catch (e) {
          console.warn('Thumbnail generation skipped:', e);
        }

        // Step 3: Complete metadata creation with thumbnailKey & blurhash
        await api.completeUpload({
          title: item.title.trim() || item.file.name,
          originalFilename: item.file.name,
          storageKey,
          thumbnailKey,
          blurhash,
          mimeType: item.file.type || 'video/mp4',
          size: item.file.size,
        });

        completedCount++;
        setItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: 'completed', progress: 100 } : it
          )
        );
      } catch (err: any) {
        console.error(`Upload error for file ${item.file.name}:`, err);
        setItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? { ...it, status: 'error', error: err.message || 'Failed' }
              : it
          )
        );
      }
    }

    setIsUploading(false);
    onSuccess();
    if (completedCount === items.length) {
      onClose();
    }
  };

  const handleCancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
    }
    setIsUploading(false);
  };

  const totalFiles = items.length;
  const completedFiles = items.filter((i) => i.status === 'completed').length;
  const overallProgress =
    totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="glass-panel max-w-2xl w-full rounded-2xl p-6 shadow-2xl border border-white/10 max-h-[90vh] flex flex-col bg-zinc-950/90 text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Bulk Video Upload
              </h3>
              <p className="text-xs text-zinc-400">
                Upload any number of videos. Default titles extracted automatically.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 mb-4 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleStartBulkUpload} className="flex flex-col flex-1 overflow-hidden space-y-4">
          {/* File Selector Dropzone */}
          <div className="relative border-2 border-dashed border-zinc-800 hover:border-indigo-500/60 rounded-xl p-5 text-center bg-zinc-900/50 transition-all shrink-0">
            <input
              type="file"
              multiple
              accept="video/*"
              onChange={handleFilesSelect}
              disabled={isUploading}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <UploadCloud className="w-8 h-8 mx-auto mb-2 text-indigo-400" />
            <div className="text-xs text-zinc-300">
              <span className="text-indigo-400 font-semibold">Click to choose multiple files</span> or drag and drop videos
              <span className="block text-[11px] text-zinc-500 mt-1">MP4, WebM, MOV, MKV</span>
            </div>
          </div>

          {/* Upload Items List */}
          {items.length > 0 && (
            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 max-h-[300px]">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 px-1">
                <span>Selected Videos ({items.length})</span>
                {isUploading && (
                  <span className="font-mono text-indigo-400">
                    Bulk Progress: {overallProgress}% ({completedFiles}/{totalFiles})
                  </span>
                )}
              </div>

              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80 flex items-center gap-3 text-xs"
                >
                  <FileVideo className="w-5 h-5 text-indigo-400 shrink-0" />

                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => updateItemTitle(item.id, e.target.value)}
                      disabled={isUploading}
                      className="w-full bg-zinc-950/80 border border-zinc-800 px-2.5 py-1 rounded-lg text-white font-medium text-xs focus:outline-none focus:border-indigo-500"
                      placeholder="Title..."
                    />

                    <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                      <span className="truncate max-w-[200px]">{item.file.name} ({formatSize(item.file.size)})</span>
                      <span>
                        {item.status === 'completed' && (
                          <span className="text-emerald-400 flex items-center gap-1 font-sans">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Done
                          </span>
                        )}
                        {item.status === 'uploading' && (
                          <span className="text-indigo-400 font-bold">{item.progress}%</span>
                        )}
                        {item.status === 'pending' && <span className="text-zinc-500">Ready</span>}
                        {item.status === 'error' && (
                          <span className="text-rose-400 font-sans">{item.error || 'Failed'}</span>
                        )}
                      </span>
                    </div>

                    {item.status === 'uploading' && (
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-150"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {!isUploading && item.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-900 shrink-0">
            <span className="text-xs text-zinc-500">
              {items.length > 0 ? `${items.length} videos queued` : 'No videos selected'}
            </span>

            <div className="flex items-center gap-2.5">
              {isUploading ? (
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold rounded-xl border border-rose-500/30 transition-all"
                >
                  Cancel Bulk Upload
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium rounded-xl border border-zinc-800 transition-all"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={items.length === 0}
                    className="px-5 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black text-xs font-extrabold rounded-xl shadow-lg shadow-amber-400/20 transition-all flex items-center gap-2"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload All ({items.length})</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
