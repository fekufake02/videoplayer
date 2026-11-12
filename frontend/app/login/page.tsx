'use client';

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { KeyRound, ArrowRight, Fingerprint, BookOpen, Shield } from 'lucide-react';

export default function LoginPage() {
  const {
    login,
    isAuthenticated,
    isLoading,
    hasBiometricRegistered,
    unlockWithBiometric,
    enterDecoyMode,
    decoyConfig,
  } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBiometricPrompting, setIsBiometricPrompting] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setIsSubmitting(true);
    setError('');

    try {
      await login(password);
    } catch (err: any) {
      setError(err.message || 'Invalid authentication password.');
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
        setError('Biometric authentication canceled or failed.');
      }
    } catch (err: any) {
      setError(err.message || 'Biometric authentication error.');
    } finally {
      setIsBiometricPrompting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background text-text-primary">
      <div className="max-w-sm w-full bg-surface border border-border p-8 rounded-2xl shadow-2xl text-center flex flex-col items-center">
        {/* Vault Emblem */}
        <div className="w-14 h-14 rounded-xl bg-surface-elevated border border-border flex items-center justify-center text-accent shadow-sm mb-5">
          <Shield className="w-7 h-7" />
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-text-primary mb-1">
          Vault Authentication
        </h1>
        <p className="text-xs text-text-secondary mb-6">
          Enter master credentials or use biometrics to unlock your library.
        </p>

        {error && (
          <div className="w-full p-3 mb-4 text-xs bg-danger/10 border border-danger/20 text-danger rounded-lg text-left">
            {error}
          </div>
        )}

        <div className="w-full space-y-3.5">
          {/* Biometric Passkey Unlock */}
          {hasBiometricRegistered && (
            <button
              type="button"
              onClick={handleBiometricClick}
              disabled={isBiometricPrompting}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover active:scale-[0.99] text-white font-medium text-xs rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Fingerprint className="w-4 h-4" />
              <span>{isBiometricPrompting ? 'Verifying...' : 'Unlock with Biometrics'}</span>
            </button>
          )}

          <form onSubmit={handleSubmit} className="w-full space-y-3">
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-text-muted" />
              <input
                type="password"
                placeholder="Enter master password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus={!hasBiometricRegistered}
                required
                className="w-full pl-9 pr-3 py-2 bg-background-secondary border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-2.5 ${
                hasBiometricRegistered
                  ? 'bg-surface-elevated hover:bg-surface-hover text-text-primary border border-border'
                  : 'bg-accent hover:bg-accent-hover text-white'
              } disabled:opacity-50 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 group cursor-pointer`}
            >
              <span>{isSubmitting ? 'Unlocking...' : 'Unlock Vault'}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>

          {/* Quick Decoy Mode Button */}
          {decoyConfig.enabled && (
            <div className="pt-3 border-t border-border">
              <button
                type="button"
                onClick={enterDecoyMode}
                className="w-full py-2 px-3 rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border text-text-muted hover:text-text-primary text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-accent" />
                <span>Switch to Decoy Mode ({decoyConfig.shortcut || 'Alt+D'})</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
