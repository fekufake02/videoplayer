import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCollection,
  renameCollection,
  deleteCollection,
  addVideoToCollection,
  removeVideoFromCollection,
  createPlaylist,
  reorderPlaylistVideos,
  addBookmark,
  deleteBookmark,
  getVideoChapters,
  getNextVideoInQueue,
  getPrevVideoInQueue,
  isVideoCompleted,
  formatTimestamp,
} from './collectionsManager';

test('formatTimestamp formats seconds accurately', () => {
  assert.equal(formatTimestamp(0), '00:00');
  assert.equal(formatTimestamp(65), '01:05');
  assert.equal(formatTimestamp(3665), '1:01:05');
});

test('isVideoCompleted detects threshold reached', () => {
  assert.equal(isVideoCompleted(91, 100, 90), true);
  assert.equal(isVideoCompleted(85, 100, 90), false);
  assert.equal(isVideoCompleted(0, 0), false);
});

test('getVideoChapters generates proportional sections for long videos', () => {
  const chapters = getVideoChapters('vid-1', 600);
  assert.equal(chapters.length, 4);
  assert.equal(chapters[0].startTime, 0);
  assert.equal(chapters[3].endTime, 600);
});

test('getNextVideoInQueue and getPrevVideoInQueue navigate correctly', () => {
  const queue = [{ _id: 'v1' }, { _id: 'v2' }, { _id: 'v3' }];
  assert.deepEqual(getNextVideoInQueue('v1', queue), { _id: 'v2' });
  assert.deepEqual(getNextVideoInQueue('v3', queue), null);
  assert.deepEqual(getPrevVideoInQueue('v2', queue), { _id: 'v1' });
  assert.deepEqual(getPrevVideoInQueue('v1', queue), null);
});
