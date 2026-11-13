import { Schema, model, Document } from 'mongoose';

export type EmbedPlaybackType = 'iframe' | 'direct' | 'hybrid';

export interface IEmbedVideo extends Document {
  sourceUrl: string;
  embedUrl?: string;
  directMediaUrl?: string;
  playbackType: EmbedPlaybackType;
  platform: string;
  sourceDomain: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  thumbnailKey?: string;
  thumbnailStorageAccount?: 'account1' | 'account2';
  blurhash?: string;
  duration: number;
  playCount: number;
  favorite: boolean;
  tags: string[];
  notes?: string;
  lastPlayedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const embedVideoSchema = new Schema<IEmbedVideo>(
  {
    sourceUrl: { type: String, required: true, index: true },
    embedUrl: { type: String },
    directMediaUrl: { type: String },
    playbackType: {
      type: String,
      enum: ['iframe', 'direct', 'hybrid'],
      default: 'iframe',
    },
    platform: { type: String, default: 'web', index: true },
    sourceDomain: { type: String, default: '' },
    title: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    thumbnailUrl: { type: String },
    thumbnailKey: { type: String },
    thumbnailStorageAccount: {
      type: String,
      enum: ['account1', 'account2'],
      default: 'account2',
    },
    blurhash: { type: String },
    duration: { type: Number, default: 0 },
    playCount: { type: Number, default: 0 },
    favorite: { type: Boolean, default: false, index: true },
    tags: { type: [String], default: [], index: true },
    notes: { type: String, default: '' },
    lastPlayedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

embedVideoSchema.index({ createdAt: -1 });
embedVideoSchema.index({ favorite: 1, createdAt: -1 });
embedVideoSchema.index({ playCount: -1 });

export const EmbedVideo = model<IEmbedVideo>('EmbedVideo', embedVideoSchema);
