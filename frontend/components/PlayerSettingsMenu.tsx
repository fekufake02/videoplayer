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
  Bookmark,
  Layers,
  Repeat,
  Plus,
  Trash2,
} from 'lucide-react';
import { IBookmark, IChapter } from '../types';
import { formatTimestamp } from '../lib/collectionsManager';

export type AspectRatioOption = 'original' | 'fit' | 'fill' | '16:9' | '4:3';
export type AudioPreset = 'normal' | 'vocal' | 'bass' | 'treble' | 'night';

export interface VideoInfoDetails {
  filename?: string;
  format?: string;
  resolution?: string;
  fileSize?: string;
  duration?: string;
  source?: string;
  status?: string;
}

export interface AbRepeatState {
  pointA: number | null;
  pointB: number | null;
  active: boolean;
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
  sleepTimer: number | 'end' | null;
  sleepTimerRemainingSec?: number | null;
  onSleepTimerChange: (val: number | 'end' | null) => void;
  subtitlesEnabled: boolean;
  onSubtitlesToggle: () => void;
  videoInfo: VideoInfoDetails;
  onTogglePictureInPicture?: () => void;
  onTogglePrivacyMode?: () => void;
  onPanicLock?: () => void;

  // Advanced features
  bookmarks?: IBookmark[];
  onAddBookmark?: () => void;
  onJumpToBookmark?: (sec: number) => void;
  onDeleteBookmark?: (id: string) => void;
  chapters?: IChapter[];
  onJumpToChapter?: (sec: number) => void;
  abRepeat?: AbRepeatState;
  onSetPointA?: () => void;
  onSetPointB?: () => void;
  onClearAbRepeat?: () => void;
  onToggleAbRepeat?: () => void;
  currentTime?: number;
}

