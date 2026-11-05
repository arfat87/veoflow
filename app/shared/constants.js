/**
 * VeoFlow Shared Constants
 */

export const PIPELINE_STATES = Object.freeze({
  IDLE: 'idle',
  PREPARING: 'preparing',
  RECORDING: 'recording',
  STOPPING: 'stopping',
  TRANSCRIBING: 'transcribing',
  FORMATTING: 'formatting',
  INSERTING: 'inserting',
  COMPLETED: 'completed',
  ERROR: 'error'
});

export const HOTKEY_MODES = Object.freeze({
  PUSH_TO_TALK: 'push_to_talk',
  TOGGLE_TO_TALK: 'toggle_to_talk'
});

export const DEFAULT_CONFIG = Object.freeze({
  HOTKEY: 'Ctrl+Alt+Space',
  HOTKEY_FALLBACK: 'Ctrl+Shift+Space',
  AI_PROVIDER: 'groq',
  TONE_PREFERENCE: 'contextual',
  AUTO_PASTE: true,
  MAX_RECORDING_DURATION_MS: 300000, // 5 minutes
  MIN_AUDIO_BYTES: 500,
  CLIPBOARD_CONSUMPTION_WAIT_MS: 250
});

export const IPC_CHANNELS = Object.freeze({
  STATE_CHANGE: 'state-change',
  START_RECORDING: 'start-recording',
  STOP_RECORDING: 'stop-recording',
  SUBMIT_AUDIO: 'submit-audio',
  GET_SETTINGS: 'get-settings',
  SAVE_SETTING: 'save-setting',
  GET_HISTORY: 'get-history',
  CLEAR_HISTORY: 'clear-history',
  GET_DICTIONARY: 'get-dictionary',
  ADD_DICTIONARY_WORD: 'add-dictionary-word',
  DELETE_DICTIONARY_WORD: 'delete-dictionary-word',
  GET_SNIPPETS: 'get-snippets',
  ADD_SNIPPET: 'add-snippet',
  DELETE_SNIPPET: 'delete-snippet',
  OPEN_SETTINGS: 'open-settings',
  CLOSE_OVERLAY: 'close-overlay'
});

