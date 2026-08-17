import { Schema, model, Document } from 'mongoose';

export interface ISettings extends Document {
  userId: string;
  defaultPlaybackSpeed: number;
  defaultVolume: number;
  skipBackwardDuration: number;
  skipForwardDuration: number;
  autoResume: boolean;
  autoplay: boolean;
  autoLockDuration: number; // in minutes, 0 means Never
  privacyTabHidden: boolean;
  saveWatchHistory: boolean;
  theme: string;
  layout: string;
}

const settingsSchema = new Schema<ISettings>(
  {
    userId: { type: String, required: true, unique: true },
    defaultPlaybackSpeed: { type: Number, default: 1 },
    defaultVolume: { type: Number, default: 1 },
    skipBackwardDuration: { type: Number, default: 10 },
    skipForwardDuration: { type: Number, default: 10 },
    autoResume: { type: Boolean, default: true },
    autoplay: { type: Boolean, default: false },
    autoLockDuration: { type: Number, default: 15 },
    privacyTabHidden: { type: Boolean, default: false },
    saveWatchHistory: { type: Boolean, default: true },
    theme: { type: String, default: 'dark' },
    layout: { type: String, default: 'comfortable' },
  },
  {
    timestamps: true,
  }
);

export const Settings = model<ISettings>('Settings', settingsSchema);
