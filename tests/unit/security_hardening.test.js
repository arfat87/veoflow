import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { credentialManager, CredentialManager } from '../../app/security/credential-manager.js';
import { redactSecrets } from '../../app/shared/logger.js';
import { DatabaseManager } from '../../app/database/database.js';
import { ContextEngine } from '../../app/core/context/context-engine.js';
import { validateIpcSender } from '../../app/main/ipc/index.js';

describe('Phase 10: Security, Privacy & DPAPI Credential Hardening', () => {
  let tempDir;
  let tempDbPath;
  let db;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veoflow-sec-test-'));
    tempDbPath = path.join(tempDir, 'test.sqlite');
    db = new DatabaseManager(tempDbPath);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('1. Credential Protection & DPAPI Simulation', () => {
    it('encrypts and decrypts API keys deterministically using Windows DPAPI', async () => {
      const rawSecret = 'sk-proj-secret_key_1234567890abcdef1234';
      const ciphertext = await credentialManager.encrypt(rawSecret);

      expect(ciphertext).not.toBe(rawSecret);
      // New encryptions MUST be DPAPI-backed (dpapi: or dpapi-win:) and NEVER weak AES (aes:)
      expect(ciphertext.startsWith('dpapi:') || ciphertext.startsWith('dpapi-win:')).toBe(true);
      expect(ciphertext.startsWith('aes:')).toBe(false);

      const decrypted = await credentialManager.decrypt(ciphertext);
      expect(decrypted).toBe(rawSecret);
    });

    it('refuses to persist secrets when secure encryption is unavailable', () => {
      const mgr = new CredentialManager();
      mgr.encryptionDisabledForTest = true;

      expect(() => mgr.encryptSync('my-super-secret-key')).toThrow('SecureStorageUnavailableError');
    });

    it('returns empty string when encrypting or decrypting empty/null values', async () => {
      expect(await credentialManager.encrypt('')).toBe('');
      expect(await credentialManager.encrypt(null)).toBe('');
      expect(await credentialManager.decrypt('')).toBe('');
      expect(await credentialManager.decrypt(null)).toBe('');
    });

    it('masks keys preserving only last 4 characters', () => {
      expect(credentialManager.mask('AIzaSyD-1234567890ABCDEF')).toBe('••••••••CDEF');
      expect(credentialManager.mask('gsk_abcdefghijklmnop1234')).toBe('••••••••1234');
      expect(credentialManager.mask('1234')).toBe('••••••••');
      expect(credentialManager.mask('')).toBe('');
    });
  });

  describe('2. Secret Redaction in Structured Logger', () => {
    it('redacts various API key patterns in string messages', () => {
      const logWithGemini = 'Calling Gemini with key AIzaSyDabcdefghijklmnopqrstuvwxyz12345';
      const logWithGroq = 'Groq auth failed with gsk_abcdefghijklmnopqrstuvwxyz01234567';
      const logWithOpenAi = 'OpenAI sk-proj-1234567890abcdefghijklmnopqrstuv';
      const logWithBearer = 'Sending Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

      expect(redactSecrets(logWithGemini)).toContain('[REDACTED_SECRET]');
      expect(redactSecrets(logWithGemini)).not.toContain('AIzaSyD');

      expect(redactSecrets(logWithGroq)).toContain('[REDACTED_SECRET]');
      expect(redactSecrets(logWithGroq)).not.toContain('gsk_');

      expect(redactSecrets(logWithOpenAi)).toContain('[REDACTED_SECRET]');
      expect(redactSecrets(logWithOpenAi)).not.toContain('sk-proj-');

      expect(redactSecrets(logWithBearer)).toContain('[REDACTED_SECRET]');
      expect(redactSecrets(logWithBearer)).not.toContain('eyJhbGci');
    });

    it('redacts sensitive object fields and encrypted payloads', () => {
      const obj = {
        component: 'AIService',
        apiKey: 'gsk_secret_token_1234567890abcdef',
        password: 'mySuperSecretPassword',
        nested: {
          authorization: 'Bearer token1234567890',
          normalData: 'Hello World'
        }
      };

      const sanitized = redactSecrets(obj);
      expect(sanitized.apiKey).toBe('[REDACTED_SECRET]');
      expect(sanitized.password).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.authorization).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.normalData).toBe('Hello World');
    });
  });

  describe('3. Database Zero Secrets Exposure & DPAPI Encryption', () => {
    it('stores API keys encrypted in settings and provider_configs using DPAPI', () => {
      db.saveApiKey('groq', 'gsk_prod_testing_key_1234567890');

      // Direct driver query checks raw DB storage
      const rawSetting = db.driver.queryOne("SELECT value FROM settings WHERE key = 'groq_api_key';");
      expect(rawSetting.value).not.toBe('gsk_prod_testing_key_1234567890');
      expect(rawSetting.value.startsWith('dpapi:') || rawSetting.value.startsWith('dpapi-win:')).toBe(true);
      expect(rawSetting.value.startsWith('aes:')).toBe(false);

      const rawConfig = db.driver.queryOne("SELECT api_key_encrypted FROM provider_configs WHERE provider_id = 'groq';");
      expect(rawConfig.api_key_encrypted).not.toBe('gsk_prod_testing_key_1234567890');
      expect(rawConfig.api_key_encrypted.startsWith('dpapi:') || rawConfig.api_key_encrypted.startsWith('dpapi-win:')).toBe(true);
      expect(rawConfig.api_key_encrypted.startsWith('aes:')).toBe(false);

      // Decrypted accessor returns raw secret safely for internal services
      expect(db.getApiKey('groq')).toBe('gsk_prod_testing_key_1234567890');
      expect(db.hasApiKey('groq')).toBe(true);
    });

    it('strictly strips API keys from getAllSettings() by default', () => {
      db.saveApiKey('gemini', 'AIzaSy_gemini_test_key_1234567890');
      db.saveApiKey('openai', 'sk-proj-openai_test_key_1234567890');
      db.setSetting('auto_paste', 'true');

      const settings = db.getAllSettings(false);
      expect(settings.auto_paste).toBe('true');
      expect(settings.gemini_api_key).toBeUndefined();
      expect(settings.openai_api_key).toBeUndefined();
      expect(settings.groq_api_key).toBeUndefined();
    });

    it('returns masked status from getApiKeyStatus()', () => {
      db.saveApiKey('gemini', 'AIzaSy_gemini_secret_9999');

      const status = db.getApiKeyStatus();
      expect(status.gemini.configured).toBe(true);
      expect(status.gemini.masked).toBe('••••••••9999');
      expect(status.groq.configured).toBe(false);
      expect(status.groq.masked).toBe('');
    });

    it('clears API key completely from both tables', () => {
      db.saveApiKey('openai', 'sk-test-12345678901234567890');
      expect(db.hasApiKey('openai')).toBe(true);

      db.clearApiKey('openai');
      expect(db.hasApiKey('openai')).toBe(false);
      expect(db.getApiKey('openai')).toBe('');
    });

    it('automatically migrates plaintext API keys on startup to DPAPI', () => {
      // Force write a plaintext key into the raw settings table
      db.driver.run("UPDATE settings SET value = 'AIzaSy_plaintext_legacy_unencrypted' WHERE key = 'gemini_api_key';");

      // Verify it was raw in DB
      const beforeRow = db.driver.queryOne("SELECT value FROM settings WHERE key = 'gemini_api_key';");
      expect(beforeRow.value).toBe('AIzaSy_plaintext_legacy_unencrypted');

      // Trigger migration (as happens on DatabaseManager initialization)
      db.migrateCredentials();

      // Verify the plaintext value has been removed and replaced with DPAPI ciphertext
      const afterRow = db.driver.queryOne("SELECT value FROM settings WHERE key = 'gemini_api_key';");
      expect(afterRow.value).not.toBe('AIzaSy_plaintext_legacy_unencrypted');
      expect(afterRow.value.startsWith('dpapi:') || afterRow.value.startsWith('dpapi-win:')).toBe(true);
      expect(afterRow.value.startsWith('aes:')).toBe(false);

      // Verify decrypted getter still retrieves the exact original secret
      expect(db.getApiKey('gemini')).toBe('AIzaSy_plaintext_legacy_unencrypted');
    });

    it('automatically migrates legacy AES keys on startup to DPAPI', () => {
      // Create a legacy AES ciphertext using the old entropy scheme
      const entropy = `${os.hostname()}:${os.userInfo().username || 'default'}:veoflow-local-storage-v1`;
      const legacyKey = crypto.createHash('sha256').update(entropy).digest();
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
      let enc = cipher.update('gsk_legacy_aes_key_value_to_migrate', 'utf8', 'base64');
      enc += cipher.final('base64');
      const tag = cipher.getAuthTag();
      const legacyCiphertext = `aes:${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;

      // Insert into DB
      db.driver.run("UPDATE settings SET value = ? WHERE key = 'groq_api_key';", [legacyCiphertext]);

      // Verify legacy AES format is present
      const beforeRow = db.driver.queryOne("SELECT value FROM settings WHERE key = 'groq_api_key';");
      expect(beforeRow.value.startsWith('aes:')).toBe(true);

      // Migrate
      db.migrateCredentials();

      // Verify migrated to DPAPI and no longer starts with aes:
      const afterRow = db.driver.queryOne("SELECT value FROM settings WHERE key = 'groq_api_key';");
      expect(afterRow.value.startsWith('aes:')).toBe(false);
      expect(afterRow.value.startsWith('dpapi:') || afterRow.value.startsWith('dpapi-win:')).toBe(true);

      // Decrypted secret matches
      expect(db.getApiKey('groq')).toBe('gsk_legacy_aes_key_value_to_migrate');
    });
  });

  describe('4. Privacy Controls & Data Minimization Defaults', () => {
    it('enforces privacy defaults: window title allowed, browser URL disabled, text disabled', () => {
      const contextEngine = new ContextEngine(db);
      const policy = contextEngine.getPrivacyPolicy();

      expect(policy.windowTitle).toBe(true); // Allowed by default
      expect(policy.browserUrl).toBe(false); // Disabled by default
      expect(policy.selectedText).toBe(false); // Disabled by default
      expect(policy.textboxContent).toBe(false); // Disabled by default
    });

    it('respects user opt-in for browser URL capture', () => {
      db.setSetting('privacy_allow_browser_url', 'true');
      const contextEngine = new ContextEngine(db);
      const policy = contextEngine.getPrivacyPolicy();

      expect(policy.browserUrl).toBe(true);
    });

    it('respects user opt-out for window title capture', () => {
      db.setSetting('privacy_allow_window_title', 'false');
      const contextEngine = new ContextEngine(db);
      const policy = contextEngine.getPrivacyPolicy();

      expect(policy.windowTitle).toBe(false);
    });
  });

  describe('5. IPC Sender Validation & Channel Security', () => {
    it('accepts legitimate local file frame URLs', () => {
      const validEvent = {
        senderFrame: {
          url: 'file:///C:/MY_ALL_ITEM/rea/veoflow/app/renderer/settings/settings.html'
        }
      };
      expect(validateIpcSender(validEvent, 'get-settings')).toBe(true);
    });

    it('rejects external or malicious protocols', () => {
      const maliciousEvent = {
        senderFrame: {
          url: 'https://evil.com/attacker.html'
        }
      };
      expect(() => validateIpcSender(maliciousEvent, 'get-settings')).toThrow('forbidden protocol');
    });

    it('rejects unauthorized local file paths', () => {
      const untrustedFileEvent = {
        senderFrame: {
          url: 'file:///C:/Users/salim/Downloads/malicious.html'
        }
      };
      expect(() => validateIpcSender(untrustedFileEvent, 'get-settings')).toThrow('unknown frame');
    });
  });
});

