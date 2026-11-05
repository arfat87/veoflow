import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../app/database/database.js';

describe('DatabaseManager', () => {
  let testDbPath;
  let db;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `veoflow_test_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
    db = new DatabaseManager(testDbPath);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch {}
  });

  it('initializes default settings', () => {
    const settings = db.getAllSettings();
    expect(settings.hotkey).toBe('Ctrl+Alt+Space');
    expect(settings.ai_provider).toBe('gemini');
    expect(settings.tone_preference).toBe('contextual');
  });

  it('sets and gets settings correctly', () => {
    db.setSetting('custom_key', 'custom_value');
    expect(db.getSetting('custom_key')).toBe('custom_value');
  });

  it('manages dictionary words', () => {
    const wordId = db.addDictionaryWord('asap', 'as soon as possible');
    expect(typeof wordId).toBe('number');

    const dict = db.getDictionary();
    expect(dict.length).toBe(1);
    expect(dict[0].trigger_word).toBe('asap');
    expect(dict[0].replacement).toBe('as soon as possible');

    db.deleteDictionaryWord(wordId);
    expect(db.getDictionary().length).toBe(0);
  });

  it('manages snippets', () => {
    const snippetId = db.addSnippet('addr', '123 Main Street');
    expect(typeof snippetId).toBe('number');

    const snippets = db.getSnippets();
    expect(snippets.length).toBe(1);
    expect(snippets[0].shortcut).toBe('addr');
    expect(snippets[0].expanded_text).toBe('123 Main Street');

    db.deleteSnippet(snippetId);
    expect(db.getSnippets().length).toBe(0);
  });

  it('manages history and clears it', () => {
    db.addHistory({
      appName: 'TestApp',
      windowTitle: 'Test Window',
      rawAsr: 'hello world',
      formattedText: 'Hello world.',
      latencyMs: 120,
      status: 'success'
    });

    const history = db.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].raw_asr).toBe('hello world');

    db.clearHistory();
    expect(db.getHistory().length).toBe(0);
  });
});
