import { globalShortcut } from 'electron';
import logger from '../shared/logger.js';
import { DEFAULT_CONFIG } from '../shared/constants.js';

export class HotkeyManager {
  constructor(database, helperClient, onToggleDictation) {
    this.db = database;
    this.helper = helperClient;
    this.onToggleDictation = onToggleDictation;
  }

  registerShortcuts() {
    globalShortcut.unregisterAll();
    const configured = this.db.getSetting('hotkey') || DEFAULT_CONFIG.HOTKEY;
    const electronKey = configured.replace(/Ctrl/i, 'CommandOrControl');

    try {
      const ok = globalShortcut.register(electronKey, () => {
        logger.info(`Global hotkey triggered: ${electronKey}`);
        if (this.onToggleDictation) this.onToggleDictation();
      });
      logger.info(`Primary shortcut '${electronKey}' registered: ${ok ? 'SUCCESS' : 'FAILED'}`);
    } catch (e) {
      logger.warn(`Failed to register primary hotkey '${electronKey}':`, e.message);
    }

    // Secondary fallback shortcut: Ctrl+Shift+Space
    try {
      globalShortcut.register('CommandOrControl+Shift+Space', () => {
        logger.info('Fallback shortcut triggered: Ctrl+Shift+Space');
        if (this.onToggleDictation) this.onToggleDictation();
      });
    } catch {}
  }

  syncWithHelper() {
    if (!this.helper) return;
    const configured = this.db.getSetting('hotkey') || DEFAULT_CONFIG.HOTKEY;
    const parts = configured.split('+').map(p => p.trim());
    const keyPart = parts.pop();
    const mods = parts.join(',');
    this.helper.setHotkey(mods, keyPart);
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
  }
}

