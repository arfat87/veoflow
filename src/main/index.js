const { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, session } = require('electron');
const path = require('node:path');
const helper = require('./helperClient');
const ai = require('./aiService');
const db = require('./database');
const diffPaster = require('./diffPaster');

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[VeoFlow] Another instance is already running. Exiting.');
  app.quit();
  process.exit(0);
}

let overlayWindow = null;
let settingsWindow = null;
let tray = null;
let currentContext = null;
let recordingStartTime = 0;
let isRecording = false;
let isProcessingAudio = false;

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: workX, y: workY, width, height } = primaryDisplay.workArea;

  const winWidth = 360;
  const winHeight = 72;
  const x = Math.round(workX + (width - winWidth) / 2);
  const y = Math.round(workY + height - winHeight - 50);

  overlayWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false, // Prevents stealing keyboard/window focus from target apps!
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'status');
  overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay.html'));

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.showInactive(); // Show without taking focus!
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 860,
    height: 680,
    minWidth: 700,
    minHeight: 500,
    title: 'VeoFlow Settings & History',
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'VeoFlow Active', enabled: false },
    { type: 'separator' },
    {
      label: 'Start / Stop Dictation',
      click: () => toggleDictation()
    },
    {
      label: 'Settings & History',
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: 'Quit VeoFlow',
      click: () => app.quit()
    }
  ]);

  tray.setToolTip('VeoFlow - Intelligent Voice Typing');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => createSettingsWindow());
}

async function startDictation() {
  if (isRecording || isProcessingAudio) return;
  isRecording = true;
  recordingStartTime = Date.now();

  console.log('[VeoFlow] Starting dictation...');

  // 1. Immediately signal overlay to start recording audio (zero latency, no lost speech)
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('state-change', {
      state: 'recording',
      context: { appName: 'Active Window', windowTitle: '' }
    });
  }

  // 2. Fetch context in parallel
  try {
    currentContext = await helper.getContext();
    console.log('[VeoFlow] Captured Active App Context:', currentContext.appName, currentContext.windowTitle);
    if (overlayWindow && !overlayWindow.isDestroyed() && isRecording) {
      overlayWindow.webContents.send('state-change', {
        state: 'recording',
        context: currentContext
      });
    }
  } catch (err) {
    console.warn('[VeoFlow] Failed to fetch window context:', err);
    currentContext = { appName: 'Unknown', windowTitle: '', url: '', textbox: {} };
  }
}

async function stopDictation() {
  if (!isRecording) return;
  isRecording = false;

  console.log('[VeoFlow] Stopping dictation, requesting audio from renderer...');

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('state-change', { state: 'processing' });
  }
}

function toggleDictation() {
  if (isRecording) {
    stopDictation();
  } else {
    startDictation();
  }
}

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();
  const configured = db.getSetting('hotkey') || 'Ctrl+Alt+Space';
  const electronKey = configured.replace(/Ctrl/i, 'CommandOrControl');

  try {
    const ok = globalShortcut.register(electronKey, () => {
      console.log(`[VeoFlow] Global shortcut pressed: ${electronKey}`);
      toggleDictation();
    });
    console.log(`[VeoFlow] Global shortcut '${electronKey}' registered: ${ok ? 'SUCCESS' : 'FAILED'}`);
  } catch (e) {
    console.warn(`[VeoFlow] Failed to register global shortcut '${electronKey}':`, e.message);
  }

  // Secondary fallback: Ctrl+Shift+Space (in case Ctrl+Alt+Space is blocked)
  try {
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
      console.log('[VeoFlow] Fallback shortcut pressed: Ctrl+Shift+Space');
      toggleDictation();
    });
  } catch {}
}

function syncHotkeyWithHelper() {
  const configured = db.getSetting('hotkey') || 'Ctrl+Alt+Space';
  const parts = configured.split('+').map(p => p.trim());
  const keyPart = parts.pop();
  const mods = parts.join(',');
  helper.setHotkey(mods, keyPart);
}

// App Initialization
app.whenReady().then(async () => {
  // 1. Auto-approve media/microphone permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      return callback(true);
    }
    callback(true);
  });

  createOverlayWindow();
  createTray();
  registerGlobalShortcuts();

  // Handle second instance attempt: focus existing windows
  app.on('second-instance', () => {
    if (settingsWindow) {
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.focus();
    } else {
      createSettingsWindow();
    }
  });

  // Start native helper
  helper.start();
  syncHotkeyWithHelper();

  // Safeguard against unhandled helper errors
  helper.on('error', (err) => {
    console.error('[VeoFlow] HelperClient process error:', err.message);
  });

  helper.on('ready', () => {
    syncHotkeyWithHelper();
  });

  helper.on('hotkey-down', async () => {
    console.log('[VeoFlow] Helper Hotkey Down');
    await startDictation();
  });

  helper.on('hotkey-up', async () => {
    console.log('[VeoFlow] Helper Hotkey Up');
    await stopDictation();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  helper.stop();
});

