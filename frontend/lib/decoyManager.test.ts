import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDecoyShortcutPressed,
  verifyDecoyExitPin,
  DECOY_PRESET_DATA,
} from './decoyManager';

test('isDecoyShortcutPressed detects Alt+D shortcut accurately', () => {
  // Matches Alt + D
  assert.equal(
    isDecoyShortcutPressed({ key: 'd', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, 'Alt+D'),
    true
  );
  assert.equal(
    isDecoyShortcutPressed({ key: 'D', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, 'Alt+D'),
    true
  );

  // Missing Alt key
  assert.equal(
    isDecoyShortcutPressed({ key: 'd', altKey: false, ctrlKey: false, shiftKey: false, metaKey: false }, 'Alt+D'),
    false
  );

  // Wrong key
  assert.equal(
    isDecoyShortcutPressed({ key: 'e', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, 'Alt+D'),
    false
  );
});

test('verifyDecoyExitPin validates PIN', () => {
  assert.equal(verifyDecoyExitPin('1234', '1234'), true);
  assert.equal(verifyDecoyExitPin(' 1234 ', '1234'), true);
  assert.equal(verifyDecoyExitPin('9999', '1234'), false);
  assert.equal(verifyDecoyExitPin('', '1234'), false);
});

test('DECOY_PRESET_DATA provides harmless content for all presets', () => {
  assert.ok(DECOY_PRESET_DATA.research.documentContent.length > 50);
  assert.ok(DECOY_PRESET_DATA.tasks.tasks.length >= 3);
  assert.ok(DECOY_PRESET_DATA.spreadsheet.rows.length >= 3);
});
