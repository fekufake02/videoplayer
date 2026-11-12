'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '../lib/api';
import { IUser, ISettings } from '../types';

import {
  DecoyConfig,
  DEFAULT_DECOY_CONFIG,
  isDecoyShortcutPressed,
  verifyDecoyExitPin,
} from '../lib/decoyManager';
import {
  isBiometricSupported,
  getStoredBiometricCredential,
  saveBiometricCredential,
  clearBiometricCredential,
  generateRandomChallenge,
  bufferToBase64url,
  base64urlToBuffer,
  BiometricCredential,
} from '../lib/webauthn';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: IUser | null;
  settings: ISettings | null;
  isPrivacyActive: boolean;
  isLocked: boolean;
  isDecoyActive: boolean;
  decoyConfig: DecoyConfig;
  hasBiometricRegistered: boolean;
  isBiometricAvailable: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  togglePrivacyMode: () => void;
  setPrivacyMode: (active: boolean) => void;
  lockApp: () => void;
  unlockApp: () => void;
  enterDecoyMode: () => void;
  exitDecoyMode: (pinOrPass: string) => boolean;
  updateDecoyConfig: (newCfg: Partial<DecoyConfig>) => void;
  registerBiometricPasskey: () => Promise<{ success: boolean; message?: string }>;
  removeBiometricPasskey: () => void;
  unlockWithBiometric: () => Promise<boolean>;
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

  // Decoy Mode State
  const [isDecoyActive, setIsDecoyActive] = useState<boolean>(false);
  const [decoyConfig, setDecoyConfig] = useState<DecoyConfig>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('vault_decoy_config');
        if (stored) return { ...DEFAULT_DECOY_CONFIG, ...JSON.parse(stored) };
      } catch {}
    }
    return DEFAULT_DECOY_CONFIG;
  });

  // Biometrics & Passkeys State
  const [hasBiometricRegistered, setHasBiometricRegistered] = useState<boolean>(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState<boolean>(false);

  const router = useRouter();
  const pathname = usePathname();

  const checkAuth = useCallback(async (isInitialColdMount = false) => {
    try {
      const data = await api.getMe();
      if (data.authenticated && data.user) {
        setIsAuthenticated(true);
        setUser(data.user);
        if (data.settings) setSettings(data.settings);
        // Only on initial cold load / mount should it be locked (unless on /login)
        if (isInitialColdMount) {
          const isSessionUnlocked = typeof window !== 'undefined' && sessionStorage.getItem('vault_unlocked') === 'true';
          if (!isSessionUnlocked && window.location.pathname !== '/login') {
            setIsLocked(true);
            setIsPrivacyActive(true);
          } else {
            setIsLocked(false);
            setIsPrivacyActive(false);
          }
        }
      } else {
        setIsAuthenticated(false);
        setUser(null);
        setIsLocked(false);
        setIsPrivacyActive(false);
        sessionStorage.removeItem('vault_unlocked');
        if (window.location.pathname !== '/login') {
          router.push('/login');
        }
      }
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
      setIsLocked(false);
      setIsPrivacyActive(false);
      sessionStorage.removeItem('vault_unlocked');
      if (window.location.pathname !== '/login') {
        router.push('/login');
      }
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // Only run on initial cold mount of the app
    checkAuth(true);
  }, [checkAuth]);

  // Listen for 401 unauthorized events
  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setUser(null);
      setIsLocked(false);
      setIsPrivacyActive(false);
      sessionStorage.removeItem('vault_unlocked');
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
      sessionStorage.setItem('vault_unlocked', 'true');
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
      sessionStorage.removeItem('vault_unlocked');
      router.push('/login');
    }
  };

  // Check biometric support and stored passkeys on mount
  useEffect(() => {
    isBiometricSupported().then((supported) => {
      setIsBiometricAvailable(supported);
    });
    const stored = getStoredBiometricCredential();
    setHasBiometricRegistered(!!stored);
  }, []);

  const triggerPrivacyLockout = useCallback(() => {
    // 1. Automatically exit browser Picture-in-Picture
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    // 2. Dispatch event for floating mini-player and hooks
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:privacy-lock'));
      // 3. Pause all active video media in DOM
      document.querySelectorAll('video').forEach((v) => {
        try {
          if (!v.paused) v.pause();
        } catch {}
      });
    }
  }, []);

  const togglePrivacyMode = useCallback(() => {
    setIsPrivacyActive((prev) => {
      const next = !prev;
      if (next) triggerPrivacyLockout();
      return next;
    });
  }, [triggerPrivacyLockout]);

  const setPrivacyMode = useCallback((active: boolean) => {
    setIsPrivacyActive(active);
    if (active) triggerPrivacyLockout();
  }, [triggerPrivacyLockout]);

  const lockApp = useCallback(() => {
    setIsLocked(true);
    setIsPrivacyActive(true);
    sessionStorage.removeItem('vault_unlocked');
    triggerPrivacyLockout();
  }, [triggerPrivacyLockout]);

  const unlockApp = useCallback(() => {
    setIsLocked(false);
    setIsPrivacyActive(false);
  }, []);

  // Decoy Mode Controls
  const enterDecoyMode = useCallback(() => {
    setIsDecoyActive(true);
    triggerPrivacyLockout();
  }, [triggerPrivacyLockout]);

  const exitDecoyMode = useCallback((pinOrPass: string): boolean => {
    // Check against decoy exit PIN or default
    if (verifyDecoyExitPin(pinOrPass, decoyConfig.exitPin || '1234')) {
      setIsDecoyActive(false);
      setIsLocked(false);
      setIsPrivacyActive(false);
      return true;
    }
    // Alternatively accept master login
    login(pinOrPass)
      .then(() => {
        setIsDecoyActive(false);
        setIsLocked(false);
        setIsPrivacyActive(false);
      })
      .catch(() => {});
    return false;
  }, [decoyConfig.exitPin, login]);

  const updateDecoyConfig = useCallback((newCfg: Partial<DecoyConfig>) => {
    setDecoyConfig((prev) => {
      const updated = { ...prev, ...newCfg };
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('vault_decoy_config', JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });
  }, []);

  // WebAuthn Biometrics: Register Device Passkey
  const registerBiometricPasskey = async (): Promise<{ success: boolean; message?: string }> => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      return { success: false, message: 'WebAuthn passkeys are not supported on this browser.' };
    }
    try {
      const challenge = generateRandomChallenge(32);
      const userIdBytes = new TextEncoder().encode(user?.id || 'admin_vault_owner');

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: challenge.buffer as ArrayBuffer,
          rp: {
            name: 'My Vault',
            id: window.location.hostname || undefined,
          },
          user: {
            id: userIdBytes.buffer as ArrayBuffer,
            name: user?.username || 'admin',
            displayName: 'Vault Owner',
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' }, // ES256
            { alg: -257, type: 'public-key' }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform', // TouchID, FaceID, Windows Hello, Android Biometrics
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        return { success: false, message: 'Biometric passkey registration was canceled.' };
      }

      const credIdBase64 = bufferToBase64url(credential.rawId);
      saveBiometricCredential({
        id: credIdBase64,
        createdAt: Date.now(),
        label: 'Device Biometrics (Passkey)',
      });

      setHasBiometricRegistered(true);
      return { success: true, message: 'Biometric passkey registered successfully on this device!' };
    } catch (err: any) {
      console.warn('Biometric registration error:', err);
      return { success: false, message: err.message || 'Failed to register biometric passkey.' };
    }
  };

  const removeBiometricPasskey = useCallback(() => {
    clearBiometricCredential();
    setHasBiometricRegistered(false);
  }, []);

  // WebAuthn Biometrics: Unlock with Touch ID / Face ID
  const unlockWithBiometric = async (): Promise<boolean> => {
    const storedCred = getStoredBiometricCredential();
    if (!storedCred || !storedCred.id) {
      return false;
    }
    try {
      const challenge = generateRandomChallenge(32);
      const credIdBuffer = base64urlToBuffer(storedCred.id);

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: challenge.buffer as ArrayBuffer,
          allowCredentials: [
            {
              id: credIdBuffer.buffer as ArrayBuffer,
              type: 'public-key',
              transports: ['internal'],
            },
          ],
          userVerification: 'required',
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (assertion) {
        // Biometric assertion verified on platform authenticator
        setIsLocked(false);
        setIsPrivacyActive(false);
        setIsAuthenticated(true);
        if (pathname === '/login') {
          router.push('/');
        }
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Biometric unlock canceled or failed:', err);
      return false;
    }
  };

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

  // Global Keyboard Shortcuts for Privacy ('P'), Lock ('Ctrl+Shift+L'), and Decoy (e.g. 'Alt+D')
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

      // Decoy Shortcut: Alt + D (or configured shortcut)
      if (decoyConfig.enabled && isDecoyShortcutPressed(e, decoyConfig.shortcut || 'Alt+D')) {
        e.preventDefault();
        enterDecoyMode();
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
  }, [lockApp, togglePrivacyMode, enterDecoyMode, decoyConfig, settings?.keyboardShortcuts]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        settings,
        isPrivacyActive,
        isLocked,
        isDecoyActive,
        decoyConfig,
        hasBiometricRegistered,
        isBiometricAvailable,
        login,
        logout,
        togglePrivacyMode,
        setPrivacyMode,
        lockApp,
        unlockApp,
        enterDecoyMode,
        exitDecoyMode,
        updateDecoyConfig,
        registerBiometricPasskey,
        removeBiometricPasskey,
        unlockWithBiometric,
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
