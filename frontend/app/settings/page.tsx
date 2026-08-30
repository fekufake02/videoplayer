'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { Navbar } from '../../components/Navbar';
import {
  Sliders,
  Shield,
  Layout,
  Save,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  EyeOff,
  Lock,
  Sparkles,
  Loader2,
  RotateCcw,
  Film,
} from 'lucide-react';
import { batchGenerateThumbnails } from '../../lib/thumbnailGenerator';

export default function SettingsPage() {
  const { settings, refreshSettings, isAuthenticated, isLoading } = useAuth();

  const [defaultPlaybackSpeed, setDefaultPlaybackSpeed] = useState<number>(1);
  const [defaultVolume, setDefaultVolume] = useState<number>(1);
  const [skipBackwardDuration, setSkipBackwardDuration] = useState<number>(10);
  const [skipForwardDuration, setSkipForwardDuration] = useState<number>(10);
  const [autoResume, setAutoResume] = useState<boolean>(true);
  const [autoplay, setAutoplay] = useState<boolean>(false);
  const [autoLockDuration, setAutoLockDuration] = useState<number>(15);
  const [privacyTabHidden, setPrivacyTabHidden] = useState<boolean>(false);
  const [saveWatchHistory, setSaveWatchHistory] = useState<boolean>(true);
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [layout, setLayout] = useState<'comfortable' | 'compact'>('comfortable');

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState<boolean>(false);
  const [isClearingHistory, setIsClearingHistory] = useState<boolean>(false);

  // Reprocess Thumbnails State
  const [thumbnailTimestamp, setThumbnailTimestamp] = useState<number>(15);
  const [isReprocessingThumbnails, setIsReprocessingThumbnails] = useState<boolean>(false);
  const [reprocessProgress, setReprocessProgress] = useState<{
    current: number;
    total: number;
    currentTitle: string;
    successCount: number;
    failedCount: number;
  } | null>(null);

  useEffect(() => {
    if (settings) {
      setDefaultPlaybackSpeed(settings.defaultPlaybackSpeed ?? 1);
      setDefaultVolume(settings.defaultVolume ?? 1);
      setSkipBackwardDuration(settings.skipBackwardDuration ?? 10);
      setSkipForwardDuration(settings.skipForwardDuration ?? 10);
      setAutoResume(settings.autoResume ?? true);
      setAutoplay(settings.autoplay ?? false);
      setAutoLockDuration(settings.autoLockDuration ?? 15);
      setPrivacyTabHidden(settings.privacyTabHidden ?? false);
      setSaveWatchHistory(settings.saveWatchHistory ?? true);
      setTheme(settings.theme || 'dark');
      setLayout(settings.layout || 'comfortable');
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      await api.updateSettings({
        defaultPlaybackSpeed,
        defaultVolume,
        skipBackwardDuration,
        skipForwardDuration,
        autoResume,
        autoplay,
        autoLockDuration,
        privacyTabHidden,
        saveWatchHistory,
        theme,
        layout,
      });

      await refreshSettings();
      setSuccessMsg('Settings saved successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearHistory = async () => {
    setIsClearingHistory(true);
    try {
      await api.clearWatchHistory();
      await refreshSettings();
      setShowClearHistoryConfirm(false);
      setSuccessMsg('Watch history cleared successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to clear watch history.');
    } finally {
      setIsClearingHistory(false);
    }
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

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 lg:px-8 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
            <p className="text-xs text-slate-400">Configure player preferences and privacy controls.</p>
          </div>
        </div>

        {successMsg && (
          <div className="p-3 text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          {/* Playback Settings */}
          <section className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Playback Preferences
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Default Playback Speed
                </label>
                <select
                  value={defaultPlaybackSpeed}
                  onChange={(e) => setDefaultPlaybackSpeed(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1}>1.0x (Normal)</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2.0x</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Default Volume ({Math.round(defaultVolume * 100)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={defaultVolume}
                  onChange={(e) => setDefaultVolume(parseFloat(e.target.value))}
                  className="w-full h-2 mt-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Skip Backward Duration (Seconds)
                </label>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={skipBackwardDuration}
                  onChange={(e) => setSkipBackwardDuration(parseInt(e.target.value, 10) || 10)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Skip Forward Duration (Seconds)
                </label>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={skipForwardDuration}
                  onChange={(e) => setSkipForwardDuration(parseInt(e.target.value, 10) || 10)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoResume}
                  onChange={(e) => setAutoResume(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-indigo-600 focus:ring-0"
                />
                Automatically resume previous video playback position
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoplay}
                  onChange={(e) => setAutoplay(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-indigo-600 focus:ring-0"
                />
                Autoplay video upon opening
              </label>
            </div>
          </section>

          {/* Privacy & Security Settings */}
          <section className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Shield className="w-4 h-4 text-indigo-400" />
              Privacy & Security Controls
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Auto-Lock Inactivity Timer
                </label>
                <select
                  value={autoLockDuration}
                  onChange={(e) => setAutoLockDuration(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={0}>Never</option>
                  <option value={1}>1 minute</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes (Default)</option>
                  <option value={30}>30 minutes</option>
                </select>
              </div>

              <div className="flex flex-col justify-center space-y-3">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privacyTabHidden}
                    onChange={(e) => setPrivacyTabHidden(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  Activate Privacy Screen automatically when tab is hidden
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveWatchHistory}
                    onChange={(e) => setSaveWatchHistory(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  Save watch history & playback positions
                </label>
              </div>
            </div>

            {/* Clear History Danger Zone */}
            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-rose-400">Clear Watch History</h4>
                <p className="text-[11px] text-slate-400">
                  Resets all progress positions, play counts, and recently watched statistics.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClearHistoryConfirm(true)}
                className="px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-medium rounded-xl transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear History
              </button>
            </div>
          </section>

          {/* Thumbnail Generation & Reprocessing */}
          <section className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Video Thumbnail Reprocessing
            </h2>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-semibold text-white mb-1 flex items-center gap-2">
                      <Film className="w-4 h-4 text-amber-400" />
                      Reprocess All Video Thumbnails (15s Timestamp)
                    </h4>
                    <p className="text-slate-400 max-w-xl leading-relaxed">
                      Replaces existing thumbnails across your full collection (200+ videos stored on B2) by extracting high-contrast frames at the <strong className="text-amber-300 font-medium">15-second timestamp</strong> (avoiding black title cards & fade-ins) into compressed WebP & Blurhash placeholders.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                      <span className="text-[11px] text-slate-400">Timestamp:</span>
                      <select
                        value={thumbnailTimestamp}
                        disabled={isReprocessingThumbnails}
                        onChange={(e) => setThumbnailTimestamp(Number(e.target.value))}
                        className="bg-transparent text-amber-400 font-semibold text-xs focus:outline-none cursor-pointer"
                      >
                        <option value="5" className="bg-slate-900 text-white">5s</option>
                        <option value="10" className="bg-slate-900 text-white">10s</option>
                        <option value="15" className="bg-slate-900 text-amber-400 font-bold">15s (Recommended)</option>
                        <option value="20" className="bg-slate-900 text-white">20s</option>
                        <option value="30" className="bg-slate-900 text-white">30s</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={isReprocessingThumbnails}
                      onClick={async () => {
                        try {
                          setIsReprocessingThumbnails(true);
                          setSuccessMsg('Scanning video library for all uploaded videos...');
                          setErrorMsg('');

                          // 1. Fetch entire video collection across all pages
                          const allVideos = await api.getAllVideos();

                          if (allVideos.length === 0) {
                            setSuccessMsg('No videos found in library.');
                            setIsReprocessingThumbnails(false);
                            return;
                          }

                          setReprocessProgress({
                            current: 0,
                            total: allVideos.length,
                            currentTitle: allVideos[0]?.title || 'Starting reprocessing...',
                            successCount: 0,
                            failedCount: 0,
                          });

                          const formattedList = allVideos.map((v) => ({
                            id: v._id,
                            originalFilename: v.originalFilename || `${v.title}.mp4`,
                            title: v.title,
                          }));

                          // 2. Batch process and upload each new thumbnail at chosen timestamp (15s default)
                          const result = await batchGenerateThumbnails(
                            formattedList,
                            (current, total, currentTitle, isSuccess) => {
                              setReprocessProgress((prev) => ({
                                current,
                                total,
                                currentTitle: currentTitle || `Video ${current}`,
                                successCount: (prev?.successCount || 0) + (isSuccess ? 1 : 0),
                                failedCount: (prev?.failedCount || 0) + (isSuccess ? 0 : 1),
                              }));
                            },
                            thumbnailTimestamp
                          );

                          setSuccessMsg(
                            `Successfully reprocessed ${result.success} thumbnails at ${thumbnailTimestamp}s! (${result.failed} skipped)`
                          );
                        } catch (e: any) {
                          console.error('Reprocess thumbnails error:', e);
                          setErrorMsg(e.message || 'Failed to reprocess video thumbnails.');
                        } finally {
                          setIsReprocessingThumbnails(false);
                        }
                      }}
                      className={`px-4 py-2.5 text-black font-semibold rounded-xl text-xs whitespace-nowrap transition-all shadow-md flex items-center gap-2 ${
                        isReprocessingThumbnails
                          ? 'bg-amber-600/50 cursor-not-allowed text-amber-200'
                          : 'bg-amber-500 hover:bg-amber-400'
                      }`}
                    >
                      {isReprocessingThumbnails ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Reprocessing ({reprocessProgress?.current || 0}/{reprocessProgress?.total || 0})
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reprocess All Videos ({thumbnailTimestamp}s)
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Real-time Progress Bar */}
                {reprocessProgress && (
                  <div className="p-3.5 bg-zinc-950/90 rounded-xl border border-slate-800 space-y-2 mt-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <span className="truncate max-w-[280px] sm:max-w-md font-mono text-amber-400">
                        {isReprocessingThumbnails ? 'Capturing at ' + thumbnailTimestamp + 's: ' : 'Completed: '}
                        {reprocessProgress.currentTitle}
                      </span>
                      <span className="font-semibold text-slate-200 font-mono">
                        {reprocessProgress.current} / {reprocessProgress.total} (
                        {Math.round(
                          (reprocessProgress.current / Math.max(1, reprocessProgress.total)) * 100
                        )}%)
                      </span>
                    </div>

                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            (reprocessProgress.current / Math.max(1, reprocessProgress.total)) * 100
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                      <span className="text-emerald-400 font-medium">
                        ✓ {reprocessProgress.successCount} replaced & uploaded to B2
                      </span>
                      {reprocessProgress.failedCount > 0 && (
                        <span className="text-rose-400 font-medium">
                          ✕ {reprocessProgress.failedCount} skipped
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Interface Settings */}
          <section className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Layout className="w-4 h-4 text-indigo-400" />
              Interface Theme & Layout
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Theme</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="dark">Dark Theme (Default & Recommended)</option>
                  <option value="light">Light Theme</option>
                  <option value="system">System Preference</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Library Card Density</label>
                <select
                  value={layout}
                  onChange={(e) => setLayout(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="comfortable">Comfortable Grid</option>
                  <option value="compact">Compact Grid</option>
                </select>
              </div>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </main>

      {/* Clear History Confirmation Modal */}
      {showClearHistoryConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-sm w-full rounded-2xl p-6 shadow-2xl border border-rose-900/40 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4 text-rose-400">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-white mb-2">Clear Watch History?</h3>
            <p className="text-xs text-slate-400 mb-6">
              This will reset all playback progress, recently watched history, and play counts across your library. Videos will NOT be deleted.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowClearHistoryConfirm(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleClearHistory}
                disabled={isClearingHistory}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-600/20 transition-all"
              >
                {isClearingHistory ? 'Clearing...' : 'Clear History'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
