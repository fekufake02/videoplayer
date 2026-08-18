'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '../lib/api';
import { IUser, ISettings } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: IUser | null;
  settings: ISettings | null;
  isPrivacyActive: boolean;
  isLocked: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  togglePrivacyMode: () => void;
  setPrivacyMode: (active: boolean) => void;
  lockApp: () => void;
  unlockApp: () => void;
  refreshSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<IUser | null>(null);
  const [settings, setSettings] = useState<ISettings | null>(null);
  const [isPrivacyActive, setIsPrivacyActive] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  const router = useRouter();
  const pathname = usePathname();

  const checkAuth = useCallback(async () => {
    try {
      const data = await api.getMe();
      if (data.authenticated && data.user) {
        setIsAuthenticated(true);
        setUser(data.user);
        if (data.settings) setSettings(data.settings);
      } else {
        setIsAuthenticated(false);
        setUser(null);
        if (pathname !== '/login') {
          router.push('/login');
        }
      }
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
      if (pathname !== '/login') {
        router.push('/login');
      }
    } finally {
      setIsLoading(false);
    }
  }, [pathname, router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Listen for 401 unauthorized events
  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setUser(null);
      if (pathname !== '/login') {
        router.push('/login');
      }
    };

    window.addEventListener('app:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('app:unauthorized', handleUnauthorized);
  }, [pathname, router]);

  const login = async (password: string) => {
    const data = await api.login(password);
    if (data.success) {
      setIsAuthenticated(true);
      setUser(data.user);
      if (data.settings) setSettings(data.settings);
      sessionStorage.setItem('metime_unlocked', 'true');
      setIsLocked(false);
      setIsPrivacyActive(false);
      router.push('/');
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // Ignore logout api errors if session already ended
    } finally {
      sessionStorage.removeItem('metime_unlocked');
      setIsAuthenticated(false);
      setUser(null);
      setIsPrivacyActive(false);
      setIsLocked(false);
      router.push('/login');
    }
  };

  const togglePrivacyMode = useCallback(() => {
    setIsPrivacyActive((prev) => !prev);
  }, []);

  const setPrivacyMode = useCallback((active: boolean) => {
    setIsPrivacyActive(active);
  }, []);

  const lockApp = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('metime_unlocked');
    }
    setIsLocked(true);
    setIsPrivacyActive(true);
  }, []);

  const unlockApp = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('metime_unlocked', 'true');
    }
    setIsLocked(false);
    setIsPrivacyActive(false);
  }, []);

  const refreshSettings = async () => {
    try {
      const data = await api.getSettings();
      if (data.success && data.settings) {
        setSettings(data.settings);
      }
    } catch (e) {
      console.error('Failed to refresh settings:', e);
    }
  };

  // Window switch, Desktop switch, Tab switch & Reload Privacy Lock Listeners
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleLock = () => {
      lockApp();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleLock();
      }
    };

    const handleBlur = () => {
      handleLock();
    };

    const handleBeforeUnload = () => {
      sessionStorage.removeItem('metime_unlocked');
    };

    // Auto-lock on page reload if session unlock token is missing
    const isUnlocked = sessionStorage.getItem('metime_unlocked') === 'true';
    if (!isUnlocked && pathname !== '/login') {
      lockApp();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAuthenticated, lockApp, pathname]);

  // Inactivity auto-lock timer
  useEffect(() => {
    if (!settings || !settings.autoLockDuration || settings.autoLockDuration === 0 || !isAuthenticated || isLocked) {
      return;
    }

    let timeoutId: NodeJS.Timeout;
    const lockTimeMs = settings.autoLockDuration * 60 * 1000;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lockApp();
      }, lockTimeMs);
    };

    resetTimer();

    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    activityEvents.forEach((event) => window.addEventListener(event, resetTimer));

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [settings, isAuthenticated, isLocked, lockApp]);

  // Global Keyboard Shortcuts for Privacy ('P') and Lock ('Ctrl+Shift+L' / 'L')
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcut when typing in input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Emergency Lock: Ctrl + Shift + L or Shift + L
      if (e.key.toUpperCase() === 'L' && (e.ctrlKey || e.shiftKey)) {
        e.preventDefault();
        lockApp();
        return;
      }

      // Privacy Mode Toggle: P
      if (e.key.toUpperCase() === 'P' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        togglePrivacyMode();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lockApp, togglePrivacyMode]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        settings,
        isPrivacyActive,
        isLocked,
        login,
        logout,
        togglePrivacyMode,
        setPrivacyMode,
        lockApp,
        unlockApp,
        refreshSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
