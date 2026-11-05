import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranscriptionEngine } from '../../app/core/transcription/transcription-engine.js';
import { GroqTranscriptionProvider } from '../../app/core/providers/groq-provider.js';
import { OpenAITranscriptionProvider } from '../../app/core/providers/openai-provider.js';
import { GeminiTranscriptionProvider } from '../../app/core/providers/gemini-provider.js';
import {
  AuthenticationError,
  RateLimitError,
  ServerError,
  TimeoutError
} from '../../app/core/providers/errors.js';

describe('TranscriptionEngine', () => {
  let mockDb;
  let engine;

  beforeEach(() => {
    const settings = {
      ai_provider: 'groq',
      groq_api_key: 'gsk_test_groq_key',
      openai_api_key: 'sk_test_openai_key',
      gemini_api_key: 'AIzaSy_test_gemini_key',
      allow_fallback: 'true'
    };

    mockDb = {
      getSetting: vi.fn((key) => settings[key] || null)
    };

    engine = new TranscriptionEngine(mockDb);
  });

  it('initializes all 3 provider adapters with getter functions', () => {
    expect(engine.getProvider('groq')).toBeInstanceOf(GroqTranscriptionProvider);
    expect(engine.getProvider('openai')).toBeInstanceOf(OpenAITranscriptionProvider);
    expect(engine.getProvider('gemini')).toBeInstanceOf(GeminiTranscriptionProvider);
  });

  it('resolves fallback chain prioritizing configured primary provider', () => {
    const { chain, configuredPrimary } = engine.resolveProviderChain();
    expect(configuredPrimary).toBe('groq');
    expect(chain.length).toBe(3);
    expect(chain[0].name).toBe('groq');
  });

  it('throws AuthenticationError when no API keys are configured', async () => {
    const emptyDb = { getSetting: vi.fn(() => null) };
    const emptyEngine = new TranscriptionEngine(emptyDb);

    await expect(emptyEngine.transcribe(Buffer.from('fake_audio'))).rejects.toThrow(AuthenticationError);
  });

  it('successfully transcribes speech and preserves raw transcript metadata', async () => {
    const groqProvider = engine.getProvider('groq');
    vi.spyOn(groqProvider, 'transcribe').mockResolvedValue({
      text: 'Hello world, testing speech transcription.',
      language: 'en',
      duration: 2.5,
      latencyMs: 180,
      provider: 'groq',
      model: 'whisper-large-v3-turbo'
    });

    const result = await engine.transcribe(Buffer.from('fake_audio'));

    expect(result.rawText).toBe('Hello world, testing speech transcription.');
    expect(result.provider).toBe('groq');
    expect(result.latencyMs).toBe(180);
    expect(result.language).toBe('en');
  });

  it('supports multilingual transcription for Hindi and Bengali', async () => {
    const groqProvider = engine.getProvider('groq');
    vi.spyOn(groqProvider, 'transcribe').mockImplementation(async (buf, opts) => {
      if (opts.language === 'hi') {
        return { text: 'नमस्ते, आप कैसे हैं?', language: 'hi', duration: 1.8, latencyMs: 210, provider: 'groq', model: 'whisper-large-v3-turbo' };
      }
      if (opts.language === 'bn') {
        return { text: 'হ্যালো, কেমন আছেন?', language: 'bn', duration: 1.9, latencyMs: 220, provider: 'groq', model: 'whisper-large-v3-turbo' };
      }
      return { text: 'Hello', language: 'en', duration: 1.0, latencyMs: 150, provider: 'groq', model: 'whisper-large-v3-turbo' };
    });

    const hindiResult = await engine.transcribe(Buffer.from('fake_audio'), { language: 'hi' });
    expect(hindiResult.rawText).toBe('नमस्ते, आप कैसे हैं?');
    expect(hindiResult.language).toBe('hi');

    const bengaliResult = await engine.transcribe(Buffer.from('fake_audio'), { language: 'bn' });
    expect(bengaliResult.rawText).toBe('হ্যালো, কেমন আছেন?');
    expect(bengaliResult.language).toBe('bn');
  });

  it('executes fallback when primary provider returns ServerError', async () => {
    const groqProvider = engine.getProvider('groq');
    const openaiProvider = engine.getProvider('openai');

    vi.spyOn(groqProvider, 'transcribe').mockRejectedValue(new ServerError('Groq 503 Overloaded', 'groq', 503));
    vi.spyOn(openaiProvider, 'transcribe').mockResolvedValue({
      text: 'Fallback transcript from OpenAI.',
      language: 'en',
      duration: 2.1,
      latencyMs: 340,
      provider: 'openai',
      model: 'whisper-1'
    });

    const result = await engine.transcribe(Buffer.from('fake_audio'));

    expect(result.provider).toBe('openai');
    expect(result.rawText).toBe('Fallback transcript from OpenAI.');
  });

  it('does NOT fall back if user disabled fallback in settings', async () => {
    mockDb.getSetting = vi.fn((key) => {
      if (key === 'allow_fallback') return 'false';
      if (key === 'groq_api_key') return 'key';
      if (key === 'openai_api_key') return 'key';
      return null;
    });

    const groqProvider = engine.getProvider('groq');
    vi.spyOn(groqProvider, 'transcribe').mockRejectedValue(new AuthenticationError('Invalid key', 'groq'));

    await expect(engine.transcribe(Buffer.from('fake_audio'))).rejects.toThrow(AuthenticationError);
  });
});

