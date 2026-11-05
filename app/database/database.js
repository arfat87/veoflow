import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export class DatabaseManager {
  constructor(customFilePath = null) {
    if (customFilePath) {
      this.filePath = customFilePath;
      this.dataDir = path.dirname(customFilePath);
    } else {
      this.dataDir = path.join(os.homedir(), '.veoflow');
      this.filePath = path.join(this.dataDir, 'veoflow_store.json');
    }

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.data = {
      settings: {},
      history: [],
      dictionary: [],
      snippets: []
    };
    this.load();
    this.initDefaults();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          settings: parsed.settings || {},
          history: parsed.history || [],
          dictionary: parsed.dictionary || [],
          snippets: parsed.snippets || []
        };
      }
    } catch (err) {
      console.warn('[Database] Failed to read store file, starting fresh:', err.message);
    }
  }

  save() {
    try {
      const tempPath = this.filePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('[Database] Failed to save store:', err.message);
    }
  }

  initDefaults() {
    this.setDefaultSetting('ai_provider', 'gemini');
    this.setDefaultSetting('gemini_api_key', process.env.GEMINI_API_KEY || '');
    this.setDefaultSetting('groq_api_key', process.env.GROQ_API_KEY || '');
    this.setDefaultSetting('openai_api_key', process.env.OPENAI_API_KEY || '');
    this.setDefaultSetting('hotkey', 'Ctrl+Alt+Space');
    this.setDefaultSetting('auto_paste', 'true');
    this.setDefaultSetting('tone_preference', 'contextual');
    this.save();
  }

  setDefaultSetting(key, defaultValue) {
    if (this.data.settings[key] === undefined || this.data.settings[key] === null) {
      this.data.settings[key] = defaultValue;
    }
  }

  getSetting(key) {
    return this.data.settings[key] !== undefined ? this.data.settings[key] : null;
  }

  getAllSettings() {
    return { ...this.data.settings };
  }

  setSetting(key, value) {
    this.data.settings[key] = String(value);
    this.save();
  }

  // History operations
  addHistory({ appName, windowTitle, url, rawAsr, formattedText, latencyMs, status }) {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      app_name: appName || '',
      window_title: windowTitle || '',
      url: url || '',
      raw_asr: rawAsr || '',
      formatted_text: formattedText || '',
      latency_ms: latencyMs || 0,
      status: status || 'success'
    };

    this.data.history.unshift(entry);
    if (this.data.history.length > 500) {
      this.data.history = this.data.history.slice(0, 500);
    }
    this.save();
    return entry.id;
  }

  getHistory(limit = 50) {
    return this.data.history.slice(0, limit);
  }

  clearHistory() {
    this.data.history = [];
    this.save();
  }

  // Custom Dictionary
  getDictionary() {
    return [...this.data.dictionary];
  }

  addDictionaryWord(triggerWord, replacement) {
    const trigger = triggerWord.trim();
    const rep = replacement.trim();
    const idx = this.data.dictionary.findIndex(d => d.trigger_word.toLowerCase() === trigger.toLowerCase());
    let id;
    if (idx >= 0) {
      this.data.dictionary[idx].replacement = rep;
      id = this.data.dictionary[idx].id;
    } else {
      id = Date.now() + Math.floor(Math.random() * 1000);
      this.data.dictionary.push({
        id,
        trigger_word: trigger,
        replacement: rep
      });
    }
    this.save();
    return id;
  }

  deleteDictionaryWord(id) {
    this.data.dictionary = this.data.dictionary.filter(d => d.id !== Number(id));
    this.save();
    return true;
  }

  // Snippets
  getSnippets() {
    return [...this.data.snippets];
  }

  addSnippet(shortcut, expandedText) {
    const sc = shortcut.trim();
    const exp = expandedText.trim();
    const idx = this.data.snippets.findIndex(s => s.shortcut.toLowerCase() === sc.toLowerCase());
    let id;
    if (idx >= 0) {
      this.data.snippets[idx].expanded_text = exp;
      id = this.data.snippets[idx].id;
    } else {
      id = Date.now() + Math.floor(Math.random() * 1000);
      this.data.snippets.push({
        id,
        shortcut: sc,
        expanded_text: exp
      });
    }
    this.save();
    return id;
  }

  deleteSnippet(id) {
    this.data.snippets = this.data.snippets.filter(s => s.id !== Number(id));
    this.save();
    return true;
  }
}

export const defaultDatabase = new DatabaseManager();
export default defaultDatabase;

