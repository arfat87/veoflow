/**
 * VeoFlow Gemini Audio Transcription Provider (ESM)
 * Uses official Gemini 2.5 Flash multimodal endpoint with zero-thinking latency.
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

export class GeminiTranscriptionProvider extends AIProvider {
  constructor(apiKeyGetter, defaultModel = DEFAULT_MODELS.GEMINI_STT) {
    super(PROVIDERS.GEMINI);
    this.apiKeyGetter = typeof apiKeyGetter === 'function' ? apiKeyGetter : () => apiKeyGetter;
    this.defaultModel = defaultModel;
  }

  getApiKey() {
    const key = this.apiKeyGetter();
    return (key || process.env.GEMINI_API_KEY || '').trim();
  }

  getModels() {
    return ['gemini-2.5-flash', 'gemini-2.0-flash-exp'];
  }

  async transcribe(audioBuffer, options = {}) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new AuthenticationError('Gemini API Key is not configured', this.name, 401);
    }

    const model = options.model || this.defaultModel;
    const mimeType = (options.mimeType || 'audio/webm').split(';')[0];
    const timeoutMs = options.timeoutMs || 15000;
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    let instruction = 'Transcribe this spoken audio exactly as spoken. Output ONLY the transcription text with appropriate punctuation and capitalization. Do not output preamble, markdown formatting, or explanations.';
    if (options.language) {
      instruction = `Transcribe this spoken audio (language code: ${options.language}) accurately as spoken. Output ONLY the transcription text with appropriate punctuation.`;
    }

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio
              }
            },
            {
              text: instruction
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const status = response.status;
        const errText = await response.text();

        if (status === 400 && errText.includes('API_KEY_INVALID')) {
          throw new AuthenticationError(`Invalid Gemini API Key: ${errText}`, this.name, 401);
        }
        if (status === 401 || status === 403) {
          throw new AuthenticationError(`Gemini auth failure: ${errText}`, this.name, status);
        }
        if (status === 429) {
          throw new RateLimitError(`Gemini quota limit reached: ${errText}`, this.name, status);
        }
        if (status >= 500) {
          throw new ServerError(`Gemini server error (${status}): ${errText}`, this.name, status);
        }
        throw new ServerError(`Gemini request failed (${status}): ${errText}`, this.name, status);
      }

      const json = await response.json();
      const parts = json.candidates?.[0]?.content?.parts || [];
      const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();

      if (!text) {
        throw new EmptyResponseError('Gemini returned empty transcription', this.name);
      }

      const latencyMs = Date.now() - startTime;
      return {
        text,
        language: options.language || 'auto',
        duration: 0,
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
        throw new TimeoutError(`Gemini transcription timed out after ${timeoutMs}ms`, this.name);
      }
      if (err instanceof AuthenticationError || err instanceof RateLimitError ||
          err instanceof ServerError || err instanceof EmptyResponseError) {
        throw err;
      }
      throw new NetworkError(`Gemini network error: ${err.message}`, this.name);
    }
  }

  async testConnection() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, message: 'API key is missing', latencyMs: 0 };
    }

    const start = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const res = await fetch(url);
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: 'Connected to Gemini successfully', latencyMs };
      }
      return { success: false, message: `Gemini returned status ${res.status}`, latencyMs };
    } catch (err) {
      return { success: false, message: err.message, latencyMs: Date.now() - start };
    }
  }
}

export default GeminiTranscriptionProvider;

