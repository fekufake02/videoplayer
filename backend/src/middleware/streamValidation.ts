import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';

export interface StreamRequest extends AuthenticatedRequest {
  rangeStart?: number;
  rangeEnd?: number;
  maxBufferAhead?: number;
}

/**
 * Middleware to validate and enforce stream request limits
 * - Validates Range header format
 * - Enforces maximum buffer ahead limits
 * - Prevents abuse and excessive bandwidth usage
 */
export const streamValidation = (
  req: StreamRequest,
  res: Response,
  next: NextFunction
): void => {
  const rangeHeader = req.headers.range;

  if (!rangeHeader) {
    // Full file request - no Range header
    return next();
  }

  // Parse Range header: bytes=start-end
  const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!rangeMatch) {
    res.status(416).json({
      success: false,
      error: {
        code: 'INVALID_RANGE',
        message: 'Invalid Range header format',
      },
    });
    return;
  }

  const rangeStart = parseInt(rangeMatch[1], 10);
  const rangeEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : undefined;

  if (isNaN(rangeStart) || (rangeEnd !== undefined && isNaN(rangeEnd))) {
    res.status(416).json({
      success: false,
      error: {
        code: 'INVALID_RANGE',
        message: 'Invalid Range header values',
      },
    });
    return;
  }

  // Calculate requested chunk size
  const chunkSize = rangeEnd ? rangeEnd - rangeStart + 1 : undefined;

  // Enforce maximum chunk size to prevent abuse
  // 50MB max per request
  const MAX_CHUNK_SIZE = 50 * 1024 * 1024;

  if (chunkSize && chunkSize > MAX_CHUNK_SIZE) {
    res.status(416).json({
      success: false,
      error: {
        code: 'RANGE_TOO_LARGE',
        message: 'Requested range exceeds maximum allowed size',
      },
    });
    return;
  }

  // Store parsed values in request
  req.rangeStart = rangeStart;
  req.rangeEnd = rangeEnd;

  next();
};

/**
 * Calculate maximum buffer ahead based on video metadata
 * Prevents browsers from downloading entire video
 */
export function getMaxBufferAhead(
  videoDurationSeconds: number,
  videoSizeBytes: number
): number {
  // Maximum 2 minutes ahead of current playback
  const maxAheadSeconds = Math.min(120, videoDurationSeconds * 0.25);

  // Calculate bytes for this duration
  const bytesPerSecond = videoSizeBytes / videoDurationSeconds;
  return Math.round(bytesPerSecond * maxAheadSeconds);
}

/**
 * Validate if Range request respects buffer limits
 */
export function validateBufferLimit(
  rangeStart: number,
  currentPlaybackBytes: number,
  maxBufferAhead: number
): boolean {
  // Allow requesting from current position or slightly before
  const allowedStart = Math.max(0, currentPlaybackBytes - 1024 * 1024); // 1MB buffer behind

  // Enforce maximum buffer ahead
  const allowedEnd = currentPlaybackBytes + maxBufferAhead;

  return rangeStart >= allowedStart && rangeStart <= allowedEnd;
}
