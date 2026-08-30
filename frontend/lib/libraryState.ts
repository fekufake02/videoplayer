export interface LibraryState {
  scrollY: number;
  page: number;
  searchQuery: string;
  sort: string;
  filter: string;
  lastClickedVideoId?: string | null;
  savedAt: number;
}

const STORAGE_KEY = 'metime_library_state';

export const saveLibraryState = (state: Partial<LibraryState>) => {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLibraryState() || {
      scrollY: 0,
      page: 1,
      searchQuery: '',
      sort: 'recentlyAdded',
      filter: 'all',
      savedAt: Date.now(),
    };

    const updated: LibraryState = {
      ...existing,
      ...state,
      savedAt: Date.now(),
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save library state:', e);
  }
};

export const getLibraryState = (): LibraryState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LibraryState;
  } catch (e) {
    return null;
  }
};

export const clearLibraryState = () => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
};
