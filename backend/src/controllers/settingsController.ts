import { Response } from 'express';
import { z } from 'zod';
import { Settings } from '../models/Settings';
import { Video } from '../models/Video';
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
