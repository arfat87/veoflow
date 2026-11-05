import { describe, it, expect } from 'vitest';
import {
  AudioPayloadSchema,
  SettingPayloadSchema,
  DictionaryWordSchema,
  SnippetSchema
} from '../../app/shared/validation.js';

describe('Validation Schemas', () => {
  describe('AudioPayloadSchema', () => {
    it('validates correct audio payload', () => {
      const valid = {
        audioData: [1, 2, 3, 4],
        mimeType: 'audio/webm'
      };
      const res = AudioPayloadSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('rejects missing audioData', () => {
      const invalid = { mimeType: 'audio/webm' };
      const res = AudioPayloadSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });
  });

  describe('SettingPayloadSchema', () => {
    it('validates key-value setting strings', () => {
      const res = SettingPayloadSchema.safeParse({ key: 'hotkey', value: 'Ctrl+Shift+Space' });
      expect(res.success).toBe(true);
    });

    it('rejects empty key', () => {
      const res = SettingPayloadSchema.safeParse({ key: '', value: 'test' });
      expect(res.success).toBe(false);
    });
  });

  describe('DictionaryWordSchema', () => {
    it('validates trigger and replacement pair', () => {
      const res = DictionaryWordSchema.safeParse({ trigger: 'kubernetes', rep: 'K8s' });
      expect(res.success).toBe(true);
    });

    it('rejects empty trigger', () => {
      const res = DictionaryWordSchema.safeParse({ trigger: '', rep: 'K8s' });
      expect(res.success).toBe(false);
    });
  });

  describe('SnippetSchema', () => {
    it('validates shortcut and text snippet', () => {
      const res = SnippetSchema.safeParse({ shortcut: 'sig', text: 'Best regards,\nUser' });
      expect(res.success).toBe(true);
    });

    it('rejects empty snippet shortcut', () => {
      const res = SnippetSchema.safeParse({ shortcut: '', text: 'Content' });
      expect(res.success).toBe(false);
    });
  });
});

