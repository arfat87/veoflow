const { contextBridge, ipcRenderer } = require('electron');

/**
 * VeoFlow Secure ContextBridge API
 * Strictly whitelisted channels with no direct Node.js or OS access
 */
contextBridge.exposeInMainWorld('veoflow', {
  // State transitions from Main Process
  onStateChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (event, data) => callback(data);
    ipcRenderer.on('state-change', handler);
    return () => ipcRenderer.removeListener('state-change', handler);
  },

  // Recording actions
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  submitAudio: (audioData, mimeType) => {
    return ipcRenderer.invoke('submit-audio', { audioData, mimeType });
  },

  // Settings & DB queries
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSetting: (key, value) => ipcRenderer.invoke('save-setting', { key, value }),
  getHistory: (limit, filter) => ipcRenderer.invoke('get-history', limit, filter),
  searchHistory: (query, options) => ipcRenderer.invoke('search-history', { query, options }),
  deleteHistoryItem: (id) => ipcRenderer.invoke('delete-history-item', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  exportHistory: (format) => ipcRenderer.invoke('export-history', format),
  retryHistoryItem: (id) => ipcRenderer.invoke('retry-history-item', id),

  // AI Connection Test & Provider Configs
  testAiConnection: (provider) => ipcRenderer.invoke('test-ai-connection', provider),
  getProviderConfigs: () => ipcRenderer.invoke('get-provider-configs'),
  setProviderConfig: (providerId, config) => ipcRenderer.invoke('set-provider-config', { providerId, config }),

  // Secure Credential Management (Zero Secrets Exposed to Renderer)
  getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status'),
  saveApiKey: (provider, apiKey) => ipcRenderer.invoke('save-api-key', { provider, apiKey }),
  clearApiKey: (provider) => ipcRenderer.invoke('clear-api-key', provider),

  // Custom Vocabulary & Snippets
  getDictionary: (onlyEnabled) => ipcRenderer.invoke('get-dictionary', onlyEnabled),
  addDictionaryWord: (trigger, rep, options) => ipcRenderer.invoke('add-dictionary-word', { trigger, rep, ...options }),
  editDictionaryWord: (id, updates) => ipcRenderer.invoke('edit-dictionary-word', { id, updates }),
  deleteDictionaryWord: (id) => ipcRenderer.invoke('delete-dictionary-word', id),
  toggleDictionaryWord: (id, isEnabled) => ipcRenderer.invoke('toggle-dictionary-word', { id, isEnabled }),
  importDictionary: (entries) => ipcRenderer.invoke('import-dictionary', entries),
  exportDictionary: () => ipcRenderer.invoke('export-dictionary'),

  getSnippets: (onlyEnabled) => ipcRenderer.invoke('get-snippets', onlyEnabled),
  addSnippet: (shortcut, text, isEnabled) => ipcRenderer.invoke('add-snippet', { shortcut, text, isEnabled }),
  editSnippet: (id, updates) => ipcRenderer.invoke('edit-snippet', { id, updates }),
  deleteSnippet: (id) => ipcRenderer.invoke('delete-snippet', id),
  toggleSnippet: (id, isEnabled) => ipcRenderer.invoke('toggle-snippet', { id, isEnabled }),
  testSnippet: (sampleText) => ipcRenderer.invoke('test-snippet', sampleText),

  // Backup & Restore
  backupDatabase: (targetPath) => ipcRenderer.invoke('backup-database', targetPath),
  restoreDatabase: (backupPath) => ipcRenderer.invoke('restore-database', backupPath),

  // Application Rules (Privacy & Permissions)
  getAppRules: () => ipcRenderer.invoke('get-app-rules'),
  addAppRule: (processName, category, tone) => ipcRenderer.invoke('add-app-rule', { processName, category, tone }),
  deleteAppRule: (id) => ipcRenderer.invoke('delete-app-rule', id),

  // Window management
  openSettings: () => ipcRenderer.invoke('open-settings'),
  openHud: () => ipcRenderer.invoke('open-hud'),
  closeOverlay: () => ipcRenderer.invoke('close-overlay')
});

