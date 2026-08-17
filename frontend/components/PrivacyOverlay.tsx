'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, EyeOff, KeyRound } from 'lucide-react';

export const PrivacyOverlay: React.FC = () => {
  const { isPrivacyActive, isLocked, unlockApp, setPrivacyMode, login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setError(err.message || 'Incorrect password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-slate-100 flex flex-col items-center justify-center p-6 backdrop-blur-3xl select-none">
      <div className="max-w-md w-full glass-panel p-8 rounded-2xl shadow-2xl border border-slate-800 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700/60 flex items-center justify-center mb-6 shadow-inner text-indigo-400">
          {isLocked ? <Lock className="w-8 h-8" /> : <EyeOff className="w-8 h-8" />}
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
          {isLocked ? 'Library Locked' : '🔒 PRIVATE'}
        </h2>

        <p className="text-slate-400 text-sm mb-6">
          {isLocked
            ? 'Application locked due to inactivity or panic lock. Enter password to continue.'
            : 'Privacy mode active. Audio muted and screen hidden.'}
        </p>

        {isLocked ? (
          <form onSubmit={handleUnlockLock} className="w-full space-y-4">
            {error && (
              <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg">
                {error}
              </div>
            )}
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
              <input
                type="password"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all shadow-lg shadow-indigo-600/20"
            >
              {isSubmitting ? 'Verifying...' : 'Unlock Application'}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setPrivacyMode(false)}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium rounded-xl transition-all"
          >
            Unlock Screen
          </button>
        )}
      </div>
    </div>
  );
};
