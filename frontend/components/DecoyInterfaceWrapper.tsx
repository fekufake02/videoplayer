'use client';

import React from 'react';
import { useAuth } from '../context/AuthContext';
import { DecoyInterface } from './DecoyInterface';

export const DecoyInterfaceWrapper: React.FC = () => {
  const { isDecoyActive, decoyConfig, exitDecoyMode } = useAuth();

  if (!isDecoyActive || !decoyConfig.enabled) {
    return null;
  }

  return <DecoyInterface config={decoyConfig} onExit={exitDecoyMode} />;
};
