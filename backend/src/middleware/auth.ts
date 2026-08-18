import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    username?: string;
  }
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  username?: string;
}

export function generateToken(userId: string, username: string): string {
  const payload = `${userId}:${username}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64');
}

export function verifyToken(token: string): { userId: string; username: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) return null;
    const [userId, username, timestampStr, hmac] = parts;
    const payload = `${userId}:${username}:${timestampStr}`;
    const expectedHmac = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
    if (hmac !== expectedHmac) return null;

    const timestamp = parseInt(timestampStr, 10);
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > maxAge) return null;

    return { userId, username };
  } catch (e) {
    return null;
  }
}

export const requireAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  // 1. Session Cookie Check
  if (req.session && req.session.userId) {
    req.userId = req.session.userId;
    req.username = req.session.username;
    return next();
  }

  // 2. Authorization Bearer Token Check (for Mobile Safari/Chrome ITP cookie blocking)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const verified = verifyToken(token);
    if (verified) {
      req.userId = verified.userId;
      req.username = verified.username;
      return next();
    }
  }

  res.status(401).json({
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Please log in.',
    },
  });
};
