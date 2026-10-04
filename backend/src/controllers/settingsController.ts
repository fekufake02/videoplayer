import { Response } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { Settings } from '../models/Settings';
import { Video } from '../models/Video';
import { User } from '../models/User';
import { AuthenticatedRequest } from '../middleware/auth';

const updateSettingsSchema = z.object({
  defaultPlaybackSpeed: z.number().min(0.25).max(3).optional(),
  defaultVolume: z.number().min(0).max(1).optional(),
  skipBackwardDuration: z.number().min(1).max(300).optional(),
  skipForwardDuration: z.number().min(1).max(300).optional(),
  autoResume: z.boolean().optional(),
  autoplay: z.boolean().optional(),
  autoLockDuration: z.number().min(0).optional(),
  privacyTabHidden: z.boolean().optional(),
  lockOnWindowBlur: z.boolean().optional(),
  pauseOnTabSwitch: z.boolean().optional(),
  keyboardShortcuts: z.boolean().optional(),
  saveWatchHistory: z.boolean().optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  layout: z.enum(['comfortable', 'compact']).optional(),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const getSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    let settings = await Settings.findOne({ userId });
    if (!settings) {
      settings = await Settings.create({ userId });
    }

    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch user settings.' },
    });
  }
};

export const updateSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Invalid settings fields.' },
      });
      return;
    }

    let settings = await Settings.findOne({ userId });
    if (!settings) {
      settings = new Settings({ userId, ...parsed.data });
    } else {
      Object.assign(settings, parsed.data);
    }

    await settings.save();

    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update settings.' },
    });
  }
};

export const clearHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await Video.updateMany(
      {},
      {
        $unset: { lastPlayedAt: 1 },
        $set: { lastPosition: 0, playCount: 0 },
      }
    );

    res.status(200).json({
      success: true,
      message: 'Watch history, play counts, and saved positions have been cleared.',
    });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to clear watch history.' },
    });
  }
};

/**
 * Admin-only endpoint to update admin password
 * Requires current password verification
 * POST /api/settings/admin/update-password
 * 
 * Request body:
 * {
 *   "currentPassword": "old_password",
 *   "newPassword": "new_password_min_8_chars"
 * }
 */
export const updateAdminPassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Verify user is admin
    const user = await User.findById(userId);
    if (!user || user.username !== 'admin') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admin can change password.' },
      });
      return;
    }

    // Validate request body
    const parsed = updatePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { 
          code: 'INVALID_INPUT', 
          message: parsed.error.errors[0]?.message || 'Invalid input.' 
        },
      });
      return;
    }

    const { currentPassword, newPassword } = parsed.data;

    // Verify current password
    const isMatch = await argon2.verify(user.passwordHash, currentPassword);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' },
      });
      return;
    }

    // Hash new password
    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    // Update password in database
    user.passwordHash = hashedPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update password.' },
    });
  }
};
