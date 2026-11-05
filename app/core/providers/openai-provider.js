/**
 * VeoFlow OpenAI Whisper Transcription Provider (ESM)
 * Uses official OpenAI whisper-1 endpoint with full language detection.
 */
import { AIProvider } from './base-provider.js';
import { DEFAULT_MODELS, PROVIDERS } from '../../shared/constants.js';
import {
  AuthenticationError,
  RateLimitError,
  ServerError,
  NetworkError,
  TimeoutError,
  EmptyResponseError
} from './errors.js';

export class OpenAITranscriptionProvider extends AIProvider {
  constructor(apiKeyGetter, defaultModel = DEFAULT_MODELS.OPENAI_STT) {
    super(PROVIDERS.OPENAI);
    this.apiKeyGetter = typeof apiKeyGetter === 'function' ? apiKeyGetter : () => apiKeyGetter;
    this.defaultModel = defaultModel;
    this.endpoint = 'https://api.openai.com/v1/audio/transcriptions';
  }

  getApiKey() {
    const key = this.apiKeyGetter();
    return (key || process.env.OPENAI_API_KEY || '').trim();
  }

  getModels() {
    return ['whisper-1'];
  }

  async transcribe(audioBuffer, options = {}) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new AuthenticationError('OpenAI API Key is not configured', this.name, 401);
    }

    const model = options.model || this.defaultModel;
    const mimeType = options.mimeType || 'audio/webm';
    const ext = mimeType.includes('wav') ? 'wav' : 'webm';
    const timeoutMs = options.timeoutMs || 15000;

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, `speech.${ext}`);
    formData.append('model', model);
    formData.append('response_format', 'verbose_json');

    if (options.language) {
      formData.append('language', options.language);
    }

    const startTime = Date.now();
    let attempt = 0;
    const maxRetries = 1;

    while (attempt <= maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      if (options.signal) {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          body: formData,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const status = response.status;
          const errorText = await response.text();

          if (status === 401 || status === 403) {
            throw new AuthenticationError(`Invalid OpenAI API key: ${errorText}`, this.name, status);
          }
          if (status === 429) {
            if (attempt <= maxRetries) {
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }
            throw new RateLimitError(`OpenAI rate limit reached: ${errorText}`, this.name, status);
          }
          if (status >= 500) {
            throw new ServerError(`OpenAI server error (${status}): ${errorText}`, this.name, status);
          }
          throw new ServerError(`OpenAI request failed (${status}): ${errorText}`, this.name, status);
        }

        const data = await response.json();
        const latencyMs = Date.now() - startTime;
        const text = (data.text || '').trim();

        if (!text) {
          throw new EmptyResponseError('OpenAI returned empty transcription', this.name);
        }

        return {
          text,
          language: data.language || options.language || 'en',
          duration: data.duration || 0,
          latencyMs,
          provider: this.name,
          model
        };

      } catch (err) {
        clearTimeout(timeoutId);

        if (err.name === 'AbortError') {
          if (options.signal && options.signal.aborted) {
            throw new Error('Transcription cancelled by user');
          }
          throw new TimeoutError(`OpenAI transcription timed out after ${timeoutMs}ms`, this.name);
        }
        if (err instanceof AuthenticationError || err instanceof RateLimitError ||
            err instanceof ServerError || err instanceof EmptyResponseError) {
          throw err;
        }
        throw new NetworkError(`OpenAI network error: ${err.message}`, this.name);
      }
    }
  }

  async testConnection() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, message: 'API key is missing', latencyMs: 0 };
    }

    const start = Date.now();
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: 'Connected to OpenAI successfully', latencyMs };
      }
      return { success: false, message: `OpenAI returned status ${res.status}`, latencyMs };
    } catch (err) {
      return { success: false, message: err.message, latencyMs: Date.now() - start };
    }
  }
}

export default OpenAITranscriptionProvider;

