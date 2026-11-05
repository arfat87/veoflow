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
  SnippetSchema,
  AppRuleSchema
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
        await diffPaster.pasteFull(formattedText, dictationState.currentContext, {
          rawTranscript: rawAsr
        });
      }

      const latencyMs = Date.now() - startTime;
      const ctx = dictationState.currentContext;
      const activeProvider = db.getSetting('stt_provider') || db.getSetting('ai_provider') || 'gemini';
      const fmtProvider = db.getSetting('formatting_provider') || db.getSetting('ai_provider') || 'gemini';
      const dictLang = db.getSetting('dictation_language') || 'auto';

      db.addHistory({
        appName: ctx?.application?.name || ctx?.appName,
        windowTitle: ctx?.window?.title ?? ctx?.windowTitle,
        url: ctx?.window?.url ?? ctx?.url,
        rawAsr,
        formattedText,
        language: dictLang,
        transcriptionProvider: activeProvider,
        formattingProvider: fmtProvider,
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
  ipcMain.handle('get-history', (e, limit, filter) => db.getHistory(limit, filter));
  ipcMain.handle('search-history', (e, payload) => db.searchHistory(payload?.query, payload?.options));
  ipcMain.handle('delete-history-item', (e, id) => db.deleteHistoryItem(Number(id)));
  ipcMain.handle('clear-history', () => {
    db.clearHistory();
    return true;
  });
  ipcMain.handle('export-history', (e, format) => db.exportHistory(format || 'json'));
  ipcMain.handle('retry-history-item', async (e, id) => {
    const item = db.getHistoryById(id);
    if (item && item.formatted_text) {
      await diffPaster.pasteFull(item.formatted_text, dictationState.currentContext, {
        rawTranscript: item.raw_asr
      });
      return true;
    }
    return false;
  });

  // AI Connection Test
  ipcMain.handle('test-ai-connection', async (e, provider) => {
    try {
      if (typeof ai.testConnection === 'function') {
        return await ai.testConnection(provider);
      }
      return { success: false, message: 'testConnection not implemented on AI service', latencyMs: 0 };
    } catch (err) {
      return { success: false, message: err.message, latencyMs: 0 };
    }
  });

  // Dictionary handlers
  ipcMain.handle('get-dictionary', (e, onlyEnabled) => db.getDictionary(onlyEnabled));
  ipcMain.handle('add-dictionary-word', (e, payload) => {
    const parseResult = DictionaryWordSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.warn('Invalid add-dictionary-word payload', parseResult.error.format());
      return false;
    }
    const { trigger, rep } = parseResult.data;
    return db.addDictionaryWord(trigger, rep, payload);
  });
  ipcMain.handle('edit-dictionary-word', (e, payload) => db.editDictionaryWord(Number(payload?.id), payload?.updates));
  ipcMain.handle('delete-dictionary-word', (e, id) => db.deleteDictionaryWord(Number(id)));
  ipcMain.handle('toggle-dictionary-word', (e, payload) => db.toggleDictionaryWord(Number(payload?.id), payload?.isEnabled));
  ipcMain.handle('import-dictionary', (e, entries) => db.importDictionary(entries));
  ipcMain.handle('export-dictionary', () => db.exportDictionary());

  // Snippet handlers
  ipcMain.handle('get-snippets', (e, onlyEnabled) => db.getSnippets(onlyEnabled));
  ipcMain.handle('add-snippet', (e, payload) => {
    const parseResult = SnippetSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.warn('Invalid add-snippet payload', parseResult.error.format());
      return false;
    }
    const { shortcut, text } = parseResult.data;
    return db.addSnippet(shortcut, text, payload?.isEnabled);
  });
  ipcMain.handle('edit-snippet', (e, payload) => db.editSnippet(Number(payload?.id), payload?.updates));
  ipcMain.handle('delete-snippet', (e, id) => db.deleteSnippet(Number(id)));
  ipcMain.handle('toggle-snippet', (e, payload) => db.toggleSnippet(Number(payload?.id), payload?.isEnabled));
  ipcMain.handle('test-snippet', (e, sampleText) => db.testSnippetExpansion(sampleText));

  // Provider Configs handlers
  ipcMain.handle('get-provider-configs', () => db.getProviderConfigs());
  ipcMain.handle('set-provider-config', (e, payload) => db.setProviderConfig(payload?.providerId, payload?.config));

  // Backup & Recovery handlers
  ipcMain.handle('backup-database', (e, targetPath) => db.backup(targetPath));
  ipcMain.handle('restore-database', (e, backupPath) => db.restore(backupPath));

  // Application Rules handlers (Privacy & Permissions)
  ipcMain.handle('get-app-rules', () => db.getAppRules());
  ipcMain.handle('add-app-rule', (e, payload) => {
    const parseResult = AppRuleSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.warn('Invalid add-app-rule payload', parseResult.error.format());
      return false;
    }
    const { processName, category, tone } = parseResult.data;
    return db.addAppRule(processName, category, tone);
  });
  ipcMain.handle('delete-app-rule', (e, id) => db.deleteAppRule(Number(id)));

  // Window actions
  ipcMain.handle('open-settings', () => windowManager.createSettingsWindow());
  ipcMain.handle('open-hud', () => {
    const overlay = windowManager.getOverlayWindow() || windowManager.createOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.showInactive();
      return true;
    }
    return false;
  });
  ipcMain.handle('close-overlay', () => {
    const overlay = windowManager.getOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.hide();
    }
  });
}

