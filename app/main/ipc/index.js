/**
 * VeoFlow IPC Controller (ESM)
 * Registers securely validated IPC handlers connecting the renderer with main services.
 * Strictly verifies sender frames, restricts payloads, and guarantees zero plaintext secret exposure.
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

/**
 * Validates that an incoming IPC invocation originates from an authorized local frame.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} channel
 */
export function validateIpcSender(event, channel = 'IPC') {
  if (!event || !event.senderFrame) {
    if (process.env.NODE_ENV === 'test') return true;
    logger.warn(`[Security] Blocked IPC invocation on '${channel}': Missing senderFrame`);
    throw new Error('Unauthorized IPC sender: frame context unavailable');
  }

  const url = event.senderFrame.url || '';
  if (!url.startsWith('file://')) {
    logger.warn(`[Security] Blocked IPC invocation on '${channel}': Forbidden protocol '${url}'`);
    throw new Error('Unauthorized IPC sender: forbidden protocol');
  }

  const isAuthorized =
    url.includes('/renderer/hud/overlay.html') ||
    url.includes('/renderer/settings/settings.html') ||
    url.includes('/dist/renderer/hud/overlay.html') ||
    url.includes('/dist/renderer/settings/settings.html');

  if (!isAuthorized) {
    logger.warn(`[Security] Blocked IPC invocation on '${channel}': Unauthorized page '${url}'`);
    throw new Error('Unauthorized IPC sender: unknown frame');
  }

  return true;
}

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

  function secureHandle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      validateIpcSender(event, channel);
      return await handler(event, ...args);
    });
  }

  // 1. Recording Actions
  secureHandle('start-recording', async () => {
    await dictationState.startDictation();
    return true;
  });

  secureHandle('stop-recording', async () => {
    await dictationState.stopDictation();
    return true;
  });

  secureHandle('submit-audio', async (event, payload) => {
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

  // 2. Settings & Credential Handlers (Zero Secret Exposure to Renderer)
  secureHandle('get-settings', () => db.getAllSettings(false));
  secureHandle('save-setting', (e, payload) => {
    const parseResult = SettingPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.warn('Invalid save-setting payload', parseResult.error.format());
      return false;
    }
    const { key, value } = parseResult.data;

    // Security check: intercept direct api_key save attempts and route to encrypted DPAPI storage
    if (key.endsWith('_api_key')) {
      const provider = key.replace('_api_key', '');
      return db.saveApiKey(provider, value);
    }

    db.setSetting(key, value);
    if (key === 'hotkey') {
      hotkeyManager.registerShortcuts();
      hotkeyManager.syncWithHelper();
    }
    return true;
  });

  // Dedicated Encrypted Credential Handlers
  secureHandle('get-api-key-status', () => db.getApiKeyStatus());
  secureHandle('save-api-key', (e, payload) => {
    if (!payload || !payload.provider || typeof payload.apiKey !== 'string') return false;
    const provider = String(payload.provider).toLowerCase();
    if (provider !== 'gemini' && provider !== 'groq' && provider !== 'openai') return false;
    return db.saveApiKey(provider, payload.apiKey);
  });
  secureHandle('clear-api-key', (e, provider) => {
    if (!provider) return false;
    return db.clearApiKey(String(provider).toLowerCase());
  });

  // 3. History Handlers
  secureHandle('get-history', (e, limit, filter) => db.getHistory(limit, filter));
  secureHandle('search-history', (e, payload) => db.searchHistory(payload?.query, payload?.options));
  secureHandle('delete-history-item', (e, id) => db.deleteHistoryItem(Number(id)));
  secureHandle('clear-history', () => {
    db.clearHistory();
    return true;
  });
  secureHandle('export-history', (e, format) => db.exportHistory(format || 'json'));
  secureHandle('retry-history-item', async (e, id) => {
    const item = db.getHistoryById(id);
    if (item && item.formatted_text) {
      await diffPaster.pasteFull(item.formatted_text, dictationState.currentContext, {
        rawTranscript: item.raw_asr
      });
      return true;
    }
    return false;
  });

  // 4. AI Connection Test
  secureHandle('test-ai-connection', async (e, provider) => {
    try {
      if (typeof ai.testConnection === 'function') {
        return await ai.testConnection(provider);
      }
      return { success: false, message: 'testConnection not implemented on AI service', latencyMs: 0 };
    } catch (err) {
      return { success: false, message: err.message, latencyMs: 0 };
    }
  });

  // 5. Dictionary Handlers
  secureHandle('get-dictionary', (e, onlyEnabled) => db.getDictionary(onlyEnabled));
  secureHandle('add-dictionary-word', (e, payload) => {
    const parseResult = DictionaryWordSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.warn('Invalid add-dictionary-word payload', parseResult.error.format());
      return false;
    }
    const { trigger, rep } = parseResult.data;
    return db.addDictionaryWord(trigger, rep, payload);
  });
  secureHandle('edit-dictionary-word', (e, payload) => db.editDictionaryWord(Number(payload?.id), payload?.updates));
  secureHandle('delete-dictionary-word', (e, id) => db.deleteDictionaryWord(Number(id)));
  secureHandle('toggle-dictionary-word', (e, payload) => db.toggleDictionaryWord(Number(payload?.id), payload?.isEnabled));
  secureHandle('import-dictionary', (e, entries) => db.importDictionary(entries));
  secureHandle('export-dictionary', () => db.exportDictionary());

  // 6. Snippet Handlers
  secureHandle('get-snippets', (e, onlyEnabled) => db.getSnippets(onlyEnabled));
  secureHandle('add-snippet', (e, payload) => {
    const parseResult = SnippetSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.warn('Invalid add-snippet payload', parseResult.error.format());
      return false;
    }
    const { shortcut, text } = parseResult.data;
    return db.addSnippet(shortcut, text, payload?.isEnabled);
  });
  secureHandle('edit-snippet', (e, payload) => db.editSnippet(Number(payload?.id), payload?.updates));
  secureHandle('delete-snippet', (e, id) => db.deleteSnippet(Number(id)));
  secureHandle('toggle-snippet', (e, payload) => db.toggleSnippet(Number(payload?.id), payload?.isEnabled));
  secureHandle('test-snippet', (e, sampleText) => db.testSnippetExpansion(sampleText));

  // 7. Provider Configs Handlers
  secureHandle('get-provider-configs', () => db.getProviderConfigs());
  secureHandle('set-provider-config', (e, payload) => db.setProviderConfig(payload?.providerId, payload?.config));

  // 8. Backup & Recovery Handlers
  secureHandle('backup-database', (e, targetPath) => db.backup(targetPath));
  secureHandle('restore-database', (e, backupPath) => db.restore(backupPath));

  // 9. Application Rules Handlers (Privacy & Permissions)
  secureHandle('get-app-rules', () => db.getAppRules());
  secureHandle('add-app-rule', (e, payload) => {
    const parseResult = AppRuleSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.warn('Invalid add-app-rule payload', parseResult.error.format());
      return false;
    }
    const { processName, category, tone } = parseResult.data;
    return db.addAppRule(processName, category, tone);
  });
  secureHandle('delete-app-rule', (e, id) => db.deleteAppRule(Number(id)));

  // 10. Window Actions
  secureHandle('open-settings', () => windowManager.createSettingsWindow());
  secureHandle('open-hud', () => {
    const overlay = windowManager.getOverlayWindow() || windowManager.createOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.showInactive();
      return true;
    }
    return false;
  });
  secureHandle('close-overlay', () => {
    const overlay = windowManager.getOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.hide();
    }
  });
}