type SubMenuType = 'main' | 'speed' | 'skip' | 'aspect' | 'audio' | 'timer' | 'subtitles' | 'bookmarks' | 'chapters' | 'ab' | 'info';

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
  { id: 'normal', label: 'Balanced (Studio)', desc: 'Flat studio audio curve' },
  { id: 'vocal', label: 'Voice Clarity', desc: 'Low cut + dialogue boost' },
  { id: 'bass', label: 'Bass Boost', desc: '+7.5 dB low shelf punch' },
  { id: 'night', label: 'Night Mode', desc: 'Dynamics compression for loud peaks' },
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
  sleepTimerRemainingSec,
  onSleepTimerChange,
  subtitlesEnabled,
  onSubtitlesToggle,
  videoInfo,
  onTogglePictureInPicture,
  onTogglePrivacyMode,
  onPanicLock,
  bookmarks = [],
  onAddBookmark,
  onJumpToBookmark,
  onDeleteBookmark,
  chapters = [],
  onJumpToChapter,
  abRepeat,
  onSetPointA,
  onSetPointB,
  onClearAbRepeat,
  onToggleAbRepeat,
  currentTime = 0,
}) => {
  const [currentMenu, setCurrentMenu] = useState<SubMenuType>('main');
  const [customTimerMinutes, setCustomTimerMinutes] = useState<string>('');
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

  const handleApplyCustomTimer = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customTimerMinutes, 10);
    if (!isNaN(val) && val > 0 && val <= 360) {
      onSleepTimerChange(val);
      setCurrentMenu('main');
    }
  };

  return (
    <>
      {/* Mobile Dimmed Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50 sm:hidden transition-opacity"
        onClick={onClose}
      />

      {/* Menu Container: Floating Popover on Desktop (320px), Bottom Sheet on Mobile */}
      <div
        ref={panelRef}
        className="fixed sm:absolute bottom-0 sm:bottom-14 right-0 sm:right-3 w-full sm:w-[320px] max-h-[85vh] sm:max-h-[520px] overflow-y-auto bg-[#151925] border-t sm:border border-white/[0.09] rounded-t-[24px] sm:rounded-2xl shadow-[0_16px_50px_rgba(0,0,0,0.45)] z-50 text-[#F4F5FA] select-none flex flex-col font-sans animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-[#191D29]/70 shrink-0">
          <div className="flex items-center gap-2">
            {currentMenu !== 'main' ? (
              <button
                onClick={() => setCurrentMenu('main')}
                className="p-1 -ml-1 text-[#A1A6B5] hover:text-[#F4F5FA] rounded-md transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center focus-visible:outline-accent"
                aria-label="Back to settings menu"
                title="Back to settings menu"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            ) : null}
            <span className="text-xs font-semibold text-[#F4F5FA] tracking-wide uppercase">
              {currentMenu === 'main'
                ? 'Playback Settings'
                : currentMenu === 'speed'
                ? 'Playback Speed'
                : currentMenu === 'skip'
                ? 'Skip Interval'
                : currentMenu === 'aspect'
                ? 'Aspect Ratio'
                : currentMenu === 'audio'
                ? 'Audio Equalizer (DSP)'
                : currentMenu === 'timer'
                ? 'Sleep Timer'
                : currentMenu === 'subtitles'
                ? 'Subtitles & Captions'
                : currentMenu === 'bookmarks'
                ? 'Saved Bookmarks'
                : currentMenu === 'chapters'
                ? 'Video Chapters'
                : currentMenu === 'ab'
                ? 'A-B Loop Repeat'
                : 'Video Details'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#A1A6B5] hover:text-[#F4F5FA] rounded-md transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center focus-visible:outline-accent"
            aria-label="Close menu"
            title="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-white/[0.06] text-xs">
          {currentMenu === 'main' && (
            <>
              {/* PLAYBACK */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-[#73798B] uppercase tracking-wider">
                  Playback
                </div>
                <button
                  onClick={() => setCurrentMenu('speed')}
                  className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                >
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <Gauge className="w-[17px] h-[17px] text-accent" />
                    <span className="text-[13px]">Speed</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#A1A6B5] font-mono">
                    <span>{playbackSpeed}x</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#73798B]" />
                  </div>
                </button>

                <button
                  onClick={() => setCurrentMenu('skip')}
                  className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                >
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <RotateCcw className="w-[17px] h-[17px] text-accent" />
                    <span className="text-[13px]">Skip Interval</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#A1A6B5] font-mono">
                    <span>{skipInterval}s</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#73798B]" />
                  </div>
                </button>

                <div className="flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors">
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <span className="text-[13px]">Auto Play Next</span>
                  </div>
                  <button
                    onClick={onAutoPlayNextToggle}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      autoPlayNext ? 'bg-accent' : 'bg-slate-700'
                    }`}
                    aria-label="Toggle auto play next"
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        autoPlayNext ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors">
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <span className="text-[13px]">Loop Video</span>
                  </div>
                  <button
                    onClick={onLoopToggle}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      isLooping ? 'bg-accent' : 'bg-slate-700'
                    }`}
                    aria-label="Toggle loop video"
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        isLooping ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* NAVIGATION & REPEAT */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-[#73798B] uppercase tracking-wider">
                  Markers & Repeat
                </div>
                <button
                  onClick={() => setCurrentMenu('bookmarks')}
                  className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                >
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <Bookmark className="w-[17px] h-[17px] text-amber-400" />
                    <span className="text-[13px]">Bookmarks</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#A1A6B5]">
                    <span>{bookmarks.length} saved</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#73798B]" />
                  </div>
                </button>

                <button
                  onClick={() => setCurrentMenu('chapters')}
                  className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                >
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <Layers className="w-[17px] h-[17px] text-indigo-400" />
                    <span className="text-[13px]">Chapters</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#A1A6B5]">
                    <span>{chapters.length} sections</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#73798B]" />
                  </div>
                </button>

                <button
                  onClick={() => setCurrentMenu('ab')}
                  className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                >
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <Repeat className="w-[17px] h-[17px] text-emerald-400" />
                    <span className="text-[13px]">A-B Loop Repeat</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#A1A6B5]">
                    <span>{abRepeat?.active ? 'Active' : 'Off'}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#73798B]" />
                  </div>
                </button>
              </div>

              {/* DISPLAY */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-[#73798B] uppercase tracking-wider">
                  Display
                </div>
                <button
                  onClick={() => setCurrentMenu('aspect')}
                  className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                >
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <Monitor className="w-[17px] h-[17px] text-accent" />
                    <span className="text-[13px]">Aspect Ratio</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#A1A6B5]">
                    <span className="capitalize">{aspectRatio}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#73798B]" />
                  </div>
                </button>

                {onTogglePictureInPicture && (
                  <button
                    onClick={() => {
                      onTogglePictureInPicture();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                  >
                    <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                      <PictureInPicture className="w-[17px] h-[17px] text-accent" />
                      <span className="text-[13px]">Picture in Picture</span>
                    </div>
                  </button>
                )}
              </div>

              {/* AUDIO DSP EQUALIZER */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-[#73798B] uppercase tracking-wider">
                  Audio
                </div>
                <button
                  onClick={() => setCurrentMenu('audio')}
                  className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                >
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <Volume2 className="w-[17px] h-[17px] text-accent" />
                    <span className="text-[13px]">Audio Equalizer</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#A1A6B5] capitalize">
                    <span>{audioPreset}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#73798B]" />
                  </div>
                </button>
              </div>

              {/* SUBTITLES */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-[#73798B] uppercase tracking-wider">
                  Subtitles
                </div>
                <button
                  onClick={() => setCurrentMenu('subtitles')}
                  className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                >
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <Subtitles className="w-[17px] h-[17px] text-accent" />
                    <span className="text-[13px]">Captions & Subtitles</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#A1A6B5]">
                    <span>{subtitlesEnabled ? 'English CC' : 'Off'}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#73798B]" />
                  </div>
                </button>
              </div>

              {/* TIMER */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-[#73798B] uppercase tracking-wider">
                  Timer
                </div>
                <button
                  onClick={() => setCurrentMenu('timer')}
                  className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                >
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <Timer className="w-[17px] h-[17px] text-accent" />
                    <span className="text-[13px]">Sleep Timer</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#A1A6B5]">
                    <span>
                      {sleepTimerRemainingSec && sleepTimerRemainingSec > 0
                        ? `${Math.floor(sleepTimerRemainingSec / 60)}m left`
                        : sleepTimer
                        ? `${sleepTimer}m`
                        : 'Off'}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#73798B]" />
                  </div>
                </button>
              </div>

              {/* PRIVACY & SECURITY */}
              {(onTogglePrivacyMode || onPanicLock) && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-[#73798B] uppercase tracking-wider">
                    Privacy
                  </div>
                  {onTogglePrivacyMode && (
                    <button
                      onClick={() => {
                        onTogglePrivacyMode();
                        onClose();
                      }}
                      className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                    >
                      <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                        <EyeOff className="w-[17px] h-[17px] text-accent" />
                        <span className="text-[13px]">Privacy Mode (P)</span>
                      </div>
                    </button>
                  )}
                  {onPanicLock && (
                    <button
                      onClick={() => {
                        onPanicLock();
                        onClose();
                      }}
                      className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-rose-950/30 text-rose-300 transition-colors focus-visible:outline-accent"
                    >
                      <div className="flex items-center gap-2.5">
                        <Lock className="w-[17px] h-[17px] text-rose-400" />
                        <span className="text-[13px]">Panic Lock</span>
                      </div>
                    </button>
                  )}
                </div>
              )}

              {/* INFORMATION */}
              <div className="py-1">
                <button
                  onClick={() => setCurrentMenu('info')}
                  className="w-full flex items-center justify-between px-3 h-11 rounded-[10px] hover:bg-white/[0.06] transition-colors focus-visible:outline-accent"
                >
                  <div className="flex items-center gap-2.5 text-[#F4F5FA]">
                    <Info className="w-[17px] h-[17px] text-accent" />
                    <span className="text-[13px]">Video Details</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#73798B]" />
                </button>
              </div>
            </>
          )}

          {/* SUBMENU: PLAYBACK SPEED */}
          {currentMenu === 'speed' && (
            <div className="py-1 space-y-0.5">
              {SPEED_OPTIONS.map((speed) => (
                <button
                  key={speed}
                  onClick={() => {
                    onPlaybackSpeedChange(speed);
                    setCurrentMenu('main');
                  }}
                  className={`w-full flex items-center justify-between px-3 h-11 rounded-[10px] transition-colors ${
                    playbackSpeed === speed
                      ? 'bg-[rgba(129,140,248,0.12)] text-[#A5B4FC] font-semibold'
                      : 'hover:bg-white/[0.06] text-[#A1A6B5]'
                  }`}
                >
                  <span className="font-mono text-[13px]">{speed}x</span>
                  {playbackSpeed === speed && <Check className="w-4 h-4 text-accent" />}
                </button>
              ))}
            </div>
          )}

          {/* SUBMENU: SKIP INTERVAL */}
          {currentMenu === 'skip' && (
            <div className="py-1 space-y-0.5">
              {SKIP_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => {
                    onSkipIntervalChange(sec);
                    setCurrentMenu('main');
                  }}
                  className={`w-full flex items-center justify-between px-3 h-11 rounded-[10px] transition-colors ${
                    skipInterval === sec
                      ? 'bg-[rgba(129,140,248,0.12)] text-[#A5B4FC] font-semibold'
                      : 'hover:bg-white/[0.06] text-[#A1A6B5]'
                  }`}
                >
                  <span className="text-[13px]">{sec} seconds</span>
                  {skipInterval === sec && <Check className="w-4 h-4 text-accent" />}
                </button>
              ))}
            </div>
          )}

          {/* SUBMENU: ASPECT RATIO */}
          {currentMenu === 'aspect' && (
            <div className="py-1 space-y-1">
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onAspectRatioChange(opt.id);
                    setCurrentMenu('main');
                  }}
                  className={`w-full flex items-start justify-between px-3 py-2 rounded-[10px] transition-colors text-left ${
                    aspectRatio === opt.id
                      ? 'bg-[rgba(129,140,248,0.12)] text-[#A5B4FC] font-semibold'
                      : 'hover:bg-white/[0.06] text-[#A1A6B5]'
                  }`}
                >
                  <div>
                    <div className="text-[13px] font-medium text-[#F4F5FA]">{opt.label}</div>
                    <div className="text-[11px] text-[#73798B] mt-0.5">{opt.desc}</div>
                  </div>
                  {aspectRatio === opt.id && <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>
          )}

          {/* SUBMENU: AUDIO EQUALIZER (DSP) */}
          {currentMenu === 'audio' && (
            <div className="py-1 space-y-1">
              <div className="px-3 pb-1 text-[11px] text-[#73798B]">
                Active Web Audio API hardware DSP processing:
              </div>
              {AUDIO_PRESETS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onAudioPresetChange(opt.id);
                    setCurrentMenu('main');
                  }}
                  className={`w-full flex items-start justify-between px-3 py-2.5 rounded-[10px] transition-colors text-left ${
                    audioPreset === opt.id
                      ? 'bg-[rgba(129,140,248,0.12)] text-[#A5B4FC] font-semibold'
                      : 'hover:bg-white/[0.06] text-[#A1A6B5]'
                  }`}
                >
                  <div>
                    <div className="text-[13px] font-medium text-[#F4F5FA]">{opt.label}</div>
                    <div className="text-[11px] text-[#73798B] mt-0.5">{opt.desc}</div>
                  </div>
                  {audioPreset === opt.id && <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>
          )}

          {/* SUBMENU: SUBTITLES */}
          {currentMenu === 'subtitles' && (
            <div className="py-1 space-y-1">
              <button
                onClick={() => {
                  if (subtitlesEnabled) onSubtitlesToggle();
                  setCurrentMenu('main');
                }}
                className={`w-full flex items-center justify-between px-3 h-11 rounded-[10px] transition-colors ${
                  !subtitlesEnabled
                    ? 'bg-[rgba(129,140,248,0.12)] text-[#A5B4FC] font-semibold'
                    : 'hover:bg-white/[0.06] text-[#A1A6B5]'
                }`}
              >
                <span className="text-[13px]">Off</span>
                {!subtitlesEnabled && <Check className="w-4 h-4 text-accent" />}
              </button>

              <button
                onClick={() => {
                  if (!subtitlesEnabled) onSubtitlesToggle();
                  setCurrentMenu('main');
                }}
                className={`w-full flex items-center justify-between px-3 h-11 rounded-[10px] transition-colors ${
                  subtitlesEnabled
                    ? 'bg-[rgba(129,140,248,0.12)] text-[#A5B4FC] font-semibold'
                    : 'hover:bg-white/[0.06] text-[#A1A6B5]'
                }`}
              >
                <div>
                  <div className="text-[13px] font-medium text-[#F4F5FA]">English CC (WebVTT)</div>
                  <div className="text-[11px] text-[#73798B]">Subtitles & transcript sync</div>
                </div>
                {subtitlesEnabled && <Check className="w-4 h-4 text-accent" />}
              </button>
            </div>
          )}

          {/* SUBMENU: BOOKMARKS */}
          {currentMenu === 'bookmarks' && (
            <div className="py-1 space-y-2">
              {onAddBookmark && (
                <button
                  onClick={onAddBookmark}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[10px] bg-accent/20 hover:bg-accent/30 text-accent font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Bookmark Current Time ({formatTimestamp(currentTime)})</span>
                </button>
              )}

              {bookmarks.length > 0 ? (
                <div className="space-y-1">
                  {bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      className="flex items-center justify-between px-3 py-2 rounded-[10px] bg-[#191D29] hover:bg-[#202534] transition-colors"
                    >
                      <button
                        onClick={() => {
                          onJumpToBookmark?.(bm.timestamp);
                          onClose();
                        }}
                        className="flex-1 text-left"
                      >
                        <div className="font-mono text-accent text-xs font-semibold">
                          {formatTimestamp(bm.timestamp)}
                        </div>
                        <div className="text-[11px] text-[#A1A6B5] truncate">{bm.label}</div>
                      </button>
                      {onDeleteBookmark && (
                        <button
                          onClick={() => onDeleteBookmark(bm.id)}
                          className="p-1 text-[#73798B] hover:text-rose-400 transition-colors ml-2"
                          title="Delete bookmark"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-[#73798B] text-xs">
                  No bookmarks added yet. Click above to save this moment.
                </div>
              )}
            </div>
          )}

          {/* SUBMENU: CHAPTERS */}
          {currentMenu === 'chapters' && (
            <div className="py-1 space-y-1">
              {chapters.length > 0 ? (
                chapters.map((ch, idx) => (
                  <button
                    key={ch.id}
                    onClick={() => {
                      onJumpToChapter?.(ch.startTime);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-left"
                  >
                    <div>
                      <div className="text-[11px] text-accent font-mono font-semibold">
                        Chapter {idx + 1} • {formatTimestamp(ch.startTime)}
                      </div>
                      <div className="text-[13px] text-[#F4F5FA] font-medium">{ch.title}</div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[#73798B]" />
                  </button>
                ))
              ) : (
                <div className="py-4 text-center text-[#73798B] text-xs">
                  No chapters defined for this media file.
                </div>
              )}
            </div>
          )}

          {/* SUBMENU: A-B LOOP REPEAT */}
          {currentMenu === 'ab' && (
            <div className="py-1 space-y-2 text-xs">
              <div className="text-[#A1A6B5] text-[12px] leading-relaxed">
                Repeat a specific segment of the video continuously.
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={onSetPointA}
                  className="px-3 py-2 rounded-[10px] bg-[#191D29] hover:bg-white/[0.08] transition-colors text-center border border-white/10"
                >
                  <div className="text-[10px] text-[#73798B] uppercase font-bold">Set Point A</div>
                  <div className="font-mono text-accent font-semibold mt-0.5">
                    {abRepeat?.pointA !== null && abRepeat?.pointA !== undefined
                      ? formatTimestamp(abRepeat.pointA)
                      : 'Not set'}
                  </div>
                </button>

                <button
                  onClick={onSetPointB}
                  className="px-3 py-2 rounded-[10px] bg-[#191D29] hover:bg-white/[0.08] transition-colors text-center border border-white/10"
                >
                  <div className="text-[10px] text-[#73798B] uppercase font-bold">Set Point B</div>
                  <div className="font-mono text-accent font-semibold mt-0.5">
                    {abRepeat?.pointB !== null && abRepeat?.pointB !== undefined
                      ? formatTimestamp(abRepeat.pointB)
                      : 'Not set'}
                  </div>
                </button>
              </div>

              {abRepeat?.pointA !== null && abRepeat?.pointB !== null && (
                <button
                  onClick={onToggleAbRepeat}
                  className={`w-full py-2 rounded-[10px] font-medium transition-colors ${
                    abRepeat?.active
                      ? 'bg-emerald-500 text-black font-semibold'
                      : 'bg-accent text-white'
                  }`}
                >
                  {abRepeat?.active ? 'Disable A-B Loop' : 'Enable A-B Loop'}
                </button>
              )}

              {(abRepeat?.pointA !== null || abRepeat?.pointB !== null) && (
                <button
                  onClick={onClearAbRepeat}
                  className="w-full py-1.5 rounded-[10px] text-rose-400 hover:bg-rose-950/30 transition-colors text-center"
                >
                  Clear A-B Repeat
                </button>
              )}
            </div>
          )}

          {/* SUBMENU: SLEEP TIMER */}
          {currentMenu === 'timer' && (
            <div className="py-1 space-y-1">
              {sleepTimerRemainingSec && sleepTimerRemainingSec > 0 ? (
                <div className="p-3 mb-2 rounded-[10px] bg-accent/15 border border-accent/30 text-accent text-center font-mono font-semibold text-xs">
                  Active: {Math.floor(sleepTimerRemainingSec / 60)}m {sleepTimerRemainingSec % 60}s remaining
                </div>
              ) : null}

              {/* Standard Options */}
              {[
                { label: 'Off', val: null },
                { label: '15 minutes', val: 15 },
                { label: '30 minutes', val: 30 },
                { label: '45 minutes', val: 45 },
                { label: '60 minutes', val: 60 },
                { label: 'End of current video', val: 'end' as const },
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => {
                    onSleepTimerChange(opt.val);
                    setCurrentMenu('main');
                  }}
                  className={`w-full flex items-center justify-between px-3 h-11 rounded-[10px] transition-colors ${
                    sleepTimer === opt.val
                      ? 'bg-[rgba(129,140,248,0.12)] text-[#A5B4FC] font-semibold'
                      : 'hover:bg-white/[0.06] text-[#A1A6B5]'
                  }`}
                >
                  <span className="text-[13px]">{opt.label}</span>
                  {sleepTimer === opt.val && <Check className="w-4 h-4 text-accent" />}
                </button>
              ))}

              {/* Custom Timer Input */}
              <form onSubmit={handleApplyCustomTimer} className="pt-2 border-t border-white/[0.06] flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="360"
                  placeholder="Custom mins..."
                  value={customTimerMinutes}
                  onChange={(e) => setCustomTimerMinutes(e.target.value)}
                  className="flex-1 bg-[#090A0F] border border-white/10 rounded-[10px] px-3 py-1.5 text-xs text-white placeholder-[#73798B] focus:border-accent outline-none"
                />
                <button
                  type="submit"
                  disabled={!customTimerMinutes}
                  className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-[10px] text-xs font-medium disabled:opacity-50"
                >
                  Set
                </button>
              </form>
            </div>
          )}

          {/* SUBMENU: VIDEO DETAILS (INFO) */}
          {currentMenu === 'info' && (
            <div className="py-2 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-[#73798B]">Filename:</span>
                <span className="text-[#F4F5FA] font-mono text-[11px] truncate max-w-[180px]">
                  {videoInfo.filename || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-[#73798B]">Format:</span>
                <span className="text-[#F4F5FA] font-mono text-[11px]">{videoInfo.format || 'MP4 (H.264 / AAC)'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-[#73798B]">Audio Processing:</span>
                <span className="text-emerald-400 font-mono text-[11px]">Hardware Web Audio DSP</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-[#73798B]">Duration:</span>
                <span className="text-[#F4F5FA] font-mono text-[11px]">{videoInfo.duration || 'Unknown'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-[#73798B]">File Size:</span>
                <span className="text-[#F4F5FA] font-mono text-[11px]">{videoInfo.fileSize || 'Unknown'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-[#73798B]">Storage Source:</span>
                <span className="text-[#F4F5FA] font-mono text-[11px]">{videoInfo.source || 'Vault Storage (B2)'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
