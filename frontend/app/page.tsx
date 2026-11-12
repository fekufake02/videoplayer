'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { useUpload } from '../context/UploadContext';
import { api } from '../lib/api';
import { IVideo, HomeSections } from '../types';
import { Navbar } from '../components/Navbar';
import { VideoCard } from '../components/VideoCard';
import { VideoGrid } from '../components/VideoGrid';
import { LibrarySidebar, LibraryNavSection } from '../components/LibrarySidebar';
import { EditMetadataModal } from '../components/EditMetadataModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { PlayCircle, Clock, Sparkles, Heart, Play, ChevronRight } from 'lucide-react';
import { getLibraryState, saveLibraryState } from '../lib/libraryState';

export default function LibraryHomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { openUploadModal } = useUpload();

  const [activeNavSection, setActiveNavSection] = useState<LibraryNavSection>('home');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const [homeSections, setHomeSections] = useState<HomeSections>({
    continueWatching: [],
    recentlyWatched: [],
    mostWatched: [],
    recentlyAdded: [],
  });

  const [gridVideos, setGridVideos] = useState<IVideo[]>([]);
  const [totalGrid, setTotalGrid] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [page, setPage] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = getLibraryState();
      if (saved?.page) return saved.page;
    }
    return 1;
  });

  const [searchQuery, setSearchQuery] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = getLibraryState();
      if (saved?.searchQuery) return saved.searchQuery;
    }
    return '';
  });

  const [sort, setSort] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = getLibraryState();
      if (saved?.sort) return saved.sort;
    }
    return 'recentlyAdded';
  });

  const [filter, setFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = getLibraryState();
      if (saved?.filter) return saved.filter;
    }
    return 'all';
  });

  // Modals state
  const [editingVideo, setEditingVideo] = useState<IVideo | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<IVideo | null>(null);
  const hasRestoredScroll = useRef<boolean>(false);

  useEffect(() => {
    saveLibraryState({
      page,
      searchQuery,
      sort,
      filter,
    });
  }, [page, searchQuery, sort, filter]);

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    const onScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        saveLibraryState({ scrollY: window.scrollY });
      }, 120);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const fetchHomeData = useCallback(async () => {
    try {
      const data = await api.getLibraryHome();
      if (data.success) {
        setHomeSections({
          continueWatching: data.continueWatching || [],
          recentlyWatched: data.recentlyWatched || [],
          mostWatched: data.mostWatched || [],
          recentlyAdded: data.recentlyAdded || [],
        });
      }
    } catch (err) {
      console.error('Failed to fetch home sections:', err);
    }
  }, []);

  const fetchGridData = useCallback(async () => {
    try {
      const data = await api.listVideos({
        page,
        limit: 24,
        search: searchQuery,
        sort,
        filter,
      });
      if (data.success) {
        setGridVideos(data.videos || []);
        setTotalGrid(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch video grid:', err);
    }
  }, [page, searchQuery, sort, filter]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchHomeData();
      fetchGridData();
    }
  }, [isAuthenticated, fetchHomeData, fetchGridData]);

  useEffect(() => {
    if (gridVideos.length > 0 && !hasRestoredScroll.current) {
      const saved = getLibraryState();
      if (saved) {
        hasRestoredScroll.current = true;
        const timer = setTimeout(() => {
          if (saved.lastClickedVideoId) {
            const cardEl = document.getElementById(`video-card-${saved.lastClickedVideoId}`);
            if (cardEl) {
              cardEl.scrollIntoView({ block: 'center', behavior: 'auto' });
              cardEl.classList.add('ring-2', 'ring-indigo-400');
              setTimeout(() => {
                cardEl.classList.remove('ring-2', 'ring-indigo-400');
              }, 2500);
              return;
            }
          }
          if (saved.scrollY && saved.scrollY > 0) {
            window.scrollTo({ top: saved.scrollY, behavior: 'auto' });
          }
        }, 100);

        return () => clearTimeout(timer);
      }
    }
  }, [gridVideos]);

  const handleRefreshAll = () => {
    fetchHomeData();
    fetchGridData();
  };

  useEffect(() => {
    const handleUploadedEvent = () => {
      handleRefreshAll();
    };
    window.addEventListener('vault-media-uploaded', handleUploadedEvent);
    return () => {
      window.removeEventListener('vault-media-uploaded', handleUploadedEvent);
    };
  }, [handleRefreshAll]);

  const handleSelectNavSection = (section: LibraryNavSection) => {
    setActiveNavSection(section);
    setIsMobileDrawerOpen(false);

    if (section === 'home') {
      setFilter('all');
      setSort('recentlyAdded');
      setPage(1);
    } else if (section === 'continue') {
      setFilter('recentlyWatched');
      setSort('recentlyWatched');
      setPage(1);
    } else if (section === 'watched') {
      setFilter('recentlyWatched');
      setSort('recentlyWatched');
      setPage(1);
    } else if (section === 'favorites') {
      setFilter('favorites');
      setSort('recentlyAdded');
      setPage(1);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090A0F]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F] text-[#F4F5F8]">
      <Navbar
        onOpenUpload={openUploadModal}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setPage(1);
        }}
        onToggleMobileMenu={() => setIsMobileDrawerOpen(true)}
      />

      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* Sidebar Navigation */}
        <LibrarySidebar
          activeSection={activeNavSection}
          onSelectSection={handleSelectNavSection}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          isMobileDrawerOpen={isMobileDrawerOpen}
          onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
          {/* Continue Watching Carousel Section (If any exist) */}
          {homeSections.continueWatching && homeSections.continueWatching.length > 0 && !searchQuery && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm sm:text-base font-semibold text-white tracking-tight flex items-center gap-2">
                  <PlayCircle className="w-4 h-4 text-indigo-400" />
                  <span>Continue Watching</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {homeSections.continueWatching.slice(0, 4).map((vid) => {
                  const progressPct =
                    vid.duration && vid.duration > 0 && vid.lastPosition
                      ? Math.min(100, Math.round((vid.lastPosition / vid.duration) * 100))
                      : 0;

                  return (
                    <div
                      key={vid._id}
                      className="group relative bg-[#131620] border border-white/[0.07] rounded-xl overflow-hidden hover:border-white/[0.14] transition-all p-2.5 flex items-center gap-3 select-none"
                    >
                      <Link
                        href={`/watch/${vid._id}`}
                        className="relative w-28 sm:w-32 aspect-video bg-[#090A0F] rounded-lg overflow-hidden shrink-0 flex items-center justify-center cursor-pointer group-hover:scale-102 transition-transform"
                      >
                        {vid.thumbnailUrl ? (
                          <img
                            src={vid.thumbnailUrl}
                            alt={vid.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                            <Play className="w-4 h-4 text-slate-500 fill-current" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                            <Play className="w-3 h-3 fill-current translate-x-0.5" />
                          </div>
                        </div>
                        {progressPct > 0 && (
                          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
                            <div className="h-full bg-indigo-400" style={{ width: `${progressPct}%` }} />
                          </div>
                        )}
                      </Link>

                      <div className="flex-1 min-w-0 pr-1">
                        <Link
                          href={`/watch/${vid._id}`}
                          className="font-medium text-xs text-slate-100 hover:text-indigo-300 line-clamp-1 transition-colors"
                        >
                          {vid.title}
                        </Link>
                        <div className="text-[11px] text-slate-400 font-mono mt-1 tabular-nums">
                          {progressPct}% • {formatDuration(vid.lastPosition || 0)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Video Grid */}
          <VideoGrid
            videos={gridVideos}
            total={totalGrid}
            page={page}
            totalPages={totalPages}
            onPageChange={(p) => setPage(p)}
            sort={sort}
            onSortChange={(s) => {
              setSort(s);
              setPage(1);
            }}
            filter={filter}
            onFilterChange={(f) => {
              setFilter(f);
              setPage(1);
            }}
            onEditVideo={(v) => setEditingVideo(v)}
            onDeleteVideo={(v) => setDeletingVideo(v)}
            onOpenUpload={openUploadModal}
            title={
              searchQuery
                ? `Search: "${searchQuery}"`
                : filter === 'recentlyWatched'
                ? 'Recently Viewed'
                : filter === 'favorites'
                ? 'Liked Videos'
                : sort === 'mostWatched'
                ? 'Most Watched'
                : 'All Videos'
            }
          />
        </main>
      </div>

      {/* Modals */}
      <EditMetadataModal
        video={editingVideo}
        onClose={() => setEditingVideo(null)}
        onSuccess={handleRefreshAll}
      />

      <DeleteConfirmModal
        video={deletingVideo}
        onClose={() => setDeletingVideo(null)}
        onSuccess={handleRefreshAll}
      />
    </div>
  );
}
