import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
    it('encrypts and decrypts API keys deterministically', async () => {
      const rawSecret = 'sk-proj-secret_key_1234567890abcdef1234';
      const ciphertext = await credentialManager.encrypt(rawSecret);

      expect(ciphertext).not.toBe(rawSecret);
      expect(ciphertext.startsWith('aes:') || ciphertext.startsWith('dpapi:')).toBe(true);

      const decrypted = await credentialManager.decrypt(ciphertext);
      expect(decrypted).toBe(rawSecret);
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
    it('stores API keys encrypted in settings and provider_configs', () => {
      db.saveApiKey('groq', 'gsk_prod_testing_key_1234567890');

      // Direct driver query checks raw DB storage
      const rawSetting = db.driver.queryOne("SELECT value FROM settings WHERE key = 'groq_api_key';");
      expect(rawSetting.value).not.toBe('gsk_prod_testing_key_1234567890');
      expect(rawSetting.value.startsWith('aes:') || rawSetting.value.startsWith('dpapi:')).toBe(true);

      const rawConfig = db.driver.queryOne("SELECT api_key_encrypted FROM provider_configs WHERE provider_id = 'groq';");
      expect(rawConfig.api_key_encrypted).not.toBe('gsk_prod_testing_key_1234567890');
      expect(rawConfig.api_key_encrypted.startsWith('aes:') || rawConfig.api_key_encrypted.startsWith('dpapi:')).toBe(true);

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

