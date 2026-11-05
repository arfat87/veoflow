/**
 * VeoFlow Credential Manager (ESM)
 * Provides Windows DPAPI-backed encryption for API keys and secrets via Electron's safeStorage.
 * Falls back to AES-256-GCM with local machine-bound salt in headless/test environments.
 * Strictly guarantees secrets never reach the renderer process and never appear in logs.
 */
import crypto from 'node:crypto';
import os from 'node:os';

let electronSafeStorage = null;
let safeStorageChecked = false;

function getSafeStorage() {
  if (safeStorageChecked) return electronSafeStorage;
  safeStorageChecked = true;
  try {
    // Check global/process for electron
    if (process.versions && process.versions.electron) {
      const electron = globalThis.electronModule || null;
      if (electron && electron.safeStorage) {
        electronSafeStorage = electron.safeStorage;
        return electronSafeStorage;
      }
    }
  } catch {}
  return electronSafeStorage;
}

export function setElectronModule(electron) {
  if (electron && electron.safeStorage) {
    electronSafeStorage = electron.safeStorage;
  }
}

export class CredentialManager {
  constructor() {
    this.fallbackKey = null;
  }

  /**
   * Synchronously checks if Electron DPAPI safeStorage is available.
   */
  isEncryptionAvailable() {
    const ss = getSafeStorage();
    if (ss && typeof ss.isEncryptionAvailable === 'function') {
      return ss.isEncryptionAvailable();
    }
    return false;
  }

  /**
   * Derives a machine-bound fallback key for environments where safeStorage is unavailable (e.g. tests).
   */
  getFallbackKey() {
    if (!this.fallbackKey) {
      let username = 'default';
      try {
        username = os.userInfo().username || 'default';
      } catch {}
      const entropy = `${os.hostname()}:${username}:veoflow-local-storage-v1`;
      this.fallbackKey = crypto.createHash('sha256').update(entropy).digest();
    }
    return this.fallbackKey;
  }

  /**
   * Synchronously encrypts plaintext string using DPAPI (or AES-256-GCM fallback).
   * @param {string} plainText
   * @returns {string} Prefixed ciphertext (e.g. "dpapi:..." or "aes:...")
   */
  encryptSync(plainText) {
    if (!plainText || typeof plainText !== 'string' || !plainText.trim()) {
      return '';
    }

    const ss = getSafeStorage();
    if (ss && typeof ss.isEncryptionAvailable === 'function' && ss.isEncryptionAvailable()) {
      try {
        const buffer = ss.encryptString(plainText.trim());
        return `dpapi:${buffer.toString('base64')}`;
      } catch {
        // Fallback if safeStorage throws
      }
    }

    // Fallback: AES-256-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getFallbackKey(), iv);
    let encrypted = cipher.update(plainText.trim(), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    return `aes:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  }

  /**
   * Synchronously decrypts ciphertext back to plaintext.
   * @param {string} cipherText
   * @returns {string} Plaintext
   */
  decryptSync(cipherText) {
    if (!cipherText || typeof cipherText !== 'string' || !cipherText.trim()) {
      return '';
    }

    const text = cipherText.trim();

    if (text.startsWith('dpapi:')) {
      const ss = getSafeStorage();
      if (ss && typeof ss.isEncryptionAvailable === 'function' && ss.isEncryptionAvailable()) {
        const buffer = Buffer.from(text.slice(6), 'base64');
        return ss.decryptString(buffer);
      }
      throw new Error('DPAPI decryption unavailable: safeStorage is not available in current environment');
    }

    if (text.startsWith('aes:')) {
      const parts = text.split(':');
      if (parts.length === 4) {
        const [, ivHex, tagHex, encryptedBase64] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.getFallbackKey(), iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
    }

    // Legacy unencrypted plaintext fallback
    return text;
  }

  async encrypt(plainText) {
    return this.encryptSync(plainText);
  }

  async decrypt(cipherText) {
    return this.decryptSync(cipherText);
  }

  /**
   * Creates a masked representation of an API key for safe UI display (e.g. "••••••••1234").
   * Never exposes more than the last 4 characters.
   * @param {string} key
   * @returns {string}
   */
  mask(key) {
    if (!key || typeof key !== 'string') return '';
    const trimmed = key.trim();
    if (trimmed.length <= 4) return '••••••••';
    const last4 = trimmed.slice(-4);
    return `••••••••${last4}`;
  }
}

export const credentialManager = new CredentialManager();
export default credentialManager;
