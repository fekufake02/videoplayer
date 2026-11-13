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
  X,
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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const lastScrollY = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);

  // Global Cmd+K / Ctrl+K keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (window.innerWidth < 768 && onSearchChange !== undefined) {
          setMobileSearchOpen(true);
          setTimeout(() => mobileSearchInputRef.current?.focus(), 50);
        } else {
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSearchChange]);

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
      className={`sticky top-0 z-40 bg-[#0E1017]/95 backdrop-blur-md border-b border-white/[0.08] transition-transform duration-200 ease-out select-none ${
        isVisible ? 'translate-y-0' : '-translate-y-full shadow-none'
      }`}
    >
      <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3 sm:gap-4">
        {/* Left: Mobile Menu + Vault Emblem */}
        <div className="flex items-center gap-3 shrink-0 sm:min-w-[140px]">
          {onToggleMobileMenu && (
            <button
              onClick={onToggleMobileMenu}
              className="w-8 h-8 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.05] lg:hidden transition-colors cursor-pointer inline-flex items-center justify-center shrink-0"
              title="Open menu"
            >
              <Menu className="w-4 h-4 shrink-0" />
            </button>
          )}

          <Link href="/" className="inline-flex items-center gap-2.5 group shrink-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 text-white font-extrabold inline-flex items-center justify-center text-sm shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform tracking-tight shrink-0">
              V
            </div>
            <span className="font-extrabold text-sm text-white tracking-tight leading-none hidden sm:inline">
              My Vault
            </span>
          </Link>
        </div>

        {/* Center: Search Bar with Cmd+K hint - Centered with balanced flex spacing */}
        {onSearchChange !== undefined ? (
          <div className="flex-1 max-w-lg mx-auto px-2 sm:px-4 hidden md:flex items-center justify-center">
            <div className="w-full relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search videos by title, tags, or notes..."
                value={searchQuery || ''}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full h-8 pl-9 pr-14 bg-[#131620] border border-white/[0.08] rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 focus:bg-[#161a26] transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-500 bg-white/[0.05] border border-white/[0.08] rounded leading-none">
                  ⌘K
                </kbd>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Right Controls - Uniform 32px (h-8) height and 1px border for pixel-perfect vertical alignment */}
        <div className="flex items-center gap-2 shrink-0 sm:min-w-[140px] justify-end">
          {onSearchChange !== undefined && (
            <button
              type="button"
              onClick={() => {
                setMobileSearchOpen((prev) => !prev);
                setTimeout(() => mobileSearchInputRef.current?.focus(), 60);
              }}
              title="Search Library"
              className={`w-8 h-8 md:hidden inline-flex items-center justify-center rounded-lg border transition-colors cursor-pointer shrink-0 ${
                mobileSearchOpen || searchQuery
                  ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                  : 'bg-[#131620] border-white/[0.08] text-slate-300 hover:bg-[#191D29]'
              }`}
            >
              {mobileSearchOpen ? <X className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={handleUploadClick}
            className="h-8 inline-flex items-center justify-center gap-1.5 px-3 bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white text-xs font-semibold rounded-lg border border-indigo-400/30 transition-all shadow-sm shadow-indigo-500/20 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="leading-none hidden sm:inline">Upload</span>
          </button>

          {/* Privacy Toggle */}
          <button
            onClick={togglePrivacyMode}
            title="Toggle Privacy Mode (Shortcut: P)"
            className={`h-8 inline-flex items-center justify-center gap-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer shrink-0 ${
              isPrivacyActive
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                : 'bg-[#131620] border-white/[0.08] text-slate-300 hover:bg-[#191D29]'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5 shrink-0" />
            <span className="leading-none hidden sm:inline">Privacy</span>
          </button>

          {/* Panic Lock */}
          <button
            onClick={lockApp}
            title="Emergency Lock (Shortcut: Ctrl+Shift+L)"
            className="h-8 inline-flex items-center justify-center gap-1.5 px-2.5 bg-[#131620] border border-white/[0.08] hover:bg-[#191D29] text-amber-400 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0"
          >
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span className="leading-none hidden sm:inline">Lock</span>
          </button>

          {/* Quick Decoy Mode */}
          {decoyConfig?.enabled && (
            <button
              onClick={enterDecoyMode}
              title={`Decoy Screen (${decoyConfig.shortcut || 'Alt+D'})`}
              className="w-8 h-8 inline-flex items-center justify-center bg-[#131620] border border-white/[0.08] hover:bg-[#191D29] text-indigo-400 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}

          {/* Settings */}
          <Link
            href="/settings"
            className="w-8 h-8 inline-flex items-center justify-center bg-[#131620] border border-white/[0.08] hover:bg-[#191D29] text-slate-300 rounded-lg transition-colors shrink-0"
            title="Settings & Preferences"
          >
            <SettingsIcon className="w-3.5 h-3.5 shrink-0" />
          </Link>

          {/* Logout */}
          <button
            onClick={logout}
            title="Sign Out"
            className="w-8 h-8 inline-flex items-center justify-center bg-[#131620] border border-white/[0.08] hover:bg-rose-950/30 hover:border-rose-800/40 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </div>

      {/* Expandable Mobile Search Bar */}
      {onSearchChange !== undefined && mobileSearchOpen && (
        <div className="md:hidden px-4 pb-3 pt-1 border-t border-white/[0.06] animate-fade-in">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              ref={mobileSearchInputRef}
              type="text"
              placeholder="Search videos by title, tags, or notes..."
              value={searchQuery || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-9 pl-9 pr-8 bg-[#131620] border border-white/[0.08] rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 text-slate-400 hover:text-white"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
