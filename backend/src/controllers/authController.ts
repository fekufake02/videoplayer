import { Response } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { User } from '../models/User';
import { Settings } from '../models/Settings';
import { AuthenticatedRequest, generateToken, verifyToken } from '../middleware/auth';

const loginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

/**
 * Ensures at least one user exists in the database.
 * Seeds an admin user with a default password if database is empty.
 * Default password: admin123 (or process.env.ADMIN_PASSWORD)
 */
export const ensureAdminUser = async () => {
  try {
    const envPassword = process.env.ADMIN_PASSWORD || 'admin123';
    let adminUser = await User.findOne({ username: 'admin' });
    if (!adminUser) {
      const hashedPassword = await argon2.hash(envPassword, {
        type: argon2.argon2id,
      });
      adminUser = await User.create({
        username: 'admin',
        passwordHash: hashedPassword,
      });
      
      // Seed default settings for admin
      await Settings.create({
        userId: adminUser._id.toString(),
      });
      console.log('Seeded initial admin user into database with password from env/default.');
    } else if (process.env.ADMIN_PASSWORD) {
      // If ADMIN_PASSWORD is set in environment, check if it matches current hash
      // If not, synchronize password hash so changing env immediately takes effect!
      const matchesEnv = await argon2.verify(adminUser.passwordHash, process.env.ADMIN_PASSWORD).catch(() => false);
      if (!matchesEnv) {
        adminUser.passwordHash = await argon2.hash(process.env.ADMIN_PASSWORD, {
          type: argon2.argon2id,
        });
        await adminUser.save();
        console.log('Synchronized admin user password in database with process.env.ADMIN_PASSWORD.');
      }
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

    // Check against passwordHash in database OR direct process.env.ADMIN_PASSWORD match
    let isMatch = false;
    try {
      isMatch = await argon2.verify(user.passwordHash, password);
    } catch {}

    // If environment variable ADMIN_PASSWORD was changed, honor it and update DB hash
    if (!isMatch && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
      isMatch = true;
      try {
        user.passwordHash = await argon2.hash(password, { type: argon2.argon2id });
        await user.save();
      } catch (err) {
        console.warn('Could not update passwordHash on env login sync:', err);
      }
    }

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

    const token = generateToken(user._id.toString(), user.username);

    // Fetch or create user settings
    let settings = await Settings.findOne({ userId: user._id.toString() });
    if (!settings) {
      settings = await Settings.create({ userId: user._id.toString() });
    }

    res.status(200).json({
      success: true,
      token,
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
  let userId = req.session?.userId;
  let username = req.session?.username;

  // Fallback to Bearer token header if cookie was omitted by mobile browser
  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const verified = verifyToken(token);
      if (verified) {
        userId = verified.userId;
        username = verified.username;
      }
    }
  }

  if (!userId) {
    res.status(200).json({
      success: true,
      authenticated: false,
    });
    return;
  }

  try {
    const user = await User.findById(userId);
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
