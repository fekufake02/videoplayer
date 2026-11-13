import { Schema, model, Document } from 'mongoose';

export interface IDriveVideo extends Document {
  driveFileId: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  duration?: number;
  thumbnailKey?: string;
  thumbnailStorageAccount?: 'account1' | 'account2';
  thumbnailUrl?: string;
  blurhash?: string;
  driveViewUrl?: string;
  driveStreamUrl?: string;
  folderId?: string;
  lastSyncedAt?: Date;
  playCount: number;
  favorite: boolean;
  tags?: string[];
  customTitle?: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const driveVideoSchema = new Schema<IDriveVideo>(
  {
    driveFileId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, index: true },
    originalFilename: { type: String, required: true },
    mimeType: { type: String, default: 'video/mp4' },
    size: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    thumbnailKey: { type: String },
    thumbnailStorageAccount: { type: String, enum: ['account1', 'account2'], default: 'account2' },
    thumbnailUrl: { type: String },
    blurhash: { type: String },
    driveViewUrl: { type: String },
    driveStreamUrl: { type: String },
    folderId: { type: String, index: true },
    lastSyncedAt: { type: Date, default: Date.now },
    playCount: { type: Number, default: 0 },
    favorite: { type: Boolean, default: false, index: true },
    tags: { type: [String], default: [] },
    customTitle: { type: Boolean, default: false },
    notes: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

driveVideoSchema.index({ createdAt: -1 });
driveVideoSchema.index({ folderId: 1, createdAt: -1 });

export const DriveVideo = model<IDriveVideo>('DriveVideo', driveVideoSchema);
