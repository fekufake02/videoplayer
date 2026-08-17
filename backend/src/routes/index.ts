import { Router } from 'express';
import * as authController from '../controllers/authController';
import * as videoController from '../controllers/videoController';
import * as settingsController from '../controllers/settingsController';
import { requireAuth } from '../middleware/auth';
import { loginLimiter } from '../middleware/rateLimiter';

const router = Router();

// Authentication Routes
router.post('/auth/login', loginLimiter, authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authController.me);

// Library & Video Listing Routes
router.get('/videos', requireAuth, videoController.listVideos);
router.get('/library/home', requireAuth, videoController.getLibraryHome);

// Direct Upload Routes
router.post('/videos/upload/initiate', requireAuth, videoController.initiateUpload);
router.post('/videos/upload/complete', requireAuth, videoController.completeUpload);

// Single Video Operations
router.get('/videos/:id', requireAuth, videoController.getVideoDetails);
router.patch('/videos/:id', requireAuth, videoController.updateVideoMetadata);
router.delete('/videos/:id', requireAuth, videoController.deleteVideo);

// Secure Temporary Presigned Stream & Download URLs
router.get('/videos/:id/stream-url', requireAuth, videoController.getStreamUrl);
router.get('/videos/:id/download-url', requireAuth, videoController.getDownloadUrl);

// Playback & Watch Statistics
router.patch('/videos/:id/progress', requireAuth, videoController.updateProgress);
router.post('/videos/:id/play', requireAuth, videoController.recordPlay);
router.post('/videos/:id/favorite', requireAuth, videoController.toggleFavorite);

// User Settings & Privacy Controls
router.get('/settings', requireAuth, settingsController.getSettings);
router.patch('/settings', requireAuth, settingsController.updateSettings);
router.post('/settings/clear-history', requireAuth, settingsController.clearHistory);

export default router;
