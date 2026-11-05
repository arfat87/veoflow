import { describe, it, expect } from 'vitest';
import { PIPELINE_STATES, HOTKEY_MODES, DEFAULT_CONFIG, IPC_CHANNELS } from '../../app/shared/constants.js';

describe('Shared Constants', () => {
  it('should define all expected pipeline states', () => {
    expect(PIPELINE_STATES.IDLE).toBe('idle');
    expect(PIPELINE_STATES.PREPARING).toBe('preparing');
    expect(PIPELINE_STATES.RECORDING).toBe('recording');
    expect(PIPELINE_STATES.STOPPING).toBe('stopping');
    expect(PIPELINE_STATES.TRANSCRIBING).toBe('transcribing');
    expect(PIPELINE_STATES.FORMATTING).toBe('formatting');
    expect(PIPELINE_STATES.INSERTING).toBe('inserting');
    expect(PIPELINE_STATES.COMPLETED).toBe('completed');
    expect(PIPELINE_STATES.ERROR).toBe('error');
  });

  it('should define hotkey modes', () => {
    expect(HOTKEY_MODES.PUSH_TO_TALK).toBe('push_to_talk');
    expect(HOTKEY_MODES.TOGGLE_TO_TALK).toBe('toggle_to_talk');
  });

  it('should provide default configurations', () => {
    expect(DEFAULT_CONFIG.HOTKEY).toBe('Ctrl+Alt+Space');
    expect(DEFAULT_CONFIG.HOTKEY_FALLBACK).toBe('Ctrl+Shift+Space');
    expect(DEFAULT_CONFIG.AI_PROVIDER).toBe('groq');
    expect(DEFAULT_CONFIG.TONE_PREFERENCE).toBe('contextual');
    expect(DEFAULT_CONFIG.AUTO_PASTE).toBe(true);
    expect(DEFAULT_CONFIG.MIN_AUDIO_BYTES).toBe(500);
  });

  it('should specify whitelisted IPC channels', () => {
    expect(IPC_CHANNELS.START_RECORDING).toBe('start-recording');
    expect(IPC_CHANNELS.SUBMIT_AUDIO).toBe('submit-audio');
    expect(IPC_CHANNELS.STATE_CHANGE).toBe('state-change');
  });
});
