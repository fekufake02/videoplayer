'use client';

import React from 'react';
import { IDriveVideo } from '../types';
import { SharedVideoCard } from './SharedVideoCard';

export interface DriveVideoCardProps {
  video: IDriveVideo;
  onPlay?: (video: IDriveVideo) => void;
  onFavoriteToggle?: (id: string, isFav: boolean) => void;
  isSelected?: boolean;
  onSelectToggle?: (id: string) => void;
  viewMode?: 'grid' | 'list';
  onDelete?: (video: IDriveVideo) => void;
  onOpenDetails?: (video: IDriveVideo) => void;
}

export const DriveVideoCard: React.FC<DriveVideoCardProps> = ({
  video,
  onPlay,
  onFavoriteToggle,
  isSelected,
  onSelectToggle,
  viewMode = 'grid',
  onDelete,
  onOpenDetails,
}) => {
  return (
    <SharedVideoCard
      video={video}
      sourceType="drive"
      onPlay={onPlay as any}
      onFavoriteToggle={onFavoriteToggle}
      isSelected={isSelected}
      onSelectToggle={onSelectToggle}
      viewMode={viewMode}
      onDelete={onDelete as any}
      onOpenDetails={onOpenDetails as any}
    />
  );
};
