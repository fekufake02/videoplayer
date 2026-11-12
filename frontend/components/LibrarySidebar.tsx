'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  PlayCircle,
  Clock,
  Sparkles,
  Heart,
  Film,
  FolderLock,
  Cloud,
  Shield,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
} from 'lucide-react';

export type LibraryNavSection =
  | 'home'
  | 'continue'
  | 'recent'
  | 'watched'
  | 'unwatched'
  | 'favorites'
  | 'all'
  | 'vault'
  | 'drive'
  | 'settings';

interface LibrarySidebarProps {
  activeSection?: LibraryNavSection;
  onSelectSection?: (section: LibraryNavSection) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileDrawerOpen?: boolean;
  onCloseMobileDrawer?: () => void;
}

export const LibrarySidebar: React.FC<LibrarySidebarProps> = ({
  activeSection = 'home',
  onSelectSection,
  isCollapsed = false,
  onToggleCollapse,
  isMobileDrawerOpen = false,
  onCloseMobileDrawer,
}) => {
  const pathname = usePathname();
  const isDrivePage = pathname.startsWith('/drive');
  const isSettingsPage = pathname.startsWith('/settings');

  const navItemClass = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all group cursor-pointer ${
      isActive
        ? 'bg-indigo-500/15 text-indigo-300 font-semibold border border-indigo-500/30'
        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
    }`;

  const renderNavContent = () => (
    <div className="flex flex-col h-full justify-between select-none">
      <div className="space-y-6">
        {/* Main Section */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div className="px-3 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Discover
            </div>
          )}
          <button
            onClick={() => onSelectSection?.('home')}
            className={`w-full ${navItemClass(activeSection === 'home' && !isDrivePage && !isSettingsPage)}`}
            title="All Videos"
          >
            <Home className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>All Videos</span>}
          </button>

          <button
            onClick={() => onSelectSection?.('continue')}
            className={`w-full ${navItemClass(activeSection === 'continue')}`}
            title="Continue Watching"
          >
            <PlayCircle className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Continue Watching</span>}
          </button>

          <button
            onClick={() => onSelectSection?.('watched')}
            className={`w-full ${navItemClass(activeSection === 'watched')}`}
            title="Recently Viewed"
          >
            <Clock className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Recently Viewed</span>}
          </button>

          <button
            onClick={() => onSelectSection?.('favorites')}
            className={`w-full ${navItemClass(activeSection === 'favorites')}`}
            title="Liked Videos"
          >
            <Heart className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Liked Videos</span>}
          </button>
        </div>

        {/* Sources Section */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div className="px-3 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
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
            title="Vault Storage (B2)"
          >
            <FolderLock className="w-4 h-4 shrink-0 text-amber-400" />
            {!isCollapsed && (
              <div className="flex items-center justify-between w-full">
                <span>Vault Storage</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400 font-mono">B2</span>
              </div>
            )}
          </Link>

          <Link
            href="/drive"
            onClick={() => {
              onSelectSection?.('drive');
              onCloseMobileDrawer?.();
            }}
            className={`w-full ${navItemClass(isDrivePage)}`}
            title="Google Drive"
          >
            <Cloud className="w-4 h-4 shrink-0 text-indigo-400" />
            {!isCollapsed && (
              <div className="flex items-center justify-between w-full">
                <span>Google Drive</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono">Synced</span>
              </div>
            )}
          </Link>
        </div>

        {/* Settings & Privacy Section */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div className="px-3 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
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
            title="Vault Preferences"
          >
            <Settings className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Settings & Privacy</span>}
          </Link>
        </div>
      </div>

      {/* Collapse Toggle Footer on Desktop */}
      {onToggleCollapse && (
        <div className="pt-4 border-t border-white/[0.07] hidden lg:block">
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-[#0E1017] border-r border-white/[0.07] p-4 transition-all duration-200 shrink-0 sticky top-16 h-[calc(100vh-4rem)] z-30 ${
          isCollapsed ? 'w-18' : 'w-60'
        }`}
      >
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer (When Open) */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Dimmed Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobileDrawer}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-[#0E1017] border-r border-white/[0.08] p-5 shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.07]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500 text-white font-extrabold flex items-center justify-center text-sm shadow-md">
                    V
                  </div>
                  <span className="font-extrabold text-base text-white tracking-tight">My Vault</span>
                </div>
                <button
                  onClick={onCloseMobileDrawer}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {renderNavContent()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
