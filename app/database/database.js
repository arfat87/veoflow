/**
 * VeoFlow SQLite Database Manager (ESM)
 * Master persistence subsystem using SQLite WebAssembly as the primary source of truth.
 * Supports Settings, Dictations, Transactions, Dictionary, Snippets, Provider Configs,
 * App Rules, Database Migrations, Foreign Keys, Indexes, Transactions, Backup & Recovery.
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { SqliteDriver, getSqlJsEngine } from './sqlite-driver.js';
import { runMigrations } from './migrations.js';
import credentialManager from '../security/credential-manager.js';

// Pre-load SQLite WebAssembly engine at module evaluation time
const SQL = await getSqlJsEngine();

export class DatabaseManager {
  constructor(customFilePath = null) {
    if (customFilePath) {
      this.filePath = customFilePath;
      this.dataDir = customFilePath === ':memory:' ? '' : path.dirname(customFilePath);
    } else {
      this.dataDir = path.join(os.homedir(), '.veoflow');
      this.filePath = path.join(this.dataDir, 'veoflow.sqlite');
    }

    if (this.dataDir && !fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.driver = new SqliteDriver(this.filePath, SQL);
    runMigrations(this.driver);

    this.migrateFromLegacyJson();
    this.initDefaults();
    this.migrateCredentials();
    this.enforceRetentionPolicy();
  }

  /**
   * Initializes default configuration settings if absent.
   */
  initDefaults() {
    this.driver.transaction(() => {
      this.setDefaultSetting('ai_provider', 'gemini');
      this.setDefaultSetting('stt_provider', 'gemini');
      this.setDefaultSetting('formatting_provider', 'gemini');
      this.setDefaultSetting('gemini_api_key', process.env.GEMINI_API_KEY || '');
      this.setDefaultSetting('groq_api_key', process.env.GROQ_API_KEY || '');
      this.setDefaultSetting('openai_api_key', process.env.OPENAI_API_KEY || '');
      this.setDefaultSetting('gemini_model', 'gemini-2.0-flash');
      this.setDefaultSetting('groq_stt_model', 'whisper-large-v3-turbo');
      this.setDefaultSetting('groq_llm_model', 'llama-3.3-70b-versatile');
      this.setDefaultSetting('openai_stt_model', 'whisper-1');
      this.setDefaultSetting('openai_llm_model', 'gpt-4o-mini');
      this.setDefaultSetting('hotkey', 'Ctrl+Alt+Space');
      this.setDefaultSetting('recording_mode', 'push_to_talk');
      this.setDefaultSetting('audio_device_id', 'default');
      this.setDefaultSetting('dictation_language', 'auto');
      this.setDefaultSetting('allow_fallback', 'true');
      this.setDefaultSetting('auto_paste', 'true');
      this.setDefaultSetting('tone_preference', 'contextual');
      this.setDefaultSetting('history_retention_days', '30');
      this.setDefaultSetting('launch_at_startup', 'false');
      this.setDefaultSetting('privacy_allow_window_title', 'true');
      this.setDefaultSetting('privacy_allow_browser_url', 'false');
      this.setDefaultSetting('privacy_allow_selected_text', 'false');
      this.setDefaultSetting('privacy_allow_surrounding_text', 'false');

      // Default provider configs
      this.initDefaultProviderConfigs();
    });
  }

  setDefaultSetting(key, defaultValue) {
    const existing = this.driver.queryOne('SELECT value FROM settings WHERE key = ?;', [key]);
    if (!existing) {
      let storedValue = String(defaultValue ?? '');
      if (key.endsWith('_api_key') && storedValue.trim()) {
        if (!storedValue.startsWith('dpapi:') && !storedValue.startsWith('dpapi-win:')) {
          storedValue = credentialManager.encryptSync(storedValue.trim());
        }
      }
      this.driver.run(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);',
        [key, storedValue, new Date().toISOString()]
      );
    }
  }

  initDefaultProviderConfigs() {
    const defaultConfigs = [
      { provider_id: 'gemini', stt_model: 'gemini-2.0-flash', llm_model: 'gemini-2.0-flash' },
      { provider_id: 'groq', stt_model: 'whisper-large-v3-turbo', llm_model: 'llama-3.3-70b-versatile' },
      { provider_id: 'openai', stt_model: 'whisper-1', llm_model: 'gpt-4o-mini' }
    ];

    for (const cfg of defaultConfigs) {
      const existing = this.driver.queryOne('SELECT provider_id FROM provider_configs WHERE provider_id = ?;', [cfg.provider_id]);
      if (!existing) {
        this.driver.run(
          `INSERT INTO provider_configs (provider_id, stt_model, llm_model, is_enabled, timeout_ms, updated_at)
           VALUES (?, ?, ?, 1, 15000, ?);`,
          [cfg.provider_id, cfg.stt_model, cfg.llm_model, new Date().toISOString()]
        );
      }
    }
  }

  // ==========================================================================
  // 1. SETTINGS OPERATIONS
  // ==========================================================================

  // ==========================================================================
  // 1. SETTINGS & CREDENTIAL OPERATIONS (DPAPI ENCRYPTED AT REST)
  // ==========================================================================

  getSetting(key) {
    const row = this.driver.queryOne('SELECT value FROM settings WHERE key = ?;', [key]);
    if (!row || row.value === null) return null;
    const val = row.value;

    if (key.endsWith('_api_key') && val && val.trim()) {
      if (val.startsWith('dpapi:') || val.startsWith('dpapi-win:')) {
        try {
          return credentialManager.decryptSync(val);
        } catch (err) {
          console.error(`[Database] Failed to decrypt ${key}: ${err.message}`);
          return '';
        }
      } else if (val.startsWith('aes:')) {
        // Legacy AES: decrypt and immediately migrate to DPAPI at rest
        try {
          const decrypted = credentialManager.decryptLegacyAes(val);
          if (decrypted && decrypted.trim()) {
            const reEncrypted = credentialManager.encryptSync(decrypted.trim());
            this.driver.run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?;', [
              reEncrypted,
              new Date().toISOString(),
              key
            ]);
            return decrypted.trim();
          }
          return '';
        } catch (err) {
          console.error(`[Database] Failed to migrate legacy AES ${key}: ${err.message}`);
          return '';
        }
      } else {
        // Plaintext key detected: auto-encrypt at rest with DPAPI
        try {
          const encrypted = credentialManager.encryptSync(val.trim());
          this.driver.run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?;', [
            encrypted,
            new Date().toISOString(),
            key
          ]);
          return val.trim();
        } catch (err) {
          console.error(`[Database] Failed to auto-encrypt plaintext ${key}: ${err.message}`);
          return val.trim();
        }
      }
    }

    return val;
  }

  /**
   * Returns all configuration settings.
   * By default, strips sensitive API keys so secrets never reach the renderer process.
   * @param {boolean} [includeSecrets=false]
   * @returns {Object}
   */
  getAllSettings(includeSecrets = false) {
    const rows = this.driver.query('SELECT key, value FROM settings;');
    const result = {};
    for (const r of rows) {
      if (!includeSecrets && r.key.endsWith('_api_key')) {
        // Strict Security: Strip raw secrets from general settings export
        continue;
      }
      result[r.key] = r.value;
    }
    return result;
  }

  setSetting(key, value) {
    let storedValue = String(value ?? '');
    if (key.endsWith('_api_key') && storedValue.trim()) {
      if (!storedValue.startsWith('dpapi:') && !storedValue.startsWith('dpapi-win:')) {
        storedValue = credentialManager.encryptSync(storedValue.trim());
      }
    }
    this.driver.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);',
      [key, storedValue, new Date().toISOString()]
    );
  }

  saveApiKey(provider, apiKey) {
    const prov = (provider || '').toLowerCase().trim();
    const cleanKey = (apiKey || '').trim();
    if (!cleanKey) {
      return this.clearApiKey(prov);
    }
    const encrypted = (cleanKey.startsWith('dpapi:') || cleanKey.startsWith('dpapi-win:'))
      ? cleanKey
      : credentialManager.encryptSync(cleanKey);
    const now = new Date().toISOString();

    // 1. Update settings table
    this.driver.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);',
      [`${prov}_api_key`, encrypted, now]
    );

    // 2. Update provider_configs table
    const existing = this.driver.queryOne('SELECT provider_id FROM provider_configs WHERE provider_id = ?;', [prov]);
    if (existing) {
      this.driver.run(
        'UPDATE provider_configs SET api_key_encrypted = ?, updated_at = ? WHERE provider_id = ?;',
        [encrypted, now, prov]
      );
    } else {
      this.driver.run(
        'INSERT INTO provider_configs (provider_id, api_key_encrypted, is_enabled, updated_at) VALUES (?, ?, 1, ?);',
        [prov, encrypted, now]
      );
    }
    return true;
  }

  getApiKey(provider) {
    const prov = (provider || '').toLowerCase().trim();
    // 1. Try settings table
    const keyFromSettings = this.getSetting(`${prov}_api_key`);
    if (keyFromSettings && keyFromSettings.trim()) {
      return keyFromSettings.trim();
    }

    // 2. Try provider_configs table
    const row = this.driver.queryOne('SELECT api_key_encrypted FROM provider_configs WHERE provider_id = ?;', [prov]);
    if (row && row.api_key_encrypted) {
      const encryptedVal = row.api_key_encrypted.trim();
      if (encryptedVal.startsWith('dpapi:') || encryptedVal.startsWith('dpapi-win:')) {
        try {
          return credentialManager.decryptSync(encryptedVal);
        } catch {}
      } else if (encryptedVal.startsWith('aes:')) {
        try {
          const decrypted = credentialManager.decryptLegacyAes(encryptedVal);
          if (decrypted && decrypted.trim()) {
            const reEnc = credentialManager.encryptSync(decrypted.trim());
            this.driver.run('UPDATE provider_configs SET api_key_encrypted = ?, updated_at = ? WHERE provider_id = ?;', [
              reEnc,
              new Date().toISOString(),
              prov
            ]);
            return decrypted.trim();
          }
        } catch {}
      } else {
        try {
          const reEnc = credentialManager.encryptSync(encryptedVal);
          this.driver.run('UPDATE provider_configs SET api_key_encrypted = ?, updated_at = ? WHERE provider_id = ?;', [
            reEnc,
            new Date().toISOString(),
            prov
          ]);
        } catch {}
        return encryptedVal;
      }
    }

    // 3. Fallback to process.env (in-memory only)
    const envKey = process.env[`${prov.toUpperCase()}_API_KEY`];
    return envKey ? envKey.trim() : '';
  }

  hasApiKey(provider) {
    const key = this.getApiKey(provider);
    return Boolean(key && key.trim().length > 0);
  }

  getApiKeyStatus() {
    const providers = ['gemini', 'groq', 'openai'];
    const status = {};
    for (const p of providers) {
      const key = this.getApiKey(p);
      const configured = Boolean(key && key.trim().length > 0);
      status[p] = {
        configured,
        masked: configured ? credentialManager.mask(key) : ''
      };
    }
    return status;
  }

  clearApiKey(provider) {
    const prov = (provider || '').toLowerCase().trim();
    const now = new Date().toISOString();
    this.driver.run('UPDATE settings SET value = "", updated_at = ? WHERE key = ?;', [now, `${prov}_api_key`]);
    this.driver.run('UPDATE provider_configs SET api_key_encrypted = NULL, updated_at = ? WHERE provider_id = ?;', [now, prov]);
    return true;
  }

  // ==========================================================================
  // 2. DICTATION HISTORY OPERATIONS
  // ==========================================================================

  addHistory({
    appName,
    windowTitle,
    url,
    rawAsr,
    formattedText,
    language = 'auto',
    transcriptionProvider = null,
    formattingProvider = null,
    modelUsed = null,
    latencyMs = 0,
    status = 'success',
    errorMessage = null,
    sessionId = null
  }) {
    const now = new Date().toISOString();
    this.driver.run(
      `INSERT INTO dictations (
        session_id, timestamp, app_name, window_title, url,
        raw_asr, formatted_text, language, transcription_provider,
        formatting_provider, model_used, latency_ms, status, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        sessionId,
        now,
        appName || '',
        windowTitle || '',
        url || '',
        rawAsr || '',
        formattedText || '',
        language || 'auto',
        transcriptionProvider,
        formattingProvider,
        modelUsed,
        Number(latencyMs) || 0,
        status || 'success',
        errorMessage,
        now
      ]
    );

    const row = this.driver.queryOne('SELECT last_insert_rowid() AS id;');
    return row ? row.id : Date.now();
  }

  getHistory(limit = 50, filter = null) {
    let sql = 'SELECT * FROM dictations';
    const params = [];

    if (filter && typeof filter === 'string' && filter.trim()) {
      const pattern = `%${filter.trim()}%`;
      sql += ' WHERE app_name LIKE ? OR formatted_text LIKE ? OR raw_asr LIKE ? OR window_title LIKE ?';
      params.push(pattern, pattern, pattern, pattern);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?;';
    params.push(Number(limit) || 50);

    return this.driver.query(sql, params);
  }

  getHistoryById(id) {
    return this.driver.queryOne('SELECT * FROM dictations WHERE id = ?;', [Number(id)]);
  }

  searchHistory(query, options = {}) {
    const limit = Number(options.limit) || 100;
    const pattern = `%${(query || '').trim()}%`;
    let sql = `
      SELECT * FROM dictations
      WHERE (app_name LIKE ? OR formatted_text LIKE ? OR raw_asr LIKE ? OR window_title LIKE ?)
    `;
    const params = [pattern, pattern, pattern, pattern];

    if (options.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    if (options.appName) {
      sql += ' AND app_name = ?';
      params.push(options.appName);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?;';
    params.push(limit);

    return this.driver.query(sql, params);
  }

  deleteHistoryItem(id) {
    const existing = this.getHistoryById(id);
    if (!existing) return false;
    this.driver.run('DELETE FROM dictations WHERE id = ?;', [Number(id)]);
    return true;
  }

  clearHistory() {
    this.driver.run('DELETE FROM dictations;');
    try {
      const recDir = path.join(os.homedir(), '.veoflow', 'recordings');
      if (fs.existsSync(recDir)) {
        const files = fs.readdirSync(recDir).filter(f => f.startsWith('recording_'));
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(recDir, file));
          } catch {}
        }
      }
    } catch {}
    return true;
  }

  exportHistory(format = 'json') {
    const records = this.driver.query('SELECT * FROM dictations ORDER BY timestamp DESC;');
    if (format === 'csv') {
      const headers = ['id', 'timestamp', 'app_name', 'window_title', 'url', 'raw_asr', 'formatted_text', 'language', 'latency_ms', 'status'];
      const rows = records.map(r => {
        return headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(',');
      });
      return [headers.join(','), ...rows].join('\r\n');
    }
    return JSON.stringify(records, null, 2);
  }

  // ==========================================================================
  // 3. INSERTION TRANSACTIONS
  // ==========================================================================

  addInsertionTransaction({
    transactionId,
    dictationId = null,
    targetHwnd,
    targetProcess,
    strategy,
    textHash,
    status = 'pending',
    errorMessage = null
  }) {
    const now = new Date().toISOString();
    this.driver.run(
      `INSERT OR REPLACE INTO insertion_transactions (
        transaction_id, dictation_id, target_hwnd, target_process,
        strategy, text_hash, status, error_message, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        transactionId,
        dictationId,
        String(targetHwnd),
        targetProcess,
        strategy,
        textHash,
        status,
        errorMessage,
        now,
        status === 'pending' ? null : now
      ]
    );
  }

  updateInsertionTransaction(transactionId, { status, errorMessage = null, completedAt = null }) {
    const now = completedAt || new Date().toISOString();
    this.driver.run(
      `UPDATE insertion_transactions
       SET status = ?, error_message = ?, completed_at = ?
       WHERE transaction_id = ?;`,
      [status, errorMessage, now, transactionId]
    );
  }

  getTransaction(transactionId) {
    return this.driver.queryOne(
      'SELECT * FROM insertion_transactions WHERE transaction_id = ?;',
      [transactionId]
    );
  }

  // ==========================================================================
  // 4. CUSTOM DICTIONARY OPERATIONS
  // ==========================================================================

  getDictionary(onlyEnabled = false) {
    let sql = 'SELECT * FROM dictionary';
    if (onlyEnabled) {
      sql += ' WHERE is_enabled = 1';
    }
    sql += ' ORDER BY priority ASC, LENGTH(trigger_word) DESC;';
    return this.driver.query(sql);
  }

  addDictionaryWord(triggerWord, replacement, options = {}) {
    const trigger = (typeof triggerWord === 'object' ? triggerWord.trigger : triggerWord || '').trim();
    const rep = (typeof triggerWord === 'object' ? triggerWord.rep || triggerWord.replacement : replacement || '').trim();
    const caseSensitive = options.caseSensitive || (typeof triggerWord === 'object' && triggerWord.caseSensitive) ? 1 : 0;
    const isEnabled = options.isEnabled !== false && (typeof triggerWord !== 'object' || triggerWord.isEnabled !== false) ? 1 : 0;
    const priority = Number(options.priority || (typeof triggerWord === 'object' && triggerWord.priority)) || 100;
    const now = new Date().toISOString();

    const existing = this.driver.queryOne(
      'SELECT id FROM dictionary WHERE LOWER(trigger_word) = LOWER(?);',
      [trigger]
    );

    if (existing) {
      this.driver.run(
        `UPDATE dictionary
         SET trigger_word = ?, replacement = ?, case_sensitive = ?, is_enabled = ?, priority = ?, updated_at = ?
         WHERE id = ?;`,
        [trigger, rep, caseSensitive, isEnabled, priority, now, existing.id]
      );
      return existing.id;
    }

    this.driver.run(
      `INSERT INTO dictionary (trigger_word, replacement, case_sensitive, is_enabled, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [trigger, rep, caseSensitive, isEnabled, priority, now, now]
    );

    const row = this.driver.queryOne('SELECT last_insert_rowid() AS id;');
    return row ? row.id : Date.now();
  }

  editDictionaryWord(id, updates = {}) {
    const existing = this.driver.queryOne('SELECT * FROM dictionary WHERE id = ?;', [Number(id)]);
    if (!existing) return false;

    const trigger = updates.trigger_word !== undefined ? updates.trigger_word.trim() : existing.trigger_word;
    const rep = updates.replacement !== undefined ? updates.replacement.trim() : existing.replacement;
    const caseSens = updates.case_sensitive !== undefined ? (updates.case_sensitive ? 1 : 0) : existing.case_sensitive;
    const enabled = updates.is_enabled !== undefined ? (updates.is_enabled ? 1 : 0) : existing.is_enabled;
    const priority = updates.priority !== undefined ? Number(updates.priority) : existing.priority;
    const now = new Date().toISOString();

    this.driver.run(
      `UPDATE dictionary
       SET trigger_word = ?, replacement = ?, case_sensitive = ?, is_enabled = ?, priority = ?, updated_at = ?
       WHERE id = ?;`,
      [trigger, rep, caseSens, enabled, priority, now, Number(id)]
    );
    return true;
  }

  deleteDictionaryWord(id) {
    const existing = this.driver.queryOne('SELECT id FROM dictionary WHERE id = ?;', [Number(id)]);
    if (!existing) return false;
    this.driver.run('DELETE FROM dictionary WHERE id = ?;', [Number(id)]);
    return true;
  }

  toggleDictionaryWord(id, isEnabled) {
    this.driver.run(
      'UPDATE dictionary SET is_enabled = ?, updated_at = ? WHERE id = ?;',
      [isEnabled ? 1 : 0, new Date().toISOString(), Number(id)]
    );
    return true;
  }

  importDictionary(entries = [], strategy = 'merge') {
    if (!Array.isArray(entries)) return 0;
    let imported = 0;

    this.driver.transaction((d) => {
      if (strategy === 'replace') {
        d.run('DELETE FROM dictionary;');
      }
      for (const item of entries) {
        const trigger = (item.trigger_word || item.trigger || '').trim();
        const rep = (item.replacement || item.rep || '').trim();
        if (!trigger || !rep) continue;

        const caseSensitive = item.case_sensitive ? 1 : 0;
        const isEnabled = item.is_enabled !== false ? 1 : 0;
        const priority = Number(item.priority) || 100;
        const now = new Date().toISOString();

        const existing = d.queryOne(
          'SELECT id FROM dictionary WHERE LOWER(trigger_word) = LOWER(?);',
          [trigger]
        );

        if (existing) {
          d.run(
            `UPDATE dictionary
             SET replacement = ?, case_sensitive = ?, is_enabled = ?, priority = ?, updated_at = ?
             WHERE id = ?;`,
            [rep, caseSensitive, isEnabled, priority, now, existing.id]
          );
        } else {
          d.run(
            `INSERT INTO dictionary (trigger_word, replacement, case_sensitive, is_enabled, priority, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?);`,
            [trigger, rep, caseSensitive, isEnabled, priority, now, now]
          );
        }
        imported++;
      }
    });

    return imported;
  }

  exportDictionary() {
    return this.driver.query('SELECT * FROM dictionary ORDER BY priority ASC, trigger_word ASC;');
  }

  // ==========================================================================
  // 5. VOICE SNIPPETS OPERATIONS
  // ==========================================================================

  getSnippets(onlyEnabled = false) {
    let sql = 'SELECT * FROM snippets';
    if (onlyEnabled) {
      sql += ' WHERE is_enabled = 1';
    }
    sql += ' ORDER BY shortcut ASC;';
    return this.driver.query(sql);
  }

  addSnippet(shortcut, expandedText, isEnabled = true) {
    const sc = (shortcut || '').trim();
    const exp = (expandedText || '').trim();
    const enabled = isEnabled !== false ? 1 : 0;
    const now = new Date().toISOString();

    const existing = this.driver.queryOne(
      'SELECT id FROM snippets WHERE LOWER(shortcut) = LOWER(?);',
      [sc]
    );

    if (existing) {
      this.driver.run(
        `UPDATE snippets
         SET shortcut = ?, expanded_text = ?, is_enabled = ?, updated_at = ?
         WHERE id = ?;`,
        [sc, exp, enabled, now, existing.id]
      );
      return existing.id;
    }

    this.driver.run(
      `INSERT INTO snippets (shortcut, expanded_text, is_enabled, usage_count, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?);`,
      [sc, exp, enabled, now, now]
    );

    const row = this.driver.queryOne('SELECT last_insert_rowid() AS id;');
    return row ? row.id : Date.now();
  }

  editSnippet(id, updates = {}) {
    const existing = this.driver.queryOne('SELECT * FROM snippets WHERE id = ?;', [Number(id)]);
    if (!existing) return false;

    const sc = updates.shortcut !== undefined ? updates.shortcut.trim() : existing.shortcut;
    const exp = updates.expanded_text !== undefined ? updates.expanded_text.trim() : existing.expanded_text;
    const enabled = updates.is_enabled !== undefined ? (updates.is_enabled ? 1 : 0) : existing.is_enabled;
    const now = new Date().toISOString();

    this.driver.run(
      `UPDATE snippets
       SET shortcut = ?, expanded_text = ?, is_enabled = ?, updated_at = ?
       WHERE id = ?;`,
      [sc, exp, enabled, now, Number(id)]
    );
    return true;
  }

  deleteSnippet(id) {
    const existing = this.driver.queryOne('SELECT id FROM snippets WHERE id = ?;', [Number(id)]);
    if (!existing) return false;
    this.driver.run('DELETE FROM snippets WHERE id = ?;', [Number(id)]);
    return true;
  }

  toggleSnippet(id, isEnabled) {
    this.driver.run(
      'UPDATE snippets SET is_enabled = ?, updated_at = ? WHERE id = ?;',
      [isEnabled ? 1 : 0, new Date().toISOString(), Number(id)]
    );
    return true;
  }

  recordSnippetUsage(id) {
    const now = new Date().toISOString();
    this.driver.run(
      `UPDATE snippets
       SET usage_count = usage_count + 1, last_used_at = ?, updated_at = ?
       WHERE id = ?;`,
      [now, now, Number(id)]
    );
    return true;
  }

  testSnippetExpansion(sampleText) {
    if (!sampleText || typeof sampleText !== 'string') return null;
    const clean = sampleText.trim().toLowerCase()
      .replace(/^["']|["']$/g, '')
      .replace(/[.,!?;:]+$/, '')
      .trim();

    const snippets = this.getSnippets(true);
    for (const s of snippets) {
      const shortcutClean = s.shortcut.toLowerCase()
        .replace(/^["']|["']$/g, '')
        .replace(/[.,!?;:]+$/, '')
        .trim();

      if (clean === shortcutClean) {
        return s.expanded_text;
      }
    }
    return null;
  }

  // ==========================================================================
  // 6. PROVIDER CONFIGURATIONS
  // ==========================================================================

  getProviderConfigs() {
    return this.driver.query('SELECT * FROM provider_configs ORDER BY provider_id ASC;');
  }

  getProviderConfig(providerId) {
    return this.driver.queryOne(
      'SELECT * FROM provider_configs WHERE provider_id = ?;',
      [providerId]
    );
  }

  setProviderConfig(providerId, config = {}) {
    const now = new Date().toISOString();
    let encKey = config.api_key_encrypted || null;
    if (encKey && typeof encKey === 'string' && encKey.trim()) {
      if (!encKey.startsWith('dpapi:') && !encKey.startsWith('dpapi-win:')) {
        encKey = credentialManager.encryptSync(encKey.trim());
      }
    }
    this.driver.run(
      `INSERT OR REPLACE INTO provider_configs (
        provider_id, stt_model, llm_model, api_key_encrypted,
        is_enabled, custom_endpoint, timeout_ms, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        providerId,
        config.stt_model || 'default',
        config.llm_model || 'default',
        encKey,
        config.is_enabled !== false ? 1 : 0,
        config.custom_endpoint || null,
        Number(config.timeout_ms) || 15000,
        now
      ]
    );
  }

  // ==========================================================================
  // 7. USER-DEFINED APPLICATION RULES
  // ==========================================================================

  getAppRules() {
    return this.driver.query('SELECT * FROM app_rules ORDER BY process_name ASC;');
  }

  addAppRule(processName, category = 'unknown', tone = 'contextual') {
    const proc = (processName || '').trim().toLowerCase();
    const cat = (category || 'unknown').trim().toLowerCase();
    const toneVal = (tone || 'contextual').trim().toLowerCase();
    const now = new Date().toISOString();

    const existing = this.driver.queryOne(
      'SELECT id FROM app_rules WHERE process_name = ?;',
      [proc]
    );

    if (existing) {
      this.driver.run(
        'UPDATE app_rules SET category = ?, tone = ?, updated_at = ? WHERE id = ?;',
        [cat, toneVal, now, existing.id]
      );
      return existing.id;
    }

    this.driver.run(
      'INSERT INTO app_rules (process_name, category, tone, created_at, updated_at) VALUES (?, ?, ?, ?, ?);',
      [proc, cat, toneVal, now, now]
    );

    const row = this.driver.queryOne('SELECT last_insert_rowid() AS id;');
    return row ? row.id : Date.now();
  }

  deleteAppRule(id) {
    const existing = this.driver.queryOne('SELECT id FROM app_rules WHERE id = ?;', [Number(id)]);
    if (!existing) return false;
    this.driver.run('DELETE FROM app_rules WHERE id = ?;', [Number(id)]);
    return true;
  }

  // ==========================================================================
  // 8. BACKUP, RESTORE & RETENTION
  // ==========================================================================

  backup(targetPath) {
    const binary = this.driver.exportBinary();
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetPath, binary);
    return true;
  }

  restore(backupPath) {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file does not exist at ${backupPath}`);
    }
    const buffer = fs.readFileSync(backupPath);
    this.driver.importBinary(buffer);
    runMigrations(this.driver);
    return true;
  }

  enforceRetentionPolicy() {
    try {
      const daysStr = this.getSetting('history_retention_days') || '30';
      const days = parseInt(daysStr, 10);
      if (isNaN(days) || days <= 0) return; // 0 means unlimited retention

      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      this.driver.run('DELETE FROM dictations WHERE timestamp < ?;', [cutoffDate]);
      this.driver.run('DELETE FROM insertion_transactions WHERE created_at < ?;', [cutoffDate]);
    } catch (err) {
      console.warn('[Database] Failed to enforce history retention policy:', err.message);
    }
  }

  migrateFromLegacyJson() {
    try {
      const legacyPath = path.join(this.dataDir, 'veoflow_store.json');
      if (!fs.existsSync(legacyPath)) return;

      const raw = fs.readFileSync(legacyPath, 'utf8');
      const parsed = JSON.parse(raw);

      // Migrate settings if settings table is empty
      const existingSettings = this.driver.query('SELECT COUNT(*) AS total FROM settings;');
      if (existingSettings[0]?.total === 0 && parsed.settings) {
        this.driver.transaction((d) => {
          for (const [k, v] of Object.entries(parsed.settings)) {
            let stored = String(v ?? '');
            if (k.endsWith('_api_key') && stored.trim()) {
              if (!stored.startsWith('dpapi:') && !stored.startsWith('dpapi-win:')) {
                stored = credentialManager.encryptSync(stored.trim());
              }
            }
            d.run(
              'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);',
              [k, stored, new Date().toISOString()]
            );
          }
        });
      }

      // Migrate history
      const existingHistory = this.driver.query('SELECT COUNT(*) AS total FROM dictations;');
      if (existingHistory[0]?.total === 0 && Array.isArray(parsed.history)) {
        this.driver.transaction((d) => {
          for (const item of parsed.history) {
            d.run(
              `INSERT INTO dictations (
                timestamp, app_name, window_title, url, raw_asr,
                formatted_text, latency_ms, status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                item.timestamp || new Date().toISOString(),
                item.app_name || '',
                item.window_title || '',
                item.url || '',
                item.raw_asr || '',
                item.formatted_text || '',
                item.latency_ms || 0,
                item.status || 'success',
                item.timestamp || new Date().toISOString()
              ]
            );
          }
        });
      }

      // Migrate dictionary
      const existingDict = this.driver.query('SELECT COUNT(*) AS total FROM dictionary;');
      if (existingDict[0]?.total === 0 && Array.isArray(parsed.dictionary)) {
        this.driver.transaction((d) => {
          for (const item of parsed.dictionary) {
            d.run(
              `INSERT OR IGNORE INTO dictionary (trigger_word, replacement, case_sensitive, is_enabled, priority, created_at, updated_at)
               VALUES (?, ?, 0, 1, 100, ?, ?);`,
              [item.trigger_word, item.replacement, new Date().toISOString(), new Date().toISOString()]
            );
          }
        });
      }

      // Migrate snippets
      const existingSnippets = this.driver.query('SELECT COUNT(*) AS total FROM snippets;');
      if (existingSnippets[0]?.total === 0 && Array.isArray(parsed.snippets)) {
        this.driver.transaction((d) => {
          for (const item of parsed.snippets) {
            d.run(
              `INSERT OR IGNORE INTO snippets (shortcut, expanded_text, is_enabled, usage_count, created_at, updated_at)
               VALUES (?, ?, 1, 0, ?, ?);`,
              [item.shortcut, item.expanded_text, new Date().toISOString(), new Date().toISOString()]
            );
          }
        });
      }

      // Migrate app rules
      const existingRules = this.driver.query('SELECT COUNT(*) AS total FROM app_rules;');
      if (existingRules[0]?.total === 0 && Array.isArray(parsed.app_rules)) {
        this.driver.transaction((d) => {
          for (const item of parsed.app_rules) {
            d.run(
              `INSERT OR IGNORE INTO app_rules (process_name, category, tone, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?);`,
              [item.process_name, item.category || 'unknown', item.tone || 'contextual', new Date().toISOString(), new Date().toISOString()]
            );
          }
        });
      }
    } catch (err) {
      console.warn('[Database] Failed to migrate legacy store:', err.message);
    }
  }

  /**
   * Scans and migrates all credentials stored in SQLite to secure Windows DPAPI.
   * Migrates:
   * 1. Plaintext API keys in `settings` table.
   * 2. Legacy `aes:` encrypted keys in `settings` table.
   * 3. Plaintext and legacy `aes:` keys in `provider_configs` table.
   * Ensures that no plaintext or weak AES keys remain persisted on disk.
   */
  migrateCredentials() {
    try {
      // 1. Migrate settings table
      const keyRows = this.driver.query("SELECT key, value FROM settings WHERE key LIKE '%_api_key' AND value IS NOT NULL AND value != '';");
      for (const row of keyRows) {
        const val = String(row.value).trim();
        if (!val) continue;

        if (val.startsWith('dpapi:') || val.startsWith('dpapi-win:')) {
          // Already securely encrypted with DPAPI
          continue;
        }

        if (val.startsWith('aes:')) {
          try {
            const decrypted = credentialManager.decryptLegacyAes(val);
            if (decrypted && decrypted.trim()) {
              const encrypted = credentialManager.encryptSync(decrypted.trim());
              this.driver.run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?;', [
                encrypted,
                new Date().toISOString(),
                row.key
              ]);
            }
          } catch (err) {
            console.warn(`[Database] Failed to migrate legacy AES setting for ${row.key}:`, err.message);
          }
        } else {
          // Plaintext key: encrypt immediately with DPAPI
          try {
            const encrypted = credentialManager.encryptSync(val);
            this.driver.run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?;', [
              encrypted,
              new Date().toISOString(),
              row.key
            ]);
          } catch (err) {
            console.warn(`[Database] Failed to migrate plaintext setting for ${row.key}:`, err.message);
          }
        }
      }

      // 2. Migrate provider_configs table
      const provRows = this.driver.query("SELECT provider_id, api_key_encrypted FROM provider_configs WHERE api_key_encrypted IS NOT NULL AND api_key_encrypted != '';");
      for (const row of provRows) {
        const val = String(row.api_key_encrypted).trim();
        if (!val) continue;

        if (val.startsWith('dpapi:') || val.startsWith('dpapi-win:')) {
          // Already securely encrypted
          continue;
        }

        if (val.startsWith('aes:')) {
          try {
            const decrypted = credentialManager.decryptLegacyAes(val);
            if (decrypted && decrypted.trim()) {
              const encrypted = credentialManager.encryptSync(decrypted.trim());
              this.driver.run('UPDATE provider_configs SET api_key_encrypted = ?, updated_at = ? WHERE provider_id = ?;', [
                encrypted,
                new Date().toISOString(),
                row.provider_id
              ]);
            }
          } catch (err) {
            console.warn(`[Database] Failed to migrate legacy AES provider_config for ${row.provider_id}:`, err.message);
          }
        } else {
          // Plaintext key
          try {
            const encrypted = credentialManager.encryptSync(val);
            this.driver.run('UPDATE provider_configs SET api_key_encrypted = ?, updated_at = ? WHERE provider_id = ?;', [
              encrypted,
              new Date().toISOString(),
              row.provider_id
            ]);
          } catch (err) {
            console.warn(`[Database] Failed to migrate plaintext provider_config for ${row.provider_id}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.warn('[Database] Credential migration error:', err.message);
    }
  }

  close() {
    if (this.driver) {
      this.driver.close();
      this.driver = null;
    }
  }
}

export const defaultDatabase = new DatabaseManager();
export default defaultDatabase;
