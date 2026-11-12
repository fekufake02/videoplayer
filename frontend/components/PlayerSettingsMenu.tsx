'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Gauge,
  Monitor,
  Volume2,
  Subtitles,
  Timer,
  Shield,
  Info,
  Check,
  RotateCcw,
  PictureInPicture,
  Lock,
  EyeOff,
} from 'lucide-react';

export type AspectRatioOption = 'original' | 'fit' | 'fill' | '16:9' | '4:3';
export type AudioPreset = 'normal' | 'vocal' | 'bass' | 'treble';

export interface VideoInfoDetails {
  filename?: string;
  format?: string;
  resolution?: string;
  fileSize?: string;
  duration?: string;
  source?: string;
  status?: string;
}

interface PlayerSettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  skipInterval: number;
  onSkipIntervalChange: (sec: number) => void;
  autoPlayNext: boolean;
  onAutoPlayNextToggle: () => void;
  isLooping: boolean;
  onLoopToggle: () => void;
  aspectRatio: AspectRatioOption;
  onAspectRatioChange: (ratio: AspectRatioOption) => void;
  audioPreset: AudioPreset;
  onAudioPresetChange: (preset: AudioPreset) => void;
  sleepTimer: number | null;
  onSleepTimerChange: (minutes: number | null) => void;
  subtitlesEnabled: boolean;
  onSubtitlesToggle: () => void;
  videoInfo: VideoInfoDetails;
  onTogglePictureInPicture?: () => void;
  onTogglePrivacyMode?: () => void;
  onPanicLock?: () => void;
}

type SubMenuType = 'main' | 'speed' | 'skip' | 'aspect' | 'audio' | 'timer' | 'info';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const SKIP_OPTIONS = [5, 10, 15, 30];
const ASPECT_OPTIONS: { id: AspectRatioOption; label: string; desc: string }[] = [
  { id: 'original', label: 'Original', desc: 'Maintain native aspect ratio' },
  { id: 'fit', label: 'Fit to Window', desc: 'Contain within viewport' },
  { id: 'fill', label: 'Fill / Crop', desc: 'Cover entire container' },
  { id: '16:9', label: '16:9 Widescreen', desc: 'Force standard HD ratio' },
  { id: '4:3', label: '4:3 Classic', desc: 'Standard TV ratio' },
];
const AUDIO_PRESETS: { id: AudioPreset; label: string; desc: string }[] = [
  { id: 'normal', label: 'Balanced', desc: 'Standard studio audio curve' },
  { id: 'vocal', label: 'Vocal Clarity', desc: 'Enhanced mid-range speech' },
  { id: 'bass', label: 'Bass Boost', desc: 'Deeper low frequencies' },
  { id: 'treble', label: 'Treble Boost', desc: 'Crisper highs & details' },
];
const TIMER_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: 'Off', minutes: null },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '60 minutes', minutes: 60 },
];

