/**
 * VeoFlow IPC Controller (ESM)
 * Registers validated IPC handlers connecting the renderer with main services.
 */
import { ipcMain } from 'electron';
import logger from '../../shared/logger.js';
import defaultAudioManager from '../../core/audio/audio-manager.js';
import {
  AudioPayloadSchema,
  SettingPayloadSchema,
  DictionaryWordSchema,
  SnippetSchema
} from '../../shared/validation.js';

export function registerIpcHandlers({
  windowManager,
  hotkeyManager,
  database,
  helperClient,
  aiService,
  diffPaster,
  dictationState
}) {
  const db = database;
  const helper = helperClient;
  const ai = aiService;

  ipcMain.handle('start-recording', async () => {
    await dictationState.startDictation();
    return true;
  });

  ipcMain.handle('stop-recording', async () => {
    await dictationState.stopDictation();
    return true;
  });

  ipcMain.handle('submit-audio', async (event, payload) => {
    const startTime = Date.now();
    const overlay = windowManager.getOverlayWindow();

    const parseResult = AudioPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.warn('Invalid submit-audio payload', parseResult.error.format());
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('state-change', { state: 'idle', message: 'Invalid audio payload' });
      }
      return { success: false, message: 'Invalid payload' };
    }

    const { audioData, mimeType } = parseResult.data;

    if (!audioData || audioData.length < 500) {
      logger.info('Audio too short or empty, ignoring.');
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('state-change', { state: 'idle', message: 'Audio too short' });
      }
      return { success: false, message: 'Audio too short' };
    }

    dictationState.isProcessingAudio = true;
    logger.info(`Received audio payload: ${audioData.length} bytes`);

    let rawAsr = '';
    let formattedText = '';

    try {
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('state-change', { state: 'transcribing' });
      }

      const audioBuffer = Buffer.from(audioData);
      const ext = (mimeType && mimeType.includes('wav')) ? 'wav' : 'webm';
      const savedAudioPath = defaultAudioManager.saveRecording(audioBuffer, ext);
      logger.info(`Recording preserved at: ${savedAudioPath}`);

      rawAsr = await ai.transcribeAudio(audioBuffer, mimeType);
      logger.info(`Raw Speech-To-Text result: ${rawAsr}`);

      if (!rawAsr || !rawAsr.trim()) {
        if (overlay && !overlay.isDestroyed()) {
          overlay.webContents.send('state-change', { state: 'idle', message: 'No speech detected' });
        }
        dictationState.isProcessingAudio = false;
        return { success: false, message: 'No speech detected' };
      }

      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('state-change', { state: 'formatting', preview: rawAsr });
      }

      formattedText = await ai.formatTranscription(rawAsr, dictationState.currentContext);
      logger.info(`Formatted Output: ${formattedText}`);

      const autoPaste = db.getSetting('auto_paste') !== 'false';
      if (autoPaste) {
        if (overlay && !overlay.isDestroyed()) {
          overlay.webContents.send('state-change', { state: 'pasting', preview: formattedText });
        }
        await diffPaster.pasteFull(formattedText);
      }

      const latencyMs = Date.now() - startTime;
      const ctx = dictationState.currentContext;
      db.addHistory({
        appName: ctx?.application?.name || ctx?.appName,
        windowTitle: ctx?.window?.title ?? ctx?.windowTitle,
        url: ctx?.window?.url ?? ctx?.url,
        rawAsr,
        formattedText,
        latencyMs,
        status: 'success'
      });

      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('state-change', { state: 'success', text: formattedText });
        setTimeout(() => {
          if (overlay && !overlay.isDestroyed()) {
            overlay.webContents.send('state-change', { state: 'idle' });
          }
        }, 1800);
      }

      dictationState.isProcessingAudio = false;
      return { success: true, text: formattedText };

    } catch (err) {
      logger.error('Transcription pipeline error:', err);

      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('state-change', { state: 'error', message: err.message });
        setTimeout(() => {
          if (overlay && !overlay.isDestroyed()) {
            overlay.webContents.send('state-change', { state: 'idle' });
          }
        }, 3000);
      }

      const ctx = dictationState.currentContext;
      db.addHistory({
        appName: ctx?.application?.name || ctx?.appName,
        windowTitle: ctx?.window?.title ?? ctx?.windowTitle,
        url: ctx?.window?.url ?? ctx?.url,
        rawAsr: rawAsr || '',
        formattedText: err.message,
        latencyMs: Date.now() - startTime,
        status: 'error'
      });

      dictationState.isProcessingAudio = false;
      return { success: false, error: err.message };
    }
  });

  // Settings handlers
  ipcMain.handle('get-settings', () => db.getAllSettings());
  ipcMain.handle('save-setting', (e, payload) => {
    const parseResult = SettingPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.warn('Invalid save-setting payload', parseResult.error.format());
      return false;
    }
    const { key, value } = parseResult.data;
    db.setSetting(key, value);
    if (key === 'hotkey') {
      hotkeyManager.registerShortcuts();
      hotkeyManager.syncWithHelper();
    }
    return true;
  });

  // History handlers
  ipcMain.handle('get-history', () => db.getHistory());
  ipcMain.handle('clear-history', () => {
    db.clearHistory();
    return true;
  });

  // Dictionary handlers
  ipcMain.handle('get-dictionary', () => db.getDictionary());
  ipcMain.handle('add-dictionary-word', (e, payload) => {
    const parseResult = DictionaryWordSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.warn('Invalid add-dictionary-word payload', parseResult.error.format());
      return false;
    }
    const { trigger, rep } = parseResult.data;
    return db.addDictionaryWord(trigger, rep);
  });
  ipcMain.handle('delete-dictionary-word', (e, id) => db.deleteDictionaryWord(Number(id)));

  // Snippet handlers
  ipcMain.handle('get-snippets', () => db.getSnippets());
  ipcMain.handle('add-snippet', (e, payload) => {
    const parseResult = SnippetSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.warn('Invalid add-snippet payload', parseResult.error.format());
      return false;
    }
    const { shortcut, text } = parseResult.data;
    return db.addSnippet(shortcut, text);
  });
  ipcMain.handle('delete-snippet', (e, id) => db.deleteSnippet(Number(id)));

  // Window actions
  ipcMain.handle('open-settings', () => windowManager.createSettingsWindow());
  ipcMain.handle('close-overlay', () => {
    const overlay = windowManager.getOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.hide();
    }
  });
}

