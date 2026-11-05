import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroqTranscriptionProvider } from '../../app/core/providers/groq-provider.js';
import { OpenAITranscriptionProvider } from '../../app/core/providers/openai-provider.js';
import { GeminiTranscriptionProvider } from '../../app/core/providers/gemini-provider.js';
import { AuthenticationError, TimeoutError, EmptyResponseError } from '../../app/core/providers/errors.js';

describe('Provider Adapters', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GroqTranscriptionProvider', () => {
    it('throws AuthenticationError when API key is missing', async () => {
      const provider = new GroqTranscriptionProvider(() => null);
      await expect(provider.transcribe(Buffer.from('test'))).rejects.toThrow(AuthenticationError);
    });

    it('sends correct multipart form data to Groq endpoint and returns transcript', async () => {
      const provider = new GroqTranscriptionProvider(() => 'gsk_valid_key');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Groq transcribed text', language: 'en', duration: 1.5 })
      });

      const res = await provider.transcribe(Buffer.from('audio_data'), { language: 'en' });

      expect(res.text).toBe('Groq transcribed text');
      expect(res.provider).toBe('groq');
      expect(res.model).toBe('whisper-large-v3-turbo');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        expect.objectEmpty ? expect.anything() : expect.objectContaining({
          method: 'POST',
          headers: { 'Authorization': 'Bearer gsk_valid_key' }
        })
      );
    });

    it('throws EmptyResponseError if returned transcript is empty', async () => {
      const provider = new GroqTranscriptionProvider(() => 'gsk_valid_key');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: '   ' })
      });

      await expect(provider.transcribe(Buffer.from('audio_data'))).rejects.toThrow(EmptyResponseError);
    });
  });

  describe('OpenAITranscriptionProvider', () => {
    it('throws AuthenticationError when API key is missing', async () => {
      const provider = new OpenAITranscriptionProvider(() => null);
      await expect(provider.transcribe(Buffer.from('test'))).rejects.toThrow(AuthenticationError);
    });

    it('sends correct request to OpenAI endpoint and returns transcript', async () => {
      const provider = new OpenAITranscriptionProvider(() => 'sk_valid_key');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'OpenAI transcribed text', language: 'en', duration: 2.0 })
      });

      const res = await provider.transcribe(Buffer.from('audio_data'));

      expect(res.text).toBe('OpenAI transcribed text');
      expect(res.provider).toBe('openai');
      expect(res.model).toBe('whisper-1');
    });
  });

  describe('GeminiTranscriptionProvider', () => {
    it('sends multimodal inlineData payload with zero thinking budget', async () => {
      const provider = new GeminiTranscriptionProvider(() => 'AIza_valid_key');

      let capturedBody = null;
      global.fetch = vi.fn().mockImplementation((url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              { content: { parts: [{ text: 'Gemini transcribed words' }] } }
            ]
          })
        });
      });

      const res = await provider.transcribe(Buffer.from('fake_pcm'), { mimeType: 'audio/wav' });

      expect(res.text).toBe('Gemini transcribed words');
      expect(res.provider).toBe('gemini');
      expect(capturedBody.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
      expect(capturedBody.contents[0].parts[0].inlineData.mimeType).toBe('audio/wav');
    });
  });
});

