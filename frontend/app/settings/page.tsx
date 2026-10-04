'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Navbar } from '../../components/Navbar';
import { api } from '../../lib/api';
import {
  Shield,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  EyeOff,
  Monitor,
  Check,
  Lock,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

export default function SettingsPage() {
  const { settings, updateUserSettings, refreshSettings, isAuthenticated, isLoading } = useAuth();

  // Privacy & Security Settings
  const [autoLockDuration, setAutoLockDuration] = useState<number>(0);
  const [privacyTabHidden, setPrivacyTabHidden] = useState<boolean>(false);
  const [lockOnWindowBlur, setLockOnWindowBlur] = useState<boolean>(false);
  const [blockPlaceholders, setBlockPlaceholders] = useState<boolean>(false);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  // Password Management State
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showCurrentPass, setShowCurrentPass] = useState<boolean>(false);
  const [showNewPass, setShowNewPass] = useState<boolean>(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState<boolean>(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState<string>('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string>('');

  // Sync with AuthContext settings
  useEffect(() => {
    if (settings) {
      setAutoLockDuration(settings.autoLockDuration ?? 0);
      setPrivacyTabHidden(settings.privacyTabHidden ?? false);
      setLockOnWindowBlur(settings.lockOnWindowBlur ?? false);
      setBlockPlaceholders(settings.blockPlaceholders ?? false);
    }
  }, [settings]);

  const showSuccessFeedback = () => {
    setSuccessMsg('Settings saved successfully!');
    setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setTimeout(() => setSuccessMsg(''), 3000);
  };

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

  const handleToggleBlockPlaceholders = async (checked: boolean) => {
    setBlockPlaceholders(checked);
    setErrorMsg('');
    try {
      await updateUserSettings({ blockPlaceholders: checked });
      showSuccessFeedback();
    } catch (err: any) {
      setBlockPlaceholders(!checked);
      setErrorMsg(err.message || 'Failed to update placeholder setting.');
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

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      await updateUserSettings({
        privacyTabHidden,
        lockOnWindowBlur,
        blockPlaceholders,
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

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrorMsg('');
    setPasswordSuccessMsg('');

    if (!currentPassword) {
      setPasswordErrorMsg('Current password is required.');
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setPasswordErrorMsg('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg('New passwords do not match.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await api.updateAdminPassword(currentPassword, newPassword);
      if (res.success) {
        setPasswordSuccessMsg(res.message || 'Master password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordSuccessMsg(''), 5000);
      } else {
        setPasswordErrorMsg('Failed to update password.');
      }
    } catch (err: any) {
      setPasswordErrorMsg(err.message || 'Current password is incorrect or failed to update.');
    } finally {
      setIsUpdatingPassword(false);
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

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <Shield className="w-6 h-6 text-amber-400" />
              Settings
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Configure privacy locks, thumbnail visibility, and master credentials.
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

        {/* 1. Privacy & Shield Options Form */}
        <form onSubmit={handleManualSave} className="space-y-6">
          <section className="glass-panel p-6 rounded-2xl border border-zinc-800 space-y-5 bg-zinc-900/40">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 border-b border-zinc-800 pb-3">
              <Lock className="w-4 h-4 text-amber-400" />
              Privacy & Auto-Lock Options
            </h2>

            <div className="space-y-4">
              {/* Home Page Thumbnail Privacy Shield Toggle */}
              <div className="flex items-start justify-between p-4 bg-zinc-950/80 hover:bg-zinc-950 transition-colors rounded-xl border border-zinc-800 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-semibold text-white">Block Home Page Thumbnails & Placeholders</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                    Privacy Shield: Blocks and shields all video thumbnails and placeholders on the home page with a discreet lock tile to prevent shoulder-surfing. (Video playback inside the player remains completely unaffected.)
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={blockPlaceholders}
                    onChange={(e) => handleToggleBlockPlaceholders(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-400 shadow-inner" />
                </label>
              </div>

              {/* Tab Switch Lock Toggle */}
              <div className="flex items-start justify-between p-4 bg-zinc-950/80 hover:bg-zinc-950 transition-colors rounded-xl border border-zinc-800 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <EyeOff className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold text-white">Lock on Tab Switch</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
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
                  <div className="w-12 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 shadow-inner" />
                </label>
              </div>

              {/* Window Blur Lock Toggle */}
              <div className="flex items-start justify-between p-4 bg-zinc-950/80 hover:bg-zinc-950 transition-colors rounded-xl border border-zinc-800 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold text-white">Lock on Window Focus Lost</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                    Automatically locks the vault when you click outside the browser or switch focus to another application.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={lockOnWindowBlur}
                    onChange={(e) => handleToggleFocusBlur(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 shadow-inner" />
                </label>
              </div>

              {/* Inactivity Auto-Lock Timer */}
              <div className="p-4 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-semibold text-white">Inactivity Auto-Lock</span>
                  </div>
                  <span className="text-xs font-mono text-amber-300 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-lg">
                    {autoLockDuration === 0 ? 'Disabled' : `${autoLockDuration} min`}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
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
                          ? 'bg-amber-400 border-amber-400 text-black shadow-md font-semibold'
                          : 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-300'
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
          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-zinc-500">
              Privacy settings are saved automatically when toggled.
            </p>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-semibold text-xs rounded-xl shadow-lg shadow-amber-400/10 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Preferences'}</span>
            </button>
          </div>
        </form>

        {/* 2. Master Password Management Section */}
        <section className="glass-panel p-6 rounded-2xl border border-zinc-800 space-y-5 bg-zinc-900/40">
          <div className="border-b border-zinc-800 pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-400" />
              Master Vault Password
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Update the master credentials required to unlock your vault.
            </p>
          </div>

          {passwordSuccessMsg && (
            <div className="p-3 text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{passwordSuccessMsg}</span>
            </div>
          )}

          {passwordErrorMsg && (
            <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{passwordErrorMsg}</span>
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-xl">
            {/* Current Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Current Master Password
              </label>
              <div className="relative">
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password..."
                  required
                  className="w-full px-3.5 py-2.5 pr-10 bg-zinc-950/80 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 transition-colors"
                  title={showCurrentPass ? 'Hide password' : 'Show password'}
                >
                  {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password & Confirmation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  New Password (min 8 chars)
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password..."
                    required
                    minLength={8}
                    className="w-full px-3.5 py-2.5 pr-10 bg-zinc-950/80 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title={showNewPass ? 'Hide password' : 'Show password'}
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Confirm New Password
                </label>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password..."
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isUpdatingPassword || !currentPassword || !newPassword}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>{isUpdatingPassword ? 'Updating Password...' : 'Update Password'}</span>
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