// IPC Communication Handlers
ipcMain.handle('start-recording', async () => {
  await startDictation();
  return true;
});

ipcMain.handle('stop-recording', async () => {
  await stopDictation();
  return true;
});

// Handle audio submitted from renderer after recording finishes
ipcMain.handle('submit-audio', async (event, { audioData, mimeType }) => {
  const startTime = Date.now();

  if (!audioData || audioData.length < 500) {
    console.log('[VeoFlow] Audio too short or empty, ignoring.');
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('state-change', { state: 'idle', message: 'Audio too short' });
    }
    return { success: false, message: 'Audio too short' };
  }

  isProcessingAudio = true;
  console.log(`[VeoFlow] Received audio payload: ${audioData.length} bytes`);

  let rawAsr = '';
  let formattedText = '';
  let status = 'success';

  try {
    // 1. Transcribe speech
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('state-change', { state: 'transcribing' });
    }

    const audioBuffer = Buffer.from(audioData);
    rawAsr = await ai.transcribeAudio(audioBuffer, mimeType);
    console.log('[VeoFlow] Raw Speech-To-Text:', rawAsr);

    if (!rawAsr || !rawAsr.trim()) {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('state-change', { state: 'idle', message: 'No speech detected' });
      }
      isProcessingAudio = false;
      return { success: false, message: 'No speech detected' };
    }

    // 2. Format with context via LLM
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('state-change', { state: 'formatting', preview: rawAsr });
    }

    formattedText = await ai.formatTranscription(rawAsr, currentContext);
    console.log('[VeoFlow] Formatted Output:', formattedText);

    // 3. Inject into target application
    const autoPaste = db.getSetting('auto_paste') !== 'false';
    if (autoPaste) {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('state-change', { state: 'pasting', preview: formattedText });
      }
      await diffPaster.pasteFull(formattedText);
    }

    // 4. Save to History
    const latencyMs = Date.now() - startTime;
    db.addHistory({
      appName: currentContext?.appName,
      windowTitle: currentContext?.windowTitle,
      url: currentContext?.url,
      rawAsr,
      formattedText,
      latencyMs,
      status: 'success'
    });

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('state-change', { state: 'success', text: formattedText });
      setTimeout(() => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('state-change', { state: 'idle' });
        }
      }, 1800);
    }

    isProcessingAudio = false;
    return { success: true, text: formattedText };

  } catch (err) {
    console.error('[VeoFlow] Transcription pipeline error:', err);
    status = 'error';

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('state-change', { state: 'error', message: err.message });
      setTimeout(() => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('state-change', { state: 'idle' });
        }
      }, 3000);
    }

    db.addHistory({
      appName: currentContext?.appName,
      windowTitle: currentContext?.windowTitle,
      url: currentContext?.url,
      rawAsr: rawAsr || '',
      formattedText: err.message,
      latencyMs: Date.now() - startTime,
      status: 'error'
    });

    isProcessingAudio = false;
    return { success: false, error: err.message };
  }
});

// Settings & DB IPC
ipcMain.handle('get-settings', () => db.getAllSettings());
ipcMain.handle('save-setting', (e, { key, value }) => {
  db.setSetting(key, value);
  if (key === 'hotkey') {
    registerGlobalShortcuts();
    syncHotkeyWithHelper();
  }
  return true;
});

ipcMain.handle('get-history', () => db.getHistory());
ipcMain.handle('clear-history', () => {
  db.clearHistory();
  return true;
});

ipcMain.handle('get-dictionary', () => db.getDictionary());
ipcMain.handle('add-dictionary-word', (e, { trigger, rep }) => db.addDictionaryWord(trigger, rep));
ipcMain.handle('delete-dictionary-word', (e, id) => db.deleteDictionaryWord(id));

ipcMain.handle('get-snippets', () => db.getSnippets());
ipcMain.handle('add-snippet', (e, { shortcut, text }) => db.addSnippet(shortcut, text));
ipcMain.handle('delete-snippet', (e, id) => db.deleteSnippet(id));

ipcMain.handle('open-settings', () => createSettingsWindow());
ipcMain.handle('close-overlay', () => {
  if (overlayWindow) overlayWindow.hide();
});
