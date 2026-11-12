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
  Fingerprint,
  BookOpen,
  FileSpreadsheet,
  CheckSquare,
  Sliders,
  RotateCcw,
  Trash2,
  PlaySquare,
  Settings as SettingsIcon,
} from 'lucide-react';
import { DecoyPreset } from '../../lib/decoyManager';

type SettingsTab = 'privacy' | 'player' | 'decoy' | 'biometrics' | 'security';

export default function SettingsPage() {
  const {
    settings,
    updateUserSettings,
    refreshSettings,
    isAuthenticated,
    isLoading,
    hasBiometricRegistered,
    isBiometricAvailable,
    registerBiometricPasskey,
    removeBiometricPasskey,
    decoyConfig,
    updateDecoyConfig,
    enterDecoyMode,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<SettingsTab>('privacy');

  // Privacy & Security Settings
  const [autoLockDuration, setAutoLockDuration] = useState<number>(0);
  const [privacyTabHidden, setPrivacyTabHidden] = useState<boolean>(false);
  const [lockOnWindowBlur, setLockOnWindowBlur] = useState<boolean>(false);
  const [blockPlaceholders, setBlockPlaceholders] = useState<boolean>(false);

  // Player Preferences
  const [defaultPlaybackSpeed, setDefaultPlaybackSpeed] = useState<number>(1);
  const [skipForwardDuration, setSkipForwardDuration] = useState<number>(10);
  const [skipBackwardDuration, setSkipBackwardDuration] = useState<number>(10);
  const [autoResume, setAutoResume] = useState<boolean>(true);
  const [autoplay, setAutoplay] = useState<boolean>(false);
  const [saveWatchHistory, setSaveWatchHistory] = useState<boolean>(true);
  const [pauseOnTabSwitch, setPauseOnTabSwitch] = useState<boolean>(true);

  // Decoy Mode Settings Local State
  const [decoyEnabled, setDecoyEnabled] = useState<boolean>(decoyConfig?.enabled ?? true);
  const [decoyPreset, setDecoyPreset] = useState<DecoyPreset>(decoyConfig?.preset ?? 'research');
  const [decoyTitle, setDecoyTitle] = useState<string>(decoyConfig?.title ?? 'Quantum Computing Lecture Notes');
  const [decoyShortcut, setDecoyShortcut] = useState<string>(decoyConfig?.shortcut ?? 'Alt+D');
  const [decoyPin, setDecoyPin] = useState<string>(decoyConfig?.exitPin ?? '1234');
  const [decoySavedMsg, setDecoySavedMsg] = useState<string>('');

  // Biometric Passkey Local State
  const [biometricMsg, setBiometricMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [isRegisteringBiometric, setIsRegisteringBiometric] = useState<boolean>(false);

  // Status feedback
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

  // Clear history state
  const [isClearingHistory, setIsClearingHistory] = useState<boolean>(false);
  const [historyClearMsg, setHistoryClearMsg] = useState<string>('');

  // Sync with AuthContext settings
  useEffect(() => {
    if (settings) {
      setAutoLockDuration(settings.autoLockDuration ?? 0);
      setPrivacyTabHidden(settings.privacyTabHidden ?? false);
      setLockOnWindowBlur(settings.lockOnWindowBlur ?? false);
      setBlockPlaceholders(settings.blockPlaceholders ?? false);
      setDefaultPlaybackSpeed(settings.defaultPlaybackSpeed ?? 1);
      setSkipForwardDuration(settings.skipForwardDuration ?? 10);
      setSkipBackwardDuration(settings.skipBackwardDuration ?? 10);
      setAutoResume(settings.autoResume ?? true);
      setAutoplay(settings.autoplay ?? false);
      setSaveWatchHistory(settings.saveWatchHistory ?? true);
      setPauseOnTabSwitch(settings.pauseOnTabSwitch ?? true);
    }
  }, [settings]);

  const showSuccessFeedback = (msg = 'Settings saved') => {
    setSuccessMsg(msg);
    setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setTimeout(() => setSuccessMsg(''), 3000);
  };

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

  const handleSavePlayerPreferences = async () => {
    setIsSaving(true);
    setErrorMsg('');
    try {
      await updateUserSettings({
        defaultPlaybackSpeed,
        skipForwardDuration,
        skipBackwardDuration,
        autoResume,
        autoplay,
        saveWatchHistory,
        pauseOnTabSwitch,
      });
      await refreshSettings();
      showSuccessFeedback('Player preferences saved');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save player settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Clear all watch progress and played history? This cannot be undone.')) return;
    setIsClearingHistory(true);
    setHistoryClearMsg('');
    try {
      const res = await api.clearWatchHistory();
      if (res.success) {
        setHistoryClearMsg(res.message || 'Watch history successfully cleared.');
        setTimeout(() => setHistoryClearMsg(''), 4000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to clear watch history.');
    } finally {
      setIsClearingHistory(false);
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
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'privacy', label: 'Privacy & Locks', icon: Shield },
    { id: 'player', label: 'Playback & Audio', icon: PlaySquare },
    { id: 'decoy', label: 'Decoy Mode', icon: ShieldAlert },
    { id: 'biometrics', label: 'Passkeys', icon: Fingerprint },
    { id: 'security', label: 'Master Password', icon: KeyRound },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary">
      <Navbar />

      <main className="flex-1 max-w-[920px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent">
                <SettingsIcon className="w-4 h-4" />
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-text-primary">
                Vault Settings
              </h1>
            </div>
            <p className="text-xs text-text-secondary mt-1 ml-10">
              Configure privacy shields, playback defaults, decoy screen, and biometric credentials.
            </p>
          </div>

          {lastSavedTime && (
            <div className="flex items-center gap-1.5 text-xs text-success bg-success/10 border border-success/20 px-3 py-1.5 rounded-lg self-start sm:self-auto tabular-nums">
              <Check className="w-3.5 h-3.5" />
              <span>Saved at {lastSavedTime}</span>
            </div>
          )}
        </div>

        {/* Global Feedback Toasts */}
        {successMsg && (
          <div className="p-3 text-xs bg-success/10 border border-success/20 text-success rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-border scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  active
                    ? 'bg-surface-elevated text-text-primary border border-border shadow-sm'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-accent' : 'text-text-muted'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: PRIVACY & AUTO-LOCK */}
        {activeTab === 'privacy' && (
          <div className="space-y-6">
            <section className="bg-surface border border-border rounded-xl p-5 sm:p-6 space-y-5">
              <div className="border-b border-border pb-3">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                  Privacy Shields & Focus Locks
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Protect confidential video content from shoulder surfers and accidental exposure.
                </p>
              </div>

              <div className="space-y-3">
                {/* Block Placeholders / Thumbnails */}
                <div className="flex items-start justify-between p-4 bg-background-secondary rounded-lg border border-border gap-4">
                  <div className="space-y-1">
                    <span className="text-xs sm:text-sm font-medium text-text-primary">
                      Block Home Page Thumbnails & Placeholders
                    </span>
                    <p className="text-xs text-text-secondary leading-relaxed max-w-xl">
                      Replaces all media previews with a discreet locked tile on library pages to shield titles and video previews. Full playback remains enabled inside the player.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={blockPlaceholders}
                      onChange={(e) => handleToggleBlockPlaceholders(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-elevated border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:border-accent" />
                  </label>
                </div>

                {/* Tab Switch Lock */}
                <div className="flex items-start justify-between p-4 bg-background-secondary rounded-lg border border-border gap-4">
                  <div className="space-y-1">
                    <span className="text-xs sm:text-sm font-medium text-text-primary">
                      Lock on Tab Switch
                    </span>
                    <p className="text-xs text-text-secondary leading-relaxed max-w-xl">
                      Instantly engages the master vault lock whenever you navigate to another browser tab or minimize the browser window.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={privacyTabHidden}
                      onChange={(e) => handleToggleTabSwitch(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-elevated border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:border-accent" />
                  </label>
                </div>

                {/* Window Blur Lock */}
                <div className="flex items-start justify-between p-4 bg-background-secondary rounded-lg border border-border gap-4">
                  <div className="space-y-1">
                    <span className="text-xs sm:text-sm font-medium text-text-primary">
                      Lock on Window Focus Lost
                    </span>
                    <p className="text-xs text-text-secondary leading-relaxed max-w-xl">
                      Locks the library whenever you click outside the browser window into another desktop application.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={lockOnWindowBlur}
                      onChange={(e) => handleToggleFocusBlur(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-elevated border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:border-accent" />
                  </label>
                </div>

                {/* Inactivity Auto-Lock */}
                <div className="p-4 bg-background-secondary rounded-lg border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-accent" />
                      <span className="text-xs sm:text-sm font-medium text-text-primary">Inactivity Auto-Lock</span>
                    </div>
                    <span className="text-xs font-mono text-accent bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-lg tabular-nums">
                      {autoLockDuration === 0 ? 'Disabled' : `${autoLockDuration} min`}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    Automatically lock the application after idle time when no mouse or keyboard activity is registered.
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
                        className={`py-2 px-3 rounded-lg text-xs font-medium transition-all text-center border ${
                          autoLockDuration === option.value
                            ? 'bg-accent text-white border-accent shadow-sm'
                            : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-border-hover'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: PLAYBACK & AUDIO PREFERENCES */}
        {activeTab === 'player' && (
          <div className="space-y-6">
            <section className="bg-surface border border-border rounded-xl p-5 sm:p-6 space-y-5">
              <div className="border-b border-border pb-3">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <PlaySquare className="w-4 h-4 text-accent" />
                  Player Default Settings
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Set default playback speed, skip increments, and resume state across all videos.
                </p>
              </div>

              <div className="space-y-4">
                {/* Default Speed */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-text-secondary">Default Playback Speed</label>
                    <span className="text-xs font-mono text-accent tabular-nums">{defaultPlaybackSpeed}x</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setDefaultPlaybackSpeed(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                          defaultPlaybackSpeed === s
                            ? 'bg-accent text-white border-accent'
                            : 'bg-background-secondary border-border text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Skip Intervals */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary">Seek Backward Jump</label>
                    <select
                      value={skipBackwardDuration}
                      onChange={(e) => setSkipBackwardDuration(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value={5}>5 seconds</option>
                      <option value={10}>10 seconds (default)</option>
                      <option value={15}>15 seconds</option>
                      <option value={30}>30 seconds</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary">Seek Forward Jump</label>
                    <select
                      value={skipForwardDuration}
                      onChange={(e) => setSkipForwardDuration(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value={5}>5 seconds</option>
                      <option value={10}>10 seconds (default)</option>
                      <option value={15}>15 seconds</option>
                      <option value={30}>30 seconds</option>
                      <option value={60}>60 seconds</option>
                    </select>
                  </div>
                </div>

                {/* Resume Position */}
                <div className="flex items-center justify-between p-3.5 bg-background-secondary rounded-lg border border-border">
                  <div>
                    <span className="text-xs sm:text-sm font-medium text-text-primary block">Resume Playback Position</span>
                    <span className="text-xs text-text-muted">Pick up where you left off when opening a previously played video</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={autoResume}
                      onChange={(e) => setAutoResume(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-elevated border border-border rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:border-accent" />
                  </label>
                </div>

                {/* Pause on tab switch */}
                <div className="flex items-center justify-between p-3.5 bg-background-secondary rounded-lg border border-border">
                  <div>
                    <span className="text-xs sm:text-sm font-medium text-text-primary block">Pause Audio on Inactive Tab</span>
                    <span className="text-xs text-text-muted">Mute/pause media playback when switching to other apps or tabs</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={pauseOnTabSwitch}
                      onChange={(e) => setPauseOnTabSwitch(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-elevated border border-border rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:border-accent" />
                  </label>
                </div>

                {/* Save watch history */}
                <div className="flex items-center justify-between p-3.5 bg-background-secondary rounded-lg border border-border">
                  <div>
                    <span className="text-xs sm:text-sm font-medium text-text-primary block">Record Watch Progress</span>
                    <span className="text-xs text-text-muted">Track progress bar on cards and continue watching shelf</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={saveWatchHistory}
                      onChange={(e) => setSaveWatchHistory(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-elevated border border-border rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:border-accent" />
                  </label>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSavePlayerPreferences}
                    disabled={isSaving}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving...' : 'Save Playback Defaults'}</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: DECOY VAULT MODE */}
        {activeTab === 'decoy' && (
          <div className="space-y-6">
            <section className="bg-surface border border-border rounded-xl p-5 sm:p-6 space-y-5">
              <div className="border-b border-border pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-accent" />
                    Decoy Mode Configuration
                  </h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    Instantly replace the library with a realistic harmless study or work interface.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={enterDecoyMode}
                  className="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border text-text-primary text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-accent" />
                  <span>Preview Decoy</span>
                </button>
              </div>

              {decoySavedMsg && (
                <div className="p-3 text-xs bg-success/10 border border-success/20 text-success rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{decoySavedMsg}</span>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateDecoyConfig({
                    enabled: decoyEnabled,
                    preset: decoyPreset,
                    title: decoyTitle,
                    shortcut: decoyShortcut,
                    exitPin: decoyPin,
                  });
                  setDecoySavedMsg('Decoy mode configuration saved successfully!');
                  setTimeout(() => setDecoySavedMsg(''), 4000);
                }}
                className="space-y-4"
              >
                {/* Enable Decoy */}
                <div className="flex items-start justify-between p-4 bg-background-secondary rounded-lg border border-border gap-4">
                  <div className="space-y-1">
                    <span className="text-xs sm:text-sm font-medium text-text-primary">Enable Decoy Mode</span>
                    <p className="text-xs text-text-secondary leading-relaxed max-w-xl">
                      When triggered via keyboard shortcut or header button, pauses all active video and renders a benign mock application. Enter your exit PIN to return.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={decoyEnabled}
                      onChange={(e) => setDecoyEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-elevated border border-border rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:border-accent" />
                  </label>
                </div>

                {/* Preset Options */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-secondary">Decoy Interface Template</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        id: 'research' as DecoyPreset,
                        name: 'Academic Notes',
                        desc: 'Lecture syllabus & physics notes',
                        icon: BookOpen,
                      },
                      {
                        id: 'tasks' as DecoyPreset,
                        name: 'Project Task Board',
                        desc: 'Sprint checklist & tickets',
                        icon: CheckSquare,
                      },
                      {
                        id: 'spreadsheet' as DecoyPreset,
                        name: 'Financial Ledger',
                        desc: 'Corporate budget & run rate',
                        icon: FileSpreadsheet,
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = decoyPreset === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setDecoyPreset(item.id)}
                          className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                            active
                              ? 'bg-accent-subtle border-accent text-text-primary'
                              : 'bg-background-secondary border-border text-text-secondary hover:text-text-primary hover:border-border-hover'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={`w-4 h-4 ${active ? 'text-accent' : 'text-text-muted'}`} />
                            <span className="text-xs font-semibold">{item.name}</span>
                          </div>
                          <p className="text-[11px] text-text-muted">{item.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Configuration Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary">Emergency Shortcut</label>
                    <input
                      type="text"
                      value={decoyShortcut}
                      onChange={(e) => setDecoyShortcut(e.target.value)}
                      placeholder="Alt+D"
                      className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary">Decoy Exit PIN</label>
                    <input
                      type="password"
                      value={decoyPin}
                      onChange={(e) => setDecoyPin(e.target.value)}
                      placeholder="1234"
                      className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary">Header Title</label>
                    <input
                      type="text"
                      value={decoyTitle}
                      onChange={(e) => setDecoyTitle(e.target.value)}
                      placeholder="Quantum Computing Notes"
                      className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Decoy Preferences</span>
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {/* TAB 4: BIOMETRIC UNLOCK & PASSKEYS */}
        {activeTab === 'biometrics' && (
          <div className="space-y-6">
            <section className="bg-surface border border-border rounded-xl p-5 sm:p-6 space-y-5">
              <div className="border-b border-border pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <Fingerprint className="w-4 h-4 text-accent" />
                    Biometric Unlock & Passkeys
                  </h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    Use Touch ID, Face ID, or Windows Hello for instant vault unlock without typing your password.
                  </p>
                </div>
                <span
                  className={`text-[11px] font-mono px-2.5 py-1 rounded-md border ${
                    isBiometricAvailable
                      ? 'bg-success/10 border-success/20 text-success'
                      : 'bg-surface-elevated border-border text-text-muted'
                  }`}
                >
                  {isBiometricAvailable ? 'Hardware Supported' : 'Standard WebAuthn'}
                </span>
              </div>

              {biometricMsg && (
                <div
                  className={`p-3 text-xs rounded-lg flex items-center gap-2 ${
                    biometricMsg.error
                      ? 'bg-danger/10 border border-danger/20 text-danger'
                      : 'bg-success/10 border border-success/20 text-success'
                  }`}
                >
                  {biometricMsg.error ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  <span>{biometricMsg.text}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-background-secondary rounded-lg border border-border gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-text-primary">Device Platform Authenticator</span>
                    {hasBiometricRegistered && (
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-success/15 border border-success/30 text-success font-semibold">
                        Registered
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed max-w-lg">
                    Authenticate directly using your fingerprint, facial recognition, or device PIN via WebAuthn credentials stored locally on this machine.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {hasBiometricRegistered ? (
                    <button
                      type="button"
                      onClick={() => {
                        removeBiometricPasskey();
                        setBiometricMsg({ text: 'Biometric passkey removed from this device.' });
                        setTimeout(() => setBiometricMsg(null), 3000);
                      }}
                      className="px-3.5 py-2 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      Remove Passkey
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        setIsRegisteringBiometric(true);
                        setBiometricMsg(null);
                        try {
                          const res = await registerBiometricPasskey();
                          if (res.success) {
                            setBiometricMsg({ text: res.message || 'Passkey registered!' });
                          } else {
                            setBiometricMsg({ text: res.message || 'Registration canceled.', error: true });
                          }
                        } catch (err: any) {
                          setBiometricMsg({ text: err.message || 'Failed.', error: true });
                        } finally {
                          setIsRegisteringBiometric(false);
                        }
                      }}
                      disabled={isRegisteringBiometric}
                      className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Fingerprint className="w-4 h-4" />
                      <span>{isRegisteringBiometric ? 'Registering...' : 'Register Passkey'}</span>
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 5: SECURITY & MASTER PASSWORD */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Master Password Change */}
            <section className="bg-surface border border-border rounded-xl p-5 sm:p-6 space-y-5">
              <div className="border-b border-border pb-3">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-accent" />
                  Master Vault Password
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Update the master administrator credentials required to unlock your encrypted library.
                </p>
              </div>

              {passwordSuccessMsg && (
                <div className="p-3 text-xs bg-success/10 border border-success/20 text-success rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{passwordSuccessMsg}</span>
                </div>
              )}

              {passwordErrorMsg && (
                <div className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{passwordErrorMsg}</span>
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-xl">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">Current Master Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPass ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password..."
                      required
                      className="w-full px-3 py-2 pr-10 bg-background-secondary border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute right-3 top-2.5 text-text-muted hover:text-text-primary"
                    >
                      {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary">New Password (min 8 chars)</label>
                    <div className="relative">
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password..."
                        required
                        minLength={8}
                        className="w-full px-3 py-2 pr-10 bg-background-secondary border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="absolute right-3 top-2.5 text-text-muted hover:text-text-primary"
                      >
                        {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary">Confirm New Password</label>
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password..."
                      required
                      minLength={8}
                      className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isUpdatingPassword || !currentPassword || !newPassword}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{isUpdatingPassword ? 'Updating Password...' : 'Update Password'}</span>
                  </button>
                </div>
              </form>
            </section>

            {/* Danger Zone: Clear History */}
            <section className="bg-surface border border-danger/20 rounded-xl p-5 sm:p-6 space-y-4">
              <div className="border-b border-danger/10 pb-3">
                <h3 className="text-sm font-semibold text-danger flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Danger Zone
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Reset viewing statistics, playback bookmarks, and watch history records across all files.
                </p>
              </div>

              {historyClearMsg && (
                <div className="p-3 text-xs bg-success/10 border border-success/20 text-success rounded-lg">
                  {historyClearMsg}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-danger/5 border border-danger/15 rounded-lg">
                <div className="space-y-1">
                  <span className="text-xs sm:text-sm font-medium text-text-primary">Clear All Watch Progress</span>
                  <p className="text-xs text-text-muted">
                    Removes all playback resumes, progress percentages, and continue watching markers. Video files are untouched.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  disabled={isClearingHistory}
                  className="px-3.5 py-2 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 text-xs font-medium rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {isClearingHistory ? 'Clearing...' : 'Clear History'}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
