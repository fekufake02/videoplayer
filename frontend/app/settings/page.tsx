'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Navbar } from '../../components/Navbar';
import {
  Shield,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  EyeOff,
  Monitor,
  Check,
  Lock,
} from 'lucide-react';

export default function SettingsPage() {
  const { settings, updateUserSettings, refreshSettings, isAuthenticated, isLoading } = useAuth();

  // Privacy & Security Settings
  const [autoLockDuration, setAutoLockDuration] = useState<number>(0);
  const [privacyTabHidden, setPrivacyTabHidden] = useState<boolean>(false);
  const [lockOnWindowBlur, setLockOnWindowBlur] = useState<boolean>(false);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  // Sync with AuthContext settings
  useEffect(() => {
    if (settings) {
      setAutoLockDuration(settings.autoLockDuration ?? 0);
      setPrivacyTabHidden(settings.privacyTabHidden ?? false);
      setLockOnWindowBlur(settings.lockOnWindowBlur ?? false);
    }
  }, [settings]);

  // Handle instant toggle change with auto-save
  const handleToggleTabSwitch = async (checked: boolean) => {
    setPrivacyTabHidden(checked);
    setErrorMsg('');
    try {
      await updateUserSettings({ privacyTabHidden: checked });
      showSuccessFeedback();
    } catch (err: any) {
      setPrivacyTabHidden(!checked);
      setErrorMsg(err.message || 'Failed to update setting.');
    }
  };

  const handleToggleFocusBlur = async (checked: boolean) => {
    setLockOnWindowBlur(checked);
    setErrorMsg('');
    try {
      await updateUserSettings({ lockOnWindowBlur: checked });
      showSuccessFeedback();
    } catch (err: any) {
      setLockOnWindowBlur(!checked);
      setErrorMsg(err.message || 'Failed to update setting.');
    }
  };

  const handleInactivityChange = async (duration: number) => {
    setAutoLockDuration(duration);
    setErrorMsg('');
    try {
      await updateUserSettings({ autoLockDuration: duration });
      showSuccessFeedback();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update setting.');
    }
  };

  const showSuccessFeedback = () => {
    setSuccessMsg('Settings saved successfully!');
    setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      await updateUserSettings({
        privacyTabHidden,
        lockOnWindowBlur,
        autoLockDuration,
      });
      await refreshSettings();
      showSuccessFeedback();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
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

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <Shield className="w-6 h-6 text-indigo-400" />
              Settings
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Configure privacy locks, window blur detection, and inactivity timer.
            </p>
          </div>
          {lastSavedTime && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
              <Check className="w-3.5 h-3.5" />
              <span>Saved at {lastSavedTime}</span>
            </div>
          )}
        </div>

        {successMsg && (
          <div className="p-3 text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleManualSave} className="space-y-6">
          {/* Privacy & Security Settings */}
          <section className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3 uppercase tracking-wider text-slate-300">
              <Lock className="w-4 h-4 text-indigo-400" />
              Privacy & Auto-Lock Options
            </h2>

            <div className="space-y-4">
              {/* Tab Switch Lock Toggle */}
              <div className="flex items-start justify-between p-4 bg-slate-900/70 hover:bg-slate-900/90 transition-colors rounded-xl border border-slate-800 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <EyeOff className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-semibold text-white">Logout / Lock on Tab Switch</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                    When enabled, the vault immediately locks if you switch browser tabs or minimize the window.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={privacyTabHidden}
                    onChange={(e) => handleToggleTabSwitch(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 shadow-inner" />
                </label>
              </div>

              {/* Window Blur Lock Toggle */}
              <div className="flex items-start justify-between p-4 bg-slate-900/70 hover:bg-slate-900/90 transition-colors rounded-xl border border-slate-800 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold text-white">Lock on Window Focus Lost</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                    When enabled, automatically locks the vault when you click outside the browser or switch focus to another application.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={lockOnWindowBlur}
                    onChange={(e) => handleToggleFocusBlur(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 shadow-inner" />
                </label>
              </div>

              {/* Inactivity Auto-Lock Timer */}
              <div className="p-4 bg-slate-900/70 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold text-white">Inactivity Auto-Lock</span>
                  </div>
                  <span className="text-xs font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg">
                    {autoLockDuration === 0 ? 'Disabled' : `${autoLockDuration} min`}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Automatically lock the application when no mouse or keyboard activity is detected.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                  {[
                    { value: 0, label: 'Off' },
                    { value: 1, label: '1 min' },
                    { value: 2, label: '2 min' },
                    { value: 5, label: '5 min' },
                    { value: 10, label: '10 min' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleInactivityChange(option.value)}
                      className={`py-2 px-3 rounded-xl text-xs font-medium transition-all text-center border ${
                        autoLockDuration === option.value
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20 font-semibold'
                          : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Explicit Save Button */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-[11px] text-slate-500">
              Changes are auto-saved instantly upon toggling.
            </p>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

