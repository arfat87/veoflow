/**
 * VeoFlow Gemini LLM Formatter (ESM)
 * Formats transcribed text using Google Gemini with context and zero thinking budget.
 */
import { BaseFormatter } from './base-formatter.js';
import { DEFAULT_MODELS, PROVIDERS } from '../../shared/constants.js';
import {
  AuthenticationError,
  RateLimitError,
  ServerError,
  NetworkError,
  TimeoutError,
  EmptyResponseError
} from '../providers/errors.js';

export class GeminiFormatter extends BaseFormatter {
  constructor(apiKeyGetter, defaultModel = DEFAULT_MODELS.GEMINI_LLM) {
    super(PROVIDERS.GEMINI);
    this.apiKeyGetter = typeof apiKeyGetter === 'function' ? apiKeyGetter : () => apiKeyGetter;
    this.defaultModel = defaultModel || 'gemini-2.5-flash';
  }

  getApiKey() {
    const key = this.apiKeyGetter();
    return (key || process.env.GEMINI_API_KEY || '').trim();
  }

  async format(rawText, systemPrompt, options = {}) {
    const apiKey = options.apiKey || this.getApiKey();
    if (!apiKey) {
      throw new AuthenticationError('Gemini API key is not configured.', this.name, 401);
    }

    const model = options.model || this.defaultModel;
    const timeoutMs = options.timeoutMs || 15000;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: rawText }]
        }
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxOutputTokens ?? 2048,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options.signal || controller.signal
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 401 || res.status === 403) {
          throw new AuthenticationError(`Gemini auth error: ${errText}`, this.name, res.status);
        } else if (res.status === 429) {
          throw new RateLimitError(`Gemini rate limit: ${errText}`, this.name, res.status);
        } else if (res.status >= 500) {
          throw new ServerError(`Gemini server error: ${errText}`, this.name, res.status);
        }
        throw new ServerError(`Gemini error (${res.status}): ${errText}`, this.name, res.status);
      }

      const json = await res.json();
      const parts = json.candidates?.[0]?.content?.parts || [];
      const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();

      if (!text) {
        throw new EmptyResponseError('Gemini returned an empty formatting response.', this.name);
      }

      return text;
    } catch (err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new TimeoutError(`Gemini formatting timed out after ${timeoutMs}ms`, this.name);
      }
      if (err instanceof AuthenticationError ||
          err instanceof RateLimitError ||
          err instanceof ServerError ||
          err instanceof EmptyResponseError) {
        throw err;
      }
      throw new NetworkError(`Gemini formatting network error: ${err.message}`, this.name, err);
    } finally {
      clearTimeout(timeout);
    }
  }

  async testConnection(apiKey) {
    const key = apiKey || this.getApiKey();
    if (!key) return false;
    try {
      const prompt = 'Output "PONG"';
      const res = await this.format('PING', prompt, { apiKey: key, timeoutMs: 5000 });
      return !!res;
    } catch {
      return false;
    }
  }
}

export default GeminiFormatter;

