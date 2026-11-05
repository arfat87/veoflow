/**
 * VeoFlow OpenAI LLM Formatter (ESM)
 * High-quality LLM formatting via OpenAI Chat Completions endpoint.
 */
import { BaseFormatter } from './base-formatter.js';
import { PROVIDERS } from '../../shared/constants.js';
import {
  AuthenticationError,
  RateLimitError,
  ServerError,
  NetworkError,
  TimeoutError,
  EmptyResponseError
} from '../providers/errors.js';

export class OpenAIFormatter extends BaseFormatter {
  constructor(apiKeyGetter, defaultModel = 'gpt-4o-mini') {
    super(PROVIDERS.OPENAI);
    this.apiKeyGetter = typeof apiKeyGetter === 'function' ? apiKeyGetter : () => apiKeyGetter;
    this.defaultModel = defaultModel;
  }

  getApiKey() {
    const key = this.apiKeyGetter();
    return (key || process.env.OPENAI_API_KEY || '').trim();
  }

  async format(rawText, systemPrompt, options = {}) {
    const apiKey = options.apiKey || this.getApiKey();
    if (!apiKey) {
      throw new AuthenticationError('OpenAI API key is not configured.', this.name, 401);
    }

    const model = options.model || this.defaultModel;
    const timeoutMs = options.timeoutMs || 15000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: rawText }
          ],
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxOutputTokens ?? 2048
        }),
        signal: options.signal || controller.signal
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 401 || res.status === 403) {
          throw new AuthenticationError(`OpenAI auth error: ${errText}`, this.name, res.status);
        } else if (res.status === 429) {
          throw new RateLimitError(`OpenAI rate limit: ${errText}`, this.name, res.status);
        } else if (res.status >= 500) {
          throw new ServerError(`OpenAI server error: ${errText}`, this.name, res.status);
        }
        throw new ServerError(`OpenAI error (${res.status}): ${errText}`, this.name, res.status);
      }

      const data = await res.json();
      const text = (data.choices?.[0]?.message?.content || '').trim();

      if (!text) {
        throw new EmptyResponseError('OpenAI returned empty text.', this.name);
      }

      return text;
    } catch (err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new TimeoutError(`OpenAI formatting timed out after ${timeoutMs}ms`, this.name);
      }
      if (err instanceof AuthenticationError ||
          err instanceof RateLimitError ||
          err instanceof ServerError ||
          err instanceof EmptyResponseError) {
        throw err;
      }
      throw new NetworkError(`OpenAI formatting network error: ${err.message}`, this.name, err);
    } finally {
      clearTimeout(timeout);
    }
  }

  async testConnection(apiKey) {
    const key = apiKey || this.getApiKey();
    if (!key) return false;
    try {
      const res = await this.format('PING', 'Respond with PONG', { apiKey: key, timeoutMs: 5000 });
      return !!res;
    } catch {
      return false;
    }
  }
}

export default OpenAIFormatter;

