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
  updateUserSettings: (newSettings: Partial<ISettings>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<IUser | null>(null);
  const [settings, setSettings] = useState<ISettings | null>(null);
  const [isPrivacyActive, setIsPrivacyActive] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(true);

  const router = useRouter();
  const pathname = usePathname();

  const checkAuth = useCallback(async () => {
    try {
      const data = await api.getMe();
      if (data.authenticated && data.user) {
        setIsAuthenticated(true);
        setUser(data.user);
        if (data.settings) setSettings(data.settings);
        // By default on reload it should always be locked (unless on /login)
        if (pathname !== '/login') {
          setIsLocked(true);
          setIsPrivacyActive(true);
        }
      } else {
        setIsAuthenticated(false);
        setUser(null);
        setIsLocked(false);
        setIsPrivacyActive(false);
        if (pathname !== '/login') {
          router.push('/login');
        }
      }
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
      setIsLocked(false);
      setIsPrivacyActive(false);
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
      setIsLocked(false);
      setIsPrivacyActive(false);
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
      setIsLocked(false);
      setIsPrivacyActive(false);
      if (pathname === '/login') {
        router.push('/');
      }
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // Ignore logout api errors if session already ended
    } finally {
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
    setIsLocked(true);
    setIsPrivacyActive(true);
  }, []);

  const unlockApp = useCallback(() => {
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

  const updateUserSettings = async (newSettings: Partial<ISettings>) => {
    // Optimistically update local state immediately
    setSettings((prev) => (prev ? { ...prev, ...newSettings } : null));
    try {
      const res = await api.updateSettings(newSettings);
      if (res.success && res.settings) {
        setSettings(res.settings);
      }
    } catch (e) {
      console.error('Failed to update settings:', e);
      // Revert on error
      refreshSettings();
      throw e;
    }
  };

  // Window switch, Desktop switch, and Tab switch Security Listeners
  useEffect(() => {
    if (!isAuthenticated) return;

    // Lock on Tab Switch ONLY if privacyTabHidden is enabled in settings
    const handleVisibilityChange = () => {
      if (document.hidden && settings?.privacyTabHidden) {
        lockApp();
      }
    };

    // Lock on Window Blur ONLY if lockOnWindowBlur is enabled in settings
    const handleBlur = () => {
      if (settings?.lockOnWindowBlur) {
        lockApp();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isAuthenticated, lockApp, settings?.privacyTabHidden, settings?.lockOnWindowBlur]);

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
  }, [settings?.autoLockDuration, isAuthenticated, isLocked, lockApp]);

  // Global Keyboard Shortcuts for Privacy ('P') and Lock ('Ctrl+Shift+L' / 'L')
  useEffect(() => {
    if (settings?.keyboardShortcuts === false) return;

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
  }, [lockApp, togglePrivacyMode, settings?.keyboardShortcuts]);

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
        updateUserSettings,
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
