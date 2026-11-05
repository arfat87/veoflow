/**
 * VeoFlow Desktop Application Bootstrap (ESM)
 * Master Electron Main Process entry point.
 */
import { app, BrowserWindow } from 'electron';
import { WindowManager } from './window-manager.js';
import { LifecycleManager } from './lifecycle.js';
import { TrayManager } from './tray-manager.js';
import { HotkeyManager } from './hotkey-manager.js';
import { registerIpcHandlers } from './ipc/index.js';
import helper from '../core/helperClient.js';
import ai from '../core/aiService.js';
import db from '../database/database.js';
import diffPaster from '../core/diffPaster.js';
import contextEngine from '../core/context/context-engine.js';
import logger from '../shared/logger.js';

logger.info('Initializing VeoFlow Main Process...');

const windowManager = new WindowManager();
const lifecycleManager = new LifecycleManager(windowManager);

// 1. Enforce single-instance lock early
lifecycleManager.ensureSingleInstance();

// Dictation state machine holder
const dictationState = {
  isRecording: false,
  isProcessingAudio: false,
  currentContext: null,
  recordingStartTime: 0,

  async startDictation() {
    if (this.isRecording || this.isProcessingAudio) return;
    this.isRecording = true;
    this.recordingStartTime = Date.now();

    logger.info('Starting dictation...');
    const overlay = windowManager.getOverlayWindow();

    // 1. Immediately signal overlay to record audio (zero latency)
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('state-change', {
        state: 'recording',
        context: { appName: 'Active Window', windowTitle: '' }
      });
    }

    // 2. Fetch context in parallel and process via ContextEngine
    try {
      const rawContext = await helper.getContext();
      this.currentContext = contextEngine.processContext(this.sessionId, rawContext);
      logger.info(`Captured Context: ${this.currentContext.application.name} [${this.currentContext.application.category}] - ${this.currentContext.window.title}`);
      if (overlay && !overlay.isDestroyed() && this.isRecording) {
        overlay.webContents.send('state-change', {
          state: 'recording',
          context: {
            appName: this.currentContext.application.displayName,
            windowTitle: this.currentContext.window.title
          }
        });
      }
    } catch (err) {
      logger.warn('Failed to fetch window context:', err.message);
      this.currentContext = contextEngine.processContext(this.sessionId, {});
    }
  },

  async stopDictation() {
    if (!this.isRecording) return;
    this.isRecording = false;

    logger.info('Stopping dictation, awaiting audio payload from HUD...');
    const overlay = windowManager.getOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('state-change', { state: 'processing' });
    }
  },

  cancelDictation() {
    if (!this.isRecording && !this.isProcessingAudio) return;
    this.isRecording = false;
    this.isProcessingAudio = false;
    logger.info('Dictation canceled.');
    const overlay = windowManager.getOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('state-change', { state: 'idle', message: 'Canceled' });
    }
  },

  toggleDictation() {
    if (this.isRecording) {
      this.stopDictation();
    } else {
      this.startDictation();
    }
  }
};

const trayManager = new TrayManager({
  onOpenVeoFlow: () => {
    const overlay = windowManager.getOverlayWindow() || windowManager.createOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.showInactive();
    }
  },
  onStartDictation: () => dictationState.startDictation(),
  onStopDictation: () => dictationState.stopDictation(),
  onOpenSettings: () => windowManager.createSettingsWindow(),
  onExit: () => app.quit()
});

const hotkeyManager = new HotkeyManager(
  db,
  helper,
  () => dictationState.toggleDictation()
);

// Register IPC endpoints
registerIpcHandlers({
  windowManager,
  hotkeyManager,
  database: db,
  helperClient: helper,
  aiService: ai,
  diffPaster,
  dictationState
});

// Application Lifecycle
app.whenReady().then(async () => {
  logger.info('Electron ready event fired');

  lifecycleManager.configureSecurityPolicies();
  windowManager.createOverlayWindow();
  trayManager.createTray();
  hotkeyManager.registerShortcuts();

  // Start Windows native helper process
  helper.start();
  hotkeyManager.syncWithHelper();

  helper.on('ready', () => {
    logger.info('Windows native helper is ready');
    hotkeyManager.syncWithHelper();
  });

  helper.on('error', (err) => {
    logger.error('Windows native helper process error:', err.message);
  });

  helper.on('hotkey-down', async () => {
    logger.info('Helper notified: Hotkey Down');
    await dictationState.startDictation();
  });

  helper.on('hotkey-up', async () => {
    logger.info('Helper notified: Hotkey Up');
    await dictationState.stopDictation();
  });

  helper.on('hotkey-cancel', () => {
    logger.info('Helper notified: Hotkey Canceled via Escape');
    dictationState.cancelDictation();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createOverlayWindow();
    }
  });

  if (process.env.VEOFLOW_TEST_EXIT === '1') {
    logger.info('VEOFLOW_TEST_EXIT detected, terminating cleanly for smoke test.');
    setTimeout(() => {
      hotkeyManager.unregisterAll();
      trayManager.destroy();
      helper.stop();
      app.exit(0);
    }, 1000);
  }
});

app.on('window-all-closed', () => {
  // On Windows, keep running in tray
  logger.info('All windows closed, running in system tray');
});

app.on('will-quit', () => {
  logger.info('VeoFlow shutting down...');
  hotkeyManager.unregisterAll();
  trayManager.destroy();
  helper.stop();
});

export { windowManager, dictationState };
