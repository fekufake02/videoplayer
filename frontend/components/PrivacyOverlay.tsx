'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { Lock, EyeOff, KeyRound, Fingerprint, BookOpen } from 'lucide-react';

export const PrivacyOverlay: React.FC = () => {
  const pathname = usePathname();
  const {
    isPrivacyActive,
    isLocked,
    isDecoyActive,
    setPrivacyMode,
    login,
    hasBiometricRegistered,
    unlockWithBiometric,
    enterDecoyMode,
    decoyConfig,
  } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBiometricPrompting, setIsBiometricPrompting] = useState(false);

  // Ensure any active media pauses whenever lock or privacy shield becomes active (including on reload)
  useEffect(() => {
    if ((isPrivacyActive || isLocked) && !isDecoyActive && typeof document !== 'undefined') {
      document.querySelectorAll('video').forEach((v) => {
        try {
          if (!v.paused) v.pause();
        } catch {}
      });
    }
  }, [isPrivacyActive, isLocked, isDecoyActive]);

  // Never show lock/privacy overlay over /login or when Decoy mode is active
  if (pathname === '/login') return null;
  if (isDecoyActive) return null;
  if (!isPrivacyActive && !isLocked) return null;

  const handleUnlockLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setIsSubmitting(true);
    setError('');

    try {
      await login(password);
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Incorrect master password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBiometricClick = async () => {
    setIsBiometricPrompting(true);
    setError('');
    try {
      const ok = await unlockWithBiometric();
      if (!ok) {
        setError('Biometric verification canceled or not recognized.');
      }
    } catch (err: any) {
      setError(err.message || 'Biometric authentication failed.');
    } finally {
      setIsBiometricPrompting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#05060A] text-text-primary flex flex-col items-center justify-center p-6 backdrop-blur-3xl [-webkit-backdrop-filter:blur(64px)] select-none">
      <div className="max-w-md w-full bg-surface border border-border p-8 rounded-2xl shadow-2xl text-center flex flex-col items-center">
        <div className="w-14 h-14 rounded-xl bg-surface-elevated border border-border flex items-center justify-center mb-5 shadow-sm text-accent">
          {isLocked ? <Lock className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
        </div>

        <h2 className="text-xl font-semibold tracking-tight text-text-primary mb-1.5">
          {isLocked ? 'Library Locked' : 'Privacy Shield Active'}
        </h2>

        <p className="text-text-secondary text-xs mb-6">
          {isLocked
            ? 'Application locked due to inactivity or panic lock.'
            : 'Privacy mode active. Audio muted and screen protected.'}
        </p>

        {isLocked ? (
          <div className="w-full space-y-3.5">
            {error && (
              <div className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-lg text-left">
                {error}
              </div>
            )}

            {/* Biometric Passkey Unlock Button */}
            {hasBiometricRegistered && (
              <button
                type="button"
                onClick={handleBiometricClick}
                disabled={isBiometricPrompting}
                className="w-full py-2.5 bg-accent hover:bg-accent-hover active:scale-[0.99] text-white font-medium text-xs rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Fingerprint className="w-4 h-4" />
                <span>{isBiometricPrompting ? 'Verifying Biometrics...' : 'Unlock with Touch ID / Face ID'}</span>
              </button>
            )}

            <form onSubmit={handleUnlockLock} className="w-full space-y-3">
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-text-muted" />
                <input
                  type="password"
                  placeholder="Or enter master password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus={!hasBiometricRegistered}
                  className="w-full pl-9 pr-3 py-2 bg-background-secondary border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium text-xs rounded-lg transition-colors cursor-pointer"
              >
                {isSubmitting ? 'Verifying...' : 'Unlock with Password'}
              </button>
            </form>

            {/* Quick Decoy Mode Button */}
            {decoyConfig.enabled && (
              <div className="pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={enterDecoyMode}
                  className="w-full py-2 px-3 rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border text-text-muted hover:text-text-primary text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  title="Switch immediately to harmless notes/docs interface"
                >
                  <BookOpen className="w-3.5 h-3.5 text-accent" />
                  <span>Switch to Decoy Screen ({decoyConfig.shortcut || 'Alt+D'})</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setPrivacyMode(false)}
            className="px-5 py-2 bg-surface-elevated hover:bg-surface-hover border border-border text-text-primary text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            Unlock Screen
          </button>
        )}
      </div>
    </div>
  );
};

export const ProtectedContentWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const { isLoading, isPrivacyActive, isLocked, isDecoyActive } = useAuth();

  const shouldObscure =
    pathname !== '/login' && (isLoading || isLocked || isPrivacyActive || isDecoyActive);

  return (
    <div
      aria-hidden={shouldObscure || undefined}
      className={
        shouldObscure
          ? 'blur-3xl opacity-0 pointer-events-none select-none overflow-hidden h-screen'
          : 'flex-1 flex flex-col'
      }
    >
      {children}
    </div>
  );
};
