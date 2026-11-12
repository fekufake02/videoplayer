'use client';

import React from 'react';
import { IVideo } from '../types';
import { SharedVideoCard } from './SharedVideoCard';

export interface VideoCardProps {
  video: IVideo;
  onEdit?: (video: IVideo) => void;
  onDelete?: (video: IVideo) => void;
  onFavoriteToggle?: (id: string, isFav: boolean) => void;
  isSelected?: boolean;
  onSelectToggle?: (id: string) => void;
  viewMode?: 'grid' | 'list';
  onPlay?: (video: IVideo) => void;
  onOpenDetails?: (video: IVideo) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  onEdit,
  onDelete,
  onFavoriteToggle,
  isSelected,
  onSelectToggle,
  viewMode = 'grid',
  onPlay,
  onOpenDetails,
}) => {
  return (
    <SharedVideoCard
      video={video}
      sourceType="vault"
      onEdit={onEdit}
      onDelete={onDelete as any}
      onFavoriteToggle={onFavoriteToggle}
      isSelected={isSelected}
      onSelectToggle={onSelectToggle}
      viewMode={viewMode}
      onPlay={onPlay as any}
      onOpenDetails={onOpenDetails as any}
    />
  );
};
