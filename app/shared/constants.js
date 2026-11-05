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
  ALLOW_FALLBACK: true,
  MAX_RECORDING_DURATION_MS: 300000, // 5 minutes
  MIN_AUDIO_BYTES: 500,
  CLIPBOARD_CONSUMPTION_WAIT_MS: 250,
  STT_TIMEOUT_MS: 15000,
  CONTEXT_WINDOW_TITLE: true,
  CONTEXT_SELECTED_TEXT: false,
  CONTEXT_TEXTBOX_CONTENT: false,
  CONTEXT_BROWSER_URL: false
});

export const APP_CATEGORIES = Object.freeze({
  CODE_EDITOR: 'code_editor',
  CHAT: 'chat',
  EMAIL: 'email',
  DOCUMENT: 'document',
  BROWSER_FORM: 'browser_form',
  TERMINAL: 'terminal',
  UNKNOWN: 'unknown'
});

export const PROVIDERS = Object.freeze({
  GROQ: 'groq',
  OPENAI: 'openai',
  GEMINI: 'gemini'
});

export const DEFAULT_MODELS = Object.freeze({
  GROQ_STT: 'whisper-large-v3-turbo',
  OPENAI_STT: 'whisper-1',
  GEMINI_STT: 'gemini-2.5-flash',
  GROQ_LLM: 'qwen/qwen3.8-27b',
  OPENAI_LLM: 'gpt-4o-mini',
  GEMINI_LLM: 'gemini-2.5-flash'
});

export const ERROR_CODES = Object.freeze({
  INVALID_API_KEY: 'INVALID_API_KEY',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVER_ERROR: 'SERVER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  EMPTY_RESPONSE: 'EMPTY_RESPONSE',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED'
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

