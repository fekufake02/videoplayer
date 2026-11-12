/**
 * WebAuthn Passkey and Biometric Unlock helpers
 */

/**
 * Encodes an ArrayBuffer or Uint8Array to base64url string
 */
export function bufferToBase64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes a base64url string to Uint8Array
 */
export function base64urlToBuffer(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface BiometricCredential {
  id: string; // Base64URL credential ID
  rawId?: string;
  createdAt: number;
  label: string;
}

const WEBAUTHN_STORAGE_KEY = 'vault_biometric_credential';

/**
 * Checks if platform biometrics / WebAuthn is supported in the current browser
 */
export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return false;
  }
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves the stored biometric credential from local storage
 */
export function getStoredBiometricCredential(): BiometricCredential | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(WEBAUTHN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Saves a registered biometric credential to local storage
 */
export function saveBiometricCredential(cred: BiometricCredential): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WEBAUTHN_STORAGE_KEY, JSON.stringify(cred));
}

/**
 * Clears stored biometric credential
 */
export function clearBiometricCredential(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(WEBAUTHN_STORAGE_KEY);
}

/**
 * Generates random challenge buffer
 */
export function generateRandomChallenge(size: number = 32): Uint8Array {
  const challenge = new Uint8Array(size);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(challenge);
  } else {
    for (let i = 0; i < size; i++) {
      challenge[i] = Math.floor(Math.random() * 256);
    }
  }
  return challenge;
}
