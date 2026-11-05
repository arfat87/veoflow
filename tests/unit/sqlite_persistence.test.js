import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { DatabaseManager } from '../../app/database/database.js';
import { DictionaryService } from '../../app/core/formatting/dictionary-service.js';

describe('Phase 09: SQLite Database & User Features Subsystem', () => {
  let testDbPath;
  let db;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `veoflow_sqlite_test_${Date.now()}_${Math.random().toString(36).substring(7)}.sqlite`);
    db = new DatabaseManager(testDbPath);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      const tmpFile = testDbPath + '.tmp';
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}
  });

  describe('Database Migrations & Schema', () => {
    it('executes schema migrations and records applied versions in schema_migrations table', () => {
      const rows = db.driver.query('SELECT version, name FROM schema_migrations ORDER BY version ASC;');
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(Number(rows[0].version)).toBe(1);
      expect(rows[0].name).toBe('001_initial_schema');
      expect(Number(rows[1].version)).toBe(2);
    });

    it('creates all required SQLite tables and indexes', () => {
      const tables = db.driver.query("SELECT name FROM sqlite_master WHERE type = 'table';").map(r => r.name);
      expect(tables).toContain('settings');
      expect(tables).toContain('dictations');
      expect(tables).toContain('insertion_transactions');
      expect(tables).toContain('dictionary');
      expect(tables).toContain('snippets');
      expect(tables).toContain('provider_configs');
      expect(tables).toContain('app_rules');
      expect(tables).toContain('schema_migrations');

      const indexes = db.driver.query("SELECT name FROM sqlite_master WHERE type = 'index';").map(r => r.name);
      expect(indexes).toContain('idx_dictations_timestamp');
      expect(indexes).toContain('idx_dictations_app');
      expect(indexes).toContain('idx_transactions_status');
    });
  });

  describe('Restart Persistence & Binary Disk Storage', () => {
    it('persists data to binary SQLite file and reloads cleanly after database close and reopen', () => {
      db.setSetting('custom_test_setting', 'saved_value_123');
      const dictationId = db.addHistory({
        appName: 'vscode.exe',
        windowTitle: 'main.js - Workspace',
        rawAsr: 'speech to text test',
        formattedText: 'Speech to text test.',
        latencyMs: 145,
        status: 'success'
      });
      db.addDictionaryWord('kubernetes', 'K8s', { priority: 50, caseSensitive: false });
      db.addSnippet('zoomlink', 'https://zoom.us/j/123456');

      // Verify file exists on disk
      expect(fs.existsSync(testDbPath)).toBe(true);
      const originalFileSize = fs.statSync(testDbPath).size;
      expect(originalFileSize).toBeGreaterThan(0);

      // Close instance and reopen new instance pointing to exact same file path
      db.close();
      const reopenedDb = new DatabaseManager(testDbPath);

      // Verify reloaded data matches perfectly
      expect(reopenedDb.getSetting('custom_test_setting')).toBe('saved_value_123');
      const loadedHistory = reopenedDb.getHistory();
      expect(loadedHistory.length).toBe(1);
      expect(loadedHistory[0].id).toBe(dictationId);
      expect(loadedHistory[0].app_name).toBe('vscode.exe');
      expect(loadedHistory[0].formatted_text).toBe('Speech to text test.');

      const loadedDict = reopenedDb.getDictionary();
      expect(loadedDict.length).toBe(1);
      expect(loadedDict[0].trigger_word).toBe('kubernetes');
      expect(loadedDict[0].replacement).toBe('K8s');
      expect(loadedDict[0].priority).toBe(50);

      const loadedSnippets = reopenedDb.getSnippets();
      expect(loadedSnippets.length).toBe(1);
      expect(loadedSnippets[0].shortcut).toBe('zoomlink');
      expect(loadedSnippets[0].expanded_text).toBe('https://zoom.us/j/123456');

      reopenedDb.close();
    });
  });

  describe('Dictation History Operations (Search, Filter, Export, Delete)', () => {
    beforeEach(() => {
      db.addHistory({
        appName: 'slack.exe',
        windowTitle: '#general',
        rawAsr: 'hey team meeting at four',
        formattedText: 'Hey team, meeting at 4:00 PM.',
        language: 'en',
        transcriptionProvider: 'groq',
        formattingProvider: 'groq',
        latencyMs: 220,
        status: 'success'
      });
      db.addHistory({
        appName: 'outlook.exe',
        windowTitle: 'Budget Proposal',
        rawAsr: 'please find attached the quarterly forecast',
        formattedText: 'Please find attached the quarterly forecast.',
        language: 'en',
        transcriptionProvider: 'gemini',
        formattingProvider: 'gemini',
        latencyMs: 310,
        status: 'success'
      });
      db.addHistory({
        appName: 'terminal.exe',
        windowTitle: 'PowerShell',
        rawAsr: 'git commit message',
        formattedText: 'git commit -m "update"',
        language: 'en',
        transcriptionProvider: 'openai',
        formattingProvider: 'openai',
        latencyMs: 400,
        status: 'error',
        errorMessage: 'Target window lost focus'
      });
    });

    it('searches history across application, window title, raw speech and formatted text', () => {
      const results = db.searchHistory('quarterly');
      expect(results.length).toBe(1);
      expect(results[0].app_name).toBe('outlook.exe');

      const appResults = db.searchHistory('slack');
      expect(appResults.length).toBe(1);
      expect(appResults[0].window_title).toBe('#general');
    });

    it('filters history by status (success vs error)', () => {
      const successResults = db.searchHistory('', { status: 'success' });
      expect(successResults.length).toBe(2);

      const errorResults = db.searchHistory('', { status: 'error' });
      expect(errorResults.length).toBe(1);
      expect(errorResults[0].error_message).toBe('Target window lost focus');
    });

    it('exports history to JSON and CSV formats', () => {
      const jsonExport = db.exportHistory('json');
      const parsed = JSON.parse(jsonExport);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(3);

      const csvExport = db.exportHistory('csv');
      expect(csvExport).toContain('id,timestamp,app_name,window_title');
      expect(csvExport).toContain('slack.exe');
      expect(csvExport).toContain('outlook.exe');
    });

    it('deletes single item by ID and clears all history', () => {
      const items = db.getHistory();
      const firstId = items[0].id;

      const deleted = db.deleteHistoryItem(firstId);
      expect(deleted).toBe(true);
      expect(db.getHistory().length).toBe(2);

      db.clearHistory();
      expect(db.getHistory().length).toBe(0);
    });
  });

  describe('Custom Dictionary (Priority, Case Sensitivity, Recursive Protection)', () => {
    it('applies priority ordering where lower priority numbers take precedence', () => {
      // Add general rule first with lower priority
      db.addDictionaryWord('machine learning', 'ML', { priority: 20 });
      // Add sub-rule with higher priority (lower priority rank)
      db.addDictionaryWord('quantum machine learning', 'QML', { priority: 10 });

      const dictService = new DictionaryService(db);
      const result = dictService.applyDictionary('I am studying quantum machine learning today.');

      expect(result).toBe('I am studying QML today.');
    });

    it('respects case sensitivity flag', () => {
      db.addDictionaryWord('Apple', 'Apple Inc.', { caseSensitive: true });
      db.addDictionaryWord('orange', 'Orange Telecom', { caseSensitive: false });

      const dictService = new DictionaryService(db);

      // 'apple' in lowercase should not trigger case-sensitive 'Apple'
      const res1 = dictService.applyDictionary('I ate an apple for lunch.');
      expect(res1).toBe('I ate an apple for lunch.');

      // 'Apple' capitalized should trigger
      const res2 = dictService.applyDictionary('I bought stock in Apple yesterday.');
      expect(res2).toBe('I bought stock in Apple Inc. yesterday.');

      // 'ORANGE' should trigger case-insensitive rule
      const res3 = dictService.applyDictionary('Contact ORANGE customer support.');
      expect(res3).toBe('Contact Orange Telecom customer support.');
    });

    it('provides complete recursive replacement protection', () => {
      // If "cat" -> "dog" and "dog" -> "wolf"
      db.addDictionaryWord('cat', 'dog', { priority: 1 });
      db.addDictionaryWord('dog', 'wolf', { priority: 2 });

      const dictService = new DictionaryService(db);
      const text = 'The cat and the dog played together.';
      const output = dictService.applyDictionary(text);

      // "cat" becomes "dog", but must NOT recursively become "wolf"
      // "dog" becomes "wolf"
      expect(output).toBe('The dog and the wolf played together.');
    });

    it('supports enable/disable toggle, edit, import and export', () => {
      const id = db.addDictionaryWord('foo', 'bar');
      expect(db.getDictionary(true).length).toBe(1);

      // Disable
      db.toggleDictionaryWord(id, false);
      expect(db.getDictionary(true).length).toBe(0);
      expect(db.getDictionary(false).length).toBe(1);

      // Edit
      db.editDictionaryWord(id, { replacement: 'baz', is_enabled: 1 });
      const updated = db.getDictionary(true);
      expect(updated.length).toBe(1);
      expect(updated[0].replacement).toBe('baz');

      // Export
      const exported = db.exportDictionary();
      expect(exported.length).toBe(1);

      // Import merge
      const importData = [
        { trigger_word: 'alpha', replacement: 'beta', priority: 50 },
        { trigger_word: 'gamma', replacement: 'delta', priority: 60 }
      ];
      const count = db.importDictionary(importData, 'merge');
      expect(count).toBe(2);
      expect(db.getDictionary().length).toBe(3);
    });
  });

  describe('Voice Snippets (Usage Tracking, Enable/Disable, Test Expansion)', () => {
    it('records snippet usage count and updates last_used_at timestamp on expansion', () => {
      const id = db.addSnippet('my meeting', 'https://meet.google.com/abc-defg-hij');
      const dictService = new DictionaryService(db);

      const expanded = dictService.checkSnippets('my meeting');
      expect(expanded).toBe('https://meet.google.com/abc-defg-hij');

      const snippet = db.getSnippets()[0];
      expect(snippet.usage_count).toBe(1);
      expect(snippet.last_used_at).toBeDefined();
      expect(new Date(snippet.last_used_at).getTime()).toBeGreaterThan(0);
    });

    it('ignores disabled snippets during expansion check', () => {
      const id = db.addSnippet('my promo', 'SAVE50OFF');
      db.toggleSnippet(id, false);

      const dictService = new DictionaryService(db);
      const expanded = dictService.checkSnippets('my promo');
      expect(expanded).toBeNull();
    });

    it('tests snippet expansion via testSnippetExpansion utility', () => {
      db.addSnippet('insert signature', 'Best regards,\nEngineering Team');

      const res = db.testSnippetExpansion('insert signature.');
      expect(res).toBe('Best regards,\nEngineering Team');

      const noMatch = db.testSnippetExpansion('random unrecognized phrase');
      expect(noMatch).toBeNull();
    });
  });

  describe('Insertion Transactions & Auditing', () => {
    it('persists insertion transaction record with foreign key to dictation', () => {
      const dictId = db.addHistory({
        appName: 'notepad.exe',
        rawAsr: 'test speech',
        formattedText: 'Test speech.'
      });

      const txId = 'tx_123456_test';
      db.addInsertionTransaction({
        transactionId: txId,
        dictationId: dictId,
        targetHwnd: '0x1234ABCD',
        targetProcess: 'notepad.exe',
        strategy: 'uia_value',
        textHash: 'abc123def456',
        status: 'pending'
      });

      let tx = db.getTransaction(txId);
      expect(tx).toBeDefined();
      expect(tx.status).toBe('pending');
      expect(tx.target_process).toBe('notepad.exe');

      // Update transaction status to verified
      db.updateInsertionTransaction(txId, {
        status: 'verified',
        completedAt: new Date().toISOString()
      });

      tx = db.getTransaction(txId);
      expect(tx.status).toBe('verified');
      expect(tx.completed_at).toBeDefined();
    });
  });

  describe('Backup, Restore & Retention Policy', () => {
    it('backs up database to file and restores cleanly', () => {
      db.setSetting('backup_test_key', 'initial_value');
      const backupPath = path.join(os.tmpdir(), `veoflow_backup_${Date.now()}.sqlite`);

      // Create backup
      db.backup(backupPath);
      expect(fs.existsSync(backupPath)).toBe(true);

      // Alter data in active database
      db.setSetting('backup_test_key', 'mutated_value');
      expect(db.getSetting('backup_test_key')).toBe('mutated_value');

      // Restore from backup
      db.restore(backupPath);
      expect(db.getSetting('backup_test_key')).toBe('initial_value');

      fs.unlinkSync(backupPath);
    });

    it('enforces retention policy by removing dictations older than retention cutoff', () => {
      // Set retention to 7 days
      db.setSetting('history_retention_days', '7');

      // Add modern entry (now)
      db.addHistory({ appName: 'recent.exe', rawAsr: 'recent', formattedText: 'Recent.' });

      // Add old entry (15 days ago)
      const oldDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      db.driver.run(
        `INSERT INTO dictations (timestamp, app_name, raw_asr, formatted_text, created_at)
         VALUES (?, ?, ?, ?, ?);`,
        [oldDate, 'old.exe', 'ancient audio', 'Ancient audio.', oldDate]
      );

      expect(db.getHistory().length).toBe(2);

      // Trigger retention enforcement
      db.enforceRetentionPolicy();

      const remaining = db.getHistory();
      expect(remaining.length).toBe(1);
      expect(remaining[0].app_name).toBe('recent.exe');
    });
  });
});

