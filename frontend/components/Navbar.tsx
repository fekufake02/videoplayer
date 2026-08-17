'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, EyeOff, Plus, Settings as SettingsIcon, LogOut, Search } from 'lucide-react';

interface NavbarProps {
  onOpenUpload?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenUpload,
  searchQuery,
  onSearchChange,
}) => {
  const { isPrivacyActive, togglePrivacyMode, lockApp, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 glass-nav px-4 lg:px-8 py-3.5 flex items-center justify-between gap-4">
      {/* Brand Logo */}
      <Link href="/" className="flex items-center gap-2.5 group">
        <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-md">
          <Shield className="w-5 h-5" />
        </div>
        <span className="font-bold text-lg text-white tracking-tight hidden sm:inline">
          Private Library
        </span>
      </Link>

      {/* Optional Search Bar */}
      {onSearchChange !== undefined && (
        <div className="flex-1 max-w-md relative hidden md:block">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search videos by title, tags, or notes..."
            value={searchQuery || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* Header Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {onOpenUpload && (
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Upload</span>
          </button>
        )}

        {/* Privacy Toggle */}
        <button
          onClick={togglePrivacyMode}
          title="Toggle Privacy Mode (Shortcut: P)"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
            isPrivacyActive
              ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <EyeOff className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Privacy</span>
        </button>

        {/* Emergency Lock */}
        <button
          onClick={lockApp}
          title="Emergency Lock (Shortcut: Ctrl+Shift+L)"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-medium transition-all"
        >
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Lock</span>
        </button>

        {/* Settings */}
        <Link
          href="/settings"
          className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl transition-all"
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </Link>

        {/* Logout */}
        <button
          onClick={logout}
          title="Logout"
          className="p-2 bg-slate-900 border border-slate-800 hover:bg-rose-950/40 hover:border-rose-900/50 text-slate-400 hover:text-rose-400 rounded-xl transition-all"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
