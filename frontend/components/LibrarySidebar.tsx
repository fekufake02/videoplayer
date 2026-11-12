'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Film,
  PlayCircle,
  Clock,
  Sparkles,
  Heart,
  FolderLock,
  Cloud,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  FolderHeart,
  ListMusic,
} from 'lucide-react';
import {
  getStoredSidebarCollapsed,
  setStoredSidebarCollapsed,
  getStoredCollections,
  getStoredPlaylists,
} from '../lib/collectionsManager';

export type LibraryNavSection =
  | 'home'
  | 'continue'
  | 'recent'
  | 'watched'
  | 'unwatched'
  | 'favorites'
  | 'collections'
  | 'playlists'
  | 'vault'
  | 'drive'
  | 'settings';

export interface LibrarySidebarCounts {
  all?: number;
  continue?: number;
  recent?: number;
  watched?: number;
  favorites?: number;
  collections?: number;
  playlists?: number;
  drive?: number;
  vault?: number;
}

interface LibrarySidebarProps {
  activeSection?: LibraryNavSection;
  onSelectSection?: (section: LibraryNavSection) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileDrawerOpen?: boolean;
  onCloseMobileDrawer?: () => void;
  counts?: LibrarySidebarCounts;
}

export const LibrarySidebar: React.FC<LibrarySidebarProps> = ({
  activeSection = 'home',
  onSelectSection,
  isCollapsed: propIsCollapsed,
  onToggleCollapse: propOnToggleCollapse,
  isMobileDrawerOpen = false,
  onCloseMobileDrawer,
  counts = {},
}) => {
  const pathname = usePathname();
  const isDrivePage = pathname.startsWith('/drive');
  const isSettingsPage = pathname.startsWith('/settings');

  // Persisted collapse state on desktop
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    if (propIsCollapsed !== undefined) return propIsCollapsed;
    return getStoredSidebarCollapsed();
  });

  const [collectionsCount, setCollectionsCount] = useState<number>(() => getStoredCollections().length);
  const [playlistsCount, setPlaylistsCount] = useState<number>(() => getStoredPlaylists().length);

  useEffect(() => {
    if (propIsCollapsed !== undefined) {
      setInternalCollapsed(propIsCollapsed);
    }
  }, [propIsCollapsed]);

  const isCollapsed = propIsCollapsed !== undefined ? propIsCollapsed : internalCollapsed;

  const toggleCollapse = () => {
    if (propOnToggleCollapse) {
      propOnToggleCollapse();
    } else {
      const next = !internalCollapsed;
      setInternalCollapsed(next);
      setStoredSidebarCollapsed(next);
    }
  };

  // Listen for collection/playlist updates to refresh counts live
  useEffect(() => {
    const handleCols = () => setCollectionsCount(getStoredCollections().length);
    const handlePls = () => setPlaylistsCount(getStoredPlaylists().length);
    window.addEventListener('vault:collections-updated', handleCols);
    window.addEventListener('vault:playlists-updated', handlePls);
    return () => {
      window.removeEventListener('vault:collections-updated', handleCols);
      window.removeEventListener('vault:playlists-updated', handlePls);
    };
  }, []);

  // Prevent background scrolling when mobile drawer is open
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isMobileDrawerOpen) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    };
  }, [isMobileDrawerOpen]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileDrawerOpen) {
        onCloseMobileDrawer?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileDrawerOpen, onCloseMobileDrawer]);

  const navItemClass = (isActive: boolean) =>
    `relative flex items-center gap-3 px-3.5 h-11 rounded-[9px] text-[13px] font-medium transition-all group cursor-pointer focus-visible:outline-accent ${
      isActive
        ? 'bg-[rgba(129,140,248,0.12)] text-[#A5B4FC] font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-[#818CF8]'
        : 'text-[#A1A6B5] hover:text-[#F4F5FA] hover:bg-[#191D29]'
    }`;

  const renderTooltip = (text: string) => {
    if (!isCollapsed) return null;
    return (
      <div className="absolute left-[calc(100%+10px)] px-2.5 py-1 bg-[#191D29] text-[#F4F5FA] text-xs rounded-md shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 whitespace-nowrap">
        {text}
      </div>
    );
  };

  const renderNavContent = () => (
    <div className="flex flex-col h-full justify-between select-none py-1">
      <div className="space-y-6">
        {/* Main Section */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div className="px-3.5 pb-1 text-[11px] font-semibold text-[#73798B] uppercase tracking-wider">
              Library
            </div>
          )}
          <button
            onClick={() => onSelectSection?.('home')}
            className={`w-full ${navItemClass(activeSection === 'home' && !isDrivePage && !isSettingsPage)}`}
            aria-label="All Videos"
          >
            <Film className="w-[18px] h-[18px] shrink-0" />
            {!isCollapsed && (
              <div className="flex items-center justify-between w-full">
                <span>All Videos</span>
                {counts.all !== undefined && (
                  <span className="text-xs font-mono text-[#73798B] tabular-nums">{counts.all}</span>
                )}
              </div>
            )}
            {renderTooltip('All Videos')}
          </button>

          <button
            onClick={() => onSelectSection?.('continue')}
            className={`w-full ${navItemClass(activeSection === 'continue')}`}
            aria-label="Continue Watching"
          >
            <PlayCircle className="w-[18px] h-[18px] shrink-0" />
            {!isCollapsed && (
              <div className="flex items-center justify-between w-full">
                <span>Continue Watching</span>
                {counts.continue !== undefined && counts.continue > 0 && (
                  <span className="text-xs font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 tabular-nums">
                    {counts.continue}
                  </span>
                )}
              </div>
            )}
            {renderTooltip('Continue Watching')}
          </button>

          <button
            onClick={() => onSelectSection?.('recent')}
            className={`w-full ${navItemClass(activeSection === 'recent')}`}
            aria-label="Recently Added"
          >
            <Sparkles className="w-[18px] h-[18px] shrink-0" />
            {!isCollapsed && <span>Recently Added</span>}
            {renderTooltip('Recently Added')}
          </button>

          <button
            onClick={() => onSelectSection?.('watched')}
            className={`w-full ${navItemClass(activeSection === 'watched')}`}
            aria-label="Recently Watched"
          >
            <Clock className="w-[18px] h-[18px] shrink-0" />
            {!isCollapsed && <span>Recently Watched</span>}
            {renderTooltip('Recently Watched')}
          </button>

          <button
            onClick={() => onSelectSection?.('favorites')}
            className={`w-full ${navItemClass(activeSection === 'favorites')}`}
            aria-label="Liked Videos"
          >
            <Heart className="w-[18px] h-[18px] shrink-0" />
            {!isCollapsed && (
              <div className="flex items-center justify-between w-full">
                <span>Liked Videos</span>
                {counts.favorites !== undefined && counts.favorites > 0 && (
                  <span className="text-xs font-mono text-[#73798B] tabular-nums">{counts.favorites}</span>
                )}
              </div>
            )}
            {renderTooltip('Liked Videos')}
          </button>
        </div>

        {/* Organization Section */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div className="px-3.5 pb-1 text-[11px] font-semibold text-[#73798B] uppercase tracking-wider">
              Organization
            </div>
          )}
          <button
            onClick={() => onSelectSection?.('collections')}
            className={`w-full ${navItemClass(activeSection === 'collections')}`}
            aria-label="Collections"
          >
            <FolderHeart className="w-[18px] h-[18px] shrink-0 text-amber-400/90" />
            {!isCollapsed && (
              <div className="flex items-center justify-between w-full">
                <span>Collections</span>
                <span className="text-xs font-mono text-[#73798B] tabular-nums">{collectionsCount}</span>
              </div>
            )}
            {renderTooltip('Collections')}
          </button>

          <button
            onClick={() => onSelectSection?.('playlists')}
            className={`w-full ${navItemClass(activeSection === 'playlists')}`}
            aria-label="Playlists"
          >
            <ListMusic className="w-[18px] h-[18px] shrink-0 text-cyan-400/90" />
            {!isCollapsed && (
              <div className="flex items-center justify-between w-full">
                <span>Playlists</span>
                <span className="text-xs font-mono text-[#73798B] tabular-nums">{playlistsCount}</span>
              </div>
            )}
            {renderTooltip('Playlists')}
          </button>
        </div>

        {/* Sources Section */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div className="px-3.5 pb-1 text-[11px] font-semibold text-[#73798B] uppercase tracking-wider">
              Sources
            </div>
          )}
          <Link
            href="/"
            onClick={() => {
              onSelectSection?.('vault');
              onCloseMobileDrawer?.();
            }}
            className={`w-full ${navItemClass(!isDrivePage && !isSettingsPage && activeSection === 'vault')}`}
            aria-label="Vault Storage"
          >
            <FolderLock className="w-[18px] h-[18px] shrink-0 text-amber-400" />
            {!isCollapsed && (
              <div className="flex items-center justify-between w-full">
                <span>Vault Storage</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400 font-mono font-medium">B2</span>
              </div>
            )}
            {renderTooltip('Vault Storage (B2)')}
          </Link>

          <Link
            href="/drive"
            onClick={() => {
              onSelectSection?.('drive');
              onCloseMobileDrawer?.();
            }}
            className={`w-full ${navItemClass(isDrivePage)}`}
            aria-label="Google Drive"
          >
            <Cloud className="w-[18px] h-[18px] shrink-0 text-indigo-400" />
            {!isCollapsed && (
              <div className="flex items-center justify-between w-full">
                <span>Google Drive</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono font-medium">Synced</span>
              </div>
            )}
            {renderTooltip('Google Drive')}
          </Link>
        </div>

        {/* Settings & Privacy Section */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div className="px-3.5 pb-1 text-[11px] font-semibold text-[#73798B] uppercase tracking-wider">
              System
            </div>
          )}
          <Link
            href="/settings"
            onClick={() => {
              onSelectSection?.('settings');
              onCloseMobileDrawer?.();
            }}
            className={`w-full ${navItemClass(isSettingsPage)}`}
            aria-label="Settings & Privacy"
          >
            <Settings className="w-[18px] h-[18px] shrink-0" />
            {!isCollapsed && <span>Settings & Privacy</span>}
            {renderTooltip('Settings & Privacy')}
          </Link>
        </div>
      </div>

      {/* Collapse Toggle Footer on Desktop */}
      <div className="pt-3 border-t border-white/[0.06] hidden lg:block">
        <button
          onClick={toggleCollapse}
          className="w-full flex items-center justify-center p-2 rounded-[9px] text-[#A1A6B5] hover:text-[#F4F5FA] hover:bg-[#191D29] transition-colors focus-visible:outline-accent"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-[#0C0E15] border-r border-white/[0.06] p-3 transition-all duration-200 shrink-0 sticky top-16 h-[calc(100vh-4rem)] z-30 ${
          isCollapsed ? 'w-[76px]' : 'w-[248px]'
        }`}
      >
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer (When Open) */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation Drawer">
          {/* Backdrop with 55% black opacity and slight blur */}
          <div
            className="fixed inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity"
            onClick={onCloseMobileDrawer}
          />
          <div className="fixed inset-y-0 left-0 w-[280px] max-w-[85vw] bg-[#0C0E15] border-r border-white/[0.08] p-5 shadow-2xl flex flex-col justify-between animate-fade-in">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.07]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-accent text-white font-extrabold flex items-center justify-center text-sm shadow-md">
                    V
                  </div>
                  <span className="font-extrabold text-base text-[#F4F5FA] tracking-tight">My Vault</span>
                </div>
                <button
                  onClick={onCloseMobileDrawer}
                  className="p-1.5 text-[#A1A6B5] hover:text-[#F4F5FA] rounded-lg transition-colors focus-visible:outline-accent min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Close navigation drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderNavContent()}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
