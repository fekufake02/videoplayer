import { Schema, model, Document } from 'mongoose';

export interface IVideo extends Document {
  title: string;
  originalFilename: string;
  storageKey: string;
  storageAccount?: 'account1' | 'account2';
  thumbnailKey?: string;
  thumbnailStorageAccount?: 'account1' | 'account2';
  thumbnailUrl?: string;
  blurhash?: string;
  mimeType: string;
  size: number;
  duration?: number;
  createdAt: Date;
  updatedAt: Date;
  lastPlayedAt?: Date;
  lastPosition: number;
  playCount: number;
  favorite: boolean;
  tags: string[];
  notes?: string;
}

const videoSchema = new Schema<IVideo>(
  {
    title: { type: String, required: true, index: true },
    originalFilename: { type: String, required: true },
    storageKey: { type: String, required: true, unique: true },
    storageAccount: { type: String, default: 'account1', enum: ['account1', 'account2'] },
    thumbnailKey: { type: String },
    thumbnailStorageAccount: { type: String, enum: ['account1', 'account2'] },
    blurhash: { type: String },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    duration: { type: Number, default: 0 },
    lastPlayedAt: { type: Date, index: true },
    lastPosition: { type: Number, default: 0 },
    playCount: { type: Number, default: 0, index: true },
    favorite: { type: Boolean, default: false, index: true },
    tags: { type: [String], default: [], index: true },
    notes: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for sorting and filtering optimization
videoSchema.index({ createdAt: -1 });
videoSchema.index({ lastPlayedAt: -1 });
videoSchema.index({ playCount: -1, lastPlayedAt: -1 });
videoSchema.index({ favorite: -1, createdAt: -1 });

export const Video = model<IVideo>('Video', videoSchema);
