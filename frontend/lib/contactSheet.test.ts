import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFrameIndexForTime,
  getFrameGridPosition,
  getContactSheetSpriteStyle,
  calculatePreviewClampedX,
  DEFAULT_CONTACT_SHEET_CONFIG,
} from './contactSheet';

test('getFrameIndexForTime computes correct frame index', () => {
  const duration = 100;
  // Frame 0 at start
  assert.equal(getFrameIndexForTime(0, duration, 10), 0);
  assert.equal(getFrameIndexForTime(5, duration, 10), 0);
  // Frame 5 at 50%
  assert.equal(getFrameIndexForTime(50, duration, 10), 5);
  // Frame 9 at 95% and at end
  assert.equal(getFrameIndexForTime(95, duration, 10), 9);
  assert.equal(getFrameIndexForTime(100, duration, 10), 9);
  // Over bounds clamps to max frame
  assert.equal(getFrameIndexForTime(150, duration, 10), 9);
  // Negative time clamps to 0
  assert.equal(getFrameIndexForTime(-10, duration, 10), 0);
});

test('getFrameGridPosition computes row and col correctly', () => {
  // 5 cols per row
  assert.deepEqual(getFrameGridPosition(0, 5), { col: 0, row: 0 });
  assert.deepEqual(getFrameGridPosition(4, 5), { col: 4, row: 0 });
  assert.deepEqual(getFrameGridPosition(5, 5), { col: 0, row: 1 });
  assert.deepEqual(getFrameGridPosition(9, 5), { col: 4, row: 1 });
});

test('getContactSheetSpriteStyle generates correct CSS properties', () => {
  const style0 = getContactSheetSpriteStyle(0, DEFAULT_CONTACT_SHEET_CONFIG);
  assert.equal(style0.backgroundPosition, '0.00% 0.00%');
  assert.equal(style0.backgroundSize, '500% 200%');
  assert.equal(style0.width, 160);
  assert.equal(style0.height, 90);

  const styleEnd = getContactSheetSpriteStyle(9, DEFAULT_CONTACT_SHEET_CONFIG);
  assert.equal(styleEnd.backgroundPosition, '100.00% 100.00%');
});

test('calculatePreviewClampedX clamps bounds to prevent overflow', () => {
  const containerWidth = 1000;
  const previewWidth = 160;
  // Center stays centered
  assert.equal(calculatePreviewClampedX(500, containerWidth, previewWidth), 500);
  // Far left is clamped to half + 8 = 88
  assert.equal(calculatePreviewClampedX(10, containerWidth, previewWidth), 88);
  // Far right is clamped to 1000 - 88 = 912
  assert.equal(calculatePreviewClampedX(990, containerWidth, previewWidth), 912);
});
