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
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // Custom Vocabulary & Snippets
  getDictionary: () => ipcRenderer.invoke('get-dictionary'),
  addDictionaryWord: (trigger, rep) => ipcRenderer.invoke('add-dictionary-word', { trigger, rep }),
  deleteDictionaryWord: (id) => ipcRenderer.invoke('delete-dictionary-word', id),
  getSnippets: () => ipcRenderer.invoke('get-snippets'),
  addSnippet: (shortcut, text) => ipcRenderer.invoke('add-snippet', { shortcut, text }),
  deleteSnippet: (id) => ipcRenderer.invoke('delete-snippet', id),

  // Window management
  openSettings: () => ipcRenderer.invoke('open-settings'),
  closeOverlay: () => ipcRenderer.invoke('close-overlay')
});

