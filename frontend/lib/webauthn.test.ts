import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bufferToBase64url,
  base64urlToBuffer,
  generateRandomChallenge,
} from './webauthn';

test('bufferToBase64url and base64urlToBuffer encode and decode symmetrically', () => {
  const original = new Uint8Array([1, 2, 3, 255, 128, 42, 0, 77]);
  const encoded = bufferToBase64url(original);
  assert.ok(encoded.length > 0);
  assert.ok(!encoded.includes('+'));
  assert.ok(!encoded.includes('/'));
  assert.ok(!encoded.includes('='));

  const decoded = base64urlToBuffer(encoded);
  assert.deepEqual(Array.from(decoded), Array.from(original));
});

test('generateRandomChallenge produces specified buffer size', () => {
  const challenge16 = generateRandomChallenge(16);
  assert.equal(challenge16.byteLength, 16);

  const challenge32 = generateRandomChallenge(32);
  assert.equal(challenge32.byteLength, 32);
});
