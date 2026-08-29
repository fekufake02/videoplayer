'use client';

import { useEffect, useState, useCallback } from 'react';

export interface NetworkInfo {
  speed: 'slow' | 'moderate' | 'fast';
  bandwidth: number; // Mbps
  latency: number; // ms
  type: '4g' | '3g' | '2g' | 'unknown';
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g';
}

const DEFAULT_NETWORK: NetworkInfo = {
  speed: 'fast',
  bandwidth: 10,
  latency: 50,
  type: 'unknown',
  effectiveType: '4g',
};

export const useNetworkStatus = (): NetworkInfo => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>(DEFAULT_NETWORK);

  const estimateNetworkSpeed = useCallback(() => {
    if (typeof navigator === 'undefined') return;

    try {
      // Modern Network Information API
      const connection = (navigator as any).connection || (navigator as any).mozConnection;

      if (connection) {
        const effectiveType = connection.effectiveType || '4g';
        const downloadSpeed = connection.downlink || 10; // Mbps
        const rtt = connection.rtt || 50; // ms

        let speed: 'slow' | 'moderate' | 'fast';
        if (effectiveType === 'slow-2g' || effectiveType === '2g') {
          speed = 'slow';
        } else if (effectiveType === '3g') {
          speed = 'moderate';
        } else {
          speed = 'fast';
        }

        setNetworkInfo({
          speed,
          bandwidth: downloadSpeed,
          latency: rtt,
          type: effectiveType as any,
          effectiveType: effectiveType as any,
        });
      }
    } catch (e) {
      // Fallback: use default network info
    }
  }, []);

  useEffect(() => {
    estimateNetworkSpeed();

    if (typeof navigator !== 'undefined') {
      const connection = (navigator as any).connection || (navigator as any).mozConnection;
      if (connection) {
        connection.addEventListener('change', estimateNetworkSpeed);
        return () => connection.removeEventListener('change', estimateNetworkSpeed);
      }
    }
  }, [estimateNetworkSpeed]);

  return networkInfo;
};
