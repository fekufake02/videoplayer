import { Response } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { User } from '../models/User';
import { Settings } from '../models/Settings';
import { config } from '../config';
import { AuthenticatedRequest } from '../middleware/auth';

const loginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

/**
 * Ensures at least one user exists in the database.
 * Seeds an admin user if database is empty.
 */
export const ensureAdminUser = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const hashedPassword = await argon2.hash(config.adminPassword, {
        type: argon2.argon2id,
      });
      const adminUser = await User.create({
        username: 'admin',
        passwordHash: hashedPassword,
      });
      
      // Seed default settings for admin
      await Settings.create({
        userId: adminUser._id.toString(),
      });
      console.log('Seeded initial admin user into database.');
    }
  } catch (error) {
    console.error('Error ensuring admin user exists:', error);
  }
};

export const login = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Password is required.',
        },
      });
      return;
    }

    const { password } = parsed.data;

    // Retrieve user record
    let user = await User.findOne({ username: 'admin' });
    if (!user) {
      await ensureAdminUser();
      user = await User.findOne({ username: 'admin' });
    }

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid authentication password.' },
      });
      return;
    }

    const isMatch = await argon2.verify(user.passwordHash, password);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid authentication password.' },
      });
      return;
    }

    // Authentication succeeded
    user.lastLoginAt = new Date();
    await user.save();

    req.session.userId = user._id.toString();
    req.session.username = user.username;

    // Fetch or create user settings
    let settings = await Settings.findOne({ userId: user._id.toString() });
    if (!settings) {
      settings = await Settings.create({ userId: user._id.toString() });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
      },
      settings,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
    });
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({
        success: false,
        error: { code: 'LOGOUT_FAILED', message: 'Failed to logout session.' },
      });
      return;
    }
    res.clearCookie('connect.sid');
    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  });
};

export const me = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.session || !req.session.userId) {
    res.status(200).json({
      success: true,
      authenticated: false,
    });
    return;
  }

  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      res.status(200).json({ success: true, authenticated: false });
      return;
    }

    let settings = await Settings.findOne({ userId: user._id.toString() });
    if (!settings) {
      settings = await Settings.create({ userId: user._id.toString() });
    }

    res.status(200).json({
      success: true,
      authenticated: true,
      user: {
        id: user._id,
        username: user.username,
      },
      settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve session status.' },
    });
  }
};
