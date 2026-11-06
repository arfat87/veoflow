/**
 * VeoFlow Credential Manager (ESM)
 * Provides Windows DPAPI-backed encryption for API keys and secrets via Electron's safeStorage
 * or native Windows ProtectedData (CurrentUser scope).
 * Weak machine-bound AES fallbacks have been completely eliminated.
 * Strictly guarantees secrets never reach the renderer process and never appear in logs.
 */
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

let electronSafeStorage = null;
let safeStorageChecked = false;

function getSafeStorage() {
  if (safeStorageChecked) return electronSafeStorage;
  safeStorageChecked = true;
  try {
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
    safeStorageChecked = true;
  }
}

/**
 * Encrypts data using native Windows DPAPI (CurrentUser scope) via PowerShell stdin.
 * Used when running outside Electron main process on Windows (e.g. CLI, migrations).
 * @param {string} plainText
 * @returns {string} Prefixed ciphertext "dpapi-win:..."
 */
function nativeWindowsDpapiEncrypt(plainText) {
  if (process.platform !== 'win32') {
    throw new Error('Native Windows DPAPI is only supported on Windows');
  }

  const encScript = `
    $plain = [Console]::In.ReadToEnd();
    Add-Type -AssemblyName System.Security;
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($plain);
    $enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);
    [Console]::Out.Write([Convert]::ToBase64String($enc));
  `;

  try {
    const b64 = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', encScript], {
      input: plainText,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }).trim();

    if (!b64) {
      throw new Error('Empty ciphertext returned by native DPAPI');
    }
    return `dpapi-win:${b64}`;
  } catch (err) {
    throw new Error(`Native Windows DPAPI encryption failed: ${err.message}`);
  }
}

/**
 * Decrypts data using native Windows DPAPI (CurrentUser scope) via PowerShell stdin.
 * @param {string} cipherTextB64 Base64 string without prefix
 * @returns {string} Plaintext
 */
function nativeWindowsDpapiDecrypt(cipherTextB64) {
  if (process.platform !== 'win32') {
    throw new Error('Native Windows DPAPI is only supported on Windows');
  }

  const decScript = `
    $b64 = [Console]::In.ReadToEnd();
    Add-Type -AssemblyName System.Security;
    $bytes = [Convert]::FromBase64String($b64);
    $dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);
    [Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($dec));
  `;

  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', decScript], {
      input: cipherTextB64,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
  } catch (err) {
    throw new Error(`Native Windows DPAPI decryption failed: ${err.message}`);
  }
}

export class CredentialManager {
  constructor() {
    this.encryptionDisabledForTest = false;
  }

  /**
   * Synchronously checks if secure Windows DPAPI encryption is available.
   * Checks Electron safeStorage first, then native Windows DPAPI capability.
   */
  isEncryptionAvailable() {
    if (this.encryptionDisabledForTest) return false;
    const ss = getSafeStorage();
    if (ss && typeof ss.isEncryptionAvailable === 'function') {
      return ss.isEncryptionAvailable();
    }
    return process.platform === 'win32';
  }

  /**
   * Synchronously encrypts plaintext string using Windows DPAPI (CurrentUser).
   * Refuses to persist secrets if secure DPAPI is unavailable. Never uses weak machine-bound AES.
   * @param {string} plainText
   * @returns {string} Prefixed ciphertext ("dpapi:..." or "dpapi-win:...")
   */
  encryptSync(plainText) {
    if (!plainText || typeof plainText !== 'string' || !plainText.trim()) {
      return '';
    }

    if (!this.isEncryptionAvailable()) {
      throw new Error('SecureStorageUnavailableError: Windows DPAPI secure encryption is required to store API credentials. Refusing to store unencrypted secrets.');
    }

    const trimmed = plainText.trim();
    const ss = getSafeStorage();
    if (ss && typeof ss.isEncryptionAvailable === 'function' && ss.isEncryptionAvailable()) {
      try {
        const buffer = ss.encryptString(trimmed);
        return `dpapi:${buffer.toString('base64')}`;
      } catch (err) {
        // Fall back to native Windows DPAPI if Electron safeStorage encounters an issue
        return nativeWindowsDpapiEncrypt(trimmed);
      }
    }

    if (process.platform === 'win32') {
      return nativeWindowsDpapiEncrypt(trimmed);
    }

    throw new Error('SecureStorageUnavailableError: Windows DPAPI secure encryption is required on this platform.');
  }

  /**
   * Synchronously decrypts ciphertext back to plaintext.
   * Supports Electron DPAPI (dpapi:), native Windows DPAPI (dpapi-win:),
   * and legacy AES fallback (aes:) strictly for migration purposes.
   * @param {string} cipherText
   * @returns {string} Plaintext
   */
  decryptSync(cipherText) {
    if (!cipherText || typeof cipherText !== 'string' || !cipherText.trim()) {
      return '';
    }

    const text = cipherText.trim();

    // 1. Electron safeStorage DPAPI
    if (text.startsWith('dpapi:')) {
      const ss = getSafeStorage();
      if (ss && typeof ss.isEncryptionAvailable === 'function' && ss.isEncryptionAvailable()) {
        const buffer = Buffer.from(text.slice(6), 'base64');
        return ss.decryptString(buffer);
      }
      // If outside Electron, dpapi: was created by Chromium OSCrypt, which requires Electron runtime
      throw new Error('DPAPI decryption unavailable: safeStorage requires Electron main process runtime.');
    }

    // 2. Native Windows DPAPI (CurrentUser)
    if (text.startsWith('dpapi-win:')) {
      return nativeWindowsDpapiDecrypt(text.slice(10));
    }

    // 3. Legacy AES migration decryptor
    if (text.startsWith('aes:')) {
      const decrypted = this.decryptLegacyAes(text);
      if (decrypted) return decrypted;
      throw new Error('Invalid legacy ciphertext format');
    }

    // Unencrypted legacy fallback (during migration only)
    return text;
  }

  /**
   * Decrypts legacy AES-256-GCM ciphertext created by older builds prior to Phase 01.
   * STRICTLY USED FOR CREDENTIAL MIGRATION TO DPAPI. Never used for new encryptions.
   * @param {string} cipherText
   * @returns {string}
   */
  decryptLegacyAes(cipherText) {
    if (!cipherText || typeof cipherText !== 'string' || !cipherText.startsWith('aes:')) {
      return '';
    }

    const parts = cipherText.trim().split(':');
    if (parts.length === 4) {
      try {
        const [, ivHex, tagHex, encryptedBase64] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        let username = 'default';
        try {
          username = os.userInfo().username || 'default';
        } catch {}
        const entropy = `${os.hostname()}:${username}:veoflow-local-storage-v1`;
        const legacyKey = crypto.createHash('sha256').update(entropy).digest();
        const decipher = crypto.createDecipheriv('aes-256-gcm', legacyKey, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch {
        return '';
      }
    }
    return '';
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
