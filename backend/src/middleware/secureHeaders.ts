import { Request, Response, NextFunction } from 'express';

/**
 * Add security and streaming optimization headers
 */
export const secureStreamHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Prevent content type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent MIME type confusion attacks
  res.setHeader('Content-Security-Policy', "default-src 'self'; media-src 'self' blob:; img-src 'self' data: blob:");

  // Allow video streaming
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  // Set proper caching for presigned URLs
  // Short cache to prevent URL reuse
  if (req.path.includes('/stream-url') || req.path.includes('/thumbnail')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
};