export const PlayerSettingsMenu: React.FC<PlayerSettingsMenuProps> = ({
  isOpen,
  onClose,
  playbackSpeed,
  onPlaybackSpeedChange,
  skipInterval,
  onSkipIntervalChange,
  autoPlayNext,
  onAutoPlayNextToggle,
  isLooping,
  onLoopToggle,
  aspectRatio,
  onAspectRatioChange,
  audioPreset,
  onAudioPresetChange,
  sleepTimer,
  onSleepTimerChange,
  subtitlesEnabled,
  onSubtitlesToggle,
  videoInfo,
  onTogglePictureInPicture,
  onTogglePrivacyMode,
  onPanicLock,
}) => {
  const [currentMenu, setCurrentMenu] = useState<SubMenuType>('main');
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Reset to main menu when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentMenu('main');
    }
  }, [isOpen]);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (currentMenu !== 'main') {
          setCurrentMenu('main');
        } else {
          onClose();
        }
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, currentMenu, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile Dimmed Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50 sm:hidden transition-opacity"
        onClick={onClose}
      />

      {/* Menu Container: Floating Popover on Desktop, Bottom Sheet on Mobile */}
      <div
        ref={panelRef}
        className="fixed sm:absolute bottom-0 sm:bottom-14 right-0 sm:right-3 w-full sm:w-[320px] max-h-[85vh] sm:max-h-[500px] overflow-y-auto bg-[#131620] border-t sm:border border-white/[0.08] rounded-t-2xl sm:rounded-xl shadow-2xl z-50 text-slate-200 select-none flex flex-col font-sans"
        style={{ animation: 'fadeIn 160ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] bg-[#191D29]/70 shrink-0">
          <div className="flex items-center gap-2">
            {currentMenu !== 'main' ? (
              <button
                onClick={() => setCurrentMenu('main')}
                className="p-1 -ml-1 text-slate-400 hover:text-white rounded-md transition-colors"
                title="Back to settings menu"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            ) : null}
            <span className="text-xs font-semibold text-white tracking-wide uppercase">
              {currentMenu === 'main'
                ? 'Playback Settings'
                : currentMenu === 'speed'
                ? 'Playback Speed'
                : currentMenu === 'skip'
                ? 'Skip Interval'
                : currentMenu === 'aspect'
                ? 'Aspect Ratio'
                : currentMenu === 'audio'
                ? 'Audio Equalizer'
                : currentMenu === 'timer'
                ? 'Sleep Timer'
                : 'Video Details'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-md transition-colors"
            title="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-1.5 divide-y divide-white/[0.05] text-xs">
          {currentMenu === 'main' && (
            <>
              {/* PLAYBACK */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Playback
                </div>
                <button
                  onClick={() => setCurrentMenu('speed')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Speed</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 font-mono">
                    <span>{playbackSpeed}x</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                </button>

                <button
                  onClick={() => setCurrentMenu('skip')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Skip Interval</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 font-mono">
                    <span>{skipInterval}s</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                </button>

                <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors">
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <span>Auto Play Next</span>
                  </div>
                  <button
                    onClick={onAutoPlayNextToggle}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      autoPlayNext ? 'bg-indigo-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        autoPlayNext ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors">
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <span>Loop Video</span>
                  </div>
                  <button
                    onClick={onLoopToggle}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      isLooping ? 'bg-indigo-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        isLooping ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* DISPLAY */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Display
                </div>
                <button
                  onClick={() => setCurrentMenu('aspect')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Aspect Ratio</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span className="capitalize">{aspectRatio}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                </button>

                {onTogglePictureInPicture && (
                  <button
                    onClick={() => {
                      onTogglePictureInPicture();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 text-slate-300">
                      <PictureInPicture className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Picture in Picture</span>
                    </div>
                  </button>
                )}
              </div>

              {/* AUDIO */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Audio
                </div>
                <button
                  onClick={() => setCurrentMenu('audio')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Audio Profile</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 capitalize">
                    <span>{audioPreset}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                </button>
              </div>

              {/* SUBTITLES */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Subtitles
                </div>
                <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors">
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <Subtitles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Closed Captions</span>
                  </div>
                  <button
                    onClick={onSubtitlesToggle}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      subtitlesEnabled ? 'bg-indigo-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        subtitlesEnabled ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* TIMER */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Timer
                </div>
                <button
                  onClick={() => setCurrentMenu('timer')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <Timer className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Sleep Timer</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span>{sleepTimer ? `${sleepTimer}m` : 'Off'}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                </button>
              </div>

              {/* PRIVACY & SECURITY */}
              {(onTogglePrivacyMode || onPanicLock) && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Privacy
                  </div>
                  {onTogglePrivacyMode && (
                    <button
                      onClick={() => {
                        onTogglePrivacyMode();
                        onClose();
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 text-slate-300">
                        <EyeOff className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Privacy Mode (P)</span>
                      </div>
                    </button>
                  )}
                  {onPanicLock && (
                    <button
                      onClick={() => {
                        onPanicLock();
                        onClose();
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-rose-950/30 text-rose-300 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Lock className="w-3.5 h-3.5 text-rose-400" />
                        <span>Panic Lock</span>
                      </div>
                    </button>
                  )}
                </div>
              )}

              {/* INFORMATION */}
              <div className="py-1">
                <button
                  onClick={() => setCurrentMenu('info')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <Info className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Video Information</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
            </>
          )}

          {/* SUBMENU: SPEED */}
          {currentMenu === 'speed' && (
            <div className="space-y-0.5 py-1">
              {SPEED_OPTIONS.map((spd) => (
                <button
                  key={spd}
                  onClick={() => {
                    onPlaybackSpeedChange(spd);
                    setCurrentMenu('main');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                    playbackSpeed === spd
                      ? 'bg-indigo-500/15 text-indigo-300 font-semibold'
                      : 'hover:bg-white/[0.06] text-slate-300'
                  }`}
                >
                  <span className="font-mono">{spd}x</span>
                  {playbackSpeed === spd && <Check className="w-4 h-4 text-indigo-400" />}
                </button>
              ))}
            </div>
          )}

          {/* SUBMENU: SKIP INTERVAL */}
          {currentMenu === 'skip' && (
            <div className="space-y-0.5 py-1">
              {SKIP_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => {
                    onSkipIntervalChange(sec);
                    setCurrentMenu('main');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                    skipInterval === sec
                      ? 'bg-indigo-500/15 text-indigo-300 font-semibold'
                      : 'hover:bg-white/[0.06] text-slate-300'
                  }`}
                >
                  <span className="font-mono">{sec} seconds</span>
                  {skipInterval === sec && <Check className="w-4 h-4 text-indigo-400" />}
                </button>
              ))}
            </div>
          )}

          {/* SUBMENU: ASPECT RATIO */}
          {currentMenu === 'aspect' && (
            <div className="space-y-0.5 py-1">
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onAspectRatioChange(opt.id);
                    setCurrentMenu('main');
                  }}
                  className={`w-full flex items-start justify-between px-3 py-2 rounded-lg transition-colors text-left ${
                    aspectRatio === opt.id
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'hover:bg-white/[0.06] text-slate-300'
                  }`}
                >
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-[11px] text-slate-500">{opt.desc}</div>
                  </div>
                  {aspectRatio === opt.id && <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>
          )}

          {/* SUBMENU: AUDIO PRESETS */}
          {currentMenu === 'audio' && (
            <div className="space-y-0.5 py-1">
              {AUDIO_PRESETS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onAudioPresetChange(opt.id);
                    setCurrentMenu('main');
                  }}
                  className={`w-full flex items-start justify-between px-3 py-2 rounded-lg transition-colors text-left ${
                    audioPreset === opt.id
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'hover:bg-white/[0.06] text-slate-300'
                  }`}
                >
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-[11px] text-slate-500">{opt.desc}</div>
                  </div>
                  {audioPreset === opt.id && <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>
          )}

          {/* SUBMENU: SLEEP TIMER */}
          {currentMenu === 'timer' && (
            <div className="space-y-0.5 py-1">
              {TIMER_OPTIONS.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onSleepTimerChange(opt.minutes);
                    setCurrentMenu('main');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                    sleepTimer === opt.minutes
                      ? 'bg-indigo-500/15 text-indigo-300 font-semibold'
                      : 'hover:bg-white/[0.06] text-slate-300'
                  }`}
                >
                  <span>{opt.label}</span>
                  {sleepTimer === opt.minutes && <Check className="w-4 h-4 text-indigo-400" />}
                </button>
              ))}
            </div>
          )}

          {/* SUBMENU: VIDEO DETAILS */}
          {currentMenu === 'info' && (
            <div className="space-y-2 p-3 font-mono text-[11px]">
              <div className="flex justify-between border-b border-white/[0.05] pb-1.5">
                <span className="text-slate-500">File Name</span>
                <span className="text-slate-200 truncate max-w-[160px]">{videoInfo.filename || 'media.mp4'}</span>
              </div>
              <div className="flex justify-between border-b border-white/[0.05] pb-1.5">
                <span className="text-slate-500">Resolution</span>
                <span className="text-slate-200">{videoInfo.resolution || '1920x1080 (HD)'}</span>
              </div>
              <div className="flex justify-between border-b border-white/[0.05] pb-1.5">
                <span className="text-slate-500">Format</span>
                <span className="text-slate-200 uppercase">{videoInfo.format || 'MP4 / H.264'}</span>
              </div>
              <div className="flex justify-between border-b border-white/[0.05] pb-1.5">
                <span className="text-slate-500">File Size</span>
                <span className="text-slate-200">{videoInfo.fileSize || 'Unknown'}</span>
              </div>
              <div className="flex justify-between border-b border-white/[0.05] pb-1.5">
                <span className="text-slate-500">Duration</span>
                <span className="text-slate-200">{videoInfo.duration || '00:00'}</span>
              </div>
              <div className="flex justify-between border-b border-white/[0.05] pb-1.5">
                <span className="text-slate-500">Source</span>
                <span className="text-indigo-300 font-bold">{videoInfo.source || 'Vault Storage'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Stream Status</span>
                <span className="text-emerald-400 font-semibold">{videoInfo.status || 'Active & Secured'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
