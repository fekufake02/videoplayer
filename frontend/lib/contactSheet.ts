/**
 * Utility functions for contact sheet sprite layout, frame calculation,
 * and timeline hover preview coordinates.
 */

export interface ContactSheetConfig {
  cols: number;
  rows: number;
  totalFrames: number;
  tileWidth: number;
  tileHeight: number;
}

export const DEFAULT_CONTACT_SHEET_CONFIG: ContactSheetConfig = {
  cols: 5,
  rows: 2,
  totalFrames: 10,
  tileWidth: 160,
  tileHeight: 90,
};

/**
 * Calculates the appropriate frame index (0-based) for a given timestamp
 */
export function getFrameIndexForTime(
  currentTime: number,
  duration: number,
  totalFrames: number = DEFAULT_CONTACT_SHEET_CONFIG.totalFrames
): number {
  if (!duration || duration <= 0 || totalFrames <= 0) return 0;
  const clampedTime = Math.max(0, Math.min(currentTime, duration));
  const ratio = clampedTime / duration;
  const frame = Math.floor(ratio * totalFrames);
  return Math.min(totalFrames - 1, Math.max(0, frame));
}

/**
 * Calculates the column and row position of a frame in the contact sheet grid
 */
export function getFrameGridPosition(
  frameIndex: number,
  cols: number = DEFAULT_CONTACT_SHEET_CONFIG.cols
): { col: number; row: number } {
  const safeCols = Math.max(1, cols);
  const col = frameIndex % safeCols;
  const row = Math.floor(frameIndex / safeCols);
  return { col, row };
}

/**
 * Computes background-position and background-size CSS properties
 * for displaying a specific tile from a contact sheet image
 */
export function getContactSheetSpriteStyle(
  frameIndex: number,
  config: ContactSheetConfig = DEFAULT_CONTACT_SHEET_CONFIG
): {
  backgroundPosition: string;
  backgroundSize: string;
  width: number;
  height: number;
} {
  const { col, row } = getFrameGridPosition(frameIndex, config.cols);
  const xPercent = config.cols > 1 ? (col / (config.cols - 1)) * 100 : 0;
  const yPercent = config.rows > 1 ? (row / (config.rows - 1)) * 100 : 0;

  return {
    backgroundPosition: `${xPercent.toFixed(2)}% ${yPercent.toFixed(2)}%`,
    backgroundSize: `${config.cols * 100}% ${config.rows * 100}%`,
    width: config.tileWidth,
    height: config.tileHeight,
  };
}

/**
 * Calculates clamped tooltip X coordinate so thumbnail preview
 * does not overflow left or right container boundaries.
 */
export function calculatePreviewClampedX(
  cursorX: number,
  containerWidth: number,
  previewWidth: number = 160
): number {
  const half = previewWidth / 2;
  const minX = half + 8;
  const maxX = containerWidth - half - 8;
  if (maxX <= minX) return containerWidth / 2;
  return Math.max(minX, Math.min(maxX, cursorX));
}
