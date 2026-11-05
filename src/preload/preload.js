const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('veoflow', {
  // Event listeners
  onStateChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('state-change', handler);
    return () => ipcRenderer.removeListener('state-change', handler);
  },

  onHotkeyTriggered: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('hotkey-triggered', handler);
    return () => ipcRenderer.removeListener('hotkey-triggered', handler);
  },

  onLiveTranscript: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('live-transcript', handler);
    return () => ipcRenderer.removeListener('live-transcript', handler);
  },

  // Actions from Renderer
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  submitAudio: (audioData, mimeType) => ipcRenderer.invoke('submit-audio', { audioData, mimeType }),

  // Settings & DB
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSetting: (key, value) => ipcRenderer.invoke('save-setting', { key, value }),
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // Dictionary & Snippets
  getDictionary: () => ipcRenderer.invoke('get-dictionary'),
  addDictionaryWord: (trigger, rep) => ipcRenderer.invoke('add-dictionary-word', { trigger, rep }),
  deleteDictionaryWord: (id) => ipcRenderer.invoke('delete-dictionary-word', id),
  getSnippets: () => ipcRenderer.invoke('get-snippets'),
  addSnippet: (shortcut, text) => ipcRenderer.invoke('add-snippet', { shortcut, text }),
  deleteSnippet: (id) => ipcRenderer.invoke('delete-snippet', id),

  // Window Controls
  openSettings: () => ipcRenderer.invoke('open-settings'),
  closeOverlay: () => ipcRenderer.invoke('close-overlay')
});
