import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// Mock electron
vi.mock('electron', () => {
  const listeners = new Map();
  return {
    app: {
      quit: vi.fn(),
      isReady: () => true,
      whenReady: () => Promise.resolve()
    },
    screen: {
      getPrimaryDisplay: () => ({
        workArea: { x: 0, y: 0, width: 1920, height: 1080 }
      }),
      getAllDisplays: () => [
        { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
        { workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }
      ]
    },
    BrowserWindow: class {
      constructor(opts) {
        this.opts = opts;
        this.destroyed = false;
        this.bounds = { x: opts.x || 0, y: opts.y || 0, width: opts.width || 340, height: opts.height || 56 };
        this.webContents = {
          send: vi.fn(),
          on: vi.fn(),
          setWindowOpenHandler: vi.fn()
        };
      }
      isDestroyed() { return this.destroyed; }
      showInactive() {}
      setAlwaysOnTop() {}
      loadFile() { return Promise.resolve(); }
      once(event, cb) { cb(); }
      on(event, cb) { listeners.set(event, cb); }
      getPosition() { return [this.bounds.x, this.bounds.y]; }
      setPosition(x, y) { this.bounds.x = x; this.bounds.y = y; }
      hide() {}
      focus() {}
      isMinimized() { return false; }
      restore() {}
    },
    Menu: {
      buildFromTemplate: (template) => ({ template })
    },
    Tray: class {
      constructor() {
        this.tooltip = '';
        this.menu = null;
        this.handlers = {};
      }
      setToolTip(tip) { this.tooltip = tip; }
      setContextMenu(m) { this.menu = m; }
      on(evt, cb) { this.handlers[evt] = cb; }
    }
  };
});

import { WindowManager } from '../../app/main/window-manager.js';
import { TrayManager } from '../../app/main/tray-manager.js';
import { DatabaseManager } from '../../app/database/database.js';
import { AIService } from '../../app/core/aiService.js';
import { AppRuleSchema } from '../../app/shared/validation.js';

describe('Phase 08: Desktop UI, Floating HUD & Settings Subsystems', () => {
  let testDbPath;
  let db;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `veoflow_p8_test_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
    db = new DatabaseManager(testDbPath);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch {}
  });

  describe('Task 1: Floating HUD & Window Positioning', () => {
    it('calculates center bottom position on primary display when no coordinates are saved', () => {
      const wm = new WindowManager(db);
      const pos = wm.calculateInitialPosition(360, 72);

      // Primary display: 1920x1080. Expected x: (1920-360)/2 = 780, y: 1080 - 72 - 50 = 958
      expect(pos.x).toBe(780);
      expect(pos.y).toBe(958);
    });

    it('validates and restores saved HUD coordinates when inside multi-monitor workspace', () => {
      db.setSetting('hud_x', '500');
      db.setSetting('hud_y', '600');

      const wm = new WindowManager(db);
      const pos = wm.calculateInitialPosition(360, 72);

      expect(pos.x).toBe(500);
      expect(pos.y).toBe(600);
    });

    it('restores position on secondary monitor if coordinates fall within secondary display', () => {
      // Secondary display is at x: 1920..3840
      db.setSetting('hud_x', '2200');
      db.setSetting('hud_y', '400');

      const wm = new WindowManager(db);
      const pos = wm.calculateInitialPosition(360, 72);

      expect(pos.x).toBe(2200);
      expect(pos.y).toBe(400);
    });

    it('falls back to primary display if saved coordinates are completely offscreen', () => {
      // Coordinates on disconnected monitor (e.g. x: 9999)
      db.setSetting('hud_x', '9999');
      db.setSetting('hud_y', '9999');

      const wm = new WindowManager(db);
      const pos = wm.calculateInitialPosition(360, 72);

      // Recovers to primary display
      expect(pos.x).toBe(780);
      expect(pos.y).toBe(958);
    });

    it('creates HUD with focusable: false to prevent focus stealing from target applications', () => {
      const wm = new WindowManager(db);
      const overlay = wm.createOverlayWindow();

      expect(overlay.opts.focusable).toBe(false);
      expect(overlay.opts.alwaysOnTop).toBe(true);
      expect(overlay.opts.skipTaskbar).toBe(true);
    });
  });

  describe('Task 3: Settings & Database CRUD Operations', () => {
    it('deletes a single history entry by id without clearing the rest', () => {
      const id1 = db.addHistory({
        appName: 'code.exe',
        rawAsr: 'first item',
        formattedText: 'First item.',
        status: 'success'
      });
      const id2 = db.addHistory({
        appName: 'slack.exe',
        rawAsr: 'second item',
        formattedText: 'Second item.',
        status: 'success'
      });

      expect(db.getHistory().length).toBe(2);

      const deleted = db.deleteHistoryItem(id1);
      expect(deleted).toBe(true);

      const remaining = db.getHistory();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(id2);
      expect(remaining[0].app_name).toBe('slack.exe');
    });

    it('initializes privacy default settings correctly', () => {
      const settings = db.getAllSettings();
      expect(settings.privacy_allow_window_title).toBe('true');
      expect(settings.privacy_allow_selected_text).toBe('false');
      expect(settings.privacy_allow_surrounding_text).toBe('false');
      expect(settings.privacy_allow_browser_url).toBe('true');
      expect(settings.allow_fallback).toBe('true');
    });

    it('manages application-specific privacy and tone rules', () => {
      expect(db.getAppRules().length).toBe(0);

      const ruleId = db.addAppRule('slack.exe', 'chat', 'casual');
      expect(typeof ruleId).toBe('number');

      let rules = db.getAppRules();
      expect(rules.length).toBe(1);
      expect(rules[0].process_name).toBe('slack.exe');
      expect(rules[0].category).toBe('chat');
      expect(rules[0].tone).toBe('casual');

      // Update existing process rule
      db.addAppRule('slack.exe', 'chat', 'formal');
      rules = db.getAppRules();
      expect(rules.length).toBe(1);
      expect(rules[0].tone).toBe('formal');

      // Delete rule
      db.deleteAppRule(ruleId);
      expect(db.getAppRules().length).toBe(0);
    });

    it('validates AppRuleSchema correctly', () => {
      const valid = { processName: 'notepad.exe', category: 'document', tone: 'contextual' };
      const res = AppRuleSchema.safeParse(valid);
      expect(res.success).toBe(true);

      const invalid = { processName: '', category: 'document' };
      const resInv = AppRuleSchema.safeParse(invalid);
      expect(resInv.success).toBe(false);
    });
  });

  describe('Task 4: System Tray Integration', () => {
    it('creates system tray with all 5 required actions', () => {
      const handlers = {
        onOpenVeoFlow: vi.fn(),
        onStartDictation: vi.fn(),
        onStopDictation: vi.fn(),
        onOpenSettings: vi.fn(),
        onExit: vi.fn()
      };

      const tm = new TrayManager(handlers);
      const tray = tm.createTray();

      expect(tray).toBeDefined();
      expect(tray.menu).toBeDefined();

      const labels = tray.menu.template
        .filter(item => item.label)
        .map(item => item.label);

      expect(labels).toContain('Open VeoFlow');
      expect(labels).toContain('Start Dictation');
      expect(labels).toContain('Stop Dictation');
      expect(labels).toContain('Settings & Dashboard');
      expect(labels).toContain('Exit VeoFlow');

      // Trigger click handlers
      const openVeoFlowItem = tray.menu.template.find(i => i.label === 'Open VeoFlow');
      openVeoFlowItem.click();
      expect(handlers.onOpenVeoFlow).toHaveBeenCalledTimes(1);

      const startDictItem = tray.menu.template.find(i => i.label === 'Start Dictation');
      startDictItem.click();
      expect(handlers.onStartDictation).toHaveBeenCalledTimes(1);

      const stopDictItem = tray.menu.template.find(i => i.label === 'Stop Dictation');
      stopDictItem.click();
      expect(handlers.onStopDictation).toHaveBeenCalledTimes(1);

      const settingsItem = tray.menu.template.find(i => i.label === 'Settings & Dashboard');
      settingsItem.click();
      expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1);

      const exitItem = tray.menu.template.find(i => i.label === 'Exit VeoFlow');
      exitItem.click();
      expect(handlers.onExit).toHaveBeenCalledTimes(1);
    });
  });

  describe('AI Connection Testing', () => {
    it('dispatches testConnection to registered provider', async () => {
      const ai = new AIService(db);
      const mockTest = vi.fn().mockResolvedValue({ success: true, message: 'Connected', latencyMs: 85 });
      ai.transcriptionEngine.getProvider = vi.fn().mockReturnValue({ testConnection: mockTest });

      const res = await ai.testConnection('gemini');
      expect(res.success).toBe(true);
      expect(res.message).toBe('Connected');
      expect(res.latencyMs).toBe(85);
      expect(mockTest).toHaveBeenCalledTimes(1);
    });

    it('returns error when testing unknown provider', async () => {
      const ai = new AIService(db);
      ai.transcriptionEngine.getProvider = vi.fn().mockReturnValue(null);

      const res = await ai.testConnection('unknown_service');
      expect(res.success).toBe(false);
      expect(res.message).toContain('Unknown provider');
    });
  });
});
