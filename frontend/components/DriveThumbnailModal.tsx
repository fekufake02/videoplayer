'use client';

import React, { useState, useEffect, useRef } from 'react';
import { IDriveVideo } from '../types';
import { api } from '../lib/api';
import { canvasToWebP, generateBlurhashFromCanvas } from '../lib/thumbnailOptimizer';
import { extractVideoFrame } from '../lib/thumbnailGenerator';
import {
  X,
  Upload,
  Camera,
  Check,
  AlertCircle,
  HardDrive,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Clock,
} from 'lucide-react';

interface DriveThumbnailModalProps {
  video: IDriveVideo | null;
  initialCanvas?: HTMLCanvasElement | null;
  onClose: () => void;
  onThumbnailUpdated: (updatedVideo: IDriveVideo) => void;
}

export const DriveThumbnailModal: React.FC<DriveThumbnailModalProps> = ({
  video,
  initialCanvas,
  onClose,
  onThumbnailUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'snap'>('upload');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeCanvas, setActiveCanvas] = useState<HTMLCanvasElement | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [timestamp, setTimestamp] = useState<number>(20); // Default: 20 seconds timestamp
  const [isExtracting, setIsExtracting] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExtractFrameAtTimestamp = async (targetSeconds: number = 20) => {
    if (!video) return;
    setIsExtracting(true);
    setErrorMsg('');
    try {
      const streamUrl = `/api/drive/videos/${video.driveFileId}/chunk-stream`;
      const rawCanvas = await extractVideoFrame(streamUrl, targetSeconds, video.originalFilename);

      // Space optimization: scale down to 480x270 (16:9) to keep thumbnail under 20KB
      const optCanvas = document.createElement('canvas');
      optCanvas.width = 480;
      optCanvas.height = 270;
      const ctx = optCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(rawCanvas, 0, 0, 480, 270);
      }
      const finalCanvas = ctx ? optCanvas : rawCanvas;
      setActiveCanvas(finalCanvas);
      setSelectedFile(null);
      const url = finalCanvas.toDataURL('image/webp', 0.82);
      setPreviewUrl(url);
    } catch (e: any) {
      console.warn('Frame extraction error:', e);
      setErrorMsg('Could not extract video frame. You can also upload a custom image cover.');
    } finally {
      setIsExtracting(false);
    }
  };

  // If initialCanvas was provided by the player's Snap Frame button, load it into preview
  useEffect(() => {
    if (initialCanvas) {
      setActiveCanvas(initialCanvas);
      try {
        const url = initialCanvas.toDataURL('image/webp', 0.85);
        setPreviewUrl(url);
        setActiveTab('snap');
      } catch (err) {
        console.warn('Could not read initialCanvas dataURL:', err);
      }
    } else if (video?.thumbnailUrl) {
      setPreviewUrl(video.thumbnailUrl);
    }
  }, [initialCanvas, video]);

  if (!video) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }

    setErrorMsg('');
    setSelectedFile(file);
    setActiveCanvas(null);

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setErrorMsg('');
      setSelectedFile(file);
      setActiveCanvas(null);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSaveToB2 = async () => {
    if (!video) return;
    if (!selectedFile && !activeCanvas) {
      setErrorMsg('Please select an image or snap a video frame first.');
      return;
    }

    setIsUploading(true);
    setErrorMsg('');
    setSuccessMsg('');
    setUploadProgress(15);

    try {
      let uploadBlob: Blob;
      let blurhashStr: string | undefined;

      if (activeCanvas) {
        uploadBlob = await canvasToWebP(activeCanvas, 0.82);
        try {
          blurhashStr = await generateBlurhashFromCanvas(activeCanvas);
        } catch {}
      } else if (selectedFile) {
        // Compress selected image via an off-screen canvas to guarantee lightweight WebP format (<50KB)
        const img = new Image();
        const objectUrl = URL.createObjectURL(selectedFile);
        img.src = objectUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        canvas.width = Math.min(1280, img.width || 1280);
        canvas.height = Math.round(canvas.width * (9 / 16));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          uploadBlob = await canvasToWebP(canvas, 0.85);
          try {
            blurhashStr = await generateBlurhashFromCanvas(canvas);
          } catch {}
        } else {
          uploadBlob = selectedFile;
        }
        URL.revokeObjectURL(objectUrl);
      } else {
        throw new Error('No media to upload');
      }

      setUploadProgress(40);

      // 1. Get presigned upload URL from backend for Backblaze B2 (account2)
      const initRes = await api.initiateDriveThumbnailUpload({
        filename: `${video.driveFileId}_thumb.webp`,
        mimeType: 'image/webp',
        driveFileId: video.driveFileId,
      });

      if (!initRes?.success || !initRes.uploadUrl || !initRes.storageKey) {
        throw new Error('Failed to retrieve B2 presigned upload credentials.');
      }

      setUploadProgress(65);

      // 2. PUT the WebP buffer to Backblaze B2
      try {
        const uploadResp = await fetch(initRes.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'image/webp',
          },
          body: uploadBlob,
        });

        if (!uploadResp.ok) {
          throw new Error(`B2 response error code ${uploadResp.status}`);
        }
      } catch (uploadErr) {
        console.warn('Direct B2 PUT error, attempting backend proxy receiver:', uploadErr);
        const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api` : '/api';
        const token = typeof window !== 'undefined' ? localStorage.getItem('metime_auth_token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'image/webp' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        await fetch(`${backendBase}/videos/upload/proxy?key=${encodeURIComponent(initRes.storageKey)}&storageAccount=account2`, {
          method: 'PUT',
          headers,
          body: uploadBlob,
        });
      }

      setUploadProgress(85);

      // 3. Attach thumbnail to DriveVideo in MongoDB
      const attachRes = await api.attachDriveThumbnail(video._id, {
        thumbnailKey: initRes.storageKey,
        blurhash: blurhashStr,
        storageAccount: initRes.storageAccount || 'account2',
      });

      if (!attachRes?.success) {
        throw new Error('Failed to record thumbnail association in database.');
      }

      setUploadProgress(100);
      setSuccessMsg('Thumbnail successfully stored in Backblaze B2!');

      // Update parent component
      onThumbnailUpdated(attachRes.video);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Failed to update Drive video thumbnail:', err);
      setErrorMsg(err.message || 'Failed to upload thumbnail to Backblaze B2.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Customize Thumbnail (Backblaze B2)
              </h2>
              <p className="text-xs text-slate-400 line-clamp-1 max-w-[280px]">
                {video.title}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'upload'
                  ? 'bg-amber-400 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Custom Image</span>
            </button>
            <button
              onClick={() => setActiveTab('snap')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'snap'
                  ? 'bg-amber-400 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Video Frame</span>
            </button>
          </div>

          {/* Preview Area */}
          <div className="relative aspect-video w-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex items-center justify-center">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Thumbnail Preview"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <Upload className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-xs">No thumbnail selected</span>
              </div>
            )}

            {/* B2 Cloud Tag */}
            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-slate-700 text-[10px] font-bold text-amber-400 flex items-center gap-1">
              <HardDrive className="w-2.5 h-2.5" />
              <span>Target: B2 Account 2</span>
            </div>
          </div>

          {/* Tab 1: Upload Controls */}
          {activeTab === 'upload' && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-800 hover:border-amber-400/50 bg-slate-950/40 hover:bg-slate-950/80 rounded-xl p-4 text-center cursor-pointer transition-all"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-slate-200">
                Click to browse or drag and drop an image
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                PNG, JPG, or WebP. Auto-optimized to 16:9 WebP before uploading.
              </p>
            </div>
          )}

          {/* Tab 2: Frame Snap & Timestamp Selector */}
          {activeTab === 'snap' && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Timestamp Frame Selector</span>
                </p>
                <span className="text-[11px] text-slate-500 font-mono">
                  Default: 20 seconds
                </span>
              </div>

              {/* Timestamp Input & Quick Presets */}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
                  <span className="text-slate-400 text-xs">At</span>
                  <input
                    type="number"
                    min="0"
                    max={video.duration || 3600}
                    value={timestamp}
                    onChange={(e) => setTimestamp(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-16 bg-transparent text-white font-mono font-bold focus:outline-none"
                  />
                  <span className="text-slate-400 text-xs">seconds</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleExtractFrameAtTimestamp(timestamp)}
                  disabled={isExtracting}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-bold text-xs rounded-lg transition-all active:scale-95 shadow-md shadow-amber-400/20"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isExtracting ? 'animate-spin' : ''}`} />
                  <span>{isExtracting ? 'Extracting...' : `Extract at ${timestamp}s`}</span>
                </button>
              </div>

              {/* Quick Timestamp Chips */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {[
                  { label: '20s (Default)', val: 20 },
                  { label: '10s', val: 10 },
                  { label: '30s', val: 30 },
                  { label: '60s', val: 60 },
                  { label: '90s', val: 90 },
                ].map((chip) => (
                  <button
                    key={chip.val}
                    type="button"
                    onClick={() => {
                      setTimestamp(chip.val);
                      handleExtractFrameAtTimestamp(chip.val);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all border ${
                      timestamp === chip.val
                        ? 'bg-amber-400/20 border-amber-400/50 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                Frame will be compressed to space-optimized 480x270 WebP (&lt;20KB) and saved permanently in your Backblaze B2 bucket.
              </p>
            </div>
          )}

          {/* Error & Success Messages */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-rose-950/30 border border-rose-900/50 rounded-xl text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-xl text-emerald-300 text-xs font-semibold">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Progress Bar */}
          {isUploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400 font-mono">
                <span>Uploading to Backblaze B2...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleSaveToB2}
            disabled={isUploading || (!selectedFile && !activeCanvas)}
            className="flex items-center gap-2 px-5 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-amber-400/20 transition-all active:scale-95"
          >
            {isUploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Storing in B2...</span>
              </>
            ) : (
              <>
                <HardDrive className="w-3.5 h-3.5" />
                <span>Save to Backblaze B2</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
