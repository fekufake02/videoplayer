'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { useUpload } from '../context/UploadContext';
import {
  Menu,
  Lock,
  EyeOff,
  Plus,
  Settings as SettingsIcon,
  LogOut,
  Search,
  BookOpen,
} from 'lucide-react';

interface NavbarProps {
  onOpenUpload?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenUpload,
  searchQuery,
  onSearchChange,
  onToggleMobileMenu,
}) => {
  const { isPrivacyActive, togglePrivacyMode, lockApp, logout, decoyConfig, enterDecoyMode } = useAuth();
  const { openUploadModal } = useUpload();
  const handleUploadClick = onOpenUpload || openUploadModal;

  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Global Cmd+K / Ctrl+K keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < 15) {
        setIsVisible(true);
        lastScrollY.current = currentScrollY;
        return;
      }
      if (currentScrollY > lastScrollY.current && currentScrollY > 70) {
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY.current) {
        setIsVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      id="main-navbar"
      className={`sticky top-0 z-40 bg-[#0E1017]/90 backdrop-blur-md border-b border-white/[0.07] px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4 transition-transform duration-200 ease-out select-none ${
        isVisible ? 'translate-y-0' : '-translate-y-full shadow-none'
      }`}
    >
      {/* Left: Mobile Menu + Vault Emblem */}
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.05] lg:hidden transition-colors cursor-pointer"
            title="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 text-white font-extrabold flex items-center justify-center text-sm shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform tracking-tight">
            V
          </div>
          <span className="font-extrabold text-base text-white tracking-tight hidden sm:inline">
            My Vault
          </span>
        </Link>
      </div>

      {/* Center: Search Bar with Cmd+K hint */}
      {onSearchChange !== undefined && (
        <div className="flex-1 max-w-md relative hidden md:block">
          <Search className="w-3.5 h-3.5 absolute left-3.5 top-3 text-slate-500" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search videos by title, tags, or notes..."
            value={searchQuery || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-14 py-1.5 bg-[#131620] border border-white/[0.07] rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-colors"
          />
          <div className="absolute right-2.5 top-2 pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-500 bg-white/[0.05] border border-white/[0.08] rounded">
              ⌘K
            </kbd>
          </div>
        </div>
      )}

      {/* Right Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleUploadClick}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white text-xs font-semibold rounded-lg transition-all shadow-sm shadow-indigo-500/20 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Upload</span>
        </button>

        {/* Privacy Toggle */}
        <button
          onClick={togglePrivacyMode}
          title="Toggle Privacy Mode (Shortcut: P)"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            isPrivacyActive
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              : 'bg-[#131620] border-white/[0.07] text-slate-300 hover:bg-[#191D29]'
          }`}
        >
          <EyeOff className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Privacy</span>
        </button>

        {/* Panic Lock */}
        <button
          onClick={lockApp}
          title="Emergency Lock (Shortcut: Ctrl+Shift+L)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#131620] border border-white/[0.07] hover:bg-[#191D29] text-amber-400 rounded-lg text-xs font-medium transition-colors cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Lock</span>
        </button>

        {/* Quick Decoy Mode */}
        {decoyConfig?.enabled && (
          <button
            onClick={enterDecoyMode}
            title={`Decoy Screen (${decoyConfig.shortcut || 'Alt+D'})`}
            className="p-1.5 bg-[#131620] border border-white/[0.07] hover:bg-[#191D29] text-indigo-400 rounded-lg transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Settings */}
        <Link
          href="/settings"
          className="p-1.5 bg-[#131620] border border-white/[0.07] hover:bg-[#191D29] text-slate-300 rounded-lg transition-colors"
          title="Settings & Preferences"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
        </Link>

        {/* Logout */}
        <button
          onClick={logout}
          title="Sign Out"
          className="p-1.5 bg-[#131620] border border-white/[0.07] hover:bg-rose-950/30 hover:border-rose-800/40 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
